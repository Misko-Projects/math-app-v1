import { formatModel, PW_SIDES_MAX, stateChecker } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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
  expectApart,
  expectControls,
  expectHandTouchesOnlyInvited,
  expectOneInviteRing,
  keyRectsAfterEach,
  outlineBox,
  recordEvidence,
  settleFocus,
} from '../../test-support/evidence';
import {
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
 * `perimeter-walk` (03 §5.5; grade 3, K02 brings its generator `mea.perimeter`, so these are
 * hand-made configs the engine's schema accepts): a fence drawn to scale, side numbers to tap
 * (the Pebbling walks each side), and the total or a missing side to type; or a rectangle to
 * design on a grid.
 */

type Config = ConfigFor<'perimeter-walk'>;

/** MEA.06: a 5 × 3 garden on a grid; all the way around is 16. */
const rect: Config = {
  format: 'perimeter-walk',
  polygon: { sides: [5, 3, 5, 3], grid: true, shape: 'rect' },
  mode: 'total',
};
/** MEA.11: an L-shaped garden, 22 all the way around, one side missing (2). */
const lShape: Config = {
  format: 'perimeter-walk',
  polygon: { sides: [6, 2, 4, 3, null, 5], grid: true, shape: 'L' },
  mode: 'missing-side',
  perimeter: 22,
};
/** MEA.11: a five-sided pen, no grid, 21 all the way around; the missing side is 5. */
const pentagon: Config = {
  format: 'perimeter-walk',
  polygon: { sides: [4, 4, null, 4, 4], grid: false, shape: 'poly' },
  mode: 'missing-side',
  perimeter: 21,
};
/** MEA.14: the same area as a 6 × 2 garden (12 squares), but not the same garden. */
const design: Config = {
  format: 'perimeter-walk',
  polygon: { sides: [6, 2, 6, 2], grid: true, shape: 'rect' },
  mode: 'design',
  area: 12,
};

const meta = {
  title: 'Widgets/Perimeter walk',
  args: {
    config: rect as WidgetConfig,
    tier: 'pictorial',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // Evidence: every story leaves its key rects in the area's `data-evidence`.
  afterEach: keyRectsAfterEach('.ni-pwalk'),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-pwalk';
const label = (root: HTMLElement, i: number) =>
  root.querySelector(`[data-label-side="${i}"]`) as HTMLElement;
const sideLen = (root: HTMLElement, i: number) => {
  const l = root.querySelector(`line[data-side="${i}"]`) as SVGLineElement;
  return Math.hypot(
    l.x2.baseVal.value - l.x1.baseVal.value,
    l.y2.baseVal.value - l.y1.baseVal.value,
  );
};
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;

/** Every side is drawn in proportion to its number (one px scale for the whole fence). */
async function expectToScale(root: HTMLElement, lengths: number[]) {
  const unit = sideLen(root, 0) / (lengths[0] as number);
  for (let i = 0; i < lengths.length; i += 1) {
    await expect(sideLen(root, i), `side ${i}`).toBeCloseTo((lengths[i] as number) * unit, 3);
  }
}

/**
 * MEA.06: tap each side's number (the Pebbling walks it; the side turns solid), then type 16.
 * Sides are to scale and the numbers are ≥ 32 px.
 */
export const TotalRectangle: Story = {
  parameters: { ui: {} },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectToScale(root, [5, 3, 5, 3]);
    await expectSideLabels(root);
    await expectNumeralsAtLeast32(root, '.ni-pwalk__label');
    const labels = [0, 1, 2, 3].map((i) => label(root, i));
    for (const l of labels) await expectTargetSize(l, 'g1-up');
    await expectTargetGaps(labels);
    for (const l of labels) await userEvent.click(l);
    await waitFor(() => expect(root.querySelectorAll('.ni-pwalk__side--walked')).toHaveLength(4));
    await expect(root.querySelector('.ni-pwalk__walker')).not.toBeNull();
    await userEvent.click(key(root, '1'));
    await userEvent.click(key(root, '6'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 16 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:side-0',
      'tap:side-1',
      'tap:side-2',
      'tap:side-3',
      'tap:key-1',
      'tap:key-6',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * MEA.11 (L shape, tablet area): the missing side shows "?", is drawn exactly 2 long, and the
 * fence sign says 22. (Its notch needs 51.5 px a unit for both inner numbers beside their sides:
 * a 471 × 420 px fence, which the tablet area holds.)
 */
export const MissingSideL: Story = {
  args: { config: lShape },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(label(root, 4)).toHaveTextContent('?');
    await expectToScale(root, [6, 2, 4, 3, 2, 5]);
    await expectSideLabels(root);
    await expect(
      within(root).getByRole('img', { name: 'All the way around: 22' }),
    ).toBeInTheDocument();
    await userEvent.click(key(root, '2'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 2 });
  },
};

/** MEA.11 (a five-sided pen, no grid): the pen is drawn with every side to scale. */
export const MissingSidePentagon: Story = {
  args: { config: pentagon },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-pwalk__grid')).toBeNull();
    await expectToScale(root, [4, 4, 5, 4, 4]);
    await expectSideLabels(root);
    await userEvent.click(key(root, '5'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 5 });
  },
};

const board = (root: HTMLElement) => root.querySelector('.ni-pwalk__grid-board') as HTMLElement;
function cellCentre(root: HTMLElement, c: number, r: number) {
  const b = board(root).getBoundingClientRect();
  // One grid square is the board's background tile (border 3 px).
  const size = Number(board(root).dataset.cell);
  return { x: b.left + 3 + (c - 0.5) * size, y: b.top + 3 + (r - 0.5) * size };
}

const stepper = (root: HTMLElement, s: string) =>
  root.querySelector(`.ni-pwalk__step[data-step="${s}"]`) as HTMLButtonElement;
const designControls = (root: HTMLElement) => [
  ...root.querySelectorAll('.ni-pwalk__step'),
  within(root).getByRole('button', { name: 'Check' }),
];

/**
 * The design grid is wide and its squares are large (review CR-1.3 follow-up): 12 × 3 for area
 * 12 (columns for the longest side, rows for the longest short side), squares ≥ 40 px, the 6 × 2
 * drawn at the board's own square size, and the steppers and Check target-size, 12 px apart.
 */
async function expectDesignLayout(canvasElement: HTMLElement, root: HTMLElement, minCell = 40) {
  const cell = Number(board(root).dataset.cell);
  await expect(cell, 'square size').toBeGreaterThanOrEqual(minCell);
  const b = board(root).getBoundingClientRect();
  await expect(b.width - 6).toBeCloseTo(12 * cell, 0);
  await expect(b.height - 6).toBeCloseTo(3 * cell, 0);
  const ref = root.querySelector('.ni-pwalk__ref-rect') as SVGRectElement;
  await expect(ref.width.baseVal.value).toBeCloseTo(6 * cell, 3);
  await expect(ref.height.baseVal.value).toBeCloseTo(2 * cell, 3);
  for (const c of designControls(root)) await expectTargetSize(c, 'g1-up');
  await expectTargetGaps(designControls(root));
  await expectFitsArea(areaBox(canvasElement), [
    board(root),
    root.querySelector('.ni-pwalk__ref') as HTMLElement,
    ...designControls(root),
    ...root.querySelectorAll('.ni-pwalk__target, .ni-pwalk__yours'),
  ]);
  // The target says what to make, in words, apart from what the child has built (evidence
  // review: a bare "12" beside a 1 × 3 rectangle was confusing).
  await expect(
    within(root).getByRole('img', { name: 'Make 12 squares inside' }),
  ).toBeInTheDocument();
  await expect(root.querySelector('.ni-pwalk__target-line')).toHaveTextContent(
    'Make 12 squares inside',
  );
  await expectNumeralsAtLeast32(root, '.ni-pwalk__target-n, .ni-pwalk__yours-n');
  await expectContentCentred(canvasElement, root);
  await expectReferenceLabelled(root);
}

/**
 * The rectangle to compare with says what it is for (evidence review: it read as the target):
 * "Not this one" with a "≠" badge, in its own frame 12 px from the target's, its caption under
 * the picture (never on its squares).
 */
async function expectReferenceLabelled(root: HTMLElement) {
  const refEl = root.querySelector('.ni-pwalk__ref') as HTMLElement;
  await expect(refEl).toHaveTextContent('Not this one');
  await expect(refEl.querySelector('.ni-pwalk__ref-caption svg')).not.toBeNull();
  await expectApart(root.querySelector('.ni-pwalk__target') as Element, refEl, 12, 'target to ref');
  await expectApart(
    refEl.querySelector('.ni-pwalk__ref-caption') as Element,
    refEl.querySelector('.ni-pwalk__ref-rect') as Element,
    0,
    'caption off the squares',
  );
  const frame = getComputedStyle(refEl);
  const target = getComputedStyle(root.querySelector('.ni-pwalk__target-line') as Element);
  await expect(frame.borderTopStyle).toBe('dashed');
  await expect(frame.borderTopColor).not.toBe(target.borderTopColor);
  // The caption ("≠", size, "Not this one") is 12+ px inside the dashed border (evidence review:
  // 8 to 9 px).
  const r = refEl.getBoundingClientRect();
  const bw = Number.parseFloat(frame.borderTopWidth) || 0;
  let least = Number.POSITIVE_INFINITY;
  for (const part of refEl.querySelectorAll('.ni-pwalk__ref-caption > *')) {
    const c = part.getBoundingClientRect();
    least = Math.min(
      least,
      c.left - (r.left + bw),
      r.right - bw - c.right,
      r.bottom - bw - c.bottom,
    );
  }
  await expect(least, 'caption 12 px inside the dashed border').toBeGreaterThanOrEqual(12);
  recordEvidence(root, { caption_to_border: Math.round(least) });
  console.info(`[ref] caption to the dashed border: ${Math.round(least)} px`);
}

/** The widget's stage and answer row are centred across the area (evidence review). */
async function expectContentCentred(canvasElement: HTMLElement, root: HTMLElement) {
  const parts = [...root.querySelectorAll('.ni-pwalk__stage, .ni-pwalk__answer')].map((e) =>
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

/** Whether segments pq and ab properly cross (touching at an end does not count). */
function crosses(
  p: [number, number],
  q: [number, number],
  a: [number, number],
  b: [number, number],
): boolean {
  const o = (u: [number, number], v: [number, number], w: [number, number]) =>
    Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
  return o(p, q, a) * o(p, q, b) < 0 && o(a, b, p) * o(a, b, q) < 0;
}

/**
 * Every side's number sits outside the fence beside its own side (evidence review): no bubble
 * touches any side line (8 px clear), bubbles are 12 px apart, and each bubble's nearest side is
 * its own.
 */
async function expectSideLabels(root: HTMLElement) {
  const svg = (root.querySelector('.ni-pwalk__fence svg') as SVGSVGElement).getBoundingClientRect();
  const segs = [...root.querySelectorAll<SVGLineElement>('line.ni-pwalk__side')].map((l) => ({
    i: Number(l.dataset.side),
    a: [svg.left + l.x1.baseVal.value, svg.top + l.y1.baseVal.value] as [number, number],
    b: [svg.left + l.x2.baseVal.value, svg.top + l.y2.baseVal.value] as [number, number],
  }));
  const dist = (s: (typeof segs)[number], r: DOMRect) => {
    let best = Number.POSITIVE_INFINITY;
    for (let k = 0; k <= 60; k += 1) {
      const x = s.a[0] + ((s.b[0] - s.a[0]) * k) / 60;
      const y = s.a[1] + ((s.b[1] - s.a[1]) * k) / 60;
      best = Math.min(
        best,
        Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)),
      );
    }
    return best;
  };
  const labels = [...root.querySelectorAll<HTMLElement>('.ni-pwalk__label')];
  // Side lines are 6 px wide: a bubble's distance to a line is from its centre less 3.
  const strokeHalf =
    Number.parseFloat(
      getComputedStyle(root.querySelector('line.ni-pwalk__side') as Element).strokeWidth,
    ) / 2;
  let nearest = Number.POSITIVE_INFINITY;
  let farthest = 0;
  let offMid = 0;
  // A fence whose L notch cannot hold both its numbers in this area (the widget marks it): the
  // number that had to step out keeps a leader; recorded as an exception (reported for decision).
  const crowded =
    (root.querySelector('.ni-pwalk__fence') as HTMLElement).dataset.crowded === 'true';
  for (const l of labels) {
    const r = l.getBoundingClientRect();
    const own = Number(l.dataset.labelSide);
    const led = crowded && root.querySelector(`.ni-pwalk__leader[data-leader-for="${own}"]`);
    for (const s of segs) {
      const gap = dist(s, r) - strokeHalf;
      nearest = Math.min(nearest, gap);
      await expect(gap, `bubble ${own} 12 px clear of side ${s.i}`).toBeGreaterThanOrEqual(11.5);
    }
    // A number with a leader (a crowded notch, the smallest area) is checked by
    // `expectCrowdedLeaders` instead.
    if (led) continue;
    // Beside its own side: its centre lies across from the side (within the side's span, give or
    // take half the bubble), and nothing else of the fence lies between it and that side.
    const s = segs.find((x) => x.i === own) as (typeof segs)[number];
    const c: [number, number] = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const d = [(s.b[0] - s.a[0]) / len, (s.b[1] - s.a[1]) / len] as const;
    const t = (c[0] - s.a[0]) * d[0] + (c[1] - s.a[1]) * d[1];
    const half = (Math.abs(d[0]) * r.width + Math.abs(d[1]) * r.height) / 2;
    await expect(t, `bubble ${own} across from its side`).toBeGreaterThanOrEqual(-half);
    await expect(t, `bubble ${own} across from its side`).toBeLessThanOrEqual(len + half);
    // Directly beside its own side's midpoint (evidence review): moved along the side only to
    // keep 12 px from another bubble, by no more than a tenth of the side, and 12 to 24 px out
    // from the side's line.
    const shift = Math.abs(t - len / 2) / len;
    offMid = Math.max(offMid, shift);
    await expect(shift, `bubble ${own} at its side's midpoint`).toBeLessThanOrEqual(
      0.1 + 0.5 / len,
    );
    const ownGap = dist(s, r) - strokeHalf;
    farthest = Math.max(farthest, ownGap);
    await expect(ownGap, `bubble ${own} 12 to 24 px from its side`).toBeLessThanOrEqual(24.5);
    const tc = Math.min(len, Math.max(0, t));
    const foot: [number, number] = [s.a[0] + d[0] * tc, s.a[1] + d[1] * tc];
    for (const other of segs) {
      if (other.i === own) continue;
      await expect(
        crosses(c, foot, other.a, other.b),
        `no side between bubble ${own} and its side (side ${other.i})`,
      ).toBe(false);
    }
  }
  await expectTargetGaps(labels);
  if (crowded) await expectCrowdedLeaders(root, segs, strokeHalf);
  else await expectLeaders(root);
  recordEvidence(root, {
    bubble_to_side: `${Math.round(nearest)}-${Math.round(farthest)}`,
    bubble_off_mid_pct: Math.round(offMid * 100),
  });
  console.info(
    `[bubbles] ${Math.round(nearest)} to ${Math.round(farthest)} px from their sides; furthest from a midpoint ${Math.round(offMid * 100)} % of its side`,
  );
}

/**
 * A crowded L notch at the smallest area (decision on the evidence review: a leader there, and
 * only there): 1. exactly one straight leader per crowded side, out through the notch's opening
 * (its number outside the shape's bounding box); 2. its dot on that side's midpoint; 3. the leader
 * crosses no square, no other side and no other number, 12+ px clear of each; 4. its number 24+ px
 * from every other side's midpoint and every other number; 5. the stroke 2+ px, 3:1+ against what
 * is behind it. Records each value under `exceptions.crowded_notch`.
 */
async function expectCrowdedLeaders(
  root: HTMLElement,
  segs: { i: number; a: [number, number]; b: [number, number] }[],
  strokeHalf: number,
) {
  const svg = root.querySelector('.ni-pwalk__fence svg') as SVGSVGElement;
  const ctm = svg.getScreenCTM() as DOMMatrix;
  const client = (x: number, y: number): [number, number] => {
    const q = new DOMPoint(x, y).matrixTransform(ctm);
    return [q.x, q.y];
  };
  const toSeg = (q: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
    return Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy));
  };
  const toRect = (q: [number, number], r: DOMRect) =>
    Math.hypot(
      Math.max(r.left - q[0], 0, q[0] - r.right),
      Math.max(r.top - q[1], 0, q[1] - r.bottom),
    );
  const rectGap = (a: DOMRect, b: DOMRect) =>
    Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
  // The shape (corners in order) for "inside": its squares.
  const corners = [...segs].sort((x, y) => x.i - y.i).map((x) => x.a);
  const inside = (q: [number, number]) => {
    let inn = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
      const a = corners[i] as [number, number];
      const b = corners[j] as [number, number];
      if (
        a[1] > q[1] !== b[1] > q[1] &&
        q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        inn = !inn;
    }
    return inn;
  };
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const shapeBox = {
    l: Math.min(...xs),
    t: Math.min(...ys),
    r: Math.max(...xs),
    b: Math.max(...ys),
  };
  const labels = [...root.querySelectorAll<HTMLElement>('.ni-pwalk__label')];
  const groups = [...root.querySelectorAll<SVGGElement>('.ni-pwalk__leader')];
  // 1. The crowded sides: numbers more than 24 px from their own side. One leader each.
  const crowdedSides = labels
    .map((l) => Number(l.dataset.labelSide))
    .filter((i) => {
      const sg = segs.find((x) => x.i === i) as (typeof segs)[number];
      const r = (
        labels.find((l) => Number(l.dataset.labelSide) === i) as HTMLElement
      ).getBoundingClientRect();
      let best = Number.POSITIVE_INFINITY;
      for (let k = 0; k <= 60; k += 1) {
        const q: [number, number] = [
          sg.a[0] + ((sg.b[0] - sg.a[0]) * k) / 60,
          sg.a[1] + ((sg.b[1] - sg.a[1]) * k) / 60,
        ];
        best = Math.min(best, toRect(q, r));
      }
      // Not beside its midpoint: more than 24 px out, or further along than a tenth of the side.
      const len = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]) || 1;
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      const t = ((cx - sg.a[0]) * (sg.b[0] - sg.a[0]) + (cy - sg.a[1]) * (sg.b[1] - sg.a[1])) / len;
      return best - strokeHalf > 24.5 || Math.abs(t - len / 2) / len > 0.1 + 0.5 / len;
    });
  await expect(crowdedSides.length, 'a crowded side').toBeGreaterThan(0);
  await expect(groups.map((g) => Number(g.dataset.leaderFor)).sort()).toEqual(
    [...crowdedSides].sort(),
  );
  let dotOff = 0;
  let clear = Number.POSITIVE_INFINITY;
  let toMid = Number.POSITIVE_INFINITY;
  let toBubble = Number.POSITIVE_INFINITY;
  let strokePx = Number.POSITIVE_INFINITY;
  let ratio = Number.POSITIVE_INFINITY;
  let exits = true;
  for (const g of groups) {
    const i = Number(g.dataset.leaderFor);
    const poly = g.querySelector('polyline') as SVGPolylineElement;
    await expect(poly.points.numberOfItems, `leader ${i} straight`).toBe(2);
    const own = labels.find((l) => Number(l.dataset.labelSide) === i) as HTMLElement;
    const r = own.getBoundingClientRect();
    const c: [number, number] = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    const out = c[0] < shapeBox.l || c[0] > shapeBox.r || c[1] < shapeBox.t || c[1] > shapeBox.b;
    exits &&= out;
    await expect(out, `leader ${i} runs out through the notch's opening`).toBe(true);
    // 2. The dot on the side's midpoint.
    const sg = segs.find((x) => x.i === i) as (typeof segs)[number];
    const m: [number, number] = [(sg.a[0] + sg.b[0]) / 2, (sg.a[1] + sg.b[1]) / 2];
    const dotEl = g.querySelector('.ni-pwalk__leader-dot') as SVGCircleElement;
    const dot = client(dotEl.cx.baseVal.value, dotEl.cy.baseVal.value);
    const off = Math.hypot(dot[0] - m[0], dot[1] - m[1]);
    dotOff = Math.max(dotOff, off);
    await expect(off, `leader ${i}: its dot on the midpoint`).toBeLessThanOrEqual(1);
    // 3. Along the leader: no square, no other side, no other number, 12+ px clear of each.
    const total = poly.getTotalLength();
    for (let d = 3; d <= total; d += 2) {
      const pt = poly.getPointAtLength(total - d);
      const q = client(pt.x, pt.y);
      await expect(inside(q), `leader ${i} crosses a square`).toBe(false);
      for (const sgk of segs) {
        if (sgk.i === i) continue;
        clear = Math.min(clear, toSeg(q, sgk.a, sgk.b) - strokeHalf);
      }
      for (const o of labels)
        if (o !== own) clear = Math.min(clear, toRect(q, o.getBoundingClientRect()));
    }
    // 4. Its number 24+ px from every other side's midpoint and every other number.
    for (const sgk of segs) {
      if (sgk.i === i) continue;
      toMid = Math.min(toMid, toRect([(sgk.a[0] + sgk.b[0]) / 2, (sgk.a[1] + sgk.b[1]) / 2], r));
    }
    for (const o of labels)
      if (o !== own) toBubble = Math.min(toBubble, rectGap(r, o.getBoundingClientRect()));
    // 5. The stroke: 2+ px, 3:1+ against the area behind it.
    const cs = getComputedStyle(poly);
    strokePx = Math.min(strokePx, Number.parseFloat(cs.strokeWidth));
    const behind = getComputedStyle(
      (root.closest('.story-widget-area') ?? root.closest('.story-widget-stage')) as Element,
    ).backgroundColor;
    ratio = Math.min(ratio, contrast(cs.stroke, behind));
  }
  await expect(clear, 'leader clearance').toBeGreaterThanOrEqual(12);
  await expect(toMid, "number clear of other sides' midpoints").toBeGreaterThanOrEqual(24);
  await expect(toBubble, 'number clear of other numbers').toBeGreaterThanOrEqual(24);
  await expect(strokePx, 'leader stroke').toBeGreaterThanOrEqual(2);
  await expect(ratio, 'leader contrast').toBeGreaterThanOrEqual(3);
  const value = {
    leaders: groups.length,
    exits_notch: exits,
    dot_off_mid: Math.round(dotOff * 10) / 10,
    leader_clear: Math.round(clear),
    to_other_mid: Math.round(toMid),
    to_other_bubble: Math.round(toBubble),
    stroke: strokePx,
    contrast: Math.round(ratio * 10) / 10,
  };
  recordEvidence(root, { exceptions: { crowded_notch: value } });
  console.info(`[crowded] ${JSON.stringify(value)}`);
}

/**
 * Every side number either sits beside its own side (within 20 px of the middle half of it) or
 * has a leader (decision on the evidence review: a crowded L notch): an ink line, 2+ px, from the
 * bubble to a dot ON its own side within a quarter of the side from the midpoint, crossing no
 * other bubble. Records `leaders` (side index: the leader's length in px).
 */
async function expectLeaders(root: HTMLElement) {
  const svg = root.querySelector('.ni-pwalk__fence svg') as SVGSVGElement;
  const ctm = svg.getScreenCTM() as DOMMatrix;
  const client = (x: number, y: number): [number, number] => {
    const p = new DOMPoint(x, y).matrixTransform(ctm);
    return [p.x, p.y];
  };
  const toSeg = (p: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
    const tc = Math.max(0, Math.min(len, t));
    return {
      t,
      len,
      dist: Math.hypot(p[0] - (a[0] + (dx / len) * tc), p[1] - (a[1] + (dy / len) * tc)),
    };
  };
  const rectToSeg = (r: DOMRect, a: [number, number], b: [number, number]) => {
    let best = Number.POSITIVE_INFINITY;
    for (let k = 0; k <= 60; k += 1) {
      const x = a[0] + ((b[0] - a[0]) * k) / 60;
      const y = a[1] + ((b[1] - a[1]) * k) / 60;
      best = Math.min(
        best,
        Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)),
      );
    }
    return best;
  };
  const labels = [...root.querySelectorAll<HTMLElement>('.ni-pwalk__label')];
  const leaders: Record<string, number> = {};
  for (const l of labels) {
    const i = Number(l.dataset.labelSide);
    const line = root.querySelector(`line.ni-pwalk__side[data-side="${i}"]`) as SVGLineElement;
    const a = client(line.x1.baseVal.value, line.y1.baseVal.value);
    const b = client(line.x2.baseVal.value, line.y2.baseVal.value);
    const q1: [number, number] = [a[0] + (b[0] - a[0]) / 4, a[1] + (b[1] - a[1]) / 4];
    const q3: [number, number] = [a[0] + (3 * (b[0] - a[0])) / 4, a[1] + (3 * (b[1] - a[1])) / 4];
    const r = l.getBoundingClientRect();
    const g = root.querySelector(`.ni-pwalk__leader[data-leader-for="${i}"]`);
    if (!g) {
      await expect(
        rectToSeg(r, q1, q3),
        `bubble ${i} beside its side's middle (or it would have a leader)`,
      ).toBeLessThanOrEqual(20.5);
      continue;
    }
    const dotEl = g.querySelector('.ni-pwalk__leader-dot') as SVGCircleElement;
    const dot = client(dotEl.cx.baseVal.value, dotEl.cy.baseVal.value);
    const on = toSeg(dot, a, b);
    await expect(on.dist, `leader ${i}: its dot on its side`).toBeLessThanOrEqual(1.5);
    await expect(
      Math.abs(on.t - on.len / 2),
      `leader ${i}: its dot near the side's midpoint`,
    ).toBeLessThanOrEqual(on.len / 10 + 0.5);
    const poly = g.querySelector('polyline') as SVGPolylineElement;
    const cs = getComputedStyle(poly);
    await expect(Number.parseFloat(cs.strokeWidth), `leader ${i}: 2+ px`).toBeGreaterThanOrEqual(2);
    await expect(cs.stroke, `leader ${i}: ink`).toBe('rgb(38, 70, 83)');
    const total = poly.getTotalLength();
    // Short, and crossing no side (a leader only where unavoidable; evidence review).
    await expect(total, `leader ${i}: 40 px or less`).toBeLessThanOrEqual(40);
    for (let d = 0; d <= total; d += 2) {
      const p = poly.getPointAtLength(d);
      const [x, y] = client(p.x, p.y);
      for (const o of labels) {
        if (o === l) continue;
        const or = o.getBoundingClientRect();
        const inside = x > or.left && x < or.right && y > or.top && y < or.bottom;
        await expect(inside, `leader ${i} crosses bubble ${o.dataset.labelSide}`).toBe(false);
      }
    }
    leaders[String(i)] = Math.round(total);
  }
  recordEvidence(root, { leaders });
  console.info(`[leaders] ${JSON.stringify(leaders)}`);
}

