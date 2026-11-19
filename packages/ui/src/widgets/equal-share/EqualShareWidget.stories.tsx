import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { holdEnter } from '../../test-support/inviteStory';
import {
  center,
  clearSpies,
  pointerDrag,
  type SpyAudio,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  clickAt,
  enterNumber,
  expectAreaFit,
  expectNote,
  expectRing,
  expectTarget,
  extremes,
  goNext,
  inArea,
  namedStory,
  stepButton,
} from '../../test-support/twoStepStory';
import {
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `equal-share` (03 §5.5): share a basket of items fairly between pebblings or plates, one at a
 * time or a round at a time; what is left goes to the seagull. Two steps: build (deal), then ask
 * (a picture of the shares and the answer control). Every story runs in a workshop's widget area:
 * `landscapeMin` (906 × 373, the smallest) unless its name says tablet (1226 × 493).
 */

type Config = ConfigFor<'equal-share'>;

const base = {
  format: 'equal-share',
  sprite: 'shell',
  recipientsKind: 'pebbling',
  allowLeftover: false,
  ask: 'each',
} as const;

/** `each`: 12 shells between 3 pebblings (4 each). */
const each: Config = { ...base, items: 12, recipients: 3 };
/** `leftover`: 7 fish among 3 pebblings: 2 each, 1 for the seagull. */
const leftover: Config = {
  ...base,
  items: 7,
  recipients: 3,
  sprite: 'fish',
  allowLeftover: true,
  ask: 'leftover',
};
/** `fair-or-not`: 11 starfish pre-dealt on 4 plates, 3 + 3 + 2 + 3 (not fair). */
const fair: Config = {
  ...base,
  items: 11,
  recipients: 4,
  sprite: 'starfish',
  recipientsKind: 'plate',
  ask: 'fair-or-not',
  predealt: [3, 3, 2, 3],
};
/** `even-odd` (MUL.01): 7 leaves between 2 pebblings. */
const evenOdd: Config = {
  ...base,
  items: 7,
  recipients: 2,
  sprite: 'leaf',
  allowLeftover: true,
  ask: 'even-odd',
};
/** FRA.07.t2: 8 crabs pre-dealt 5 + 3 on two plates; make it fair and say how many each has. */
const fix: Config = {
  ...base,
  items: 8,
  recipients: 2,
  sprite: 'crab',
  recipientsKind: 'plate',
  predealt: [5, 3],
};
/** Kindergarten: 6 crabs between 2 pebblings. */
const kinder: Config = { ...base, items: 6, recipients: 2, sprite: 'crab' };
/** The bound: 24 things among 4 (SHARE_ITEMS_MAX, SHARE_RECIPIENTS_MAX). */
const bound: Config = { ...base, items: 24, recipients: 4, sprite: 'pebble' };
/** A recipient that can fill up: 12 between 2, room for 10 on each. */
const fillable: Config = { ...base, items: 12, recipients: 2, sprite: 'fish' };

const meta = {
  title: 'Widgets/Equal share',
  args: {
    config: each as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { audio: spyAudio() } },
  decorators: [namedStory],
  render: inArea('landscapeMin'),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-esw';

// ---------- helpers ----------

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const spot = (root: HTMLElement) => q(root, '.ni-esw__spot');
const take = (root: HTMLElement) => q(root, '[data-place-item="pile-0"]');
const recipient = (root: HTMLElement, i: number) => q(root, `[data-place-target="recipient-${i}"]`);
/** The recipient cards: each is one target (its drop pad, and its mat as the handle). */
const cards = (root: HTMLElement) => all(root, '.ni-esw__rec');
const handle = (root: HTMLElement, i: number) => q(root, `[data-cue="take-${i}"]`);
const hit = (root: HTMLElement, i: number) => q(handle(root, i), '.ni-esw__hit');
const basket = (root: HTMLElement) => q(root, '[data-place-target="pile"]');
const dealRound = (root: HTMLElement) => q(root, '[data-action="deal-round"]');
const bird = (root: HTMLElement) => q(root, 'button.ni-esw__bird');
const gullItems = (root: HTMLElement) => q(root, 'button.ni-esw__gull-items');
const option = (root: HTMLElement, id: string) => q(root, `[data-id="opt-${id}"]`);
const audioOf = (parameters: { ui?: { audio?: unknown } }) => parameters.ui?.audio as SpyAudio;

/** What the picture shows: the items at each recipient, in the basket and by the seagull. */
function shown(root: HTMLElement) {
  return {
    shares: all(root, '.ni-esw__rec').map((r) => r.querySelectorAll('[data-item]').length),
    pile:
      root.querySelectorAll('.ni-esw__pile .ni-esw__item').length +
      root.querySelectorAll('.ni-esw__take').length,
    seagull: root.querySelectorAll('[data-gull-item]').length,
  };
}
async function expectShown(
  root: HTMLElement,
  want: { shares: number[]; pile: number; seagull?: number },
) {
  await waitFor(() => expect(shown(root)).toEqual({ seagull: 0, ...want }));
}

const state = (value: Record<string, unknown>) => ({ kind: 'state', value });
const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const steps = (args: { onInteract?: unknown }) =>
  traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);

/** Every item is its own cell: no two items overlap, and none is under 20 px. */
async function expectItemsApart(root: HTMLElement) {
  const rects = all(root, '.ni-esw__item, .ni-esw__take-sprite').map((el) =>
    el.getBoundingClientRect(),
  );
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i] as DOMRect;
    await expect(Math.round(a.width), `item ${i} size`).toBeGreaterThanOrEqual(20);
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j] as DOMRect;
      const apart =
        a.right <= b.left + 0.5 ||
        b.right <= a.left + 0.5 ||
        a.bottom <= b.top + 0.5 ||
        b.bottom <= a.top + 0.5;
      await expect(apart, `items ${i} and ${j} apart`).toBe(true);
    }
  }
}

