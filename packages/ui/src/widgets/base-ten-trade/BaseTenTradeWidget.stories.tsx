import { formatModel } from '@number-island/engine';
import type { WidgetAction, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
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
  areaBox,
  expectFitsRoom,
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  inRoom,
  type PierRoom,
  renderWidget,
  resizeRoom,
  stableLayout,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import { WidgetHost, type WidgetHostProps } from '../WidgetHost';
import { CARD_PAD, GUTTER, NEST_CURVE, NEST_RIM, U_MIN } from './layout';

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
/** The heaviest config (304 − 128 with the algorithm, the pad and the nest) also draws at U. */
const U_HEAVY = U;

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
/**
 * expectFits' fit, containment and no-overlap checks gathered into a list of problems (empty when
 * all hold), for a play that checks after every one of many steps: one assertion, not hundreds.
 */
function fitProblems(canvasElement: HTMLElement, root: HTMLElement): string[] {
  const out: string[] = [];
  const r = (el: Element) => el.getBoundingClientRect();
  const within = (what: string, a: DOMRect, f: Frame, min: number) => {
    if (a.left - f.left < min - 0.5) out.push(`${what}: room on the left`);
    if (f.right - a.right < min - 0.5) out.push(`${what}: room on the right`);
    if (a.top - f.top < min - 0.5) out.push(`${what}: room above`);
    if (f.bottom - a.bottom < min - 0.5) out.push(`${what}: room below`);
  };
  if (root.scrollHeight > root.clientHeight + 1) out.push('widget scrolls down');
  if (root.scrollWidth > root.clientWidth + 1) out.push('widget scrolls across');
  const box = r(root);
  for (const el of root.querySelectorAll(
    '.ni-btt__mat, .ni-btt__nest, .ni-btt__problem, .ni-btt__work, .ni-pad, .ni-btn, [data-piece]',
  )) {
    within(`${el.className} in the widget`, r(el), box, 0);
  }
  for (const g of root.querySelectorAll('.ni-btt__col, .ni-btt__pending, .ni-btt__taken')) {
    const rects = [...g.querySelectorAll('[data-piece]')].map(r);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as DOMRect;
        const b = rects[j] as DOMRect;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 0.5 && overlapY > 0.5)
          out.push(`${g.className}: pieces ${i} and ${j} overlap`);
      }
    }
  }
  for (const body of root.querySelectorAll('.ni-btt__body')) {
    for (const p of body.querySelectorAll('[data-piece]')) within('piece', r(p), r(body), GUTTER);
  }
  const hollow = root.querySelector('.ni-btt__hollow');
  if (hollow) {
    const h = r(hollow);
    const frame = {
      left: h.left + NEST_CURVE,
      right: h.right - NEST_CURVE,
      top: h.top + NEST_RIM,
      bottom: r(q(root, '.ni-btt__nest-wall')).top,
    };
    for (const p of root.querySelectorAll('.ni-btt__taken [data-piece]')) {
      within('taken piece', r(p), frame, GUTTER);
    }
  }
  const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
  if (r(stage).height > 720) out.push(`stage ${r(stage).height} px tall`);
  if (stage.scrollWidth > stage.clientWidth + 1) out.push('stage scrolls across');
  return out;
}
type Frame = { left: number; right: number; top: number; bottom: number };

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
  await expectGutters(root);
  const unit = root.querySelector('.ni-btt__mat [data-piece^="ones-"]');
  if (unit) await expect(unit.getBoundingClientRect().width).toBeGreaterThanOrEqual(minU);
  // The mat fills its area once the widget has measured it (a frame or two after a change; on a
  // busy runner the first read can come before that).
  await waitFor(() =>
    expect(q(root, '.ni-btt__mat').getBoundingClientRect().width).toBeGreaterThanOrEqual(
      q(root, '.ni-btt__main').getBoundingClientRect().width - 2,
    ),
  );
}

/**
 * The minimum gutters (layout.ts GUTTER, CARD_PAD), so cramped edges can't come back unnoticed:
 * - every piece ≥ GUTTER from its column's edges (gutters, the header's rule, the mat frame);
 * - every piece ≥ GUTTER inside a waiting group's holder border, and every holder ≥ GUTTER inside
 *   the tray's border;
 * - every taken piece ≥ GUTTER below the nest's top rim, above its front wall, and clear of where
 *   its ends curve;
 * - everything in the algorithm card ≥ CARD_PAD inside its border.
 */
