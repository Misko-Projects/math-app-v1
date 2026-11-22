import type { ChartSpec, StimulusSpec, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { expectChartShows } from '../../test-support/chartArea';
import { findWidget, renderWidget } from '../../test-support/widgetStory';
import type { ConfigFor } from '../types';
import { StimulusView } from './StimulusView';

/**
 * ChartView (U05 #14) as the `chart` stimulus: picture graphs (with a key and half symbols at
 * scale 2), bar graphs both ways, tally charts, tables and line plots. Every picture shows exactly
 * its numbers (asserted per chart). Check the vision simulator: categories differ by sprite and
 * name, never by colour alone.
 */
const meta = {
  title: 'Widgets/Kit/Chart',
  parameters: { ui: { stage: 'padded' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const cat = (id: string, value: number) => ({ id, label: `noun.${id}.many`, value });

const CHARTS: { name: string; chart: ChartSpec; scale?: number }[] = [
  {
    // DAT.02.t1 seed 1
    name: 'picture graph',
    chart: {
      kind: 'picture',
      orientation: 'horizontal',
      categories: [cat('apple', 8), cat('fish', 3), cat('shell', 4)],
      scale: 1,
      axisMax: 8,
    },
  },
  {
    name: 'picture graph · each picture is 2',
    chart: {
      kind: 'picture',
      orientation: 'horizontal',
      categories: [cat('crab', 5), cat('apple', 8), cat('shell', 1)],
      scale: 2,
      axisMax: 8,
    },
    scale: 2,
  },
  {
    name: 'picture graph · vertical',
    chart: {
      kind: 'picture',
      orientation: 'vertical',
      categories: [cat('fish', 4), cat('crab', 6), cat('apple', 2)],
      scale: 1,
      axisMax: 6,
    },
  },
  {
    // DAT.02.t2 seed 3
    name: 'bar graph',
    chart: {
      kind: 'bar',
      orientation: 'vertical',
      categories: [cat('crab', 5), cat('fish', 1), cat('apple', 10)],
      scale: 1,
      axisMax: 10,
    },
  },
  {
    name: 'bar graph · horizontal, counting by 2',
    chart: {
      kind: 'bar',
      orientation: 'horizontal',
      categories: [cat('shell', 7), cat('fish', 12), cat('crab', 4)],
      scale: 2,
      axisMax: 12,
    },
  },
  {
    // DAT.09.t2 seed 3
    name: 'tally chart',
    chart: {
      kind: 'tally',
      orientation: 'horizontal',
      categories: [cat('fish', 1), cat('shell', 6), cat('apple', 9)],
      scale: 1,
      axisMax: 9,
    },
  },
  {
    // DAT.09.t3 seed 3
    name: 'table',
    chart: {
      kind: 'table',
      orientation: 'horizontal',
      categories: [cat('apple', 5), cat('fish', 10), cat('shell', 2)],
      scale: 1,
      axisMax: 10,
    },
  },
  {
    name: 'line plot · halves',
    chart: {
      kind: 'line-plot',
      orientation: 'horizontal',
      categories: [
        { id: '1.5', label: 'noun.stick.many', value: 2 },
        { id: '2', label: 'noun.stick.many', value: 3 },
        { id: '3.5', label: 'noun.stick.many', value: 1 },
      ],
      scale: 1,
      axisMax: 4,
      lineScale: { min: 1, max: 4, step: 0.5 },
    },
  },
];

const valuesOf = (c: ChartSpec): Record<string, number> =>
  Object.fromEntries(c.categories.map((x) => [x.id, x.value]));

/** Every chart kind as a stimulus, each drawing exactly its values. */
export const Gallery: Story = {
  render: () => (
    <div className="story-grid" style={{ ['--story-col' as string]: '520px' }}>
      {CHARTS.map((c) => (
        <div key={c.name} className="story-cell" data-chart={c.name}>
          <StimulusView spec={{ kind: 'chart', chart: c.chart }} maxWidth={520} maxHeight={300} />
          <span className="story-cell__name">{c.name}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const c of CHARTS) {
      const cell = canvasElement.querySelector(`[data-chart="${c.name}"]`) as HTMLElement;
      await expectChartShows(cell, valuesOf(c.chart), c.scale ?? c.chart.scale);
      // A picture, named as one, never the quantity (03 §5.1 stimulus rule).
      await expect(within(cell).getByRole('img', { name: 'Look at the picture' })).toBeVisible();
      for (const n of cell.querySelectorAll('.ni-chart__numeral, .ni-chart__key')) {
        await expect(Number.parseFloat(getComputedStyle(n).fontSize)).toBeGreaterThanOrEqual(32);
      }
    }
  },
};

/** DAT.02.t4 seed 1 (compare): one category per chart on one scale; the bar ends on 1 of 7. */
export const OneBarCompareSide: Story = {
  render: () => {
    const spec: StimulusSpec = {
      kind: 'chart',
      chart: {
        kind: 'bar',
        orientation: 'vertical',
        categories: [cat('crab', 1)],
        scale: 1,
        axisMax: 7,
      },
    };
    return <StimulusView spec={spec} maxWidth={300} maxHeight={280} />;
  },
  play: async ({ canvasElement }) => {
    await expectChartShows(canvasElement, { crab: 1 });
    const chart = canvasElement.querySelector('.ni-chart') as HTMLElement;
    await expect(chart.getBoundingClientRect().width).toBeLessThanOrEqual(300);
  },
};

/** DAT.02.t5 seed 2: number-pad shows the picture graph as its stimulus; type the total (10). */
const padChart: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: {
    kind: 'chart',
    chart: {
      kind: 'picture',
      orientation: 'horizontal',
      categories: [cat('apple', 1), cat('fish', 8), cat('crab', 1)],
      scale: 1,
      axisMax: 8,
    },
  },
  blanks: [{ id: 'n', maxDigits: 2 }],
  unit: null,
};

const padResponse = fn();

export const NumberPadWithChart: Story = {
  parameters: { ui: { stage: 'centered' } },
  render: () =>
    renderWidget({
      config: padChart as WidgetConfig,
      tier: 'pictorial',
      disabled: false,
      onResponse: padResponse,
      onInteract: fn(),
    }),
  play: async ({ canvasElement }) => {
    padResponse.mockClear();
    const root = await findWidget(canvasElement, '.ni-npw');
    await expectChartShows(root, { apple: 1, fish: 8, crab: 1 });
    await userEvent.keyboard('10');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(padResponse).toHaveBeenCalledWith({ kind: 'number', value: 10 });
  },
};

/**
 * A chart stimulus keeps the kit's own label: 20 px and free to wrap, with none of the graph
 * widgets' one-line label style (`widgetLabels`), because a stimulus's names are not bounded.
 * Review of PR #102: two columns in a 300 px box, "rectangular prisms" beside "cubes"; the long
 * name wraps and the two names never run into each other.
 */
export const LongStimulusLabels: Story = {
  render: () => {
    const spec: StimulusSpec = {
      kind: 'chart',
      chart: {
        kind: 'bar',
        orientation: 'vertical',
        categories: [
          { id: 'crab', label: 'shape.rect-prism.many', value: 4 },
          { id: 'shell', label: 'shape.cube.many', value: 7 },
        ],
        scale: 1,
        axisMax: 10,
      },
    };
    return <StimulusView spec={spec} maxWidth={300} maxHeight={280} />;
  },
  play: async ({ canvasElement }) => {
    const chart = canvasElement.querySelector('.ni-chart') as HTMLElement;
    await expect(chart).not.toHaveAttribute('data-labels');
    const names = [...chart.querySelectorAll<HTMLElement>('.ni-chart__name')];
    await expect(names.map((n) => n.textContent)).toEqual(['rectangular prisms', 'cubes']);
    const boxes = names.map((n) => {
      const face = n.closest('.ni-chart__labelface') as HTMLElement;
      const cs = getComputedStyle(face);
      return { font: cs.fontSize, wrap: cs.whiteSpace, range: document.createRange(), n };
    });
    for (const b of boxes) {
      await expect(b.font).toBe('20px');
      await expect(b.wrap).toBe('normal');
      b.range.selectNodeContents(b.n);
    }
    // The long name takes two lines; its text ends before the other name begins.
    const [long, short] = boxes.map((b) => b.range.getBoundingClientRect()) as [DOMRect, DOMRect];
    await expect(boxes[0]?.range.getClientRects().length).toBeGreaterThanOrEqual(2);
    await expect(long.right).toBeLessThanOrEqual(short.left);
  },
};
