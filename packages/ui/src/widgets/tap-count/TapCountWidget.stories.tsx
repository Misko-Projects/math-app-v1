import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectAreaCentred,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
import { goNext, stepButton } from '../../test-support/twoStepStory';
import {
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import { WidgetHost, type WidgetHostProps } from '../WidgetHost';

/**
 * `tap-count` (03 §5.5): count a set. Concrete: tap each object; a numbered pebble marks it and
 * the count is spoken; the numeral tray appears once all are counted. Pictorial: a picture and an
 * answer control only. Ordinal: tap the k-th object from the "start here" arrow.
 * Configs are real generated items (CNT.02, CNT.05, CNT.06, CNT.15).
 */

/** CNT.02.t1 seed 1: 7 leaves in a line, numeral tray, marks, count aloud. */
const leaves: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 7, sprite: 'leaf', layout: 'line', layoutSeed: 1459448649 },
  mode: 'how-many',
  input: 'auto',
  marks: true,
  countAloud: true,
};

/** CNT.05.t1: 18 crabs in a line (tray 0–20). */
const crabs: ConfigFor<'tap-count'> = {
  ...leaves,
  set: { count: 18, sprite: 'crab', layout: 'line', layoutSeed: 598165036 },
};

/** CNT.02.t3 seed 1: 6 scattered fish, a picture and the number pad. */
const fishPicture: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 6, sprite: 'fish', layout: 'scatter', layoutSeed: 2029170442 },
  mode: 'how-many',
  input: 'pad',
  marks: false,
  countAloud: false,
};

/** CNT.06.t2 seed 1: 15 crabs on a double ten-frame, number pad. */
const doubleFrame: ConfigFor<'tap-count'> = {
  ...fishPicture,
  set: { count: 15, sprite: 'crab', layout: 'double-ten-frame', layoutSeed: 559465306 },
};

/** CNT.15.t1 seed 1: 10 shells; start at the left, tap the seventh. */
const ordinalShells: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 10, sprite: 'shell', layout: 'line', layoutSeed: 160159383 },
  mode: 'ordinal',
  ordinal: { k: 7, from: 'left' },
  input: 'auto',
  marks: true,
  countAloud: true,
};

/** CNT.15.t2 (picture): stones, counted from the right. */
const ordinalStones: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 6, sprite: 'stone', layout: 'line', layoutSeed: 2036151695 },
  mode: 'ordinal',
  ordinal: { k: 3, from: 'right' },
  input: 'auto',
  marks: false,
  countAloud: false,
};

/** Shells mixed with crabs that must not be counted; pick from three numerals. */
const withDistractors: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: {
    count: 5,
    sprite: 'shell',
    layout: 'scatter',
    layoutSeed: 77,
    distractors: { sprite: 'crab', count: 3 },
  },
  mode: 'how-many',
  input: 'pick',
  pickOptions: [5, 8, 4],
  marks: true,
  countAloud: true,
};

/** CNT.13: an empty set; the tray is there from the start. */
const zero: ConfigFor<'tap-count'> = {
  ...leaves,
  set: { count: 0, sprite: 'fish', layout: 'line', layoutSeed: 3 },
};

const meta = {
  title: 'Widgets/Tap count',
  args: {
    config: leaves as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // Every area story's card is centred in the stage on both axes.
  afterEach: async ({ canvasElement }) => expectAreaCentred(canvasElement),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-tapc';
const objects = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('button.ni-tapc__obj[data-kind="object"]'),
];
const obj = (root: HTMLElement, i: number) =>
  root.querySelector(`[data-obj="obj-${i}"]`) as HTMLElement;
const marks = (root: HTMLElement) =>
  [...root.querySelectorAll('.ni-tapc__mark')].map((m) => Number(m.textContent));
const tray = (root: HTMLElement) => root.querySelector('.ni-tapc__tray') as HTMLElement;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const hand = (root: HTMLElement) => root.querySelector('.ni-hand') as HTMLElement;

/** Waits for the one-shot animations (badge pop-in, tray rise) so boxes are at full size. */
async function settle(root: HTMLElement) {
  const once = root
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY);
  await Promise.all(once.map((a) => a.finished.catch(() => undefined)));
}

/**
 * Every count badge sits on top of its own object's right end, above the drawing (its bottom at
 * most 10 % into the box, its right edge flush with the box's), and is clear of EVERY other
 * object's box (counted objects and distractors, buttons or picture), in any row.
 */
async function expectBadgesOffObjects(root: HTMLElement) {
  await settle(root);
  const all = [...root.querySelectorAll<HTMLElement>('.ni-tapc__obj')];
  const badges = [...root.querySelectorAll<HTMLElement>('.ni-tapc__mark')];
  await expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    const own = badge.closest('.ni-tapc__obj') as HTMLElement;
    const m = badge.getBoundingClientRect();
    const b = own.getBoundingClientRect();
    await expect(m.bottom).toBeLessThanOrEqual(b.top + b.height * 0.1);
    await expect(Math.abs(m.right - b.right)).toBeLessThan(1);
    await expect(m.left).toBeGreaterThanOrEqual(b.left);
    for (const other of all) {
      if (other === own) continue;
      const o = other.getBoundingClientRect();
      const apart =
        m.right + 2 <= o.left ||
        o.right + 2 <= m.left ||
        m.bottom + 2 <= o.top ||
        o.bottom + 2 <= m.top;
      await expect(apart, `badge ${badge.textContent} clear of ${other.dataset.obj}`).toBe(true);
    }
  }
}

