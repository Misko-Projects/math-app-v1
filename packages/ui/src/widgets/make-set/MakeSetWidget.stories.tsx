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
 * `make-set` (03 §5.5): put exactly `target` objects in a container (concrete). Drag, tap-to-place
 * and keyboard all move objects between the heap and the container's ten-frame slots; `hands`
 * raises fingers. Configs are real generated items (CNT.02, CNT.04, CNT.06, ADD.01, CPS.01, SUB.05)
 * plus a CNT.19-style bundling item.
 */

/** CNT.02.t2 seed 1: put 9 fish on the raft (no running count). */
const raft: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 9,
  mode: 'make',
  source: { sprite: 'fish', supply: 12 },
  container: 'raft',
  capacity: 10,
  showRunningCount: false,
};

/** ADD.01.t1 seed 1: you have 1, add more to make 4 (boat), with the running count shown. */
const addMore: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 4,
  mode: 'add-more',
  start: 1,
  source: { sprite: 'crab', supply: 6 },
  container: 'boat',
  capacity: 10,
  showRunningCount: true,
};

/** CPS.01.t1 seed 1: split 5 shells into two parts (take some out of the boat). */
const takeAway: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 5,
  mode: 'take-away',
  start: 5,
  source: { sprite: 'shell', supply: 0 },
  container: 'boat',
  capacity: 10,
  showRunningCount: false,
};

/** SUB.05.t1 seed 1: show me 7 fingers. */
const hands: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 7,
  mode: 'make',
  source: { sprite: 'finger', supply: 10 },
  container: 'hands',
  capacity: 10,
  showRunningCount: false,
};

/** CNT.06.t1 seed 1: put 16 crabs in the boat (capacity 20: two ten-frames). */
const twenty: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 16,
  mode: 'make',
  source: { sprite: 'crab', supply: 19 },
  container: 'boat',
  capacity: 20,
  showRunningCount: false,
};

/** CNT.19-style: make 13 sticks and tie the full ten (groupsOf 10), in a basket. */
const bundleTen: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 13,
  mode: 'make',
  source: { sprite: 'stick', supply: 16 },
  container: 'basket',
  capacity: 20,
  showRunningCount: true,
  groupsOf: 10,
};

/** Lantern Grove: gather 6 fireflies into a jar. */
const jar: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 6,
  mode: 'make',
  source: { sprite: 'firefly', supply: 9 },
  container: 'jar',
  capacity: 10,
  showRunningCount: true,
};

/** CNT.04.t1-style, in the open shell. */
const shell: ConfigFor<'make-set'> = {
  format: 'make-set',
  target: 2,
  mode: 'make',
  source: { sprite: 'pebble', supply: 5 },
  container: 'shell',
  capacity: 10,
  showRunningCount: false,
};

const meta = {
  title: 'Widgets/Make a set',
  args: {
    config: raft as WidgetConfig,
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

const ROOT = '.ni-mset';
const heap = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[data-area="pile"] .ni-mset__item'),
];
const supplyItems = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[data-area="supply"] .ni-mset__item'),
];
const inside = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-mset__slot .ni-mset__item'),
];
const containerPad = (root: HTMLElement) =>
  root.querySelector('.ni-mset__container > .ni-mset__pad') as HTMLElement;
const pilePad = (root: HTMLElement) =>
  root.querySelector('[data-area="pile"] > .ni-mset__pad') as HTMLElement;
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });

/**
 * K (CNT.02.t2): one fish by mouse drag, one by touch drag, one by tap-to-place, one by keyboard;
 * take one back out (tap it, tap the heap); check. No running count: placing only clicks.
 */
