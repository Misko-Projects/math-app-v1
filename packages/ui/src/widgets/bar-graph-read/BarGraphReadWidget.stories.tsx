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
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
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
 * `bar-graph-read` (03 §5.5): read a picture graph, bar graph, tally chart, table or line plot.
 * Counting questions answer a number (pad from G1, one-more / one-less counter in K); most and
 * fewest questions answer a category by tapping its label on the chart.
 *
 * Configs are real generated items (`generateItem(template, seed)` over the compiled catalog),
 * named by template and seed; the scaled and line-plot charts are hand-made (DAT.06–08 have no
 * generator yet, K02).
 */

type Config = ConfigFor<'bar-graph-read'>;

const cat = (id: string, value: number) => ({ id, label: `noun.${id}.many`, value });

/** DAT.02.t1 seed 2: picture graph, "How many fish are there?" (3). */
const pictureHowMany: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'picture',
    orientation: 'horizontal',
    categories: [cat('fish', 3), cat('apple', 2), cat('shell', 3)],
    scale: 1,
    axisMax: 5,
  },
  question: { type: 'how-many', categories: ['fish'] },
};

/** DAT.02.t2 seed 1: bar graph, "How many more fish than shells?" (9 − 3 = 6). */
const barDifference: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'bar',
    orientation: 'vertical',
    categories: [cat('fish', 9), cat('shell', 3), cat('apple', 3)],
    scale: 1,
    axisMax: 9,
  },
  question: { type: 'difference', categories: ['fish', 'shell'] },
};

/** DAT.02.t2 seed 2: "How many more shells than apples?" (10 − 2 = 8). */
const barDifference10: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'bar',
    orientation: 'vertical',
    categories: [cat('fish', 3), cat('apple', 2), cat('shell', 10)],
    scale: 1,
    axisMax: 10,
  },
  question: { type: 'difference', categories: ['shell', 'apple'] },
};

/** DAT.09.t3 seed 1: table, "Which kind has the most?" (fish). */
const tableMost: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'table',
    orientation: 'horizontal',
    categories: [cat('crab', 1), cat('fish', 10), cat('apple', 5)],
    scale: 1,
    axisMax: 10,
  },
  question: { type: 'most', categories: ['crab', 'fish', 'apple'] },
};

/** DAT.09.t2 seed 1: tally chart, "How many crabs are there?" (10: two gates). */
const tallyHowMany: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'tally',
    orientation: 'horizontal',
    categories: [cat('apple', 9), cat('crab', 10), cat('shell', 10)],
    scale: 1,
    axisMax: 10,
  },
  question: { type: 'how-many', categories: ['crab'] },
};

/** DAT.10.t3 seed 2 (K): picture graph, "Which group has the fewest?" (shells). */
const pictureLeast: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'picture',
    orientation: 'horizontal',
    categories: [cat('crab', 7), cat('shell', 2)],
    scale: 1,
    axisMax: 7,
  },
  question: { type: 'least', categories: ['crab', 'shell'] },
};

/** DAT.02.t3 seed 2: bar graph, "Which kind has the most?" (crab; fish and apple tie below). */
const barMost: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'bar',
    orientation: 'vertical',
    categories: [cat('fish', 5), cat('apple', 5), cat('crab', 10)],
    scale: 1,
    axisMax: 10,
  },
  question: { type: 'most', categories: ['fish', 'apple', 'crab'] },
};

/** Hand-made (DAT.06, K02): each picture is 2; 7 crabs are 3½ pictures. */
const scaledPicture: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'picture',
    orientation: 'horizontal',
    categories: [cat('crab', 7), cat('fish', 10)],
    scale: 2,
    axisMax: 10,
  },
  question: { type: 'total', categories: ['crab', 'fish'] },
};

/** Hand-made (DAT.06, K02): horizontal bars counting by 5. */
const scaledBars: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'bar',
    orientation: 'horizontal',
    categories: [cat('fish', 20), cat('shell', 40)],
    scale: 5,
    axisMax: 40,
  },
  question: { type: 'difference', categories: ['shell', 'fish'] },
};

/** Hand-made (DAT.03, K02): a line plot of lengths, "How many are 2 long?" */
const linePlot: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'line-plot',
    orientation: 'horizontal',
    categories: [cat('1', 2), cat('2', 4), cat('3', 1), cat('5', 2)].map((c) => ({
      ...c,
      label: 'noun.fish.many',
    })),
    scale: 1,
    axisMax: 6,
    lineScale: { min: 0, max: 6, step: 1 },
  },
  question: { type: 'how-many', categories: ['2'] },
};

