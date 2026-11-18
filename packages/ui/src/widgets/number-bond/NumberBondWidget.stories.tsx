import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
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
 * `number-bond` (03 §5.5): pictorial (a bond with blanks, filled from the numeral tray or the pad)
 * and concrete (counters split across the bond). Missing-part and missing-whole answer `number`;
 * split and new-way answer `{ parts }`. Responses come from the engine model.
 */

type Config = ConfigFor<'number-bond'>;

/** CPS.01.t4: 5 is 4 and what? */
const missing5: Config = {
  format: 'number-bond',
  whole: 5,
  parts: [4, null],
  mode: 'missing-part',
  counters: false,
  nonZero: false,
};

/** CPS.03.t3: 10 is 6 and what? */
const missing10: Config = { ...missing5, whole: 10, parts: [6, null] };

/** Split 7 into two parts. */
const split7: Config = {
  format: 'number-bond',
  whole: 7,
  parts: [null, null],
  mode: 'split',
  counters: false,
  nonZero: true,
};

/** CPS.06: a new way to make 7 (two found already). */
const newWay7: Config = {
  ...split7,
  mode: 'new-way',
  found: [
    [3, 4],
    [1, 6],
  ],
};

/** SUB.06.t1 (concrete): 3 and 1, how many in all? */
const wholeFromParts: Config = {
  format: 'number-bond',
  whole: null,
  parts: [3, 1],
  mode: 'missing-whole',
  counters: true,
  nonZero: true,
};

/** Concrete split of 6 with counters. */
const splitCounters6: Config = {
  format: 'number-bond',
  whole: 6,
  parts: [null, null],
  mode: 'split',
  counters: true,
  nonZero: false,
};

/** A teen whole: 14 is 9 and what? (the pad answers above 10) */
const teen: Config = { ...missing5, whole: 14, parts: [9, null] };

const meta = {
  title: 'Widgets/Number bond',
  args: {
    config: missing5 as WidgetConfig,
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

const ROOT = '.ni-bondw';
const counter = (root: HTMLElement, id: number) =>
  root.querySelector(`[data-counter="${id}"]`) as HTMLElement;
const poolPad = (root: HTMLElement, slot: string) =>
  root.querySelector(`[data-pool="${slot}"] .ni-bondw__pad`) as HTMLElement;
const inPool = (root: HTMLElement, slot: string) =>
  root.querySelectorAll(`[data-pool="${slot}"] .ni-bondw__counter`).length;

/**
 * Pictorial missing part (CPS.01.t4): the tray offers 0–5. Tapping the given 4 speaks it; picking
 * 1 fills the blank; check answers `{ kind: 'number', value: 1 }`.
 */
export const MissingPart: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(canvas.getByRole('group', { name: 'Look at the picture' })).toBeVisible();
    await expect(root.querySelectorAll('.ni-pick')).toHaveLength(6);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Part 1: 4' }));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 4 }]);
    await userEvent.click(canvas.getByRole('button', { name: '1' }));
    await expect(canvas.getByRole('button', { name: 'Part 2: 1' })).toBeVisible();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 1 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['tap:part-0', 'tap:opt-1']);
  },
};

