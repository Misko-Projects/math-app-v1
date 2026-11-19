import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { center, clearSpies, pointerDrag, spyAudio } from '../../test-support/storyHelpers';
import { areaBox, expectChartShows, expectFitsArea, inArea } from '../../test-support/widgetArea';
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
 * `bar-graph-build` (03 §5.5): build a chart from data. Drag the mark from the supply onto a row
 * (or tap the supply, then tap rows: each tap adds one), "take one back" undoes. Check answers
 * `{ values }`, the counts the chart shows, in chart order.
 *
 * Configs are real generated items (`generateItem(template, seed)` over the compiled catalog),
 * named by template and seed; bars, pictures at scale 2 and line plots are hand-made (DAT.04,
 * DAT.06 and DAT.03 have no generator yet, K02).
 */

type Config = ConfigFor<'bar-graph-build'>;

const zero = (...ids: string[]) => ids.map((id) => ({ id, label: `noun.${id}.many`, value: 0 }));

/** DAT.09.t1 seed 3 (concrete): objects to count, then tally (6 crabs, 2 fish, 1 apple). */
const objectsTally: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'tally',
    orientation: 'horizontal',
    categories: zero('crab', 'fish', 'apple'),
    scale: 1,
    axisMax: 6,
  },
  data: { kind: 'objects', values: [6, 2, 1] },
  mode: 'tally',
};

/** DAT.09.t4 seed 2: a table of counts, made into tally marks (2 shells, 1 crab, 1 fish). */
const tableTally: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'tally',
    orientation: 'horizontal',
    categories: zero('shell', 'crab', 'fish'),
    scale: 1,
    axisMax: 5,
  },
  data: { kind: 'table', values: [2, 1, 1] },
  mode: 'tally',
};

/** DAT.09.t4 seed 1: 4 apples, 1 crab, 8 fish (8 is a gate and three). */
const tableTally8: Config = {
  ...tableTally,
  chart: { ...tableTally.chart, categories: zero('apple', 'crab', 'fish'), axisMax: 8 },
  data: { kind: 'table', values: [4, 1, 8] },
};

/** Hand-made (DAT.04): a bar graph from tally marks. */
const tallyBars: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'bar',
    orientation: 'vertical',
    categories: zero('fish', 'shell', 'crab'),
    scale: 1,
    axisMax: 8,
  },
  data: { kind: 'tally', values: [3, 5, 2] },
  mode: 'bars',
};

/** Hand-made (DAT.06): each picture is 2; 7 apples are 3½ pictures. */
const scaledPictures: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'picture',
    orientation: 'horizontal',
    categories: zero('apple', 'fish'),
    scale: 2,
    axisMax: 10,
  },
  data: { kind: 'table', values: [7, 4] },
  mode: 'pictures',
};

/** Hand-made (DAT.03): a line plot of stick lengths in inches. */
const linePlot: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'line-plot',
    orientation: 'horizontal',
    categories: [],
    scale: 1,
    axisMax: 4,
    lineScale: { min: 1, max: 4, step: 0.5 },
  },
  data: { kind: 'measurements', values: [2, 2.5, 3, 2, 1.5] },
  mode: 'xs',
};