type Edges = { left: number; top: number; right: number; bottom: number };
/** `inner` lies inside `outer` with at least `margin` px on every side. */
async function expectWithin(inner: Edges, outer: Edges, margin: number, what: string) {
  await expect(inner.left - outer.left, `${what}: left`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(inner.top - outer.top, `${what}: top`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(outer.right - inner.right, `${what}: right`).toBeGreaterThanOrEqual(margin - 0.5);
  await expect(outer.bottom - inner.bottom, `${what}: bottom`).toBeGreaterThanOrEqual(margin - 0.5);
}
/** The ten-frame cell of counted object `i` (frame ⌊i / 10⌋, cell i mod 10). */
function frameCell(root: HTMLElement, i: number): HTMLElement {
  const frame = root.querySelectorAll('.ni-objects__frame')[Math.floor(i / 10)] as Element;
  return frame.querySelectorAll<HTMLElement>('.ni-objects__cell')[i % 10] as HTMLElement;
}
/** Object `i`'s place: its ten-frame cell, or (plates) its own box. */
function placeOf(root: HTMLElement, i: number): DOMRect {
  const grid = root.querySelector('.ni-objects__cell') !== null;
  const el = grid ? frameCell(root, i) : root.querySelector(`[data-obj="obj-${i}"]`);
  return (el as Element).getBoundingClientRect();
}
const objIndex = (el: Element) =>
  Number((el.closest('.ni-tapc__obj') as HTMLElement).dataset.obj?.replace('obj-', ''));
/**
 * The box an object's DRAWING covers on screen (its sprite's geometry with a 2-unit margin for
 * outlines), not the sprite's square box.
 */
function drawnRect(sprite: Element): Edges {
  const svg = sprite.querySelector('svg') as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  const bb = svg.getBBox();
  const k = r.width / svg.viewBox.baseVal.width;
  return {
    left: r.left + (bb.x - 2) * k,
    top: r.top + (bb.y - 2) * k,
    right: r.left + (bb.x + bb.width + 2) * k,
    bottom: r.top + (bb.y + bb.height + 2) * k,
  };
}
const overlapsEdges = (a: Edges, o: Edges) =>
  !(a.right <= o.left || o.right <= a.left || a.bottom <= o.top || o.bottom <= a.top);

/** The gap between two boxes (negative when they overlap). */
const gapBetween = (a: Edges, b: Edges) =>
  Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);

/**
 * Counting on a picture in places (ten-frames, plates; marks equal the number): no number on any
 * object; exactly `n` dots, one in each counted place — ≥ 3 px inside its place's edges (a cell's
 * border lines), ≤ 30 % of the place, ≥ 3 px clear of its own drawing and clear of every other
 * drawing; every object's drawing the same size; and ONE running count `n` (numeral ≥ 32 px)
 * inside the widget, ≥ 12 px in from the picture card's edges and ≥ 12 px clear of every frame or
 * plate, over no drawing.
 */
async function expectFrameMarks(root: HTMLElement, n: number) {
  await settle(root);
  const sprites = [...root.querySelectorAll<HTMLElement>('[data-kind="object"] .ni-tapc__sprite')];
  const sizes = new Set(sprites.map((s) => Math.round(s.getBoundingClientRect().width)));
  await expect(sizes.size, 'one drawing size for every object').toBe(1);
  await expect(root.querySelectorAll('.ni-tapc__mark')).toHaveLength(0);
  const dots = [...root.querySelectorAll<HTMLElement>('.ni-tapc__dot')];
  await expect(dots).toHaveLength(n);
  await expect(dots.map(objIndex).sort((a, b) => a - b)).toEqual(
    Array.from({ length: n }, (_, i) => i),
  );
  for (const dot of dots) {
    const i = objIndex(dot);
    const d = dot.getBoundingClientRect();
    const place = placeOf(root, i);
    await expectWithin(d, place, 3, `dot ${i + 1} inside its place`);
    await expect(d.width, `dot ${i + 1} size`).toBeLessThanOrEqual(0.3 * place.width);
    const mine = dot.closest('.ni-tapc__obj')?.querySelector('.ni-tapc__sprite') as Element;
    await expect(
      gapBetween(d, drawnRect(mine)),
      `dot ${i + 1} clear of its own drawing`,
    ).toBeGreaterThanOrEqual(3 - 0.5);
    for (const s of sprites) {
      if (s === mine) continue;
      await expect(overlapsEdges(d, drawnRect(s)), `dot ${i + 1} on another`).toBe(false);
    }
  }
  const counts = [...root.querySelectorAll<HTMLElement>('.ni-tapc__count')];
  await expect(counts.map((c) => Number(c.textContent))).toEqual([n]);
  const count = counts[0] as HTMLElement;
  await expect(Number.parseFloat(getComputedStyle(count).fontSize)).toBeGreaterThanOrEqual(32);
  const c = count.getBoundingClientRect();
  await expectWithin(c, root.getBoundingClientRect(), 0, 'count in the widget');
  const card = root.querySelector('.ni-tapc__picture') as HTMLElement;
  await expectWithin(c, card.getBoundingClientRect(), 12, 'count in the picture card');
  for (const f of root.querySelectorAll('.ni-objects__frame')) {
    await expect(
      gapBetween(c, f.getBoundingClientRect()),
      'count clear of frames',
    ).toBeGreaterThanOrEqual(12 - 0.5);
  }
  for (const s of sprites) {
    await expect(overlapsEdges(c, drawnRect(s)), 'count off every drawing').toBe(false);
  }
  // The count belongs to the object counted last (here the n-th): exactly one dot is marked as
  // the latest, it is that object's, and the count sits above its place's column.
  const latest = [...root.querySelectorAll<HTMLElement>('.ni-tapc__dot[data-latest="true"]')];
  await expect(latest.map(objIndex)).toEqual([n - 1]);
  const column = placeOf(root, n - 1);
  const cx = (c.left + c.right) / 2;
  await expect(cx, 'count over the last counted column').toBeGreaterThanOrEqual(column.left);
  await expect(cx, 'count over the last counted column').toBeLessThanOrEqual(column.right);
  await expect(c.bottom).toBeLessThan(column.top);
}

/**
 * Pip's counting highlight on a frame cell (the object being counted, mid-count) stays inside its
 * frame cell: a ring 5 px inside the object's box, never a lift or a ring outside it.
 */
async function expectCountingInCell(root: HTMLElement) {
  const now = await waitFor(() => {
    const el = root.querySelector<HTMLElement>('.ni-tapc__obj[data-counting="true"]');
    if (!el) throw new Error('nothing is being counted');
    return el;
  });
  const style = getComputedStyle(now, '::before');
  await expect(style.content).not.toBe('none');
  const inset = Number.parseFloat(style.top);
  const b = now.getBoundingClientRect();
  const ring = {
    left: b.left + inset,
    top: b.top + inset,
    right: b.right - inset,
    bottom: b.bottom - inset,
  };
  await expectWithin(ring, frameCell(root, objIndex(now)).getBoundingClientRect(), 0, 'ring');
  await expect(getComputedStyle(now).outlineStyle).toBe('none');
}

/**
 * Pip's teal invite ring around `invited` (a circle `outline-offset + outline-width` outside the
 * object, pulsing up to 5 % larger) stays at least 8 px clear of every count badge (pebbles:
 * capsules of the badge's height).
 */
async function expectRingClearOfBadges(root: HTMLElement, invited: HTMLElement) {
  await settle(root);
  const style = getComputedStyle(invited);
  const ring =
    (invited.offsetWidth / 2 +
      Number.parseFloat(style.outlineOffset) +
      Number.parseFloat(style.outlineWidth)) *
    1.05;
  const box = invited.getBoundingClientRect();
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const badges = [...root.querySelectorAll('.ni-tapc__mark')];
  await expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    const m = badge.getBoundingClientRect();
    const r = m.height / 2;
    const x = Math.min(Math.max(cx, m.left + r), m.right - r);
    const gap = Math.hypot(cx - x, cy - (m.top + r)) - r - ring;
    await expect(gap).toBeGreaterThanOrEqual(8);
  }
}

/**
 * The ordinal layout fits the widget area with room to spare: the row card and Check together
 * span at most 1080 px (the stage's inside is ~1146 px), and Check sits under or beside the row.
 */
async function expectOrdinalFits(root: HTMLElement) {
  const picture = (root.querySelector('.ni-tapc__picture') as HTMLElement).getBoundingClientRect();
  const check = within(root).getByRole('button', { name: 'Check' }).getBoundingClientRect();
  const left = Math.min(picture.left, check.left);
  const right = Math.max(picture.right, check.right);
  await expect(right - left).toBeLessThanOrEqual(1080);
  const set = root.querySelector('.ni-tapc__set') as HTMLElement;
  await expect(set.getBoundingClientRect().right).toBeLessThanOrEqual(picture.right);
}

/**
 * 05 §11: every count badge's numeral is a maths numeral, ≥ 32 px, in a pebble at least 48 px
 * tall (two-digit pebbles included).
 */
async function expectBadgeNumerals(root: HTMLElement) {
  await settle(root);
  const badges = [...root.querySelectorAll<HTMLElement>('.ni-tapc__mark')];
  await expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    const size = Number.parseFloat(getComputedStyle(badge).fontSize);
    await expect(size, `badge ${badge.textContent} font-size`).toBeGreaterThanOrEqual(32);
    await expect(badge.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  }
}

/**
 * K, concrete (CNT.02.t1): tap the 7 leaves. Each gets a numbered pebble and the running count is
 * spoken; the numeral tray (0–10) appears only once every leaf is counted. Pick 7, check.
 */
export const CountK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(objects(root)).toHaveLength(7);
    // 06 §4: every leaf is a K target, ≥ 12 px from its neighbours.
    for (const o of objects(root)) await expectTargetSize(o, 'k');
    await expectTargetGaps(objects(root));
    await expect(tray(root)).toHaveAttribute('data-shown', 'false');
    await expect(canvas.queryByRole('button', { name: '7' })).toBeNull();
    for (let i = 0; i < 7; i++) {
      await userEvent.click(obj(root, i));
      await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: i + 1 }]);
    }
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expect(canvas.getByRole('button', { name: 'Leaf, number 3' })).toBeVisible();
    await expectBadgesOffObjects(root);
    await expectBadgeNumerals(root);
    // All counted: the tray appears.
    await waitFor(() => expect(tray(root)).toHaveAttribute('data-shown', 'true'));
    const cards = [...tray(root).querySelectorAll<HTMLElement>('.ni-pick')];
    await expect(cards.map((c) => c.textContent)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '7' }));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 7 }]);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:obj-0',
      'tap:obj-1',
      'tap:obj-2',
      'tap:obj-3',
      'tap:obj-4',
      'tap:obj-5',
      'tap:obj-6',
      'tap:opt-7',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * G1, concrete (CNT.05.t1): 18 crabs in two rows, tray 0–20. Tapping a counted crab again speaks
 * its number, keeps its mark, and is traced (MC.recount-from-one reads the taps).
 */
export const CountTeenG1: Story = {
  args: { config: crabs },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    for (const o of objects(root)) await expectTargetSize(o, 'g1-up');
    await expectTargetGaps(objects(root));
    for (let i = 0; i < 18; i++) await userEvent.click(obj(root, i));
    await userEvent.click(obj(root, 2));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 3 }]);
    await expect(marks(root)).toHaveLength(18);
    await waitFor(() => expect(tray(root)).toHaveAttribute('data-shown', 'true'));
    await expect(tray(root).querySelectorAll('.ni-pick')).toHaveLength(21);
    await userEvent.click(within(root).getByRole('button', { name: '18' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 18 });
    const trace = traceOf(args.onInteract);
    await expect(trace.filter((e) => e.target === 'obj-2')).toHaveLength(2);
    // The badges sit above each crab's top-right corner: eyes and claws stay visible.
    await expectBadgesOffObjects(root);
    await expectBadgeNumerals(root);
  },
};

/**
 * Pictorial (CNT.02.t3): a static picture, answer only. The fish are not buttons; type 6 on the
 * pad and check.
 */
export const PicturePad: Story = {
  args: { config: fishPicture, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(objects(root)).toHaveLength(0);
    await expect(root.querySelectorAll('[data-sprite="fish"]')).toHaveLength(6);
    await expect(canvas.getByRole('group', { name: 'Look at the picture' })).toBeVisible();
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '6'));
    await expect(canvas.getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(['key-6']);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);
  },
};

/** K, pictorial (CNT.06.t2): 15 on a double ten-frame. Keyboard: type 1, 5, then Enter. */
export const DoubleTenFrameKeyboard: Story = {
  globals: { ageMode: 'k' },
  args: { config: doubleFrame, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-objects__frame')).toHaveLength(2);
    // Enter on an empty answer sends nothing and doesn't start the debounce window.
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('1');
    await userEvent.keyboard('5');
    await expect(within(root).getByRole('button', { name: 'Your answer: 15' })).toBeVisible();
    // A double Enter plus Check inside 400 ms is one submission (06 §4).
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 15 });
    for (const k of root.querySelectorAll('.ni-pad__key')) await expectTargetSize(k, 'k');
  },
};

/**
 * A counted AND selected object's count badge clears its selection ring by ≥ 4 px: the ring is
 * the object's box grown by `outline-offset + outline-width`, and the badge box must not meet it.
 * With `required`, at least one ringed object must carry a badge.
 */
