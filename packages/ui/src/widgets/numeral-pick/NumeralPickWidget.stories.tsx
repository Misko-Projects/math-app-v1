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

// As count.sequence emits it (CNT.09.t3, "what comes after 33?", #75): ticks every 1, only the
// marked start labelled, and the asked term shown as "?" (never its numeral).
const numberLine: ConfigFor<'numeral-pick'> = {
  format: 'numeral-pick',
  stimulus: {
    kind: 'number-line',
    min: 31,
    max: 36,
    ticksEvery: 1,
    labelsEvery: null,
    marks: [
      { at: 33, label: '33', arrow: true },
      { at: 34, label: '?' },
    ],
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

/**
 * CNT.09.t3 (count.sequence): the arrow marks where counting starts (33); "what number comes
 * next?" The line shows exactly the numerals the generator asks for (G1+).
 */
export const NumberLine: Story = {
  args: { config: numberLine },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    // The renderer draws exactly the stimulus: the marked start keeps its numeral (the child reads
    // it to count on) and the asked term is "?"; the answer 34 is never printed on the line.
    const picture = root.querySelector('.ni-stimulus') as HTMLElement;
    const numerals = [...picture.querySelectorAll('text')].map((t) => t.textContent);
    await expect(numerals).toEqual(expect.arrayContaining(['33', '?']));
    await expect(numerals).not.toContain('34');

    for (const t of picture.querySelectorAll('text')) {
      await expect(Number.parseFloat(getComputedStyle(t).fontSize)).toBeGreaterThanOrEqual(32);
    }
    for (const o of canvas.getAllByRole('button', { pressed: false })) {
      await expectTargetSize(o, 'g1-up');
    }
    // Choice cards share one width, whatever their digits.
    const widths = canvas
      .getAllByRole('button', { pressed: false })
      .map((b) => Math.round(b.getBoundingClientRect().width));
    await expect(new Set(widths).size).toBe(1);
    await userEvent.click(canvas.getByRole('button', { name: '34' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'opt-34' });
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
    // The whole widget fits a 1280 × 800 tablet with no vertical scroll: the stage stays within
    // 800 px minus the 2 × 40 px story padding.
    const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
    await expect(stage.getBoundingClientRect().height).toBeLessThanOrEqual(720);
  },
};

/**
 * Stress: the most choices a numeral-pick shows (5, 03 §5.5), with 3-digit near misses
 * (±1, ±10, digit reversal). Cards stay equal-width, K-sized and spaced.
 */
export const FiveChoicesK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      format: 'numeral-pick',
      stimulus: {
        kind: 'base-ten',
        hundreds: 1,
        tens: 2,
        ones: 8,
      },
      options: [
        { id: 'opt-128', label: '128' },
        { id: 'opt-118', label: '118' },
        { id: 'opt-821', label: '821' },
        { id: 'opt-138', label: '138' },
        { id: 'opt-127', label: '127' },
      ],
      layout: 'row',
    } satisfies ConfigFor<'numeral-pick'>,
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const options = canvas.getAllByRole('button', { pressed: false });
    await expect(options).toHaveLength(5);
    for (const o of options) await expectTargetSize(o, 'k');
    await expectTargetGaps(options);
    await expect(
      new Set(options.map((o) => Math.round(o.getBoundingClientRect().width))).size,
    ).toBe(1);
    await userEvent.click(canvas.getByRole('button', { name: '128' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'opt-128' });
  },
};

/**
 * Portrait (800 px wide, 06 §1): five picture choices in a grid, one a ten-object line. Every
 * picture stays inside its own card and nothing overflows sideways.
 */
export const PortraitPictureGridK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      format: 'numeral-pick',
      stimulus: { kind: 'expression', expr: { tokens: [{ t: 'num', v: 10 }] } },
      options: [
        { id: 'a', stimulus: { kind: 'dots', arrangement: 'dice', groups: [1] } },
        { id: 'b', stimulus: { kind: 'dots', arrangement: 'dice', groups: [2] } },
        { id: 'c', stimulus: { kind: 'dots', arrangement: 'dice', groups: [3] } },
        { id: 'd', stimulus: { kind: 'dots', arrangement: 'dice', groups: [4] } },
        // The odd last card holds the widest picture: it must still contain it.
        {
          id: 'e',
          stimulus: {
            kind: 'objects',
            set: { count: 10, sprite: 'shell', layout: 'line', layoutSeed: 3 },
          },
        },
      ],
      layout: 'grid',
    } satisfies ConfigFor<'numeral-pick'>,
  },
  render: (args) => <div style={{ width: 800, maxWidth: '100%' }}>{renderWidget(args)}</div>,
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPicturesInsideCards(root, 5);
    await expectTargetGaps([...root.querySelectorAll<HTMLElement>('.ni-pick')]);
    await expectNoSideOverflow(canvasElement);
  },
};

