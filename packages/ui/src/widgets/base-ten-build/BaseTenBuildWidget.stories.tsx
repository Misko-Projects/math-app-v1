import { formatModel } from '@number-island/engine';
import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  type SpyAudio,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `base-ten-build` (03 §5.5): build the goal number from base-ten pieces on a wooden mat, taking
 * pieces from the tray (drag, tap-to-place or keyboard), putting them back, and trading ten for
 * one ("Make a ten") or one for ten ("Split a ten"). Check answers the mat as
 * `{ kind: 'state', value: { thousands, hundreds, tens, ones } }`; read mode answers the typed
 * number. Nothing on screen shows a value, a total or a column count.
 */

type Config = ConfigFor<'base-ten-build'>;

const TENS_ONES = { thousands: false, hundreds: false, tens: true, ones: true };
const HTO = { thousands: false, hundreds: true, tens: true, ones: true };
const ALL = { thousands: true, hundreds: true, tens: true, ones: true };

const build34: Config = {
  format: 'base-ten-build',
  target: 34,
  mode: 'build',
  pieces: TENS_ONES,
  wholeIs: 'unit',
};

const build13: Config = { ...build34, target: 13 };

const meta = {
  title: 'Widgets/Base-ten build',
  args: {
    config: build34 as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-btb';

/**
 * The 1280 × 800 tablet: the story canvas there is 1200 × 720 inside its 40 px padding, so the
 * widget stage is exactly 1200 px wide (wider than the test browser's own stage).
 */
const renderTablet = (args: WidgetHostProps) => (
  <div style={{ width: 1200, maxWidth: 'none' }}>{renderWidget(args)}</div>
);

// ---------- helpers ----------

const pieces = (root: HTMLElement, kind: string) =>
  root.querySelectorAll(`.ni-btb__piece[data-kind="${kind}"]`).length;

async function expectMat(root: HTMLElement, mat: Partial<Record<string, number>>) {
  for (const kind of ['thousands', 'hundreds', 'tens', 'ones']) {
    await waitFor(() => expect(pieces(root, kind), `${kind} on the mat`).toBe(mat[kind] ?? 0));
  }
}

const pile = (root: HTMLElement, kind: string) =>
  root.querySelector(`[data-place-item="tray-${kind}"]`) as HTMLElement;
const board = (root: HTMLElement) => root.querySelector('.ni-btb__board') as HTMLElement;
const trayPad = (root: HTMLElement) => root.querySelector('.ni-btb__traypad') as HTMLElement;
const matPiece = (root: HTMLElement, kind: string, i: number) =>
  root.querySelector(`[data-place-item="mat-${kind}-${i}"]`) as HTMLElement;
const trade = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-trade="${id}"]`) as HTMLButtonElement;

/** Tap-to-place: tap a pile, then the board, `n` times. */
async function tapPlace(root: HTMLElement, kind: string, n: number) {
  for (let i = 0; i < n; i++) {
    await userEvent.click(pile(root, kind));
    await userEvent.click(board(root));
  }
}

const state = (m: Partial<Record<'thousands' | 'hundreds' | 'tens' | 'ones', number>>) => ({
  kind: 'state',
  value: { thousands: 0, hundreds: 0, tens: 0, ones: 0, ...m },
});

/** Nothing in the widget's text or accessible names states a count or the value (03 §5.5). */
async function expectNoValueShown(root: HTMLElement, forbidden: string[]) {
  const words = [
    root.textContent ?? '',
    ...[...root.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? ''),
    ...[...root.querySelectorAll('[title]')].map((el) => el.getAttribute('title') ?? ''),
  ].join(' ');
  for (const f of forbidden) {
    await expect(new RegExp(`(^|[^0-9.])${f.replace('.', '\\.')}([^0-9]|$)`).test(words), f).toBe(
      false,
    );
  }
  for (const el of root.querySelectorAll('*')) {
    for (const a of el.getAttributeNames()) {
      if (!a.startsWith('data-')) continue;
      await expect(forbidden, `${a}="${el.getAttribute(a)}"`).not.toContain(el.getAttribute(a));
    }
  }
}

/**
 * The widget fits its stage with no scrolling: the stage stays within the tablet's 720 px, the
 * widget's scroll size equals its client size, every drawn part lies inside the widget, and every
 * piece lies on the board.
 */
async function expectFits(canvasElement: HTMLElement, root: HTMLElement) {
  const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
  await expect(stage.getBoundingClientRect().height).toBeLessThanOrEqual(720);
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight);
  await expect(root.closest('.story-widget-stage')?.scrollWidth).toBeLessThanOrEqual(
    stage.clientWidth,
  );
  const box = root.getBoundingClientRect();
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    await expect(r.left, `${el.className} left`).toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(r.right, `${el.className} right`).toBeLessThanOrEqual(box.right + 0.5);
    await expect(r.top, `${el.className} top`).toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(r.bottom, `${el.className} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
  }
  const b = board(root).getBoundingClientRect();
  for (const p of root.querySelectorAll<HTMLElement>('.ni-btb__piece')) {
    const r = p.getBoundingClientRect();
    await expect(r.left).toBeGreaterThanOrEqual(b.left);
    await expect(r.right).toBeLessThanOrEqual(b.right);
    await expect(r.top).toBeGreaterThanOrEqual(b.top);
    await expect(r.bottom).toBeLessThanOrEqual(b.bottom);
  }
}

/** Numerals the child reads are ≥ 32 px (05 §11). */
async function expectBigNumerals(els: Element[]) {
  for (const el of els) {
    await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(32);
  }
}

const controls = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>(
    '.ni-btb__goal, .ni-btb__exact, .ni-btb__pile, .ni-btb .ni-btn',
  ),
];

/** Every piece is drawn at the one unit: a unit is `u` px and a rod exactly ten of them. */
async function expectUnit(root: HTMLElement, min: number) {
  const unit = root.querySelector('.ni-btb__col .ni-btb__art--ones')?.getBoundingClientRect();
  const rod = root.querySelector('.ni-btb__col .ni-btb__art--tens')?.getBoundingClientRect();
  if (unit) await expect(unit.width).toBeGreaterThanOrEqual(min);
  if (rod) {
    await expect(rod.width).toBeGreaterThanOrEqual(min);
    await expect(rod.height).toBeCloseTo(rod.width * 10, 0);
  }
  if (unit && rod) await expect(unit.width).toBeCloseTo(rod.width, 1);
}

