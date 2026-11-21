import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectAreaCentred,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
  waitForSettled,
} from '../../test-support/storyHelpers';
import {
  areaBox,
  contentBox,
  expectFill,
  expectFitsArea,
  expectHandClearOfOthers,
  expectInside,
  expectPointerOn,
  expectRingClear,
  expectTraceOrdered,
  findWidget,
  inArea,
  noteMeasure,
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
  // Every order story: each numeral a card shows (numeral cards and picture-card tags) is ≥ 32 px.
  afterEach: async ({ canvasElement }) => {
    // The area card is centred in the stage on both axes (story harness, #92).
    await expectAreaCentred(canvasElement);
    // In a workshop area: the widget uses the room (its content covers ≥ 60 % of it).
    const box = canvasElement.querySelector<HTMLElement>('.story-widget-area');
    const root = canvasElement.querySelector<HTMLElement>('.ni-ord');
    if (box && root) {
      await expectFill(box, [
        ...root.querySelectorAll('.ni-ord__board, .ni-ord__tray, .ni-ord__check'),
      ]);
    }
    for (const el of canvasElement.querySelectorAll<HTMLElement>(
      '.ni-ord .ni-ord__numeral, .ni-ord .ni-ord__tag',
    )) {
      if (!el.textContent?.trim()) continue;
      await expect(
        Number.parseFloat(getComputedStyle(el).fontSize),
        `numeral ${el.textContent} size`,
      ).toBeGreaterThanOrEqual(32);
    }
  },
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-ord';
const card = (root: HTMLElement, name: string) =>
  within(root.querySelector('.ni-ord__tray') as HTMLElement).getByRole('button', { name });
const slot = (root: HTMLElement, n: number) =>
  within(root).getByRole('button', { name: `Box ${n}` });
/** A CSS colour token as the browser computes it (rgb()). */
function rgbOf(root: HTMLElement, cssVar: string) {
  const probe = document.createElement('span');
  probe.style.color = `var(${cssVar})`;
  root.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

/**
 * The keyboard focus ring on a box (06 §7): an ink ring outside it (box-shadow, ≥ 3 px of ink past
 * a paper gap), visible whatever the box's outline shows (Pip's teal invite ring, or none).
 */
async function expectInkFocusRing(el: HTMLElement) {
  await waitForSettled(el);
  const shadow = getComputedStyle(el).boxShadow;
  const ink = rgbOf(el.closest('.ni-ord') as HTMLElement, '--color-ink');
  const rings = shadow.split(/,(?![^(]*\))/).map((r) => r.trim());
  const inkRing = rings.find((r) => r.startsWith(ink));
  await expect(inkRing, `an ink focus ring in "${shadow}"`).toBeDefined();
  const spreads = (inkRing ?? '').match(/(-?[\d.]+)px/g)?.map((v) => Number.parseFloat(v)) ?? [];
  const paperSpread = Math.max(
    0,
    ...rings
      .filter((r) => r !== inkRing)
      .map((r) => Number.parseFloat(r.match(/(-?[\d.]+)px\s*$/)?.[1] ?? '0')),
  );
  await expect((spreads.at(-1) ?? 0) - paperSpread).toBeGreaterThanOrEqual(3);
}

/** Box n's pad: a drop target, or (holding a card) only its backdrop. */
const padOf = (root: HTMLElement, n: number) =>
  root.querySelector(`[data-slot-pad="${n - 1}"]`) as HTMLElement;
const placed = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.ni-ord__slot')].map(
    (s) => s.querySelector('.ni-ord__card')?.textContent ?? '',
  );

/** K: tap a card (it speaks its number), tap a box; fill the row and check. K-sized and spaced. */
export const TapToPlaceK: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
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
    await pointerDrag(card(root, '8'), center(padOf(root, 1)), 'mouse');
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

/**
 * Keyboard: a box holding a card (placed or pinned) is not a target: its pad leaves the tab order
 * and the arrow keys step over it, from the first empty box to the next empty one.
 */
export const KeyboardSkipsFullBoxes: Story = {
  args: { config: decade },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Box 3 holds the pinned 30; put 29 in box 2.
    await userEvent.click(card(root, '29'));
    await userEvent.click(slot(root, 2));
    await expect(placed(root)).toEqual(['', '29', '30', '']);
    for (const n of [2, 3]) {
      await expect(padOf(root, n)).not.toHaveAttribute('role');
      await expect(padOf(root, n)).not.toHaveAttribute('tabindex');
    }
    card(root, '31').focus();
    await userEvent.keyboard('{Enter}');
    await expect(slot(root, 1)).toHaveFocus();
    // The focused box shows a visible focus ring even while armed for the picked-up card (06 §7).
    const expectFocusRing = expectInkFocusRing;
    await expect(slot(root, 1)).toHaveAttribute('data-armed', 'true');
    await expectFocusRing(slot(root, 1));
    await userEvent.keyboard('{ArrowRight}');
    await expect(slot(root, 4)).toHaveFocus();
    await expectFocusRing(slot(root, 4));
    await userEvent.keyboard('{ArrowRight}');
    await expect(slot(root, 1)).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{Enter}');
    await expect(placed(root)).toEqual(['', '29', '30', '31']);
  },
};

const keyInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Keyboard and invite on one box: the card picked up with Enter moves focus to the invited first
 * box; it shows BOTH Pip's teal invite ring (on its edge) and the ink keyboard focus ring outside.
 */