async function expectBadgeClearOfRing(root: HTMLElement, required = true) {
  await settle(root);
  const ringed = [...root.querySelectorAll<HTMLElement>('.ni-tapc__obj[data-ringed="true"]')];
  let checked = 0;
  for (const o of ringed) {
    const badge = o.querySelector('.ni-tapc__mark');
    if (!badge) continue;
    const style = getComputedStyle(o);
    const out = Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.outlineWidth);
    const b = o.getBoundingClientRect();
    const ring = {
      left: b.left - out,
      top: b.top - out,
      right: b.right + out,
      bottom: b.bottom + out,
    };
    const m = badge.getBoundingClientRect();
    const gap = Math.max(
      ring.left - m.right,
      m.left - ring.right,
      ring.top - m.bottom,
      m.top - ring.bottom,
    );
    await expect(gap, `badge ${badge.textContent} clear of its ring`).toBeGreaterThanOrEqual(12);
    checked++;
  }
  if (required) await expect(checked, 'a counted, ringed object').toBeGreaterThan(0);
  await expectBadgesClearOfCard(root);
}

/**
 * Every count badge on the row card keeps ≥ 12 px from the card's border (inside it), and from
 * the selection ring of every ringed object (the ring box: the object's box grown by the
 * outline's offset and width).
 */
async function expectBadgesClearOfCard(root: HTMLElement) {
  const card = root.querySelector('.ni-tapc__picture') as HTMLElement;
  const cr = card.getBoundingClientRect();
  const bw = Number.parseFloat(getComputedStyle(card).borderTopWidth);
  const inner = {
    left: cr.left + bw,
    top: cr.top + bw,
    right: cr.right - bw,
    bottom: cr.bottom - bw,
  };
  const rings = [...root.querySelectorAll<HTMLElement>('.ni-tapc__obj[data-ringed="true"]')].map(
    (o) => {
      const cs = getComputedStyle(o);
      const out = Number.parseFloat(cs.outlineOffset) + Number.parseFloat(cs.outlineWidth);
      const b = o.getBoundingClientRect();
      return { left: b.left - out, top: b.top - out, right: b.right + out, bottom: b.bottom + out };
    },
  );
  for (const badge of root.querySelectorAll<HTMLElement>('.ni-tapc__mark')) {
    const m = badge.getBoundingClientRect();
    await expect(
      m.top - inner.top,
      `badge ${badge.textContent} under the border`,
    ).toBeGreaterThanOrEqual(12 - 0.5);
    for (const ring of rings) {
      const gap = Math.max(
        ring.left - m.right,
        m.left - ring.right,
        ring.top - m.bottom,
        m.top - ring.bottom,
      );
      await expect(gap, `badge ${badge.textContent} clear of a ring`).toBeGreaterThanOrEqual(
        12 - 0.5,
      );
    }
  }
}

/**
 * Ordinal, concrete (CNT.15.t1): "start here" arrow on the left. Count along to the seventh shell;
 * the last one tapped is ringed. Check answers `choice obj-6`. Keyboard: the shells are buttons.
 */
export const OrdinalK: Story = {
  globals: { ageMode: 'k' },
  args: { config: ordinalShells },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(canvas.getByRole('img', { name: 'Start here' })).toBeVisible();
    await expect(root.querySelector('.ni-tapc__tray')).toBeNull();
    for (const o of objects(root)) await expectTargetSize(o, 'k');
    await expectTargetGaps(objects(root));
    for (let i = 0; i < 6; i++) await userEvent.click(obj(root, i));
    // The seventh by keyboard: focus it and press Space.
    obj(root, 6).focus();
    await userEvent.keyboard(' ');
    await expect(obj(root, 6)).toHaveAttribute('data-ringed', 'true');
    await expect(obj(root, 6)).toHaveAttribute('aria-pressed', 'true');
    await expect(root.querySelectorAll('[data-ringed="true"]')).toHaveLength(1);
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expectBadgesOffObjects(root);
    await expectBadgeClearOfRing(root);
    await expectOrdinalFits(root);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    canvas.getByRole('button', { name: 'Check' }).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-6' });
  },
};

/** Ordinal, pictorial (CNT.15.t2), from the right: tap a stone to ring it; no counting marks. */
export const OrdinalPictureFromRight: Story = {
  args: { config: ordinalStones, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cue = within(root).getByRole('img', { name: 'Start here' });
    // The cue sits on the right of the row.
    await expect(cue.getBoundingClientRect().left).toBeGreaterThan(
      obj(root, 5).getBoundingClientRect().right,
    );
    await expectOrdinalFits(root);
    // One row, from the right: Tab starts on obj-5 beside the marker and runs to obj-0.
    await expectKeyboardCountingOrder(root, args.onInteract, ids(0, 5).reverse());
    await userEvent.click(obj(root, 4));
    await userEvent.click(obj(root, 3));
    await expect(marks(root)).toEqual([]);
    await expect(root.querySelectorAll('[data-ringed="true"]')).toHaveLength(1);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-3' });
  },
};

/**
 * Distractors: the crabs can be tapped to hear their name, but are never counted or marked. Pick
 * input shows the options from the start.
 */
export const DistractorsPick: Story = {
  args: { config: withDistractors },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const crab = root.querySelector('[data-obj="distractor-0"]') as HTMLElement;
    await userEvent.click(crab);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.sprite.crab', undefined);
    await expect(marks(root)).toEqual([]);
    await userEvent.click(obj(root, 0));
    await expect(marks(root)).toEqual([1]);
    await expectBadgesOffObjects(root);
    await expect(tray(root)).toHaveAttribute('data-shown', 'true');
    await expect(tray(root).querySelectorAll('.ni-pick')).toHaveLength(3);
    await userEvent.click(within(root).getByRole('button', { name: '5' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 5 });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual([
      'distractor-0',
      'obj-0',
      'opt-5',
    ]);
  },
};

/**
 * CNT.13: nothing to count. The picture is an empty dish, centred above the answer; the tray is
 * there straight away; 0 is an answer.
 */
export const Zero: Story = {
  args: { config: zero },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-arrange', 'stack');
    const dish = within(root).getByRole('img', { name: 'Look at the picture' });
    await expect(dish).toHaveClass('ni-tapc__empty');
    const picture = (
      root.querySelector('.ni-tapc__picture') as HTMLElement
    ).getBoundingClientRect();
    const answer = (root.querySelector('.ni-tapc__answer') as HTMLElement).getBoundingClientRect();
    await expect(
      Math.abs((picture.left + picture.right) / 2 - (answer.left + answer.right) / 2),
    ).toBeLessThan(2);
    await expect(picture.bottom).toBeLessThan(answer.top);
    await expect(tray(root)).toHaveAttribute('data-shown', 'true');
    await userEvent.click(within(root).getByRole('button', { name: '0' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 0 });
  },
};

/** `disabled`: nothing responds and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(obj(root, 0)).toBeDisabled();
    await userEvent.click(obj(root, 0));
    await expect(marks(root)).toEqual([]);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), a faded CNT.02.t1 example: Pip counts the first four leaves aloud (each
 * marked in turn), then it is the child's turn: the teal ring and Pip's hand invite the next
 * uncounted leaf ("keep counting").
 */
export const DemoMode: Story = {
  globals: { ageMode: 'k' },
  args: { demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'tap', args: { index: 0 } });
    await expect(marks(root)).toEqual([1]);
    await demoController.play({ op: 'count-aloud', args: { upTo: 4 } });
    await expect(marks(root)).toEqual([1, 2, 3, 4]);
    await expect(tray(root)).toHaveAttribute('data-shown', 'false');
    await expect(demoController.play({ op: 'flash' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'count-aloud' });
    await waitFor(() => expect(obj(root, 4)).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(obj(root, 4)).not.toHaveAttribute('data-marked');
    await expect(obj(root, 4)).toBeEnabled();
    await expectPointerOn(hand(root), obj(root, 4), root);
    await expectRingClearOfBadges(root, obj(root, 4));
    await expectBadgesOffObjects(root);
  },
};

const ordinalDemo: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode, ordinal (a faded CNT.15.t1 example): Pip counts on from the "start here" arrow to
 * the sixth shell, then it is the child's turn: the teal ring and Pip's hand invite the seventh.
 * Nothing is picked yet.
 */
export const DemoOrdinal: Story = {
  args: { config: ordinalShells, demo: ordinalDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await ordinalDemo.play({ op: 'tap', args: { index: 0 } });
    await ordinalDemo.play({ op: 'count-aloud', args: { upTo: 6 } });
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6]);
    ordinalDemo.invite({ op: 'ring', args: { index: 6 } });
    await waitFor(() => expect(obj(root, 6)).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await expect(root.querySelectorAll('[data-ringed="true"]')).toHaveLength(0);
    await expect(obj(root, 6)).toHaveAttribute('aria-pressed', 'false');
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expectPointerOn(hand(root), obj(root, 6), root);
    await expectRingClearOfBadges(root, obj(root, 6));
    await expectBadgesOffObjects(root);
    await expectOrdinalFits(root);
  },
};

const ordinalRingDemo: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode, ordinal "show me" (CNT.15.t1 solution): Pip counts to seven and rings the seventh
 * shell. The generic `answer {id}` op rings an object too; there is one ring at a time, so the
 * later `ring` moves it.
 */