const meta = {
  title: 'Widgets/Bar graph read',
  args: {
    config: pictureHowMany as WidgetConfig,
    tier: 'pictorial',
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

const ROOT = '.ni-bgr';
const labels = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-bgr__name, .ni-bgr__cat'),
];
const padKeys = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-pad .ni-pad__key'),
];
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });

/**
 * K, a picture graph (DAT.02.t1 seed 2): exactly 3 fish, 2 apples, 3 shells. Tapping a label
 * speaks it; "one more" three times shows 3 and counts aloud; Check answers 3. At the tablet
 * widget area (1226 × 493) nothing scrolls.
 */
export const PictureHowManyKTablet: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('tablet'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { fish: 3, apple: 2, shell: 3 });
    const canvas = within(root);
    await userEvent.click(canvas.getByRole('button', { name: 'fish' }));
    await expect(audio.say).toHaveBeenCalledWith('noun.fish.many', undefined);
    const more = canvas.getByRole('button', { name: 'One more' });
    for (let i = 0; i < 3; i += 1) await userEvent.click(more);
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 3 }]);
    await expectFitsArea(
      areaBox(canvasElement),
      [...labels(root), more, canvas.getByRole('button', { name: 'One less' }), check(root)],
      'k',
      [root.querySelector('.ni-chart') as HTMLElement],
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 3 });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual([
      'tap:cat-fish',
      'tap:step-more',
      'tap:step-more',
      'tap:step-more',
    ]);
  },
};

/**
 * G1, a bar graph (DAT.02.t2 seed 1): every bar ends on its gridline. Type 6 on the pad (the
 * digit is spoken), Check answers 6. Pad keys are G1-sized and spaced.
 */
export const BarDifferenceTablet: Story = {
  args: { config: barDifference },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('tablet'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { fish: 9, shell: 3, apple: 3 });
    // Axis numerals are 32 px or more.
    for (const n of root.querySelectorAll('.ni-chart__numeral')) {
      await expect(Number.parseFloat(getComputedStyle(n).fontSize)).toBeGreaterThanOrEqual(32);
    }
    await expect(check(root)).toBeDisabled();
    await userEvent.click(within(root).getByRole('button', { name: '6' }));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 6 }]);
    await expect(root.querySelector('.ni-bgr__display')?.textContent).toBe('6');
    await expectFitsArea(
      areaBox(canvasElement),
      [...labels(root), ...padKeys(root), check(root)],
      'g1-up',
      [root.querySelector('.ni-chart') as HTMLElement],
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** The 960 × 600 minimum (852 × 319 inside): a 10-high bar graph and the compact pad fit. */
export const BarDifferenceLandscapeMin: Story = {
  args: { config: barDifference10 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { fish: 3, apple: 2, shell: 10 });
    await expectFitsArea(
      areaBox(canvasElement),
      [...labels(root), ...padKeys(root), check(root)],
      'g1-up',
      [root.querySelector('.ni-chart') as HTMLElement],
    );
    // Desktop keyboard: digits, Backspace and Enter work on the pad.
    await userEvent.keyboard('9{Backspace}8');
    await expect(root.querySelector('.ni-bgr__display')?.textContent).toBe('8');
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 8 });
  },
};

/**
 * K at the 960 × 600 minimum (DAT.10.t3 seed 2): "Which group has the fewest?" The labels are the
 * choices; tap the shells (spoken, ink ring and check badge), Check answers `shell`.
 */
export const PictureLeastKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: pictureLeast },
  parameters: { ui: { audio: spyAudio() } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { crab: 7, shell: 2 });
    const canvas = within(root);
    await expectFitsArea(areaBox(canvasElement), [...labels(root), check(root)], 'k', [
      root.querySelector('.ni-chart') as HTMLElement,
    ]);
    await userEvent.click(canvas.getByRole('button', { name: 'crabs' }));
    await userEvent.click(canvas.getByRole('button', { name: 'shells' }));
    await expect(audio.say).toHaveBeenLastCalledWith('noun.shell.many', undefined);
    await expect(canvas.getByRole('button', { name: 'shells' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByRole('button', { name: 'crabs' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'shell' });
  },
};

/** DAT.09.t3 seed 1: a table; the category cards are the choices (keyboard: Tab, Space, Enter). */
export const TableMostKeyboard: Story = {
  args: { config: tableMost },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { crab: 1, fish: 10, apple: 5 });
    const canvas = within(root);
    const cards = labels(root);
    await expect(cards).toHaveLength(3);
    for (const c of cards) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps(cards);
    canvas.getByRole('button', { name: 'crabs' }).focus();
    await userEvent.tab();
    await userEvent.keyboard(' ');
    await expect(canvas.getByRole('button', { name: 'fish' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    check(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'fish' });
  },
};

/** DAT.09.t2 seed 1: tally marks in fives: 9 is a gate and four, 10 is two gates. */
export const TallyHowMany: Story = {
  args: { config: tallyHowMany },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { apple: 9, crab: 10, shell: 10 });
    await userEvent.click(within(root).getByRole('button', { name: '1' }));
    await userEvent.click(within(root).getByRole('button', { name: '0' }));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 10 });
  },
};