/**
 * The rectangle's side numbers (top and left) sit outside the board, at least 6 px clear of its
 * border box, for each size built with the arrow keys (review CR-1.3 follow-up).
 */
async function expectDimsClear(root: HTMLElement, sizes: [number, number][]) {
  for (const [w, h] of sizes) {
    board(root).focus();
    const [cw, ch] = (board(root).dataset.size ?? '0x0').split('x').map(Number) as [number, number];
    const from = cw === 0 ? [1, 1] : [cw, ch];
    if (cw === 0) await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    const keys = [
      ...Array(Math.max(0, w - (from[0] as number))).fill('{ArrowRight}'),
      ...Array(Math.max(0, (from[0] as number) - w)).fill('{ArrowLeft}'),
      ...Array(Math.max(0, h - (from[1] as number))).fill('{ArrowDown}'),
      ...Array(Math.max(0, (from[1] as number) - h)).fill('{ArrowUp}'),
    ].join('');
    if (keys) await userEvent.keyboard(keys);
    await expect(board(root)).toHaveAttribute('data-size', `${w}x${h}`);
    await expectGripOutside(root, `${w}×${h}`);
    // The board has focus here: its outermost line (frame or focus ring) counts.
    const b = outlineBox(board(root));
    for (const dim of root.querySelectorAll('.ni-pwalk__dim')) {
      await expect(
        boxGap(b, dim.getBoundingClientRect()),
        `${w}×${h}: "${dim.textContent}" 12 px clear of the board's frame`,
      ).toBeGreaterThanOrEqual(11.5);
    }
  }
}