/** Every item in the widget is drawn at one size (one scale within a screen). */
async function expectOneScale(root: HTMLElement) {
  const sizes = new Set(
    all(root, '.ni-esw__item, .ni-esw__take-sprite').map((el) =>
      Math.round(el.getBoundingClientRect().width),
    ),
  );
  await expect(sizes.size, `item sizes ${[...sizes].join(', ')}`).toBeLessThanOrEqual(1);
}

/** The build step's controls and parts, for `expectAreaFit`. */
const buildFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => ({
  ageMode,
  story,
  controls: {
    'take-one spot': [spot(root)],
    'give one to each': [dealRound(root)],
    recipients: cards(root),
    seagull: [bird(root)],
    next: [stepButton(root, 'next')],
  },
  parts: [q(root, '.ni-esw__basket'), q(root, '.ni-esw__nest')],
});

/** The ask step's controls and parts, for `expectAreaFit`. */
const askFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => {
  const back = stepButton(root, 'back');
  return {
    ageMode,
    story,
    controls: {
      answer: all(root, '.ni-entry button, .ni-stepper button, .ni-esw__options button'),
      ...(back ? { back: [back] } : {}),
      check: [stepButton(root, 'check')],
    },
    parts: all(root, '.ni-esw__picture, .ni-entry, .ni-stepper, .ni-esw__options'),
  };
};

async function dealRounds(root: HTMLElement, n: number) {
  for (let i = 0; i < n; i += 1) await userEvent.click(dealRound(root));
}

// ---------- the two steps in the two areas ----------

/** Tablet (1226 × 493): the basket, three pebblings, the seagull and Next, all in view. */
export const TabletBuild: Story = {
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { shares: [0, 0, 0], pile: 12 });
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-share tablet build'));
    await expectOneScale(root);
  },
};

/** The smallest area (906 × 373): the same parts, every control at full size, nothing scrolls. */
export const LandscapeMinBuild: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-share 906x373 build'));
    await expectItemsApart(root);
    await expectOneScale(root);
    // Nothing on screen counts the items.
    await expect(root.textContent ?? '').not.toMatch(/\d/);
  },
};

/** The ask step in the smallest area: the shares as a picture, the answer control, Back, Check. */
export const LandscapeMinAsk: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 4);
    await goNext(root);
    await expectShown(root, { shares: [4, 4, 4], pile: 0 });
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'equal-share 906x373 ask'),
      minFill: 0.5,
    });
    await expect(stepButton(root, 'check')).toBeDisabled();
    await enterNumber(root, 4);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [4, 4, 4], leftover: 0, value: 4 }),
    );
  },
};

/** The ask step on the tablet. */
export const TabletAsk: Story = {
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 4);
    await goNext(root);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'equal-share tablet ask'),
      minFill: 0.5,
    });
  },
};

// ---------- the three ways to deal ----------