async function expectGutters(root: HTMLElement) {
  const B = 3; // the holder, tray, hollow and card borders
  const inside = async (
    what: string,
    el: Element,
    frame: { left: number; right: number; top: number; bottom: number },
    min: number,
  ) => {
    const r = el.getBoundingClientRect();
    await expect(r.left - frame.left, `${what}: room on the left`).toBeGreaterThanOrEqual(
      min - 0.5,
    );
    await expect(frame.right - r.right, `${what}: room on the right`).toBeGreaterThanOrEqual(
      min - 0.5,
    );
    await expect(r.top - frame.top, `${what}: room above`).toBeGreaterThanOrEqual(min - 0.5);
    await expect(frame.bottom - r.bottom, `${what}: room below`).toBeGreaterThanOrEqual(min - 0.5);
  };
  for (const body of root.querySelectorAll('.ni-btt__body')) {
    const frame = body.getBoundingClientRect();
    for (const p of body.querySelectorAll('[data-piece]')) await inside('piece', p, frame, GUTTER);
  }
  for (const group of root.querySelectorAll('.ni-btt__pending')) {
    const frame = group.getBoundingClientRect();
    for (const p of group.querySelectorAll('[data-piece]')) {
      await inside('waiting piece', p, frame, GUTTER + B);
    }
  }
  const tray = root.querySelector('.ni-btt__tray');
  if (tray) {
    const frame = tray.getBoundingClientRect();
    for (const g of tray.querySelectorAll('.ni-btt__pending')) {
      await inside('waiting group', g, frame, GUTTER + B);
    }
  }
  const hollow = root.querySelector('.ni-btt__hollow');
  if (hollow) {
    const h = hollow.getBoundingClientRect();
    const wallTop = q(root, '.ni-btt__nest-wall').getBoundingClientRect().top;
    const frame = {
      left: h.left + NEST_CURVE,
      right: h.right - NEST_CURVE,
      top: h.top + NEST_RIM,
      bottom: wallTop,
    };
    for (const p of root.querySelectorAll('.ni-btt__taken [data-piece]')) {
      await inside('taken piece', p, frame, GUTTER);
    }
  }
  for (const card of root.querySelectorAll('.ni-btt__work')) {
    const c = card.getBoundingClientRect();
    const frame = { left: c.left + B, right: c.right - B, top: c.top + B, bottom: c.bottom - B };
    for (const el of card.querySelectorAll('.ni-btt__note, .ni-btt__digit, .ni-btt__box')) {
      if ((el.textContent ?? '') === '' && !el.classList.contains('ni-btt__box')) continue;
      await inside('algorithm card', el, frame, CARD_PAD);
    }
  }
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
  return (
    [
      ...root.querySelectorAll<HTMLElement>(
        '[data-place-item], [data-place-target], .ni-btt__speak, .ni-btt__trade, .ni-btn, button.ni-btt__box, .ni-pad__key',
      ),
    ]
      // Not the hidden, inert copies the widget measures to plan its side panel.
      .filter((el) => el.closest('[inert]') === null)
      .filter((el, i, all) => all.indexOf(el) === i)
  );
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
 * K, 8 + 5 (a K-range sum): everything is a picture with a spoken label (no words to read),
 * K-sized and spaced. Drag the five waiting ones onto the eight (thirteen ones), group ten of them
 * into a ten, check: 1 ten, 3 ones.
 */
export const AddK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      format: 'base-ten-trade',
      start: { hundreds: 0, tens: 0, ones: 8 },
      operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 5 } },
      goal: 'compute',
      showAlgorithm: false,
      thenAsk: false,
    } satisfies Config,
  },
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
    await pointerDrag(pending(root, 'ones'), center(columnPad(root, 'ones')));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 0, ones: 13 });
    await userEvent.click(trade(root, 'ones', 'tens'));
    // K: the trade button speaks its label.
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btt.group.ones', undefined);
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 1, ones: 3 });
    await expectFits(canvasElement, root, U);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 1, ones: 3 },
    });
    (document.activeElement as HTMLElement | null)?.blur();
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
 * child trades; the result boxes stay empty. A 3-digit addend means a thousands place too (sized
 * from the operands, so it never tells whether the sum reaches 1000).
 */