export const KeyboardOnInvitedBox: Story = {
  args: { demo: keyInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    keyInvite.invite({ op: 'drag', args: { id: 'item-1', slot: 0 } });
    await waitFor(() => expect(card(root, '6')).toHaveClass('ni-invite'));
    card(root, '6').focus();
    await userEvent.keyboard('{Enter}');
    const box = slot(root, 1);
    await expect(box).toHaveFocus();
    await waitFor(() => expect(box).toHaveClass('ni-invite'));
    await expect(box).toHaveAttribute('data-armed', 'true');
    await waitForSettled(box);
    const cs = getComputedStyle(box);
    await expect(cs.outlineStyle).toBe('solid');
    await expect(cs.outlineWidth).toBe('5px');
    await expect(cs.outlineColor).toBe(rgbOf(root, '--color-sea-deep'));
    await expectInkFocusRing(box);
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    // Forced colours (06 §7) draw no box shadows: the focused box draws a solid Highlight outline
    // there, outside the box, unlike Pip's ring on an unfocused invited box (the same box, blurred).
    const forced = forcedColorOutline(box);
    await expect(forced, 'a forced-colours focus outline for the focused box').not.toBeNull();
    await expect(forced?.style).toBe('solid');
    await expect(forced?.color.toLowerCase()).toBe('highlight');
    await expect(Number.parseFloat(forced?.width ?? '0')).toBeGreaterThanOrEqual(3);
    box.blur();
    await waitFor(() => expect(box).not.toHaveFocus());
    await expect(forcedColorOutline(box), 'no focus outline once blurred').toBeNull();
    const invited = getComputedStyle(box);
    await expect(
      `${invited.outlineStyle} ${invited.outlineColor} ${invited.outlineOffset}`,
    ).not.toBe(`${forced?.style} ${forced?.color} ${forced?.offset}`);
    await expect(invited.outlineOffset).toBe('-5px');
    // Without forced colours, a focused box that is not invited carries the same solid outline
    // (transparent, so only the ink ring shows); an unfocused one has none of its own.
    const other = padOf(root, 3);
    await expect(getComputedStyle(other).outlineColor).toBe('rgba(0, 0, 0, 0)');
    other.focus();
    await waitFor(() => expect(other).toHaveFocus());
    await expect(other.matches(':focus')).toBe(true);
    await expect(getComputedStyle(other).outlineStyle).toBe('solid');
    await expect(getComputedStyle(other).outlineWidth).toBe('4px');
    await expect(forcedColorOutline(other)?.color.toLowerCase()).toBe('highlight');
  },
};

/**
 * The outline the `(forced-colors: active)` rules of the page's stylesheets give `el` as it is
 * now (focused or not), or null. The story runner can't switch forced colours on, so the rules are
 * matched directly (selectors against the live element).
 */
function forcedColorOutline(el: Element) {
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (
        !(rule instanceof CSSMediaRule) ||
        !/forced-colors:\s*active/.test(rule.media.mediaText)
      ) {
        continue;
      }
      for (const inner of rule.cssRules) {
        if (!(inner instanceof CSSStyleRule) || !el.matches(inner.selectorText)) continue;
        if (!inner.style.outlineStyle) continue;
        return {
          style: inner.style.outlineStyle,
          color: inner.style.outlineColor,
          width: inner.style.outlineWidth,
          offset: inner.style.outlineOffset,
        };
      }
    }
  }
  return null;
}

/** A pinned card stays put (pin icon) and its box takes no card; the answer includes it. */
export const FixedSlot: Story = {
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  args: { config: decade },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const pinned = within(root).getByRole('button', { name: "30 can't move" });
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
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
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

/** Every target a child can use: tray cards, placed cards, empty slots (drop pads), check. */
const targets = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>(
    '.ni-ord__tray .ni-ord__card, button.ni-ord__card, .ni-ord__pad.ni-drop-target',
  ),
  within(root).getByRole('button', { name: 'Check' }),
];

/**
 * The invite ring, at rest, stays ≥ 12 px inside the board or tray it sits in (inside their
 * border) and ≥ 12 px below the cue arrow.
 */
async function expectRingInside(root: HTMLElement, el: HTMLElement) {
  const loops = root
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  for (const a of loops) {
    a.pause();
    a.currentTime = 0;
  }
  try {
    const cs = getComputedStyle(el);
    const reach = Math.max(
      0,
      Number.parseFloat(cs.outlineOffset) + Number.parseFloat(cs.outlineWidth),
    );
    const r = el.getBoundingClientRect();
    const ring = {
      left: r.left - reach,
      top: r.top - reach,
      right: r.right + reach,
      bottom: r.bottom + reach,
    };
    const box = el.closest('.ni-ord__board, .ni-ord__tray') as HTMLElement;
    const b = box.getBoundingClientRect();
    const border = Number.parseFloat(getComputedStyle(box).borderTopWidth);
    await expect(ring.left - (b.left + border), 'ring to the left edge').toBeGreaterThanOrEqual(
      11.5,
    );
    await expect(b.right - border - ring.right, 'ring to the right edge').toBeGreaterThanOrEqual(
      11.5,
    );
    await expect(b.bottom - border - ring.bottom, 'ring to the bottom edge').toBeGreaterThanOrEqual(
      11.5,
    );
    const arrow = box.querySelector('.ni-ord__arrow');
    const above = arrow ? arrow.getBoundingClientRect().bottom : b.top + border;
    await expect(ring.top - above, 'ring below the arrow or edge').toBeGreaterThanOrEqual(11.5);
  } finally {
    for (const a of loops) a.play();
  }
}

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
  await expectRingInside(root, el);
  // Pip's hand covers no other control: ≥ 12 px from each, off every glyph.
  await expectHandClearOfOthers(root, el);
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
  // In the workshop's tablet widget area (1226 × 493), as the evidence shows it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  args: { config: weightCards, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectPictureCards(root, 3, 'k');
  },
};

// ---------- the workshop's widget area (06 §1, §2) ----------

/** What a number-path card measures as drawn (CSS px). */
interface PathMeasure {
  /** The card's size. */
  card: { w: number; h: number };
  /** Ticks drawn on each path, and the value step between them. */
  ticks: number;
  every: number;
  /** Drawn px between neighbouring ticks (the tightest card). */
  pitch: number;
}