/** Mouse drag: the take-one spot's shell onto the second pebbling. */
export const DragToRecipient: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(take(root), center(recipient(root, 1)), 'mouse', 10);
    await expectShown(root, { shares: [0, 1, 0], pile: 11 });
    await expect(steps(args)).toEqual(['drag:pile', 'drop:recipient-1']);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Touch drag (a finger on a tablet). */
export const TouchDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(take(root), center(recipient(root, 2)), 'touch', 10);
    await expectShown(root, { shares: [0, 0, 1], pile: 11 });
    await expect(steps(args)).toEqual(['drag:pile', 'drop:recipient-2']);
  },
};

/** Tap to place: tap the spot (its name is spoken), then a pebbling. */
export const TapToPlace: Story = {
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    clearSpies(audio);
    await userEvent.click(take(root));
    await expect(said(audio)).toEqual(['ui.sprite.shell']);
    await userEvent.click(recipient(root, 0));
    await expectShown(root, { shares: [1, 0, 0], pile: 11 });
    // An empty pebbling, touched with nothing held, says what it is.
    clearSpies(audio);
    await userEvent.click(recipient(root, 2));
    await expect(said(audio)).toEqual(['ui.widget.es.kind.pebbling']);
    await expect(steps(args)).toEqual(['tap:pile', 'tap:recipient-0', 'tap:recipient-2']);
  },
};

/** Keyboard: Enter picks the shell up, the arrows choose a pebbling, Enter puts it down. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    take(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(recipient(root, 0)).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    await expectShown(root, { shares: [0, 1, 0], pile: 11 });
    // Escape puts a picked-up shell down again.
    take(root).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    await expect(take(root)).toHaveAttribute('aria-pressed', 'false');
    await expectShown(root, { shares: [0, 1, 0], pile: 11 });
    await expect(steps(args)).toEqual(['tap:pile', 'tap:recipient-1', 'tap:pile']);
  },
};

/** "Give one to each" deals a round; the whole task ends in the checked response. */
export const DealRoundsAndCheck: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(dealRound(root));
    await expectShown(root, { shares: [1, 1, 1], pile: 9 });
    await dealRounds(root, 3);
    await expectShown(root, { shares: [4, 4, 4], pile: 0 });
    await expect(dealRound(root)).toBeDisabled();
    await goNext(root);
    await enterNumber(root, 4);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [4, 4, 4], leftover: 0, value: 4 }),
    );
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

// ---------- undo: touch the thing where it sits ----------

/**
 * A pebbling's mat is the handle of its last shell (a full target): drag it back to the basket,
 * or tap it and tap the basket.
 */
export const TakeBack: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 2);
    await expectShown(root, { shares: [2, 2, 2], pile: 6 });
    await expectTarget(hit(root, 0), 'g1-up', 'the take-back hit area');
    (args.onInteract as ReturnType<typeof fn>).mockClear();
    await pointerDrag(handle(root, 0), center(basket(root)), 'mouse', 10);
    await expectShown(root, { shares: [1, 2, 2], pile: 7 });
    await userEvent.click(handle(root, 1));
    await userEvent.click(basket(root));
    await expectShown(root, { shares: [1, 1, 2], pile: 8 });
    await expect(steps(args)).toEqual(['drag:item-0-1', 'drop:pile', 'tap:item-1-1', 'tap:pile']);
  },
};

/** A shell moves straight from one pebbling to another, by keyboard too. */
export const MoveBetweenRecipients: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 2);
    await userEvent.click(handle(root, 2));
    await userEvent.click(recipient(root, 0));
    await expectShown(root, { shares: [3, 2, 1], pile: 6 });
    // By keyboard: Enter picks the last shell up and moves the focus to a place for it.
    handle(root, 0).focus();
    await userEvent.keyboard('{Enter}');
    await expect(document.activeElement?.getAttribute('data-place-target')).not.toBeNull();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(shown(root).shares[0]).toBe(2));
    await expect(shown(root).pile + shown(root).shares.reduce((a, b) => a + b, 0)).toBe(12);
  },
};

/**
 * A held shell goes to the pebbling that is tapped, wherever on its card the tap lands: the
 * take-back handle never takes a tap meant for giving (every corner and the middle of a card
 * that already holds shells).
 */
export const HeldItemLandsAnywhereOnTheCard: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 1);
    let want = 1;
    for (const at of extremes(recipient(root, 1), 12)) {
      await userEvent.click(take(root));
      await clickAt(at.x, at.y);
      want += 1;
      await expectShown(root, { shares: [1, want, 1], pile: 12 - 2 - want });
    }
  },
};

