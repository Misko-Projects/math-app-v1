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
 * `order` (03 §5.5): put the cards in order, left to right. Growing pebbles above the slots say
 * "small to big" without words (shrinking for big to small). Drag, tap-to-place or keyboard; tap a
 * placed card to send it back. Pinned cards (`fixed`) cannot move. "Check" answers the values in
 * slot order. Fixtures are what `count.sequence` builds for CNT.01.t3 and CNT.09.t4.
 */

type Config = ConfigFor<'order'>;

const cards = (values: number[]): Config['items'] =>
  values.map((v, i) => ({ id: `item-${i}`, value: v, label: String(v) }));

/** CNT.01.t3: order 4 numbers, small to big (shuffled by the item RNG). */
const fourUp: Config = { format: 'order', items: cards([8, 6, 9, 7]), direction: 'asc' };

/** CNT.09.t4-style across a decade, with one pinned card. */
const decade: Config = {
  format: 'order',
  items: cards([31, 29, 30, 28]),
  direction: 'asc',
  fixed: { 2: 'item-2' },
};

/** Big to small. */
const down: Config = { format: 'order', items: cards([12, 15, 13, 14, 11]), direction: 'desc' };

/** Picture cards (pictorial): order the dice by how many dots. */
const pictures: Config = {
  format: 'order',
  items: [
    { id: 'a', value: 5, stimulus: { kind: 'dots', arrangement: 'dice', groups: [5] } },
    { id: 'b', value: 2, stimulus: { kind: 'dots', arrangement: 'dice', groups: [2] } },
    { id: 'c', value: 4, stimulus: { kind: 'dots', arrangement: 'dice', groups: [4] } },
  ],
  direction: 'asc',
};

const meta = {
  title: 'Widgets/Order',
  args: {
    config: fourUp as WidgetConfig,
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

const ROOT = '.ni-ord';
const card = (root: HTMLElement, name: string) =>
  within(root.querySelector('.ni-ord__tray') as HTMLElement).getByRole('button', { name });
const slot = (root: HTMLElement, n: number) =>
  within(root).getByRole('button', { name: `Box ${n}` });
const placed = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.ni-ord__slot')].map(
    (s) => s.querySelector('.ni-ord__card')?.textContent ?? '',
  );

/** K: tap a card (it speaks its number), tap a box; fill the row and check. K-sized and spaced. */
export const TapToPlaceK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const trayCards = [...root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')];
    await expect(trayCards).toHaveLength(4);
    for (const c of trayCards) await expectTargetSize(c, 'k');
    await expectTargetGaps(trayCards);
    const slots = [1, 2, 3, 4].map((n) => slot(root, n));
    for (const s of slots) await expectTargetSize(s, 'k');
    await expectTargetGaps(slots);
    await expect(within(root).getByRole('img', { name: 'Small to big' })).toBeVisible();
    const check = within(root).getByRole('button', { name: 'Check' });
    for (const [value, box] of [
      ['6', 1],
      ['7', 2],
      ['8', 3],
    ] as const) {
      await userEvent.click(card(root, value));
      await userEvent.click(slot(root, box));
    }
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 6 }]);
    // Never submittable on a partial row.
    await expect(check).toBeDisabled();
    await userEvent.click(card(root, '9'));
    await userEvent.click(slot(root, 4));
    await expect(placed(root)).toEqual(['6', '7', '8', '9']);
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [6, 7, 8, 9] });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:item-1',
      'tap:slot-0',
      'tap:item-3',
      'tap:slot-1',
      'tap:item-0',
      'tap:slot-2',
      'tap:item-2',
      'tap:slot-3',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * G1: drag with the mouse and with a finger, send one back (undo), and fill the rest by tap. A
 * full box takes no second card (it glides home).
 */
export const DragMouseAndTouch: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const c of root.querySelectorAll('.ni-ord__tray .ni-ord__card')) {
      await expectTargetSize(c, 'g1-up');
    }
    await pointerDrag(card(root, '9'), center(slot(root, 4)), 'mouse');
    await waitFor(() => expect(placed(root)[3]).toBe('9'));
    await pointerDrag(card(root, '6'), center(slot(root, 1)), 'touch');
    await waitFor(() => expect(placed(root)[0]).toBe('6'));
    // Onto a full box: nothing moves.
    await pointerDrag(card(root, '8'), center(slot(root, 1)), 'mouse');
    await expect(placed(root)).toEqual(['6', '', '', '9']);
    // Tap a placed card: it goes back to the tray.
    await userEvent.click(
      within(root.querySelector('.ni-ord__slots') as HTMLElement).getByRole('button', {
        name: '9',
      }),
    );
    await expect(placed(root)).toEqual(['6', '', '', '']);
    await pointerDrag(card(root, '7'), center(slot(root, 2)), 'touch');
    await pointerDrag(card(root, '8'), center(slot(root, 3)), 'mouse');
    await pointerDrag(card(root, '9'), center(slot(root, 4)), 'touch');
    await waitFor(() => expect(placed(root)).toEqual(['6', '7', '8', '9']));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [6, 7, 8, 9] });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.slice(0, 7)).toEqual([
      'drag:item-2',
      'drop:slot-3',
      'drag:item-1',
      'drop:slot-0',
      'drag:item-0',
      'drop:none',
      'undo:item-2',
    ]);
  },
};

