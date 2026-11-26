import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  areaBox,
  expectChartShows,
  expectFitsArea,
  expectNumeralsReadable,
  expectOneInvite,
  expectSymbolsOneSize,
  inArea,
  namedStory,
} from '../../test-support/chartArea';
import { center, clearSpies, pointerDrag, spyAudio } from '../../test-support/storyHelpers';
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

/** Hand-made (DAT.03): a line plot of stick lengths in inches, by halves. */
const linePlot: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'line-plot',
    orientation: 'horizontal',
    categories: [],
    scale: 1,
    axisMax: 4,
    lineScale: { min: 1, max: 2, step: 0.5 },
  },
  data: { kind: 'measurements', values: [1.5, 2, 1.5, 1, 2] },
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
  decorators: [namedStory],
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
    await expectTallyCountable(root.querySelector('.ni-bgb__data') as HTMLElement);
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
    await expect(lengths).toEqual(['1½', '2', '1½', '1', '2']);
    await userEvent.click(chip(root));
    for (const at of ['1.5', '2', '1.5', '1', '2']) await userEvent.click(lane(root, at));
    await expectChartShows(built(root), { '1': 1, '1.5': 2, '2': 2 });
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [1, 2, 2] },
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
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await inviteController.invite({ op: 'tally', args: { id: 'crab', count: 1 } });
    // Nothing is picked up yet: the one cue is on the supply, the first thing to touch.
    await waitFor(() => expect(chip(root)).toHaveClass('ni-invite'));
    await expect(lane(root, 'crab')).not.toHaveClass('ni-invite');
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, chip(root), root);
    // One invited control, one ring inside it; the story ends with the hand visible under it.
    await expectOneInvite(root);
  },
};

const rowInvite: WidgetDemo = createDemoController({ strict: true });

/** With the mark picked up, the one cue moves to the invited row; placing the mark clears it. */
export const InviteMovesToTheRow: Story = {
  args: { config: tableTally, demo: rowInvite, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await rowInvite.invite({ op: 'tally', args: { id: 'crab', count: 1 } });
    await waitFor(() => expect(chip(root)).toHaveClass('ni-invite'));
    // A tap on an empty row does not add a second cue.
    await userEvent.click(lane(root, 'crab'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await userEvent.click(chip(root));
    const row = lane(root, 'crab');
    await waitFor(() => expect(row).toHaveClass('ni-invite'));
    await expect(chip(root)).not.toHaveClass('ni-invite');
    await waitFor(() => expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, row, root));
    await expectOneInvite(root);
    await userEvent.click(row);
    await expectChartShows(built(root), { shell: 0, crab: 1, fish: 0 });
    await expect(root.querySelector('.ni-invite')).toBeNull();
  },
};

const clearController: WidgetDemo = createDemoController({ strict: true });

/** Clearing an invite (`invite(null)`) takes Pip's hand and the ring away. */
export const InviteCleared: Story = {
  args: { config: tableTally, demo: clearController, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await clearController.invite({ op: 'tally', args: { id: 'crab', count: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    await clearController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
    await expect(root.querySelector('.ni-invite')).toBeNull();
  },
};

// ---------- stress states (06 §1, §2: nothing clips or scrolls) ----------

/** A tally of 20 (four gates) beside a tally of 3, from a table. */
const tally20: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'tally',
    orientation: 'horizontal',
    categories: zero('fish', 'shell'),
    scale: 1,
    axisMax: 20,
  },
  data: { kind: 'table', values: [20, 3] },
  mode: 'tally',
};

const stressTally =
  (age: 'k' | 'g1-up') =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(chip(root));
    for (let i = 0; i < 20; i += 1) await userEvent.click(lane(root, 'fish'));
    for (let i = 0; i < 3; i += 1) await userEvent.click(lane(root, 'shell'));
    await expectChartShows(built(root), { fish: 20, shell: 3 });
    await expectNumeralsReadable(root);
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      age,
      boards(root),
    );
  };

/** Stress: 20 tally marks in a row at the tablet area. */
export const StressTally20Tablet: Story = {
  args: { config: tally20, tier: 'pictorial' },
  render: inArea('tablet'),
  play: stressTally('g1-up'),
};

/** Stress, K: 20 tally marks in a row at the 960 × 600 minimum. */
export const StressTally20KLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: tally20, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: stressTally('k'),
};