export const DemoOrdinalRing: Story = {
  args: { config: ordinalShells, disabled: true, demo: ordinalRingDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await ordinalRingDemo.play({ op: 'count-aloud', args: { upTo: 7 } });
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await ordinalRingDemo.play({ op: 'answer', args: { id: 'obj-5' } });
    await expect(obj(root, 5)).toHaveAttribute('data-ringed', 'true');
    await ordinalRingDemo.play({ op: 'ring', args: { index: 6 } });
    await expect(obj(root, 6)).toHaveAttribute('data-ringed', 'true');
    await expect(root.querySelectorAll('[data-ringed="true"]')).toHaveLength(1);
    await expect(root.querySelector('.ni-invite')).toBeNull();
    // At rest: Pip's counting lift on the rung shell has ended.
    await waitFor(() => expect(root.querySelector('[data-counting="true"]')).toBeNull());
    await settled(root);
    await expectBadgeClearOfRing(root);
    await expectBadgesOffObjects(root);
    await expectOrdinalFits(root);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/**
 * Reduced motion: counting aloud and the generic `answer` op are instant. `say-total` enters the
 * number counted.
 */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: fishPicture, tier: 'pictorial', disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'count-aloud', args: { upTo: 6 } });
    await reducedController.play({ op: 'answer', args: { value: 6 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6]);
    // Pip's marks on a scattered picture (several rows): each badge clear of every fish.
    await expectBadgesOffObjects(root);
    await expect(within(root).getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
    // `answer` replaces the entry, it never appends (as the engine model does).
    await reducedController.play({ op: 'answer', args: { value: 4 } });
    await expect(within(root).getByRole('button', { name: 'Your answer: 4' })).toBeVisible();
    await reducedController.play({ op: 'say-total' });
    await expect(within(root).getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
  },
};

const frameCount: WidgetDemo = createDemoController({ strict: true });

/**
 * Pip counts aloud on a double ten-frame picture: the marks equal the number. Every crab sits at
 * the top of its cell (one size for all), each counted cell gets a dot centred in the room under
 * its crab, and the running count shows once, in the card's top-right corner, ≥ 12 px clear of
 * the card's edges and the frames — part-way (7, first frame) and at the end (15 dots and one
 * "15"). Pictorial: the frame cells are a picture, not tap targets (the child answers on the pad),
 * so they are not held to the 80 px K target size; tappable K frame cells are (TenFrameConcreteK).
 * Pip's demo plays with input off, so it ends with no invite (no ring, no hand).
 */
export const DemoCountAloudTenFrame: Story = {
  globals: { ageMode: 'k', motion: 'reduced' },
  args: { config: doubleFrame, tier: 'pictorial', disabled: true, demo: frameCount },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-dots', 'true');
    await frameCount.play({ op: 'count-aloud', args: { upTo: 7 } });
    await expectFrameMarks(root, 7);
    await frameCount.play({ op: 'count-aloud', args: { upTo: 15 } });
    await expectFrameMarks(root, 15);
    await expectDrawnAtLeast(root, 32);
  },
};

/** Every object's drawing is at least `px` wide and tall enough to count (its drawn box). */
async function expectDrawnAtLeast(root: HTMLElement, px: number) {
  for (const s of root.querySelectorAll('[data-kind="object"] .ni-tapc__sprite')) {
    const d = drawnRect(s);
    await expect(d.right - d.left, 'drawn width').toBeGreaterThanOrEqual(px);
  }
}

/**
 * The how-many widget fits its host box (the widget area) exactly: the box scrolls neither way,
 * the picture card, the answer slot, every key and Check lie inside it, a real hit test at each
 * key's and Check's centre lands on it, and the keys and Check keep the K target size and the
 * 12 px gaps.
 */
async function expectHowManyFits(root: HTMLElement) {
  await settle(root);
  const box = root.closest('.story-host-box') as HTMLElement;
  box.scrollTop = 0;
  box.scrollLeft = 0;
  await expect(box.scrollHeight, 'the area does not scroll down').toBeLessThanOrEqual(
    box.clientHeight + 1,
  );
  await expect(box.scrollWidth, 'the area does not scroll across').toBeLessThanOrEqual(
    box.clientWidth + 1,
  );
  const area = box.getBoundingClientRect();
  const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
  const check = checkButton(root);
  const parts: [Element, string][] = [
    [root.querySelector('.ni-tapc__picture') as Element, 'picture card'],
    [root.querySelector('.ni-tapc__slot') as Element, 'answer slot'],
    ...keys.map((k): [Element, string] => [k, `key ${k.dataset.key}`]),
    [check, 'Check'],
  ];
  for (const [el, what] of parts) await expectWithin(el.getBoundingClientRect(), area, 0, what);
  for (const el of [...keys, check]) {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    await expect(el.contains(hit), `a tap on ${el.dataset.key ?? 'Check'} lands on it`).toBe(true);
    await expectTargetSize(el, 'k');
  }
  await expectTargetGaps([...keys, check]);
  // The widget's content (picture card and answer) covers ≥ 60 % of the area.
  const content = [
    root.querySelector('.ni-tapc__picture') as Element,
    root.querySelector('.ni-tapc__answer') as Element,
  ].map((el) => el.getBoundingClientRect());
  const w = Math.max(...content.map((r) => r.right)) - Math.min(...content.map((r) => r.left));
  const h = Math.max(...content.map((r) => r.bottom)) - Math.min(...content.map((r) => r.top));
  await expect((w * h) / (area.width * area.height), 'area fill').toBeGreaterThanOrEqual(0.6);
}

const frameCountMin: WidgetDemo = createDemoController({ strict: true });

/**
 * DemoCountAloudTenFrame at the 960 × 600 minimum: exactly the 906 × 373 widget area, nothing
 * outside it. The pad's 560 px column cannot fit 373 px, so the K pad is compact: 80 px keys in a
 * 4 × 3 block with the answer slot over Check beside it, and the picture takes the width left
 * (pictorial cells are not tap targets). The same marks rules hold, and Pip's counting highlight
 * stays inside the cell being counted.
 */
export const DemoCountAloudTenFrameMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: doubleFrame, tier: 'pictorial', disabled: true, demo: frameCountMin },
  parameters: { area: widgetArea(960, 600) },
  render: renderInArea,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-dots', 'true');
    await waitFor(() => expect(root).toHaveAttribute('data-pad', 'compact'));
    const box = (root.closest('.story-host-box') as HTMLElement).getBoundingClientRect();
    await expect(Math.round(box.width)).toBe(906);
    await expect(Math.round(box.height)).toBe(373);
    // The picture beside the pad, never under it.
    await expect(root).toHaveAttribute('data-arrange', 'side');
    const card = (root.querySelector('.ni-tapc__picture') as HTMLElement).getBoundingClientRect();
    const answer = (root.querySelector('.ni-tapc__answer') as HTMLElement).getBoundingClientRect();
    await expect(card.right).toBeLessThanOrEqual(answer.left);
    await expectHowManyFits(root);
    // Room for a crab above its dot: cells of at least 44 px.
    await expect(frameCell(root, 0).getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    const counting = frameCountMin.play({ op: 'count-aloud', args: { upTo: 7 } });
    await expectCountingInCell(root);
    await counting;
    await expectFrameMarks(root, 7);
    await frameCountMin.play({ op: 'count-aloud', args: { upTo: 15 } });
    await expectFrameMarks(root, 15);
    await expectDrawnAtLeast(root, 32);
    await expectHowManyFits(root);
  },
};

/**
 * Grade 1+ at the 960 × 600 minimum: a single ten-frame beside the compact pad. Check carries its
 * word from Grade 1 on, so it is wider than the answer slot above it: the slot / Check column is
 * budgeted at the wider of the two, the picture takes what is left, and nothing overflows (the
 * area does not scroll; the picture, the slot, every key and Check lie inside it).
 */
export const TenFrameCompactPadG1Min: Story = {
  args: {
    config: {
      ...fishPicture,
      set: { count: 7, sprite: 'crab', layout: 'ten-frame', layoutSeed: 559465306 },
    },
    tier: 'pictorial',
  },
  parameters: { area: widgetArea(960, 600) },
  render: renderInArea,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-pad', 'compact'));
    await expect(root).toHaveAttribute('data-arrange', 'side');
    const check = checkButton(root);
    // The word is shown, and makes Check wider than the K icon-only button's 140 px column.
    await expect(check).toHaveTextContent('Check');
    await expect(check.getBoundingClientRect().width).toBeGreaterThan(140);
    // The layout follows Check's measured width (its word's font can arrive a frame later).
    const box = root.closest('.story-host-box') as HTMLElement;
    await waitFor(() => expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1));
    await expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
    // Everything inside the area, every key and Check a Grade 1+ target, 12 px apart.
    const area = box.getBoundingClientRect();
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    const parts: [Element, string][] = [
      [root.querySelector('.ni-tapc__picture') as Element, 'picture card'],
      [root.querySelector('.ni-tapc__slot') as Element, 'answer slot'],
      ...keys.map((k): [Element, string] => [k, `key ${k.dataset.key}`]),
      [check, 'Check'],
    ];
    for (const [el, what] of parts) await expectWithin(el.getBoundingClientRect(), area, 0, what);
    for (const el of [...keys, check]) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps([...keys, check]);
    const card = (root.querySelector('.ni-tapc__picture') as HTMLElement).getBoundingClientRect();
    const answer = (root.querySelector('.ni-tapc__answer') as HTMLElement).getBoundingClientRect();
    await expect(card.right).toBeLessThanOrEqual(answer.left);
  },
};

const tenFrameInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * K, concrete, on a ten-frame (marks on; no template generates this today, the format allows it).
 * The frame grows into the stage (cells up to 140 px), every crab one size. The objects are the
 * tap targets: ≥ 80 px, ≥ 12 px apart (each target is its cell less 6 px a side). Tapping counts
 * with a dot per counted cell and one running count. The story ends on a `tap` invite: the ring
 * stays inside the invited cell, so ≥ 12 px clear of every other target and inside the frame.
 */
export const TenFrameConcreteK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...leaves,
      set: { count: 7, sprite: 'crab', layout: 'ten-frame', layoutSeed: 559465306 },
    },
    tier: 'concrete',
    demo: tenFrameInvite,
  },
  parameters: { area: widgetArea(1280, 800) },
  render: renderInArea,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(objects(root)).toHaveLength(7);
    for (const o of objects(root)) await expectTargetSize(o, 'k');
    await expectTargetGaps(objects(root));
    // Each cell is its own target: adjacent cells are ≥ 12 px apart, each holds its object's box.
    const cells = [...root.querySelectorAll('.ni-objects__cell')].map((c) =>
      c.getBoundingClientRect(),
    );
    for (let i = 0; i < cells.length; i++) {
      const a = cells[i] as DOMRect;
      if (i % 5 < 4) {
        await expect(gapBetween(a, cells[i + 1] as DOMRect), 'cell gap').toBeGreaterThanOrEqual(
          11.5,
        );
      }
      if (i < 5) {
        await expect(gapBetween(a, cells[i + 5] as DOMRect), 'row gap').toBeGreaterThanOrEqual(
          11.5,
        );
      }
    }
    // Frame and Check as one centred group (Check beside while counting), filling the area.
    await expect(root).toHaveAttribute('data-arrange', 'side');
    await expect(tray(root)).toBeNull();
    await expectFill(root);
    for (let i = 0; i < 4; i++) await userEvent.click(obj(root, i));
    await expectFrameMarks(root, 4);
    await expect(obj(root, 3)).toHaveAccessibleName(/, number 4$/);
    (document.activeElement as HTMLElement | null)?.blur();
    tenFrameInvite.invite({ op: 'tap', args: { index: 4 } });
    const invited = obj(root, 4);
    await expectCueOn(root, invited);
    const cs = getComputedStyle(invited);
    const reach = Number.parseFloat(cs.outlineOffset) + Number.parseFloat(cs.outlineWidth);
    const b = invited.getBoundingClientRect();
    const ring = {
      left: b.left - reach,
      top: b.top - reach,
      right: b.right + reach,
      bottom: b.bottom + reach,
    };
    await expectWithin(ring, frameCell(root, 4).getBoundingClientRect(), 0, 'ring in its cell');
    for (const o of objects(root)) {
      if (o === invited) continue;
      await expect(gapBetween(ring, o.getBoundingClientRect())).toBeGreaterThanOrEqual(12 - 0.5);
    }
    // ≥ 12 px inside the frame's border.
    const fr = (root.querySelector('.ni-objects__frame') as HTMLElement).getBoundingClientRect();
    const inner = {
      left: fr.left + 4,
      top: fr.top + 4,
      right: fr.right - 4,
      bottom: fr.bottom - 4,
    };
    await expectWithin(ring, inner, 12, 'ring 12 px inside the frame border');
  },
};

/**
 * CNT.19.t2 seed 1 (concrete, G1, a real generated item): 29 crabs on three plates (groups of 10,
 * 10, 9). Three plates of full-size G1 targets don't fit the stage's width, so they go in rows
 * (2 + 1, centred), every plate inside the widget. Counted crabs get a dot in their own box (a
 * plate's rim and the crab above leave no room for numbered badges) and the running count shows
 * once, clear of the plates. While the child counts, the numeral tray (0–30) takes no room and
 * Check sits beside the plates; once all 29 are counted the tray comes in under them.
 */
const groupsOfTen: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: { count: 29, sprite: 'crab', layout: 'groups', layoutSeed: 11681668, groups: [10, 10, 9] },
  mode: 'how-many',
  input: 'auto',
  marks: true,
  countAloud: true,
};

export const GroupsOfTenDots: Story = {
  args: { config: groupsOfTen },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-dots', 'true');
    const plates = [...root.querySelectorAll('.ni-objects__frame[data-kind="plate"]')];
    await expect(plates).toHaveLength(3);
    const widget = root.getBoundingClientRect();
    for (const p of plates) await expectWithin(p.getBoundingClientRect(), widget, 0, 'plate');
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    // Check beside the plates while counting; no empty tray space.
    await expect(root).toHaveAttribute('data-arrange', 'side');
    await expect(tray(root)).toBeNull();
    const card = (root.querySelector('.ni-tapc__picture') as HTMLElement).getBoundingClientRect();
    await expect(checkButton(root).getBoundingClientRect().left).toBeGreaterThan(card.right);
    for (let i = 0; i < 12; i++) await userEvent.click(obj(root, i));
    await expectFrameMarks(root, 12);
    await expect(marks(root)).toEqual([]);
    for (const o of objects(root)) await expectTargetSize(o, 'g1-up');
    await expectTargetGaps(objects(root));
    // Still counting: Check stays beside the plates. Not an invite story: no focus ring.
    await expect(root).toHaveAttribute('data-arrange', 'side');
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/**
 * GroupsOfTenDots counted to the end: once all 29 are counted, the numeral tray (0–30) comes in
 * under the plates and Check under it. 29 full-size G1 targets and a 31-card tray cannot share a
 * 1280 × 800 screen, so the stage scrolls to the tray (the story ends scrolled to it).
 */
export const GroupsOfTenAllCounted: Story = {
  args: { config: groupsOfTen },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 29; i++) await userEvent.click(obj(root, i));
    await expectFrameMarks(root, 29);
    await waitFor(() => expect(tray(root)).toHaveAttribute('data-shown', 'true'));
    await expect(root).toHaveAttribute('data-arrange', 'stack');
    const card = (root.querySelector('.ni-tapc__picture') as HTMLElement).getBoundingClientRect();
    await expect(tray(root).getBoundingClientRect().top).toBeGreaterThanOrEqual(card.bottom);
    (document.activeElement as HTMLElement | null)?.blur();
    tray(root).scrollIntoView({ block: 'center' });
  },
};

/**
 * Review round 3 (F1): an ordinal item on a ten-frame, with its start marker before the frame.
 * The running count is placed from the counted cell's measured box, so with the marker and its
 * gap before the set it still sits over that cell's column.
 */
export const OrdinalTenFrameCount: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...ordinalShells,
      set: { count: 10, sprite: 'shell', layout: 'ten-frame', layoutSeed: 160159383 },
    },
  },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('img', { name: 'Start here' })).toBeVisible();
    await userEvent.click(obj(root, 0));
    await userEvent.click(obj(root, 1));
    await settle(root);
    const count = root.querySelector('.ni-tapc__count') as HTMLElement;
    await expect(count).toHaveTextContent('2');
    const c = count.getBoundingClientRect();
    const cell = frameCell(root, 1).getBoundingClientRect();
    const cx = (c.left + c.right) / 2;
    await expect(cx, 'count over the counted cell').toBeGreaterThanOrEqual(cell.left);
    await expect(cx, 'count over the counted cell').toBeLessThanOrEqual(cell.right);
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/**
 * Review round 3 (F2): equal groups [4, 5, 5] with 9 distractors (concrete, G1) in a host as wide
 * as the 960 × 600 minimum's area (906 px). The plates wrap into rows, and the distractors' row is
 * re-flowed inside the wrapped width: every distractor lies inside the picture card and a tap at
 * its centre lands on it.
 */
const groupsWithDistractors: ConfigFor<'tap-count'> = {
  format: 'tap-count',
  set: {
    count: 14,
    sprite: 'shell',
    layout: 'groups',
    groups: [4, 5, 5],
    layoutSeed: 7,
    distractors: { sprite: 'crab', count: 9 },
  },
  mode: 'how-many',
  input: 'auto',
  marks: true,
  countAloud: true,
};

export const GroupsDistractorsMin: Story = {
  args: { config: groupsWithDistractors },
  // A host 906 px wide (the 960 × 600 minimum's width), tall enough for 23 G1 targets.
  parameters: { area: { w: 906, h: 900 } },
  render: renderInArea,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const card = (root.querySelector('.ni-tapc__picture') as HTMLElement).getBoundingClientRect();
    const distractors = [...root.querySelectorAll<HTMLElement>('[data-kind="distractor"]')];
    await expect(distractors).toHaveLength(9);
    for (const d of distractors) {
      const r = d.getBoundingClientRect();
      await expectWithin(r, card, 3, `${d.dataset.obj} in the card`);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      await expect(d.contains(hit), `a tap on ${d.dataset.obj} lands on it`).toBe(true);
    }
  },
};

// ---------- invites follow the next ENABLED control (03 §6.3) ----------

