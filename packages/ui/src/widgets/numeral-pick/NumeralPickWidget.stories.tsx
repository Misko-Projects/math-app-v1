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
 * `numeral-pick` (03 §5.5): a picture and 3–5 choices. Tapping a choice speaks it and picks it
 * (ink ring plus a check badge, never colour alone); "check" answers `{ kind: 'choice', id }`.
 */

const dice: ConfigFor<'numeral-pick'> = {
  format: 'numeral-pick',
  stimulus: {
    kind: 'objects',
    set: { count: 8, sprite: 'starfish', layout: 'dice', groups: [6, 2], layoutSeed: 1344480345 },
  },
  options: [
    { id: 'opt-8', label: '8' },
    { id: 'opt-9', label: '9' },
    { id: 'opt-7', label: '7' },
    { id: 'opt-18', label: '18' },
  ],
  layout: 'row',
};

const numberLine: ConfigFor<'numeral-pick'> = {
  format: 'numeral-pick',
  stimulus: {
    kind: 'number-line',
    min: 31,
    max: 36,
    ticksEvery: 1,
    labelsEvery: 1,
    marks: [{ at: 33, arrow: true }],
  },
  options: [
    { id: 'opt-35', label: '35' },
    { id: 'opt-34', label: '34' },
    { id: 'opt-33', label: '33' },
    { id: 'opt-44', label: '44' },
  ],
  layout: 'row',
};

const ordinal: ConfigFor<'numeral-pick'> = {
  format: 'numeral-pick',
  stimulus: {
    kind: 'objects',
    set: { count: 5, sprite: 'leaf', layout: 'line', groups: [3, 1, 1], layoutSeed: 1019223348 },
  },
  options: [
    { id: 'opt-5', label: 'fifth', speak: 'ord.5' },
    { id: 'opt-3', label: 'third', speak: 'ord.3' },
    { id: 'opt-4', label: 'fourth', speak: 'ord.4' },
  ],
  layout: 'row',
};

const pictures: ConfigFor<'numeral-pick'> = {
  format: 'numeral-pick',
  stimulus: { kind: 'expression', expr: { tokens: [{ t: 'num', v: 6 }] } },
  options: [
    { id: 'a', stimulus: { kind: 'ten-frame', frames: 1, filled: [6] } },
    { id: 'b', stimulus: { kind: 'dots', arrangement: 'dice', groups: [5] } },
    { id: 'c', stimulus: { kind: 'dots', arrangement: 'fingers', groups: [5, 2] } },
    { id: 'd', stimulus: { kind: 'ten-frame', frames: 1, filled: [8] } },
  ],
  layout: 'grid',
};

const heardOnly: ConfigFor<'numeral-pick'> = {
  format: 'numeral-pick',
  stimulus: { kind: 'none' },
  options: [
    { id: 'opt-18', label: '18' },
    { id: 'opt-19', label: '19' },
    { id: 'opt-17', label: '17' },
  ],
  layout: 'row',
};

const meta = {
  title: 'Widgets/Numeral pick',
  args: {
    config: dice as WidgetConfig,
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

const ROOT = '.ni-npick';

/** K mode, a dice picture: tap 7 (spoken), change to 8, check. Cards are K-sized and spaced. */
export const DiceK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const options = canvas.getAllByRole('button', { pressed: false });
    await expect(options).toHaveLength(4);
    for (const o of options) await expectTargetSize(o, 'k');
    await expectTargetGaps(options);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '7' }));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 7 }]);
    await userEvent.click(canvas.getByRole('button', { name: '8' }));
    await expect(canvas.getByRole('button', { name: '8' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: '7' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'opt-8' });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['tap:opt-7', 'tap:opt-8']);
    await expectTraceOrdered(trace);
  },
};

/** A number line with an arrow: which number is it? (G1+). */
export const NumberLine: Story = {
  args: { config: numberLine },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    for (const o of canvas.getAllByRole('button', { pressed: false })) {
      await expectTargetSize(o, 'g1-up');
    }
    await userEvent.click(canvas.getByRole('button', { name: '33' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'opt-33' });
  },
};

/** Word choices speak their own narration key (`speak`), e.g. ordinals. */
export const OrdinalWords: Story = {
  parameters: { ui: { audio: spyAudio() } },
  args: { config: ordinal },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(canvas.getByRole('button', { name: 'fourth' }));
    await expect(audio.say).toHaveBeenCalledWith('ord.4', undefined);
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'opt-4' });
  },
};

/** Picture choices in a grid: which picture shows 6? */
export const PictureChoices: Story = {
  args: { config: pictures },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await userEvent.click(canvas.getByRole('button', { name: 'Pick 1' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'a' });
    await expectTargetGaps(canvas.getAllByRole('button', { name: /^Pick/ }));
  },
};

/** Keyboard (06 §7): Tab to a choice, Space picks it, Tab to check, Enter answers. */
export const Keyboard: Story = {
  args: { config: heardOnly, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    canvas.getByRole('button', { name: '18' }).focus();
    await userEvent.tab();
    await userEvent.keyboard(' ');
    await expect(canvas.getByRole('button', { name: '19' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.tab();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Check' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'opt-19' });
  },
};

/** `disabled`: choices and check are off. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('button', { name: '8' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3): Pip highlights, then taps the answer; the child's step is invited. */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight', args: { id: 'opt-8' } });
    await demoController.play({ op: 'tap', args: { id: 'opt-8' } });
    await expect(within(root).getByRole('button', { name: '8' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(demoController.play({ op: 'drag' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'tap', args: { id: 'opt-9' } });
    await waitFor(() => expect(root.querySelector('.ni-pick.ni-invite')).not.toBeNull());
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: the `answer` op picks instantly. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'answer', args: { id: 'opt-7' } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(within(root).getByRole('button', { name: '7' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