/**
 * The grip (evidence review): its visible disc is at least 64 px, it lies wholly outside the
 * grid (its frame included), so it covers no square, built or not, and it is below-right of the
 * rectangle's corner.
 */
async function expectGripOutside(root: HTMLElement, what: string) {
  const svg = root.querySelector('.ni-pwalk__corner svg') as SVGSVGElement;
  const s = svg.getBoundingClientRect();
  const disc = root.querySelector('.ni-pwalk__grip-disc') as SVGCircleElement;
  const d = disc.getBoundingClientRect();
  const scale = s.width / 64;
  const stroke = (Number.parseFloat(getComputedStyle(disc).strokeWidth) || 0) * scale;
  const visible = {
    left: d.left - stroke / 2,
    top: d.top - stroke / 2,
    right: d.right + stroke / 2,
    bottom: d.bottom + stroke / 2,
  };
  const size = visible.right - visible.left;
  await expect(size, `${what}: the grip's disc`).toBeGreaterThanOrEqual(64);
  const b = board(root).getBoundingClientRect();
  const toGrid = boxGap(visible, b);
  await expect(toGrid, `${what}: the grip outside the grid`).toBeGreaterThanOrEqual(0);
  const built = (root.querySelector('.ni-pwalk__rect') as Element).getBoundingClientRect();
  // Below-right of the rectangle's corner: wholly right of its column, its centre below its row.
  await expect(visible.left, `${what}: right of the corner`).toBeGreaterThanOrEqual(built.right);
  await expect((visible.top + visible.bottom) / 2, `${what}: below the corner`).toBeGreaterThan(
    built.bottom,
  );
  const place = (root.querySelector('.ni-pwalk__corner') as HTMLElement).dataset.place;
  recordEvidence(root, {
    grip_disc: Math.round(size),
    grip_to_grid: Math.round(toGrid),
    grip_place: place,
  });
  console.info(
    `[grip] ${what}: disc ${Math.round(size)} px, ${Math.round(toGrid)} px off the grid (${place})`,
  );
}

