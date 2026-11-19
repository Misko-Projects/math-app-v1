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
  const size = Number.parseFloat(getComputedStyle(board(root)).backgroundSize);
  return { x: b.left + 3 + (c - 0.5) * size, y: b.top + 3 + (r - 0.5) * size };
}

/**
 * MEA.14: drag the corner to make a 4 × 3 rectangle (12 squares, not the 6 × 2). Arrow keys
 * change it too. The answer passes rect.perimeterArea; the 6 × 2 itself would not.
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

/** Smallest landscape area, design: the grid, the 6 × 2 to compare with and Check fit. */
export const DesignLandscapeMin: Story = {
  args: { config: design },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      board(root),
      root.querySelector('.ni-pwalk__ref') as HTMLElement,
      within(root).getByRole('button', { name: 'Check' }),
    ]);
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