/**
 * Maths truth and legibility on number-path cards, measured as drawn: the whole path from its
 * first to its last value; ticks evenly spaced ≥ 8 px apart: every unit tick when that fits,
 * else the largest of 10, 5, 2 units that divides the span (ranked by value, 5s and 10s longer);
 * the mark's pointer exactly over its own value's place, standing clear above every tick (never on one) and ≥ 4 px clear of the
 * end arrow.
 */
async function expectPaths(root: HTMLElement): Promise<PathMeasure> {
  const tray = [...root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')];
  await expect(tray.length).toBeGreaterThan(0);
  let pitch = Number.POSITIVE_INFINITY;
  let ticksDrawn = 0;
  let every = 0;
  for (const c of tray) {
    const item = pathCards.items.find((it) => it.label === c.getAttribute('aria-label'));
    const spec = item?.stimulus;
    if (spec?.kind !== 'number-line' || !spec.ticksEvery) throw new Error('not a path card');
    const ticks = [...c.querySelectorAll<SVGLineElement>('.ni-numberline__tick')];
    const at = ticks.map((t) => Number(t.dataset.at));
    // The whole path: from its first value to its last.
    await expect(at[0]).toBe(spec.min);
    await expect(at.at(-1)).toBe(spec.max);
    const step = (at[1] ?? 0) - (at[0] ?? 0);
    await expect([1, 2, 5, 10].map((k) => k * (spec.ticksEvery ?? 1))).toContain(step);
    await expect(ticks).toHaveLength((spec.max - spec.min) / step + 1);
    const xs = ticks.map((t) => {
      const r = t.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    const gap = (xs[1] ?? 0) - (xs[0] ?? 0);
    for (let i = 1; i < xs.length; i++) {
      await expect((xs[i] ?? 0) - (xs[i - 1] ?? 0), 'ticks evenly spaced').toBeCloseTo(gap, 1);
    }
    await expect(gap, 'drawn tick pitch').toBeGreaterThanOrEqual(8);
    pitch = Math.min(pitch, gap);
    ticksDrawn = ticks.length;
    every = step;
    for (const t of ticks) {
      const v = Number(t.dataset.at);
      await expect(t.dataset.rank).toBe(v % 10 === 0 ? 'ten' : v % 5 === 0 ? 'five' : 'one');
    }
    // The mark: a pointer over its own value's place (between the ticks, by the scale).
    const mark = spec.marks?.[0]?.at ?? Number.NaN;
    await expect(c.querySelector('.ni-numberline__mark circle')).toBeNull();
    const pointer = (
      c.querySelector('.ni-numberline__pointer') as SVGPathElement
    ).getBoundingClientRect();
    const x0 = xs[0] ?? 0;
    const x1 = xs.at(-1) ?? 0;
    const want = x0 + ((mark - spec.min) / (spec.max - spec.min)) * (x1 - x0);
    await expect(pointer.left + pointer.width / 2, `mark ${mark} on its place`).toBeCloseTo(
      want,
      0,
    );
    const tickTop = Math.min(...ticks.map((t) => t.getBoundingClientRect().top));
    await expect(tickTop - pointer.bottom, 'the pointer stands above the ticks').toBeGreaterThan(
      0.5,
    );
    // The end arrow (NumberLineView: 18–30 px past the last value, 9 px each side of the line),
    // at the line's drawn scale.
    const svg = c.querySelector('svg.ni-numberline') as SVGSVGElement;
    const s = svg.getBoundingClientRect().width / svg.width.baseVal.value;
    const axis = (
      c.querySelector('.ni-numberline__axis') as SVGLineElement
    ).getBoundingClientRect();
    // A compact path draws each end arrow on its own (`data-end`); a scaled one draws both in one.
    const maxCap = c.querySelector('.ni-numberline__cap[data-end="max"]');
    const capBox = maxCap?.getBoundingClientRect();
    const capLeft = capBox ? capBox.left : x1 + 18 * s;
    const capTop = capBox ? capBox.top : axis.top + axis.height / 2 - 9 * s;
    await expect(
      Math.max(capLeft - pointer.right, capTop - pointer.bottom),
      'the pointer clear of the end arrow',
    ).toBeGreaterThanOrEqual(4);
  }
  const r = (tray[0] as HTMLElement).getBoundingClientRect();
  return { card: { w: r.width, h: r.height }, ticks: ticksDrawn, every, pitch };
}

/** Records a path measure for the evidence label (`data-m-path`). */
const notePaths = (canvasElement: HTMLElement, m: PathMeasure) =>
  noteMeasure(
    canvasElement,
    'path',
    `cards ${Math.round(m.card.w)}×${Math.round(m.card.h)} px, ${m.ticks} ticks @ ${m.pitch.toFixed(1)} px`,
  );

/** The tablet card's path ink in screen px (PathCardsKTablet measures it: track 3.5, ticks 2.8). */
const TABLET_INK = { track: 3.5, tick: 2.8 };

/**
 * K-legible path ink on every tray card, measured in screen px (strokes at the drawn scale):
 * the track and ticks at least as heavy as the tablet card's, every tick ≥ 12 px tall, the mark's
 * pointer ≥ 16 px each way, and ≥ 6 px of air between the pointer and the tallest tick under it
 * and between the pointer and the end arrow (ink to ink, strokes included). Returns the smallest
 * of each, for the label.
 */
async function expectPathInk(root: HTMLElement) {
  const ink = { track: Infinity, tick: Infinity, tall: Infinity, pointer: Infinity, gap: Infinity };
  for (const c of root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')) {
    const svg = c.querySelector('svg.ni-numberline') as SVGSVGElement;
    const s = svg.getBoundingClientRect().width / svg.width.baseVal.value;
    const stroke = (el: Element) => Number.parseFloat(getComputedStyle(el).strokeWidth) * s;
    const axis = c.querySelector('.ni-numberline__axis') as SVGLineElement;
    const ticks = [...c.querySelectorAll<SVGLineElement>('.ni-numberline__tick')];
    const pointer = c.querySelector('.ni-numberline__pointer') as SVGPathElement;
    const ps = stroke(pointer);
    const p = pointer.getBoundingClientRect();
    const pInk = { left: p.left - ps / 2, right: p.right + ps / 2, bottom: p.bottom + ps / 2 };
    ink.track = Math.min(ink.track, stroke(axis));
    for (const t of ticks) {
      ink.tick = Math.min(ink.tick, stroke(t));
      ink.tall = Math.min(ink.tall, t.getBoundingClientRect().height);
    }
    ink.pointer = Math.min(ink.pointer, p.width, p.height);
    // The tallest tick's ink top (its round cap past the line's end).
    const tickTop = Math.min(...ticks.map((t) => t.getBoundingClientRect().top - stroke(t) / 2));
    ink.gap = Math.min(ink.gap, tickTop - pInk.bottom);
    for (const cap of c.querySelectorAll('.ni-numberline__cap[data-end]')) {
      const b = cap.getBoundingClientRect();
      ink.gap = Math.min(
        ink.gap,
        Math.max(b.left - pInk.right, pInk.left - b.right, b.top - pInk.bottom),
      );
    }
  }
  await expect(ink.track, 'track stroke (screen px)').toBeGreaterThanOrEqual(TABLET_INK.track);
  await expect(ink.tick, 'tick stroke (screen px)').toBeGreaterThanOrEqual(TABLET_INK.tick);
  await expect(ink.tall, 'tick height (screen px)').toBeGreaterThanOrEqual(12);
  await expect(ink.pointer, 'pointer size (screen px)').toBeGreaterThanOrEqual(16);
  await expect(ink.gap, 'pointer to tick and end arrow (screen px)').toBeGreaterThanOrEqual(6);
  return ink;
}

/** Records the path ink for the evidence label (`data-m-ink`). */
const noteInk = (canvasElement: HTMLElement, ink: Awaited<ReturnType<typeof expectPathInk>>) =>
  noteMeasure(
    canvasElement,
    'ink',
    `track ${ink.track.toFixed(1)} px, ticks ≥ ${ink.tall.toFixed(0)} px, pointer ${ink.pointer.toFixed(0)} px, gaps ≥ ${ink.gap.toFixed(0)} px`,
  );

/**
 * Pip's hand at rest (its bob included) covers no ink of the cue or of any path: no pebble, no
 * arrow, no tick, line, end arrow or mark.
 */
async function expectHandOffInk(root: HTMLElement) {
  const loops = root
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  for (const a of loops) {
    a.pause();
    a.currentTime = 0;
  }
  try {
    const h = (root.querySelector('.ni-hand svg') as SVGElement).getBoundingClientRect();
    const reach = { left: h.left - 6, right: h.right, top: h.top, bottom: h.bottom + 8 };
    const ink = root.querySelectorAll(
      '.ni-ord__pebble, .ni-ord__arrow, .ni-ord__arrowhead, .ni-numberline__tick, .ni-numberline__axis, .ni-numberline__cap, .ni-numberline__pointer',
    );
    for (const el of ink) {
      const r = el.getBoundingClientRect();
      const apart =
        reach.right <= r.left ||
        r.right <= reach.left ||
        reach.bottom <= r.top ||
        r.bottom <= reach.top;
      await expect(apart, `the hand clear of ${el.getAttribute('class')}`).toBe(true);
    }
  } finally {
    for (const a of loops) a.play();
  }
}

/** The widget fits the area: no scroll, every part inside, every target full size and spaced. */
async function expectOrderFits(canvasElement: HTMLElement, root: HTMLElement, age: 'k' | 'g1-up') {
  await waitForSettled(root);
  const parts = [
    root.querySelector('.ni-ord__board'),
    root.querySelector('.ni-ord__tray'),
    root.querySelector('.ni-ord__check'),
  ].filter((p): p is HTMLElement => p !== null);
  await expectFitsArea(areaBox(canvasElement), parts, targets(root), age);
  // The tray sits centred right under the board (Check beside it, not shifting it).
  const board = (root.querySelector('.ni-ord__board') as HTMLElement).getBoundingClientRect();
  const tray = (root.querySelector('.ni-ord__tray') as HTMLElement).getBoundingClientRect();
  await expect(Math.abs(board.left + board.width / 2 - (tray.left + tray.width / 2))).toBeLessThan(
    1,
  );
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

/**
 * The same area with a drag invite: Pip's hand under the tray card still fits; no scroll. At the
 * minimum area (and only there) the hand may cross the tray's lower edge (the Orchestrator's
 * min-area relief), as long as it covers nothing: it stays ≥ 12 px from every other target and
 * off its own card's numeral.
 */
export const FiveCardsKMinLandscapeInvite: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveUp, demo: minInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    minInvite.invite({ op: 'drag', args: { id: 'item-1', slot: 0 } });
    const invited = card(root, '11');
    await expectInviteOn(root, invited);
    await expectOrderFits(canvasElement, root, 'k');
    await expectHandClear(root, invited, false);
    await expectHandOffInk(root);
    // Measured for the label: does the hand (bob included) cross the tray's edge?
    const h = (root.querySelector('.ni-hand svg') as SVGElement).getBoundingClientRect();
    const tray = (root.querySelector('.ni-ord__tray') as HTMLElement).getBoundingClientRect();
    noteMeasure(
      canvasElement,
      'relief',
      h.bottom + 8 > tray.bottom - 3 ? 'hand crosses tray edge' : '',
    );
  },
};

/** K at the minimum: four number-path cards (wider than tall), every part in the area. */
export const PathCardsKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: pathCards, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // The whole path stays at the minimum (CMP.06's hint points at it). Its 21 unit ticks would
    // be ~5 px apart on cards this size, too close to read, so the card draws a compact path in
    // K-sized ink, its numeral beside it: its 10s (0, 10, 20: the largest step that divides 20)
    // ≥ 8 px apart, the mark's pointer over its own place.
    await expect(root).toHaveAttribute('data-cards', 'picture');
    await expectPathCards(root);
    await expectOrderFits(canvasElement, root, 'k');
    const m = await expectPaths(root);
    await expect(m.every).toBe(10);
    notePaths(canvasElement, m);
    noteInk(canvasElement, await expectPathInk(root));
  },
};