export const ShowAlgorithm: Story = {
  args: { config: cascade199 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const notes = () => [...root.querySelectorAll('.ni-btt__note')].map((n) => n.textContent ?? '');
    const boxes = () => [...root.querySelectorAll('.ni-btt__box')].map((b) => b.textContent);
    await expect(notes()).toEqual(['', '', '', '']);
    await tapPlace(pending(root, 'ones'), columnPad(root, 'ones'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 1, tens: 9, ones: 10 });
    await expectFits(canvasElement, root);
    await userEvent.click(trade(root, 'ones', 'tens'));
    await settled(root);
    await expect(notes()).toEqual(['', '', '1', '']);
    await userEvent.click(trade(root, 'tens', 'hundreds'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 2, tens: 0, ones: 0 });
    await expect(notes()).toEqual(['', '1', '1', '']);
    await expect(boxes()).toEqual(['', '', '', '']);
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

// ---------- results of 1,000 or more (MDA.23 stretch) ----------

const hto = (v: number) => ({
  hundreds: Math.floor(v / 100),
  tens: Math.floor(v / 10) % 10,
  ones: v % 10,
});
const addItem = (a: number, b: number, showAlgorithm: boolean): Config => ({
  format: 'base-ten-trade',
  start: hto(a),
  operation: { op: '+', operand: hto(b) },
  goal: 'compute',
  showAlgorithm,
  thenAsk: true,
});
/** What the model sends for a mat and a typed value (base-ten-trade toResponse). */
const expectedResponse = (config: Config, actions: WidgetAction[], value: number) => {
  const model = formatModel('base-ten-trade');
  if (!model) throw new Error('no base-ten-trade model');
  let s = model.initialState(config);
  for (const a of [...actions, { op: 'answer', args: { value } }]) s = model.apply(s, a);
  return model.toResponse(s);
};
const typeKeys = async (root: HTMLElement, keys: string) => {
  for (const k of keys) await userEvent.click(within(root).getByRole('button', { name: k }));
};

/**
 * 500 + 500 with a typed answer on the pad: the five waiting hundreds join the mat (ten hundreds;
 * the mat has no thousands column, so they stay hundreds), and the child types 1000.
 */
export const ThousandPad: Story = {
  args: { config: addItem(500, 500, false) },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectNoReveal(root, 1000);
    await tapPlace(pending(root, 'hundreds'), columnPad(root, 'hundreds'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 10, tens: 0, ones: 0 });
    await expectFits(canvasElement, root);
    // Four digits fit the pad's entry (one more than the longer addend), not five.
    await typeKeys(root, '10000');
    await expect(q(root, '.ni-btt__answer').textContent).toBe('1000');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const response = {
      kind: 'state',
      value: { hundreds: 10, tens: 0, ones: 0, value: 1000 },
    };
    await expect(args.onResponse).toHaveBeenCalledWith(response);
    await expect(response).toEqual(
      expectedResponse(
        args.config as Config,
        [{ op: 'combine', args: { column: 'hundreds' } }],
        1000,
      ),
    );
  },
};

/**
 * 500 + 500 with the algorithm: a thousands column because an addend has three digits, the
 * operands written 5 | 0 | 0 under it, and the child writes 1 | 0 | 0 | 0 in the result row.
 */
export const ThousandAlgorithm: Story = {
  args: { config: addItem(500, 500, true) },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const digits = (row: number) =>
      [...root.querySelectorAll<HTMLElement>('.ni-btt__digit:not(.ni-btt__opsign)')]
        .filter((d) => d.style.gridRow === String(row))
        .map((d) => d.textContent);
    await expect(digits(2)).toEqual(['', '5', '0', '0']);
    await expect(digits(3)).toEqual(['', '5', '0', '0']);
    await expect(boxes(root)).toEqual(['', '', '', '']);
    await expect(within(root).getByRole('button', { name: 'Thousands' })).toHaveAttribute(
      'data-digit',
      'thousands',
    );
    await expectNoReveal(root, 1000);
    for (const el of controls(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(controls(root));
    await expectFits(canvasElement, root);
    await tapPlace(pending(root, 'hundreds'), columnPad(root, 'hundreds'));
    await settled(root);
    await typeKeys(root, '0001');
    await expect(boxes(root)).toEqual(['1', '0', '0', '0']);
    await expectFits(canvasElement, root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const response = {
      kind: 'state',
      value: { hundreds: 10, tens: 0, ones: 0, value: 1000 },
    };
    await expect(args.onResponse).toHaveBeenCalledWith(response);
    await expect(response).toEqual(
      expectedResponse(
        args.config as Config,
        [{ op: 'combine', args: { column: 'hundreds' } }],
        1000,
      ),
    );
    await expect(
      traceOf(args.onInteract)
        .map((e) => `${e.t}:${e.target}`)
        .slice(-4),
    ).toEqual(['tap:key-0', 'tap:key-0', 'tap:key-0', 'tap:key-1']);
  },
};

/** 500 + 500 with the algorithm in K: the four-place card and the K pad still fit, K-sized. */
export const ThousandAlgorithmK: Story = {
  globals: { ageMode: 'k' },
  args: { config: addItem(500, 500, true) },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(boxes(root)).toEqual(['', '', '', '']);
    await expectFits(canvasElement, root);
    for (const el of controls(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(controls(root));
    await tapPlace(pending(root, 'hundreds'), columnPad(root, 'hundreds'));
    await settled(root);
    await expectFits(canvasElement, root);
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/**
 * 1200 + 300 (twelve hundreds) on the algorithm, typed straight in: the start is
 * written across the places (1 | 2 | 0 | 0, not "12" in the hundreds box) and 1500 goes in. Five
 * places put the algorithm above the mat. Fifteen flats cannot be drawn at the one 20 px scale, so
 * this item steps the unit down (fit only is checked here).
 */
export const ThousandsWritten: Story = {
  args: {
    config: {
      ...addItem(0, 300, true),
      start: { hundreds: 12, tens: 0, ones: 0 },
    },
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const digits = (row: number) =>
      [...root.querySelectorAll<HTMLElement>('.ni-btt__digit:not(.ni-btt__opsign)')]
        .filter((d) => d.style.gridRow === String(row))
        .map((d) => d.textContent);
    // 4-digit + 3-digit: five places.
    await expect(digits(2)).toEqual(['', '1', '2', '0', '0']);
    await expect(digits(3)).toEqual(['', '', '3', '0', '0']);
    await expect(boxes(root)).toEqual(['', '', '', '', '']);
    await expectNoReveal(root, 1500);
    await expectFits(canvasElement, root, U_MIN);
    await tapPlace(pending(root, 'hundreds'), columnPad(root, 'hundreds'));
    await settled(root);
    await expectFits(canvasElement, root, U_MIN);
    await typeKeys(root, '0051');
    await expect(boxes(root)).toEqual(['', '1', '5', '0', '0']);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 15, tens: 0, ones: 0, value: 1500 },
    });
  },
};

/** 990 + 10 on the pad: 1000 goes in. */
export const ThousandPadCarry: Story = {
  args: { config: addItem(990, 10, false) },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await typeKeys(root, '1000');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith(
      expectedResponse(args.config as Config, [], 1000),
    );
  },
};

/**
 * No reveal from the layout: a 3-digit + 2-digit sum under 1000 (123 + 45) shows exactly as many
 * result boxes as one that reaches 1000 (990 + 10).
 */
export const BoxCountHidesCarry: Story = {
  args: { config: addItem(123, 45, true) },
  render: (args) => (
    <div style={{ width: 1200, maxWidth: 'none', flex: 'none' }}>
      <div data-item="below">{renderWidget(args)}</div>
      <div data-item="reaches">
        {renderWidget({ ...args, config: addItem(990, 10, true) as WidgetConfig })}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll(ROOT)).toHaveLength(2));
    const count = (which: string) =>
      canvasElement.querySelectorAll(`[data-item="${which}"] .ni-btt__box`).length;
    await expect(count('below')).toBe(4);
    await expect(count('reaches')).toBe(count('below'));
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

const backButton = (root: Element, c: string) =>
  root.querySelector<HTMLButtonElement>(`[data-back="${c}"]`);

/**
 * One take too many, put one back, then solve (PR #74 review round 1). On 42 − 15 the child
 * splits a ten and takes six ones by mistake: touching the ones in the nest puts one back (said
 * and traced like a take), by tap and by keyboard, and the item is solved in the same attempt.
 * With a piece picked up, a tap on the nest still takes it, wherever on the nest it lands.
 */
export const TakeTooManyPutBack: Story = {
  args: { config: take42minus15 },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(backButton(root, 'ones')).toBeNull();
    await userEvent.click(trade(root, 'tens', 'ones'));
    await settled(root);
    for (let i = 0; i < 6; i++) await tapPlace(grabItem(root, 'ones'), nest(root));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 6 });
    await expect(takenPieces(root, 'ones')).toBe(6);
    // The ones in the nest are one control: target-sized, named, and it puts one back.
    const back = backButton(root, 'ones') as HTMLButtonElement;
    await expect(back).toHaveAccessibleName('Put a one back');
    await expectTargetSize(back, 'g1-up');
    await userEvent.click(back);
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 7 });
    await expect(takenPieces(root, 'ones')).toBe(5);
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.btt.back.ones', undefined);
    // Keyboard: take one more, then Enter on the control puts it back.
    await tapPlace(grabItem(root, 'ones'), nest(root));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 6 });
    (backButton(root, 'ones') as HTMLButtonElement).focus();
    await userEvent.keyboard('{Enter}');
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 7 });
    // A ten picked up and dropped by a tap that lands on the taken ones: it is taken, none goes back.
    await userEvent.click(grabItem(root, 'tens'));
    await userEvent.click(backButton(root, 'ones') as HTMLButtonElement);
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 2, ones: 7 });
    await expect(takenPieces(root, 'tens')).toBe(1);
    await expect(takenPieces(root, 'ones')).toBe(5);
    await expectFits(canvasElement, root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 2, ones: 7 },
    });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.filter((e) => e === 'tap:back-ones')).toHaveLength(2);
    await expect(trace.at(-1)).toBe('tap:take');
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