const meta = {
  title: 'Widgets/Bar graph build',
  args: {
    config: objectsTally as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-bgb';
const lane = (root: HTMLElement, id: string) =>
  root.querySelector(`.ni-bgb__lane[data-slot="${id}"]`) as HTMLElement;
const lanes = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-bgb__lane')];
const chip = (root: HTMLElement, item = 'mark') =>
  root.querySelector(`.ni-bgb__chip[data-item="${item}"]`) as HTMLElement;
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const back = (root: HTMLElement) => within(root).getByRole('button', { name: 'Take one back' });
/** The data and chart boards (they must lie inside the area too). */
const boards = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-bgb__board, .ni-chart, .ni-bgb__objects'),
];
/** The chart being built (the second chart; the first draws the data when it is a chart). */
const built = (root: HTMLElement) => root.querySelector('.ni-bgb__chart') as HTMLElement;

/**
 * K, concrete (DAT.09.t1 seed 3): exactly 6 crabs, 2 fish and 1 apple to count. Tap the tally
 * mark, then tap rows: each tap adds a mark and counts aloud. The chart shows what Check sends.
 */
export const ObjectsTallyKTablet: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('tablet'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    // The data: exactly the counts, one sprite each.
    const objects = [...root.querySelectorAll('.ni-bgb__object')];
    const count = (s: string) => objects.filter((o) => o.getAttribute('data-sprite') === s).length;
    await expect([count('crab'), count('fish'), count('apple')]).toEqual([6, 2, 1]);
    // The chart starts empty, so it never shows the counts it asks for.
    await expectChartShows(built(root), { crab: 0, fish: 0, apple: 0 });
    await expect(check(root)).toBeDisabled();
    await userEvent.click(chip(root));
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.chart.mark.tally', undefined);
    for (let i = 0; i < 6; i += 1) await userEvent.click(lane(root, 'crab'));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 6 }]);
    for (let i = 0; i < 2; i += 1) await userEvent.click(lane(root, 'fish'));
    await userEvent.click(lane(root, 'apple'));
    await expectChartShows(built(root), { crab: 6, fish: 2, apple: 1 });
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'k',
      [root.querySelector('.ni-bgb__objects') as HTMLElement],
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [6, 2, 1] },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.filter((e) => e.t === 'tap' && e.target === 'crab')).toHaveLength(6);
    await expectTraceOrdered(trace);
  },
};

/**
 * K at the 960 × 600 minimum (DAT.09.t4 seed 2): touch-drag the tally mark onto each row; a miss
 * glides home and adds nothing. Nothing scrolls; every control is inside the area.
 */
export const TableTallyTouchKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: tableTally, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'k',
      [...root.querySelectorAll<HTMLElement>('.ni-bgb__board, .ni-chart')],
    );
    // The data table shows the counts to copy.
    const table = root.querySelector('.ni-bgb__data .ni-chart') as HTMLElement;
    await expectChartShows(table.parentElement as HTMLElement, { shell: 2, crab: 1, fish: 1 });
    for (const id of ['shell', 'shell', 'crab', 'fish']) {
      await pointerDrag(chip(root), center(lane(root, id)), 'touch');
    }
    // A drop on no row adds nothing.
    await pointerDrag(
      chip(root),
      { x: center(chip(root)).x, y: center(chip(root)).y - 400 },
      'touch',
    );
    await expectChartShows(built(root), { shell: 2, crab: 1, fish: 1 });
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [2, 1, 1] },
    });
    const kinds = traceOf(args.onInteract).map((e) => e.t);
    await expect(kinds.filter((t) => t === 'drag')).toHaveLength(5);
    await expect(kinds.filter((t) => t === 'drop')).toHaveLength(5);
  },
};

/**
 * Keyboard (06 §7): Enter on the mark picks it up and moves to the first row; Enter adds a mark
 * (the mark stays picked up), arrows move between rows, Escape puts it down. 8 is a gate and three.
 */
export const TableTallyKeyboard: Story = {
  args: { config: tableTally8, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    chip(root).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(lane(root, 'apple')).toHaveFocus());
    for (let i = 0; i < 4; i += 1) await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}');
    for (let i = 0; i < 8; i += 1) await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    await expectChartShows(built(root), { apple: 4, crab: 1, fish: 8 });
    check(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [4, 1, 8] },
    });
  },
};

/**
 * G1, bars from tally marks (mouse drag): each block raises a bar by one, and every bar ends on
 * its gridline. "Take one back" lowers the last bar again.
 */
export const BarsFromTallyTablet: Story = {
  args: { config: tallyBars, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const data = root.querySelector('.ni-bgb__data') as HTMLElement;
    await expectChartShows(data, { fish: 3, shell: 5, crab: 2 });
    for (const [id, n] of [
      ['fish', 3],
      ['shell', 5],
      ['crab', 3],
    ] as const) {
      for (let i = 0; i < n; i += 1) await pointerDrag(chip(root), center(lane(root, id)));
    }
    await expectChartShows(built(root), { fish: 3, shell: 5, crab: 3 });
    await userEvent.click(back(root));
    await expectChartShows(built(root), { fish: 3, shell: 5, crab: 2 });
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'g1-up',
      boards(root),
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [3, 5, 2] },
    });
    await expect(traceOf(args.onInteract).some((e) => e.t === 'undo')).toBe(true);
  },
};

