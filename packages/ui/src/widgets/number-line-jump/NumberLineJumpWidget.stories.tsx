import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  expectTraceOrdered,
  findWidget,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `number-line-jump` (03 §5.5, Road Crew): a Pebbling hops along stepping stones (concrete) or a
 * number line, open line or timeline (pictorial). Answers `{ jumps, value? }`.
 */

type Config = ConfigFor<'number-line-jump'>;

/** ADD.03.t1: start on 4, hop 2 more; where do you land? */
const stones: Config = {
  format: 'number-line-jump',
  min: 0,
  max: 10,
  ticksEvery: 1,
  labelsEvery: 1,
  start: 4,
  goal: 'add',
  target: 6,
  allowedJumps: [1],
  path: 'stones',
  thenAsk: 'landing',
};
/** CNT.08.t1: count back from 5 to 3 on the stones. */
const stonesBack: Config = {
  ...stones,
  min: 1,
  max: 8,
  start: 5,
  goal: 'land-on',
  target: 3,
  allowedJumps: [-1],
  thenAsk: null,
};
/** ADD.03.t3: start at 10 and hop 3 more on a 0–15 line. */
const line: Config = {
  ...stones,
  max: 15,
  labelsEvery: 5,
  start: 10,
  target: 13,
  path: 'line',
};
/** CNT.08.t2: count back from 14 to 10. */
const lineBack: Config = {
  ...stonesBack,
  min: 8,
  max: 17,
  start: 14,
  target: 10,
  path: 'line',
};
/** Open line: 47 − 24 with tens and ones. */
const open: Config = {
  ...stones,
  max: 100,
  ticksEvery: null,
  labelsEvery: null,
  start: 47,
  goal: 'subtract',
  target: 23,
  allowedJumps: [-10, -1, 1, 10],
  path: 'open',
};
/** Timeline: from 15 to 45 minutes, how long? */
const timeline: Config = {
  ...stones,
  max: 60,
  ticksEvery: 5,
  labelsEvery: 15,
  start: 15,
  goal: 'difference',
  target: 45,
  allowedJumps: [5, 10],
  path: 'timeline',
  thenAsk: 'total-jump',
  unit: 'min',
};

const meta = {
  title: 'Widgets/Number line jump',
  args: {
    config: stones as WidgetConfig,
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

const ROOT = '.ni-nlj';
const jump = (root: HTMLElement, by: number) =>
  root.querySelector(`.ni-nlj__jump[data-by="${by}"]`) as HTMLElement;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const readout = (root: HTMLElement) =>
  root.querySelector('.ni-nlj__readout .ni-number') as HTMLElement;
const here = (root: HTMLElement) =>
  Number(root.querySelector('.ni-nlj__stone[data-here="true"]')?.getAttribute('data-stone'));

/** Concrete stones in K mode: hop +1 twice, type 6, check. K target sizes and gaps throughout. */
export const StonesK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const stoneEls = [...root.querySelectorAll<HTMLElement>('.ni-nlj__stone')];
    await expect(stoneEls).toHaveLength(11);
    for (const s of stoneEls) await expectTargetSize(s, 'k');
    await expectTargetGaps(stoneEls);
    await expect(here(root)).toBe(4);
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(jump(root, 1));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 5 }]);
    await userEvent.click(jump(root, 1));
    await expect(here(root)).toBe(6);
    // Still nothing to check until the landing is typed.
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '6'));
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [1, 1], value: 6 },
    });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:jump-1',
      'tap:jump-1',
      'tap:key-6',
    ]);
    const controls = [
      jump(root, 1),
      within(root).getByRole('button', { name: 'Take back' }),
      ...root.querySelectorAll<HTMLElement>('.ni-pad__key'),
      check,
    ];
    for (const el of controls) await expectTargetSize(el, 'k');
  },
};

/** Tapping the next stone hops there; tapping any other stone just says its number. */
export const StonesTapBack: Story = {
  args: { config: stonesBack },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const stone = (n: number) =>
      root.querySelector(`.ni-nlj__stone[data-stone="${n}"]`) as HTMLElement;
    await userEvent.click(stone(8));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 8 }]);
    await expect(here(root)).toBe(5);
    await userEvent.click(stone(4));
    await userEvent.click(jump(root, -1));
    await expect(here(root)).toBe(3);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [-1, -1] },
    });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual([
      'stone-8',
      'stone-4',
      'jump--1',
    ]);
  },
};