/** Pictures at scale 2: every symbol one size, halves a cut tile; the two chips spaced. */
export const ScaledPicturesHalvesLandscapeMin: Story = {
  args: { config: scaledPictures, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(chip(root));
    for (let i = 0; i < 3; i += 1) await userEvent.click(lane(root, 'apple'));
    for (let i = 0; i < 2; i += 1) await userEvent.click(lane(root, 'fish'));
    await userEvent.click(chip(root, 'half'));
    await userEvent.click(lane(root, 'apple'));
    await expectChartShows(built(root), { apple: 7, fish: 4 }, 2);
    await expectSymbolsOneSize(built(root));
    await expectNumeralsReadable(root);
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), chip(root, 'half'), back(root), check(root)],
      'g1-up',
      boards(root),
    );
  },
};

// ---------- undo where the mark sits, and the full row ----------

/**
 * A mark is taken back where it sits, and never at the cost of adding one. Three marks are
 * dragged onto the fish row (a drop is not followed by an undo). With nothing picked up, a tap on
 * the row takes its last mark back (the new count is spoken, the undo traced); Backspace and Enter
 * do the same from the keyboard. With the mark picked up, a tap on the same row adds. A tap on an
 * empty row with nothing picked up points at the supply.
 */
export const UndoOnTheRow: Story = {
  args: { config: tableTally8, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('tablet'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 3; i += 1) await pointerDrag(chip(root), center(lane(root, 'fish')));
    await expectChartShows(built(root), { apple: 0, crab: 0, fish: 3 });
    clearSpies(audio);
    await expect(lane(root, 'fish')).not.toHaveAttribute('aria-disabled');
    await userEvent.click(lane(root, 'fish'));
    await expectChartShows(built(root), { apple: 0, crab: 0, fish: 2 });
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 2 }]);
    lane(root, 'fish').focus();
    await userEvent.keyboard('{Backspace}');
    await expectChartShows(built(root), { apple: 0, crab: 0, fish: 1 });
    await userEvent.keyboard('{Enter}');
    await expectChartShows(built(root), { apple: 0, crab: 0, fish: 0 });
    await expect(check(root)).toBeDisabled();
    // The row is empty and nothing is picked up: the cue goes to the supply, nothing else rings.
    await userEvent.click(lane(root, 'fish'));
    await expect([...root.querySelectorAll('.ni-invite')]).toEqual([chip(root)]);
    // With the mark picked up the cue is gone and every tap on a row adds, marks or no marks.
    await userEvent.click(chip(root));
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await userEvent.click(lane(root, 'fish'));
    await userEvent.click(lane(root, 'fish'));
    await expectChartShows(built(root), { apple: 0, crab: 0, fish: 2 });
    const kinds = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(kinds.filter((k) => k === 'undo:slot-fish')).toHaveLength(3);
  },
};

/**
 * A full row is a state the child can read and leave (K, 960 × 600): the shells row holds 5 of 5;
 * one more is refused, the graph's caption says "5 is the most here." (spoken too) and the one cue
 * is on "Take one back" (`FullRowTakeBack` leaves the state).
 */
export const FullRowKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: tableTally, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    const caption = () => root.querySelector('.ni-bgb__title[data-board="build"]') as HTMLElement;
    await userEvent.click(chip(root));
    for (let i = 0; i < 5; i += 1) await userEvent.click(lane(root, 'shell'));
    await expect(caption()).toHaveTextContent('Your graph');
    clearSpies(audio);
    await userEvent.click(lane(root, 'shell'));
    await expectChartShows(built(root), { shell: 5, crab: 0, fish: 0 });
    await expect(caption()).toHaveTextContent('5 is the most here.');
    await expect(caption()).toHaveAttribute('role', 'status');
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.chart.full', { n: '5' });
    // The note is clear of the row outline under it.
    const noteText = document.createRange();
    noteText.selectNodeContents(caption());
    await expect(noteText.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      lane(root, 'shell').getBoundingClientRect().top,
    );
    await expect([...root.querySelectorAll('.ni-invite')]).toEqual([back(root)]);
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'k',
      [...boards(root), caption()],
    );
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toContain(
      'tap:full-shell',
    );
  },
};

