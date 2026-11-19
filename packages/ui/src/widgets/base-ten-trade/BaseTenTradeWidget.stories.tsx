import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
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
 * `base-ten-trade` (03 §5.5): a hundreds | tens | ones mat. Split a piece into ten of the next
 * smaller kind, or group ten into one of the next larger; add the waiting pieces (`+`) or take
 * pieces into the seagull's nest (`-`). "Check" answers the mat state; with `thenAsk` the child
 * also types the result. The mat never shows counts, and the algorithm's result boxes stay empty.
 */

type Config = ConfigFor<'base-ten-trade'>;

const add27and15: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 0, tens: 2, ones: 7 },
  operation: { op: '+', operand: { hundreds: 0, tens: 1, ones: 5 } },
  goal: 'compute',
  showAlgorithm: false,
  thenAsk: false,
};

const take42minus15: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 0, tens: 4, ones: 2 },
  operation: { op: '-', operand: { hundreds: 0, tens: 1, ones: 5 } },
  goal: 'compute',
  showAlgorithm: false,
  thenAsk: false,
};

const acrossZero: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 3, tens: 0, ones: 4 },
  operation: { op: '-', operand: { hundreds: 1, tens: 2, ones: 8 } },
  goal: 'compute',
  showAlgorithm: true,
  thenAsk: true,
};

const cascade199: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 1, tens: 9, ones: 9 },
  operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 1 } },
  goal: 'compute',
  showAlgorithm: true,
  thenAsk: false,
};

const regroup: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 1, tens: 2, ones: 3 },
  goal: 'regroup-to',
  regroupTarget: { hundreds: 0, tens: 12, ones: 3 },
  showAlgorithm: false,
  thenAsk: false,
};