/**
 * Path cards: numeral tags ≥ 32 px inside the card, above the path (beside a compact path, never
 * on it), the path ≥ 16 px from the card's sides.
 */
async function expectPathCards(root: HTMLElement) {
  for (const c of root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')) {
    await expectTargetSize(c, 'k');
    const tag = c.querySelector('.ni-ord__tag') as HTMLElement;
    await expect(Number.parseFloat(getComputedStyle(tag).fontSize)).toBeGreaterThanOrEqual(32);
    const t = tag.getBoundingClientRect();
    const line = (c.querySelector('.ni-numberline') as SVGElement).getBoundingClientRect();
    const r = c.getBoundingClientRect();
    if (c.querySelector('[data-face="side"]')) {
      await expect(t.right).toBeLessThanOrEqual(line.left + 0.5);
      await expect(line.top).toBeGreaterThanOrEqual(r.top);
      await expect(r.right - line.right).toBeGreaterThanOrEqual(16 - 0.5);
      await expect(t.left - r.left).toBeGreaterThanOrEqual(16 - 0.5);
    } else {
      await expect(t.bottom).toBeLessThanOrEqual(line.top + 0.5);
    }
    await expect(line.left).toBeGreaterThanOrEqual(r.left);
    await expect(line.right).toBeLessThanOrEqual(r.right + 0.5);
    await expect(line.bottom).toBeLessThanOrEqual(r.bottom + 0.5);
  }
}