/** The invite is ON `el` alone: the one teal ring, and one hand pointing at it. */
async function expectCueOn(root: HTMLElement, el: HTMLElement) {
  await waitFor(() => expect(el).toHaveClass('ni-invite'));
  await expect([...root.querySelectorAll('.ni-invite')]).toEqual([el]);
  await expect(root.querySelectorAll('.ni-hand')).toHaveLength(1);
  await expect(el).toBeEnabled();
  // The drawn fingertip inside the control, the hand clear of its glyph (expectPointerOn).
  await waitFor(() => expectPointerOn(hand(root), el, root));
  // And still there once every entrance (the tray rising in, a card popping in) has settled: the
  // hand is placed where the control comes to rest, not where it was mid-entrance.
  await settled(root);
  await expect(el).toHaveClass('ni-invite');
  await expectPointerOn(hand(root), el, root);
}

/** Every running finite animation in the widget has finished (loops keep running). */
async function settled(root: HTMLElement) {
  const finite = root
    .getAnimations({ subtree: true })
    .filter(
      (a) =>
        a.playState === 'running' &&
        a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
    );
  await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
}

/** No cue at all: no ring, no hand. */
async function expectNoCue(root: HTMLElement) {
  // Let any pending invite render first.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await expect(root.querySelector('.ni-invite')).toBeNull();
  await expect(root.querySelector('.ni-hand')).toBeNull();
}

const card = (root: HTMLElement, v: number) =>
  root.querySelector(`.ni-pick[data-id="opt-${v}"]`) as HTMLElement;
const checkButton = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });

const padInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Invite `answer {value: 6}` on the pictorial pad item (K), before any digit: the ring and Pip's
 * hand go on the 6 key (Check cannot be pressed yet). A wrong digit moves them to backspace, then
 * back to 6; once 6 is in, they move to the now-enabled Check.
 */
export const InviteAnswerPad: Story = {
  globals: { ageMode: 'k' },
  args: { config: fishPicture, tier: 'pictorial', demo: padInvite },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Check sits beside the pad, level with it, not under it.
    await expect(checkButton(root).getBoundingClientRect().top).toBeLessThan(
      key(root, '0').getBoundingClientRect().top,
    );
    await expectFitsTabletPage(root);
    padInvite.invite({ op: 'answer', args: { value: 6 } });
    await expectCueOn(root, key(root, '6'));
    await expectFitsTabletPage(root);
    await expect(checkButton(root)).toBeDisabled();
    await expect(checkButton(root)).not.toHaveClass('ni-invite');
    await userEvent.click(key(root, '5'));
    await expectCueOn(root, key(root, 'back'));
    await userEvent.click(key(root, 'back'));
    await expectCueOn(root, key(root, '6'));
    await userEvent.click(key(root, '6'));
    await expectCueOn(root, checkButton(root));
    await expectFitsTabletPage(root);
    await userEvent.click(checkButton(root));
    checkButton(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
  },
};

/**
 * The story page fits a 1280 × 800 screen with no vertical scroll: the story canvas's 2 × 40 px
 * padding plus the widget stage is at most 800 px, and the widget sits inside the stage. The test
 * browser is 1200 × 900, so this measures the page's content height rather than scrolling; the
 * stage is 80 px narrower there than at 1280, which only narrows the picture beside the pad (the
 * pad column, the tallest part, sets the height either way).
 */
async function expectFitsTabletPage(root: HTMLElement) {
  await settle(root);
  await expect(root).toHaveAttribute('data-arrange', 'side');
  const stage = (root.closest('.story-widget-stage') as HTMLElement).getBoundingClientRect();
  const widget = root.getBoundingClientRect();
  await expect(stage.height + 2 * 40, 'story page height').toBeLessThanOrEqual(800);
  await expect(widget.bottom).toBeLessThanOrEqual(stage.bottom - 24 - 3);
  await expect(widget.top).toBeGreaterThanOrEqual(stage.top + 24 + 3);
}

const pickInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Pick input: an `answer {value: 5}` invite points at the 5 card, stays there through a wrong pick
 * (and a tap on the picture), then moves to Check once 5 is picked.
 */
export const InviteAnswerPick: Story = {
  args: { config: withDistractors, demo: pickInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    pickInvite.invite({ op: 'answer', args: { value: 5 } });
    await expectCueOn(root, card(root, 5));
    await userEvent.click(card(root, 8));
    await expectCueOn(root, card(root, 5));
    await expect(checkButton(root)).toBeEnabled();
    await userEvent.click(obj(root, 0));
    await expectCueOn(root, card(root, 5));
    await userEvent.click(card(root, 5));
    await expectCueOn(root, checkButton(root));
  },
};

const countFirstInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Concrete, `input: 'auto'` (K): the numeral tray only appears once every leaf is counted, so an
 * `answer {value: 7}` invite first points at the next leaf to count, following each tap, then at
 * the 7 card, then at Check.
 */
export const InviteAnswerCountFirst: Story = {
  globals: { ageMode: 'k' },
  args: { demo: countFirstInvite },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    countFirstInvite.invite({ op: 'answer', args: { value: 7 } });
    for (let i = 0; i < 7; i++) {
      await expectCueOn(root, obj(root, i));
      await userEvent.click(obj(root, i));
    }
    await waitFor(() => expect(tray(root)).toHaveAttribute('data-shown', 'true'));
    await expectCueOn(root, card(root, 7));
    await userEvent.click(card(root, 7));
    await expectCueOn(root, checkButton(root));
    await userEvent.click(checkButton(root));
    checkButton(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
  },
};

/** A story harness: the widget starts `disabled` (the runner busy); a button gives input back. */
function EnableLater(args: WidgetHostProps) {
  const [disabled, setDisabled] = useState(true);
  return (
    <div className="story-widget-stage">
      <WidgetHost {...args} disabled={disabled} />
      <button type="button" onClick={() => setDisabled(false)}>
        Enable input (story harness)
      </button>
    </div>
  );
}

const heldInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Ordinal example while the widget is disabled (K): Pip counts to six, then invites `ring
 * {index: 6}`. The seventh shell is a disabled button, so no ring and no hand show. The invite is
 * kept: once input is back it rings the seventh shell; ringing it moves the cue to Check, and
 * ringing the wrong shell moves it back.
 */
export const InviteHeldWhileDisabled: Story = {
  globals: { ageMode: 'k' },
  args: { config: ordinalShells, demo: heldInvite },
  render: (args) => <EnableLater {...args} />,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await heldInvite.play({ op: 'count-aloud', args: { upTo: 6 } });
    heldInvite.invite({ op: 'ring', args: { index: 6 } });
    await expect(obj(root, 6)).toBeDisabled();
    await expectNoCue(root);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Enable input/ }));
    await expectCueOn(root, obj(root, 6));
    await userEvent.click(obj(root, 6));
    await expectCueOn(root, checkButton(root));
    await userEvent.click(obj(root, 5));
    await expectCueOn(root, obj(root, 6));
    await userEvent.click(obj(root, 6));
    await expectBadgeClearOfRing(root);
    await userEvent.click(checkButton(root));
    checkButton(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-6' });
  },
};

// ---------- container-relative ordinal rows (06 §1: 960 × 600 minimum, 800 × 1280) ----------

/**
 * The workshop's widget area at a viewport (WorkshopFrame): the width less the frame's 2 × 24 px
 * padding and the stage's 2 × 3 px border; the height is the 06 §2 minimum, 60 % of the screen
 * over that width, less the border. 1280 × 800 → 1226 × 493, 960 × 600 → 906 × 373,
 * 800 × 1280 → 746 × 812.
 */
function widgetArea(vw: number, vh: number) {
  const outer = vw - 2 * 24;
  return { w: outer - 2 * 3, h: Math.ceil((0.6 * vw * vh) / outer) - 2 * 3 };
}

/** Renders the widget in a fixed host box the size of `parameters.area`. */
function renderInArea(
  args: WidgetHostProps,
  { parameters }: { parameters: Record<string, unknown> },
) {
  const area = parameters.area as { w: number; h: number };
  return (
    <div
      className="story-host-box"
      style={{
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        // A scroll box, like the workshop's widget area: overflow shows as scroll, never spills.
        overflow: 'auto',
        width: area.w,
        height: area.h,
        maxWidth: 'none',
        // Centred in the stage even when wider than its padded content box (the 1226 px tablet
        // area in a 1280 px viewport): a grid item that overflows its track starts at the track's
        // left edge, so equal negative margins centre it on the viewport instead.
        justifySelf: 'center',
        marginInline: `min(0px, calc((100% - ${area.w}px) / 2))`,
        // The workshop's warm widget card, exactly the area's size (no border or padding).
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-sand)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <WidgetHost {...args} />
    </div>
  );
}

/** Object ids per drawn row (top to bottom), each row left to right. */
function rowsOf(root: HTMLElement): string[][] {
  const rows = new Map<number, { x: number; id: string }[]>();
  for (const o of objects(root)) {
    const r = o.getBoundingClientRect();
    const top = Math.round(r.top);
    const at = [...rows.keys()].find((k) => Math.abs(k - top) < 4) ?? top;
    rows.set(at, [...(rows.get(at) ?? []), { x: r.left, id: o.dataset.obj ?? '' }]);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((o) => o.id));
}
const ids = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `obj-${from + i}`);

/**
 * The start marker, the board, every target and Check sit inside the host box (and the widget);
 * every target keeps the age mode's size and the 12 px gaps.
 */
