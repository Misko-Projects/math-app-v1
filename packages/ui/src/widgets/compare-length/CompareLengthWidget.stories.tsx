import { CL_LENGTH_MAX, CL_OFFSET_MAX, formatModel } from '@number-island/engine';
import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { HAND_POINTER_TIP } from '../../primitives/icons';
import {
  areaBox,
  expectFitsArea,
  expectHandStays,
  expectNumeralsAtLeast32,
  inArea,
} from '../../test-support/areaStory';
import {
  boxGap,
  contrast,
  expectControls,
  expectHandTouchesOnlyInvited,
  expectOneInviteRing,
  keyRectsAfterEach,
  outlineBox,
  recordEvidence,
  settleFocus,
  sizeOf,
  visibleBox,
} from '../../test-support/evidence';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
  waitForSettled,
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
 * `compare-length` (03 §5.5): objects from one start line on one scale. Configs are real
 * generated items (mea.length; template and seed in each comment).
 */

type Config = ConfigFor<'compare-length'>;

/** MEA.01.t1 seed 1: which ribbon is longer? The short one starts 2 units past the line. */
const misaligned: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'ribbon', length: 6, offset: 2 },
    { id: 'obj-1', sprite: 'ribbon', length: 10, offset: 0 },
  ],
  ask: 'longer',
  aligned: false,
};

/** MEA.01.t2 seed 1: which vine is shorter? */
const shorter: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'vine', length: 10, offset: 0 },
    { id: 'obj-1', sprite: 'vine', length: 6, offset: 0 },
  ],
  ask: 'shorter',
  aligned: true,
};

/** MEA.07.t1 seed 7: shortest first; the 2-unit rope starts 3 units past the line. */
const order: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'rope', length: 6, offset: 0 },
    { id: 'obj-1', sprite: 'rope', length: 2, offset: 3 },
    { id: 'obj-2', sprite: 'rope', length: 9, offset: 0 },
  ],
  ask: 'order',
  aligned: false,
};

/**
 * MEA.07.t1 seed 7 lined up (`aligned: true`, every offset 0): the same three ropes, all from the
 * start line, for the area and invite stories (evidence review: ropes start at the line unless
 * the item says `aligned: false`).
 */
const orderAligned: Config = {
  ...order,
  objects: order.objects.map((o) => ({ ...o, offset: 0 })),
  aligned: true,
};

/** MEA.01.t4 seed 3 (pictorial): longest first. */
const orderPictorial: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'plank', length: 9, offset: 0 },
    { id: 'obj-1', sprite: 'plank', length: 6, offset: 0 },
    { id: 'obj-2', sprite: 'plank', length: 3, offset: 0 },
  ],
  ask: 'order',
  aligned: true,
};

/** MEA.07.t2 seed 1: the logs cannot move; lay a string on each. */
const indirect: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'log', length: 5, offset: 0 },
    { id: 'obj-1', sprite: 'log', length: 8, offset: 2 },
  ],
  ask: 'indirect',
  aligned: false,
};

/** How much longer (MEA.10, K02; no template yet): a hand-made config the schema accepts. */
const difference: Config = {
  format: 'compare-length',
  objects: [
    { id: 'obj-0', sprite: 'plank', length: 7, offset: 0 },
    { id: 'obj-1', sprite: 'plank', length: 4, offset: 0 },
  ],
  ask: 'how-much-longer',
  aligned: true,
};