/**
 * The biggest numbers at the minimum: five three-digit cards (the top of CNT.09's range) in K at
 * 906 × 373, every numeral ≥ 32 px and inside its card, nothing clipped, no scroll.
 */
export const ThreeDigitFiveKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: { format: 'order', items: cards([997, 999, 995, 998, 996]), direction: 'asc' } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOrderFits(canvasElement, root, 'k');
    for (const c of root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')) {
      const numeral = c.querySelector('.ni-ord__numeral') as HTMLElement;
      await expect(Number.parseFloat(getComputedStyle(numeral).fontSize)).toBeGreaterThanOrEqual(
        32,
      );
      const n = numeral.getBoundingClientRect();
      const r = c.getBoundingClientRect();
      // Exact (no rounding): ≥ 80 px both ways; the numeral ≥ 16 px from the card's sides.
      await expect(r.width).toBeGreaterThanOrEqual(80);
      await expect(r.height).toBeGreaterThanOrEqual(80);
      await expect(n.left - r.left).toBeGreaterThanOrEqual(16);
      await expect(r.right - n.right).toBeGreaterThanOrEqual(16);
    }
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
    // Layout boxes (offset*), not drawn ones: the invite ring's pulse scales the card a little.
    const box = (el: HTMLElement) => [el.offsetTop, el.offsetLeft, el.offsetWidth, el.offsetHeight];
    const before = box(card(root, '8'));
    pathInvite.invite({ op: 'drag', args: { id: 'item-0', slot: 0 } });
    await expectInviteOn(root, card(root, '8'));
    await expect(root).toHaveAttribute('data-cards', 'picture');
    await expectPathCards(root);
    notePaths(canvasElement, await expectPaths(root));
    // The compact path's ink reads at K size (screen px), as on the tablet card.
    noteInk(canvasElement, await expectPathInk(root));
    await expectOrderFits(canvasElement, root, 'k');
    // Under the card, Pip's hand stays off its path (and off every cue mark).
    await expectHandOffInk(root);
    // The cards did not move or resize when Pip came in.
    const after = box(card(root, '8'));
    await expect(after).toEqual(before);
    await userEvent.click(card(root, '8'));
    await expectInviteOn(root, root.querySelector('[data-slot-pad="0"]') as HTMLElement);
    await expectOrderFits(canvasElement, root, 'k');
    // In the empty box, pointing down into it: off the cue's pebbles and arrow, off every path.
    await expectHandOffInk(root);
    // The picked-up card is lifted (raised, a little bigger, a deeper shadow) with no ring; the
    // invited box wears Pip's teal ring; the other open boxes show no ring: one ring on screen.
    const picked = card(root, '8');
    await expect(picked).toHaveAttribute('data-selected', 'true');
    picked.blur();
    await waitForSettled(picked);
    await expect(getComputedStyle(picked).outlineStyle).toBe('none');
    await expect(getComputedStyle(picked).transform).not.toBe('none');
    // Lifted, it stays ≥ 12 px inside the tray.
    const trayBox = contentBox(root.querySelector('.ni-ord__tray') as HTMLElement);
    const lifted = picked.getBoundingClientRect();
    await expect(lifted.top - (trayBox.top - 16)).toBeGreaterThanOrEqual(12 - 0.5);
    const invited = padOf(root, 1);
    await expect(getComputedStyle(invited).outlineColor).toBe(rgbOf(root, '--color-sea-deep'));
    await expect(getComputedStyle(invited).outlineWidth).toBe('5px');
    for (const n of [2, 3, 4]) {
      const pad = padOf(root, n);
      await expect(pad).toHaveAttribute('data-armed', 'true');
      await expect(getComputedStyle(pad).outlineColor).toBe('rgba(0, 0, 0, 0)');
    }
    await expectHandClear(root, invited);
  },
};

