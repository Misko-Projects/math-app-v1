import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
import { findWidget, renderWidget, traceOf } from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `dot-flash` (03 §5.5, pictorial): the picture shows by itself for `flashMs`, then hides under a
 * soft cover; "look again" re-shows it once (the level-1 hint, traced as `tap reflash`). Answer on
 * the pad or by picking, while the picture is hidden. Configs are SUB.01–SUB.06 items.
 */

/** SUB.01.t1 seed 1: 4 scattered dots, K timing. */
const dots: ConfigFor<'dot-flash'> = {
  format: 'dot-flash',
  stimulus: { kind: 'dots', arrangement: 'scatter', groups: [4] },
  flashMs: 1500,
  reflashes: 1,
  input: 'pad',
};

/** SUB.05.t2 seed 1: two hands, 5 and 5 fingers. */
const fingers: ConfigFor<'dot-flash'> = {
  ...dots,
  stimulus: { kind: 'dots', arrangement: 'fingers', groups: [5, 5] },
  flashMs: 1000,
};

/** SUB.03.t5 seed 1: five-frames, 5 and 2; here with pick input. */
const fiveFrames: ConfigFor<'dot-flash'> = {
  ...dots,
  stimulus: { kind: 'dots', arrangement: 'five-frame', groups: [5, 2] },
  input: 'pick',
  pickOptions: [6, 7, 8],
};

/** SUB.03.t3 seed 1: a ten-frame showing 6. */
const tenFrame: ConfigFor<'dot-flash'> = {
  ...dots,
  stimulus: { kind: 'ten-frame', frames: 1, filled: [6] },
};

/** SUB.06.t2 seed 1: shells on two plates, 1 and 5, G1 timing. */
const plates: ConfigFor<'dot-flash'> = {
  ...dots,
  stimulus: {
    kind: 'objects',
    set: { count: 6, sprite: 'shell', layout: 'groups', groups: [1, 5], layoutSeed: 75124327 },
  },
  flashMs: 1000,
};

/** CMP.13-style estimate: about how many? (the engine applies the tolerance). */
const estimate: ConfigFor<'dot-flash'> = {
  ...dots,
  stimulus: { kind: 'dots', arrangement: 'scatter', groups: [15] },
  flashMs: 1000,
  estimate: { tolerancePct: 20 },
};

const meta = {
  title: 'Widgets/Dot flash',
  args: {
    config: dots as WidgetConfig,
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

const ROOT = '.ni-flash';
const board = (root: HTMLElement) => root.querySelector('.ni-flash__board') as HTMLElement;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const hidden = (root: HTMLElement) =>
  waitFor(() => expect(board(root)).toHaveAttribute('data-shown', 'false'), { timeout: 4000 });
/** The board's state once React has committed (a demo op resolves as its last change lands). */
const shownIs = (root: HTMLElement, v: 'true' | 'false') =>
  waitFor(() => expect(board(root)).toHaveAttribute('data-shown', v), { timeout: 500 });

/**
 * K (SUB.01.t1): the dots show by themselves, then hide. Type 4 while they're hidden and check.
 * "Look again" shows them once more (traced as the level-1 hint), then it is used up.
 */
export const DotsPadK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await shownIs(root, 'true');
    await expect(root.querySelectorAll('[data-sprite="counter"]')).toHaveLength(4);
    const again = canvas.getByRole('button', { name: 'Look again' });
    await expect(again).toBeDisabled();
    await hidden(root);
    await waitFor(() =>
      expect(canvas.getByRole('img', { name: 'The picture went away' })).toBeVisible(),
    );
    await expect(canvas.queryByRole('img', { name: 'Look at the picture' })).toBeNull();
    // The answer works while the picture is hidden.
    await userEvent.click(key(root, '4'));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 4 }]);
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Your answer: 4' })).toBeVisible(),
    );
    await userEvent.click(again);
    await shownIs(root, 'true');
    await hidden(root);
    await expect(again).toBeDisabled();
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of [...keys, again]) await expectTargetSize(k, 'k');
    await expectTargetGaps(keys);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 4 });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:key-4',
      'tap:reflash',
    ]);
  },
};