/**
 * MEA.14: drag the corner to make a 4 × 3 rectangle (12 squares, not the 6 × 2). Arrow keys
 * change it too. The answer passes rect.perimeterArea; the 6 × 2 itself would not. The grid is
 * wide (12 × 3): a 1 × 12 answer is built lying down as 12 × 1, which the checker takes as the
 * same rectangle (a turned rectangle is the same one).
 */
export const DesignSameArea: Story = {
  args: { config: design },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(
      within(root).getByRole('img', { name: 'Make 12 squares inside' }),
    ).toBeInTheDocument();
    await pointerDrag(board(root), cellCentre(root, 4, 3), 'touch');
    await waitFor(() => expect(board(root)).toHaveAttribute('data-size', '4x3'));
    // The child's own rectangle, apart from the target: 12 squares, 14 all the way around.
    await expect(
      within(root).getByRole('img', {
        name: 'Your rectangle: 12 squares inside, 14 all the way around',
      }),
    ).toBeInTheDocument();
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const target = { area: 12, differentFrom: { w: 6, h: 2 } };
    const r = (args.onResponse as ReturnType<typeof fn>).mock.calls.at(-1)?.[0] as ResponseValue & {
      value: Record<string, unknown>;
    };
    await expect(r.value).toEqual({ w: 4, h: 3 });
    await expect(stateChecker('rect.perimeterArea')?.check(target, r.value)).toBe(true);
    board(root).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowUp}');
    await expect(board(root)).toHaveAttribute('data-size', '6x2');
    await expect(stateChecker('rect.perimeterArea')?.check(target, { w: 6, h: 2 })).toBe(false);
    await expectNumeralsAtLeast32(root, '.ni-pwalk__dim');
    // Every rectangle the checker accepts can be built (review CR-1.3): 12 × 1 and 1 × 12.
    const submitSize = async (w: number, h: number) => {
      board(root).focus();
      const [cw, ch] = (board(root).dataset.size ?? '1x1').split('x').map(Number) as [
        number,
        number,
      ];
      const keys = [
        ...Array(Math.max(0, w - cw)).fill('{ArrowRight}'),
        ...Array(Math.max(0, cw - w)).fill('{ArrowLeft}'),
        ...Array(Math.max(0, h - ch)).fill('{ArrowDown}'),
        ...Array(Math.max(0, ch - h)).fill('{ArrowUp}'),
      ].join('');
      await userEvent.keyboard(keys);
      await expect(board(root)).toHaveAttribute('data-size', `${w}x${h}`);
      // Check is debounced (400 ms, 06 §4) after the previous answer.
      await new Promise((r) => setTimeout(r, 450));
      await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
      const last = (args.onResponse as ReturnType<typeof fn>).mock.calls.at(-1)?.[0] as {
        value: Record<string, unknown>;
      };
      await expect(last.value).toEqual({ w, h });
      await expect(stateChecker('rect.perimeterArea')?.check(target, last.value)).toBe(true);
    };
    await submitSize(12, 1);
    // 1 × 12 is the same rectangle turned: the checker accepts it, and the grid builds it lying
    // down; the board stops at 3 rows.
    await expect(stateChecker('rect.perimeterArea')?.check(target, { w: 1, h: 12 })).toBe(true);
    board(root).focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await expect(board(root)).toHaveAttribute('data-size', '12x3');
    await settleFocus();
  },
};