/**
 * Pip's hand (at rest, bob included) stays ≥ 12 px from every target but its own and from the
 * cue's pebbles and arrow, and ≥ 12 px inside the panel its control sits in (the board or the
 * tray), crossing no panel edge.
 */
async function expectHandClear(root: HTMLElement, el: HTMLElement, inPanel = true) {
  const loops = root
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
  for (const a of loops) {
    a.pause();
    a.currentTime = 0;
  }
  try {
    const h = (root.querySelector('.ni-hand svg') as SVGElement).getBoundingClientRect();
    // The tap bob moves the hand 6 px left and 8 px down.
    const reach = { left: h.left - 6, right: h.right, top: h.top, bottom: h.bottom + 8 };
    // ≥ 12 px from every other target (06 §4), and from the cue's pebbles and arrow.
    const others = [
      ...targets(root).filter((t) => t !== el),
      ...root.querySelectorAll('.ni-ord__pebble, .ni-ord__arrow, .ni-ord__arrowhead'),
    ];
    for (const t of others) {
      const r = t.getBoundingClientRect();
      const gap = Math.max(
        r.left - reach.right,
        reach.left - r.right,
        r.top - reach.bottom,
        reach.top - r.bottom,
      );
      await expect(
        gap,
        `the hand clear of ${t.getAttribute('aria-label') ?? t.getAttribute('class')}`,
      ).toBeGreaterThanOrEqual(12 - 0.5);
    }
    if (!inPanel) return;
    const panel = el.closest('.ni-ord__board, .ni-ord__tray') as HTMLElement;
    const p = panel.getBoundingClientRect();
    const bw = Number.parseFloat(getComputedStyle(panel).borderTopWidth);
    const inner = {
      left: p.left + bw,
      top: p.top + bw,
      right: p.right - bw,
      bottom: p.bottom - bw,
    };
    await expectInside(reach, inner, 12, 'the hand inside its panel');
  } finally {
    for (const a of loops) a.play();
  }
}

/** Portrait tablet (746 × 812): five K cards, the full cue, bigger cards. */
export const FiveCardsKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveUp },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.getAttribute('data-chrome')).not.toBe('compact');
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
    // Four cards across 746 px: the whole path on each, its ticks ≥ 8 px apart (the largest step
    // that divides the span when the unit ticks would crowd).
    await expect(root).toHaveAttribute('data-cards', 'picture');
    await expectPathCards(root);
    notePaths(canvasElement, await expectPaths(root));
  },
};

/** Tablet landscape (1226 × 493): five K cards, the full cue. */
export const FiveCardsKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveUp },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.getAttribute('data-chrome')).not.toBe('compact');
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
    await expectPathCards(root);
    // The tablet area has the width for every unit tick ≥ 8 px apart: all 21 are drawn. The card
    // size and pitch the label quotes are measured here.
    const m = await expectPaths(root);
    await expect(m.every).toBe(1);
    notePaths(canvasElement, m);
    // The tablet card's ink in screen px: the bar a compact path matches (TABLET_INK).
    const c = root.querySelector('.ni-ord__tray .ni-ord__card') as HTMLElement;
    const svg = c.querySelector('svg.ni-numberline') as SVGSVGElement;
    const s = svg.getBoundingClientRect().width / svg.width.baseVal.value;
    const px = (sel: string) =>
      Number.parseFloat(getComputedStyle(c.querySelector(sel) as Element).strokeWidth) * s;
    await expect(px('.ni-numberline__axis')).toBeCloseTo(TABLET_INK.track, 1);
    await expect(px('.ni-numberline__tick')).toBeCloseTo(TABLET_INK.tick, 1);
  },
};

/**
 * Tablet: dot cards use the room. A plain line of ten dots wraps into two rows of five (reading
 * order kept), so every card's dots draw big (one shared size).
 */
export const DotCardsKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: dotCards, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOrderFits(canvasElement, root, 'k');
    await expectPictureCards(root, 3, 'k');
    const ten = card(root, 'Picture 2');
    const dots = [...ten.querySelectorAll('.ni-objects__item')].map((d) =>
      d.getBoundingClientRect(),
    );
    await expect(dots).toHaveLength(10);
    await expect(new Set(dots.map((d) => Math.round(d.top))).size).toBe(2);
    for (const d of dots) await expect(d.width).toBeGreaterThanOrEqual(28);
  },
};