/** Undo takes back the last hop (trace `undo`), and the check sends what is left. */
export const Undo: Story = {
  args: { config: line, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const undo = within(root).getByRole('button', { name: 'Take back' });
    await expect(undo).toBeDisabled();
    for (let i = 0; i < 4; i++) await userEvent.click(jump(root, 1));
    await userEvent.click(undo);
    await expect(root.querySelectorAll('.ni-numberline__jump')).toHaveLength(3);
    await userEvent.click(key(root, '1'));
    await userEvent.click(key(root, '3'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [1, 1, 1], value: 13 },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.find((e) => e.t === 'undo')).toMatchObject({ target: 'jump-1' });
    await expectTraceOrdered(trace);
  },
};

/** Pictorial line, counting back with no typed answer: the hops are the answer. */
export const LineBack: Story = {
  args: { config: lineBack, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-pad')).toBeNull();
    // Hop arrows point left for a backward hop (direction, not colour).
    await expect(jump(root, -1).querySelector('[data-back="true"]')).not.toBeNull();
    for (let i = 0; i < 4; i++) await userEvent.click(jump(root, -1));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [-1, -1, -1, -1] },
    });
    for (const by of [-1]) await expectTargetSize(jump(root, by), 'g1-up');
  },
};

/**
 * Open line: the child chooses the jump sizes; each arc shows its size. Enter on an unfinished
 * answer sends nothing; later a double Enter and Check inside 400 ms submit once.
 */
export const OpenLine: Story = {
  args: { config: open, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-numberline__tick')).toHaveLength(0);
    await userEvent.click(jump(root, -10));
    // Desktop keys with nothing focused (Enter on a focused jump button would hop again).
    const blur = () => (document.activeElement as HTMLElement | null)?.blur();
    blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.click(jump(root, -10));
    for (let i = 0; i < 4; i++) await userEvent.click(jump(root, -1));
    await expect(within(root).getAllByText('−10')).toHaveLength(2);
    blur();
    await userEvent.keyboard('23');
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [-10, -10, -1, -1, -1, -1], value: 23 },
    });
    const buttons = [-10, -1, 1, 10].map((b) => jump(root, b));
    await expectTargetGaps(buttons);
  },
};

/** Timeline in minutes: arcs read "+10 min"; type the total jump. */
export const Timeline: Story = {
  args: { config: timeline, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(jump(root, 10));
    await userEvent.click(jump(root, 10));
    await userEvent.click(jump(root, 10));
    await expect(within(root).getAllByText('+10 min')).toHaveLength(3);
    await userEvent.keyboard('30');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [10, 10, 10], value: 30 },
    });
  },
};

/** Keyboard: Tab to a jump button, Enter and Space hop; digits and Enter answer. */
export const Keyboard: Story = {
  args: { config: line, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    jump(root, 1).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(root.querySelectorAll('.ni-numberline__jump')).toHaveLength(3));
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('13{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [1, 1, 1], value: 13 },
    });
  },
};

/** A jump off the end of the road is not offered. */
export const EdgeOfTheRoad: Story = {
  args: { config: { ...line, start: 15, target: 13, allowedJumps: [-1, 1] }, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(jump(root, 1)).toBeDisabled();
    await expect(jump(root, -1)).toBeEnabled();
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(jump(root, 1)).toBeDisabled();
    await userEvent.keyboard('6');
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (the ADD.03.t1 solution): highlight the start, hop, hop, label the landing. */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight', args: { at: 4 } });
    await expect(root.querySelector('.ni-nlj__stone[data-highlight="true"]')).not.toBeNull();
    await demoController.play({ op: 'hop', args: { by: 1 } });
    await demoController.play({ op: 'bridge-to', args: { at: 6 } });
    await expect(here(root)).toBe(6);
    await demoController.play({ op: 'label-landing' });
    await expect(readout(root)).toHaveTextContent('6');
    await expect(demoController.play({ op: 'drop' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'hop', args: { by: 1 } });
    await waitFor(() => expect(jump(root, 1).classList.contains('ni-invite')).toBe(true));
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const lineDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo on the line: hops draw arcs; `answer` types the value. */
export const DemoLine: Story = {
  args: { config: line, tier: 'pictorial', disabled: true, demo: lineDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await lineDemo.play({ op: 'highlight', args: { at: 10 } });
    for (let i = 0; i < 3; i++) await lineDemo.play({ op: 'hop', args: { by: 1 } });
    await expect(root.querySelectorAll('.ni-numberline__jump')).toHaveLength(3);
    await lineDemo.play({ op: 'answer', args: { value: 13 } });
    await expect(readout(root)).toHaveTextContent('13');
    lineDemo.invite({ op: 'answer', args: { value: 13 } });
    await waitFor(() => expect(root.querySelector('.ni-nlj__readout.ni-invite')).not.toBeNull());
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: hops are instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'hop', args: { by: 1 } });
    await reducedController.play({ op: 'hop', args: { by: 1 } });
    await reducedController.play({ op: 'label-landing' });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(here(root)).toBe(6);
  },
};