/** MEA.14 with the steppers: add columns and rows one at a time, then Check. */
export const DesignSteppers: Story = {
  args: { config: design },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(stepper(root, 'w-less')).toBeDisabled();
    await userEvent.click(stepper(root, 'w-more'));
    await expect(board(root)).toHaveAttribute('data-size', '1x1');
    for (let i = 0; i < 3; i += 1) await userEvent.click(stepper(root, 'w-more'));
    await userEvent.click(stepper(root, 'h-more'));
    await userEvent.click(stepper(root, 'h-more'));
    await expect(board(root)).toHaveAttribute('data-size', '4x3');
    await expect(stepper(root, 'h-more')).toBeDisabled();
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { w: 4, h: 3 } });
    await expect(
      within(root).getByRole('button', { name: 'Take away a column' }),
    ).toBeInTheDocument();
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.slice(0, 2)).toEqual(['tap:col-more', 'tap:col-more']);
  },
};

/**
 * The design composition as SEEN (the target, the reference, the grid, its numbers, the grip, the
 * steppers, "yours" and Check) is centred across its area or stage, left and right margins
 * within 4 px (evidence review: 40 / 115 px while the widget box measured centred). Records them.
 */
async function expectDesignCentred(root: HTMLElement) {
  const host = (root.closest('.story-widget-area') ??
    root.closest('.story-widget-stage')) as HTMLElement;
  const h = host.getBoundingClientRect();
  const parts = [
    ...root.querySelectorAll(
      '.ni-pwalk__target, .ni-pwalk__ref, .ni-pwalk__grid-board, .ni-pwalk__corner svg, .ni-pwalk__dim, .ni-pwalk__step, .ni-pwalk__yours',
    ),
    within(root).getByRole('button', { name: 'Check' }),
  ].map((e) => e.getBoundingClientRect());
  const left = Math.min(...parts.map((r) => r.left)) - h.left;
  const right = h.right - Math.max(...parts.map((r) => r.right));
  await expect(Math.abs(left - right), 'the composition centred').toBeLessThanOrEqual(4);
  recordEvidence(root, { composition_lr: `${Math.round(left)}/${Math.round(right)}` });
  console.info(`[composition] L/R ${Math.round(left)}/${Math.round(right)}`);
}

