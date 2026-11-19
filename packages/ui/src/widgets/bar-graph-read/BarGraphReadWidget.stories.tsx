import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
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
    categories: [cat('crab', 7), cat('fish', 10), cat('shell', 4)],
    scale: 2,
    axisMax: 10,
  },
  question: { type: 'total', categories: ['crab', 'fish', 'shell'] },
};

/** Hand-made (DAT.06, K02): horizontal bars counting by 5. */
const scaledBars: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'bar',
    orientation: 'horizontal',
    categories: [cat('apple', 35), cat('fish', 20), cat('crab', 15), cat('shell', 40)],
    scale: 5,
    axisMax: 40,
  },
  question: { type: 'difference', categories: ['shell', 'crab'] },
};

/** Hand-made (DAT.03, K02): a line plot of lengths, "How many are 2 long?" */
const linePlot: Config = {
  format: 'bar-graph-read',
  chart: {
    kind: 'line-plot',
    orientation: 'horizontal',
    categories: [cat('1', 2), cat('2', 4), cat('3', 1), cat('5', 2)].map((c) => ({
      ...c,
      label: 'noun.stick.many',
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
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-bgr';
const labels = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-bgr__name, .ni-bgr__cat'),
];
const padKeys = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
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
    await expectChartShows(root, { crab: 7, fish: 10, shell: 4 }, 2);
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
    await expectChartShows(root, { apple: 35, fish: 20, crab: 15, shell: 40 });
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
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'count-pictures', args: { id: 'crab' } });
    // Instant: no per-mark pauses.
    await expect(performance.now() - started).toBeLessThan(400);
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
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await inviteController.invite({ op: 'answer', args: { id: 'shell' } });
    const card = await within(root).findByRole('button', { name: 'shells' });
    await waitFor(() => expect(card).toHaveClass('ni-invite'));
    const hand = root.querySelector('.ni-hand') as HTMLElement;
    await expectPointerOn(hand, card, root);
    await expect(card).toBeEnabled();
    await inviteController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
  },
};