const meta = {
  title: 'Widgets/Base-ten trade',
  args: {
    config: add27and15 as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  // The 1280 × 800 tablet's widget area (the stage is 1200 px wide there), whatever the test
  // browser's own width, so the fit and size checks measure the screen the widget is built for.
  render: (args) => (
    <div style={{ width: 1200, maxWidth: 'none', flex: 'none' }}>{renderWidget(args)}</div>
  ),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-btt';

// ---------- helpers ----------

const q = <E extends Element = HTMLElement>(root: Element, sel: string) => {
  const el = root.querySelector<E & HTMLElement>(sel);
  if (!el) throw new Error(`${sel} not found`);
  return el;
};
const pending = (root: Element, c: string) => q(root, `[data-place-item="pending-${c}"]`);
const columnPad = (root: Element, c: string) => q(root, `[data-place-target="col-${c}"]`);
const nest = (root: Element) => q(root, '[data-place-target="take"]');
const grabItem = (root: Element, c: string) => q(root, `[data-col="${c}"] [data-place-item]`);
const trade = (root: Element, from: string, to: string) =>
  q<HTMLButtonElement>(root, `[data-trade="trade-${from}-${to}"]`);
const pieces = (root: Element, c: string) =>
  root.querySelectorAll(`[data-col="${c}"] [data-piece]`).length;
const takenPieces = (root: Element, c: string) =>
  root.querySelectorAll(`[data-piece^="taken-${c}-"]`).length;
/** The algorithm's result row, hundreds to ones. */
const boxes = (root: Element) =>
  [...root.querySelectorAll('.ni-btt__box')].map((b) => b.textContent ?? '');

/** The one piece scale every config draws at (ones are 20 px). */
const U = 20;
/**
 * The heaviest config (304 − 128 with the algorithm, the pad and the nest) can't fit at U: it
 * steps down, but never below this.
 */
const U_HEAVY = 18;

/** Waits until every trade or move animation has landed. */
async function settled(root: Element) {
  await waitFor(
    () => expect(root.querySelector('.ni-btt__ghost, [data-arriving="true"]')).toBeNull(),
    { timeout: 4000 },
  );
}

const mat = (root: Element) => ({
  hundreds: pieces(root, 'hundreds'),
  tens: pieces(root, 'tens'),
  ones: pieces(root, 'ones'),
});

/** Taps an item then a target (tap-to-select → tap-to-place, 06 §4). */
async function tapPlace(item: HTMLElement, target: HTMLElement) {
  await userEvent.click(item);
  await userEvent.click(target);
}

/**
 * Fits the 1280 × 800 tablet's widget area: nothing scrolls or spills out of the widget, and the
 * stage stays within 800 px minus the 2 × 40 px story padding.
 */
async function expectFits(canvasElement: HTMLElement, root: HTMLElement, minU = U) {
  await expectCountable(root, minU);
  await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  const box = root.getBoundingClientRect();
  for (const el of root.querySelectorAll<HTMLElement>(
    '.ni-btt__mat, .ni-btt__nest, .ni-btt__problem, .ni-btt__work, .ni-pad, .ni-btn, [data-piece]',
  )) {
    const r = el.getBoundingClientRect();
    await expect(r.left, `${el.className} left`).toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(r.right, `${el.className} right`).toBeLessThanOrEqual(box.right + 0.5);
    await expect(r.top, `${el.className} top`).toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(r.bottom, `${el.className} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
  }
  // Pieces stay inside their own column.
  for (const col of root.querySelectorAll<HTMLElement>('.ni-btt__col')) {
    const c = col.getBoundingClientRect();
    for (const p of col.querySelectorAll<HTMLElement>('[data-piece]')) {
      const r = p.getBoundingClientRect();
      await expect(r.left).toBeGreaterThanOrEqual(c.left - 0.5);
      await expect(r.right).toBeLessThanOrEqual(c.right + 0.5);
      await expect(r.bottom).toBeLessThanOrEqual(c.bottom + 0.5);
    }
  }
  const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
  await expect(stage.getBoundingClientRect().height).toBeLessThanOrEqual(720);
  await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth + 1);
}

/**
 * Every piece is separately visible and countable: no two pieces in a column, the tray or the
 * nest overlap. The mat fills the widget's width, and the unit (a ones piece) is at least `minU`.
 */
async function expectCountable(root: HTMLElement, minU = U) {
  const groups = [
    ...root.querySelectorAll<HTMLElement>('.ni-btt__col, .ni-btt__pending, .ni-btt__taken'),
  ];
  for (const g of groups) {
    const rects = [...g.querySelectorAll('[data-piece]')].map((p) => p.getBoundingClientRect());
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as DOMRect;
        const b = rects[j] as DOMRect;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        await expect(overlapX > 0.5 && overlapY > 0.5, `pieces ${i} and ${j} overlap`).toBe(false);
      }
    }
  }
  const unit = root.querySelector('.ni-btt__mat [data-piece^="ones-"]');
  if (unit) await expect(unit.getBoundingClientRect().width).toBeGreaterThanOrEqual(minU);
  const main = q(root, '.ni-btt__main').getBoundingClientRect();
  await expect(q(root, '.ni-btt__mat').getBoundingClientRect().width).toBeGreaterThanOrEqual(
    main.width - 2,
  );
}

/** No count, total or result anywhere: the only numerals are the problem's (03 §5.5, U03 rule). */
async function expectNoReveal(root: HTMLElement, result: number) {
  // The mat has words (headers, button captions) but never a numeral.
  await expect(q(root, '.ni-btt__mat').textContent).not.toMatch(/\d/);
  if (root.querySelector('.ni-btt__nest')) {
    await expect(q(root, '.ni-btt__nest').textContent).not.toMatch(/\d/);
  }
  for (const el of root.querySelectorAll('[aria-label]')) {
    await expect(el.getAttribute('aria-label')).not.toContain(String(result));
  }
  for (const el of root.querySelectorAll('*')) {
    for (const a of el.getAttributeNames()) {
      if (a.startsWith('data-') && a !== 'data-piece' && a !== 'data-place-item') {
        await expect(el.getAttribute(a)).not.toBe(String(result));
      }
    }
  }
}

/** Every control a child taps, for size and gap checks. */
function controls(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      '[data-place-item], [data-place-target], .ni-btt__speak, .ni-btt__trade, .ni-btn, button.ni-btt__box',
    ),
  ].filter((el, i, all) => all.indexOf(el) === i);
}

// ---------- adding ----------

/**
 * Evidence: 27 + 15 at the START. The mat holds 27 (two tens, seven ones); the 15 waits in the
 * adding tray, its ten under the tens and its five ones under the ones. Nothing is added yet.
 */
export const AddStart: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 2, ones: 7 });
    const tray = q(root, '.ni-btt__tray');
    await expect(tray.querySelectorAll('[data-piece^="pending-tens-"]')).toHaveLength(1);
    await expect(tray.querySelectorAll('[data-piece^="pending-ones-"]')).toHaveLength(5);
    // Each waiting group sits under its own column.
    for (const c of ['tens', 'ones']) {
      const col = q(root, `[data-col="${c}"]`).getBoundingClientRect();
      const group = center(pending(root, c));
      await expect(group.x).toBeGreaterThan(col.left);
      await expect(group.x).toBeLessThan(col.right);
    }
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expectFits(canvasElement, root);
    await expectNoReveal(root, 42);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

/**
 * Evidence: 27 + 15 in progress. The waiting ones are added (twelve ones on the mat, ten of them
 * ready to group), the waiting ten is still in the tray.
 */
export const AddInProgress: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(pending(root, 'ones'), columnPad(root, 'ones'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 2, ones: 12 });
    await expect(pending(root, 'tens')).toBeInTheDocument();
    await expect(root.querySelector('[data-place-item="pending-ones"]')).toBeNull();
    await expect(trade(root, 'ones', 'tens')).toBeEnabled();
    // Nothing is picked up: the frame shows the state, not a selection.
    await expect(root.querySelector('[data-selected="true"]')).toBeNull();
    (document.activeElement as HTMLElement | null)?.blur();
    await expectFits(canvasElement, root);
  },
};

/**
 * G1, 27 + 15: tap the waiting ten onto the tens, the waiting ones onto the ones (twelve ones now),
 * group ten ones into a ten, check. Answers the mat: 4 tens, 2 ones.
 */
export const AddCombine: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    for (const el of controls(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(controls(root));
    // G1: the trade buttons show an icon and a word; their names say the whole trade.
    await expect(trade(root, 'tens', 'ones')).toHaveTextContent('Split');
    await expect(trade(root, 'tens', 'ones')).toHaveAccessibleName('Split a ten into ten ones');
    await expect(trade(root, 'ones', 'tens')).toBeDisabled();
    await expectNoReveal(root, 42);

    await tapPlace(pending(root, 'tens'), columnPad(root, 'tens'));
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btt.piece.tens', undefined);
    await tapPlace(pending(root, 'ones'), columnPad(root, 'ones'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 12 });
    await expect(trade(root, 'ones', 'tens')).toBeEnabled();
    await userEvent.click(trade(root, 'ones', 'tens'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 2 });
    await expectNoReveal(root, 42);
    // Few pieces: big, chunky ones (a rod up to 300 px), and the mat fills the widget.
    await expectFits(canvasElement, root, U);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 4, ones: 2 },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:pending-tens',
      'tap:col-tens',
      'tap:pending-ones',
      'tap:col-ones',
      'tap:trade-ones-tens',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * K, 27 + 15: everything is a picture with a spoken label (no words to read), K-sized and spaced.
 * Drag the ten and the ones onto their columns and group ten ones.
 */
export const AddK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const all = controls(root);
    for (const el of all) await expectTargetSize(el, 'k');
    await expectTargetGaps(all);
    // Icon-only: no visible words on the mat, the buttons or "check".
    await expect(root.querySelector('.ni-btt__headword')).toBeNull();
    for (const b of root.querySelectorAll('.ni-btn')) await expect(b.textContent?.trim()).toBe('');
    await expect(trade(root, 'ones', 'tens')).toHaveAccessibleName('Group ten ones into a ten');
    await pointerDrag(pending(root, 'tens'), center(columnPad(root, 'tens')));
    await pointerDrag(pending(root, 'ones'), center(columnPad(root, 'ones')));
    await settled(root);
    await userEvent.click(trade(root, 'ones', 'tens'));
    // K: the trade button speaks its label.
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btt.group.ones', undefined);
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 2 });
    // K: big, chunky pieces (ones at least 24 px; a rod up to 300 px) on a mat that fills the area.
    await expectFits(canvasElement, root, U);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 4, ones: 2 },
    });
  },
};

/**
 * State equivalence (03 §5.5): add both groups and check without grouping the twelve ones. The
 * widget sends that mat (3 tens, 12 ones); the checker accepts it as 42.
 */
export const UntradedStillSubmits: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(pending(root, 'tens'), columnPad(root, 'tens'));
    await tapPlace(pending(root, 'ones'), columnPad(root, 'ones'));
    await settled(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 3, ones: 12 },
    });
  },
};

/** Mouse drag: drag the waiting ones onto the ones column; a drop on the wrong column glides home. */
export const DragCombine: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // The ones don't go in the tens column: the group glides back to the tray.
    await pointerDrag(pending(root, 'ones'), center(columnPad(root, 'tens')));
    await expect(pending(root, 'ones')).toBeInTheDocument();
    await expect(pieces(root, 'tens')).toBe(2);
    await pointerDrag(pending(root, 'ones'), center(columnPad(root, 'ones')));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 2, ones: 12 });
    await expect(root.querySelector('[data-place-item="pending-ones"]')).toBeNull();
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 2, ones: 12 },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:pending-ones',
      'drop:none',
      'drag:pending-ones',
      'drop:col-ones',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Tap-to-place: tapping the waiting tens picks them up (ink ring) and says "ten"; the ones column
 * can't take them, the tens column can.
 */
export const TapToPlace: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(pending(root, 'tens'));
    await expect(pending(root, 'tens')).toHaveAttribute('aria-pressed', 'true');
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btt.piece.tens', undefined);
    await expect(columnPad(root, 'tens')).toHaveAttribute('data-armed', 'true');
    await expect(columnPad(root, 'ones')).not.toHaveAttribute('data-armed');
    await userEvent.click(columnPad(root, 'ones'));
    await expect(pieces(root, 'ones')).toBe(7);
    await userEvent.click(columnPad(root, 'tens'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 7 });
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 3, ones: 7 },
    });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:pending-tens',
      'tap:col-tens',
    ]);
  },
};

/** Keyboard (06 §7): Enter picks a group up and moves to its column; Enter places it. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    pending(root, 'tens').focus();
    await userEvent.keyboard('{Enter}');
    await expect(columnPad(root, 'tens')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    pending(root, 'ones').focus();
    await userEvent.keyboard(' ');
    await expect(columnPad(root, 'ones')).toHaveFocus();
    await userEvent.keyboard(' ');
    await settled(root);
    trade(root, 'ones', 'tens').focus();
    await userEvent.keyboard('{Enter}');
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 2 });
    within(root).getByRole('button', { name: 'Check' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 4, ones: 2 },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:pending-tens',
      'tap:col-tens',
      'tap:pending-ones',
      'tap:col-ones',
      'tap:trade-ones-tens',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Pictorial tier: the same mat drawn as quick ink pictures (square, stick, dot-square). */
export const AddPictorial: Story = {
  args: { tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-tier', 'pictorial');
    await tapPlace(pending(root, 'tens'), columnPad(root, 'tens'));
    await tapPlace(pending(root, 'ones'), columnPad(root, 'ones'));
    await settled(root);
    await userEvent.click(trade(root, 'ones', 'tens'));
    await settled(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 4, ones: 2 },
    });
  },
};

/**
 * 199 + 1 with the column algorithm: adding the one makes ten ones, grouping them makes ten tens,
 * grouping those makes a second hundred. The carries appear above the tens and hundreds as the
 * child trades; the result boxes stay empty.
 */
export const ShowAlgorithm: Story = {
  args: { config: cascade199 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const notes = () => [...root.querySelectorAll('.ni-btt__note')].map((n) => n.textContent ?? '');
    const boxes = () => [...root.querySelectorAll('.ni-btt__box')].map((b) => b.textContent);
    await expect(notes()).toEqual(['', '', '']);
    await tapPlace(pending(root, 'ones'), columnPad(root, 'ones'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 1, tens: 9, ones: 10 });
    await expectFits(canvasElement, root);
    await userEvent.click(trade(root, 'ones', 'tens'));
    await settled(root);
    await expect(notes()).toEqual(['', '1', '']);
    await userEvent.click(trade(root, 'tens', 'hundreds'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 2, tens: 0, ones: 0 });
    await expect(notes()).toEqual(['1', '1', '']);
    await expect(boxes()).toEqual(['', '', '']);
    await expectNoReveal(root, 200);
    // Two hundreds side by side, never piled: a child counts them.
    await expectFits(canvasElement, root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 2, tens: 0, ones: 0 },
    });
  },
};

// ---------- taking away ----------

/**
 * 42 − 15: only two ones to take five from, so split a ten first (twelve ones), then take five
 * ones and a ten into the nest (tap-to-place). Answers the mat: 2 tens, 7 ones.
 */
export const SubtractTake: Story = {
  args: { config: take42minus15 },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    for (const el of controls(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(controls(root));
    await expectNoReveal(root, 27);
    await userEvent.click(trade(root, 'tens', 'ones'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 12 });
    for (let i = 0; i < 5; i++) await tapPlace(grabItem(root, 'ones'), nest(root));
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btt.piece.ones', undefined);
    await tapPlace(grabItem(root, 'tens'), nest(root));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 2, ones: 7 });
    await expect(takenPieces(root, 'ones')).toBe(5);
    await expect(takenPieces(root, 'tens')).toBe(1);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 2, ones: 7 },
    });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.slice(0, 3)).toEqual(['tap:trade-tens-ones', 'tap:mat-ones-11', 'tap:take']);
    await expect(trace.at(-2)).toBe('tap:mat-tens-2');
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * Touch drag (tablet): drag a ten from the tens column into the nest. A column can't give what it
 * doesn't have: once the ones are gone, there is nothing left to drag there.
 */
export const TouchTake: Story = {
  args: { config: take42minus15 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(grabItem(root, 'tens'), center(nest(root)), 'touch');
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 2 });
    await pointerDrag(grabItem(root, 'ones'), center(nest(root)), 'touch');
    await pointerDrag(grabItem(root, 'ones'), center(nest(root)), 'touch');
    await settled(root);
    await expect(root.querySelector('[data-col="ones"] [data-place-item]')).toBeNull();
    await expect(takenPieces(root, 'ones')).toBe(2);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 3, ones: 0 },
    });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual([
      'drag:mat-tens-3',
      'drop:take',
      'drag:mat-ones-1',
      'drop:take',
      'drag:mat-ones-0',
      'drop:take',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * 304 − 128 with the algorithm and a typed answer: no tens to split, so split a hundred into ten
 * tens, then a ten into ten ones (fourteen ones). The algorithm shows the child's regrouping (2 over
 * a crossed 3, 9 over a crossed 0, 14 over a crossed 4). Take 8 ones, 2 tens and a hundred, type
 * 176, check.
 */
export const SubtractAcrossZero: Story = {
  args: { config: acrossZero },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(trade(root, 'tens', 'ones')).toBeDisabled();
    await userEvent.click(trade(root, 'hundreds', 'tens'));
    await userEvent.click(trade(root, 'tens', 'ones'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 2, tens: 9, ones: 14 });
    const notes = [...root.querySelectorAll('.ni-btt__note')].map((n) => n.textContent);
    await expect(notes).toEqual(['2', '9', '14']);
    await expect(root.querySelectorAll('.ni-btt__digit[data-crossed="true"]')).toHaveLength(3);
    await expect([...root.querySelectorAll('.ni-btt__box')].map((b) => b.textContent)).toEqual([
      '',
      '',
      '',
    ]);
    for (let i = 0; i < 8; i++) await tapPlace(grabItem(root, 'ones'), nest(root));
    for (let i = 0; i < 2; i++) await tapPlace(grabItem(root, 'tens'), nest(root));
    await tapPlace(grabItem(root, 'hundreds'), nest(root));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 1, tens: 7, ones: 6 });
    await expectNoReveal(root, 176);
    await expectFits(canvasElement, root, U_HEAVY);
    await expect(check).toBeDisabled();
    // One answer place: the algorithm's result row. No `=` blank to disagree with it.
    await expect(canvas.queryByRole('status')).toBeNull();
    // Tap the ones box and write the answer as a child does, ones first.
    await userEvent.click(canvas.getByRole('button', { name: 'Ones box' }));
    for (const k of ['6', '7']) await userEvent.click(canvas.getByRole('button', { name: k }));
    // 76 is already a number, so Check is on; the child writes the hundreds digit too.
    await expect(check).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: '1' }));
    await expect(boxes(root)).toEqual(['1', '7', '6']);
    await expect(canvas.getByRole('button', { name: 'Hundreds box: 1' })).toBeInTheDocument();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 1, tens: 7, ones: 6, value: 176 },
    });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.slice(-4)).toEqual([
      'tap:digit-ones',
      'tap:key-6',
      'tap:key-7',
      'tap:key-1',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
    await expectFits(canvasElement, root, U_HEAVY);
  },
};

/**
 * Evidence: 304 − 128 with the algorithm, at the START. The problem is written in columns with an
 * empty result row (the answer place, ones box ready) and no regrouping notes yet.
 */
export const SubtractAcrossZeroStart: Story = {
  args: { config: acrossZero },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect([...root.querySelectorAll('.ni-btt__note')].map((n) => n.textContent)).toEqual([
      '',
      '',
      '',
    ]);
    await expect(root.querySelectorAll('[data-crossed="true"]')).toHaveLength(0);
    await expect(boxes(root)).toEqual(['', '', '']);
    await expect(q(root, '[data-digit="ones"]')).toHaveAttribute('data-state', 'active');
    await expect(mat(root)).toEqual({ hundreds: 3, tens: 0, ones: 4 });
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    for (const el of controls(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(controls(root));
    await expectNoReveal(root, 176);
    await expectFits(canvasElement, root, U_HEAVY);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

/**
 * Stress, the largest config: 304 − 128 with the algorithm, the nest and the number pad, after
 * the borrow across zero (two hundreds, nine tens, fourteen ones, a hundred and two tens taken).
 * Everything fits the 1280 × 800 widget area with no scrolling.
 */
export const Stress: Story = {
  args: { config: acrossZero },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFits(canvasElement, root, U_HEAVY);
    await userEvent.click(trade(root, 'hundreds', 'tens'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 2, tens: 10, ones: 4 });
    await expectFits(canvasElement, root, U_HEAVY);
    await userEvent.click(trade(root, 'tens', 'ones'));
    await tapPlace(grabItem(root, 'hundreds'), nest(root));
    await tapPlace(grabItem(root, 'tens'), nest(root));
    await tapPlace(grabItem(root, 'tens'), nest(root));
    await tapPlace(grabItem(root, 'ones'), nest(root));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 1, tens: 7, ones: 13 });
    await expectFits(canvasElement, root, U_HEAVY);
    for (const el of controls(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(controls(root));
  },
};

/**
 * K stress: the fullest K screen, a take-away with the nest and the (bigger) K number pad, 42 − 15
 * typed into the `=` blank. Split a ten, take 15. K-sized targets, the one 20 px scale, no scroll.
 */
export const StressK: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...take42minus15, thenAsk: true } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(trade(root, 'tens', 'ones'));
    await settled(root);
    await expectFits(canvasElement, root);
    for (let i = 0; i < 5; i++) await tapPlace(grabItem(root, 'ones'), nest(root));
    await tapPlace(grabItem(root, 'tens'), nest(root));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 2, ones: 7 });
    await expectFits(canvasElement, root);
    for (const el of controls(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(controls(root));
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

// ---------- regroup-to ----------

/**
 * Regroup 1 hundred, 2 tens, 3 ones into 0 hundreds, 12 tens, 3 ones (the goal row shows it in
 * pictures). Tapping a column says its piece's name. Split the hundred, check.
 */
export const RegroupTo: Story = {
  args: { config: regroup },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const goal = canvas.getByRole('group', { name: 'Make it look like this' });
    await expect(goal.textContent?.replace(/\s/g, '')).toBe('0123');
    for (const n of goal.querySelectorAll('.ni-btt__chipnum')) {
      await expect(Number.parseFloat(getComputedStyle(n).fontSize)).toBeGreaterThanOrEqual(32);
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Tens' }));
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btt.piece.tens', undefined);
    await expect(canvas.getByRole('button', { name: 'Check' })).toBeDisabled();
    await userEvent.click(trade(root, 'hundreds', 'tens'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 12, ones: 3 });
    await expectFits(canvasElement, root);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 12, ones: 3 },
    });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:col-tens',
      'tap:trade-hundreds-tens',
    ]);
  },
};

/**
 * Evidence, stress with hundreds: three flats on the mat (regroup 3 hundreds, 1 ten, 5 ones into
 * 2 hundreds, 11 tens, 5 ones). At the one 20 px scale the flats sit 2 × 2, each countable. Split
 * a hundred (eleven tens in a row), group it back: every state fits 1280 × 800 with no overlap.
 */
export const StressThreeFlats: Story = {
  args: {
    config: {
      format: 'base-ten-trade',
      start: { hundreds: 3, tens: 1, ones: 5 },
      goal: 'regroup-to',
      regroupTarget: { hundreds: 2, tens: 11, ones: 5 },
      showAlgorithm: false,
      thenAsk: false,
    } satisfies Config,
  },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(mat(root)).toEqual({ hundreds: 3, tens: 1, ones: 5 });
    await expectFits(canvasElement, root);
    await userEvent.click(trade(root, 'hundreds', 'tens'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 2, tens: 11, ones: 5 });
    await expectFits(canvasElement, root);
    await userEvent.click(trade(root, 'tens', 'hundreds'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 3, tens: 1, ones: 5 });
    await expectFits(canvasElement, root);
    for (const el of controls(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(controls(root));
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

// ---------- animation ----------

/**
 * Splitting a ten: the rod cracks into ten ones that slide into the ones column (about 0.85 s,
 * transform and opacity only); grouping slides ten ones together into a rod that moves over.
 */
export const TradeAnimation: Story = {
  args: { config: take42minus15 },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(trade(root, 'tens', 'ones'));
    // Mid-animation: one rod ghost plus ten unit ghosts; the new ones wait hidden.
    await waitFor(() => expect(root.querySelectorAll('.ni-btt__ghost')).toHaveLength(11));
    await expect(root.querySelectorAll('[data-arriving="true"]')).toHaveLength(10);
    const ghost = root.querySelector('.ni-btt__ghost') as HTMLElement;
    const timing = ghost.getAnimations()[0]?.effect?.getComputedTiming();
    await expect(Number(timing?.endTime)).toBeGreaterThanOrEqual(600);
    await expect(Number(timing?.endTime)).toBeLessThanOrEqual(900);
    // Only transform and opacity animate.
    for (const g of root.querySelectorAll<HTMLElement>('.ni-btt__ghost')) {
      for (const a of g.getAnimations()) {
        const frames = (a.effect as KeyframeEffect).getKeyframes();
        for (const f of frames) {
          for (const k of Object.keys(f)) {
            await expect([
              'transform',
              'opacity',
              'offset',
              'easing',
              'composite',
              'computedOffset',
            ]).toContain(k);
          }
        }
      }
    }
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 12 });
    await userEvent.click(trade(root, 'ones', 'tens'));
    await waitFor(() => expect(root.querySelectorAll('.ni-btt__ghost')).toHaveLength(11));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 2 });
  },
};

/** Reduced motion: a trade lands at once (no ghosts), and the two columns glow briefly. */
export const TradeAnimationReducedMotion: Story = {
  args: { config: take42minus15 },
  globals: { motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(trade(root, 'tens', 'ones'));
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 12 });
    await expect(root.querySelector('.ni-btt__ghost')).toBeNull();
    await expect(root.querySelectorAll('.ni-btt__col[data-flash="true"]')).toHaveLength(2);
  },
};

// ---------- disabled and demo ----------

/** `disabled`: nothing responds, and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true, config: take42minus15 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(trade(root, 'tens', 'ones')).toBeDisabled();
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(grabItem(root, 'tens')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(grabItem(root, 'tens'));
    await pointerDrag(grabItem(root, 'ones'), center(nest(root)));
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 2 });
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (03 §6.3), 42 − 15 with the algorithm and the pad: Pip splits a ten, takes five ones and a
 * ten, writes 7 and 2 under the line and types 27. Input stays off while Pip plays.
 */
export const DemoPlay: Story = {
  args: {
    disabled: true,
    demo: demoController,
    config: { ...take42minus15, showAlgorithm: true, thenAsk: true },
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'trade', args: { from: 'tens', to: 'ones' } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 12 });
    await demoController.play({ op: 'take', args: { column: 'ones', count: 5 } });
    await demoController.play({ op: 'take', args: { column: 'tens', count: 1 } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 2, ones: 7 });
    await expect(takenPieces(root, 'ones')).toBe(5);
    await demoController.play({ op: 'write-digit', args: { column: 'ones', value: 7 } });
    await demoController.play({ op: 'write-digit', args: { column: 'tens', value: 2 } });
    await expect(boxes(root)).toEqual(['', '2', '7']);
    // `answer` types into the same result row (the one answer place), ones first.
    await demoController.play({ op: 'answer', args: { value: 18 } });
    await expect(boxes(root)).toEqual(['', '1', '8']);
    await demoController.play({ op: 'answer', args: { value: 27 } });
    await expect(boxes(root)).toEqual(['', '2', '7']);
    await expect(within(root).queryByRole('status')).toBeNull();
    // `combine` is supported (nothing waits to be added in a take-away, so nothing changes).
    await demoController.play({ op: 'combine', args: { column: 'ones' } });
    await expect(args.onResponse).not.toHaveBeenCalled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const combineController: WidgetDemo = createDemoController({ strict: true });

/** Demo: Pip adds the waiting ten and ones (they fly onto the mat) and groups ten ones. */
export const DemoPlayCombine: Story = {
  args: { disabled: true, demo: combineController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await combineController.play({ op: 'combine', args: { column: 'tens' } });
    await combineController.play({ op: 'combine', args: { column: 'ones' } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 12 });
    await combineController.play({ op: 'trade', args: { from: 'ones', to: 'tens' } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 2 });
    await expect(root.querySelector('.ni-btt__tray [data-place-item]')).toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Demo with reduced motion: every op lands at once. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController, config: take42minus15 },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'trade', args: { from: 'tens', to: 'ones' } });
    await reducedController.play({ op: 'take', args: { column: 'ones', count: 5 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 7 });
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn (03 §6.3): Pip's hand points at the button to press, the group to add, the
 * column to take from, and the answer box.
 */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteController, config: { ...add27and15, thenAsk: true } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    inviteController.invite({ op: 'combine', args: { column: 'ones' } });
    await waitFor(() => expect(root.querySelector('.ni-invite')).not.toBeNull());
    await expectPointerOn(hand(), pending(root, 'ones'), root);
    inviteController.invite({ op: 'answer', args: { value: 42 } });
    await waitFor(() => expect(root.querySelector('.ni-btt__answer.ni-invite')).not.toBeNull());
    await expectPointerOn(hand(), q(root, '.ni-btt__answer'), root);
    // The child adds the groups; then Pip points at the button that groups ten ones.
    inviteController.invite(null);
    await tapPlace(pending(root, 'tens'), columnPad(root, 'tens'));
    await tapPlace(pending(root, 'ones'), columnPad(root, 'ones'));
    await settled(root);
    inviteController.invite({ op: 'trade', args: { from: 'ones', to: 'tens' } });
    await waitFor(() => expect(trade(root, 'ones', 'tens')).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), trade(root, 'ones', 'tens'), root);
    await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
  },
};

const takeInviteController: WidgetDemo = createDemoController({ strict: true });

/** The child's turn in a take-away: Pip points at the tens column (drag one into the nest). */
export const DemoInviteTake: Story = {
  args: { demo: takeInviteController, config: { ...take42minus15, showAlgorithm: true } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    takeInviteController.invite({ op: 'take', args: { column: 'tens', count: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-btt__body.ni-invite')).not.toBeNull());
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      grabItem(root, 'tens'),
      root,
    );
    takeInviteController.invite({ op: 'write-digit', args: { column: 'ones', value: 7 } });
    await waitFor(() => expect(root.querySelector('.ni-btt__box.ni-invite')).not.toBeNull());
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      q(root, '[data-digit="ones"]'),
      root,
    );
  },
};

const unsupportedController: WidgetDemo = createDemoController({ strict: true });

/** An op the format doesn't list throws `UnsupportedWidgetOpError` (development). */
export const DemoUnsupportedOp: Story = {
  args: { disabled: true, demo: unsupportedController },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(
      unsupportedController.play({ op: 'fuse', args: { kind: 'ones' } }),
    ).rejects.toBeInstanceOf(UnsupportedWidgetOpError);
    await expect(unsupportedController.ops).toEqual([
      'trade',
      'combine',
      'take',
      'write-digit',
      'answer',
    ]);
  },
};