const meta = {
  title: 'Widgets/Compare length',
  args: {
    config: misaligned as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // Evidence: every story leaves its key rects in the area's `data-evidence`.
  afterEach: keyRectsAfterEach('.ni-clen'),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-clen';
const obj = (root: HTMLElement, id: string) =>
  root.querySelector(`.ni-clen__obj[data-id="${id}"]`) as HTMLElement;
const art = (root: HTMLElement, id: string) =>
  obj(root, id).querySelector('svg.ni-len') as SVGSVGElement;
const unitPx = (root: HTMLElement) =>
  Number((root.querySelector('.ni-clen__lanes') as HTMLElement).dataset.unitPx);
const line = (root: HTMLElement) => center(root.querySelector('.ni-clen__line') as HTMLElement).x;

/** Every object is drawn to scale from where it starts: left end at start, width length × unit. */
async function expectToScale(root: HTMLElement, config: Config) {
  // The scale follows the measured area: wait until it has settled (no drift between frames).
  await waitFor(async () => {
    const before = unitPx(root);
    await new Promise((r) => setTimeout(r, 120));
    await expect(unitPx(root)).toBe(before);
  });
  const u = unitPx(root);
  for (const o of config.objects) {
    const el = obj(root, o.id);
    await waitForSettled(el);
    const r = art(root, o.id).getBoundingClientRect();
    await expect(r.width, `${o.id} width`).toBeCloseTo(o.length * u, 0);
    const start = Number(el.dataset.start);
    await expect(r.left - line(root), `${o.id} start`).toBeCloseTo(start * u, 0);
  }
}

/**
 * Every ring (picked or invited) lies 6+ px inside its lane and encloses the whole drawing, 6+ px
 * between the inner edge of its stroke and the drawing on every side (evidence review: a log
 * poked out of its ring). Returns the ring.
 */
async function expectRingsAround(root: HTMLElement) {
  const rings = [...root.querySelectorAll<HTMLElement>('.ni-clen__ring')];
  await expect(rings.length, 'rings').toBeGreaterThan(0);
  let inLane = Number.POSITIVE_INFINITY;
  let pad = Number.POSITIVE_INFINITY;
  let toLine = Number.POSITIVE_INFINITY;
  const startLine = visibleBox(root.querySelector('.ni-clen__line') as HTMLElement);
  for (const ring of rings) {
    const l = (ring.closest('.ni-clen__lane') as HTMLElement).getBoundingClientRect();
    const r = ring.getBoundingClientRect();
    const cs = getComputedStyle(ring);
    const outline = cs.outlineStyle === 'none' ? 0 : Number.parseFloat(cs.outlineWidth) || 0;
    const stroke = Math.max(Number.parseFloat(cs.borderTopWidth) || 0, outline);
    await expect(stroke, 'a thick ring').toBeGreaterThanOrEqual(4);
    const laneRing = ring.closest('.ni-clen__ring-zone--lane') !== null;
    const a = (
      (laneRing ? ring.closest('.ni-clen__lane') : ring.closest('.ni-clen__art')) as HTMLElement
    ).querySelector('svg.ni-len') as SVGSVGElement;
    const i = Math.min(r.left - l.left, r.top - l.top, l.right - r.right, l.bottom - r.bottom);
    if (laneRing) {
      // A picked lane's ring frames the lane: the whole object is inside it, on every side.
      const b = a.getBoundingClientRect();
      const inside = Math.min(
        b.left - (r.left + stroke),
        b.top - (r.top + stroke),
        r.right - stroke - b.right,
        r.bottom - stroke - b.bottom,
      );
      await expect(i, 'ring 6+ px inside its lane').toBeGreaterThanOrEqual(5.5);
      await expect(inside, 'the whole object inside the ring').toBeGreaterThanOrEqual(0);
      inLane = Math.min(inLane, i);
      pad = Math.min(pad, inside);
      continue;
    }
    // Entirely right of the dashed start line, 4+ px clear of it (evidence review: its stroke
    // crossed it); an object on the line then has its left tip outside the ring.
    const gap = r.left - startLine.right;
    await expect(gap, 'ring right of the start line').toBeGreaterThanOrEqual(3.5);
    toLine = Math.min(toLine, gap);
    const onLine = a.getBoundingClientRect().left - startLine.right < 6 + stroke;
    const ab = a.getBoundingClientRect();
    const p = Math.min(
      onLine ? Number.POSITIVE_INFINITY : ab.left - (r.left + stroke),
      ab.top - (r.top + stroke),
      r.right - stroke - ab.right,
      r.bottom - stroke - ab.bottom,
    );
    await expect(i, 'ring 6+ px inside its lane').toBeGreaterThanOrEqual(5.5);
    await expect(p, 'drawing 6+ px inside the ring').toBeGreaterThanOrEqual(5.5);
    inLane = Math.min(inLane, i);
    pad = Math.min(pad, p);
  }
  recordEvidence(root, {
    ring_in_lane: Math.round(inLane),
    ring_pad: Math.round(pad),
    ring_to_start_line: Math.round(toLine),
  });
  console.info(
    `[ring] ${Math.round(inLane)} px inside the lane; drawing ${Math.round(pad)} px inside the stroke; ${Math.round(toLine)} px right of the start line`,
  );
  return rings[0] as HTMLElement;
}

/**
 * K concrete (MEA.01.t1): the short ribbon starts 2 units past the line. Drag it to the line to
 * line it up (touch), then tap the longer one (it says its name). Both drawn to scale.
 */
export const LongerSlideToLineK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, misaligned);
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '2');
    for (const id of ['obj-0', 'obj-1']) await expectTargetSize(obj(root, id), 'k');
    await expectTargetGaps([obj(root, 'obj-0'), obj(root, 'obj-1')]);
    // Slide it left to the start line (touch).
    const r = obj(root, 'obj-0').getBoundingClientRect();
    await pointerDrag(
      obj(root, 'obj-0'),
      { x: r.left + r.width / 2 - 2 * unitPx(root), y: r.top + r.height / 2 },
      'touch',
    );
    await waitFor(() => expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '0'));
    await expectToScale(root, misaligned);
    await userEvent.click(obj(root, 'obj-1'));
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.ribbon', undefined);
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-1' });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:obj-0',
      'drop:start',
      'tap:obj-1',
    ]);
    await expectTraceOrdered(trace);
    // The ribbons use the width (evidence review): the longer one spans most of the widget.
    const longest = art(root, 'obj-1').getBoundingClientRect().width;
    await expect(longest / root.getBoundingClientRect().width).toBeGreaterThanOrEqual(0.6);
    await expectControls('compare-length LongerSlideToLineK', 'k', {
      objects: [obj(root, 'obj-0'), obj(root, 'obj-1')],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
    // Chunky ribbons (evidence review): the band is at least about 55 % of its lane's height.
    for (const id of ['obj-0', 'obj-1']) {
      const band = (
        root.querySelector(`[data-lane="${id}"] .ni-len__ribbon`) as SVGPathElement
      ).getBoundingClientRect().height;
      const laneH = (
        root.querySelector(`[data-lane="${id}"]`) as HTMLElement
      ).getBoundingClientRect().height;
      await expect(band / laneH, `${id} ribbon thickness`).toBeGreaterThanOrEqual(0.55);
    }
    // The pick ring encloses the whole ribbon, inside its lane.
    await expectRingsAround(root);
  },
};