/** The seagull takes only the true leftover, and gives it back when its shells are touched. */
export const SeagullGivesBack: Story = {
  args: { config: leftover },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 2);
    await expectShown(root, { shares: [2, 2, 2], pile: 1 });
    await userEvent.click(bird(root));
    await expectShown(root, { shares: [2, 2, 2], pile: 0, seagull: 1 });
    await expectTarget(gullItems(root), 'g1-up', "the seagull's items");
    await userEvent.click(gullItems(root));
    await expectShown(root, { shares: [2, 2, 2], pile: 1 });
    await expect(steps(args).slice(-2)).toEqual(['tap:seagull', 'tap:seagull-items']);
  },
};

// ---------- limits: said, shown, and one ring on what to do next ----------

/** A full pebbling takes no more: the note says so and its mat (take one back) is ringed. */
export const FullRecipientNote: Story = {
  args: { config: fillable },
  play: async ({ canvasElement, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 10; i += 1) {
      await userEvent.click(take(root));
      await userEvent.click(recipient(root, 0));
    }
    await expectShown(root, { shares: [10, 0], pile: 2 });
    await expectNote(root, null);
    await expect(dealRound(root)).toBeDisabled();
    clearSpies(audio);
    await userEvent.click(take(root));
    await userEvent.click(recipient(root, 0));
    await expectShown(root, { shares: [10, 0], pile: 2 });
    await expectNote(root, 'This one is full');
    await expect(said(audio)).toContain('ui.widget.es.note.full');
    await expectRing(root, hit(root, 0));
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-share full recipient'));
    // The next step clears the note.
    await userEvent.click(handle(root, 0));
    await expectNote(root, null);
  },
};

/** The last shell leaves the basket: the note says it is empty; fair shares ring Next. */
export const EmptyBasketNote: Story = {
  play: async ({ canvasElement, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 3);
    clearSpies(audio);
    await userEvent.click(dealRound(root));
    await expectNote(root, 'The basket is empty');
    await expect(said(audio)).toEqual(['ui.widget.es.why.empty']);
    await expectRing(root, stepButton(root, 'next'));
  },
};

/** An empty basket with unfair shares rings the mat that holds the most, never Next. */
export const EmptyBasketUnfair: Story = {
  args: { config: { ...each, items: 4, allowLeftover: true } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(dealRound(root));
    await userEvent.click(take(root));
    await userEvent.click(recipient(root, 1));
    await expectShown(root, { shares: [1, 2, 1], pile: 0 });
    await expectNote(root, 'The basket is empty');
    await expectRing(root, hit(root, 1));
    // Touching the empty basket says it again.
    await userEvent.click(handle(root, 1));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(basket(root));
    await expectNote(root, 'The basket is empty');
  },
};

/** The seagull says why it takes nothing yet, and the ring shows what to do instead. */
export const SeagullNotYet: Story = {
  args: { config: leftover },
  play: async ({ canvasElement, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    clearSpies(audio);
    await userEvent.click(bird(root));
    await expectNote(root, 'Each one can have more');
    await expect(said(audio)).toEqual(['ui.widget.es.why.round']);
    await expectRing(root, dealRound(root));
    await expectShown(root, { shares: [0, 0, 0], pile: 7 });
    await dealRounds(root, 2);
    await userEvent.click(take(root));
    await userEvent.click(recipient(root, 0));
    await userEvent.click(handle(root, 1));
    await userEvent.click(basket(root));
    await expectShown(root, { shares: [3, 1, 2], pile: 1 });
    await userEvent.click(bird(root));
    await expectNote(root, 'They do not have the same');
    await expectRing(root, hit(root, 0));
    await expectShown(root, { shares: [3, 1, 2], pile: 1 });
  },
};

// ---------- the other asks ----------

/** `leftover`: deal, give the seagull the rest, then type how many were left. */
export const Leftover: Story = {
  args: { config: leftover },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 2);
    await userEvent.click(bird(root));
    await expectNote(root, 'The basket is empty');
    await expectRing(root, stepButton(root, 'next'));
    await goNext(root);
    await expectShown(root, { shares: [2, 2, 2], pile: 0, seagull: 1 });
    await enterNumber(root, 1);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [2, 2, 2], leftover: 1, value: 1 }),
    );
  },
};