/** Tablet (G1): base-ten cards use the room, rods wide enough to count. */
export const BlockCardsTablet: Story = {
  args: { config: blockCards, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOrderFits(canvasElement, root, 'g1-up');
    await expectPictureCards(root, 3, 'g1-up');
    const rods = [...root.querySelectorAll('.ni-baseten__block--rod')].map((r) =>
      r.getBoundingClientRect(),
    );
    for (const r of rods) await expect(r.width).toBeGreaterThanOrEqual(10.5);
    await expect(new Set(rods.map((r) => Math.round(r.height))).size).toBe(1);
    // Every DRAWN picture (its rods and cubes, not its box) centred in its card: left and right
    // margins ≥ 16 px and within 2 px of each other (91's lone one leaves no empty column).
    const margins: string[] = [];
    for (const c of root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')) {
      const r = c.getBoundingClientRect();
      const drawn = [...c.querySelectorAll('.ni-baseten__block, .ni-baseten__unit')].map((b) =>
        b.getBoundingClientRect(),
      );
      const left = Math.min(...drawn.map((b) => b.left)) - r.left;
      const right = r.right - Math.max(...drawn.map((b) => b.right));
      await expect(left).toBeGreaterThanOrEqual(16);
      await expect(right).toBeGreaterThanOrEqual(16);
      await expect(
        Math.abs(left - right),
        `${c.getAttribute('aria-label')} centred`,
      ).toBeLessThanOrEqual(2);
      margins.push(`${Math.round(left)}/${Math.round(right)}`);
    }
    noteMeasure(canvasElement, 'margins', margins.join(', '));
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

/** MEA.01.t5-shaped (K): five unlabelled 0–11 ruler cards, longest first, at the minimum area. */
const fiveRulers: Config = {
  format: 'order',
  items: [10, 4, 7, 2, 9].map((v, i) => ({
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

/**
 * Five 0–11 ruler cards at the 960 × 600 minimum: compact paths. 11 has no step but 1 that
 * divides it, and unit ticks would crowd, so each path keeps every 5th tick (evenly spaced) and
 * both ends (0 and 11) as long ticks of their own, without the 10 that would crowd the 11; each
 * mark's pointer sits over its own value.
 * The ink reads at K size (screen px); everything fits, targets ≥ 80 px.
 */
export const RulerCardsKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: fiveRulers, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOrderFits(canvasElement, root, 'k');
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')];
    await expect(cards).toHaveLength(5);
    for (const c of cards) {
      await expectTargetSize(c, 'k');
      const at = (t: SVGLineElement) => Number(t.dataset.at);
      const centre = (t: Element) => {
        const r = t.getBoundingClientRect();
        return r.left + r.width / 2;
      };
      const ticks = [...c.querySelectorAll<SVGLineElement>('.ni-numberline__tick')];
      // Both ends, as long ticks.
      const first = ticks[0] as SVGLineElement;
      const last = ticks.at(-1) as SVGLineElement;
      await expect(at(first)).toBe(0);
      await expect(at(last)).toBe(11);
      await expect(last.dataset.rank).toBe('end');
      await expect(last.getBoundingClientRect().height).toBeGreaterThanOrEqual(
        first.getBoundingClientRect().height - 0.5,
      );
      // The grid (all but the extra end) evenly spaced, ≥ 8 px apart, on whole steps.
      const grid = ticks.filter((t) => t.dataset.rank !== 'end');
      const step = at(grid[1] as SVGLineElement) - at(grid[0] as SVGLineElement);
      const gap = centre(grid[1] as SVGLineElement) - centre(grid[0] as SVGLineElement);
      await expect(gap).toBeGreaterThanOrEqual(8);
      for (let i = 1; i < grid.length; i++) {
        await expect(at(grid[i] as SVGLineElement) - at(grid[i - 1] as SVGLineElement)).toBe(step);
        await expect(
          centre(grid[i] as SVGLineElement) - centre(grid[i - 1] as SVGLineElement),
        ).toBeCloseTo(gap, 1);
      }
      // No tick crowds another: every neighbouring pair (the end's own tick included) ≥ 8 px apart,
      // so the 10 beside the 11 is not drawn.
      for (let i = 1; i < ticks.length; i++) {
        await expect(
          centre(ticks[i] as SVGLineElement) - centre(ticks[i - 1] as SVGLineElement),
        ).toBeGreaterThanOrEqual(8);
      }
      // One scale: the end tick at 11 and the mark at its own value.
      const perUnit = gap / step;
      const x0 = centre(first);
      await expect(centre(last)).toBeCloseTo(x0 + 11 * perUnit, 0);
      const pointer = c.querySelector('.ni-numberline__pointer') as SVGPathElement;
      const mark = Number((pointer.closest('.ni-numberline__mark') as SVGGElement).dataset.at);
      await expect(centre(pointer)).toBeCloseTo(x0 + mark * perUnit, 0);
    }
    noteInk(canvasElement, await expectPathInk(root));
  },
};

/**
 * A card of objects names its thing on tap ("apple"; never how much it weighs): 06 §5 with
 * speak-on-tap on. No number is spoken for a picture.
 */
export const ObjectCardSpeaksOnTap: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: weightCards, tier: 'pictorial' },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(root.querySelector('.ni-ord__tray [data-card="item-0"]') as HTMLElement);
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.apple', undefined);
    await expect(audio.sayPhrases).not.toHaveBeenCalled();
  },
};

/** A placed numeral speaks again when it is tapped back to the tray; the undo is still traced. */
export const PlacedNumeralSpeaks: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(card(root, '6'));
    await userEvent.click(slot(root, 1));
    await waitFor(() => expect(placed(root)[0]).toBe('6'));
    clearSpies(audio);
    await userEvent.click(root.querySelector('[data-placed="item-1"]') as HTMLElement);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 6 }]);
    await waitFor(() => expect(placed(root)[0]).toBe(''));
    await expect(traceOf(args.onInteract).at(-1)).toMatchObject({ t: 'undo', target: 'item-1' });
  },
};