/** The corner grip (evidence review): visible, target-size, and the other controls' sizes. */
async function expectDesignControls(story: string, root: HTMLElement) {
  await expectControls(story, 'g1-up', {
    grip: [root.querySelector('.ni-pwalk__corner svg') as Element],
    steppers: [...root.querySelectorAll('.ni-pwalk__step')],
    check: [within(root).getByRole('button', { name: 'Check' })],
  });
}

/**
 * Tablet widget area (G1+). The grid is WIDE on purpose: rect.perimeterArea takes a turned
 * rectangle as the same one, so every accepted rectangle is built lying down (area 12: 12 × 3,
 * and 1 × 12 is built as 12 × 1). The 6 × 2 is drawn at the board's square size under the
 * target ("Make 12 squares inside"); the grip, steppers and Check are target-size.
 */
export const DesignWideGridTablet: Story = {
  args: { config: design },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectDesignLayout(canvasElement, root);
    await expectDimsClear(root, [
      [12, 1],
      [4, 3],
      [1, 3],
    ]);
    await settleFocus();
    await expectDesignControls('perimeter-walk DesignWideGridTablet', root);
    await expectDesignCentred(root);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-pwalk__dim, .ni-pwalk__corner'),
    ]);
  },
};

/** A fence story at an area: fits, to scale, side numbers placed right, controls measured. */
const fencePlay =
  (story: string, lengths: number[]) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll(
        '.ni-pwalk__label, .ni-pwalk__fence, .ni-pad__key, .ni-boxentry__box, .ni-pwalk__sign',
      ),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const l of root.querySelectorAll('.ni-pwalk__label')) await expectTargetSize(l, 'g1-up');
    await expectToScale(root, lengths);
    await expectSideLabels(root);
    await expectNumeralsAtLeast32(root, '.ni-pwalk__label');
    await expectControls(story, 'g1-up', {
      'side numbers': [...root.querySelectorAll('.ni-pwalk__label')],
      keys: [...root.querySelectorAll('.ni-pad__key')],
      box: [...root.querySelectorAll('.ni-boxentry__box')],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
    await expectContentCentred(canvasElement, root);
  };

/** Tablet widget area (G1+): the L-shaped fence, its numbers, the pad and Check fit, no scroll. */
export const MissingSideTablet: Story = {
  args: { config: lShape },
  render: inArea('tablet'),
  play: fencePlay('perimeter-walk MissingSideTablet', [6, 2, 4, 3, 2, 5]),
};

/** Smallest landscape area (G1+): the same fits; labels keep the target size. */
export const MissingSideLandscapeMin: Story = {
  ...MissingSideTablet,
  render: inArea('landscapeMin'),
  play: fencePlay('perimeter-walk MissingSideLandscapeMin', [6, 2, 4, 3, 2, 5]),
};

/** Stress: a 20 × 15 garden (MEA.06 shape, sides up to 20); all the way around is 70. */
const bigRect: Config = {
  format: 'perimeter-walk',
  polygon: { sides: [20, 15, 20, 15], grid: true, shape: 'rect' },
  mode: 'total',
};
/** Stress: an L-shaped garden with sides up to 20, 70 all the way around, the 8 missing. */
const bigL: Config = {
  format: 'perimeter-walk',
  polygon: { sides: [20, 6, 12, 9, null, 15], grid: true, shape: 'L' },
  mode: 'missing-side',
  perimeter: 70,
};

/** Stress, tablet area: the 20 × 15 garden, to scale, numbers beside their sides. */
export const StressBigRectTablet: Story = {
  args: { config: bigRect },
  render: inArea('tablet'),
  play: fencePlay('perimeter-walk StressBigRectTablet', [20, 15, 20, 15]),
};
/** Stress, smallest landscape area: the 20 × 15 garden. */
export const StressBigRectLandscapeMin: Story = {
  ...StressBigRectTablet,
  render: inArea('landscapeMin'),
  play: fencePlay('perimeter-walk StressBigRectLandscapeMin', [20, 15, 20, 15]),
};
/** Stress, tablet area: the big L (sides up to 20), the missing side drawn exactly 8 long. */
export const StressBigLTablet: Story = {
  args: { config: bigL },
  render: inArea('tablet'),
  play: fencePlay('perimeter-walk StressBigLTablet', [20, 6, 12, 9, 8, 15]),
};
/** Stress, smallest landscape area: the big L. */
export const StressBigLLandscapeMin: Story = {
  ...StressBigLTablet,
  render: inArea('landscapeMin'),
  play: fencePlay('perimeter-walk StressBigLLandscapeMin', [20, 6, 12, 9, 8, 15]),
};

/**
 * Smallest landscape area, design: the same wide grid (a turned rectangle is the same one, so
 * every answer is built lying down) fits with squares ≥ 36 px (40+ at the tablet area).
 */
export const DesignWideGridLandscapeMin: Story = {
  args: { config: design },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // The smallest area: the side column (target, the labelled 6 × 2) leaves squares of at least
    // 36 px; 40+ at the tablet area.
    await expectDesignLayout(canvasElement, root, 36);
    // Squares under a target's size: a tap on one does nothing (the steppers are the tap path),
    // dragging the corner still works.
    await expect(Number(board(root).dataset.cell)).toBeLessThan(64);
    const p = cellCentre(root, 3, 2);
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: board(root),
      coords: { clientX: p.x, clientY: p.y },
    });
    await expect(board(root)).not.toHaveAttribute('data-size');
    await pointerDrag(board(root), cellCentre(root, 12, 1), 'touch');
    await waitFor(() => expect(board(root)).toHaveAttribute('data-size', '12x1'));
    const corner = root.querySelector('.ni-pwalk__corner svg') as Element;
    await expectTargetSize(corner, 'g1-up');
    await expectDimsClear(root, [
      [12, 1],
      [4, 3],
      [1, 3],
    ]);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-pwalk__dim, .ni-pwalk__corner'),
    ]);
    await settleFocus();
    await expectDesignControls('perimeter-walk DesignWideGridLandscapeMin', root);
    await expectDesignCentred(root);
  },
};