/** The widget's content (lanes and side column) is centred across the area (evidence review). */
async function expectContentCentred(canvasElement: HTMLElement, root: HTMLElement) {
  const parts = [...root.querySelectorAll('.ni-clen__main, .ni-clen__side')].map((e) =>
    e.getBoundingClientRect(),
  );
  const left = Math.min(...parts.map((r) => r.left));
  const right = Math.max(...parts.map((r) => r.right));
  const a = areaBox(canvasElement);
  const r = a.getBoundingClientRect();
  const cs = getComputedStyle(a);
  const inset =
    (Number.parseFloat(cs.borderLeftWidth) || 0) + (Number.parseFloat(cs.paddingLeft) || 0);
  await expect(
    Math.abs(left - (r.left + inset) - (r.right - inset - right)),
    'centred',
  ).toBeLessThanOrEqual(4);
}

/** A slide that stops short of the line goes back; ← on the object lines it up (keyboard). */
export const SlideKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = obj(root, 'obj-0').getBoundingClientRect();
    await pointerDrag(obj(root, 'obj-0'), { x: r.left + r.width / 2 - 20, y: r.top + 10 }, 'mouse');
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '2');
    obj(root, 'obj-0').focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '0');
    await userEvent.keyboard(' ');
    await expect(obj(root, 'obj-0')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-0' });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:obj-0',
      'drop:none',
      'move:obj-0',
      'tap:obj-0',
    ]);
  },
};

/** MEA.01.t2 (pictorial): unit ticks on the floor; tap the shorter vine. */
export const ShorterPictorial: Story = {
  args: { config: shorter, tier: 'pictorial' },
  // In the tablet widget area, as the app shows it (evidence review: the fill bar).
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, shorter);
    await expect(root.querySelector('.ni-clen__ticks')).not.toBeNull();
    await userEvent.click(obj(root, 'obj-1'));
    await expectRingsAround(root);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-1' });
  },
};

const badge = (root: HTMLElement, n: number) =>
  root.querySelector(`.ni-clen__badge[data-badge="${n}"]`) as HTMLElement;
