import { stateChecker } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { areaBox, expectFitsArea, inArea } from '../../test-support/fractionStoryArea';
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
 * `fraction-line` (03 §5.5, pictorial): mark a strip into equal parts, put a dot at a fraction,
 * or read the fraction a flag stands at. Ticks sit at exactly k/denominator; numerals are ≥ 32 px.
 */

type Line = ConfigFor<'fraction-line'>;
const base = {
  format: 'fraction-line',
  max: 1,
  ticksShown: true,
  labels: 'ends',
  skin: 'line',
  decimalLabels: false,
} as const;

// FRA.01.t4 (frac.partition partition), seed 1 and seed 2: "Mark the strip so it is cut into
// halves / fourths." A strip, no ticks, 0 and 1 at the ends.
const stripHalves: Line = {
  ...base,
  denominator: 2,
  ticksShown: false,
  mode: 'partition',
  skin: 'strip',
};
const stripFourths: Line = { ...stripHalves, denominator: 4 };
// No K01 template places, reads or names on a line yet (frac.line is K02): authored configs the
// model's schema accepts.
const placeFourths: Line = { ...base, denominator: 4, mode: 'place', target: { a: 3, b: 4 } };
const placeThirdsTwo: Line = {
  ...base,
  max: 2,
  denominator: 3,
  labels: 'all',
  mode: 'place',
  target: { a: 4, b: 3 },
};
const readRuler: Line = {
  ...base,
  denominator: 4,
  labels: 'all',
  mode: 'read',
  skin: 'ruler',
  target: { a: 3, b: 4 },
};
const equivalentTwo: Line = {
  ...base,
  max: 2,
  denominator: 4,
  labels: 'wholes',
  mode: 'equivalent',
  target: { a: 2, b: 4 },
};
const decimalTenths: Line = {
  ...base,
  denominator: 10,
  labels: 'wholes',
  mode: 'read',
  decimalLabels: true,
  target: { a: 3, b: 10 },
};

const meta = {
  title: 'Widgets/Fraction line',
  args: {
    config: stripFourths as WidgetConfig,
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

const ROOT = '.ni-fline';
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const marks = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-fline__mark')];
const lastResponse = (onResponse: unknown) =>
  (onResponse as ReturnType<typeof fn>).mock.calls.at(-1)?.[0] as ResponseValue;

/** The line's 0 and its unit, in client px, from the drawn ends (the 0 and max ticks or ends). */
function scaleOf(root: HTMLElement, max: number) {
  const svg = root.querySelector('.ni-fline__svg') as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  const ends = [...root.querySelectorAll<SVGLineElement>('line[data-tick]')].map((l) => ({
    k: Number(l.dataset.tick),
    x: l.x1.baseVal.value,
  }));
  const zero = ends.find((e) => e.k === 0)?.x ?? 0;
  const last = ends.reduce((a, b) => (b.k > a.k ? b : a));
  const unit = (last.x - zero) / max;
  const y =
    r.top + (root.querySelector('.ni-fline__mark, .ni-fline__strip, .ni-fline__axis') ? 0 : 0);
  return {
    at: (v: number) => ({ x: r.left + zero + v * unit, y: r.top + r.height / 2 }),
    unit,
    y,
  };
}

/** Every drawn tick sits at exactly k/denominator of the way along. */
async function expectTicksExact(root: HTMLElement, den: number, max: number) {
  const ticks = [...root.querySelectorAll<SVGLineElement>('line[data-tick]')];
  const pos = new Map(ticks.map((l) => [Number(l.dataset.tick), l.x1.baseVal.value]));
  const x0 = pos.get(0) as number;
  const xN = pos.get(den * max) as number;
  await expect(x0).toBeDefined();
  for (const [k, x] of pos) {
    await expect(Math.abs(x - (x0 + ((xN - x0) * k) / (den * max)))).toBeLessThan(1e-3);
  }
}

/** Every numeral on the line is ≥ 32 px. */
async function expectBigNumerals(root: HTMLElement, at = 1) {
  const nums = [...root.querySelectorAll<SVGTextElement>('.ni-fline__num')];
  await expect(nums.length).toBeGreaterThanOrEqual(at);
  for (const n of nums) {
    await expect(Number.parseFloat(getComputedStyle(n).fontSize)).toBeGreaterThanOrEqual(32);
  }
}

/** A tap on the stage at a value. */
async function tapAt(root: HTMLElement, v: number, max: number) {
  const p = scaleOf(root, max).at(v);
  const stage = root.querySelector('.ni-fline__stage') as HTMLElement;
  const init = (buttons: number): PointerEventInit => ({
    bubbles: true,
    pointerId: 1,
    pointerType: 'touch',
    clientX: p.x,
    clientY: p.y,
    button: 0,
    buttons,
  });
  (document.elementFromPoint(p.x, p.y) ?? stage).dispatchEvent(
    new PointerEvent('pointerdown', init(1)),
  );
  window.dispatchEvent(new PointerEvent('pointerup', init(0)));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

/**
 * K at the smallest landscape area, FRA.01.t4 seed 2: tap the strip at a fourth, a half and three
 * fourths; three pins stand on the marks (K-sized, spaced); 0 and 1 label the ends. The response
 * passes fraction.partition.
 */
export const PartitionFourthsK: Story = {
  globals: { ageMode: 'k' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('line[data-tick]:not(.ni-fline__tick--whole)')).toHaveLength(
      0,
    );
    await expectBigNumerals(root, 2);
    await expect(check(root)).toBeDisabled();
    for (const v of [0.25, 0.5, 0.75]) await tapAt(root, v, 1);
    await expect(marks(root)).toHaveLength(3);
    await expectFitsArea(root, areaBox(canvasElement), 'k', [...marks(root), check(root)]);
    await userEvent.click(check(root));
    const r = lastResponse(args.onResponse);
    await expect(r).toEqual({ kind: 'state', value: { cuts: [0.25, 0.5, 0.75] } });
    await expect(
      stateChecker('fraction.partition')?.check(
        { denominator: 4, max: 1 },
        (r as { value: Record<string, unknown> }).value,
      ),
    ).toBe(true);
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:line',
      'tap:line',
      'tap:line',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Tablet area, FRA.01.t4 seed 1: one mark in the middle; fits; the cut crosses the strip. */
export const PartitionHalvesTablet: Story = {
  args: { config: stripHalves },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapAt(root, 0.5, 1);
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [...marks(root), check(root)]);
    await expect(root.querySelector('line.ni-fline__cut')).toHaveAttribute('data-cut', '0.5');
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toEqual({ kind: 'state', value: { cuts: [0.5] } });
  },
};

/** A mark put in the wrong place is dragged to the middle; tapping a pin takes it away. */
export const PartitionMoveAndRemove: Story = {
  args: { config: stripHalves },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapAt(root, 0.3, 1);
    await expect(marks(root)).toHaveLength(1);
    const s = scaleOf(root, 1);
    await pointerDrag(marks(root)[0] as HTMLElement, s.at(0.5), 'touch');
    await expect(root.querySelector('line.ni-fline__cut')).toHaveAttribute('data-cut', '0.5');
    await tapAt(root, 0.8, 1);
    await expect(marks(root)).toHaveLength(2);
    await userEvent.click(marks(root)[1] as HTMLElement);
    await expect(marks(root)).toHaveLength(1);
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toEqual({ kind: 'state', value: { cuts: [0.5] } });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:line',
      'drag:mark-0',
      'drop:line',
      'tap:line',
      'tap:mark-1',
    ]);
  },
};