/**
 * Keyboard (06 §7): Enter picks a card up and jumps to the first empty box, arrows move between
 * boxes, Enter puts it down. A double Enter and Check inside 400 ms answer once.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    card(root, '9').focus();
    await userEvent.keyboard('{Enter}');
    await expect(slot(root, 1)).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await expect(slot(root, 4)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(placed(root)[3]).toBe('9');
    // Check on an unfinished row sends nothing and does not start the 400 ms window.
    const check = within(root).getByRole('button', { name: 'Check' });
    await userEvent.click(check, { pointerEventsCheck: 0 });
    await expect(args.onResponse).not.toHaveBeenCalled();
    for (const [value, rights] of [
      ['6', 0],
      ['7', 0],
      ['8', 0],
    ] as const) {
      card(root, value).focus();
      await userEvent.keyboard('{Enter}');
      for (let i = 0; i < rights; i++) await userEvent.keyboard('{ArrowRight}');
      await userEvent.keyboard('{Enter}');
    }
    await expect(placed(root)).toEqual(['6', '7', '8', '9']);
    check.focus();
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [6, 7, 8, 9] });
  },
};

/** A pinned card stays put (pin icon) and its box takes no card; the answer includes it. */
export const FixedSlot: Story = {
  args: { config: decade },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const pinned = within(root).getByRole('img', { name: "30 can't move" });
    await expect(pinned.querySelector('.ni-ord__pin')).not.toBeNull();
    await expect(root.querySelectorAll('.ni-ord__tray .ni-ord__card')).toHaveLength(3);
    // Box 3 holds the pin: a drag onto it glides home.
    await pointerDrag(card(root, '31'), center(pinned), 'mouse');
    await expect(placed(root)).toEqual(['', '', '30', '']);
    for (const [value, box] of [
      ['28', 1],
      ['29', 2],
      ['31', 4],
    ] as const) {
      await userEvent.click(card(root, value));
      await userEvent.click(slot(root, box));
    }
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [28, 29, 30, 31],
    });
  },
};

/** Big to small: the pebbles shrink. */
export const BigToSmall: Story = {
  args: { config: down },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('img', { name: 'Big to small' })).toBeVisible();
    const sizes = [...root.querySelectorAll('.ni-ord__pebble')].map((p) => p.clientWidth);
    await expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    for (const [value, box] of [
      ['15', 1],
      ['14', 2],
    ] as const) {
      await userEvent.click(card(root, value));
      await userEvent.click(slot(root, box));
    }
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

/** Pictorial: picture cards (dice), K. */
export const PictureCardsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: pictures, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const [name, box] of [
      ['Picture 2', 1],
      ['Picture 3', 2],
      ['Picture 1', 3],
    ] as const) {
      await userEvent.click(card(root, name));
      await userEvent.click(slot(root, box));
    }
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [2, 4, 5] });
  },
};

/** `disabled`: nothing moves. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(card(root, '6'), center(slot(root, 1)), 'mouse');
    await userEvent.click(card(root, '6'), { pointerEventsCheck: 0 });
    await expect(placed(root)).toEqual(['', '', '', '']);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3): Pip points at 6 and slides it into the first box; the next is invited. */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight', args: { id: 'item-1' } });
    await demoController.play({ op: 'drag', args: { id: 'item-1', slot: 0 } });
    await expect(placed(root)).toEqual(['6', '', '', '']);
    await expect(root.querySelector('.ni-ord__flight')).toBeNull();
    await expect(demoController.play({ op: 'tap' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'drag', args: { id: 'item-3', slot: 1 } });
    await waitFor(() =>
      expect(root.querySelector('[data-card="item-3"].ni-invite')).not.toBeNull(),
    );
    await expect(root.querySelector('[data-slot-pad="1"].ni-invite')).not.toBeNull();
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: `answer {values}` fills the row instantly and replaces what was there. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'drag', args: { id: 'item-2', slot: 0 } });
    await reducedController.play({ op: 'answer', args: { values: [6, 7, 8, 9] } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(placed(root)).toEqual(['6', '7', '8', '9']);
  },
};