/** Portrait, row layout: five wide pictures wrap onto new lines instead of running off-screen. */
export const PortraitPictureRowK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      format: 'numeral-pick',
      stimulus: { kind: 'none' },
      options: (['shell', 'fish', 'leaf', 'crab', 'starfish'] as const).map((sprite, i) => ({
        id: `o${i}`,
        stimulus: {
          kind: 'objects' as const,
          set: { count: 10, sprite, layout: 'line' as const, layoutSeed: i },
        },
      })),
      layout: 'row',
    } satisfies ConfigFor<'numeral-pick'>,
  },
  render: (args) => <div style={{ width: 800, maxWidth: '100%' }}>{renderWidget(args)}</div>,
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPicturesInsideCards(root, 5);
    await expectNoSideOverflow(canvasElement);
    const stage = (
      canvasElement.querySelector('.story-widget-stage') as HTMLElement
    ).getBoundingClientRect();
    for (const card of root.querySelectorAll<HTMLElement>('.ni-pick')) {
      const box = card.getBoundingClientRect();
      await expect(box.left).toBeGreaterThanOrEqual(stage.left);
      await expect(box.right).toBeLessThanOrEqual(stage.right);
    }
    await userEvent.click(within(root).getByRole('button', { name: 'Pick 5' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'o4' });
  },
};

/** Every picture (its drawn objects, not only the wrapper) lies inside its own card. */
async function expectPicturesInsideCards(root: HTMLElement, count: number) {
  const cards = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
  await expect(cards).toHaveLength(count);
  for (const card of cards) {
    const box = card.getBoundingClientRect();
    for (const part of card.querySelectorAll<HTMLElement>('.ni-stimulus, .ni-objects')) {
      const r = part.getBoundingClientRect();
      await expect(r.left).toBeGreaterThanOrEqual(box.left - 0.5);
      await expect(r.right).toBeLessThanOrEqual(box.right + 0.5);
      await expect(r.top).toBeGreaterThanOrEqual(box.top - 0.5);
      await expect(r.bottom).toBeLessThanOrEqual(box.bottom + 0.5);
    }
  }
}

async function expectNoSideOverflow(canvasElement: HTMLElement) {
  const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
  await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth + 1);
}

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

/** Demo mode (03 §6.3): Pip shows the answer, then taps it (input stays off while Pip plays). */
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
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn in a faded example (03 §6.3): nothing is picked yet, input is on, and Pip's
 * hand points at the choice to tap.
 */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'tap', args: { id: 'opt-8' } });
    await waitFor(() => expect(root.querySelector('.ni-pick.ni-invite')).not.toBeNull());
    const invited = root.querySelector('.ni-pick.ni-invite') as HTMLElement;
    await expect(invited).toHaveAttribute('data-id', 'opt-8');
    await expect(invited).toHaveAttribute('aria-pressed', 'false');
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, invited, root);
    // K: Check is an icon with a spoken label, no text.
    await expect(within(root).getByRole('button', { name: 'Check' })).not.toHaveTextContent(
      'Check',
    );
  },
};

/** Option IDs are any string (the shared schema): one is empty, two hold quotes and a bracket. */
const quotedOptions: ConfigFor<'numeral-pick'> = {
  ...heardOnly,
  options: [
    { id: '', label: '18' },
    { id: 'o"]19', label: '19' },
    { id: "o'17", label: '17' },
  ],
};

const quotedController: WidgetDemo = createDemoController({ strict: true });

/**
 * Options whose IDs hold a quote or are empty (any string is a valid ID): inviting each rings that
 * card and Pip's hand points at it; the widget stays mounted.
 */
export const DemoInviteQuotedId: Story = {
  globals: { ageMode: 'k' },
  args: { config: quotedOptions as WidgetConfig, demo: quotedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    quotedController.invite({ op: 'tap', args: { id: 'o"]19' } });
    await waitFor(() => expect(root.querySelector('.ni-pick.ni-invite')).not.toBeNull());
    const invited = root.querySelector('.ni-pick.ni-invite') as HTMLElement;
    await expect(invited.dataset.id).toBe('o"]19');
    await expect(root.isConnected).toBe(true);
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, invited, root);
    // The empty ID: ring and hand on the 18 card.
    quotedController.invite({ op: 'tap', args: { id: '' } });
    await waitFor(() =>
      expect(root.querySelector('.ni-pick.ni-invite')).toHaveAttribute('data-id', ''),
    );
    const empty = root.querySelector('.ni-pick.ni-invite') as HTMLElement;
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await waitFor(() => expect(root.querySelector('.ni-hand')).not.toBeNull());
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, empty, root);
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