/**
 * G1, fingers (SUB.05.t2), keyboard: Enter on an empty answer sends nothing; type 1, 0; a double
 * Enter plus Check inside 400 ms is one response.
 */
export const FingersKeyboard: Story = {
  args: { config: fingers },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-hand-art')).toHaveLength(2);
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('1');
    await userEvent.keyboard('0');
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 10 });
    for (const k of root.querySelectorAll('.ni-pad__key')) await expectTargetSize(k, 'g1-up');
  },
};

/** Five-frames 5 + 2 (SUB.03.t5), pick input: the options are a numeral tray. */
export const FiveFramePick: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveFrames },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
    await expect(cards.map((c) => c.textContent)).toEqual(['6', '7', '8']);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    await userEvent.click(within(root).getByRole('button', { name: '7' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(['opt-7']);
  },
};

/** A ten-frame (SUB.03.t3), shown while it flashes. */
export const TenFrame: Story = {
  args: { config: tenFrame },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await shownIs(root, 'true');
    await waitFor(() =>
      expect(within(root).getByRole('img', { name: 'Look at the picture' })).toBeVisible(),
    );
  },
};

/** Objects on plates (SUB.06.t2), G1 timing (1000 ms). */
export const Plates: Story = {
  args: { config: plates },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('[data-sprite="shell"]')).toHaveLength(6);
    await hidden(root);
  },
};

/** Estimate (CMP.13): same pad; the response is the child's number, the engine judges it. */
export const Estimate: Story = {
  args: { config: estimate },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(key(root, '1'));
    await userEvent.click(key(root, '4'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 14 });
  },
};

/** `disabled` (e.g. a demo is coming): no look by itself, no input, nothing traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await shownIs(root, 'false');
    await expect(key(root, '3')).toBeDisabled();
    await userEvent.keyboard('3');
    await expect(within(root).getByRole('button', { name: 'Look again' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), the SUB.03.t5 solution: Pip shows the frames, rings the 5 and the 2, flashes
 * once more, and types 7. Then "look again" is invited.
 */
export const DemoMode: Story = {
  args: { config: { ...fiveFrames, input: 'pad' }, disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'show' });
    await shownIs(root, 'true');
    await demoController.play({ op: 'circle-groups', args: { groups: [5, 2] } });
    const rings = [...root.querySelectorAll<HTMLElement>('.ni-flash__ring')];
    await expect(rings).toHaveLength(2);
    // The 5-ring is wider than the 2-ring.
    await expect(rings[0]?.getBoundingClientRect().width).toBeGreaterThan(
      rings[1]?.getBoundingClientRect().width ?? 0,
    );
    await demoController.play({ op: 'flash' });
    await shownIs(root, 'false');
    await demoController.play({ op: 'answer', args: { value: 7 } });
    await waitFor(() =>
      expect(within(root).getByRole('button', { name: 'Your answer: 7' })).toBeVisible(),
    );
    await expect(demoController.play({ op: 'tap' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'flash' });
    await waitFor(() => expect(root.querySelector('.ni-flash__again.ni-invite')).not.toBeNull());
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const fingersDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo: rings around each hand (SUB.05.t2 solution, circle-groups [5, 5]). */
export const DemoFingerRings: Story = {
  args: { config: fingers, disabled: true, demo: fingersDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fingersDemo.play({ op: 'circle-groups', args: { groups: [5, 5] } });
    await expect(root.querySelectorAll('.ni-flash__ring')).toHaveLength(2);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: flash, show and answer are instant state changes. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'show' });
    await shownIs(root, 'true');
    await reducedController.play({ op: 'flash' });
    await shownIs(root, 'false');
    await reducedController.play({ op: 'answer', args: { value: 4 } });
    await reducedController.play({ op: 'answer', args: { value: 5 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await waitFor(() =>
      expect(within(root).getByRole('button', { name: 'Your answer: 5' })).toBeVisible(),
    );
  },
};