/** Pieces never overlap: every pair of drawn pieces is apart. */
async function expectNoOverlap(root: HTMLElement) {
  const rects = [...root.querySelectorAll('.ni-btb__art')]
    .filter((el) => el.closest('.ni-btb__col'))
    .map((el) => el.getBoundingClientRect());
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i] as DOMRect;
      const b = rects[j] as DOMRect;
      const apart =
        a.right <= b.left + 0.5 ||
        b.right <= a.left + 0.5 ||
        a.bottom <= b.top + 0.5 ||
        b.bottom <= a.top + 0.5;
      await expect(apart, `pieces ${i} and ${j} overlap`).toBe(true);
    }
  }
}

/** The same check for a crowded mat (hundreds of pieces): one synchronous pass, one assertion. */
async function expectNoOverlapFast(root: HTMLElement) {
  const rects = [...root.querySelectorAll('.ni-btb__col .ni-btb__art')].map((el) =>
    el.getBoundingClientRect(),
  );
  const clashes: string[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i] as DOMRect;
      const b = rects[j] as DOMRect;
      const apart =
        a.right <= b.left + 0.5 ||
        b.right <= a.left + 0.5 ||
        a.bottom <= b.top + 0.5 ||
        b.bottom <= a.top + 0.5;
      if (!apart) clashes.push(`${i}/${j}`);
    }
  }
  await expect(clashes, 'overlapping pieces').toEqual([]);
}

/** Every spoken call (say, sayPhrases, sayText) as text, to search for a number. */
const spoken = (audio: SpyAudio) =>
  JSON.stringify([audio.say.mock.calls, audio.sayPhrases.mock.calls, audio.sayText.mock.calls]);

const btbModel = () => {
  const m = formatModel('base-ten-build');
  if (!m) throw new Error('no base-ten-build model');
  return m;
};

/** Column headers: the place's name in text mode (G1+), the icon alone in K. */
/**
 * Every stock tag ("2 left") belongs visibly to its own pile: its box lies inside the pile's
 * box (or directly under it), never nearer another pile.
 */
async function expectTagsOnPiles(root: HTMLElement) {
  const piles = [...root.querySelectorAll<HTMLElement>('.ni-btb__pile')];
  for (const p of piles) {
    const tag = p.querySelector('.ni-btb__stock');
    if (!tag) continue;
    const t = tag.getBoundingClientRect();
    const b = p.getBoundingClientRect();
    await expect(t.left, 'tag inside its pile (left)').toBeGreaterThanOrEqual(b.left);
    await expect(t.right, 'tag inside its pile (right)').toBeLessThanOrEqual(b.right);
    await expect(t.top, 'tag inside its pile (top)').toBeGreaterThanOrEqual(b.top);
    await expect(t.bottom, 'tag inside or directly under its pile').toBeLessThanOrEqual(
      b.bottom + 4,
    );
    for (const other of piles) {
      if (other === p) continue;
      const o = other.getBoundingClientRect();
      const overlaps = t.left < o.right && t.right > o.left && t.top < o.bottom && t.bottom > o.top;
      await expect(overlaps, 'tag clear of the other piles').toBe(false);
    }
  }
}

async function expectHeaders(root: HTMLElement, words: string[]) {
  const heads = [...root.querySelectorAll('.ni-btb__head')];
  await expect(heads).toHaveLength(words.length);
  for (const [i, h] of heads.entries()) {
    await expect(h.querySelector('.ni-btb__headicon svg')).not.toBeNull();
    await expect(h.textContent?.trim()).toBe(words[i]);
  }
}

// ---------- build ----------

/**
 * G1, target 34 (canonical): tap-to-place three tens and four ones, check. The goal card speaks
 * its number; controls are G1-sized and spaced; nothing shows a count.
 */
export const Build: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const goal = canvas.getByRole('button', { name: 'Make 34' });
    await expect(goal).toHaveTextContent('34');
    await expectBigNumerals([goal]);
    await expect(Number.parseFloat(getComputedStyle(goal).fontSize)).toBeGreaterThanOrEqual(48);
    await userEvent.click(goal);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 34 }]);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    for (const c of controls(root)) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(controls(root));

    await expectHeaders(root, ['Tens', 'Ones']);
    // The trades sit in the gutter between the two columns.
    const gutter = root.querySelector('.ni-btb__gutter') as HTMLElement;
    await expect(gutter.querySelectorAll('[data-trade]')).toHaveLength(2);

    await tapPlace(root, 'tens', 3);
    await tapPlace(root, 'ones', 4);
    await expectMat(root, { tens: 3, ones: 4 });
    await expectUnit(root, 20);
    await expectNoOverlap(root);
    await expectNoValueShown(root, ['3', '4', '7']);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 3, ones: 4 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.slice(0, 3).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:goal',
      'tap:tray-tens',
      'tap:mat',
    ]);
    await expect(trace).toHaveLength(1 + 7 * 2);
    await expectTraceOrdered(trace);
  },
};

/**
 * K mode, target 13: every control is K-sized (≥ 80 px) and icon-only with a spoken label; the
 * trade buttons say their names when pressed.
 */
export const BuildK: Story = {
  globals: { ageMode: 'k' },
  args: { config: build13 },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    for (const c of controls(root)) await expectTargetSize(c, 'k');
    await expectTargetGaps(controls(root));
    // Icon-only: the trade and check buttons carry aria-labels, never visible text.
    const make = canvas.getByRole('button', { name: 'Make a ten' });
    const split = canvas.getByRole('button', { name: 'Split a ten' });
    for (const b of [make, split, canvas.getByRole('button', { name: 'Check' })]) {
      await expect(b.textContent?.trim()).toBe('');
    }
    await expect(root.querySelector('.ni-btb__tradecap')).toBeNull();
    // K headers: the place's icon alone.
    await expectHeaders(root, ['', '']);
    await tapPlace(root, 'tens', 1);
    await tapPlace(root, 'ones', 3);
    await expectMat(root, { tens: 1, ones: 3 });
    // K pieces are drawn bigger than G1's 20 px.
    await expectUnit(root, 24);
    // A trade with nothing to trade is off (hatched), and stays silent.
    await expect(make).toBeDisabled();
    await userEvent.click(split);
    await waitFor(() =>
      expect(audio.say).toHaveBeenCalledWith('ui.widget.btb.split.tens', undefined),
    );
    await expectMat(root, { tens: 0, ones: 13 });
    await waitFor(() => expect(make).toBeEnabled());
    await userEvent.click(make);
    await expectMat(root, { tens: 1, ones: 3 });
    await waitFor(() => expect(split).toBeEnabled());
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 1, ones: 3 }));
  },
};

