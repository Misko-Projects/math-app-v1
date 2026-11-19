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
  waitForSettled,
} from '../../test-support/storyHelpers';
import {
  areaBox,
  expectFitsArea,
  expectPointerOn,
  expectRingClear,
  expectTraceOrdered,
  findWidget,
  inArea,
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

// Real content shapes (what the K01 generators build: compare.numbers, compare.sets, mea.length,
// mea.massvolume, count.sequence).

/** CNT.01.t3: five two-digit cards, small to big (the most a K order item has). */
const fiveUp: Config = { format: 'order', items: cards([14, 11, 15, 12, 13]), direction: 'asc' };

/** CNT.09.t4: across a hundred, three-digit labels. */
const hundred: Config = { format: 'order', items: cards([99, 101, 100, 98]), direction: 'asc' };

/** A number-path card (compare.numbers `number-path`): the numeral, and where it sits on 0–20. */
const pathCard = (v: number, i: number): Config['items'][number] => ({
  id: `item-${i}`,
  value: v,
  label: String(v),
  stimulus: {
    kind: 'number-line',
    min: 0,
    max: 20,
    ticksEvery: 1,
    labelsEvery: 1,
    marks: [{ at: v, arrow: true }],
  },
});

/** CMP.06.t1 (K): four number-path cards, 0–20. */
const pathCards: Config = {
  format: 'order',
  items: [8, 20, 17, 15].map(pathCard),
  direction: 'asc',
};

/** CMP.01.t5 (K): dot pictures, fewest first; one is a line of ten. */
const dotCards: Config = {
  format: 'order',
  items: [1, 10, 7].map((count, i) => ({
    id: `item-${i}`,
    value: count,
    stimulus: {
      kind: 'objects',
      set: { count, sprite: 'dot', layout: 'line', layoutSeed: 3 + i },
    },
  })),
  direction: 'asc',
};

/** CMP.07.t3 (K): double ten-frames (teen numbers). */
const frameCards: Config = {
  format: 'order',
  items: [18, 13, 20].map((v, i) => ({
    id: `item-${i}`,
    value: v,
    stimulus: { kind: 'ten-frame', frames: 2, filled: [10, v - 10] },
  })),
  direction: 'asc',
};

/** PV.02.t2 (G1): base-ten blocks. */
const blockCards: Config = {
  format: 'order',
  items: [99, 22, 91].map((v, i) => ({
    id: `item-${i}`,
    value: v,
    stimulus: { kind: 'base-ten', hundreds: 0, tens: Math.floor(v / 10), ones: v % 10 },
  })),
  direction: 'asc',
};

/** MEA.01.t5 (K): ruler strips, longest first. */
const rulerCards: Config = {
  format: 'order',
  items: [10, 4, 7].map((v, i) => ({
    id: `item-${i}`,
    value: v,
    stimulus: {
      kind: 'number-line',
      min: 0,
      max: 11,
      ticksEvery: 1,
      labelsEvery: null,
      marks: [{ at: v, arrow: true }],
    },
  })),
  direction: 'desc',
};

/** MEA.16.t3 (K): heaviest first, one object a card. */
const weightCards: Config = {
  format: 'order',
  items: ['apple', 'feather', 'pumpkin'].map((sprite, i) => ({
    id: `item-${i}`,
    value: [3, 1, 9][i] as number,
    stimulus: { kind: 'objects', set: { count: 1, sprite, layout: 'line', layoutSeed: 1 } },
  })),
  direction: 'desc',
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

/**
 * Demo mode (03 §6.3): Pip points at 6 and slides it into the first box. While the host keeps
 * input off, an invite shows nothing (the child can't act yet).
 */
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
    await new Promise((r) => setTimeout(r, 100));
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

/** Every target a child can use: tray cards, placed cards, empty slots (a full slot's card covers its pad), check. */
const targets = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>(
    '.ni-ord__tray .ni-ord__card, button.ni-ord__card, .ni-ord__slot:not(:has(.ni-ord__card)) .ni-ord__pad',
  ),
  within(root).getByRole('button', { name: 'Check' }),
];

/** ONE ring, on `el`; Pip's fingertip on it at rest; the ring ≥ 12 px clear of every other target. */
async function expectInviteOn(root: HTMLElement, el: HTMLElement) {
  await waitFor(() => expect(el).toHaveClass('ni-invite'));
  await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
  await waitFor(() => expect(root.querySelectorAll('.ni-hand')).toHaveLength(1));
  await waitForSettled(el);
  await new Promise((r) => requestAnimationFrame(r));
  await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, el, root);
  await expectRingClear(
    el,
    targets(root).filter((t) => t !== el),
  );
}

const noInvite = async (root: HTMLElement) => {
  await waitFor(() => expect(root.querySelector('.ni-invite')).toBeNull());
  await expect(root.querySelector('.ni-hand')).toBeNull();
};

const dragInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * The child's turn (03 §6.3), `drag {id, slot}`: the ring and Pip's hand on the card; once the
 * child has picked it up, on its box; once it is in, nothing.
 */
export const InviteDragK: Story = {
  globals: { ageMode: 'k' },
  args: { demo: dragInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    dragInvite.invite({ op: 'drag', args: { id: 'item-3', slot: 1 } });
    await expectInviteOn(root, card(root, '7'));
    await userEvent.click(card(root, '7'));
    await expectInviteOn(root, root.querySelector('[data-slot-pad="1"]') as HTMLElement);
    await userEvent.click(slot(root, 2));
    await expect(placed(root)).toEqual(['', '7', '', '']);
    await noInvite(root);
  },
};

const answerInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * `answer {values}`: the next card the model's solution puts in the first box that is not yet
 * right; the cue moves on as the child fills the row. A highlight rings the card only.
 */
export const InviteAnswer: Story = {
  args: { demo: answerInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    answerInvite.invite({ op: 'answer', args: { values: [6, 7, 8, 9] } });
    await expectInviteOn(root, card(root, '6'));
    await userEvent.click(card(root, '6'));
    await userEvent.click(slot(root, 1));
    await expectInviteOn(root, card(root, '7'));
    answerInvite.invite({ op: 'highlight', args: { id: 'item-2' } });
    await expectInviteOn(root, card(root, '9'));
    answerInvite.invite(null);
    await noInvite(root);
  },
};

// ---------- real content shapes ----------

/** Three-digit labels (CNT.09.t4) stay one size on K cards, numerals ≥ 32 px. */
export const ThreeDigitK: Story = {
  globals: { ageMode: 'k' },
  args: { config: hundred },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const trayCards = [...root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')];
    for (const c of trayCards) {
      await expectTargetSize(c, 'k');
      const numeral = c.querySelector('.ni-ord__numeral') as HTMLElement;
      await expect(Number.parseFloat(getComputedStyle(numeral).fontSize)).toBeGreaterThanOrEqual(
        32,
      );
      // The numeral fits inside its card.
      await expect(numeral.scrollWidth).toBeLessThanOrEqual(c.clientWidth);
    }
    await expectTargetGaps(trayCards);
  },
};

/** Picture cards keep the size of their neighbours; each shows its picture. */
async function expectPictureCards(root: HTMLElement, n: number, ageMode: 'k' | 'g1-up') {
  const trayCards = [...root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')];
  await expect(trayCards).toHaveLength(n);
  const sizes = trayCards.map((c) => c.getBoundingClientRect());
  for (const r of sizes) {
    await expect(Math.round(r.width)).toBe(Math.round((sizes[0] as DOMRect).width));
    await expect(Math.round(r.height)).toBe(Math.round((sizes[0] as DOMRect).height));
  }
  for (const c of trayCards) {
    await expectTargetSize(c, ageMode);
    const pic = c.querySelector('.ni-fitpic') as HTMLElement;
    await expect(pic).not.toBeNull();
    // The picture sits inside its card.
    const p = pic.getBoundingClientRect();
    const r = c.getBoundingClientRect();
    await expect(p.left).toBeGreaterThanOrEqual(r.left);
    await expect(p.right).toBeLessThanOrEqual(r.right + 0.5);
    await expect(p.top).toBeGreaterThanOrEqual(r.top);
    await expect(p.bottom).toBeLessThanOrEqual(r.bottom + 0.5);
  }
  await expectTargetGaps(trayCards);
}

/** CMP.06.t1 (K): number-path cards; the numeral above where it sits on the path. */
export const PathCardsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: pathCards, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPictureCards(root, 4, 'k');
    await expect(card(root, '8').querySelector('.ni-ord__tag')).toHaveTextContent('8');
    for (const [value, box] of [
      ['8', 1],
      ['15', 2],
      ['17', 3],
      ['20', 4],
    ] as const) {
      await userEvent.click(card(root, value));
      await userEvent.click(slot(root, box));
    }
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [8, 15, 17, 20],
    });
  },
};

/** CMP.01.t5 (K): dot pictures, one a line of ten; no numeral gives the order away. */
export const DotCardsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: dotCards, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPictureCards(root, 3, 'k');
    await expect(root.querySelector('.ni-ord__tag')).toBeNull();
    await expect(root.querySelector('.ni-ord__numeral')).toBeNull();
  },
};

/** CMP.07.t3 (K): double ten-frames, stacked on each card so the counters stay big. */
export const FrameCardsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: frameCards, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPictureCards(root, 3, 'k');
    // Two frames a card, the counters 10 + 8 on the first.
    const first = card(root, 'Picture 1');
    await expect(first.querySelectorAll('.ni-objects__frame')).toHaveLength(2);
    await expect(first.querySelectorAll('.ni-objects__item')).toHaveLength(18);
  },
};