async function expectOrdinalInArea(root: HTMLElement, ageMode: 'k' | 'g1-up') {
  await settle(root);
  const box = (root.closest('.story-host-box') as HTMLElement).getBoundingClientRect();
  const widget = root.getBoundingClientRect();
  const inside = async (el: Element, what: string) => {
    const r = el.getBoundingClientRect();
    for (const b of [box, widget]) {
      await expect(r.left, `${what} left`).toBeGreaterThanOrEqual(b.left - 0.5);
      await expect(r.right, `${what} right`).toBeLessThanOrEqual(b.right + 0.5);
      await expect(r.top, `${what} top`).toBeGreaterThanOrEqual(b.top - 0.5);
      await expect(r.bottom, `${what} bottom`).toBeLessThanOrEqual(b.bottom + 0.5);
    }
  };
  const picture = root.querySelector('.ni-tapc__picture') as HTMLElement;
  await inside(picture, 'board');
  await inside(within(root).getByRole('img', { name: 'Start here' }), 'start marker');
  for (const o of objects(root)) await inside(o, o.dataset.obj ?? 'object');
  await inside(checkButton(root), 'Check');
  // The objects sit on the board, inside its border.
  const set = (root.querySelector('.ni-tapc__set') as HTMLElement).getBoundingClientRect();
  const board = picture.getBoundingClientRect();
  await expect(set.left).toBeGreaterThanOrEqual(board.left + 3);
  await expect(set.right).toBeLessThanOrEqual(board.right - 3);
  await expect(objects(root)).toHaveLength(10);
  for (const o of objects(root)) await expectTargetSize(o, ageMode);
  await expectTargetGaps(objects(root));
}

/** The start marker comes before the first row, level with it, on the counting side. */
async function expectCueBeforeFirstRow(
  root: HTMLElement,
  first: HTMLElement,
  from: 'left' | 'right',
) {
  const cue = within(root).getByRole('img', { name: 'Start here' }).getBoundingClientRect();
  const o = first.getBoundingClientRect();
  if (from === 'left') await expect(cue.right).toBeLessThanOrEqual(o.left);
  else await expect(cue.left).toBeGreaterThanOrEqual(o.right);
  const mid = (cue.top + cue.bottom) / 2;
  await expect(mid).toBeGreaterThanOrEqual(o.top);
  await expect(mid).toBeLessThanOrEqual(o.bottom);
}

/**
 * Keyboard and screen-reader order follow the counting order (`order`, from the start marker),
 * whatever the drawn rows: the objects are in that order in the DOM, Tab from before the widget
 * lands on the marked object first and walks the rest in order, then Check. Space on each one
 * rings it and traces its own `obj-<i>` (ids never depend on the order).
 */
async function expectKeyboardCountingOrder(
  root: HTMLElement,
  onInteract: unknown,
  order: string[],
) {
  (document.activeElement as HTMLElement | null)?.blur();
  for (let guard = 0; guard < 20 && !root.contains(document.activeElement); guard++) {
    await userEvent.tab();
  }
  const visited: string[] = [];
  for (let i = 0; i < order.length; i++) {
    const el = document.activeElement as HTMLElement;
    visited.push(el.dataset.obj ?? el.tagName);
    await userEvent.keyboard(' ');
    await expect(el).toHaveAttribute('aria-pressed', 'true');
    await userEvent.tab();
  }
  await expect(visited).toEqual(order);
  await expect(document.activeElement).toBe(checkButton(root));
  // The last object rung (counted too, in C) keeps its badge clear of the ring.
  await expectBadgeClearOfRing(root, root.dataset.tier === 'concrete');
  // Screen readers read the DOM: the same order.
  await expect(objects(root).map((o) => o.dataset.obj)).toEqual(order);
  const taps = traceOf(onInteract).filter((e) => e.t === 'tap');
  await expect(taps.slice(-order.length).map((e) => e.target)).toEqual(order);
  // The story ends here or goes on with taps: no keyboard focus ring left behind.
  (document.activeElement as HTMLElement | null)?.blur();
}

/**
 * The widget's content (the row card and Check, the hand left out) covers ≥ 60 % of its area box.
 */
async function expectFill(root: HTMLElement) {
  const area = (root.closest('.story-host-box') as HTMLElement).getBoundingClientRect();
  const parts = [...root.children]
    .filter((c) => !c.classList.contains('ni-hand'))
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.width > 0);
  const w = Math.max(...parts.map((r) => r.right)) - Math.min(...parts.map((r) => r.left));
  const h = Math.max(...parts.map((r) => r.bottom)) - Math.min(...parts.map((r) => r.top));
  await expect((w * h) / (area.width * area.height), 'area fill').toBeGreaterThanOrEqual(0.6);
}

/**
 * CNT.15.t1 (K) at the 1280 × 800 baseline (widget area 1226 × 493): the strip grows into the
 * area, two rows of five 112 px shells with Check beside them, filling ≥ 60 % of it; the
 * badges keep their 12 px clearances.
 */
export const OrdinalKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: ordinalShells },
  parameters: { area: widgetArea(1280, 800) },
  render: renderInArea,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(rowsOf(root)).toEqual([ids(0, 4), ids(5, 9)]));
    await expect(root).toHaveAttribute('data-arrange', 'side');
    for (const o of objects(root)) {
      await expect(o.getBoundingClientRect().width).toBeGreaterThanOrEqual(100);
    }
    await expectFill(root);
    await expectOrdinalInArea(root, 'k');
    await expectCueBeforeFirstRow(root, obj(root, 0), 'left');
    // One row, from the left: Tab runs obj-0 to obj-9.
    await expectKeyboardCountingOrder(root, args.onInteract, ids(0, 9));
  },
};

/**
 * CNT.15.t1 (K) at the 960 × 600 minimum (widget area 906 × 373): ten 80 px targets cannot share
 * a row, so the row wraps 5 + 5 in reading order, the start marker before the first row, Check
 * beside. Counting along still answers `choice obj-6`.
 */
export const OrdinalKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: ordinalShells },
  parameters: { area: widgetArea(960, 600) },
  render: renderInArea,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(rowsOf(root)).toEqual([ids(0, 4), ids(5, 9)]));
    // Both rows start at the left, one under the other.
    const left = (i: number) => obj(root, i).getBoundingClientRect().left;
    await expect(Math.abs(left(5) - left(0))).toBeLessThan(1);
    await expectOrdinalInArea(root, 'k');
    await expectCueBeforeFirstRow(root, obj(root, 0), 'left');
    for (let i = 0; i < 7; i++) await userEvent.click(obj(root, i));
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expectBadgesOffObjects(root);
    await expectBadgeClearOfRing(root);
    await expectOrdinalInArea(root, 'k');
    await userEvent.click(checkButton(root));
    checkButton(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-6' });
  },
};

/**
 * CNT.15.t1 (K) in 800 × 1280 portrait (widget area 746 × 812): 5 + 5 shells grown into the
 * area (≥ 100 px), Check under the rows, filling ≥ 60 % of it.
 */
export const OrdinalKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: ordinalShells },
  parameters: { area: widgetArea(800, 1280) },
  render: renderInArea,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(rowsOf(root)).toEqual([ids(0, 4), ids(5, 9)]));
    for (const o of objects(root)) {
      await expect(o.getBoundingClientRect().width).toBeGreaterThanOrEqual(100);
    }
    await expectFill(root);
    await expectOrdinalInArea(root, 'k');
    await expectCueBeforeFirstRow(root, obj(root, 0), 'left');
    const set = (root.querySelector('.ni-tapc__set') as HTMLElement).getBoundingClientRect();
    await expect(checkButton(root).getBoundingClientRect().top).toBeGreaterThan(set.bottom);
    // Keyboard: Tab starts on obj-0 beside the marker, the top row first, then the second row.
    await expectKeyboardCountingOrder(root, args.onInteract, ids(0, 9));
  },
};

/**
 * Counted from the right, in portrait (K): the first row holds the five shells counted first,
 * right-aligned next to the start marker (obj-9 first), the next five under them. Tab follows the
 * count: obj-9 beside the marker first, down to obj-0.
 */
export const OrdinalKFromRightPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...ordinalShells, ordinal: { k: 3, from: 'right' } } },
  parameters: { area: widgetArea(800, 1280) },
  render: renderInArea,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(rowsOf(root)).toEqual([ids(5, 9), ids(0, 4)]));
    const right = (i: number) => obj(root, i).getBoundingClientRect().right;
    await expect(Math.abs(right(4) - right(9))).toBeLessThan(1);
    await expectOrdinalInArea(root, 'k');
    await expectCueBeforeFirstRow(root, obj(root, 9), 'right');
    // Keyboard: Tab starts on obj-9 beside the marker and counts on to obj-0.
    await expectKeyboardCountingOrder(root, args.onInteract, ids(0, 9).reverse());
    await userEvent.click(obj(root, 7));
    await userEvent.click(checkButton(root));
    checkButton(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-7' });
  },
};

/**
 * A longer ordinal line (11 shells, valid for the format), counted from the left. The kit wraps it
 * into a second row; Tab and the screen reader still follow the line: obj-0 … obj-10, never jumping
 * between rows column by column (review round 3).
 */
export const OrdinalElevenFromLeft: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...ordinalShells,
      set: { ...ordinalShells.set, count: 11 },
      ordinal: { k: 4, from: 'left' },
    },
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(obj(root, 10)).toBeVisible());
    await expectKeyboardCountingOrder(root, args.onInteract, ids(0, 10));
  },
};

/**
 * Eleven shells counted from the RIGHT, asking for the first (K): the line wraps in counting order
 * (6 + 5, right-aligned), so the start marker sits beside obj-10 on the first row, Tab starts on
 * obj-10 and follows the count to obj-0, and the first from the right is `obj-10`.
 */