const twins: Config = {
  format: 'order',
  items: [
    { id: 'item-0', value: 2, label: '2' },
    { id: 'item-1', value: 1, label: '1' },
    { id: 'item-2', value: 2, label: '2' },
  ],
  direction: 'asc',
};
const twinsInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Cards of one value are interchangeable: with 1, 2, 2 in the boxes (the two 2s the other way
 * round from the model's own assignment) the row is right, so an answer invite shows no ring and
 * no hand.
 */
export const AnswerInviteEqualValues: Story = {
  args: { config: twins, demo: twinsInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const trayCard = (id: string) =>
      root.querySelector(`.ni-ord__tray [data-card="${id}"]`) as HTMLElement;
    await userEvent.click(trayCard('item-1'));
    await userEvent.click(slot(root, 1));
    // Partial row, the second "2" (item-2) picked up: the invite goes on with that card (its box
    // is ringed), never back to the other 2.
    await userEvent.click(trayCard('item-2'));
    twinsInvite.invite({ op: 'answer', args: { values: [1, 2, 2] } });
    await waitFor(() => expect(slot(root, 2)).toHaveClass('ni-invite'));
    await expect(trayCard('item-0')).not.toHaveClass('ni-invite');
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await userEvent.click(slot(root, 2));
    await userEvent.click(trayCard('item-0'));
    await userEvent.click(slot(root, 3));
    await waitFor(() => expect(placed(root)).toEqual(['1', '2', '2']));
    // The row is right with the 2s this way round: no ring, no hand.
    await waitFor(() => expect(root.querySelectorAll('.ni-invite')).toHaveLength(0));
    await expect(root.querySelector('.ni-invite-hand')).toBeNull();
    twinsInvite.invite(null);
  },
};

/**
 * A pinned numeral speaks when tapped (06 §5) and from the keyboard (it is a button: Tab reaches
 * it, Enter and Space activate it); it stays pinned and nothing is undone.
 */
export const PinnedNumeralSpeaks: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: decade },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const pinned = within(root).getByRole('button', { name: "30 can't move" });
    await userEvent.click(pinned);
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 30 }]);
    // Tab reaches it (sequential focus, not a scripted focus()): from the box before it.
    slot(root, 2).focus();
    await userEvent.tab();
    await expect(pinned).toHaveFocus();
    for (const key of ['{Enter}', ' ']) {
      clearSpies(audio);
      await userEvent.keyboard(key);
      await expect(pinned).toHaveFocus();
      await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 30 }]);
    }
    await expect(placed(root)).toEqual(['', '', '30', '']);
    await expect(args.onInteract).not.toHaveBeenCalled();
    pinned.blur();
  },
};

/**
 * While the widget is off (a demo, feedback) the pinned card is disabled like the other cards:
 * Tab skips it, a tap says nothing, and it looks the same (its own background, no shadow).
 */
export const PinnedNumeralDisabled: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: decade, disabled: true },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const pinned = within(root).getByRole('button', { name: "30 can't move" });
    await expect(pinned).toBeDisabled();
    const look = getComputedStyle(pinned);
    await expect(look.backgroundColor).toBe(rgbOf(root, '--color-pebble'));
    await expect(look.boxShadow).toBe('none');
    await expect(look.opacity).toBe('1');
    // Tab through the whole story: focus never lands on the pinned card.
    (document.activeElement as HTMLElement | null)?.blur();
    for (let i = 0; i < 12; i++) {
      await userEvent.tab();
      await expect(pinned).not.toHaveFocus();
    }
    await userEvent.click(pinned, { pointerEventsCheck: 0 });
    await expect(audio.sayPhrases).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/** The day's events in the order they happen (time.sequence `DAY_EVENTS`). */
const DAY = ['wake-up', 'breakfast', 'lunch', 'dinner', 'bedtime'];

/** TIM.08 (K): five pictures of the day, shuffled, to put in order from first to last. */
const dayEvents: Config = {
  format: 'order',
  items: ['lunch', 'bedtime', 'wake-up', 'dinner', 'breakfast'].map((event, i) => ({
    id: `item-${i}`,
    value: DAY.indexOf(event) + 1,
    stimulus: {
      kind: 'objects',
      set: { count: 1, sprite: `event-${event}`, layout: 'line', layoutSeed: 1 },
    },
  })),
  direction: 'asc',
};

/** TIM.08 in the workshop's tablet widget area: the five event cards, pictures at their K size. */
export const DailyEventsKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: dayEvents, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOrderFits(canvasElement, root, 'k');
    await expectPictureCards(root, 5, 'k');
  },
};

/**
 * TIM.08 at the 960 × 600 minimum (852 × 319): the five daily events as cards, each with its own
 * kit drawing (none falls back to the pebble), K targets and gaps, nothing scrolls. A tapped card
 * says its event.
 */
export const DailyEventsKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: dayEvents, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectOrderFits(canvasElement, root, 'k');
    await expectPictureCards(root, 5, 'k');
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-ord__tray .ni-ord__card')];
    const sprites = cards.map((c) => c.querySelector('[data-sprite]')?.getAttribute('data-sprite'));
    await expect(sprites).toEqual([
      'event-lunch',
      'event-bedtime',
      'event-wake-up',
      'event-dinner',
      'event-breakfast',
    ]);
    // Each is its own drawing: five different pictures (a pebble fallback would repeat).
    const drawings = cards.map((c) => c.querySelector('[data-sprite]')?.innerHTML);
    await expect(new Set(drawings).size).toBe(5);
    await userEvent.click(cards[2] as HTMLElement);
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.event-wake-up', undefined);
    await userEvent.click(cards[2] as HTMLElement);
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

/** FRA.08.t4's cards: each shows a part count and sorts by its piece size (24 ÷ parts). */
const partCounts: Config = {
  format: 'order',
  items: [
    { id: 'item-0', value: 12, label: '2' },
    { id: 'item-1', value: 3, label: '8' },
    { id: 'item-2', value: 6, label: '4' },
  ],
  direction: 'desc',
};

/**
 * A numeral card speaks the numeral it shows, not the value it sorts by (06 §5): the card showing
 * 2 says "two", never "twelve". The row is still ordered and reported by value.
 */
export const NumeralCardSpeaksWhatItShows: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  args: { config: partCounts, tier: 'abstract' },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    clearSpies(audio);
    await userEvent.click(card(root, '2'));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 2 }]);
    await userEvent.click(card(root, '8'));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 8 }]);
    await expect(audio.sayPhrases).not.toHaveBeenCalledWith([{ number: 12 }]);
    await expect(audio.sayPhrases).not.toHaveBeenCalledWith([{ number: 3 }]);
    (document.activeElement as HTMLElement | null)?.blur();
  },
};