/** PV.02.t2 (G1): base-ten blocks, scaled as a whole to the card. */
export const BlockCards: Story = {
  args: { config: blockCards, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPictureCards(root, 3, 'g1-up');
    await expect(card(root, 'Picture 1').querySelectorAll('.ni-baseten__block')).toHaveLength(9);
  },
};

/** MEA.01.t5 (K): ruler strips, longest first. */
export const RulerCardsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: rulerCards, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPictureCards(root, 3, 'k');
    await expect(within(root).getByRole('img', { name: 'Big to small' })).toBeVisible();
  },
};

/** MEA.16.t3 (K): one object a card, heaviest first. */
export const WeightCardsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: weightCards, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPictureCards(root, 3, 'k');
  },
};

// ---------- the workshop's widget area (06 §1, §2) ----------

/** The widget fits the area: no scroll, every part inside, every target full size and spaced. */
async function expectOrderFits(canvasElement: HTMLElement, root: HTMLElement, age: 'k' | 'g1-up') {
  await waitForSettled(root);
  const parts = [
    root.querySelector('.ni-ord__board'),
    root.querySelector('.ni-ord__tray'),
    root.querySelector('.ni-ord__check'),
  ].filter((p): p is HTMLElement => p !== null);
  await expectFitsArea(areaBox(canvasElement), parts, targets(root), age);
}

/**
 * K at the 960 × 600 minimum (852 × 319 inside the area): five cards, the compact cue, Check
 * beside the tray, no scroll. Then the row is filled by tap and still fits.
 */
export const FiveCardsKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveUp },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-chrome', 'compact');
    await expect(root).toHaveAttribute('data-check', 'beside');
    await expectOrderFits(canvasElement, root, 'k');
    for (const [value, box] of [
      ['11', 1],
      ['12', 2],
      ['13', 3],
      ['14', 4],
      ['15', 5],
    ] as const) {
      await userEvent.click(card(root, value));
      await userEvent.click(slot(root, box));
    }
    await expectOrderFits(canvasElement, root, 'k');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [11, 12, 13, 14, 15],
    });
  },
};

const minInvite: WidgetDemo = createDemoController({ strict: true });

/** The same area with a drag invite: Pip's hand under the tray card still fits; no scroll. */
export const FiveCardsKMinLandscapeInvite: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveUp, demo: minInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    minInvite.invite({ op: 'drag', args: { id: 'item-1', slot: 0 } });
    await expectInviteOn(root, card(root, '11'));
    await expectOrderFits(canvasElement, root, 'k');
  },
};

/** K at the minimum: four number-path cards (wider than tall), every part in the area. */
export const PathCardsKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: pathCards, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPictureCards(root, 4, 'k');
    await expectOrderFits(canvasElement, root, 'k');
  },
};

const pathInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * The same area with an invite on a picture card: the layout already holds room for Pip's hand
 * under the tray, so nothing moves or scrolls; then on its box once the card is picked up.
 */
export const PathCardsKMinLandscapeInvite: Story = {
  globals: { ageMode: 'k' },
  args: { config: pathCards, tier: 'pictorial', demo: pathInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const before = card(root, '8').getBoundingClientRect();
    pathInvite.invite({ op: 'drag', args: { id: 'item-0', slot: 0 } });
    await expectInviteOn(root, card(root, '8'));
    await expectOrderFits(canvasElement, root, 'k');
    // The cards did not move or resize when Pip came in.
    const after = card(root, '8').getBoundingClientRect();
    const px = (r: DOMRect) => [r.top, r.width, r.height].map(Math.round);
    await expect(px(after)).toEqual(px(before));
    await userEvent.click(card(root, '8'));
    await expectInviteOn(root, root.querySelector('[data-slot-pad="0"]') as HTMLElement);
    await expectOrderFits(canvasElement, root, 'k');
  },
};

/** Portrait tablet (746 × 812): five K cards, the full cue, bigger cards. */
export const FiveCardsKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveUp },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-chrome', 'normal');
    await expectOrderFits(canvasElement, root, 'k');
  },
};

/** Portrait: four number-path cards. */
export const PathCardsKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: pathCards, tier: 'pictorial' },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOrderFits(canvasElement, root, 'k');
  },
};

/** Tablet landscape (1226 × 493): five K cards, the full cue. */
export const FiveCardsKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveUp },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-chrome', 'normal');
    await expectOrderFits(canvasElement, root, 'k');
  },
};

/** Tablet landscape: four number-path cards. */
export const PathCardsKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: pathCards, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOrderFits(canvasElement, root, 'k');
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