const lanePad = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-lane="${id}"] > .ni-clen__pad`) as HTMLElement;

/**
 * Order (evidence review): each lane's badge slot (or badge) is 12+ px clear of the start line
 * and of its rope; ropes are smooth with a knot at each end (no repeating mark along them).
 */
async function expectOrderLanes(root: HTMLElement) {
  const startLine = visibleBox(root.querySelector('.ni-clen__line') as HTMLElement);
  let least = Number.POSITIVE_INFINITY;
  let slotPx = 0;
  for (const laneEl of root.querySelectorAll<HTMLElement>('.ni-clen__lane')) {
    const spot = laneEl.querySelector('.ni-clen__slot, .ni-clen__badge') as HTMLElement;
    const rope = laneEl.querySelector('svg.ni-len') as SVGSVGElement;
    const s = spot.getBoundingClientRect();
    // The slot is a drop target at least a badge's size and 4 px round it (evidence review).
    if (spot.classList.contains('ni-clen__slot')) {
      const badgePx = Number.parseFloat(getComputedStyle(root).getPropertyValue('--target-min'));
      await expect(Math.min(s.width, s.height), 'slot ≥ a badge + 8').toBeGreaterThanOrEqual(
        badgePx + 8 - 0.5,
      );
      slotPx = Math.round(Math.min(s.width, s.height));
    }
    const toLine = startLine.left - s.right;
    const toRope = rope.getBoundingClientRect().left - s.right;
    await expect(toLine, 'badge slot clear of the start line').toBeGreaterThanOrEqual(12);
    await expect(toRope, 'badge slot clear of the rope').toBeGreaterThanOrEqual(12);
    least = Math.min(least, toLine, toRope);
    await expect(laneEl.querySelectorAll('.ni-len__rope-knot')).toHaveLength(2);
  }
  await expect(root.querySelector('.ni-len__rope-twist')).toBeNull();
  recordEvidence(root, { slot_to_line_rope: Math.round(least), slot: slotPx });
  console.info(`[order] badge slot to the start line / rope: ${Math.round(least)} px`);
}

/**
 * MEA.07.t1 (concrete, K), the generated item as it is (`aligned: false`: the 2-unit rope starts
 * 3 units past the line): shortest first. Badge 1 by touch drag, badge 2 by tap-then-tap, badge
 * 3 by keyboard. Check answers the lengths in badge order.
 */
export const OrderBadgesMisalignedK: Story = {
  globals: { ageMode: 'k' },
  args: { config: order },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, order);
    const badges = [0, 1, 2].map((n) => badge(root, n));
    for (const b of badges) await expectTargetSize(b, 'k');
    await expectTargetGaps(badges);
    await expectNumeralsAtLeast32(root, '.ni-clen__badge');
    // Each lane shows where its badge goes (evidence review), and the ropes stand out from the
    // lane: their dark edge is at least 3:1 against it.
    await expect(root.querySelectorAll('.ni-clen__slot')).toHaveLength(3);
    await expectOrderLanes(root);
    const edge = getComputedStyle(root.querySelector('.ni-len__rope-edge') as Element).stroke;
    const laneBg = getComputedStyle(
      root.querySelector('.ni-clen__lane') as Element,
    ).backgroundColor;
    await expect(contrast(edge, laneBg), 'rope edge against the lane').toBeGreaterThanOrEqual(3);
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await pointerDrag(badge(root, 0), center(lanePad(root, 'obj-1')), 'touch');
    await waitFor(() =>
      expect(root.querySelector('[data-lane="obj-1"] .ni-clen__badge')).toHaveAttribute(
        'data-badge',
        '0',
      ),
    );
    await userEvent.click(badge(root, 1));
    await userEvent.click(obj(root, 'obj-0'));
    await waitFor(() =>
      expect(root.querySelector('[data-lane="obj-0"] .ni-clen__badge')).not.toBeNull(),
    );
    badge(root, 2).focus();
    await userEvent.keyboard('{Enter}');
    // Focus jumps to the first object; move to the last one and drop.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(root.querySelector('[data-lane="obj-2"] .ni-clen__badge')).not.toBeNull(),
    );
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [2, 6, 9] });
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** A badge moved to another object, and one sent back to the tray. */
export const OrderMoveBadge: Story = {
  args: { config: orderPictorial, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(badge(root, 0));
    await userEvent.click(obj(root, 'obj-1'));
    // Badge 1 moves from the 6-plank to the 9-plank.
    await userEvent.click(root.querySelector('[data-lane="obj-1"] .ni-clen__badge') as HTMLElement);
    await userEvent.click(obj(root, 'obj-0'));
    await waitFor(() =>
      expect(root.querySelector('[data-lane="obj-1"] .ni-clen__badge')).toBeNull(),
    );
    await userEvent.click(badge(root, 1));
    await userEvent.click(obj(root, 'obj-1'));
    await userEvent.click(badge(root, 2));
    await userEvent.click(obj(root, 'obj-2'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [9, 6, 3] });
  },
};

const orderPlay =
  (story: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-clen__obj, .ni-clen__badge, .ni-clen__lane'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectToScale(root, orderAligned);
    // Lined up (`aligned: true`): every rope starts at the start line.
    for (const o of orderAligned.objects) {
      await expect(obj(root, o.id)).toHaveAttribute('data-start', '0');
    }
    await expectOrderLanes(root);
    await expectContentCentred(canvasElement, root);
    await expectControls(story, 'k', {
      badges: [...root.querySelectorAll('.ni-clen__badge')],
      objects: [...root.querySelectorAll('.ni-clen__obj')],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
  };

/**
 * Tablet widget area, K, the ropes lined up (`aligned: true`): the three ropes, badges and Check
 * fit with no scroll, centred.
 */
export const OrderAlignedTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: orderAligned },
  render: inArea('tablet'),
  play: orderPlay('compare-length OrderAlignedTabletK'),
};

/** Smallest landscape area, K, lined up: lanes, badges and Check fit with no scroll; to scale. */
export const OrderAlignedLandscapeMinK: Story = {
  ...OrderAlignedTabletK,
  render: inArea('landscapeMin'),
  play: orderPlay('compare-length OrderAlignedLandscapeMinK'),
};

/**
 * MEA.07.t2: the logs cannot move. Drag the string onto each (or tap it, then a log); the
 * strings show side by side from one line, exactly as long as the logs. Then tap the longer log.
 */
export const IndirectStrings: Story = {
  globals: { ageMode: 'k' },
  args: { config: indirect },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const spool = within(root).getByRole('button', { name: 'String' });
    await expectTargetSize(spool, 'k');
    // The logs do not slide.
    const r = obj(root, 'obj-1').getBoundingClientRect();
    await pointerDrag(obj(root, 'obj-1'), { x: r.left - 100, y: r.top + 20 }, 'mouse');
    await expect(obj(root, 'obj-1')).toHaveAttribute('data-start', '2');
    await pointerDrag(spool, center(lanePad(root, 'obj-1')), 'touch');
    await waitFor(() => expect(root.querySelector('[data-string-row="obj-1"]')).not.toBeNull());
    await userEvent.click(spool);
    await userEvent.click(obj(root, 'obj-0'));
    await waitFor(() => expect(root.querySelector('[data-string-row="obj-0"]')).not.toBeNull());
    const u = unitPx(root);
    for (const o of indirect.objects) {
      const s = root.querySelector(`[data-string-row="${o.id}"] .ni-string`) as SVGElement;
      await expect(s.getBoundingClientRect().width).toBeCloseTo(o.length * u, 0);
      await expect(s.getBoundingClientRect().left).toBeCloseTo(line(root), 0);
    }
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-clen__obj, .ni-clen__strings'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    // Each string carries its log's tag (colour and mark), in the logs' order (evidence review).
    const laneTops: number[] = [];
    const rowTops: number[] = [];
    for (const o of indirect.objects) {
      const laneTag = root.querySelector(
        `[data-lane="${o.id}"] [data-tag="${o.id}"]`,
      ) as HTMLElement;
      const rowTag = root.querySelector(`[data-row="${o.id}"] [data-tag="${o.id}"]`) as HTMLElement;
      await expect(rowTag.dataset.mark).toBe(laneTag.dataset.mark);
      await expect(rowTag.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
      laneTops.push(laneTag.getBoundingClientRect().top);
      rowTops.push(rowTag.getBoundingClientRect().top);
    }
    await expect(rowTops[0] as number).toBeLessThan(rowTops[1] as number);
    await expect(laneTops[0] as number).toBeLessThan(laneTops[1] as number);
    await expect(root.querySelector('[data-tag="obj-0"]')?.getAttribute('data-mark')).not.toBe(
      root.querySelector('[data-tag="obj-1"]')?.getAttribute('data-mark'),
    );
    await settleFocus();
    await expectControls('compare-length IndirectStrings', 'k', {
      objects: [obj(root, 'obj-0'), obj(root, 'obj-1')],
      spool: [spool],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
    await expect(
      boxGap(
        outlineBox(within(root).getByRole('button', { name: 'Check' })),
        spool.getBoundingClientRect(),
      ),
      'spool clear of Check and its ring',
    ).toBeGreaterThanOrEqual(11.5);
    await userEvent.click(obj(root, 'obj-1'));
    await settleFocus();
    // The ring encloses the whole log, inside its lane (evidence review: the log poked out).
    await expectRingsAround(root);
    // What is drawn (the log) apart from what is tapped (its lane-tall target).
    recordEvidence(root, {
      log_drawn: sizeOf(art(root, 'obj-1')),
      log_target: sizeOf(obj(root, 'obj-1')),
    });
    // The laid string lies along the log, end to end across its middle, inside the picked log's
    // ring (never on the ring's edge); strings are 6 px cords with end beads.
    const ring = (root.querySelector('.ni-clen__ring') as HTMLElement).getBoundingClientRect();
    const log = art(root, 'obj-1').getBoundingClientRect();
    const laid = (
      root.querySelector('[data-string="obj-1"] svg') as SVGElement
    ).getBoundingClientRect();
    await expect(laid.left).toBeCloseTo(log.left, 0);
    await expect(laid.width).toBeCloseTo(log.width, 0);
    await expect(laid.top + laid.height / 2).toBeCloseTo(log.top + log.height / 2, 0);
    await expect(laid.top - ring.top, 'string inside the ring').toBeGreaterThanOrEqual(6);
    await expect(ring.bottom - laid.bottom, 'string inside the ring').toBeGreaterThanOrEqual(6);
    const cord = root.querySelector('[data-string="obj-1"] .ni-string__cord') as SVGLineElement;
    await expect(Number.parseFloat(getComputedStyle(cord).strokeWidth)).toBeGreaterThanOrEqual(6);
    await expect(root.querySelectorAll('[data-string="obj-1"] .ni-string__end')).toHaveLength(2);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-1' });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual(
      expect.arrayContaining(['drag:string', 'drop:obj-1', 'tap:string', 'tap:obj-0', 'tap:obj-1']),
    );
  },
};

/**
 * MEA.07.t2 (review CR-1.5): the child lays a string along each log first (03 §5.5). Before both
 * strings are laid, tapping a log picks nothing and Check stays off; afterwards the pick submits,
 * and both string placements are in the trace before the pick.
 */
export const IndirectNeedsBothStrings: Story = {
  args: { config: indirect },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const check = within(root).getByRole('button', { name: 'Check' });
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'false');
    await expect(check).toBeDisabled();
    const spool = within(root).getByRole('button', { name: 'String' });
    await userEvent.click(spool);
    await userEvent.click(obj(root, 'obj-1'));
    await userEvent.click(obj(root, 'obj-0'));
    await expect(obj(root, 'obj-0')).toHaveAttribute('aria-pressed', 'false');
    await expect(check).toBeDisabled();
    await userEvent.click(spool);
    await userEvent.click(obj(root, 'obj-0'));
    await waitFor(() => expect(root.querySelectorAll('[data-string-row]')).toHaveLength(2));
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'obj-1' });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    const lastLay = Math.max(trace.lastIndexOf('tap:obj-0'), trace.indexOf('tap:obj-1'));
    await expect(trace.filter((e) => e === 'tap:string')).toHaveLength(2);
    await expect(trace.lastIndexOf('tap:obj-1')).toBeGreaterThan(lastLay - 1);
  },
};

/** How much longer: type the difference on the pad (smallest landscape area, compact pad). */
export const HowMuchLongerLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: difference, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, difference);
    await userEvent.click(within(root).getByRole('button', { name: '3' }));
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-clen__obj, .ni-pad__key, .ni-boxentry__box'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectNumeralsAtLeast32(root, '.ni-boxentry__text, .ni-pad__digit');
    // The unit ticks: their own strip, 12+ px from the lanes and from the answer box and keys;
    // ink ticks, 3 px every fifth unit and 2 px between (evidence review).
    const strip = (root.querySelector('.ni-clen__ticks') as HTMLElement).getBoundingClientRect();
    const lanes = [...root.querySelectorAll('.ni-clen__lane')].map((e) =>
      e.getBoundingClientRect(),
    );
    const below = [...root.querySelectorAll('.ni-boxentry__box, .ni-pad__key')].map((e) =>
      e.getBoundingClientRect(),
    );
    const toLanes = Math.min(...lanes.map((r) => strip.top - r.bottom));
    const toKeys = Math.min(...below.map((r) => boxGap(strip, r)));
    await expect(toLanes, 'ticks clear of the lanes').toBeGreaterThanOrEqual(12);
    await expect(toKeys, 'ticks clear of the keys').toBeGreaterThanOrEqual(12);
    const width = (sel: string) =>
      Number.parseFloat(getComputedStyle(root.querySelector(sel) as Element).strokeWidth);
    await expect(width('.ni-clen__tick--major')).toBeGreaterThanOrEqual(3);
    await expect(width('.ni-clen__tick:not(.ni-clen__tick--major)')).toBeGreaterThanOrEqual(2);
    // Ink (#264653), not the soft grey.
    for (const t of root.querySelectorAll('.ni-clen__tick')) {
      await expect(getComputedStyle(t).stroke, 'ink ticks').toBe('rgb(58, 45, 41)');
    }
    await expect(root.querySelectorAll('.ni-clen__tick')).toHaveLength(
      difference.objects.reduce((m, o) => Math.max(m, o.length), 0) + 1,
    );
    recordEvidence(root, {
      ticks_to_lanes: Math.round(toLanes),
      ticks_to_keys: Math.round(toKeys),
    });
    console.info(
      `[ticks] ${Math.round(toLanes)} px under the lanes, ${Math.round(toKeys)} px above the keys`,
    );
    await settleFocus();
    await expectControls('compare-length HowMuchLongerLandscapeMinK', 'k', {
      keys: [...root.querySelectorAll('.ni-pad__key')],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 3 });
  },
};

/**
 * Tap-only mode (06 §7, review CR-1.6): dragging the misaligned ribbon does nothing; a tap still
 * picks, and ← on the keyboard still lines it up.
 */
export const TapOnlyNoSlide: Story = {
  parameters: { ui: { tapOnly: true } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = obj(root, 'obj-0').getBoundingClientRect();
    await pointerDrag(
      obj(root, 'obj-0'),
      { x: r.left + r.width / 2 - 2 * unitPx(root), y: r.top + r.height / 2 },
      'touch',
    );
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '2');
    await expect(traceOf(args.onInteract).map((e) => e.t)).not.toContain('drag');
    obj(root, 'obj-0').focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '0');
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
  },
};

/** `disabled`: objects cannot be picked or slid. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'false');
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoAlign: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (the MEA.01.t1 solution): line up the short ribbon, mark the part that sticks out (exactly
 * the 4 units past the short one's end), then pick the longer one.
 */
export const DemoAlignDifference: Story = {
  args: { disabled: true, demo: demoAlign },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoAlign.play({ op: 'align', args: { id: 'obj-0' } });
    await expect(obj(root, 'obj-0')).toHaveAttribute('data-start', '0');
    await demoAlign.play({ op: 'highlight-difference' });
    const diff = root.querySelector('.ni-clen__diff') as HTMLElement;
    await expect(Number(diff.dataset.diffUnits)).toBe(4);
    await expect(diff.getBoundingClientRect().width).toBeCloseTo(4 * unitPx(root), 0);
    await demoAlign.play({ op: 'answer', args: { id: 'obj-1' } });
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(demoAlign.play({ op: 'drag' })).rejects.toBeInstanceOf(UnsupportedWidgetOpError);
  },
};

const demoStrings: WidgetDemo = createDemoController({ strict: true });

/** Demo (MEA.07.t2): strings on both logs, then the answer. */
export const DemoStrings: Story = {
  args: { config: indirect, disabled: true, demo: demoStrings },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoStrings.play({ op: 'lay-string', args: { id: 'obj-1' } });
    await demoStrings.play({ op: 'lay-string', args: { id: 'obj-0' } });
    await expect(root.querySelectorAll('[data-string-row]')).toHaveLength(2);
    await demoStrings.play({ op: 'answer', args: { id: 'obj-1' } });
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
  },
};

const demoOrder: WidgetDemo = createDemoController({ strict: true });

/** Demo: `answer {values}` puts the badges on the objects in that order. */
export const DemoOrderAnswer: Story = {
  args: { config: orderPictorial, tier: 'pictorial', disabled: true, demo: demoOrder },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoOrder.play({ op: 'answer', args: { values: [9, 6, 3] } });
    for (const [lane, n] of [
      ['obj-0', '0'],
      ['obj-1', '1'],
      ['obj-2', '2'],
    ]) {
      await expect(root.querySelector(`[data-lane="${lane}"] .ni-clen__badge`)).toHaveAttribute(
        'data-badge',
        n,
      );
    }
  },
};

const inviteDemo: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the object to line up. */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteDemo },
  // In the tablet widget area, as the app shows it (evidence review: the fill bar).
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteDemo.invite({ op: 'align', args: { id: 'obj-0' } });
    await waitFor(() =>
      expect(obj(root, 'obj-0').querySelector('.ni-clen__ring.ni-invite')).not.toBeNull(),
    );
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, obj(root, 'obj-0'), root);
    await expectHandStays(root, () => obj(root, 'obj-0'));
    // One ring round the whole ribbon, inside its lane, 12 px clear of the other object and Check.
    await expectOneInviteRing(root, {
      clearOf: [obj(root, 'obj-1'), within(root).getByRole('button', { name: 'Check' })],
    });
    const ring = await expectRingsAround(root);
    // The whole hand touches only the invited ribbon, and starts under its ring (never on the
    // ring's stroke): not the other ribbon or its lane.
    await expectHandTouchesOnlyInvited(root, [ring], { min: 3 });
    // 8+ px clear of the other lane and Check (evidence review), and the fingertip 8+ px above
    // its own lane's bottom border (its 4 px band), inside the ribbon's box.
    await expectHandTouchesOnlyInvited(
      root,
      [
        obj(root, 'obj-1'),
        root.querySelector('[data-lane="obj-1"]') as Element,
        within(root).getByRole('button', { name: 'Check' }),
      ],
      { min: 8 },
    );
    const handSvg = (root.querySelector('.ni-hand svg') as SVGSVGElement).getBoundingClientRect();
    const tipY = handSvg.top + handSvg.height * HAND_POINTER_TIP.up.y;
    const lane0 = (
      root.querySelector('[data-lane="obj-0"]') as HTMLElement
    ).getBoundingClientRect();
    const tipToBorder = lane0.bottom - 4 - tipY;
    await expect(tipToBorder, 'fingertip clear of the lane border').toBeGreaterThanOrEqual(8);
    recordEvidence(root, { tip_to_lane_border: Math.round(tipToBorder) });
    console.info(`[tip] fingertip ${Math.round(tipToBorder)} px above the lane border`);
  },
};

const inviteBadge: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn in `order` (K): Pip's hand points at badge 1, below its numeral (the hand never
 * covers it); one ring, inside the badge, 12 px clear of the other badges.
 */
export const DemoInviteBadgeAlignedK: Story = {
  globals: { ageMode: 'k' },
  args: { config: orderAligned, demo: inviteBadge },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteBadge.invite({ op: 'answer', args: { values: [2, 6, 9] } });
    await waitFor(() => expect(badge(root, 0)).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, badge(root, 0), root);
    await expectHandStays(root, () => badge(root, 0));
    await expectOneInviteRing(root, { clearOf: [badge(root, 1), badge(root, 2)] });
    // The whole hand touches only badge 1: not the other badges, a rope, a lane or Check.
    await expectHandTouchesOnlyInvited(root, [
      badge(root, 1),
      badge(root, 2),
      ...root.querySelectorAll('.ni-clen__obj, .ni-clen__lane'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
  },
};

const reducedDemo: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: lining up is instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Instant is checked by the effect, never by the clock: once the op resolves, the result
    // is drawn and nothing is still gliding.
    await reducedDemo.play({ op: 'align', args: { id: 'obj-0' } });
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => a.playState === 'running'),
    ).toHaveLength(0);
    await expect(getComputedStyle(obj(root, 'obj-0')).transitionDuration).toBe('0s');
    await expectToScale(root, misaligned);
  },
};

/**
 * Undo where it sits: a rope slid to the line goes back to where it started, by → on the
 * keyboard and by dragging it right again; each is traced, and the rope is named aloud.
 */
export const SlideBackUndo: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    const o = () => obj(root, 'obj-0');
    await expect(o()).toHaveAttribute('data-start', '2');
    o().focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(o()).toHaveAttribute('data-start', '0');
    clearSpies(audio);
    await userEvent.keyboard('{ArrowRight}');
    await expect(o()).toHaveAttribute('data-start', '2');
    await expect(audio.say).toHaveBeenCalled();
    // Again, by pointer: line it up, then drag it right, past half a unit.
    await userEvent.keyboard('{ArrowLeft}');
    await expect(o()).toHaveAttribute('data-start', '0');
    await new Promise((r) => setTimeout(r, 700));
    const r = o().getBoundingClientRect();
    await pointerDrag(o(), { x: r.left + r.width / 2 + r.width, y: r.top + 10 }, 'touch');
    await waitFor(() => expect(o()).toHaveAttribute('data-start', '2'));
    // A rope that never moved (it started on the line) has nowhere to go back to.
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    // Every reversal is an `undo`, by keyboard and by pointer alike (review round 1).
    await expect(trace).toEqual([
      'move:obj-0',
      'undo:obj-0',
      'move:obj-0',
      'drag:obj-0',
      'drop:back',
      'undo:obj-0',
    ]);
  },
};

const boundRopes: Config = {
  ...orderAligned,
  aligned: false,
  objects: [
    { id: 'obj-0', sprite: 'rope', length: CL_LENGTH_MAX, offset: 4 },
    { id: 'obj-1', sprite: 'rope', length: 16, offset: CL_OFFSET_MAX },
    { id: 'obj-2', sprite: 'rope', length: 4, offset: 0 },
  ],
};

/**
 * Stress, the model's bounds, K: three ropes, the longest 20 units, starting up to 8 units off
 * the line and reaching 24. Tablet area: lanes, badges and Check fit, to scale.
 */
export const StressBoundsTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: boundRopes },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(formatModel('compare-length')?.configSchema.safeParse(boundRopes).success).toBe(
      true,
    );
    await expectToScale(root, boundRopes);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-clen__obj, .ni-clen__badge'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    const badges = [...root.querySelectorAll<HTMLElement>('.ni-clen__badge')];
    for (const b of badges) await expectTargetSize(b, 'k');
    await expectTargetGaps(badges);
    for (const lane of root.querySelectorAll<HTMLElement>('.ni-clen__obj')) {
      await expectTargetSize(lane, 'k');
    }
  },
};

/** Stress, the model's bounds, K, smallest landscape area. */
export const StressBoundsLandscapeMinK: Story = {
  ...StressBoundsTabletK,
  render: inArea('landscapeMin'),
};

/**
 * Tap-only play (06 §7; review round 1): with no drags, a tap lines an offset rope up without
 * picking it; the next tap picks it; a tap on the picked rope slides it back (an `undo`). A rope
 * that starts on the line is picked by its first tap.
 */
export const TapOnlyLinesUpByTap: Story = {
  parameters: { ui: { tapOnly: true } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const o = () => obj(root, 'obj-0');
    await expect(o()).toHaveAttribute('data-start', '2');
    await userEvent.click(o());
    await expect(o()).toHaveAttribute('data-start', '0');
    await expect(o()).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(o());
    await expect(o()).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(o());
    await expect(o()).toHaveAttribute('data-start', '2');
    await userEvent.click(obj(root, 'obj-1'));
    await expect(obj(root, 'obj-1')).toHaveAttribute('aria-pressed', 'true');
    await expect(obj(root, 'obj-1')).toHaveAttribute('data-start', '0');
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual([
      'tap:obj-0',
      'move:obj-0',
      'tap:obj-0',
      'tap:obj-0',
      'undo:obj-0',
      'tap:obj-1',
    ]);
    await expect(trace).not.toContain('drag:obj-0');
  },
};