/** K mode (CPS.03.t3): circles and numeral cards are ≥ 80 px and ≥ 12 px apart. */
export const MissingPartK: Story = {
  globals: { ageMode: 'k' },
  args: { config: missing10 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
    await expect(cards).toHaveLength(11);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    const circles = [...root.querySelectorAll<HTMLElement>('.ni-bondw__circle')];
    for (const c of circles) await expectTargetSize(c, 'k');
    await expectTargetGaps(circles);
    await userEvent.click(within(root).getByRole('button', { name: '4' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 4 });
  },
};

/**
 * Split (pictorial): two blanks. Picking fills the active blank and moves on to the next; tapping
 * a blank makes it active again. Answers `{ parts }`.
 */
export const Split: Story = {
  args: { config: split7 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(canvas.getByRole('button', { name: 'Part 1:' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await userEvent.click(canvas.getByRole('button', { name: '2' }));
    await expect(canvas.getByRole('button', { name: 'Part 2:' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await userEvent.click(canvas.getByRole('button', { name: '5' }));
    // Change part 1: tap it, pick again.
    await userEvent.click(canvas.getByRole('button', { name: 'Part 1: 2' }));
    await userEvent.click(canvas.getByRole('button', { name: '3' }));
    await expect(canvas.getByRole('button', { name: 'Part 1: 3' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Part 2: 5' }));
    await userEvent.click(canvas.getByRole('button', { name: '4' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { parts: [3, 4] } });
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** new-way: the ways already found are shown as small bonds beside the one to fill. */
export const NewWay: Story = {
  args: { config: newWay7 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const found = within(root).getByRole('region', { name: 'What you did' });
    await expect(within(found).getAllByRole('img')).toHaveLength(2);
    await userEvent.click(within(root).getByRole('button', { name: '2' }));
    await userEvent.click(within(root).getByRole('button', { name: '5' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { parts: [2, 5] } });
  },
};

/**
 * Concrete missing whole (SUB.06.t1), K mode: the counters start in the parts. Drag them up into
 * the whole (mouse, touch, tap-to-place); tap one there to send it home. Then pick 4.
 */
export const WholeFromPartsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: wholeFromParts, tier: 'concrete' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(inPool(root, 'part-0')).toBe(3);
    await expect(inPool(root, 'part-1')).toBe(1);
    const counters = [...root.querySelectorAll<HTMLElement>('.ni-bondw__counter')];
    for (const c of counters) await expectTargetSize(c, 'k');
    await expectTargetGaps(counters);

    await pointerDrag(counter(root, 0), center(poolPad(root, 'whole')), 'mouse');
    await waitFor(() => expect(inPool(root, 'whole')).toBe(1));
    await pointerDrag(counter(root, 3), center(poolPad(root, 'whole')), 'touch');
    await waitFor(() => expect(inPool(root, 'whole')).toBe(2));
    await userEvent.click(counter(root, 1));
    await userEvent.click(poolPad(root, 'whole'));
    await waitFor(() => expect(inPool(root, 'whole')).toBe(3));
    // Tap a moved counter: it goes back to its part.
    await userEvent.click(within(root).getByRole('button', { name: 'Counter 4' }));
    await waitFor(() => expect(inPool(root, 'part-1')).toBe(1));

    await userEvent.click(within(root).getByRole('button', { name: '4' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 4 });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:counter-0',
      'drop:whole',
      'drag:counter-3',
      'drop:whole',
      'tap:counter-1',
      'tap:whole',
      'undo:counter-3',
      'tap:opt-4',
    ]);
  },
};

/** Concrete split with the keyboard and a drag: the parts' badges show their live counts. */
export const SplitCounters: Story = {
  args: { config: splitCounters6, tier: 'concrete' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    counter(root, 0).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(poolPad(root, 'part-0')));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(inPool(root, 'part-0')).toBe(1));
    counter(root, 1).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(inPool(root, 'part-1')).toBe(1));
    await pointerDrag(counter(root, 2), center(poolPad(root, 'part-1')), 'touch');
    await waitFor(() => expect(inPool(root, 'part-1')).toBe(2));
    await expect(root.querySelector('[data-pool="part-1"] .ni-bondw__badge')?.textContent).toBe(
      '2',
    );
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { parts: [1, 2] } });
  },
};

/**
 * A teen whole: the pad answers. Enter on an empty answer does nothing; a double Enter and
 * Enter-then-Check inside 400 ms submit once (06 §4).
 */
export const TeenPad: Story = {
  args: { config: teen },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('5');
    await expect(within(root).getByRole('button', { name: 'Part 2: 5' })).toBeVisible();
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 5 });
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { config: splitCounters6, tier: 'concrete', disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(counter(root, 0));
    await userEvent.click(poolPad(root, 'part-0'));
    await expect(inPool(root, 'part-0')).toBe(0);
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (pictorial): Pip highlights the blank and fills it, then invites the child. */
export const DemoMode: Story = {
  args: { config: split7, disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight', args: { slot: 'whole' } });
    await demoController.play({ op: 'split-counters', args: { left: 3, right: 4 } });
    await waitFor(() =>
      expect(within(root).getByRole('button', { name: 'Part 2: 4' })).toBeVisible(),
    );
    await demoController.play({ op: 'fill', args: { slot: 'part-0', value: 2 } });
    await waitFor(() =>
      expect(within(root).getByRole('button', { name: 'Part 1: 2' })).toBeVisible(),
    );
    await expect(demoController.play({ op: 'slide' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'fill', args: { slot: 'part-1', value: 5 } });
    await waitFor(() => expect(root.querySelector('.ni-bondw__circle.ni-invite')).not.toBeNull());
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const concreteController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (concrete): `split-counters` slides counters out of the whole into the parts. */
export const DemoConcrete: Story = {
  args: { config: splitCounters6, tier: 'concrete', disabled: true, demo: concreteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await concreteController.play({ op: 'split-counters', args: { left: 2, right: 1 } });
    await waitFor(() => expect(inPool(root, 'part-0')).toBe(2));
    await expect(inPool(root, 'part-1')).toBe(1);
    concreteController.invite({ op: 'split-counters', args: { left: 2, right: 4 } });
    await waitFor(() =>
      expect(root.querySelector('.ni-bondw__pool[data-pool="whole"].ni-invite')).not.toBeNull(),
    );
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: split and answer are instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: wholeFromParts, tier: 'concrete', disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'highlight', args: { slot: 'whole' } });
    await reducedController.play({ op: 'answer', args: { value: 4 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await waitFor(() =>
      expect(root.querySelector('[data-pool="whole"] .ni-bondw__badge')?.textContent).toBe('4'),
    );
  },
};