export const MakeK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(heap(root)).toHaveLength(12);
    for (const el of heap(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(heap(root));
    await expect(check(root)).toBeDisabled();

    await pointerDrag(heap(root)[0] as HTMLElement, center(containerPad(root)), 'mouse');
    await waitFor(() => expect(inside(root)).toHaveLength(1));
    await pointerDrag(heap(root)[0] as HTMLElement, center(containerPad(root)), 'touch');
    await waitFor(() => expect(inside(root)).toHaveLength(2));
    await userEvent.click(heap(root)[0] as HTMLElement);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.sprite.fish', undefined);
    await userEvent.click(containerPad(root));
    await waitFor(() => expect(inside(root)).toHaveLength(3));
    (heap(root)[0] as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    await expect(audio.sfx).toHaveBeenCalledWith('build-tap');
    await expect(audio.sayPhrases).not.toHaveBeenCalled();
    for (const el of inside(root)) await expectTargetSize(el, 'k');
    await expectTargetGaps(inside(root));

    // Take one back out: tap it, then tap the heap.
    await userEvent.click(inside(root)[3] as HTMLElement);
    await userEvent.click(pilePad(root));
    await waitFor(() => expect(inside(root)).toHaveLength(3));
    await expect(heap(root)).toHaveLength(9);

    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 3, removed: 1 },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => e.t)).toEqual([
      'drag',
      'drop',
      'drag',
      'drop',
      'tap',
      'tap',
      'tap',
      'tap',
      'tap',
      'tap',
      'undo',
    ]);
    // Make-set traces never use counting ids (obj-<i> belongs to tap-count, MC rules read it).
    await expect(trace.some((e) => /^obj-/.test(e.target))).toBe(false);
    await expectTraceOrdered(trace);
  },
};

/** G1 (ADD.01.t1): one crab is already aboard; add three. The running count shows and speaks. */
export const AddMoreG1: Story = {
  args: { config: addMore },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(inside(root)).toHaveLength(1);
    await expect(within(root).getByRole('button', { name: 'Your answer: 1' })).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await pointerDrag(heap(root)[0] as HTMLElement, center(containerPad(root)), 'touch');
      await waitFor(() => expect(inside(root)).toHaveLength(2 + i));
    }
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 4 }]);
    await expect(within(root).getByRole('button', { name: 'Your answer: 4' })).toBeVisible();
    for (const el of heap(root)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(heap(root));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 4, removed: 0 },
    });
  },
};

/**
 * Take away (CPS.01.t1): drag two shells out of the boat onto the "take away" pile; both parts
 * stay visible. Put one back by keyboard. The response carries the parts.
 */
export const TakeAwaySplit: Story = {
  args: { config: takeAway },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(inside(root)).toHaveLength(5);
    await expect(supplyItems(root)).toHaveLength(0);
    await pointerDrag(inside(root)[4] as HTMLElement, center(pilePad(root)), 'mouse');
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    await pointerDrag(inside(root)[3] as HTMLElement, center(pilePad(root)), 'touch');
    await waitFor(() => expect(heap(root)).toHaveLength(2));
    // One back, by keyboard: Enter picks it up and moves focus to the boat; Enter puts it in.
    (heap(root)[0] as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(inside(root)).toHaveLength(4));
    await userEvent.click(inside(root)[3] as HTMLElement);
    await userEvent.click(pilePad(root));
    await waitFor(() => expect(inside(root)).toHaveLength(3));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 3, removed: 2, parts: [3, 2] },
    });
    // Taking away is the task here, not an undo.
    await expect(traceOf(args.onInteract).some((e) => e.t === 'undo')).toBe(false);
  },
};

/**
 * Hands, K (SUB.05.t1): tap the left hand five times, raise two on the right with "finger up",
 * fold one, raise it again with ArrowUp. Answers `parts: [left, right]`.
 */
export const HandsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: hands },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const left = canvas.getByRole('button', { name: 'Left hand: 0' });
    for (let i = 0; i < 6; i++) await userEvent.click(left);
    await expect(canvas.getByRole('button', { name: 'Left hand: 5' })).toBeVisible();
    const ups = canvas.getAllByRole('button', { name: 'Finger up' });
    const downs = canvas.getAllByRole('button', { name: 'Finger down' });
    await expect(ups[0]).toBeDisabled();
    await userEvent.click(ups[1] as HTMLElement);
    await userEvent.click(ups[1] as HTMLElement);
    await userEvent.click(downs[1] as HTMLElement);
    const right = canvas.getByRole('button', { name: 'Right hand: 1' });
    right.focus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(canvas.getByRole('button', { name: 'Right hand: 2' })).toBeVisible();
    await expect(root.querySelectorAll('[data-raised="true"]')).toHaveLength(7);
    for (const b of [left, right, ...ups, ...downs]) await expectTargetSize(b, 'k');
    await expectTargetGaps([...ups, ...downs]);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 7, removed: 0, parts: [5, 2] },
    });
    await expect(traceOf(args.onInteract).filter((e) => e.t === 'undo')).toHaveLength(1);
  },
};

