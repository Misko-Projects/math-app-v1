import type { ShapeCard, ShapeKind, StimulusSpec, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { expectNumeralsAtLeast32 } from '../../test-support/areaStory';
import { findWidget, renderWidget } from '../../test-support/widgetStory';
import type { WidgetHostProps } from '../WidgetHost';
import { dialAngle, type GaugeSpec } from './GaugeView';
import { PIECE_SIDE } from './ShapeView';
import { StimulusView } from './StimulusView';

/**
 * The `shape` and `gauge` stimuli (U05 #14) through StimulusView: every ShapeKind drawn exactly,
 * and the three instruments reading exactly their value. Gauges are the mea.massvolume reads
 * (`gaugeFor`: labels every second tick, room above the value).
 */

const KINDS: ShapeKind[] = [
  'circle',
  'oval',
  'triangle',
  'square',
  'rectangle',
  'rhombus',
  'trapezoid',
  'kite',
  'quadrilateral',
  'pentagon',
  'hexagon',
  'octagon',
  'open-figure',
  'cube',
  'rect-prism',
  'pyramid',
  'cylinder',
  'cone',
  'sphere',
];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'tan'];
const card = (shape: ShapeKind, i: number, over: Partial<ShapeCard> = {}): ShapeCard => ({
  id: `s${i}`,
  shape,
  props: {
    sides: 0,
    corners: 0,
    rightAngles: 0,
    equalSides: false,
    parallelPairs: 0,
    curved: false,
    closed: shape !== 'open-figure',
    solid: false,
  },
  rotationDeg: 0,
  scale: 1,
  color: COLORS[i % COLORS.length] as string,
  ...over,
});

const meta = {
  title: 'Kit/Shapes and gauges',
  component: StimulusView,
  parameters: { ui: { stage: 'padded' } },
} satisfies Meta<typeof StimulusView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every ShapeKind on one scale. */
export const AllShapes: Story = {
  args: {
    spec: { kind: 'shape', shapes: KINDS.map((k, i) => card(k, i)) },
    maxWidth: 1100,
    maxHeight: 120,
  },
  play: async ({ canvasElement }) => {
    const svgs = canvasElement.querySelectorAll('svg.ni-shape');
    await expect(svgs).toHaveLength(KINDS.length);
    await expect(canvasElement.querySelector('[data-shape="open-figure"] polyline')).not.toBeNull();
    await expect(
      canvasElement.querySelectorAll('[data-shape="cube"] .ni-shape__hidden'),
    ).toHaveLength(1);
    await expect(
      canvasElement.querySelector(
        '[data-kind="shape"][role="img"], [data-kind="shape"] [role="img"]',
      ),
    ).not.toBeNull();
  },
};

/** Turned and resized (non-prototypical) shapes, as GEO.02.t2 draws them. */
export const TurnedAndResized: Story = {
  args: {
    spec: {
      kind: 'shape',
      shapes: [
        card('square', 0, { rotationDeg: 45, scale: 1.5 }),
        card('triangle', 1, { rotationDeg: 200, scale: 0.6 }),
        card('rectangle', 2, { rotationDeg: 300, scale: 1.3 }),
        card('hexagon', 3, { rotationDeg: 20, scale: 0.75 }),
      ],
    },
    maxWidth: 760,
    maxHeight: 220,
  },
  play: async ({ canvasElement }) => {
    const [sq, tri] = [...canvasElement.querySelectorAll<SVGPolygonElement>('polygon')];
    // Scale 1.5 against 0.6, before turning: the polygons' own sizes compare truly.
    await expect((sq as SVGPolygonElement).getBBox().width).toBeCloseTo(1.5 * PIECE_SIDE, 3);
    await expect((tri as SVGPolygonElement).getBBox().width).toBeCloseTo(0.6 * PIECE_SIDE, 3);
  },
};

const scale: GaugeSpec = {
  kind: 'gauge',
  instrument: 'scale',
  min: 0,
  max: 10,
  ticksEvery: 1,
  labelsEvery: 2,
  value: 7,
  unit: 'kg',
};

/** A kitchen scale reading 7 kg: the needle points exactly at the 7 tick. */
export const ScaleDial: Story = {
  args: { spec: scale as StimulusSpec },
  play: async ({ canvasElement }) => {
    const needle = canvasElement.querySelector('.ni-gauge__needle') as SVGLineElement;
    const angle =
      (Math.atan2(
        needle.y2.baseVal.value - needle.y1.baseVal.value,
        needle.x2.baseVal.value - needle.x1.baseVal.value,
      ) *
        180) /
      Math.PI;
    await expect((angle + 360) % 360).toBeCloseTo(dialAngle(scale, 7) % 360, 3);
    await expectNumeralsAtLeast32(canvasElement, '.ni-gauge__numeral');
  },
};

