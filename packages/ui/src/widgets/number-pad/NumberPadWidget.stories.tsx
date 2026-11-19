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
 * `number-pad` (03 §5.5, 06 §4): a picture or an expression with blanks, and the 3 × 4 pad.
 * One blank answers `number`; several answer `numbers` in reading order.
 */

const addition: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'none' },
  expression: {
    tokens: [
      { t: 'num', v: 1 },
      { t: 'op', v: '+' },
      { t: 'num', v: 5 },
      { t: 'rel', v: '=' },
      { t: 'blank', id: 'x' },
    ],
  },
  blanks: [{ id: 'x', maxDigits: 2 }],
  unit: null,
};

const countPicture: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: {
    kind: 'objects',
    set: { count: 7, sprite: 'shell', layout: 'line', layoutSeed: 1509539769 },
  },
  blanks: [{ id: 'n', maxDigits: 2 }],
  unit: null,
};

const twoBlanks: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: {
    kind: 'number-line',
    min: 84,
    max: 89,
    ticksEvery: 1,
    labelsEvery: null,
    marks: [
      { at: 85, label: '85' },
      { at: 86, label: '?' },
      { at: 87, label: '?' },
      { at: 88, label: '88' },
    ],
  },
  expression: {
    tokens: [
      { t: 'num', v: 85 },
      { t: 'blank', id: 't1' },
      { t: 'blank', id: 't2' },
      { t: 'num', v: 88 },
    ],
  },
  blanks: [
    { id: 't1', maxDigits: 2 },
    { id: 't2', maxDigits: 2 },
  ],
  unit: null,
};

const decimal: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'none' },
  blanks: [{ id: 'len', maxDigits: 3, allowDecimal: true }],
  unit: 'cm',
};

const spokenOnly: ConfigFor<'number-pad'> = {
  format: 'number-pad',
  stimulus: { kind: 'none' },
  blanks: [{ id: 'n', maxDigits: 2 }],
  unit: null,
};

const meta = {
  title: 'Widgets/Number pad',
  args: {
    config: addition as WidgetConfig,
    tier: 'abstract',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-npw';
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;

/** Abstract: 1 + 5 = □. Tap 6, then check: one `number` response and a tap trace. */
export const Expression: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const check = canvas.getByRole('button', { name: 'Check' });
    // Never submits on partial input (06 §4): check stays off until the blank has a number.
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '6'));
    await expect(canvas.getByRole('button', { name: 'Your answer: 6' })).toBeVisible();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['tap:key-6']);
    // 06 §4 sizes: every key ≥ 64 px (G1+), ≥ 12 px apart.
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    await expect(keys).toHaveLength(11);
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);
  },
};

/** Pictorial, K mode: count the shells and type the number. Keys are K-sized (≥ 80 px) and speak. */
export const PictureCountK: Story = {
  globals: { ageMode: 'k' },
  args: { config: countPicture, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('img', { name: 'Look at the picture' })).toBeVisible();
    await expect(root.querySelectorAll('[data-sprite="shell"]')).toHaveLength(7);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'k');
    await expectTargetGaps(keys);
    await userEvent.click(key(root, '7'));
    // Tapping a number speaks its name (06 §5).
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 7 }]);
    // K: the check button is an icon with a spoken label.
    const check = within(root).getByRole('button', { name: 'Check' });
    await expectTargetSize(check, 'k');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
  },
};

/**
 * Two blanks (85, □, □, 88): typing fills the first blank, then moves to the next; tapping a
 * blank chooses it. Answers `numbers` in reading order.
 */
