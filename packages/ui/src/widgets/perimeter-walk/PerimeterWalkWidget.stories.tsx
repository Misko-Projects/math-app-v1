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
    ...root.querySelectorAll('.ni-pwalk__sign'),
  ]);
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
    const b = board(root).getBoundingClientRect();
    for (const dim of root.querySelectorAll('.ni-pwalk__dim')) {
      const d = dim.getBoundingClientRect();
      const gap = Math.max(b.left - d.right, d.left - b.right, b.top - d.bottom, d.top - b.bottom);
      await expect(
        gap,
        `${w}×${h}: "${dim.textContent}" clear of the board`,
      ).toBeGreaterThanOrEqual(6);
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
    await expect(within(root).getByRole('img', { name: 'Squares inside: 12' })).toBeInTheDocument();
    await pointerDrag(board(root), cellCentre(root, 4, 3), 'touch');
    await waitFor(() => expect(board(root)).toHaveAttribute('data-size', '4x3'));
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

/** Tablet widget area (G1+): the wide grid, the 6 × 2 at the same square size, controls fit. */
export const DesignTablet: Story = {
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
  },
};

/** Tablet widget area (G1+): the L-shaped fence, its numbers, the pad and Check fit, no scroll. */
export const MissingSideTablet: Story = {
  args: { config: lShape },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll(
        '.ni-pwalk__label, .ni-pwalk__fence, .ni-pad__key, .ni-entry__box, .ni-pwalk__sign',
      ),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectToScale(root, [6, 2, 4, 3, 2, 5]);
  },
};

/** Smallest landscape area (G1+): the same fits; labels keep the target size. */
export const MissingSideLandscapeMin: Story = {
  ...MissingSideTablet,
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      ...root.querySelectorAll(
        '.ni-pwalk__label, .ni-pwalk__fence, .ni-pad__key, .ni-entry__box, .ni-pwalk__sign',
      ),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const l of root.querySelectorAll('.ni-pwalk__label')) await expectTargetSize(l, 'g1-up');
    await expectToScale(root, [6, 2, 4, 3, 2, 5]);
  },
};

/** Smallest landscape area, design: the same wide layout fits with squares ≥ 40 px. */
export const DesignLandscapeMin: Story = {
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
    const corner = root.querySelector('.ni-pwalk__corner') as HTMLElement;
    await expectTargetSize(corner, 'g1-up');
    await expectDimsClear(root, [
      [12, 1],
      [4, 3],
      [1, 3],
    ]);
    await expectFitsArea(areaBox(canvasElement), [...root.querySelectorAll('.ni-pwalk__dim')]);
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
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, label(root, 2), root);
    await expectHandStays(root, () => label(root, 2));
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