/** Each picture is 2 (a key says so): 7 crabs are three and a half crabs, 10 fish five. */
export const ScaledPictureHalves: Story = {
  args: { config: scaledPicture },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { crab: 7, fish: 10 }, 2);
    const key = root.querySelector('.ni-chart__key') as HTMLElement;
    await expect(key.textContent).toBe('= 2');
    await expect(Number.parseFloat(getComputedStyle(key).fontSize)).toBeGreaterThanOrEqual(32);
    await expect(root.querySelector('.ni-visually-hidden')?.textContent).toBe('Each picture is 2');
  },
};

/** Horizontal bars counting by 5 (labels every 5 or 10 so 32 px numerals never crowd). */
export const ScaledHorizontalBars: Story = {
  args: { config: scaledBars },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { fish: 20, shell: 40 });
    const nums = [...root.querySelectorAll('.ni-chart__numeral')].map((n) =>
      n.getBoundingClientRect(),
    );
    for (let i = 1; i < nums.length; i += 1) {
      await expect((nums[i] as DOMRect).left).toBeGreaterThan((nums[i - 1] as DOMRect).right);
    }
  },
};

/** A line plot: one X per stick above its length. */
export const LinePlotHowMany: Story = {
  args: { config: linePlot },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { '0': 0, '1': 2, '2': 4, '3': 1, '4': 0, '5': 2, '6': 0 });
    await userEvent.click(within(root).getByRole('button', { name: '4' }));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 4 });
  },
};

/** Portrait (746 × 812): the answer moves under the chart; still no scroll. */
export const BarMostPortraitK: Story = {
  globals: { ageMode: 'k' },
  args: { config: barMost },
  render: inArea('portrait'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { fish: 5, apple: 5, crab: 10 });
    await expectFitsArea(areaBox(canvasElement), [...labels(root), check(root)], 'k', [
      root.querySelector('.ni-chart') as HTMLElement,
    ]);
    await userEvent.click(within(root).getByRole('button', { name: 'crabs' }));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'crab' });
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const b of within(root).getAllByRole('button')) await expect(b).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), the DAT.02.t2 solution: Pip reads each bar across to the axis, counts the
 * pictures, types the answer. Input stays off while Pip plays.
 */