const countController: WidgetDemo = createDemoController({ strict: true });

/**
 * A demo plays only what the engine would do (review round 2): a `take` whose count is not a
 * whole number within ±99 moves nothing, in either direction; −1 puts exactly one piece back.
 */
export const DemoTakeCountsAsTheEngine: Story = {
  args: { disabled: true, demo: countController, config: take42minus15 },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await countController.play({ op: 'trade', args: { from: 'tens', to: 'ones' } });
    await countController.play({ op: 'take', args: { column: 'ones', count: 6 } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 6 });
    await expect(takenPieces(root, 'ones')).toBe(6);
    // `null` is not a missing count: the model takes one piece only when there is no count.
    for (const count of [-100, -1.5, 100, 2.5, Number.NaN, '3', null]) {
      await countController.play({ op: 'take', args: { column: 'ones', count } });
      await expect(mat(root), String(count)).toEqual({ hundreds: 0, tens: 3, ones: 6 });
      await expect(takenPieces(root, 'ones'), String(count)).toBe(6);
    }
    await countController.play({ op: 'take', args: { column: 'ones', count: -1 } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 7 });
    await expect(takenPieces(root, 'ones')).toBe(5);
    // The model agrees on every one of those counts.
    const model = formatModel('base-ten-trade');
    if (!model) throw new Error('no base-ten-trade model');
    let s = model.initialState(take42minus15);
    s = model.apply(s, { op: 'trade', args: { from: 'tens', to: 'ones' } });
    s = model.apply(s, { op: 'take', args: { column: 'ones', count: 6 } });
    for (const count of [-100, -1.5, 100, 2.5, null]) {
      await expect(model.apply(s, { op: 'take', args: { column: 'ones', count } })).toBe(s);
    }
    // No count at all is one piece, in the model and in the demo.
    await expect(
      model.toResponse(model.apply(s, { op: 'take', args: { column: 'ones' } })),
    ).toEqual({
      kind: 'state',
      value: { hundreds: 0, tens: 3, ones: 5 },
    });
    await countController.play({ op: 'take', args: { column: 'ones' } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 6 });
  },
};

/**
 * Every kind in the nest at once, in K: the three put-back controls are each 80 px or more both
 * ways and 12 px or more apart, and each returns its own kind.
 */
export const PutBackEveryKindK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...take42minus15,
      start: { hundreds: 2, tens: 3, ones: 4 },
      operation: { op: '-', operand: { hundreds: 1, tens: 1, ones: 1 } },
    } satisfies Config,
  },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const c of ['hundreds', 'tens', 'ones']) {
      await tapPlace(grabItem(root, c), nest(root));
      await settled(root);
    }
    await expect(mat(root)).toEqual({ hundreds: 1, tens: 2, ones: 3 });
    const backs = ['hundreds', 'tens', 'ones'].map((c) => backButton(root, c) as HTMLButtonElement);
    for (const b of backs) await expectTargetSize(b, 'k');
    await expectTargetGaps(backs);
    // Nothing scrolls or sticks out (a K mat with flats draws a little under the 20 px unit).
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
    for (const c of ['ones', 'hundreds', 'tens']) {
      await userEvent.click(backButton(root, c) as HTMLButtonElement);
      await settled(root);
      await expect(backButton(root, c)).toBeNull();
    }
    await expect(mat(root)).toEqual({ hundreds: 2, tens: 3, ones: 4 });
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

/** The drawn piece of a column nearest the top of its pile (the one farthest from the nest). */
function topPiece(root: Element, c: string) {
  const all = [...root.querySelectorAll<HTMLElement>(`[data-col="${c}"] [data-piece^="${c}-"]`)];
  const top = all.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
  if (!top) throw new Error(`no ${c} piece`);
  return top;
}

let touchSeq = 900;
/**
 * A finger pressing at a screen point (on whatever is drawn there, as a real touch lands) and
 * sliding to another, then lifting.
 */
async function touchDragFrom(from: { x: number; y: number }, to: { x: number; y: number }) {
  const pointerId = ++touchSeq;
  const init = (x: number, y: number, buttons: number): PointerEventInit => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
  });
  const at = (x: number, y: number) => document.elementFromPoint(x, y) ?? document.body;
  at(from.x, from.y).dispatchEvent(new PointerEvent('pointerdown', init(from.x, from.y, 1)));
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    at(x, y).dispatchEvent(new PointerEvent('pointermove', init(x, y, 1)));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  at(to.x, to.y).dispatchEvent(new PointerEvent('pointerup', init(to.x, to.y, 0)));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

/**
 * Regression (PR #74 review): a piece drawn high in its column, dragged by its own picture and let
 * go just inside the nest's foot, lands in the nest. The drop test follows the piece the child
 * moves, not the middle of the whole column.
 */