/**
 * Keyboard (06 §7): Tab to the strip, the cursor starts in the middle; Enter marks it; arrows move
 * it by twenty-fourths (6 left: a fourth; 12 right: three fourths), Enter marks each; Tab to check.
 */
export const PartitionKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const range = within(root).getByRole('slider', { name: 'The strip' });
    range.focus();
    await userEvent.keyboard('{Enter}');
    for (let i = 0; i < 6; i += 1) await userEvent.keyboard('{ArrowLeft}');
    await userEvent.keyboard('{Enter}');
    for (let i = 0; i < 12; i += 1) await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard(' ');
    await expect(marks(root)).toHaveLength(3);
    await userEvent.tab();
    await expect(check(root)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(lastResponse(args.onResponse)).toEqual({
      kind: 'state',
      value: { cuts: [0.25, 0.5, 0.75] },
    });
  },
};

/**
 * Place (smallest landscape area): drag the dot with a finger to near three fourths; it snaps to
 * the 3/4 tick. Ticks sit at exactly k/4.
 */
export const PlaceDragLandscapeMin: Story = {
  args: { config: placeFourths },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const dot = within(root).getByRole('button', { name: 'Your dot' });
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [dot, check(root)]);
    await expectTicksExact(root, 4, 1);
    await pointerDrag(dot, scaleOf(root, 1).at(0.72), 'touch');
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toEqual({ kind: 'placement', value: 0.75 });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:dot',
      'drop:line',
    ]);
  },
};

/** Place by keyboard on a line to 2 in thirds (labels on every tick, stacked, ≥ 32 px). */
export const PlaceKeyboardThirds: Story = {
  args: { config: placeThirdsTwo },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectTicksExact(root, 3, 2);
    await expectBigNumerals(root, 5);
    const range = within(root).getByRole('slider', { name: 'The number line' });
    range.focus();
    for (let i = 0; i < 4; i += 1) await userEvent.keyboard('{ArrowRight}');
    check(root).focus();
    await userEvent.keyboard('{Enter}');
    const r = lastResponse(args.onResponse) as { kind: string; value: number };
    await expect(r.kind).toBe('placement');
    await expect(r.value).toBeCloseTo(4 / 3, 9);
  },
};