/** `fair-or-not`: a pre-dealt share is a picture; pick "Not fair" and check. */
export const FairOrNot: Story = {
  args: { config: fair },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-step', 'ask');
    await expectShown(root, { shares: [3, 3, 2, 3], pile: 0 });
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'equal-share fair-or-not'),
      minFill: 0.5,
    });
    await expectOneScale(root);
    clearSpies(audio);
    await userEvent.click(option(root, 'no'));
    await expect(said(audio)).toEqual(['ui.widget.es.opt.no']);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'no' });
    await expect(steps(args)).toEqual(['tap:opt-no']);
  },
};

/** `even-odd`: share between two, then say whether the number is even or odd. */
export const EvenOdd: Story = {
  args: { config: evenOdd },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 3);
    await expectShown(root, { shares: [3, 3], pile: 1 });
    await goNext(root);
    await userEvent.click(option(root, 'odd'));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'odd' });
  },
};

/** FRA.07.t2: an unfair pre-dealt pair; move one from the plate with more, then type each. */
export const FixUnfairShare: Story = {
  args: { config: fix },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { shares: [5, 3], pile: 0 });
    // Nothing is said or ringed before the child has done anything.
    await expectNote(root, null);
    await expectRing(root, null);
    await pointerDrag(handle(root, 0), center(recipient(root, 1)), 'touch', 10);
    await expectShown(root, { shares: [4, 4], pile: 0 });
    await goNext(root);
    await enterNumber(root, 4);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [4, 4], leftover: 0, value: 4 }),
    );
  },
};

// ---------- kindergarten mode ----------

/** Kindergarten: 6 crabs between 2 pebblings; 80 px targets in the smallest area. */
export const KindergartenBuild: Story = {
  globals: { ageMode: 'k' },
  args: { config: kinder },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, buildFit(root, 'k', 'equal-share K 906x373 build'));
    await userEvent.click(take(root));
    await userEvent.click(recipient(root, 0));
    await expectTarget(hit(root, 0), 'k', 'the take-back hit area');
  },
};

/** Kindergarten ask step: the picture and the numeral cards (or the stepper), 80 px targets. */
export const KindergartenAsk: Story = {
  globals: { ageMode: 'k' },
  args: { config: kinder },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 3);
    await goNext(root);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'k', 'equal-share K 906x373 ask'),
      minFill: 0.5,
    });
    await enterNumber(root, 3);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [3, 3], leftover: 0, value: 3 }),
    );
  },
};

// ---------- stress: the bound, in the smallest area ----------

/** 24 things among 4 (the model's bound): everything fits, 20 px items that never touch. */
export const StressAtBoundBuild: Story = {
  args: { config: bound },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { shares: [0, 0, 0, 0], pile: 24 });
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-share 24 among 4 build'));
    await expectItemsApart(root);
    await dealRounds(root, 6);
    await expectShown(root, { shares: [6, 6, 6, 6], pile: 0 });
    await expectItemsApart(root);
    await expectOneScale(root);
    await expectTarget(hit(root, 3), 'g1-up', 'the take-back hit area');
  },
};

/** The bound's ask step: the four shares as a legible picture beside the answer control. */
export const StressAtBoundAsk: Story = {
  args: { config: bound },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await dealRounds(root, 6);
    await goNext(root);
    await expectShown(root, { shares: [6, 6, 6, 6], pile: 0 });
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'equal-share 24 among 4 ask'),
      minFill: 0.5,
    });
    await expectItemsApart(root);
    await enterNumber(root, 6);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [6, 6, 6, 6], leftover: 0, value: 6 }),
    );
  },
};

/** The fullest a recipient gets: 24 between 2 plates, 15 on one of them (SHARE_ZONE_MAX). */
export const StressFullestZone: Story = {
  args: { config: { ...bound, recipients: 2, recipientsKind: 'plate' } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 15; i += 1) {
      await userEvent.click(take(root));
      await userEvent.click(recipient(root, 0));
    }
    await expectShown(root, { shares: [15, 0], pile: 9 });
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-share 15 on one plate'));
    await expectItemsApart(root);
  },
};

// ---------- steps, disabled, demo ----------

/** Next and Back hand the focus to each other; a held Enter steps once. */
export const HeldEnterStepsOnce: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    stepButton(root, 'next').focus();
    await holdEnter(stepButton(root, 'next'), 4, async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    await expect(root).toHaveAttribute('data-step', 'ask');
    await expect(stepButton(root, 'back')).toHaveFocus();
    await expect(steps(args)).toEqual(['tap:next']);
    await userEvent.click(stepButton(root, 'back'));
    await expect(root).toHaveAttribute('data-step', 'build');
  },
};