/** K, capacity 20 (CNT.06.t1): two ten-frames in the boat; everything fits the widget area. */
export const TwentyK: Story = {
  globals: { ageMode: 'k' },
  args: { config: twenty },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-mset__frame')).toHaveLength(2);
    await expect(root.querySelectorAll('.ni-mset__slot')).toHaveLength(20);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    for (let i = 0; i < 12; i++) {
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(inside(root)).toHaveLength(12));
  },
};

/**
 * Bundling (CNT.19, groupsOf 10): fill a ten, tie it with "make a ten", add three more. The
 * response carries `bundles`.
 */
export const BundleTen: Story = {
  args: { config: bundleTen },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const tie = within(root).getByRole('button', { name: 'Make a ten' });
    for (let i = 0; i < 10; i++) {
      if (i === 9) await expect(tie).toBeDisabled();
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(tie).toBeEnabled());
    await userEvent.click(tie);
    await expect(root.querySelector('.ni-mset__frame[data-bundled="true"]')).not.toBeNull();
    await expect(tie).toBeDisabled();
    for (let i = 0; i < 3; i++) {
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(inside(root)).toHaveLength(13));
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { count: 13, removed: 0, bundles: 1 },
    });
  },
};

/** The jar (Lantern Grove fireflies) with a running count. */
export const Jar: Story = {
  args: { config: jar },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 4; i++) {
      await userEvent.click(heap(root)[0] as HTMLElement);
      await userEvent.click(containerPad(root));
    }
    await waitFor(() => expect(inside(root)).toHaveLength(4));
  },
};

/** The open shell, K. */
export const ShellK: Story = {
  globals: { ageMode: 'k' },
  args: { config: shell },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('button', { name: 'Shell' })).toBeVisible();
  },
};

/** `disabled`: nothing moves and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(heap(root)[0] as HTMLElement);
    await userEvent.click(containerPad(root));
    await expect(inside(root)).toHaveLength(0);
    await expect(check(root)).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3), the CNT.02.t2 solution: Pip drags fish onto the raft, counts them aloud,
 * takes one off, and closes (a sail goes up). Then the check button is invited.
 */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'drag', args: { count: 3 } });
    await expect(inside(root)).toHaveLength(3);
    await demoController.play({ op: 'count-aloud' });
    await demoController.play({ op: 'remove', args: { count: 1 } });
    await expect(inside(root)).toHaveLength(2);
    await demoController.play({ op: 'bundle' });
    await demoController.play({ op: 'close-container' });
    await expect(root.querySelector('.ni-mset__art[data-closed="true"]')).not.toBeNull();
    await expect(demoController.play({ op: 'flash' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'drag', args: { count: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-mset__container.ni-invite')).not.toBeNull());
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const handsDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo, hands (CPS.01.t2 solution): one finger on each hand. */
export const DemoHands: Story = {
  args: { config: { ...hands, target: 2 }, disabled: true, demo: handsDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await handsDemo.play({ op: 'drag', args: { count: 1, hand: 0 } });
    await handsDemo.play({ op: 'drag', args: { count: 1, hand: 1 } });
    await expect(within(root).getByRole('button', { name: 'Right hand: 1' })).toBeVisible();
    await handsDemo.play({ op: 'count-aloud' });
    handsDemo.invite({ op: 'drag', args: { count: 1, hand: 1 } });
    await waitFor(() =>
      expect(root.querySelector('.ni-mset__hand-btn[data-hand="1"].ni-invite')).not.toBeNull(),
    );
    // The fingers Pip raised stay raised.
    await new Promise((r) => setTimeout(r, 300));
    await expect(root.querySelectorAll('[data-raised="true"]')).toHaveLength(2);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: drags are instant (no flight), and the generic `answer` op sets the count. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'drag', args: { count: 9 } });
    await expect(inside(root)).toHaveLength(9);
    await reducedController.play({ op: 'answer', args: { value: 5 } });
    await expect(inside(root)).toHaveLength(5);
    await expect(performance.now() - started).toBeLessThan(1500);
    await expect(root.querySelector('.ni-mset__flight')).toBeNull();
  },
};