/**
 * Read on a ruler at the smallest landscape area: the flag stands at 3/4; the ruler's labels are
 * stacked fractions (each digit ≥ 32 px). Type 3 over 4.
 */
export const ReadRulerLandscapeMin: Story = {
  args: { config: readRuler },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const top = canvas.getByRole('button', { name: 'Top number' });
    const bottom = canvas.getByRole('button', { name: 'Bottom number' });
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [
      top,
      bottom,
      ...root.querySelectorAll<HTMLElement>('.ni-fentry__key'),
      check(root),
    ]);
    await expectTicksExact(root, 4, 1);
    await expectBigNumerals(root, 5);
    await expect(root.querySelector('.ni-fline__flag')).toHaveAttribute('data-at', '0.75');
    await userEvent.click(top);
    await userEvent.click(canvas.getByRole('button', { name: '3' }));
    await userEvent.click(bottom);
    await userEvent.click(canvas.getByRole('button', { name: '4' }));
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toEqual({ kind: 'numbers', values: [3, 4] });
  },
};

/** Equivalent on a line to 2 (tablet area): the flag at 2/4; typing 1 over 2 answers [1, 2]. */
export const EquivalentTablet: Story = {
  args: { config: equivalentTwo },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expectTicksExact(root, 4, 2);
    await userEvent.click(canvas.getByRole('button', { name: 'Top number' }));
    await userEvent.keyboard('1');
    await userEvent.click(canvas.getByRole('button', { name: 'Bottom number' }));
    await userEvent.keyboard('2');
    await expectFitsArea(root, areaBox(canvasElement), 'g1-up', [check(root)]);
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toEqual({ kind: 'numbers', values: [1, 2] });
  },
};

/** Decimal labels (DEC.01): one box and a decimal point; 0.3 answers a number. */
export const DecimalRead: Story = {
  args: { config: decimalTenths },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expectTicksExact(root, 10, 1);
    await userEvent.click(canvas.getByRole('button', { name: 'Dot' }));
    await userEvent.click(canvas.getByRole('button', { name: '3' }));
    await expect(canvas.getByRole('button', { name: 'Your answer 0.3' })).toBeVisible();
    await userEvent.click(check(root));
    await expect(lastResponse(args.onResponse)).toEqual({ kind: 'number', value: 0.3 });
  },
};

/** `disabled`: no marks, no input. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapAt(root, 0.5, 1);
    await expect(marks(root)).toHaveLength(0);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo (03 §6.3), FRA.01.t4 seed 2's solution: Pip marks the fourths one by one. */
export const DemoPartition: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'partition', args: { b: 4 } });
    await expect(
      [...root.querySelectorAll('line.ni-fline__cut')].map((l) => l.getAttribute('data-cut')),
    ).toEqual(['0.25', '0.5', '0.75']);
    await expect(demoController.play({ op: 'cut' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const hopController: WidgetDemo = createDemoController({ strict: true });

/** Demo on a place item: three hops of a fourth land the dot on 3/4; a label writes 1/4. */
export const DemoHops: Story = {
  args: { config: placeFourths, disabled: true, demo: hopController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await hopController.play({ op: 'hop', args: { k: 3 } });
    await expect(root.querySelector('.ni-fline__hops')).toHaveAttribute('data-hops', '3');
    await expect(root.querySelectorAll('.ni-fline__hop')).toHaveLength(3);
    await hopController.play({ op: 'label', args: { a: 1, b: 4 } });
    await expect(root.querySelector('.ni-fline__frac--hint')).not.toBeNull();
    await hopController.play({ op: 'drop', args: { at: 0.5 } });
    await expect(root.querySelector('.ni-fline__dot--on')).not.toBeNull();
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the middle of the strip, where the mark goes. */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { config: stripHalves, demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'drop', args: { at: 0.5 } });
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    // The invited spot is ringed, centred on 1/2 and on the strip; the hand points at it.
    const spot = root.querySelector('.ni-fline__spot') as HTMLElement;
    const r = spot.getBoundingClientRect();
    await expect(Math.abs((r.left + r.right) / 2 - scaleOf(root, 1).at(0.5).x)).toBeLessThan(1);
    const strip = (root.querySelector('.ni-fline__strip') as SVGElement).getBoundingClientRect();
    await expect(r.top).toBeGreaterThanOrEqual(strip.top - 1);
    await expect(r.bottom).toBeLessThanOrEqual(strip.bottom + 1);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, spot, root);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: the marks appear at once. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'partition', args: { b: 4 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(root.querySelectorAll('line.ni-fline__cut')).toHaveLength(3);
  },
};

/** Size rules for the pins when the strip is marked into eighths (tablet, K). */
export const EighthsPinsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...stripHalves, denominator: 8 } },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let k = 1; k < 8; k += 1) await tapAt(root, k / 8, 1);
    await expect(marks(root)).toHaveLength(7);
    for (const m of marks(root)) await expectTargetSize(m, 'k');
    await expectTargetGaps(marks(root));
  },
};