/** Disabled: nothing moves and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(dealRound(root)).toBeDisabled();
    await expect(bird(root)).toBeDisabled();
    await expect(stepButton(root, 'next')).toBeDisabled();
    await userEvent.click(take(root));
    await userEvent.click(recipient(root, 0));
    await pointerDrag(take(root), center(recipient(root, 1)), 'mouse');
    await expectShown(root, { shares: [0, 0, 0], pile: 12 });
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoPlay: WidgetDemo = createDemoController({ strict: true });
/** Demo play: the guide deals, gives the seagull the rest and enters the answer. */
export const DemoPlay: Story = {
  args: { config: leftover, demo: demoPlay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoPlay.play({ op: 'deal', args: { to: 1, count: 2 } });
    await expectShown(root, { shares: [0, 2, 0], pile: 5 });
    await demoPlay.play({ op: 'deal', args: { to: 1, count: -2 } });
    await demoPlay.play({ op: 'deal-round' });
    await demoPlay.play({ op: 'deal-round' });
    await expectShown(root, { shares: [2, 2, 2], pile: 1 });
    await demoPlay.play({ op: 'set-aside-leftover' });
    await expectShown(root, { shares: [2, 2, 2], pile: 0, seagull: 1 });
    // The answer is entered on the ask step, which the demo opens.
    await demoPlay.play({ op: 'answer', args: { value: 1 } });
    await expect(root).toHaveAttribute('data-step', 'ask');
    await expect(args.onInteract).not.toHaveBeenCalled();
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [2, 2, 2], leftover: 1, value: 1 }),
    );
  },
};

const demoChoice: WidgetDemo = createDemoController({ strict: true });
/** Demo `answer {id}`: the guide picks "Not fair" on the pre-dealt plates. */
export const DemoPlayChoice: Story = {
  args: { config: fair, demo: demoChoice },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoChoice.play({ op: 'answer', args: { id: 'no' } });
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'no' });
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });
/**
 * Demo invite in the smallest area: one ring, on the take-one spot, with the demonstration hand
 * on it; the whole task stays in view.
 */
export const DemoInviteLandscapeMin: Story = {
  args: { config: leftover, demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    demoInvite.invite({ op: 'deal', args: { to: 1 } });
    await expectRing(root, spot(root));
    await waitFor(() => expect(hand()).not.toBeNull());
    await expectPointerOn(hand(), spot(root), root);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'equal-share invite'));
  },
};

const demoInvites: WidgetDemo = createDemoController({ strict: true });
/** Each invite rings exactly one control: the round button, the seagull, Next, then the answer. */
export const DemoInviteEachControl: Story = {
  args: { config: leftover, demo: demoInvites },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    demoInvites.invite({ op: 'deal-round' });
    await expectRing(root, dealRound(root));
    await waitFor(() => expectPointerOn(hand(), dealRound(root), root));
    demoInvites.invite({ op: 'set-aside-leftover' });
    await expectRing(root, bird(root));
    // The answer is on the next step: the invite points at Next, then at the numeral.
    demoInvites.invite({ op: 'answer', args: { value: 1 } });
    await expectRing(root, stepButton(root, 'next'));
    await goNext(root);
    demoInvites.invite({ op: 'answer', args: { value: 1 } });
    await waitFor(() => expect(root.querySelectorAll('.ni-invite')).toHaveLength(1));
    await expect(root.querySelector('.ni-entry .ni-invite, .ni-stepper .ni-invite')).not.toBeNull();
    // The child's own step clears the invite.
    await enterNumber(root, 1);
    await expectRing(root, null);
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

const demoUnsupported: WidgetDemo = createDemoController({ strict: true });
/** An op equal-share doesn't define throws UnsupportedWidgetOpError in development. */
export const DemoUnsupportedOp: Story = {
  args: { demo: demoUnsupported },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(demoUnsupported.play({ op: 'fill-group' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const demoReduced: WidgetDemo = createDemoController({ strict: true });
/** Reduced motion: ops are instant; the changed items are highlighted, then back to normal. */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: leftover, demo: demoReduced },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const round = demoReduced.play({ op: 'deal-round' });
    await waitFor(() => expect(all(root, '.ni-esw__item[data-flash="true"]')).toHaveLength(3));
    await round;
    await expectShown(root, { shares: [1, 1, 1], pile: 4 });
    await expect(all(root, '[data-flash="true"]')).toHaveLength(0);
    await expect(getComputedStyle(q(root, '.ni-esw__figure')).animationName).toBe('none');
  },
};