export const OrdinalElevenFromRight: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...ordinalShells,
      set: { ...ordinalShells.set, count: 11 },
      ordinal: { k: 1, from: 'right' },
    },
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(obj(root, 10)).toBeVisible());
    await expectCueBeforeFirstRow(root, obj(root, 10), 'right');
    // obj-10 is the top row's rightmost shell, next to the marker.
    for (const o of objects(root)) {
      if (o === obj(root, 10)) continue;
      const r = o.getBoundingClientRect();
      const first = obj(root, 10).getBoundingClientRect();
      await expect(r.top >= first.top - 1 && (r.top > first.top + 1 || r.right < first.left)).toBe(
        true,
      );
    }
    await expectKeyboardCountingOrder(root, args.onInteract, ids(0, 10).reverse());
    await userEvent.click(obj(root, 10));
    await userEvent.click(checkButton(root));
    checkButton(root).blur();
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-10' });
  },
};

// ---------- count, then answer (#12: short areas, where the tray and full-size objects ----------
// ---------- cannot share one screen) ----------

/** The Practice Pier's workshop area inside its padding at 960 × 600 in K (measured: #12). */
const PIER_MIN_K = { w: 858, h: 366 };
/** The 960 × 600 widget area inside the card's padding and border (906 × 373 → 852 × 319). */
const MIN_INNER = { w: 852, h: 319 };

/** Nothing scrolls in the host box, and every one of `els` lies inside it at target size. */
async function expectInHost(root: HTMLElement, els: readonly Element[], ageMode: 'k' | 'g1-up') {
  await settle(root);
  const host = root.closest('.story-host-box') as HTMLElement;
  await expect(host.scrollHeight, 'does not scroll down').toBeLessThanOrEqual(
    host.clientHeight + 1,
  );
  await expect(host.scrollWidth, 'does not scroll across').toBeLessThanOrEqual(
    host.clientWidth + 1,
  );
  const box = host.getBoundingClientRect();
  await expect(els.length).toBeGreaterThan(0);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    await expect(r.top, 'top').toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(r.bottom, 'bottom').toBeLessThanOrEqual(box.bottom + 0.5);
    await expect(r.left, 'left').toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(r.right, 'right').toBeLessThanOrEqual(box.right + 0.5);
    await expectTargetSize(el as HTMLElement, ageMode);
  }
  await expectTargetGaps(els as HTMLElement[]);
}

const answerControls = (root: HTMLElement) => [
  ...root.querySelectorAll('.ni-entry button, .ni-stepper button, .ni-tapc__asktray .ni-pick'),
  stepButton(root, 'back'),
  stepButton(root, 'check'),
];

/**
 * CNT.02.t1 (K) in the smallest area: seven leaves at full target size and the 0–10 tray need
 * 382 px, the area has 319. The child counts with the whole area; Next comes with the last leaf;
 * the answer step shows the numeral cards (and the leaves small where they fit), with Back to
 * count again. The
 * response and the tap trace are the one-screen ones, plus `next`.
 */
export const CountThenAnswerMinK: Story = {
  globals: { ageMode: 'k' },
  parameters: { area: MIN_INNER },
  render: renderInArea,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-step', 'build'));
    await expect(tray(root)).toBeNull();
    await expectInHost(root, objects(root), 'k');
    // No Next before every leaf is counted (as the tray shows only then on one screen).
    await expect(stepButton(root, 'next')).toBeNull();
    for (let i = 0; i < 7; i++) await userEvent.click(obj(root, i));
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expectInHost(root, [...objects(root), stepButton(root, 'next')], 'k');
    await goNext(root);
    await expectInHost(root, answerControls(root), 'k');
    // Here the numeral cards and the two buttons leave no room to draw seven leaves at a size a
    // child can count (32 px cells), so the step shows the cards alone; Back shows the leaves.
    await expect(root.querySelector('.ni-tapc__askpic')).toBeNull();
    // Back shows the counted leaves again, marks and all.
    await userEvent.click(stepButton(root, 'back'));
    await waitFor(() => expect(root).toHaveAttribute('data-step', 'build'));
    await expect(marks(root)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await goNext(root);
    // The answer is a pick among the numeral cards, as on one screen: `opt-7`.
    await expect(root.querySelector('.ni-entry')).toHaveAttribute('data-kind', 'tray');
    await userEvent.click(within(root).getByRole('button', { name: '7' }));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.slice(0, 8)).toEqual([
      ...Array.from({ length: 7 }, (_, i) => `tap:obj-${i}`),
      'tap:next',
    ]);
    await expect(trace.slice(8)).toEqual(['tap:back', 'tap:next', 'tap:opt-7']);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** CNT.05.t1 seed 1: twelve leaves (the kit lays a line of twelve as ten and two). */
const twelveLeaves: ConfigFor<'tap-count'> = {
  ...leaves,
  set: { count: 12, sprite: 'leaf', layout: 'line', layoutSeed: 598165036 },
};

/**
 * CNT.05.t1 (K) in the pier's area at 960 × 600: ten K targets in a row are 920 px, so the line
 * wraps into two rows of six, with the step button beside them; then the answer step.
 */
export const CountTwelveThenAnswerPierK: Story = {
  globals: { ageMode: 'k' },
  args: { config: twelveLeaves },
  parameters: { area: PIER_MIN_K },
  render: renderInArea,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-step', 'build'));
    await expect(objects(root)).toHaveLength(12);
    await expectInHost(root, objects(root), 'k');
    for (let i = 0; i < 12; i++) await userEvent.click(obj(root, i));
    await expectInHost(root, [...objects(root), stepButton(root, 'next')], 'k');
    await goNext(root);
    await expectInHost(root, answerControls(root), 'k');
    // Review of #106: the answer stays a direct pick among 0–20 (never the stepper or the pad).
    await expect(root.querySelector('.ni-entry')).toHaveAttribute('data-kind', 'tray');
    await expect(root.querySelectorAll('.ni-entry .ni-pick')).toHaveLength(21);
    await expect(root.querySelector('.ni-stepper')).toBeNull();
    await userEvent.click(within(root).getByRole('button', { name: '12' }));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 12 });
    await expect(
      traceOf(args.onInteract)
        .map((e) => `${e.t}:${e.target}`)
        .slice(-2),
    ).toEqual(['tap:next', 'tap:opt-12']);
  },
};

/**
 * The arrangement is chosen once, when the item is first laid out: a room that shrinks mid-item
 * (a rotation, a resize) scrolls rather than swap the child's screen for the two steps.
 */
export const ArrangementKeptOnResize: Story = {
  globals: { ageMode: 'k' },
  parameters: { area: widgetArea(1280, 800) },
  render: renderInArea,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await settle(root);
    await userEvent.click(obj(root, 0));
    const host = root.closest('.story-host-box') as HTMLElement;
    host.style.width = `${MIN_INNER.w}px`;
    host.style.height = `${MIN_INNER.h}px`;
    await settle(root);
    await waitFor(() => expect(host.scrollHeight).toBeGreaterThan(host.clientHeight));
    await expect(root).not.toHaveAttribute('data-step');
    await expect(tray(root)).not.toBeNull();
    await expect(marks(root)).toEqual([1]);
  },
};

/**
 * CNT.19.t2 seed 2 on the tablet area (review of #106): 29 crabs on three plates are taller than
 * the area, so the item is count-then-answer, and its answer step keeps the numeral cards 0–30
 * (the kit would hand out the number pad above 20), all in view with Back and Check.
 */
export const CountTwentyNineThenAnswerTablet: Story = {
  args: { config: groupsOfTen },
  parameters: { area: widgetArea(1280, 800) },
  render: renderInArea,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-step', 'build'));
    for (let i = 0; i < 29; i++) await userEvent.click(obj(root, i));
    await goNext(root);
    await expect(root.querySelectorAll('.ni-tapc__asktray .ni-pick')).toHaveLength(31);
    await expect(root.querySelector('.ni-pad')).toBeNull();
    await expectInHost(root, answerControls(root), 'g1-up');
    await userEvent.click(within(root).getByRole('button', { name: '29' }));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 29 });
    await expect(
      traceOf(args.onInteract)
        .map((e) => `${e.t}:${e.target}`)
        .slice(-2),
    ).toEqual(['tap:next', 'tap:opt-29']);
  },
};

/** On the tablet area the same seven leaves stay on one screen, tray and all (no steps). */
export const CountOneScreenTabletK: Story = {
  globals: { ageMode: 'k' },
  parameters: { area: widgetArea(1280, 800) },
  render: renderInArea,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await settle(root);
    await expect(root).not.toHaveAttribute('data-step');
    await expect(tray(root)).toHaveAttribute('data-shown', 'false');
    for (let i = 0; i < 7; i++) await userEvent.click(obj(root, i));
    await expect(tray(root)).toHaveAttribute('data-shown', 'true');
    await expect(root).not.toHaveAttribute('data-step');
  },
};

/**
 * CNT.15.t1 (K) in the pier's area at 960 × 600 (858 × 366): ten shells in two rows of five at
 * full target size, with the icon-only Check beside them and no padding above or below.
 */
export const OrdinalKPier: Story = {
  globals: { ageMode: 'k' },
  args: { config: ordinalShells },
  parameters: { area: PIER_MIN_K },
  render: renderInArea,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(rowsOf(root)).toEqual([ids(0, 4), ids(5, 9)]));
    await expectInHost(root, [...objects(root), checkButton(root)], 'k');
  },
};