/** A beaker with 3 L (ticks every 1, labels every 2): the water stops exactly at 3. */
export const Beaker: Story = {
  args: { spec: { ...scale, instrument: 'beaker', value: 3, unit: 'L' } as StimulusSpec },
  play: async ({ canvasElement }) => {
    const water = canvasElement.querySelector('.ni-gauge__water') as SVGRectElement;
    const tick = canvasElement.querySelector('[data-tick="3"]') as SVGLineElement;
    await expect(water.y.baseVal.value).toBeCloseTo(tick.y1.baseVal.value, 6);
    await expectNumeralsAtLeast32(canvasElement, '.ni-gauge__numeral');
  },
};

/** A thermometer from −10 °C to 40 °C reading 25: the column stops exactly at 25. */
export const Thermometer: Story = {
  args: {
    spec: {
      kind: 'gauge',
      instrument: 'thermometer',
      min: -10,
      max: 40,
      ticksEvery: 5,
      labelsEvery: 10,
      value: 25,
      unit: 'degC',
    },
  },
  play: async ({ canvasElement }) => {
    const column = canvasElement.querySelector('rect.ni-gauge__column') as SVGRectElement;
    const tick = canvasElement.querySelector('[data-tick="25"]') as SVGLineElement;
    await expect(column.y.baseVal.value).toBeCloseTo(tick.y1.baseVal.value, 6);
    await expectNumeralsAtLeast32(canvasElement, '.ni-gauge__numeral');
  },
};

// ---------- composition pictures share one scale (review CR-1.2) ----------

const piece = (id: string, shape: ShapeKind, scale = 1): ShapeCard => ({
  ...card(shape, 6),
  id,
  scale,
  color: 'tan',
});

/** GEO.10.t3 seed 21 (geo.compose, square-from-rectangles): which two pieces make the square? */
const squareFromRectangles: WidgetConfig = {
  format: 'numeral-pick',
  stimulus: { kind: 'shape', shapes: [piece('whole', 'square', 2)] },
  options: [
    {
      id: 'pair-rectangle-triangle',
      stimulus: {
        kind: 'shape',
        shapes: [piece('piece-0', 'rectangle'), piece('piece-1', 'triangle')],
      },
    },
    {
      id: 'pair-rectangle-square',
      stimulus: {
        kind: 'shape',
        shapes: [piece('piece-0', 'rectangle'), piece('piece-1', 'square')],
      },
    },
    {
      id: 'pair-rectangle-rectangle',
      stimulus: {
        kind: 'shape',
        shapes: [piece('piece-0', 'rectangle'), piece('piece-1', 'rectangle')],
      },
    },
  ],
  layout: 'row',
};

/**
 * The target square and the pieces in the choices are drawn on one scale with the pattern-block
 * proportions (rectangle 2 × 1, square 1 × 1): each rectangle of the right pair spans the
 * square's whole side one way and exactly half of it the other; the square piece is half a side.
 */
export const CompositionOneScale: StoryObj<WidgetHostProps> = {
  args: {
    config: squareFromRectangles,
    tier: 'pictorial',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  render: renderWidget,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, '.ni-npick');
    const box = (el: Element) =>
      (el.querySelector('polygon') as SVGPolygonElement).getBoundingClientRect();
    const target = box(root.querySelector('.ni-stimulus') as Element);
    await expect(Math.abs(target.width - target.height)).toBeLessThan(1);
    const option = root.querySelector('[data-id="pair-rectangle-rectangle"]') as HTMLElement;
    const rects = [...option.querySelectorAll('svg.ni-shape')].map(box);
    await expect(rects).toHaveLength(2);
    for (const r of rects) {
      await expect(Math.max(r.width, r.height)).toBeCloseTo(target.width, 0);
      await expect(Math.min(r.width, r.height)).toBeCloseTo(target.width / 2, 0);
    }
    const sq = box(
      root.querySelectorAll('[data-id="pair-rectangle-square"] svg.ni-shape')[1] as Element,
    );
    await expect(sq.width).toBeCloseTo(target.width / 2, 0);
  },
};