/**
 * Smallest landscape area, design, a 4 × 3 rectangle built (evidence review: no shot showed the
 * grip there): the grip right of the grid's frame, 64 px, fully inside the area, covering no
 * square; the composition centred.
 */
export const DesignBuiltLandscapeMin: Story = {
  args: { config: design },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    board(root).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}{ArrowDown}');
    await expect(board(root)).toHaveAttribute('data-size', '4x3');
    await settleFocus();
    await expectGripOutside(root, '4×3');
    const grip = root.querySelector('.ni-pwalk__corner') as HTMLElement;
    await expectFitsArea(areaBox(canvasElement), [
      grip,
      board(root),
      ...root.querySelectorAll(
        '.ni-pwalk__dim, .ni-pwalk__step, .ni-pwalk__target, .ni-pwalk__ref',
      ),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expect(getComputedStyle(grip).visibility).toBe('visible');
    await expectDesignCentred(root);
    await expectDesignControls('perimeter-walk DesignBuiltLandscapeMin', root);
  },
};

/**
 * MEA.14 with nothing to differ from (no `differentFrom`: the item gives no rectangle): the
 * target alone ("Make it 20 all the way around"), no reference drawn. Any rectangle with a fence
 * of 20 passes, e.g. 6 × 4.
 */
export const DesignNoReferenceTablet: Story = {
  args: {
    config: {
      format: 'perimeter-walk',
      polygon: { sides: [], grid: true, shape: 'rect' },
      mode: 'design',
      perimeter: 20,
    },
  },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-pwalk__ref')).toBeNull();
    await expect(
      within(root).getByRole('img', { name: 'Make it 20 all the way around' }),
    ).toBeInTheDocument();
    for (let i = 0; i < 6; i += 1) await userEvent.click(stepper(root, 'w-more'));
    for (let i = 0; i < 3; i += 1) await userEvent.click(stepper(root, 'h-more'));
    await expect(board(root)).toHaveAttribute('data-size', '6x4');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const r = (args.onResponse as ReturnType<typeof fn>).mock.calls.at(-1)?.[0] as {
      value: Record<string, unknown>;
    };
    await expect(stateChecker('rect.perimeterArea')?.check({ perimeter: 20 }, r.value)).toBe(true);
    await expectFitsArea(areaBox(canvasElement), [
      board(root),
      ...root.querySelectorAll('.ni-pwalk__target, .ni-pwalk__step, .ni-pwalk__corner'),
    ]);
    await settleFocus();
  },
};

/**
 * Tap-only mode (06 §7, review CR-1.6): dragging the rectangle's corner does nothing; the
 * steppers and the arrow keys still change it.
 */
export const TapOnlyDesign: Story = {
  args: { config: design },
  parameters: { ui: { tapOnly: true } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(board(root), cellCentre(root, 4, 3), 'touch');
    await expect(board(root)).not.toHaveAttribute('data-size');
    await userEvent.click(stepper(root, 'w-more'));
    await userEvent.click(stepper(root, 'w-more'));
    await userEvent.click(stepper(root, 'h-more'));
    await expect(board(root)).toHaveAttribute('data-size', '2x2');
    board(root).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(board(root)).toHaveAttribute('data-size', '3x2');
    await settleFocus();
  },
};