/**
 * Evidence: a G1 build of 34 in progress: two tens and three ones on the mat, both trades in the
 * gutter, check ready.
 */
export const BuildInProgress: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'tens', 2);
    await tapPlace(root, 'ones', 3);
    await expectMat(root, { tens: 2, ones: 3 });
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeEnabled();
    await expectFits(canvasElement, root);
    // A finger tap leaves no focus ring; the scripted taps' focus is dropped for the final frame.
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/** State equivalence (03 §5.5): 2 tens and 14 ones is a valid 34, and is what check sends. */
export const BuildAlternative: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'tens', 2);
    await tapPlace(root, 'ones', 14);
    await expectMat(root, { tens: 2, ones: 14 });
    // The ones sit in frames of ten (two rows of five).
    await expect(root.querySelectorAll('.ni-btb__frame')).toHaveLength(2);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 2, ones: 14 }));
  },
};

/** Mouse drag: a ten and a one dragged from the tray onto the mat; a mis-drop goes home. */
export const DragFromTray: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(pile(root, 'tens'), center(board(root)), 'mouse');
    await expectMat(root, { tens: 1 });
    await pointerDrag(pile(root, 'ones'), center(board(root)), 'mouse');
    await expectMat(root, { tens: 1, ones: 1 });
    // Dropped back on the tray itself: nothing changes.
    const ones = pile(root, 'ones');
    const r = ones.getBoundingClientRect();
    await pointerDrag(ones, { x: r.left + r.width / 2, y: r.top - 20 }, 'mouse');
    await expectMat(root, { tens: 1, ones: 1 });
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 1, ones: 1 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:tray-tens',
      'drop:mat',
      'drag:tray-ones',
      'drop:mat',
      'drag:tray-ones',
      'drop:none',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Touch drag (a tablet finger): pieces onto the mat, and a mat piece back onto the tray. */
export const TouchDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 3; i++) await pointerDrag(pile(root, 'tens'), center(board(root)), 'touch');
    await pointerDrag(pile(root, 'ones'), center(board(root)), 'touch');
    await expectMat(root, { tens: 3, ones: 1 });
    await pointerDrag(matPiece(root, 'tens', 2), center(trayPad(root)), 'touch');
    await expectMat(root, { tens: 2, ones: 1 });
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 2, ones: 1 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.slice(-2).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:mat-tens-2',
      'drop:tray',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Tap-to-place: tapping a pile picks a piece up (ink ring) and says its name; tapping the mat puts
 * it down. Tapping a piece on the mat says its name too.
 */
export const TapToPlace: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(pile(root, 'tens'));
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btb.piece.tens', undefined);
    await expect(pile(root, 'tens')).toHaveAttribute('aria-pressed', 'true');
    await expect(board(root)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(board(root));
    await expectMat(root, { tens: 1 });
    clearSpies(audio);
    await userEvent.click(matPiece(root, 'tens', 0));
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btb.piece.tens', undefined);
    // Tapping it again puts it down where it is.
    await userEvent.click(matPiece(root, 'tens', 0));
    await expectMat(root, { tens: 1 });
    await tapPlace(root, 'ones', 2);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 1, ones: 2 }));
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:tray-tens',
      'tap:mat',
      'tap:mat-tens-0',
      'tap:mat-tens-0',
      'tap:tray-ones',
      'tap:mat',
      'tap:tray-ones',
      'tap:mat',
    ]);
  },
};

/**
 * Keyboard (06 §7): Enter on a pile picks a piece up and moves focus to the mat; Enter puts it
 * down. Enter on a mat piece moves focus to the tray to put it back.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    pile(root, 'tens').focus();
    await userEvent.keyboard('{Enter}');
    await expect(board(root)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expectMat(root, { tens: 1 });
    pile(root, 'tens').focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard(' ');
    await expectMat(root, { tens: 2 });
    // Right arrow moves between items: the ones pile follows the tens pile.
    pile(root, 'tens').focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(pile(root, 'ones')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await expectMat(root, { tens: 2, ones: 1 });
    // Put a ten back with the keyboard.
    matPiece(root, 'tens', 1).focus();
    await userEvent.keyboard('{Enter}');
    await expect(trayPad(root)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expectMat(root, { tens: 1, ones: 1 });
    const check = within(root).getByRole('button', { name: 'Check' });
    check.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 1, ones: 1 }));
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Putting pieces back: drag a ten onto the tray, and tap-to-place another back. */
export const PutBack: Story = {
  args: {
    config: { ...build34, prebuilt: { hundreds: 0, tens: 4, ones: 4 } } satisfies Config,
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectMat(root, { tens: 4, ones: 4 });
    await pointerDrag(matPiece(root, 'tens', 3), center(trayPad(root)), 'mouse');
    await expectMat(root, { tens: 3, ones: 4 });
    await userEvent.click(matPiece(root, 'ones', 3));
    await expect(trayPad(root)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(trayPad(root));
    await expectMat(root, { tens: 3, ones: 3 });
    await tapPlace(root, 'ones', 1);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 3, ones: 4 }));
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:mat-tens-3',
      'drop:tray',
      'tap:mat-ones-3',
      'tap:tray',
      'tap:tray-ones',
      'tap:mat',
    ]);
  },
};

/**
 * Arithmetic (mda.addsub, pv.tenmore: "Here is 24. Put in 5 more and build the new number"): the
 * start number is prebuilt and the target (29) is the result, so no goal card is drawn and 29 is
 * nowhere: not in the text, an accessible name, a data attribute or anything spoken. The side
 * panel (tray and check) stays centred, and the item still completes.
 */