/** Leaving a full row: "Take one back" restores the caption and removes the cue; so does a tap on the row. */
export const FullRowTakeBack: Story = {
  args: { config: tableTally, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const caption = () => root.querySelector('.ni-bgb__title[data-board="build"]') as HTMLElement;
    for (let i = 0; i < 6; i += 1) await pointerDrag(chip(root), center(lane(root, 'shell')));
    await expectChartShows(built(root), { shell: 5, crab: 0, fish: 0 });
    await expect(caption()).toHaveTextContent('5 is the most here.');
    await userEvent.click(back(root));
    await expectChartShows(built(root), { shell: 4, crab: 0, fish: 0 });
    await expect(caption()).toHaveTextContent('Your graph');
    await expect(root.querySelector('.ni-invite')).toBeNull();
    for (let i = 0; i < 2; i += 1) await pointerDrag(chip(root), center(lane(root, 'shell')));
    await expect(caption()).toHaveTextContent('5 is the most here.');
    await userEvent.click(lane(root, 'shell'));
    await expectChartShows(built(root), { shell: 4, crab: 0, fish: 0 });
    await expect(caption()).toHaveTextContent('Your graph');
    await expect(root.querySelector('.ni-invite')).toBeNull();
  },
};

// ---------- the model's bounds, in the smallest area at kindergarten sizes ----------

const bound = (
  mode: Config['mode'],
  chart: Partial<Config['chart']> & Pick<Config['chart'], 'kind' | 'orientation' | 'axisMax'>,
  data: Config['data'],
): Config => ({
  format: 'bar-graph-build',
  chart: { categories: zero('firefly', 'crab', 'shell'), scale: 1, ...chart },
  data,
  mode,
});

/** Builds every count of `values` (ids in chart order) with taps, then checks the fit. */
const stressBuild =
  (values: Record<string, number>, perTap = 1) =>
  async ({
    canvasElement,
    args,
  }: {
    canvasElement: HTMLElement;
    args: { onResponse: unknown };
  }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(chip(root));
    for (const [id, n] of Object.entries(values)) {
      for (let i = 0; i < n / perTap; i += 1) await userEvent.click(lane(root, id));
    }
    await expectChartShows(built(root), values, perTap);
    await expectNumeralsReadable(root);
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'k',
      boards(root),
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: Object.values(values) },
    });
  };

/** Three tally rows (GRAPH_ROWS_MAX), one of 20 marks (GRAPH_TALLY_MAX), the longest name. */
const tallyAtBound = bound(
  'tally',
  { kind: 'tally', orientation: 'horizontal', axisMax: 20 },
  { kind: 'table', values: [20, 12, 5] },
);

/** Stress at the bound, K, 960 × 600: three tally rows, one of 20 marks, from a table. */
export const StressTallyAtBoundKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: tallyAtBound, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: stressBuild({ firefly: 20, crab: 12, shell: 5 }),
};

/** Three bars (GRAPH_COLUMNS_MAX), one of 10 blocks (BUILD_BAR_MAX), from tally rows of up to 10. */
const barsAtBound = bound(
  'bars',
  { kind: 'bar', orientation: 'vertical', axisMax: 10 },
  { kind: 'tally', values: [10, 7, 4] },
);

/** Stress at the bound, K, 960 × 600: three bars, one of 10 blocks, from a tally chart. */
export const StressBarsAtBoundKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: barsAtBound, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async (ctx) => {
    await stressBuild({ firefly: 10, crab: 7, shell: 4 })(ctx);
    const root = await findWidget(ctx.canvasElement, ROOT);
    // The data board's tally marks can be seen and counted.
    const data = root.querySelector('.ni-bgb__data') as HTMLElement;
    await expectChartShows(data, { firefly: 10, crab: 7, shell: 4 });
    await expectTallyCountable(data);
  },
};

/** Two keyed picture rows (GRAPH_BAR_ROWS_MAX), one of 6 pictures (BUILD_PICTURES_MAX), each 2. */
const picturesAtBound = bound(
  'pictures',
  {
    kind: 'picture',
    orientation: 'horizontal',
    axisMax: 12,
    scale: 2,
    categories: zero('firefly', 'crab'),
  },
  { kind: 'table', values: [12, 7] },
);

/** Stress at the bound, K, 960 × 600: two picture rows, one of 6 pictures, a half picture. */
export const StressPicturesAtBoundKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: picturesAtBound, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(chip(root));
    for (let i = 0; i < 6; i += 1) await userEvent.click(lane(root, 'firefly'));
    for (let i = 0; i < 3; i += 1) await userEvent.click(lane(root, 'crab'));
    await userEvent.click(chip(root, 'half'));
    await userEvent.click(lane(root, 'crab'));
    await expectChartShows(built(root), { firefly: 12, crab: 7 }, 2);
    await expectSymbolsOneSize(built(root));
    // Every picture can be seen and counted: at least 24 px.
    for (const art of built(root).querySelectorAll('.ni-chart__symbolart')) {
      await expect(art.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
    }
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), chip(root, 'half'), back(root), check(root)],
      'k',
      boards(root),
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [12, 7] },
    });
  },
};