/** `disabled`: nothing can be walked or typed. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(label(root, 0)).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoWalk: WidgetDemo = createDemoController({ strict: true });

/** Demo: the Pebbling walks two sides, then the whole fence (`trace`), then 16 is typed. */
export const DemoWalk: Story = {
  args: { disabled: true, demo: demoWalk },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoWalk.play({ op: 'walk-side', args: { index: 0 } });
    await demoWalk.play({ op: 'add-label', args: { index: 1 } });
    await expect(root.querySelectorAll('.ni-pwalk__side--walked')).toHaveLength(1);
    await demoWalk.play({ op: 'trace' });
    await expect(root.querySelectorAll('.ni-pwalk__side--walked')).toHaveLength(4);
    await demoWalk.play({ op: 'answer', args: { value: 16 } });
    await expect(root.querySelector('.ni-boxentry__text')).toHaveTextContent('16');
    await expect(demoWalk.play({ op: 'drag' })).rejects.toBeInstanceOf(UnsupportedWidgetOpError);
  },
};

const inviteDemo: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the side to walk. */
export const DemoInvite: Story = {
  args: { demo: inviteDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteDemo.invite({ op: 'walk-side', args: { index: 2 } });
    await waitFor(() => expect(label(root, 2)).toHaveClass('ni-invite'));
    // The hand points at the bubble without covering its numeral (expectPointerOn checks it).
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, label(root, 2), root);
    await expectHandStays(root, () => label(root, 2));
    // One ring, inside the bubble, 12 px clear of the other side numbers.
    await expectOneInviteRing(root, {
      clearOf: [...root.querySelectorAll('.ni-pwalk__label')],
    });
  },
};

const inviteDesign: WidgetDemo = createDemoController({ strict: true });

/** The child's turn in design: the board is invited (one ring, inside its frame). */
export const DemoInviteDesign: Story = {
  args: { config: design, demo: inviteDesign },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteDesign.invite({ op: 'answer', args: { values: [4, 3] } });
    // A real control is invited (evidence review: the board was): "one more column", the first
    // step. One ring, inside it; the hand on it, clear of its "+" and of every other control.
    const plus = () => stepper(root, 'w-more');
    await waitFor(() => expect(plus()).toHaveClass('ni-invite'));
    await expect(board(root)).not.toHaveClass('ni-invite');
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, plus(), root);
    await expectHandStays(root, plus);
    const others = [
      ...[...root.querySelectorAll('.ni-pwalk__step')].filter((s) => s !== plus()),
      within(root).getByRole('button', { name: 'Check' }),
    ];
    await expectOneInviteRing(root, { clearOf: [...others, board(root)] });
    await expectHandTouchesOnlyInvited(root, [...others, board(root)]);
    await expectDesignCentred(root);
  },
};

const reducedDemo: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: walking the whole fence is instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Instant is checked by the effect, never by the clock: once the op resolves, the result
    // is drawn and nothing is still gliding.
    await reducedDemo.play({ op: 'trace' });
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => a.playState === 'running'),
    ).toHaveLength(0);
    await waitFor(() => expect(root.querySelectorAll('.ni-pwalk__side--walked')).toHaveLength(4));
  },
};

/**
 * Undo where it sits: a walked side tapped again is un-walked (pointer and keyboard), its number
 * said either way, and traced as `undo`.
 */
export const UnwalkSide: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    const walked = () => root.querySelectorAll('.ni-pwalk__side--walked').length;
    await userEvent.click(label(root, 0));
    await waitFor(() => expect(walked()).toBe(1));
    await expect(label(root, 0)).toHaveAttribute('aria-pressed', 'true');
    clearSpies(audio);
    await userEvent.click(label(root, 0));
    await waitFor(() => expect(walked()).toBe(0));
    await expect(label(root, 0)).toHaveAttribute('aria-pressed', 'false');
    // The side's number is said on the undo tap too.
    await expect(audio.say.mock.calls.length + audio.sayPhrases.mock.calls.length).toBeGreaterThan(
      0,
    );
    await expect(root.querySelector('.ni-pwalk__walker')).toBeNull();
    // Keyboard: Enter walks side 2, Enter again un-walks it.
    label(root, 1).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(walked()).toBe(1));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(walked()).toBe(0));
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual([
      'tap:side-0',
      'tap:side-0',
      'undo:side-0',
      'tap:side-1',
      'tap:side-1',
      'undo:side-1',
    ]);
  },
};

const hexagon: Config = {
  format: 'perimeter-walk',
  polygon: {
    // A regular hexagon with sides of 8 is 16 wide and about 13.9 tall: inside 20 × 15.
    sides: Array.from({ length: PW_SIDES_MAX }, () => 8),
    grid: false,
    shape: 'poly',
  },
  mode: 'total',
};

/** Stress, the model's bounds, smallest landscape area: six sides, the figure about 14 tall. */
export const StressSixSidesLandscapeMin: Story = {
  args: { config: hexagon },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(formatModel('perimeter-walk')?.configSchema.safeParse(hexagon).success).toBe(true);
    const labels = Array.from({ length: PW_SIDES_MAX }, (_, i) => label(root, i));
    await expectFitsArea(areaBox(canvasElement), [
      ...labels,
      root.querySelector('.ni-pwalk__fence') as Element,
      ...root.querySelectorAll('.ni-pad__key, .ni-boxentry__box'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const l of labels) await expectTargetSize(l, 'g1-up');
    await expectTargetGaps(labels);
    await expectNumeralsAtLeast32(root, '.ni-pwalk__label');
  },
};

const designSix: Config = {
  format: 'perimeter-walk',
  polygon: { sides: [], grid: true, shape: 'rect' },
  mode: 'design',
  area: 25,
  perimeter: 20,
};

/** Stress, the model's bounds, smallest landscape area: design a 5 × 5 (the grid's five rows). */
export const StressDesignFiveRowsLandscapeMin: Story = {
  args: { config: designSix },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(formatModel('perimeter-walk')?.configSchema.safeParse(designSix).success).toBe(
      true,
    );
    const steppers = [...root.querySelectorAll<HTMLElement>('.ni-pwalk__step')];
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll('.ni-pwalk__grid, .ni-pwalk__grip, .ni-pwalk__step'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const s of steppers) await expectTargetSize(s, 'g1-up');
  },
};