export const ArithmeticHidesResult: Story = {
  args: {
    config: {
      ...build34,
      target: 29,
      prebuilt: { hundreds: 0, tens: 2, ones: 4 },
    } satisfies Config,
  },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectMat(root, { tens: 2, ones: 4 });
    await expect(root.querySelector('.ni-btb__goal')).toBeNull();
    await expect(root.querySelector('.ni-btb__ask')).toBeNull();
    await expectNoValueShown(root, ['29']);
    // The side panel stays balanced: its contents are centred top to bottom.
    const side = (root.querySelector('.ni-btb__side') as HTMLElement).getBoundingClientRect();
    const tray = (root.querySelector('.ni-btb__tray') as HTMLElement).getBoundingClientRect();
    const check = within(root).getByRole('button', { name: 'Check' });
    const bottom = (root.querySelector('.ni-btb__checkslot') as HTMLElement).getBoundingClientRect()
      .bottom;
    await expect(Math.abs(tray.top - side.top - (side.bottom - bottom))).toBeLessThanOrEqual(2);
    // Tapping pieces says their names, never a number.
    await userEvent.click(matPiece(root, 'tens', 0));
    await userEvent.click(matPiece(root, 'tens', 0));
    await tapPlace(root, 'ones', 5);
    await expectMat(root, { tens: 2, ones: 9 });
    await expectNoValueShown(root, ['29']);
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btb.piece.ones', undefined);
    await expect(/(^|[^0-9])29([^0-9]|$)/.test(spoken(audio)), spoken(audio)).toBe(false);
    await expectFits(canvasElement, root);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 2, ones: 9 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.some((e) => e.target === 'goal')).toBe(false);
    await expectTraceOrdered(trace);
  },
};

// ---------- trades ----------

const fuseConfig: Config = { ...build34, prebuilt: { hundreds: 0, tens: 2, ones: 14 } };
const splitConfig: Config = { ...build34, prebuilt: { hundreds: 0, tens: 3, ones: 4 } };

/**
 * "Make a ten": ten ones slide together into a rod-shaped bundle, become one ten, and the ten
 * moves into the tens column (transform-only, about 900 ms).
 */
export const FuseOnes: Story = {
  args: { config: fuseConfig },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const make = trade(root, 'fuse-ones');
    await expect(make).toHaveAccessibleName('Make a ten');
    const started = performance.now();
    await userEvent.click(make);
    // Mid-animation: the ones move with transform animations and input is off.
    await waitFor(() =>
      expect(
        [...root.querySelectorAll('.ni-btb__piece[data-kind="ones"]')].some(
          (p) => p.getAnimations().length > 0,
        ),
      ).toBe(true),
    );
    await expect(make).toBeDisabled();
    await expectMat(root, { tens: 3, ones: 4 });
    await waitFor(() => expect(within(root).getByRole('button', { name: 'Check' })).toBeEnabled());
    const took = performance.now() - started;
    await expect(took).toBeGreaterThanOrEqual(600);
    await expect(took).toBeLessThan(2000);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 3, ones: 4 }));
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:fuse-ones',
    ]);
  },
};

/** Reduced motion: "Make a ten" trades at once and rings the new ten. */
export const FuseOnesReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: fuseConfig },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(trade(root, 'fuse-ones'));
    await expectMat(root, { tens: 3, ones: 4 });
    await expect(root.querySelector('.ni-btb__piece[data-flash="true"]')).toHaveAttribute(
      'data-kind',
      'tens',
    );
    for (const p of root.querySelectorAll('.ni-btb__piece')) {
      await expect(p.getAnimations()).toHaveLength(0);
    }
  },
};

/** "Split a ten": the ten moves into the ones column and opens into ten ones that spread out. */
export const SplitTen: Story = {
  args: { config: splitConfig },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const split = trade(root, 'split-tens');
    await expect(split).toHaveAccessibleName('Split a ten');
    await userEvent.click(split);
    await waitFor(() =>
      expect(
        [...root.querySelectorAll('.ni-btb__piece[data-kind="tens"]')].some(
          (p) => p.getAnimations().length > 0,
        ),
      ).toBe(true),
    );
    await expectMat(root, { tens: 2, ones: 14 });
    await waitFor(() => expect(split).toBeEnabled());
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 2, ones: 14 }));
  },
};

/** Reduced motion: "Split a ten" trades at once and rings the ten new ones. */
export const SplitTenReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: splitConfig },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(trade(root, 'split-tens'));
    await expectMat(root, { tens: 2, ones: 14 });
    await expect(root.querySelectorAll('.ni-btb__piece[data-flash="true"]')).toHaveLength(10);
  },
};

const onesToTen: Config = {
  format: 'base-ten-build',
  target: 10,
  mode: 'build-exact',
  pieces: { thousands: false, hundreds: false, tens: false, ones: true },
  exact: { tens: 1, ones: 0 },
  wholeIs: 'unit',
  prebuilt: { hundreds: 0, tens: 0, ones: 10 },
};

/**
 * A trade into a kind the tray doesn't offer: build-exact 10 as 1 ten and 0 ones, with ten ones
 * on the mat and only ones on offer. The mat still has a tens column (the target's place, named
 * in `exact`), so "Make a ten" sits in its gutter; the child's fuse answers what the engine does.
 */
export const FuseIntoMissingColumn: Story = {
  args: { config: onesToTen },
  play: async ({ canvasElement, args }) => {
    const model = btbModel();
    await expect(model.configSchema.safeParse(onesToTen).success).toBe(true);
    const root = await findWidget(canvasElement, ROOT);
    await expectHeaders(root, ['Tens', 'Ones']);
    await expect(pile(root, 'tens')).toBeNull();
    const make = trade(root, 'fuse-ones');
    await expect(make).toHaveAccessibleName('Make a ten');
    await expect(make).toBeEnabled();
    await userEvent.click(make);
    await expectMat(root, { tens: 1 });
    const check = within(root).getByRole('button', { name: 'Check' });
    await waitFor(() => expect(check).toBeEnabled());
    await userEvent.click(check);
    // The engine's own solution: fuse the ones.
    const solved = model.apply(model.initialState(onesToTen), {
      op: 'fuse',
      args: { kind: 'ones' },
    });
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(model.toResponse(solved));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 1 }));
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:fuse-ones',
    ]);
  },
};

const tensToOnes: Config = {
  format: 'base-ten-build',
  target: 20,
  mode: 'build-exact',
  pieces: { thousands: false, hundreds: false, tens: true, ones: false },
  exact: { tens: 1 },
  wholeIs: 'unit',
};

/**
 * A split into a kind absent from the tray and the starting mat: build-exact 20 with exactly one
 * ten, only tens on offer. The rest must be ten ones, so the mat has a ones column and "Split a
 * ten" works.
 */