export const DemoMode: Story = {
  args: { config: barDifference, disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const playing = demoController.play({ op: 'read-axis', args: { id: 'fish' } });
    await waitFor(() => expect(root.querySelector('.ni-chart__read')).not.toBeNull());
    await expect(root.querySelector('.ni-chart__lane[data-pointed="true"]')).not.toBeNull();
    await playing;
    await waitFor(() => expect(root.querySelector('.ni-chart__read')).toBeNull());
    await demoController.play({ op: 'point-bar', args: { id: 'shell' } });
    await demoController.play({ op: 'answer', args: { value: 6 } });
    await expect(root.querySelector('.ni-bgr__display')?.textContent).toBe('6');
    await expect(demoController.play({ op: 'raise-bar' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const countController: WidgetDemo = createDemoController({ strict: true });

/** `count-pictures`: Pip rings the pictures one by one and counts them aloud (num.* clips). */
export const DemoCountPictures: Story = {
  args: { disabled: true, demo: countController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const playing = countController.play({ op: 'count-pictures', args: { id: 'fish' } });
    await waitFor(
      () => expect(root.querySelectorAll('.ni-chart__symbol[data-counted="true"]')).toHaveLength(3),
      { timeout: 4000 },
    );
    await playing;
    await expect(audio.sayPhrases.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      [{ number: 1 }],
      [{ number: 2 }],
      [{ number: 3 }],
    ]);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: an op is an instant change plus the highlight, which stays to be seen. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: tallyHowMany, disabled: true, demo: reducedController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await reducedController.play({ op: 'count-pictures', args: { id: 'crab' } });
    // One change, not a count mark by mark: the total is spoken once, and nothing else.
    await expect(audio.sayPhrases.mock.calls).toEqual([[[{ number: 10 }]]]);
    await waitFor(() =>
      expect(root.querySelectorAll('.ni-chart__stroke[data-counted="true"]')).toHaveLength(10),
    );
    await expect(root.querySelector('.ni-chart__lane[data-pointed="true"]')).not.toBeNull();
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** The child's turn (faded example): Pip's hand points at the category to tap. */
export const Invite: Story = {
  args: { config: pictureLeast, demo: inviteController },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await inviteController.invite({ op: 'answer', args: { id: 'shell' } });
    const card = await within(root).findByRole('button', { name: 'shells' });
    await waitFor(() => expect(card).toHaveClass('ni-invite'));
    const hand = root.querySelector('.ni-hand') as HTMLElement;
    await expectPointerOn(hand, card, root);
    await expect(card).toBeEnabled();
    // One invited control, one ring inside it; the story ends with Pip's hand visible under it.
    await expectOneInvite(root);
  },
};

const clearController: WidgetDemo = createDemoController({ strict: true });

/** Clearing an invite (`invite(null)`) takes Pip's hand and the ring away. */
export const InviteCleared: Story = {
  args: { config: pictureLeast, demo: clearController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await clearController.invite({ op: 'answer', args: { id: 'shell' } });
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    await clearController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
    await expect(root.querySelector('.ni-invite')).toBeNull();
  },
};

// ---------- stress states (06 §1, §2: nothing clips or scrolls) ----------

/**
 * The bound of vertical bars: three bars (GRAPH_COLUMNS_MAX), one at the top of the longest axis
 * (GRAPH_BAR_STEPS_MAX steps of 5, to 50), under the longest category name ("fireflies").
 */
const barsAtMax: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'bar',
    orientation: 'vertical',
    categories: [cat('firefly', 50), cat('crab', 35), cat('shell', 20)],
    scale: 5,
    axisMax: 50,
  },
  question: { type: 'difference', categories: ['firefly', 'shell'] },
};

/** The bound of horizontal bars: two rows (GRAPH_BAR_ROWS_MAX) on the longest axis, 10 steps of 10. */
const rowsAtMax: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'bar',
    orientation: 'horizontal',
    categories: [cat('firefly', 100), cat('crab', 70)],
    scale: 10,
    axisMax: 100,
  },
  question: { type: 'difference', categories: ['firefly', 'crab'] },
};

/** The bound of a picture graph: three rows, one of 10 pictures (GRAPH_PICTURES_MAX), all one size. */
const tenInARow: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'picture',
    orientation: 'horizontal',
    categories: [cat('firefly', 10), cat('crab', 9), cat('apple', 4)],
    scale: 1,
    axisMax: 10,
  },
  question: { type: 'how-many', categories: ['crab'] },
};

/** The bound of a tally chart: three rows, one of 20 marks (GRAPH_TALLY_MAX). */
const tallyAtMax: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'tally',
    orientation: 'horizontal',
    categories: [cat('firefly', 20), cat('crab', 19), cat('shell', 5)],
    scale: 1,
    axisMax: 20,
  },
  question: { type: 'total', categories: ['firefly', 'crab', 'shell'] },
};

/** The bound of a table: three rows with two-digit counts; the cards are the choices. */
const tableAtMax: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'table',
    orientation: 'horizontal',
    categories: [cat('firefly', 20), cat('crab', 19), cat('shell', 5)],
    scale: 1,
    axisMax: 20,
  },
  question: { type: 'most', categories: ['firefly', 'crab', 'shell'] },
};

/** The bound of a line plot: 13 positions (0 to 3 by quarters), one stack of 6 Xs. */
const linePlotAtMax: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'line-plot',
    orientation: 'horizontal',
    categories: [cat('0', 1), cat('0.75', 3), cat('1.5', 6), cat('2.25', 5), cat('3', 2)].map(
      (c) => ({ ...c, label: 'noun.fish.many' }),
    ),
    scale: 1,
    axisMax: 6,
    lineScale: { min: 0, max: 3, step: 0.25 },
  },
  question: { type: 'how-many', categories: ['1.5'] },
};