/** The 960 × 600 minimum, G1: bars up to 8 still fit with the data and tools. */
export const BarsLandscapeMin: Story = {
  args: { config: tallyBars, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(chip(root));
    for (let i = 0; i < 8; i += 1) await userEvent.click(lane(root, 'shell'));
    await expectChartShows(built(root), { fish: 0, shell: 8, crab: 0 });
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'g1-up',
      boards(root),
    );
  },
};

/**
 * Each picture is 2: 7 apples are three pictures and a half. The half-picture chip adds half a
 * picture (its left half, a dashed cut edge).
 */
export const ScaledPicturesWithHalves: Story = {
  args: { config: scaledPictures, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(chip(root));
    for (let i = 0; i < 3; i += 1) await userEvent.click(lane(root, 'apple'));
    await userEvent.click(chip(root, 'half'));
    await userEvent.click(lane(root, 'apple'));
    await userEvent.click(chip(root));
    for (let i = 0; i < 2; i += 1) await userEvent.click(lane(root, 'fish'));
    await expectChartShows(built(root), { apple: 7, fish: 4 }, 2);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [7, 4] },
    });
  },
};

/** A line plot from measurements: one X above each length (halves included). */
export const LinePlotXs: Story = {
  args: { config: linePlot, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const lengths = [...root.querySelectorAll('.ni-bgb__length')].map((e) => e.textContent);
    await expect(lengths).toEqual(['2', '2½', '3', '2', '1½']);
    await userEvent.click(chip(root));
    for (const at of ['2', '2.5', '3', '2', '1.5']) await userEvent.click(lane(root, at));
    await expectChartShows(built(root), { '1': 0, '1.5': 1, '2': 2, '2.5': 1, '3': 1, '4': 0 });
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [0, 1, 2, 1, 1, 0, 0] },
    });
  },
};

/** Portrait (746 × 812): data on top, the chart, then the tools in a row. */
export const PortraitK: Story = {
  globals: { ageMode: 'k' },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'k',
      boards(root),
    );
  },
};

/** `disabled`: nothing takes input. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(chip(root));
    await userEvent.click(lane(root, 'crab'));
    await expectChartShows(built(root), { crab: 0 });
    await expect(check(root)).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3), the DAT.09.t4 solution: Pip makes each row's marks one by one. */
export const DemoMode: Story = {
  args: { config: tableTally8, disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'tally', args: { id: 'apple', count: 4 } });
    await expect(audio.sayPhrases.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      [{ number: 1 }],
      [{ number: 2 }],
      [{ number: 3 }],
      [{ number: 4 }],
    ]);
    await demoController.play({ op: 'tally', args: { id: 'crab' } });
    await demoController.play({ op: 'answer', args: { values: [4, 1, 8] } });
    await waitFor(() => expectChartShows(built(root), { apple: 4, crab: 1, fish: 8 }));
    await expect(demoController.play({ op: 'count-pictures' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const barsDemo: WidgetDemo = createDemoController({ strict: true });

/** `raise-bar`: the bar grows one unit at a time to its value. */
export const DemoRaiseBar: Story = {
  args: { config: tallyBars, disabled: true, demo: barsDemo, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await barsDemo.play({ op: 'raise-bar', args: { id: 'shell', to: 5 } });
    await waitFor(() => expectChartShows(built(root), { fish: 0, shell: 5, crab: 0 }));
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the row to mark. */
export const Invite: Story = {
  args: { config: tableTally, demo: inviteController, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await inviteController.invite({ op: 'tally', args: { id: 'crab', count: 1 } });
    const row = lane(root, 'crab');
    await waitFor(() => expect(row).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, row, root);
    await inviteController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
  },
};