export const TouchTakeFromTop: Story = {
  args: { config: take42minus15 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Twelve ones fill several rows, so the top one sits far above the column's middle.
    await userEvent.click(trade(root, 'tens', 'ones'));
    await settled(root);
    const piece = topPiece(root, 'ones');
    const from = center(piece);
    // The press lands on the column's grab item (the drawn pieces let presses through).
    await expect(document.elementFromPoint(from.x, from.y)).toBe(grabItem(root, 'ones'));
    // Far above the column's middle, so the old drop test (the column's centre) missed the nest.
    const body = q(root, '[data-col="ones"] .ni-btt__body').getBoundingClientRect();
    await expect(body.top + body.height / 2 - from.y).toBeGreaterThan(48);
    const target = nest(root).getBoundingClientRect();
    await touchDragFrom(from, { x: center(nest(root)).x, y: target.bottom - 12 });
    await settled(root);
    await expect(takenPieces(root, 'ones')).toBe(1);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 11 });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual(['tap:trade-tens-ones', 'drag:mat-ones-11', 'drop:take']);
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
    // A written digit sits in a solid box; only empty boxes are dashed.
    for (const b of root.querySelectorAll<HTMLElement>('.ni-btt__box')) {
      await expect(getComputedStyle(b).borderTopStyle).toBe('solid');
    }
    // The taken flat stands inside the nest's hollow, below its rim.
    const hollow = q(root, '.ni-btt__hollow').getBoundingClientRect();
    const flat = q(root, '[data-piece="taken-hundreds-0"]').getBoundingClientRect();
    await expect(flat.top).toBeGreaterThanOrEqual(hollow.top + 12);
    await expect(flat.left).toBeGreaterThanOrEqual(hollow.left + 12);
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
    await expectAcceptedStartLayout(root);
  },
};

/**
 * Pins the 3-flat subtraction start, an accepted exception (orchestrator decision
 * workflow_75b3aae9b27242c5b668ce48e7b0952b): with three 20 px flats and the inline pad, the
 * geometric minimum is a wide hundreds column (2 × 2 flats) beside narrower tens and ones, about
 * 436 / 124 / 140 px at 1280 × 800. The columns balance once a hundred is split. This keeps that
 * layout from drifting unnoticed.
 */
async function expectAcceptedStartLayout(root: HTMLElement) {
  // The three flats sit 2 × 2: two columns of flats, two rows.
  const flats = [...root.querySelectorAll('[data-col="hundreds"] [data-piece]')].map((p) =>
    p.getBoundingClientRect(),
  );
  await expect(flats).toHaveLength(3);
  await expect(new Set(flats.map((r) => Math.round(r.left))).size).toBe(2);
  await expect(new Set(flats.map((r) => Math.round(r.top))).size).toBe(2);
  // The unit is 20 px: a ones piece is 20 px, a flat 200.
  const one = q(root, '[data-col="ones"] [data-piece]').getBoundingClientRect();
  await expect(Math.round(one.width)).toBe(U);
  for (const r of flats) await expect(Math.round(r.width)).toBe(U * 10);
  const width = (c: string) => q(root, `[data-col="${c}"]`).getBoundingClientRect().width;
  const [h, t, o] = [width('hundreds'), width('tens'), width('ones')];
  // The hundreds column is the widest.
  await expect(h).toBeGreaterThan(t);
  await expect(h).toBeGreaterThan(o);
  // Tens and ones each hold their content (pieces, or the header's icon and word) with GUTTER
  // clear on both sides.
  for (const c of ['tens', 'ones']) {
    const col = q(root, `[data-col="${c}"]`);
    const parts = [
      ...col.querySelectorAll('[data-piece], .ni-btt__head .ni-btt__icon, .ni-btt__headword'),
    ].map((e) => e.getBoundingClientRect());
    const content = Math.max(...parts.map((r) => r.right)) - Math.min(...parts.map((r) => r.left));
    await expect(width(c), `${c} holds its content`).toBeGreaterThanOrEqual(content + 2 * GUTTER);
  }
  // Within ±10 % of the accepted 436 / 124 / 140.
  for (const [w, accepted] of [
    [h, 436],
    [t, 124],
    [o, 140],
  ] as const) {
    await expect(w).toBeGreaterThanOrEqual(accepted * 0.9);
    await expect(w).toBeLessThanOrEqual(accepted * 1.1);
  }
}

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
 * Regression (PR #74 review round 2): 900 − 900 with the algorithm and a typed answer (a zero
 * result). All nine flats go into the nest: they wrap into rows there, every one inside the
 * hollow and none overlapping, and the answer 0 is typed and checked.
 */
export const StressNineFlatsTaken: Story = {
  args: { config: takeAll(9, 0, 0) },
  play: async ({ canvasElement, args }) => {
    await playTakeAll(canvasElement, args, 'g1-up');
  },
};

/** K (bigger targets, pad and boxes, the algorithm above the mat): 900 − 900 still fits. */
export const StressNineFlatsTakenK: Story = {
  globals: { ageMode: 'k' },
  args: { config: takeAll(9, 0, 0) },
  play: async ({ canvasElement, args }) => {
    await playTakeAll(canvasElement, args, 'k');
  },
};

/**
 * K, 999 − 999: nine of every kind into the nest, one at a time; it fits after every take
 * (reduced motion, so the 27 takes land at once; the layout is the same).
 */
export const StressTakeAll999K: Story = {
  globals: { ageMode: 'k', motion: 'reduced' },
  args: { config: takeAll(9, 9, 9) },
  play: async ({ canvasElement, args }) => {
    await playTakeAll(canvasElement, args, 'k');
  },
};

/** K, 1200 − 1200 (twelve flats, four places): fits after every take. */
export const StressTakeAll1200K: Story = {
  globals: { ageMode: 'k' },
  args: { config: takeAll(12, 0, 0) },
  play: async ({ canvasElement, args }) => {
    await playTakeAll(canvasElement, args, 'k');
  },
};

/** The reviewer's K addition (PR #74 round 8): 1580 + 1 as 14 hundreds and 18 tens. */
const bigAddK: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 14, tens: 18, ones: 0 },
  operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 1 } },
  goal: 'compute',
  showAlgorithm: true,
  thenAsk: false,
};

/**
 * Regression (PR #74 round 8), K: 1580 + 1 with fourteen flats and eighteen rods on the mat, one
 * one waiting, and the five-place algorithm above the mat. The mat and the tray fit the tablet,
 * and every control, the narrow ones column's drop target included, is a K target 12 px clear of
 * its neighbours: an outer column's target runs closer to the mat's frame instead of widening it.
 */