const stressRead =
  (config: Config, values: Record<string, number>, age: 'k' | 'g1-up') =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, values);
    await expectNumeralsReadable(root);
    if (config.chart.kind === 'picture') await expectSymbolsOneSize(root);
    if (config.chart.kind === 'bar') await expectAxisReachesBars(root, config);
    const controls = [
      ...labels(root),
      ...padKeys(root),
      ...root.querySelectorAll<HTMLElement>('.ni-stepper__key'),
      check(root),
    ];
    await expectFitsArea(areaBox(canvasElement), controls, age, [
      root.querySelector('.ni-chart') as HTMLElement,
    ]);
  };

/** Stress at the bound: three bars up to 50 at the tablet area. */
export const StressBarsAtMaxTablet: Story = {
  args: { config: barsAtMax },
  render: inArea('tablet'),
  play: stressRead(barsAtMax, { firefly: 50, crab: 35, shell: 20 }, 'g1-up'),
};

/** Stress at the bound: three bars up to 50 at the 960 × 600 minimum. */
export const StressBarsAtMaxLandscapeMin: Story = {
  args: { config: barsAtMax },
  render: inArea('landscapeMin'),
  play: stressRead(barsAtMax, { firefly: 50, crab: 35, shell: 20 }, 'g1-up'),
};

/** Stress at the bound, K: three bars up to 50 at the 960 × 600 minimum. */
export const StressBarsAtMaxKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: barsAtMax },
  render: inArea('landscapeMin'),
  play: stressRead(barsAtMax, { firefly: 50, crab: 35, shell: 20 }, 'k'),
};

/** Stress at the bound, K: two horizontal bars up to 100 at the 960 × 600 minimum. */
export const StressRowsAtMaxKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: rowsAtMax },
  render: inArea('landscapeMin'),
  play: stressRead(rowsAtMax, { firefly: 100, crab: 70 }, 'k'),
};

/** Stress at the bound: two horizontal bars up to 100 at the 960 × 600 minimum. */
export const StressRowsAtMaxLandscapeMin: Story = {
  args: { config: rowsAtMax },
  render: inArea('landscapeMin'),
  play: stressRead(rowsAtMax, { firefly: 100, crab: 70 }, 'g1-up'),
};

/** Stress at the bound, K: a row of 10 pictures at the tablet area. */
export const StressTenPicturesKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: tenInARow },
  render: inArea('tablet'),
  play: stressRead(tenInARow, { firefly: 10, crab: 9, apple: 4 }, 'k'),
};

/** Stress at the bound, K: a row of 10 pictures at the 960 × 600 minimum. */
export const StressTenPicturesKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: tenInARow },
  render: inArea('landscapeMin'),
  play: stressRead(tenInARow, { firefly: 10, crab: 9, apple: 4 }, 'k'),
};

/** Stress at the bound, K: a tally row of 20 marks at the 960 × 600 minimum. */
export const StressTallyAtMaxKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: tallyAtMax },
  render: inArea('landscapeMin'),
  play: stressRead(tallyAtMax, { firefly: 20, crab: 19, shell: 5 }, 'k'),
};

/** Stress at the bound, K: a table of two-digit counts at the 960 × 600 minimum. */
export const StressTableAtMaxKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: tableAtMax },
  render: inArea('landscapeMin'),
  play: stressRead(tableAtMax, { firefly: 20, crab: 19, shell: 5 }, 'k'),
};

/** Every X of a line plot can be seen and counted: at least 16 px wide, none touching another. */
async function expectXsCountable(root: HTMLElement, count: number) {
  const boxes = () =>
    [...root.querySelectorAll('.ni-chart__x')].map((x) => x.getBoundingClientRect());
  // The chart takes its size once the widget has measured its area.
  await waitFor(() => expect(Math.min(...boxes().map((b) => b.width))).toBeGreaterThanOrEqual(16));
  const xs = boxes();
  await expect(xs).toHaveLength(count);
  for (const [i, a] of xs.entries()) {
    await expect(a.width, 'an X is at least 16 px').toBeGreaterThanOrEqual(16);
    for (const b of xs.slice(i + 1)) {
      const apart =
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      await expect(apart, 'two Xs do not overlap').toBe(true);
    }
  }
}

/** Stress at the bound: a line plot of 13 positions with a stack of 6 at the 960 × 600 minimum. */
export const StressLinePlotAtMaxLandscapeMin: Story = {
  args: { config: linePlotAtMax },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectNumeralsReadable(root);
    await expectXsCountable(root, 17);
    await expectFitsArea(areaBox(canvasElement), [...padKeys(root), check(root)], 'g1-up', [
      root.querySelector('.ni-chart') as HTMLElement,
    ]);
  },
};

