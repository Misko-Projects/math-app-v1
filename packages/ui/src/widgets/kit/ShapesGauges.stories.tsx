import type { ShapeCard, ShapeKind, StimulusSpec } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { expectNumeralsAtLeast32 } from '../../test-support/areaStory';
import { dialAngle, type GaugeSpec } from './GaugeView';
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
    await expect((sq as SVGPolygonElement).getBBox().width).toBeCloseTo(1.5 * 66, 3);
    await expect((tri as SVGPolygonElement).getBBox().width).toBeCloseTo(0.6 * 80, 3);
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