export const TwoBlanks: Story = {
  args: { config: twoBlanks, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(key(root, '8'));
    await userEvent.click(key(root, '6'));
    await expect(canvas.getByRole('button', { name: 'Box 1: 86' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Box 2:' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await userEvent.click(key(root, '8'));
    await userEvent.click(key(root, '8'));
    // Oops: go back to box 2 and fix it.
    await userEvent.click(key(root, 'back'));
    await userEvent.click(key(root, '7'));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [86, 87] });
    // Tap box 1 to make it the active blank again.
    await userEvent.click(canvas.getByRole('button', { name: 'Box 1: 86' }));
    await expect(canvas.getByRole('button', { name: 'Box 1: 86' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const trace = traceOf(args.onInteract);
    await expect(trace.at(-1)).toMatchObject({ t: 'tap', target: 'blank-t1' });
    await expectTraceOrdered(trace);
  },
};

/** Desktop keyboard (06 §1): digits, Backspace and Enter work without touching the pad. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Enter on an empty answer does nothing and must not start the debounce window: the real
    // answer right after it still goes through.
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('9');
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenLastCalledWith({ kind: 'number', value: 9 });
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    (args.onResponse as ReturnType<typeof fn>).mockClear();
    await userEvent.keyboard('{Backspace}');
    await new Promise((r) => setTimeout(r, 450));
    await userEvent.keyboard('1');
    await userEvent.keyboard('2');
    await userEvent.keyboard('{Backspace}');
    await userEvent.keyboard('7');
    await expect(within(root).getByRole('button', { name: 'Your answer: 17' })).toBeVisible();
    // A double Enter (or a held key) and Enter-then-Check inside 400 ms submit once (06 §4).
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 17 });
    // After the debounce window, Enter submits again.
    await new Promise((r) => setTimeout(r, 450));
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledTimes(2);
    // The pad keys are reachable by Tab and work with Enter/Space too.
    await userEvent.keyboard('{Backspace}{Backspace}');
    key(root, '4').focus();
    await userEvent.keyboard(' ');
    await waitFor(() =>
      expect(within(root).getByRole('button', { name: 'Your answer: 4' })).toBeVisible(),
    );
  },
};

/** A decimal key appears only when the blank allows it; units show beside the blank. */
export const DecimalWithUnit: Story = {
  args: { config: decimal, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(key(root, '.')).not.toBeNull();
    await userEvent.click(key(root, '2'));
    await userEvent.click(key(root, '.'));
    await userEvent.click(key(root, '5'));
    await expect(within(root).getByText('cm')).toBeVisible();
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 2.5 });
  },
};

/** The question is only heard (no picture): a big answer slot and the pad. No decimal key. */
export const SpokenOnly: Story = {
  args: { config: spokenOnly, tier: 'abstract' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(key(root, '.')).toBeNull();
    await expect(within(root).getByRole('button', { name: 'Your answer:' })).toBeVisible();
  },
};

/** `disabled`: no input at all (feedback showing, or the runner waiting). */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(key(root, '3')).toBeDisabled();
    await userEvent.keyboard('3');
    await expect(within(root).getByRole('button', { name: 'Your answer:' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3): Pip types the answer key by key, then invites the child's step. */
export const DemoMode: Story = {
  args: { config: twoBlanks, tier: 'pictorial', disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'type', args: { blank: 't1', value: 86 } });
    await expect(within(root).getByRole('button', { name: 'Box 1: 86' })).toBeVisible();
    await demoController.play({ op: 'highlight', args: { token: 't2' } });
    await demoController.play({ op: 'show-stimulus' });
    await expect(demoController.play({ op: 'flash' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'type', args: { blank: 't2', value: 87 } });
    await waitFor(() => expect(root.querySelector('.ni-npw__blank.ni-invite')).not.toBeNull());
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      root.querySelector('.ni-npw__blank.ni-invite') as HTMLElement,
      root,
    );
  },
};

/** Blank IDs are any string (the shared schema): these hold quotes and a backslash. */
const quotedBlanks: ConfigFor<'number-pad'> = {
  ...twoBlanks,
  expression: {
    tokens: [
      { t: 'num', v: 85 },
      { t: 'blank', id: 'b"1' },
      { t: 'blank', id: 'b"]\\2' },
      { t: 'num', v: 88 },
    ],
  },
  blanks: [
    { id: 'b"1', maxDigits: 2 },
    { id: 'b"]\\2', maxDigits: 2 },
  ],
};

const quotedController: WidgetDemo = createDemoController({ strict: true });

/**
 * A blank whose ID holds a quote (any string is a valid ID): inviting it rings that blank and Pip's
 * hand points at it; the widget stays mounted.
 */
export const DemoInviteQuotedId: Story = {
  args: { config: quotedBlanks, tier: 'pictorial', demo: quotedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    quotedController.invite({ op: 'type', args: { blank: 'b"]\\2', value: 87 } });
    await waitFor(() => expect(root.querySelector('.ni-npw__blank.ni-invite')).not.toBeNull());
    const invited = root.querySelector('.ni-npw__blank.ni-invite') as HTMLElement;
    await expect(invited.dataset.blank).toBe('b"]\\2');
    await expect(root.isConnected).toBe(true);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, invited, root);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: the generic `answer` op fills every blank at once. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: twoBlanks, tier: 'pictorial', disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'answer', args: { values: [86, 87] } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(within(root).getByRole('button', { name: 'Box 2: 87' })).toBeVisible();
    // `answer` replaces every entry, like the engine model: a shorter answer clears box 2.
    await reducedController.play({ op: 'answer', args: { value: 85 } });
    await expect(within(root).getByRole('button', { name: 'Box 1: 85' })).toBeVisible();
    await expect(within(root).getByRole('button', { name: 'Box 2:' })).toBeVisible();
  },
};