/** Stress at the bound, K: the same line plot at the 960 × 600 minimum. */
export const StressLinePlotAtMaxKLandscapeMin: Story = {
  globals: { ageMode: 'k' },
  args: { config: linePlotAtMax },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectNumeralsReadable(root);
    await expectXsCountable(root, 17);
    await expectFitsArea(
      areaBox(canvasElement),
      [...root.querySelectorAll<HTMLElement>('.ni-stepper__key[data-key="more"]'), check(root)],
      'k',
      [root.querySelector('.ni-chart') as HTMLElement],
    );
  },
};

/**
 * A picked category is put back where it sits: tap the shells (picked), tap them again and
 * nothing is picked, Check has nothing to send, and the trace holds the undo.
 */
export const ChoiceUndo: Story = {
  args: { config: pictureLeast },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const shells = within(root).getByRole('button', { name: 'shells' });
    await userEvent.click(shells);
    await expect(shells).toHaveAttribute('aria-pressed', 'true');
    await expect(check(root)).toBeEnabled();
    await userEvent.click(shells);
    await expect(shells).toHaveAttribute('aria-pressed', 'false');
    await expect(check(root)).toBeDisabled();
    shells.focus();
    await userEvent.keyboard('{Enter}');
    await expect(shells).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Enter}');
    await expect(shells).toHaveAttribute('aria-pressed', 'false');
    // Delete (or Backspace) on the picked category puts it back too; on an unpicked one it does
    // nothing.
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Delete}');
    await expect(shells).toHaveAttribute('aria-pressed', 'false');
    await userEvent.keyboard('{Backspace}');
    await expect(shells).toHaveAttribute('aria-pressed', 'false');
    const kinds = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(kinds.filter((k) => k === 'undo:cat-shell')).toHaveLength(3);
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

const stepperInvite: WidgetDemo = createDemoController({ strict: true });

/** K invite on a counting question: one ring, on "one more", with Pip's hand under it. */
export const InviteStepperK: Story = {
  globals: { ageMode: 'k' },
  args: { demo: stepperInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await stepperInvite.invite({ op: 'answer', args: { value: 3 } });
    const more = within(root).getByRole('button', { name: 'One more' });
    await waitFor(() => expect(more).toHaveClass('ni-invite'));
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, more, root);
    await expectOneInvite(root);
  },
};

/**
 * A bar graph's axis ends on a labelled line at or above its tallest bar, in 32 px numerals, so
 * every bar is read from a labelled line (evidence review of PR #102).
 */
async function expectAxisReachesBars(root: HTMLElement, config: Config) {
  const numerals = [...root.querySelectorAll<HTMLElement>('.ni-chart__numeral')];
  const values = numerals.map((n) => Number(n.textContent));
  const tallest = Math.max(...config.chart.categories.map((c) => c.value));
  await expect(Math.max(...values), 'the top labelled line').toBeGreaterThanOrEqual(tallest);
  await expect(values, 'the axis starts at zero').toContain(0);
  for (const n of numerals) {
    await expect(Number.parseFloat(getComputedStyle(n).fontSize)).toBeGreaterThanOrEqual(32);
  }
}

/**
 * A picture graph with a key at the 960 × 600 minimum: each picture is 2 (the key says so beside
 * the first row's picture), 7 crabs are three pictures and a half, 10 fish are five.
 */
export const ScaledPictureKeyLandscapeMin: Story = {
  args: { config: scaledPicture },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectChartShows(root, { crab: 7, fish: 10 }, 2);
    const key = root.querySelector('.ni-chart__key') as HTMLElement;
    await expect(key.textContent).toBe('= 2');
    // The key shows every row's picture, so it is read as "each picture", not the crabs alone.
    await expect(
      [...key.querySelectorAll('.ni-chart__keysprite')].map((k) => k.getAttribute('data-sprite')),
    ).toEqual(['crab', 'fish']);
    const keyBox = key.getBoundingClientRect();
    for (const part of key.children) {
      const r = part.getBoundingClientRect();
      await expect(r.left).toBeGreaterThanOrEqual(keyBox.left - 0.5);
      await expect(r.right).toBeLessThanOrEqual(keyBox.right + 0.5);
    }
    await expectSymbolsOneSize(root);
    await expectFitsArea(
      areaBox(canvasElement),
      [...labels(root), ...padKeys(root), check(root)],
      'g1-up',
      [root.querySelector('.ni-chart') as HTMLElement, key],
    );
  },
};