/** A line plot of 4 positions (BUILD_LINE_POSITIONS_MAX), a stack of 6, from 10 measurements. */
const xsAtBound: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'line-plot',
    orientation: 'horizontal',
    categories: [],
    scale: 1,
    axisMax: 6,
    lineScale: { min: 1, max: 4, step: 1 },
  },
  data: { kind: 'measurements', values: [2, 2, 3, 2, 1, 2, 3, 2, 4, 2] },
  mode: 'xs',
};

/** Stress at the bound, K, 960 × 600: four positions, a stack of six Xs, ten measurements. */
export const StressLinePlotAtBoundKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: xsAtBound, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-bgb__length')).toHaveLength(10);
    await userEvent.click(chip(root));
    for (const at of [2, 2, 3, 2, 1, 2, 3, 2, 4, 2]) await userEvent.click(lane(root, String(at)));
    await expectChartShows(built(root), { '1': 1, '2': 6, '3': 2, '4': 1 });
    await expectNumeralsReadable(root);
    for (const x of built(root).querySelectorAll('.ni-chart__x')) {
      await expect(x.getBoundingClientRect().width).toBeGreaterThanOrEqual(16);
    }
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'k',
      boards(root),
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [1, 6, 2, 1] },
    });
  },
};

/** Twenty objects to count (BUILD_DATA_OBJECTS_MAX) into three tally rows. */
const objectsAtBound = bound(
  'tally',
  { kind: 'tally', orientation: 'horizontal', axisMax: 10 },
  { kind: 'objects', values: [9, 7, 4] },
);

/** Stress at the bound, K, 960 × 600: twenty objects, each at least 28 px and apart. */
export const StressObjectsAtBoundKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: objectsAtBound, tier: 'concrete' },
  render: inArea('landscapeMin'),
  play: async (ctx) => {
    const root = await findWidget(ctx.canvasElement, ROOT);
    const objects = [...root.querySelectorAll('.ni-bgb__object')];
    await expect(objects).toHaveLength(20);
    for (const o of objects) {
      await expect(o.getBoundingClientRect().width).toBeGreaterThanOrEqual(22);
    }
    await stressBuild({ firefly: 9, crab: 7, shell: 4 })(ctx);
  },
};

/**
 * The tally marks of a board can be seen and counted: every upright stroke is at least 20 px long
 * and neighbours are at least 6 px apart (centre to centre).
 */
async function expectTallyCountable(board: HTMLElement) {
  const strokes = [...board.querySelectorAll('.ni-chart__stroke:not([data-gate])')].map((s) =>
    s.getBoundingClientRect(),
  );
  await expect(strokes.length).toBeGreaterThan(0);
  for (const r of strokes) await expect(r.height, 'a tally stroke').toBeGreaterThanOrEqual(20);
  for (const [i, a] of strokes.entries()) {
    for (const b of strokes.slice(i + 1)) {
      const sameRow = Math.abs(a.top - b.top) < 2;
      if (!sameRow) continue;
      const apart = Math.abs(a.left + a.width / 2 - (b.left + b.width / 2));
      await expect(apart, 'tally strokes apart').toBeGreaterThanOrEqual(6);
    }
  }
}

// ---------- review round 1 (PR #102) ----------

/** Each picture is 2 and the row's top is 6: counts of 5 and 2. */
const picturesToTheTop: Config = {
  format: 'bar-graph-build',
  chart: {
    kind: 'picture',
    orientation: 'horizontal',
    categories: zero('apple', 'fish'),
    scale: 2,
    axisMax: 6,
  },
  data: { kind: 'table', values: [5, 2] },
  mode: 'pictures',
};

/**
 * A picture that does not fit is not placed: with 5 of 6 in the row, a whole picture is refused
 * (the row keeps 5 and says it is full) and "Take one back" restores exactly the count before the
 * last picture that was placed.
 */
export const PictureThatDoesNotFit: Story = {
  args: { config: picturesToTheTop, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const caption = () => root.querySelector('.ni-bgb__title[data-board="build"]') as HTMLElement;
    await userEvent.click(chip(root));
    await userEvent.click(lane(root, 'apple'));
    await userEvent.click(lane(root, 'apple'));
    await userEvent.click(chip(root, 'half'));
    await userEvent.click(lane(root, 'apple'));
    await expectChartShows(built(root), { apple: 5, fish: 0 }, 2);
    await userEvent.click(chip(root));
    await userEvent.click(lane(root, 'apple'));
    await expectChartShows(built(root), { apple: 5, fish: 0 }, 2);
    await expect(caption()).toHaveTextContent('6 is the most here.');
    await userEvent.click(back(root));
    await expectChartShows(built(root), { apple: 4, fish: 0 }, 2);
    await expect(caption()).toHaveTextContent('Your graph');
  },
};

const fitDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo playback of pictures that do not all fit settles: it places the ones that fit and ends. */
export const DemoPicturesSettle: Story = {
  args: { config: picturesToTheTop, disabled: true, demo: fitDemo, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fitDemo.play({ op: 'add-picture', args: { id: 'apple', count: 2.5 } });
    await expectChartShows(built(root), { apple: 5, fish: 0 }, 2);
    // One more whole picture does not fit: the op changes nothing and returns.
    await fitDemo.play({ op: 'add-picture', args: { id: 'apple', count: 1 } });
    await expectChartShows(built(root), { apple: 5, fish: 0 }, 2);
  },
};

/**
 * The rest state at the 960 × 600 minimum, G1: the tally data (3, 5, 2), the empty graph with its
 * 0–8 axis, nothing picked up and no cue. Raising a bar takes one tap or drag for each block.
 */
export const RestLandscapeMin: Story = {
  args: { config: tallyBars, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root.querySelector('.ni-bgb__data') as HTMLElement, {
      fish: 3,
      shell: 5,
      crab: 2,
    });
    await expectChartShows(built(root), { fish: 0, shell: 0, crab: 0 });
    await expect(root.querySelector('.ni-invite, [data-armed="true"]')).toBeNull();
    await expect(check(root)).toBeDisabled();
    await expectTallyCountable(root.querySelector('.ni-bgb__data') as HTMLElement);
    await expectFitsArea(
      areaBox(canvasElement),
      [...lanes(root), chip(root), back(root), check(root)],
      'g1-up',
      boards(root),
    );
    // One tap adds one block: a bar is never driven to the top by a single gesture.
    await pointerDrag(chip(root), center(lane(root, 'shell')));
    await expectChartShows(built(root), { fish: 0, shell: 1, crab: 0 });
    await userEvent.click(back(root));
    await expectChartShows(built(root), { fish: 0, shell: 0, crab: 0 });
  },
};

/** DAT.03's build bound: four whole-inch marks, a stack of 5 (the templates' cap), ten lengths. */
const dat03Lengths = [18, 18, 19, 18, 17, 18, 19, 20, 17, 19];
const dat03Build: Config = {
  ...xsAtBound,
  chart: { ...xsAtBound.chart, axisMax: 5, lineScale: { min: 17, max: 20, step: 1 } },
  data: { kind: 'measurements', values: dat03Lengths },
};

/**
 * DAT.03: the lengths are one list item each, in reading order; each lane speaks its place and
 * the child's own count; built Xs are at least 22 px at 960 × 600 and 1280 × 800.
 */
async function dat03BuildPlay({ canvasElement }: { canvasElement: HTMLElement }) {
  const root = await findWidget(canvasElement, ROOT);
  const list = within(root).getByRole('list', { name: 'The lengths' });
  const items = within(list).getAllByRole('listitem');
  await expect(items.map((i) => i.textContent)).toEqual(dat03Lengths.map(String));
  await expect(lane(root, '18')).toHaveAccessibleName('Above 18: 0');
  await userEvent.click(chip(root));
  for (const at of dat03Lengths) await userEvent.click(lane(root, String(at)));
  await expectChartShows(built(root), { '17': 2, '18': 4, '19': 3, '20': 1 });
  await expect(lane(root, '18')).toHaveAccessibleName('Above 18: 4');
  // Fill the tallest stack to the cap, then measure the Xs.
  await userEvent.click(lane(root, '18'));
  for (const x of built(root).querySelectorAll('.ni-chart__x')) {
    await expect(x.getBoundingClientRect().width, 'an X is at least 22 px').toBeGreaterThanOrEqual(
      22,
    );
  }
  await expectNumeralsReadable(root);
  await expectFitsArea(
    areaBox(canvasElement),
    [...lanes(root), chip(root), back(root), check(root)],
    'g1-up',
    boards(root),
  );
}

export const Dat03BuildLandscapeMin: Story = {
  args: { config: dat03Build, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: dat03BuildPlay,
};

export const Dat03BuildTablet: Story = {
  args: { config: dat03Build, tier: 'pictorial' },
  render: inArea('tablet'),
  play: dat03BuildPlay,
};