export const StressBigAddK: Story = {
  globals: { ageMode: 'k' },
  args: { config: bigAddK },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(mat(root)).toEqual({ hundreds: 14, tens: 18, ones: 0 });
    await expectFits(canvasElement, root, U_MIN);
    // The mat and the tray (its waiting one) inside the widget.
    const box = root.getBoundingClientRect();
    for (const sel of ['.ni-btt__mat', '.ni-btt__tray', '.ni-btt__work']) {
      const r = q(root, sel).getBoundingClientRect();
      await expect(r.top).toBeGreaterThanOrEqual(box.top - 0.5);
      await expect(r.bottom, `${sel} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
    }
    for (const el of controls(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(controls(root));
    // The child adds the one; it still fits.
    await tapPlace(pending(root, 'ones'), columnPad(root, 'ones'));
    await settled(root);
    await expectFits(canvasElement, root, U_MIN);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 14, tens: 18, ones: 1 },
    });
  },
};

/** `h t o − h t o` with the algorithm and a typed answer: a take-away of everything (result 0). */
function takeAll(hundreds: number, tens: number, ones: number): Config {
  const n = { hundreds, tens, ones };
  return {
    format: 'base-ten-trade',
    start: n,
    operation: { op: '-', operand: { ...n } },
    goal: 'compute',
    showAlgorithm: true,
    thenAsk: true,
  };
}

/**
 * Takes every piece into the nest, one at a time (ones, tens, then hundreds), checking after each
 * take that the widget fits the tablet, every piece is inside its column or the nest's hollow, and
 * none overlap (expectFits). Then types 0 and checks. The flats keep one size, mat and nest.
 */
async function playTakeAll(
  canvasElement: HTMLElement,
  args: { config?: WidgetConfig; onResponse: unknown },
  age: 'k' | 'g1-up',
) {
  const config = args.config as Config;
  const root = await findWidget(canvasElement, ROOT);
  // Heavy items step the item's one unit down; flats stay at least 80 px (an 8 px unit).
  await expectFits(canvasElement, root, U_MIN);
  const flatW = (sel: string) => q(root, sel).getBoundingClientRect().width;
  await expect(flatW('[data-col="hundreds"] [data-piece]')).toBeGreaterThanOrEqual(U_MIN * 10);
  let onMat = 0;
  for (const c of ['ones', 'tens', 'hundreds'] as const) {
    // The flats' size on the mat, read once the layout has settled on the item's one scale (the
    // first frames lay out before the widget has measured its width).
    if (c === 'hundreds') {
      await settled(root);
      onMat = flatW('[data-col="hundreds"] [data-piece]');
    }
    for (let i = 0; i < config.start[c]; i++) {
      await tapPlace(grabItem(root, c), nest(root));
      await settled(root);
      // The same checks as expectFits, gathered without a step per element (27 takes).
      await expect(fitProblems(canvasElement, root), `after taking ${c} ${i + 1}`).toEqual([]);
    }
  }
  await expectFits(canvasElement, root, U_MIN);
  await expect(mat(root)).toEqual({ hundreds: 0, tens: 0, ones: 0 });
  await expect(takenPieces(root, 'hundreds')).toBe(config.start.hundreds);
  // The same size in the nest as on the mat (one scale).
  await expect(flatW('[data-piece="taken-hundreds-0"]')).toBe(onMat);
  for (const el of controls(root)) await expectTargetSize(el, age);
  await expectTargetGaps(controls(root));
  await userEvent.click(within(root).getByRole('button', { name: '0' }));
  await expect(boxes(root).at(-1)).toBe('0');
  await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
  await expect(args.onResponse).toHaveBeenCalledWith({
    kind: 'state',
    value: { hundreds: 0, tens: 0, ones: 0, value: 0 },
  });
  (document.activeElement as HTMLElement | null)?.blur();
}

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
/**
 * A sum that leaves nothing to do (1 + 0, no typed answer): the starting mat is the answer, so
 * Check is on from the start and submits it (PR #74 review round 1). With something to add, Check
 * still waits for the child's first move (AddStart).
 */
export const CheckWithNothingToAdd: Story = {
  args: {
    config: {
      format: 'base-ten-trade',
      start: { hundreds: 0, tens: 0, ones: 1 },
      goal: 'compute',
      operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 0 } },
      showAlgorithm: false,
      thenAsk: false,
    } satisfies Config,
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 0, ones: 1 });
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeEnabled();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 0, ones: 1 },
    });
  },
};

/** The same for a take-away of nothing: 30 − 0. */
export const CheckWithNothingToTake: Story = {
  args: {
    config: {
      format: 'base-ten-trade',
      start: { hundreds: 0, tens: 3, ones: 0 },
      goal: 'compute',
      operation: { op: '-', operand: { hundreds: 0, tens: 0, ones: 0 } },
      showAlgorithm: false,
      thenAsk: false,
    } satisfies Config,
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeEnabled();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { hundreds: 0, tens: 3, ones: 0 },
    });
  },
};

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

const threeFlats: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 3, tens: 1, ones: 5 },
  goal: 'regroup-to',
  regroupTarget: { hundreds: 2, tens: 11, ones: 5 },
  showAlgorithm: false,
  thenAsk: false,
};

/**
 * Stress with hundreds, at the start: three flats on the mat (regroup 3 hundreds, 1 ten, 5 ones
 * into 2 hundreds, 11 tens, 5 ones). At the one 20 px scale the flats sit 2 × 2, each countable.
 */
export const StressThreeFlats: Story = {
  args: { config: threeFlats },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(mat(root)).toEqual({ hundreds: 3, tens: 1, ones: 5 });
    await expectFits(canvasElement, root);
    for (const el of controls(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(controls(root));
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

/**
 * Evidence, stress after the split: a hundred split into ten tens, so 2 hundreds and 11 tens (in
 * one row) and 5 ones, at 20 px, with room around every piece; fits 1280 × 800, nothing overlaps.
 */
export const StressThreeFlatsSplit: Story = {
  args: { config: threeFlats },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(trade(root, 'hundreds', 'tens'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 2, tens: 11, ones: 5 });
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
    // Instant: no flying piece (ghost) is ever drawn, and the mat is right as soon as each op
    // resolves. Checked by the effect, never by the clock.
    let ghosts = 0;
    const watch = new MutationObserver(() => {
      ghosts += root.querySelectorAll('.ni-btt__ghost').length;
    });
    watch.observe(root, { childList: true, subtree: true });
    await reducedController.play({ op: 'trade', args: { from: 'tens', to: 'ones' } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 12 });
    await reducedController.play({ op: 'take', args: { column: 'ones', count: 5 } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 3, ones: 7 });
    watch.disconnect();
    await expect(ghosts).toBe(0);
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
    await expectHandClearOf(hand(), q(trade(root, 'ones', 'tens'), '.ni-btt__tradeicon svg'));
    await expectTradeIconSize(trade(root, 'ones', 'tens'), 62, 43);
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

/** The hand's box leaves a control's picture (a trade button's icon) fully visible. */
async function expectHandClearOf(hand: HTMLElement, picture: Element) {
  const h = (hand.querySelector('svg') ?? hand).getBoundingClientRect();
  const g = picture.getBoundingClientRect();
  const apart = h.right <= g.left || g.right <= h.left || h.bottom <= g.top || g.bottom <= h.top;
  await expect(apart, 'hand clear of the picture').toBe(true);
}

/** A trade button's icon keeps its own size (52 × 36 px, K 62 × 43) under the kit's glyph class. */
async function expectTradeIconSize(button: HTMLElement, w: number, h: number) {
  const r = q(button, '.ni-btt__tradeicon').getBoundingClientRect();
  await expect([Math.round(r.width), Math.round(r.height)]).toEqual([w, h]);
}

const algoInviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn with the algorithm and a typed answer (G1, captioned trade buttons): Pip's
 * up-pointing hand hangs below the split button (clear of its icon and word), the answer's box
 * being typed into, a named result box and the column to take from. One hand at a time.
 */
export const DemoInviteAlgorithm: Story = {
  args: {
    demo: algoInviteController,
    config: { ...take42minus15, showAlgorithm: true, thenAsk: true },
  },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => q(root, '.ni-hand');
    algoInviteController.invite({ op: 'trade', args: { from: 'tens', to: 'ones' } });
    await waitFor(() => expect(trade(root, 'tens', 'ones')).toHaveClass('ni-invite'));
    await expect(trade(root, 'tens', 'ones').querySelector('.ni-btn__label')).not.toBeNull();
    await expectTradeIconSize(trade(root, 'tens', 'ones'), 52, 36);
    await expectPointerOn(hand(), trade(root, 'tens', 'ones'), root);
    await expectHandClearOf(hand(), q(trade(root, 'tens', 'ones'), '.ni-btt__tradeicon svg'));
    algoInviteController.invite({ op: 'answer', args: { value: 27 } });
    await waitFor(() => expect(q(root, '[data-digit="ones"]')).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), q(root, '[data-digit="ones"]'), root);
    algoInviteController.invite({ op: 'write-digit', args: { column: 'tens', value: 2 } });
    await waitFor(() => expect(q(root, '[data-digit="tens"]')).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), q(root, '[data-digit="tens"]'), root);
    algoInviteController.invite({ op: 'take', args: { column: 'ones', count: 1 } });
    await waitFor(() =>
      expect(q(root, '[data-col="ones"] .ni-btt__body')).toHaveClass('ni-invite'),
    );
    await expectPointerOn(hand(), grabItem(root, 'ones'), root);
    await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
    // The invite ends: no hand, no ring, and the widget is back to its resting size.
    algoInviteController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expectFits(canvasElement, root);
  },
};

const swapController: WidgetDemo = createDemoController({ strict: true });
let nextItem: () => void = () => {};

/** The lesson host: moving on to the next item unmounts this widget and mounts a fresh one. */
function ItemSwapHarness(args: WidgetHostProps) {
  const [item, setItem] = useState(1);
  nextItem = () => setItem((n) => n + 1);
  return (
    <div style={{ width: 1200, maxWidth: 'none', flex: 'none' }}>
      <div className="story-widget-stage">
        <WidgetHost {...args} itemKey={item} demo={swapController} />
      </div>
    </div>
  );
}

/** Races a demo op against a timeout. */
const outcomeOf = (playing: Promise<void>, ms: number) =>
  Promise.race([
    playing.then(() => 'settled'),
    new Promise<string>((r) => setTimeout(() => r('hung'), ms)),
  ]);

/**
 * The host moves on while Pip is mid-op: the widget unmounts and the op's promise settles at once,
 * both before a take commits (same tick) and in the middle of a trade's animation.
 */
export const DemoSettlesOnUnmount: Story = {
  args: { disabled: true, config: take42minus15 },
  render: (args) => <ItemSwapHarness {...args} />,
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    const first = await findWidget(canvasElement, ROOT);
    const take = swapController.play({ op: 'take', args: { column: 'ones', count: 2 } });
    nextItem(); // same tick: the widget unmounts before the take commits
    await expect(await outcomeOf(take, 2500)).toBe('settled');
    // Settled by the unmount: the old item is gone and its take never landed anywhere.
    await expect(first.isConnected).toBe(false);
    // Mid-animation: the rod is cracking into ones when the host moves on.
    let root = await findWidget(canvasElement, ROOT);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 2 });
    const split = swapController.play({ op: 'trade', args: { from: 'tens', to: 'ones' } });
    await waitFor(() => expect(root.querySelector('.ni-btt__ghost')).not.toBeNull());
    const second = root;
    nextItem();
    await expect(await outcomeOf(split, 2500)).toBe('settled');
    await expect(second.isConnected).toBe(false);
    // The next item starts fresh, bound to the same controller.
    root = await findWidget(canvasElement, ROOT);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 2 });
    await swapController.play({ op: 'take', args: { column: 'ones', count: 1 } });
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 4, ones: 1 });
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

// ---------- the Practice Pier's rooms (#13): 858 × 358 at 960 × 600, 1178 × 558 at 1280 × 800 ----------

/** PV.01.t4 at its fullest (n = 99): 8 tens and 19 ones to regroup into 9 tens and 9 ones. */
const pierRegroup99: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 0, tens: 8, ones: 19 },
  goal: 'regroup-to',
  regroupTarget: { hundreds: 0, tens: 9, ones: 9 },
  showAlgorithm: false,
  thenAsk: false,
};
/** PV.09.t3 at its fullest (n = 49): split a ten, 4 tens 9 ones into 3 tens 19 ones. */
const pierSplit49: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 0, tens: 4, ones: 9 },
  goal: 'regroup-to',
  regroupTarget: { hundreds: 0, tens: 3, ones: 19 },
  showAlgorithm: false,
  thenAsk: false,
};
/** MDA.08.t1 as generated: 69 + 8 with a trade, then the answer on the pad. */
const pierAdd: Config = {
  format: 'base-ten-trade',
  start: { hundreds: 0, tens: 6, ones: 9 },
  operation: { op: '+', operand: { hundreds: 0, tens: 0, ones: 8 } },
  goal: 'compute',
  showAlgorithm: false,
  thenAsk: true,
};

const PIER_ACTIONS = '.ni-pad__key, .ni-btn.ni-tone-sun, .ni-btt__trade';
const unitOf = (root: HTMLElement) =>
  (root.querySelector('.ni-btt__mat [data-piece^="ones-"]') as HTMLElement).getBoundingClientRect()
    .width;

const pierTrade = (config: Config, room: PierRoom, arrange: 'usual' | 'in-side'): Story => ({
  args: { config, tier: 'pictorial' },
  render: inRoom(room),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsRoom(canvasElement, root, 'g1-up', PIER_ACTIONS);
    await expect(root).toHaveAttribute('data-arrange', arrange);
    // Pieces a child can count (the floor is 18 px), none overlapping.
    await expectCountable(root, 18);
  },
});

/**
 * 960 × 600, regroup: the goal chips stand in a column in the side panel with Check under them,
 * so the mat keeps the room's height and its 19 to 20 px pieces. Same task: group ten ones,
 * check, one response.
 */
export const PierSmallRegroup: Story = {
  ...pierTrade(pierRegroup99, 'small', 'in-side'),
  play: async (ctx) => {
    await pierTrade(pierRegroup99, 'small', 'in-side').play?.(ctx);
    const root = await findWidget(ctx.canvasElement, ROOT);
    await userEvent.click(trade(root, 'ones', 'tens'));
    await settled(root);
    await expect(mat(root)).toEqual({ hundreds: 0, tens: 9, ones: 9 });
    await expectFitsRoom(ctx.canvasElement, root, 'g1-up', PIER_ACTIONS);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(ctx.args.onResponse).toHaveBeenCalledTimes(1);
  },
};
export const PierSmallSplit: Story = pierTrade(pierSplit49, 'small', 'in-side');
export const PierTabletRegroup: Story = pierTrade(pierRegroup99, 'tablet', 'usual');
export const PierTabletSplit: Story = pierTrade(pierSplit49, 'tablet', 'usual');
/** 1280 × 800, add with a trade: the equation over the mat, the tray under it, the pad beside. */
export const PierTabletAdd: Story = {
  ...pierTrade(pierAdd, 'tablet', 'usual'),
  args: { config: pierAdd, tier: 'concrete' },
};
// Rooms between the two viewports, one story each.
export const PierQuarterRegroup: Story = pierTrade(pierRegroup99, 'quarter', 'in-side');
export const PierHalfRegroup: Story = pierTrade(pierRegroup99, 'half', 'usual');
export const PierThreeQuartersRegroup: Story = pierTrade(pierRegroup99, 'threeQuarters', 'usual');

/**
 * Add with a trade where the room is too small for it at countable sizes (960 × 600: the
 * three-column mat is 645 × 256 px at 18 px pieces, with the tray, the equation, the pad and
 * Check to place): the widget keeps its 20 px pieces and its design height, and the room scrolls
 * (the pier fit check lists MDA.08.t1 at this viewport). It never squeezes the pieces.
 */
const pierAddIn = (room: PierRoom): Story => ({
  args: { config: pierAdd, tier: 'concrete' },
  render: inRoom(room),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await stableLayout(root);
    if (root.dataset.arrange === 'tall') {
      await expect(unitOf(root)).toBe(20);
      await expectCountable(root);
    } else {
      await expectFitsRoom(canvasElement, root, 'g1-up', PIER_ACTIONS);
      await expectCountable(root, 18);
    }
  },
});
export const PierSmallAddScrolls: Story = {
  ...pierAddIn('small'),
  play: async (ctx) => {
    await pierAddIn('small').play?.(ctx);
    const root = await findWidget(ctx.canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-arrange', 'tall');
  },
};
export const PierQuarterAdd: Story = pierAddIn('quarter');
export const PierHalfAdd: Story = pierAddIn('half');
export const PierThreeQuartersAdd: Story = pierAddIn('threeQuarters');

const pierResized = (config: Config, from: PierRoom, to: PierRoom): Story => ({
  args: { config, tier: 'pictorial' },
  render: inRoom(from),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await stableLayout(root);
    const before = root.dataset.arrange;
    await expect(before).toBeDefined();
    resizeRoom(canvasElement, to);
    await stableLayout(root);
    await expect(areaBox(canvasElement).clientHeight).toBe(to === 'small' ? 358 : 558);
    await expect(root.dataset.arrange).toBe(before);
  },
});
/**
 * Where the problem card goes is chosen in the first room measured for the item: a resize while
 * the item is on screen (either way) re-sizes the mat and moves nothing to another place.
 */
export const PierResizeRegroupGrows: Story = pierResized(pierRegroup99, 'small', 'tablet');
export const PierResizeRegroupShrinks: Story = pierResized(pierRegroup99, 'tablet', 'small');