export const SplitIntoMissingColumn: Story = {
  args: { config: tensToOnes },
  play: async ({ canvasElement, args }) => {
    const model = btbModel();
    await expect(model.configSchema.safeParse(tensToOnes).success).toBe(true);
    const root = await findWidget(canvasElement, ROOT);
    await expectHeaders(root, ['Tens', 'Ones']);
    await tapPlace(root, 'tens', 2);
    await expectMat(root, { tens: 2 });
    await userEvent.click(trade(root, 'split-tens'));
    await expectMat(root, { tens: 1, ones: 10 });
    const check = within(root).getByRole('button', { name: 'Check' });
    await waitFor(() => expect(check).toBeEnabled());
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 1, ones: 10 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`).at(-1)).toBe('tap:split-tens');
    await expectTraceOrdered(trace);
  },
};

// ---------- limits, exact, decimals ----------

const limits: Config = {
  format: 'base-ten-build',
  target: 54,
  mode: 'build',
  pieces: TENS_ONES,
  limits: { tens: 2 },
  wholeIs: 'unit',
};

/**
 * Tray limits: the tens pile holds 2. A stock tag under it (a crate icon and "2 left") says so;
 * it is supply, not the answer. Once both are taken the pile is off, dashed and hatched, its tag
 * reads "0 left", and the child must trade.
 */
export const Limits: Story = {
  args: { config: limits },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const tens = pile(root, 'tens');
    await expect(tens).toHaveAccessibleName('Ten, 2 left');
    const tag = tens.querySelector('.ni-btb__stock') as HTMLElement;
    await expect(tag).toHaveTextContent('2 left');
    await expect(tag.querySelector('.ni-btb__stockicon svg')).not.toBeNull();
    await expect(pile(root, 'ones').querySelector('.ni-btb__stock')).toBeNull();
    await expectTagsOnPiles(root);
    await tapPlace(root, 'tens', 2);
    await expectMat(root, { tens: 2 });
    await expect(tens).toHaveAccessibleName('Ten, 0 left');
    await expect(tens).toHaveAttribute('aria-disabled', 'true');
    await expect(tens).toHaveAttribute('data-empty', 'true');
    await expect(getComputedStyle(tens).borderStyle).toBe('dashed');
    // A tap on the empty pile does nothing.
    await userEvent.click(tens);
    await expect(tens).toHaveAttribute('aria-pressed', 'false');
    // Putting a ten back refills the pile; taking it again empties it.
    await pointerDrag(matPiece(root, 'tens', 1), center(trayPad(root)), 'mouse');
    await waitFor(() => expect(tens).toHaveAccessibleName('Ten, 1 left'));
    await tapPlace(root, 'tens', 1);
    await expect(tens).toHaveAccessibleName('Ten, 0 left');
    // Ends mid-build: both tens taken (the pile shows 0), some ones on the way to 54.
    await tapPlace(root, 'ones', 6);
    await expectMat(root, { tens: 2, ones: 6 });
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/** Limits in K: the stock tag draws the rods left instead of words. */
export const LimitsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...limits, limits: { tens: 3 } } satisfies Config },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // K: the tag shows the crate and the rods left, drawn small (no reading needed).
    const tag = pile(root, 'tens').querySelector('.ni-btb__stock') as HTMLElement;
    await expect(tag.querySelectorAll('.ni-btb__stockpiece')).toHaveLength(3);
    await tapPlace(root, 'tens', 1);
    await waitFor(() => expect(tag.querySelectorAll('.ni-btb__stockpiece')).toHaveLength(2));
    await expect(pile(root, 'tens')).toHaveAccessibleName('Ten, 2 left');
    await expectTagsOnPiles(root);
    await tapPlace(root, 'ones', 3);
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/**
 * build-exact: the chip beside the goal asks for exactly 2 tens (2 × a rod picture), and the tray
 * holds just 2 tens: the tens tile's stock tag counts down to "0 left" and the tile goes dim.
 */
export const BuildExact: Story = {
  args: {
    config: {
      ...build34,
      mode: 'build-exact',
      exact: { tens: 2 },
      limits: { tens: 2 },
    } satisfies Config,
  },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const chip = within(root).getByRole('button', { name: 'Take 2 tens' });
    await expectTargetSize(chip, 'g1-up');
    await expectBigNumerals([chip.querySelector('.ni-btb__exactnum') as Element]);
    await expect(chip.querySelector('.ni-btb__art--tens')).not.toBeNull();
    await userEvent.click(chip);
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btb.exact.tens', { n: 2 });
    const tens = pile(root, 'tens');
    await expect(tens.querySelector('.ni-btb__stock')).toHaveTextContent('2 left');
    await expectTagsOnPiles(root);
    await tapPlace(root, 'tens', 2);
    // The limit is reached: "0 left" on a dimmed, dashed, disabled tile.
    await expect(tens.querySelector('.ni-btb__stock')).toHaveTextContent('0 left');
    await expect(tens).toHaveAttribute('aria-disabled', 'true');
    await expect(tens).toHaveAttribute('data-empty', 'true');
    await expect(getComputedStyle(tens).borderStyle).toBe('dashed');
    await tapPlace(root, 'ones', 14);
    await expectTagsOnPiles(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 2, ones: 14 }));
  },
};

const decimal: Config = {
  format: 'base-ten-build',
  target: 125,
  mode: 'build',
  pieces: HTO,
  wholeIs: 'flat',
};

/**
 * Decimals (`wholeIs: 'flat'`) with tray limits: the goal reads 1.25; the columns are Ones,
 * Tenths and Hundredths; the flat is "one whole", the rod "one tenth", the unit "one hundredth",
 * and the trades are named for them. The tray holds 1 whole and 3 tenths: the whole is taken
 * (its pile shows 0) and one tenth is left.
 */
export const Decimal: Story = {
  args: { config: { ...decimal, limits: { hundreds: 1, tens: 3 } } satisfies Config },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const goal = canvas.getByRole('button', { name: 'Make 1.25' });
    await userEvent.click(goal);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 1.25 }]);
    await expectHeaders(root, ['Ones', 'Tenths', 'Hundredths']);
    await expect(pile(root, 'hundreds')).toHaveAccessibleName('One whole, 1 left');
    await expect(pile(root, 'tens')).toHaveAccessibleName('One tenth, 3 left');
    await expect(pile(root, 'ones')).toHaveAccessibleName('One hundredth');
    await expect(trade(root, 'fuse-tens')).toHaveAccessibleName('Make a whole');
    await expect(trade(root, 'split-hundreds')).toHaveAccessibleName('Split a whole');
    await expect(trade(root, 'fuse-ones')).toHaveAccessibleName('Make a tenth');
    await userEvent.click(pile(root, 'tens'));
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btb.dec.piece.tens', undefined);
    await userEvent.click(board(root));
    await tapPlace(root, 'hundreds', 1);
    await tapPlace(root, 'tens', 1);
    await tapPlace(root, 'ones', 5);
    await expectMat(root, { hundreds: 1, tens: 2, ones: 5 });
    await expect(pile(root, 'hundreds')).toHaveAccessibleName('One whole, 0 left');
    await expect(pile(root, 'tens')).toHaveAccessibleName('One tenth, 1 left');
    // Three piles stand balanced (one column or one row): none alone on a row.
    const piles = [...root.querySelectorAll('.ni-btb__pile')].map((p) => p.getBoundingClientRect());
    const sameLeft = new Set(piles.map((r) => Math.round(r.left))).size === 1;
    const sameTop = new Set(piles.map((r) => Math.round(r.top))).size === 1;
    await expect(sameLeft || sameTop).toBe(true);
    await expectTagsOnPiles(root);
    await expectUnit(root, 20);
    await expectFits(canvasElement, root);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ hundreds: 1, tens: 2, ones: 5 }));
  },
};

// ---------- read (pictorial) ----------

const read47: Config = {
  format: 'base-ten-build',
  target: 47,
  mode: 'read',
  pieces: TENS_ONES,
  wholeIs: 'unit',
  prebuilt: { hundreds: 0, tens: 4, ones: 7 },
};

/**
 * Read (pictorial): the pieces are a static picture named "Look at the picture"; no tray, no
 * trades, no count anywhere. The child types the number on the pad and checks.
 */
export const ReadPicture: Story = {
  args: { config: read47, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const picture = canvas.getByRole('img', { name: 'Look at the picture' });
    await expect(picture.querySelectorAll('.ni-btb__piece[data-kind="tens"]')).toHaveLength(4);
    await expect(picture.querySelectorAll('.ni-btb__piece[data-kind="ones"]')).toHaveLength(7);
    await expect(root.querySelector('.ni-btb__tray')).toBeNull();
    await expect(root.querySelector('.ni-btb__trades')).toBeNull();
    await expect(root.querySelector('[data-place-item]')).toBeNull();
    // The picture (and the empty blank) state no count: the pad's digit keys are the only numerals.
    await expectNoValueShown(picture, ['47', '4', '7', '40']);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '4' }));
    await userEvent.click(canvas.getByRole('button', { name: '7' }));
    await expect(canvas.getByRole('button', { name: 'Your answer: 47' })).toBeInTheDocument();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 47 });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:key-4',
      'tap:key-7',
    ]);
    await expectFits(canvasElement, root);
  },
};

/** Read in K: 1 ten and 3 ones, the K-sized pad (icon-only check), answer 13. */
export const ReadK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: { ...read47, target: 13, prebuilt: { hundreds: 0, tens: 1, ones: 3 } } satisfies Config,
    tier: 'pictorial',
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'k');
    await expectTargetGaps(keys);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check.textContent?.trim()).toBe('');
    await userEvent.click(canvas.getByRole('button', { name: '1' }));
    await userEvent.click(canvas.getByRole('button', { name: '3' }));
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 13 });
    await expectFits(canvasElement, root);
  },
};

/**
 * Read with decimals: the typed 1.06 is sent in hundredths (106), like every base-ten value. The
 * pad stops at two digits after the point and never rounds: 1.059 (which would round to 1.06)
 * can't be typed, and neither can 1.061.
 */
export const ReadDecimal: Story = {
  args: {
    config: {
      ...read47,
      target: 106,
      pieces: HTO,
      wholeIs: 'flat',
      prebuilt: { hundreds: 1, tens: 0, ones: 6 },
    } satisfies Config,
    tier: 'pictorial',
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const blank = root.querySelector('.ni-btb__blank') as HTMLElement;
    const press = async (keys: string[]) => {
      for (const k of keys) await userEvent.click(canvas.getByRole('button', { name: k }));
    };
    // A third digit after the point is refused: 1.059 stays 1.05.
    await press(['1', 'Dot', '0', '5', '9']);
    await expect(blank).toHaveTextContent('1.05');
    await expect(blank).toHaveAccessibleName('Your answer: 1.05');
    await press(['Go back one', '6', '1']);
    await expect(blank).toHaveTextContent('1.06');
    await expect(blank).not.toHaveTextContent('1.061');
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 106 });
  },
};

// ---------- stress: the largest configs fit 1280 × 800 ----------

/**
 * 999: nine flats, nine rods and nine units built on the mat (the most a canonical build holds),
 * with the goal card showing 999 (a plain build: the pieces are the child's, not prebuilt).
 */
export const Stress999: Story = {
  args: {
    config: {
      format: 'base-ten-build',
      target: 999,
      mode: 'build',
      pieces: HTO,
      wholeIs: 'unit',
    } satisfies Config,
  },
  render: renderTablet,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'hundreds', 9);
    await tapPlace(root, 'tens', 9);
    await tapPlace(root, 'ones', 9);
    await expectMat(root, { hundreds: 9, tens: 9, ones: 9 });
    await expect(within(root).getByRole('button', { name: 'Make 999' })).toHaveTextContent('999');
    // A finger tap leaves no focus ring; the scripted taps' focus is dropped for the final frame.
    (document.activeElement as HTMLElement | null)?.blur();
    // 19 px units (the closest to 20 that fits padded), true scale, nothing overlapping.
    await expectUnit(root, 19);
    await expectNoOverlap(root);
    await expectHeaders(root, ['Hundreds', 'Tens', 'Ones']);
    // Flats in a 3 × 3 grid; the nine rods side by side in two rows (5 + 4), never end to end
    // in a column of three.
    const tops = (sel: string) =>
      new Set(
        [...root.querySelectorAll(sel)].map((p) => Math.round(p.getBoundingClientRect().top)),
      );
    await expect(tops('.ni-btb__piece--hundreds').size).toBe(3);
    await expect(tops('.ni-btb__piece--tens').size).toBe(2);
    await expect(
      root.querySelectorAll('.ni-btb__col[data-col="tens"] .ni-btb__row')[0]?.children,
    ).toHaveLength(5);
    // Pieces and headers keep clear of the wooden frame.
    const inner = board(root).getBoundingClientRect();
    for (const el of root.querySelectorAll('.ni-btb__piece, .ni-btb__head')) {
      const r = el.getBoundingClientRect();
      await expect(r.left - inner.left).toBeGreaterThanOrEqual(5 + 6);
      await expect(inner.right - r.right).toBeGreaterThanOrEqual(5 + 6);
      await expect(inner.bottom - r.bottom).toBeGreaterThanOrEqual(5 + 6);
    }
    await expectFits(canvasElement, root);
    for (const c of controls(root)) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(controls(root));
    await expectBigNumerals([root.querySelector('.ni-btb__goal') as Element]);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ hundreds: 9, tens: 9, ones: 9 }));
  },
};

/**
 * Ones-heavy: the tray holds only 2 tens for 54, so the child takes both and 34 ones. The ones
 * wrap into frames of ten and everything still fits.
 */
export const StressOnes: Story = {
  args: { config: { ...limits, prebuilt: { hundreds: 0, tens: 0, ones: 34 } } satisfies Config },
  render: renderTablet,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'tens', 2);
    await expectMat(root, { tens: 2, ones: 34 });
    await expectUnit(root, 20);
    await expectNoOverlap(root);
    await expect(root.querySelectorAll('.ni-btb__frame')).toHaveLength(4);
    await expect(pile(root, 'tens')).toHaveAttribute('aria-disabled', 'true');
    await expectFits(canvasElement, root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tens: 2, ones: 34 }));
  },
};

/** build-exact on the tablet: 2 tens and 14 ones for 34, with the exact chip. */
export const StressExact: Story = {
  args: {
    config: {
      ...build34,
      mode: 'build-exact',
      exact: { tens: 2, ones: 14 },
      prebuilt: { hundreds: 0, tens: 2, ones: 14 },
    } satisfies Config,
  },
  render: renderTablet,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-btb__exact')).toHaveLength(2);
    await expectFits(canvasElement, root);
  },
};

/** Decimal flat case on the tablet: 2.47 built as 2 wholes, 4 tenths and 7 hundredths. */
export const StressDecimal: Story = {
  args: { config: { ...decimal, target: 247 } satisfies Config },
  render: renderTablet,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'hundreds', 2);
    await tapPlace(root, 'tens', 4);
    await tapPlace(root, 'ones', 7);
    await expectMat(root, { hundreds: 2, tens: 4, ones: 7 });
    await expect(within(root).getByRole('button', { name: 'Make 2.47' })).toBeInTheDocument();
    await expectFits(canvasElement, root);
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/** The most pieces the engine lets an item start with (MAT_MAX), every column full at once. */
const matMax: Config = {
  format: 'base-ten-build',
  target: 9999,
  mode: 'build',
  pieces: ALL,
  wholeIs: 'unit',
  prebuilt: { thousands: 9, hundreds: 19, tens: 29, ones: 199 },
};

/**
 * The largest mat the engine allows, in K (the tightest: big controls, wide gutters): 9 cubes,
 * 19 flats, 29 rods and 199 units fit the tablet with nothing overlapping or clipped. One more
 * of a kind is past the cap.
 */
export const StressMaxMatK: Story = {
  globals: { ageMode: 'k' },
  args: { config: matMax },
  render: renderTablet,
  play: async ({ canvasElement }) => {
    const schema = btbModel().configSchema;
    await expect(schema.safeParse(matMax).success).toBe(true);
    const over = { ...matMax, prebuilt: { thousands: 9, hundreds: 19, tens: 30, ones: 199 } };
    await expect(schema.safeParse(over).success).toBe(false);
    const root = await findWidget(canvasElement, ROOT);
    await expectMat(root, { thousands: 9, hundreds: 19, tens: 29, ones: 199 });
    await expectNoOverlapFast(root);
    await expectFits(canvasElement, root);
    for (const c of controls(root)) await expectTargetSize(c, 'k');
    await expectTargetGaps(controls(root));
  },
};

/**
 * The mat never overfills: from the largest allowed start (G1), the child may take another cube
 * only while the mat still fits; then the pile turns off (dashed) and taps do nothing. A split
 * that would overfill the mat (a thousand into ten more flats) is off too.
 */
export const MatNeverOverfills: Story = {
  args: { config: matMax },
  render: renderTablet,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectMat(root, { thousands: 9, hundreds: 19, tens: 29, ones: 199 });
    await expect(trade(root, 'split-thousands')).toBeDisabled();
    const cubes = pile(root, 'thousands');
    let taken = 0;
    while (cubes.getAttribute('aria-disabled') !== 'true' && taken < 5) {
      await tapPlace(root, 'thousands', 1);
      taken++;
    }
    await expect(cubes).toHaveAttribute('aria-disabled', 'true');
    await expect(cubes).toHaveAttribute('data-empty', 'true');
    const n = pieces(root, 'thousands');
    await userEvent.click(cubes);
    await userEvent.click(board(root));
    await expectMat(root, { thousands: n, hundreds: 19, tens: 29, ones: 199 });
    await expectNoOverlapFast(root);
    await expectFits(canvasElement, root);
    // Putting a piece back always works.
    await pointerDrag(matPiece(root, 'thousands', n - 1), center(trayPad(root)), 'mouse');
    await expectMat(root, { thousands: n - 1, hundreds: 19, tens: 29, ones: 199 });
    await waitFor(() => expect(cubes).not.toHaveAttribute('aria-disabled', 'true'));
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

/** Thousands enabled, 1234: a cube, flats, rods and units, four columns and every trade. */
export const Thousands: Story = {
  args: {
    config: {
      format: 'base-ten-build',
      target: 1234,
      mode: 'build',
      pieces: ALL,
      wholeIs: 'unit',
      prebuilt: { thousands: 1, hundreds: 2, tens: 3, ones: 4 },
    } satisfies Config,
  },
  render: renderTablet,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectMat(root, { thousands: 1, hundreds: 2, tens: 3, ones: 4 });
    await expectUnit(root, 20);
    await expectNoOverlap(root);
    await expectHeaders(root, ['Thousands', 'Hundreds', 'Tens', 'Ones']);
    // Three gutters, two trades each, all the same size.
    await expect(root.querySelectorAll('.ni-btb__gutter')).toHaveLength(3);
    for (const g of root.querySelectorAll('.ni-btb__gutter')) {
      await expect(g.querySelectorAll('[data-trade]')).toHaveLength(2);
    }
    await expect(root.querySelectorAll('.ni-btb__col')).toHaveLength(4);
    await expect(trade(root, 'split-thousands')).toHaveAccessibleName('Split a thousand');
    await expect(trade(root, 'fuse-hundreds')).toHaveAccessibleName('Make a thousand');
    await expectFits(canvasElement, root);
    for (const c of controls(root)) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(controls(root));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ thousands: 1, hundreds: 2, tens: 3, ones: 4 }),
    );
  },
};

/** K on the tablet: the K-sized tray, goal, trades and check still fit. */
export const StressK: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...fuseConfig, target: 34 } satisfies Config },
  render: renderTablet,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFits(canvasElement, root);
  },
};

// ---------- disabled ----------

/**
 * `disabled`: piles, mat pieces, trades, goal and check are all off; nothing is traced. (A
 * build-exact item, so the goal card shows: a plain `build` that starts with pieces hides it.)
 */
export const Disabled: Story = {
  args: {
    disabled: true,
    config: { ...fuseConfig, mode: 'build-exact', exact: { tens: 3 } } satisfies Config,
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(pile(root, 'tens')).toHaveAttribute('aria-disabled', 'true');
    await expect(matPiece(root, 'tens', 0)).toHaveAttribute('aria-disabled', 'true');
    await expect(trade(root, 'fuse-ones')).toBeDisabled();
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(root.querySelector('.ni-btb__goal')).toBeDisabled();
    await userEvent.click(pile(root, 'tens'));
    await userEvent.click(board(root));
    await pointerDrag(pile(root, 'ones'), center(board(root)), 'mouse');
    await expectMat(root, { tens: 2, ones: 14 });
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

// ---------- demo mode (03 §6.3) ----------

const playController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo: every op. A one flies in from the tray, ten ones fuse into a ten, a ten splits, Pip
 * counts the tens aloud (the only place a count is spoken), a ten goes back, and `answer` applies.
 */
export const DemoPlay: Story = {
  args: {
    disabled: true,
    demo: playController,
    config: { ...build34, prebuilt: { hundreds: 0, tens: 2, ones: 9 } } satisfies Config,
  },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await playController.play({ op: 'add-piece', args: { kind: 'ones' } });
    await expectMat(root, { tens: 2, ones: 10 });
    const started = performance.now();
    await playController.play({ op: 'fuse', args: { kind: 'ones' } });
    await expect(performance.now() - started).toBeGreaterThanOrEqual(600);
    await expectMat(root, { tens: 3, ones: 0 });
    await playController.play({ op: 'split', args: { kind: 'rod' } });
    await expectMat(root, { tens: 2, ones: 10 });
    await playController.play({ op: 'count-by', args: { kind: 'tens' } });
    await expect(audio.sayPhrases).toHaveBeenCalledTimes(2);
    await expect(audio.sayPhrases).toHaveBeenNthCalledWith(1, [{ number: 10 }]);
    await expect(audio.sayPhrases).toHaveBeenNthCalledWith(2, [{ number: 20 }]);
    await playController.play({ op: 'add-piece', args: { kind: 'tens', count: -1 } });
    await expectMat(root, { tens: 1, ones: 10 });
    await playController.play({ op: 'add-piece', args: { kind: 'tens', count: 2 } });
    await expectMat(root, { tens: 3, ones: 10 });
    await playController.play({ op: 'answer', args: { value: 40 } });
    await expectMat(root, { tens: 3, ones: 10 });
    await expect(root.querySelector('[data-counted="true"]')).toBeNull();
  },
};

const readController: WidgetDemo = createDemoController({ strict: true });

/** Demo in read mode: `count-by` lights the tens one by one, then `answer` types 47 on the pad. */
export const DemoReadAnswer: Story = {
  args: { disabled: true, demo: readController, config: read47, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const counting = readController.play({ op: 'count-by', args: { kind: 'tens' } });
    await waitFor(() => expect(root.querySelector('[data-counted="true"]')).not.toBeNull());
    await counting;
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 40 }]);
    await readController.play({ op: 'answer', args: { value: 47 } });
    await expect(root.querySelector('.ni-btb__blank')).toHaveTextContent('47');
  },
};

const unmountController: WidgetDemo = createDemoController({ strict: true });

/** Lets a story unmount the widget mid-play (WidgetHost remounts per item). */
let unmountWidget: (() => void) | null = null;
function Unmountable({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(true);
  unmountWidget = () => setShown(false);
  return shown ? children : null;
}

/**
 * Unmounting during a read demo: the host's awaited `play` of `answer` settles (it doesn't hang
 * on a commit that never comes), and nothing is submitted.
 */
export const DemoReadUnmount: Story = {
  args: { disabled: true, demo: unmountController, config: read47, tier: 'pictorial' },
  render: (args) => <Unmountable>{renderWidget(args)}</Unmountable>,
  play: async ({ canvasElement, args }) => {
    await findWidget(canvasElement, ROOT);
    let settled = false;
    const playing = unmountController.play({ op: 'answer', args: { value: 47 } });
    void playing.then(() => {
      settled = true;
    });
    // Pip is still pressing the first key (340 ms) when the widget goes.
    await new Promise((r) => setTimeout(r, 120));
    await expect(settled).toBe(false);
    unmountWidget?.();
    await waitFor(() => expect(canvasElement.querySelector(ROOT)).toBeNull());
    await waitFor(() => expect(settled).toBe(true), { timeout: 2000 });
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn in a faded example: Pip's hand points at the tens pile (add-piece), then at
 * "Make a ten" (fuse) and at check (answer). Input stays on.
 */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteController, config: fuseConfig },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'add-piece', args: { kind: 'tens' } });
    await waitFor(() => expect(pile(root, 'tens')).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, pile(root, 'tens'), root);
    await expect(pile(root, 'tens')).not.toHaveAttribute('aria-disabled');
    inviteController.invite({ op: 'fuse', args: { kind: 'ones' } });
    await waitFor(() => expect(trade(root, 'fuse-ones')).toHaveClass('ni-invite'));
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      trade(root, 'fuse-ones'),
      root,
    );
    inviteController.invite({ op: 'answer', args: {} });
    const check = within(root).getByRole('button', { name: 'Check' });
    await waitFor(() => expect(check).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, check, root);
    inviteController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
  },
};

const unsupportedController: WidgetDemo = createDemoController({ strict: true });

/** An op base-ten-build doesn't define throws UnsupportedWidgetOpError in development. */
export const DemoUnsupportedOp: Story = {
  args: { disabled: true, demo: unsupportedController },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(unsupportedController.play({ op: 'trade' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: demo ops are instant state changes plus a highlight ring. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController, config: fuseConfig },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'fuse', args: { kind: 'ones' } });
    await reducedController.play({ op: 'add-piece', args: { kind: 'ones' } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expectMat(root, { tens: 3, ones: 5 });
    await expect(root.querySelector('[data-flash="true"]')).not.toBeNull();
  },
};
