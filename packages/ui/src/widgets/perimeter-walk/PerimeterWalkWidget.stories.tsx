import { stateChecker } from '@number-island/engine';
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
  expectControls,
  expectOneInviteRing,
  outlineBox,
} from '../../test-support/evidence';
import { expectTargetGaps, expectTargetSize, pointerDrag } from '../../test-support/storyHelpers';
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

/** MEA.11 (L shape): the missing side shows "?", is drawn exactly 2 long, and the fence sign says 22. */
export const MissingSideL: Story = {
  args: { config: lShape },
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
async function expectDesignLayout(canvasElement: HTMLElement, root: HTMLElement) {
  const cell = Number(board(root).dataset.cell);
  await expect(cell, 'square size').toBeGreaterThanOrEqual(40);
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
  for (const l of labels) {
    const r = l.getBoundingClientRect();
    const own = Number(l.dataset.labelSide);
    for (const s of segs) {
      await expect(dist(s, r), `bubble ${own} clear of side ${s.i}`).toBeGreaterThanOrEqual(7.5);
    }
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
    await expectDesignControls('perimeter-walk DesignWideGridTablet', root);
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
        '.ni-pwalk__label, .ni-pwalk__fence, .ni-pad__key, .ni-entry__box, .ni-pwalk__sign',
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
      box: [...root.querySelectorAll('.ni-entry__box')],
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
 * every answer is built lying down) fits with squares ≥ 40 px.
 */
export const DesignWideGridLandscapeMin: Story = {
  args: { config: design },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectDesignLayout(canvasElement, root);
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
    await expectDesignControls('perimeter-walk DesignWideGridLandscapeMin', root);
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
    await expect(root.querySelector('.ni-entry__text')).toHaveTextContent('16');
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
    await waitFor(() => expect(board(root)).toHaveClass('ni-invite'));
    await expectHandStays(root, () => board(root));
    await expectOneInviteRing(root, {
      clearOf: [...root.querySelectorAll('.ni-pwalk__step, .ni-pwalk__ref')],
    });
  },
};

const reducedDemo: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: walking the whole fence is instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedDemo.play({ op: 'trace' });
    await expect(performance.now() - started).toBeLessThan(500);
    await waitFor(() => expect(root.querySelectorAll('.ni-pwalk__side--walked')).toHaveLength(4));
  },
};
