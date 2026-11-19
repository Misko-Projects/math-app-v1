import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  type SpyAudio,
  spyAudio,
  touchDragAndHold,
  waitForSettled,
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
 * `equal-share` (03 §5.5): share a basket of items fairly between pebblings or plates, one at a
 * time or a round at a time; what is left goes to the seagull. The child types each share or the
 * leftover, judges a pre-dealt share fair or not, or says whether a number is even or odd. Nothing
 * on screen counts the items.
 */

type Config = ConfigFor<'equal-share'>;

/** G1 `each`: 12 shells between 3 pebblings (4 each). */
const each: Config = {
  format: 'equal-share',
  items: 12,
  recipients: 3,
  sprite: 'shell',
  recipientsKind: 'pebbling',
  allowLeftover: false,
  ask: 'each',
};
/** `leftover`: 7 fish among 3 pebblings: 2 each, 1 for the seagull. */
const leftover: Config = {
  format: 'equal-share',
  items: 7,
  recipients: 3,
  sprite: 'fish',
  recipientsKind: 'pebbling',
  allowLeftover: true,
  ask: 'leftover',
};
/** `fair-or-not`: 11 starfish pre-dealt on 4 plates, 3 + 3 + 2 + 3 (not fair). */
const fair: Config = {
  format: 'equal-share',
  items: 11,
  recipients: 4,
  sprite: 'starfish',
  recipientsKind: 'plate',
  allowLeftover: false,
  ask: 'fair-or-not',
  predealt: [3, 3, 2, 3],
};
/** `even-odd` (MUL.01): 7 leaves between 2 pebblings. */
const evenOdd: Config = {
  format: 'equal-share',
  items: 7,
  recipients: 2,
  sprite: 'leaf',
  recipientsKind: 'pebbling',
  allowLeftover: true,
  ask: 'even-odd',
};
/** K: 6 crabs between 2 pebblings, big and chunky. */
const buildK: Config = {
  format: 'equal-share',
  items: 6,
  recipients: 2,
  sprite: 'crab',
  recipientsKind: 'pebbling',
  allowLeftover: false,
  ask: 'each',
};
/** Stress: 24 counters among 6 plates. */
const stress24: Config = {
  format: 'equal-share',
  items: 24,
  recipients: 6,
  sprite: 'counter',
  recipientsKind: 'plate',
  allowLeftover: false,
  ask: 'each',
};

const meta = {
  title: 'Widgets/Equal share',
  args: {
    config: each as WidgetConfig,
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

const ROOT = '.ni-esw';

// ---------- helpers ----------

const recipient = (root: HTMLElement, i: number) =>
  root.querySelector(`[data-place-target="recipient-${i}"]`) as HTMLElement;
const basket = (root: HTMLElement) =>
  root.querySelector('[data-place-target="pile"]') as HTMLElement;
const pileItem = (root: HTMLElement, j = 0) =>
  root.querySelector(`[data-place-item="pile-${j}"]`) as HTMLElement;
const item = (root: HTMLElement, i: number, j: number) =>
  root.querySelector(`[data-place-item="item-${i}-${j}"]`) as HTMLElement;
const dealRound = (root: HTMLElement) =>
  root.querySelector('[data-action="deal-round"]') as HTMLButtonElement;
const give = (root: HTMLElement) =>
  root.querySelector('[data-action="seagull"]') as HTMLButtonElement;
const bird = (root: HTMLElement) => root.querySelector('.ni-esw__bird') as HTMLButtonElement;
const reason = (root: HTMLElement) => root.querySelector('.ni-esw__reason') as HTMLElement;
const padKey = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const checkButton = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const option = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-id="opt-${id}"]`) as HTMLElement;

/** What the picture shows: the items at each recipient, in the basket and by the seagull. */
function shown(root: HTMLElement) {
  const recs = [...root.querySelectorAll<HTMLElement>('.ni-esw__rec')];
  return {
    shares: recs.map((r) => r.querySelectorAll('.ni-esw__item').length),
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

async function typeOnPad(root: HTMLElement, digits: string) {
  for (const d of digits) await userEvent.click(padKey(root, d));
}

/** Nothing in the widget (pad aside) states these numbers: no text, name, title or data value. */
async function expectNothingStates(root: HTMLElement, forbidden: number[]) {
  const pad = root.querySelector('.ni-pad');
  const scope = [...root.querySelectorAll('*')].filter((el) => !pad?.contains(el));
  const words = [
    ...scope.filter((el) => el.children.length === 0).map((el) => el.textContent ?? ''),
    ...scope.map((el) => el.getAttribute('aria-label') ?? ''),
    ...scope.map((el) => el.getAttribute('title') ?? ''),
  ].join(' ');
  const numbers = new Set((words.match(/\d+/g) ?? []).map(Number));
  for (const f of forbidden) await expect(numbers.has(f), `${f} shown`).toBe(false);
  for (const el of scope) {
    for (const a of el.getAttributeNames()) {
      if (!a.startsWith('data-')) continue;
      await expect(forbidden.map(String), `${a}="${el.getAttribute(a)}"`).not.toContain(
        el.getAttribute(a),
      );
    }
  }
}

/** Every item is its own cell: no two items overlap anywhere in the widget. */
async function expectItemsApart(root: HTMLElement) {
  const rects = [...root.querySelectorAll<HTMLElement>('.ni-esw__item, .ni-esw__take-sprite')].map(
    (el) => el.getBoundingClientRect(),
  );
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i] as DOMRect;
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

/** Every countable item is drawn at one size, at least `min` px. */
async function expectItemSize(root: HTMLElement, min: number) {
  const els = [...root.querySelectorAll<HTMLElement>('.ni-esw__item, .ni-esw__take-sprite')];
  for (const el of els) await waitForSettled(el);
  const sizes = new Set(els.map((el) => Math.round(el.getBoundingClientRect().width)));
  await expect(sizes.size, 'one item size').toBe(1);
  await expect([...sizes][0]).toBeGreaterThanOrEqual(min);
}

/**
 * The widget fits its stage with no scrolling: the stage stays within the tablet's 720 px, the
 * widget's scroll size equals its client size, and every drawn part lies inside the widget.
 */
async function expectFits(canvasElement: HTMLElement, root: HTMLElement) {
  const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
  await expect(stage.getBoundingClientRect().height).toBeLessThanOrEqual(720);
  await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth);
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight);
  await expect(root.dataset.fits).toBeUndefined();
  const box = root.getBoundingClientRect();
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const name = `${el.getAttribute('class') ?? el.tagName}`;
    await expect(r.left, `${name} left`).toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(r.right, `${name} right`).toBeLessThanOrEqual(box.right + 0.5);
    await expect(r.top, `${name} top`).toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(r.bottom, `${name} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
  }
}

async function expectBigNumerals(els: Element[]) {
  for (const el of els) {
    await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(32);
  }
}

// ---------- each ----------

/**
 * Evidence, START (G1 `each`): 12 shells wait in the basket, one on the take-one spot; three
 * pebblings sit behind empty mats. The seagull's button is off and says why ("Each one can have
 * more"). The answer blank is empty and Check is off. No count anywhere.
 */
export const EachStart: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { shares: [0, 0, 0], pile: 12 });
    await expect(give(root)).toBeDisabled();
    await expect(reason(root)).toHaveAttribute('aria-label', 'Each one can have more');
    await expect(within(root).getAllByText('Each one can have more')[0]).toBeVisible();
    await expect(dealRound(root)).toBeEnabled();
    await expect(checkButton(root)).toBeDisabled();
    await expect(within(root).getByRole('group', { name: 'How many for each?' })).toBeVisible();
    await expectNothingStates(root, [12, 4, 3]);
    // The take-one spot is a full-size target, though its shell is drawn at the items' size.
    await expectTargetSize(pileItem(root), 'g1-up');
    await expectItemsApart(root);
    await expectItemSize(root, 34);
    await expectFits(canvasElement, root);
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

/**
 * Evidence, IN PROGRESS: one round dealt with "Give one to each", then one more shell tapped onto
 * the first pebbling. Still no counts; the shares are not equal, and the seagull's reason says
 * each one can have more.
 */
export const EachInProgress: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(dealRound(root));
    await expectShown(root, { shares: [1, 1, 1], pile: 9 });
    await userEvent.click(pileItem(root));
    await userEvent.click(recipient(root, 0));
    await expectShown(root, { shares: [2, 1, 1], pile: 8 });
    await expect(give(root)).toBeDisabled();
    await expectNothingStates(root, [12, 4, 3]);
    await expectItemsApart(root);
    await expect(steps(args)).toEqual(['tap:deal-round', 'tap:pile', 'tap:recipient-0']);
    await expectFits(canvasElement, root);
  },
};

/**
 * Evidence, FINISHED (G1 `each`): four rounds dealt, the basket empty (the seagull's reason: "The
 * basket is empty"), 4 typed. Check sends the shares, the leftover and the typed value.
 */
export const EachFinished: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let k = 0; k < 4; k++) await userEvent.click(dealRound(root));
    await expectShown(root, { shares: [4, 4, 4], pile: 0 });
    await expect(dealRound(root)).toBeDisabled();
    await expect(reason(root)).toHaveAttribute('aria-label', 'The basket is empty');
    await typeOnPad(root, '4');
    await expect(root.querySelector('.ni-esw__blank')).toHaveAttribute(
      'aria-label',
      'Your answer: 4',
    );
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [4, 4, 4], leftover: 0, value: 4 }),
    );
    // G1 sizes: the controls are ≥ 64 px and ≥ 12 px apart; the blank's numeral is ≥ 32 px.
    const targets = [dealRound(root), give(root), bird(root), checkButton(root)];
    for (const el of targets) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(targets);
    for (const i of [0, 1, 2]) await expectTargetSize(recipient(root, i), 'g1-up');
    await expectTargetGaps([0, 1, 2].map((i) => recipient(root, i)));
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const key of keys) await expectTargetSize(key, 'g1-up');
    await expectTargetGaps([...keys, checkButton(root)]);
    await expectBigNumerals([root.querySelector('.ni-esw__blank') as Element]);
    // From G1 the controls show their words beside the icons.
    await expect(within(root).getByText('Give one to each')).toBeVisible();
    await expectItemsApart(root);
    await expectFits(canvasElement, root);
  },
};

/**
 * `leftover` (7 among 3): two rounds leave one fish. The seagull's button comes on; giving it hops
 * the fish to the seagull. Type 1; Check sends `{ shares: [2, 2, 2], leftover: 1, value: 1 }`.
 */
export const Leftover: Story = {
  args: { config: leftover },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(
      within(root).getByRole('group', { name: 'How many are left over?' }),
    ).toBeVisible();
    await userEvent.click(dealRound(root));
    await userEvent.click(dealRound(root));
    await expectShown(root, { shares: [2, 2, 2], pile: 1 });
    await waitFor(() => expect(give(root)).toBeEnabled());
    await expect(reason(root)).toBeNull();
    await expectNothingStates(root, [1]);
    await userEvent.click(give(root));
    await expectShown(root, { shares: [2, 2, 2], pile: 0, seagull: 1 });
    await expect(give(root)).toBeDisabled();
    await typeOnPad(root, '1');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [2, 2, 2], leftover: 1, value: 1 }),
    );
    await expect(steps(args)).toEqual([
      'tap:deal-round',
      'tap:deal-round',
      'tap:seagull',
      'tap:key-1',
    ]);
    await expectItemsApart(root);
    await expectItemSize(root, 32);
    await expectFits(canvasElement, root);
  },
};

/**
 * Stress: 7 among 3 pebblings with the leftover still in the basket (the in-between moment the
 * seagull is waiting for): everything fits, items ≥ 40 px.
 */
export const LeftoverWaiting: Story = {
  args: { config: leftover },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(dealRound(root));
    await userEvent.click(dealRound(root));
    await expectShown(root, { shares: [2, 2, 2], pile: 1 });
    await waitFor(() => expect(give(root)).toBeEnabled());
    await expectItemsApart(root);
    await expectFits(canvasElement, root);
  },
};

// ---------- fair-or-not and even-odd ----------

/**
 * `fair-or-not` (stress: 4 plates): the pre-dealt shares are a picture; "Fair" and "Not fair" are
 * big cards with a picture and a word. Picked → ink ring and check badge. Check sends the choice.
 */
export const FairOrNot: Story = {
  args: { config: fair },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { shares: [3, 3, 2, 3], pile: 0 });
    await expect(within(root).getByRole('img', { name: 'Look at the picture' })).toBeVisible();
    await expect(root.querySelector('[data-place-item]')).toBeNull();
    await expect(checkButton(root)).toBeDisabled();
    // Tapping the picture names what is under the finger: a starfish, then a plate.
    await userEvent.click(root.querySelector('[data-es-tap="item-2-1"]') as HTMLElement);
    await userEvent.click(root.querySelector('[data-es-tap="recipient-3"]') as HTMLElement);
    await expect(said(audio)).toEqual(['ui.sprite.starfish', 'ui.widget.es.kind.plate']);
    await userEvent.click(option(root, 'no'));
    await expect(said(audio)).toContain('ui.widget.es.opt.no');
    await expect(option(root, 'no')).toHaveAttribute('aria-pressed', 'true');
    await expect(option(root, 'no').querySelector('.ni-pick__badge')).not.toBeNull();
    await expect(option(root, 'yes')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'no' });
    await expect(steps(args)).toEqual(['tap:item-2-1', 'tap:recipient-3', 'tap:opt-no']);
    await expectTraceOrdered(traceOf(args.onInteract));
    const targets = [option(root, 'yes'), option(root, 'no'), checkButton(root)];
    for (const el of targets) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(targets);
    await expect(within(root).getByText('Not fair')).toBeVisible();
    await expectItemsApart(root);
    await expectItemSize(root, 60);
    await expectFits(canvasElement, root);
  },
};

/** `fair-or-not` in K: the two choices are pictures only, with spoken labels. */
export const FairOrNotK: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...fair, predealt: [3, 3, 3, 2], recipientsKind: 'pebbling' } },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-esw__option-word')).toHaveLength(0);
    await expect(root.querySelectorAll('.ni-esw__legend-text')).toHaveLength(0);
    await userEvent.click(option(root, 'yes'));
    await expect(said(audio)).toContain('ui.widget.es.opt.yes');
    const targets = [option(root, 'yes'), option(root, 'no'), checkButton(root)];
    for (const el of targets) await expectTargetSize(el, 'k');
    await expectTargetGaps(targets);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'yes' });
    await expectFits(canvasElement, root);
  },
};

/**
 * `even-odd` (MUL.01): deal 7 leaves between two (one is left in the basket), then pick "Odd"
 * (pairs plus one left over). Check sends `{ kind: 'choice', id: 'odd' }`.
 */
export const EvenOdd: Story = {
  args: { config: evenOdd },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('group', { name: 'Even or odd?' })).toBeVisible();
    for (let k = 0; k < 3; k++) await userEvent.click(dealRound(root));
    await expectShown(root, { shares: [3, 3], pile: 1 });
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(option(root, 'odd'));
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'odd' });
    await expect(steps(args)).toEqual([
      'tap:deal-round',
      'tap:deal-round',
      'tap:deal-round',
      'tap:opt-odd',
    ]);
    await expectItemsApart(root);
    await expectFits(canvasElement, root);
  },
};

/**
 * Evidence, K START (6 between 2): six chunky crabs in the basket, two big pebblings behind empty
 * mats, icon-only controls. The seagull's reason is an icon (spoken when the seagull is tapped).
 */
export const BuildKStart: Story = {
  globals: { ageMode: 'k' },
  args: { config: buildK },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { shares: [0, 0], pile: 6 });
    await expect(root.querySelectorAll('.ni-esw__caption')).toHaveLength(0);
    await expect(reason(root)).toHaveAttribute('aria-label', 'Each one can have more');
    await expectTargetSize(pileItem(root), 'k');
    await expectItemSize(root, 52);
    await expectItemsApart(root);
    await expectFits(canvasElement, root);
  },
};

/**
 * K `each` (6 between 2): chunky items, every control an icon with a spoken label. Tapping an
 * item names it; tapping a pebbling names it too.
 */
export const BuildK: Story = {
  globals: { ageMode: 'k' },
  args: { config: buildK },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    // Icon-only controls (06 §5): nothing to read.
    await expect(root.querySelectorAll('.ni-esw__caption')).toHaveLength(0);
    await expect(root.querySelectorAll('.ni-esw__legend-text')).toHaveLength(0);
    await expect(root.querySelectorAll('.ni-btn__label')).toHaveLength(0);
    await userEvent.click(recipient(root, 1));
    await expect(said(audio)).toContain('ui.widget.es.kind.pebbling');
    await userEvent.click(dealRound(root));
    await expect(said(audio)).toContain('ui.widget.es.deal-round');
    await userEvent.click(pileItem(root));
    await expect(said(audio)).toContain('ui.sprite.crab');
    await userEvent.click(recipient(root, 0));
    await userEvent.click(pileItem(root));
    await userEvent.click(recipient(root, 1));
    await userEvent.click(dealRound(root));
    await expectShown(root, { shares: [3, 3], pile: 0 });
    const targets = [dealRound(root), give(root), bird(root), checkButton(root)];
    for (const el of targets) await expectTargetSize(el, 'k');
    await expectTargetGaps(targets);
    await expectTargetSize(pileItem(root, 0) ?? root.querySelector('.ni-esw__spot'), 'k');
    for (const i of [0, 1]) await expectTargetSize(recipient(root, i), 'k');
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const key of keys) await expectTargetSize(key, 'k');
    await expectItemSize(root, 52);
    await typeOnPad(root, '3');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [3, 3], leftover: 0, value: 3 }),
    );
    await expectItemsApart(root);
    await expectFits(canvasElement, root);
  },
};

// ---------- the drag, tap and keyboard paths ----------

/** Mouse: drag the shell on the take-one spot to the second pebbling. */
export const DragItem: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(pileItem(root), center(recipient(root, 1)), 'mouse', 10);
    await expectShown(root, { shares: [0, 1, 0], pile: 11 });
    // A loose shell in the basket drags too.
    await pointerDrag(pileItem(root, 5), center(recipient(root, 2)), 'mouse', 10);
    await expectShown(root, { shares: [0, 1, 1], pile: 10 });
    // A mis-drop glides home: nothing changes.
    const from = center(pileItem(root));
    await pointerDrag(pileItem(root), { x: from.x, y: from.y + 400 }, 'mouse');
    await expectShown(root, { shares: [0, 1, 1], pile: 10 });
    await typeOnPad(root, '4');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [0, 1, 1], leftover: 10, value: 4 }),
    );
    const trace = traceOf(args.onInteract);
    await expect(steps(args)).toEqual([
      'drag:pile',
      'drop:recipient-1',
      'drag:pile',
      'drop:recipient-2',
      'drag:pile',
      'drop:none',
      'tap:key-4',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Touch: hold a shell over the first pebbling (its mat lights up), then let go. */
export const TouchDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const lift = await touchDragAndHold(pileItem(root), center(recipient(root, 0)));
    await expect(recipient(root, 0)).toHaveAttribute('data-over', 'true');
    await expect(pileItem(root)).toHaveAttribute('data-dragging', 'true');
    await lift();
    await expectShown(root, { shares: [1, 0, 0], pile: 11 });
    await pointerDrag(pileItem(root), center(recipient(root, 2)), 'touch');
    await expectShown(root, { shares: [1, 0, 1], pile: 10 });
    await typeOnPad(root, '4');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [1, 0, 1], leftover: 10, value: 4 }),
    );
    const trace = traceOf(args.onInteract);
    await expect(steps(args)).toEqual([
      'drag:pile',
      'drop:recipient-0',
      'drag:pile',
      'drop:recipient-2',
      'tap:key-4',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Tap-to-place: tap a shell (it lifts and says "Shell"), then tap a pebbling. Tapping a pebbling
 * with nothing picked up says "Pebbling".
 */
export const TapToPlace: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(recipient(root, 2));
    await expect(said(audio)).toEqual(['ui.widget.es.kind.pebbling']);
    await userEvent.click(pileItem(root));
    await expect(pileItem(root)).toHaveAttribute('aria-pressed', 'true');
    await expect(said(audio)).toContain('ui.sprite.shell');
    await expect(recipient(root, 0)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(recipient(root, 0));
    await expectShown(root, { shares: [1, 0, 0], pile: 11 });
    // Tapping an item at a pebbling names it too.
    await userEvent.click(item(root, 0, 0));
    await expect(said(audio).filter((k) => k === 'ui.sprite.shell')).toHaveLength(2);
    await userEvent.click(recipient(root, 1));
    await expectShown(root, { shares: [0, 1, 0], pile: 11 });
    await expect(steps(args)).toEqual([
      'tap:recipient-2',
      'tap:pile',
      'tap:recipient-0',
      'tap:item-0-0',
      'tap:recipient-1',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Keyboard (06 §7): Enter picks up the shell and jumps to the first pebbling; arrows; Enter. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    pileItem(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(recipient(root, 0)).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(recipient(root, 1)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expectShown(root, { shares: [0, 1, 0], pile: 11 });
    // Escape puts a picked-up shell down again.
    pileItem(root).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    await expect(pileItem(root)).toHaveAttribute('aria-pressed', 'false');
    await userEvent.keyboard('4');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [0, 1, 0], leftover: 11, value: 4 }),
    );
    await expect(steps(args)).toEqual(['tap:pile', 'tap:recipient-1', 'tap:pile', 'tap:key-4']);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * Give back: an item at a pebbling goes back to the basket (drag it there, or tap it and tap the
 * basket), or on to another pebbling.
 */
export const GiveBack: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(dealRound(root));
    await userEvent.click(dealRound(root));
    await expectShown(root, { shares: [2, 2, 2], pile: 6 });
    await pointerDrag(item(root, 0, 1), center(basket(root)), 'mouse', 10);
    await expectShown(root, { shares: [1, 2, 2], pile: 7 });
    await userEvent.click(item(root, 1, 0));
    await userEvent.click(basket(root));
    await expectShown(root, { shares: [1, 1, 2], pile: 8 });
    // On to another pebbling.
    await userEvent.click(item(root, 2, 1));
    await userEvent.click(recipient(root, 0));
    await expectShown(root, { shares: [2, 1, 1], pile: 8 });
    await typeOnPad(root, '4');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [2, 1, 1], leftover: 8, value: 4 }),
    );
    await expect(steps(args)).toEqual([
      'tap:deal-round',
      'tap:deal-round',
      'drag:item-0-1',
      'drop:pile',
      'tap:item-1-0',
      'tap:pile',
      'tap:item-2-1',
      'tap:recipient-0',
      'tap:key-4',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * The seagull's button stays off until the shares are equal and too few are left to go round:
 * first "Each one can have more", then (3, 2, 1 with one left) "They do not have the same". Moving
 * one shell to make 2, 2, 2 turns it on. Tapping the seagull says the reason.
 */
export const SeagullOnlyWhenFair: Story = {
  args: { config: leftover },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(give(root)).toBeDisabled();
    await expect(reason(root)).toHaveAttribute('aria-label', 'Each one can have more');
    await userEvent.click(bird(root));
    await expect(said(audio)).toContain('ui.widget.es.why.round');
    for (const to of [0, 0, 0, 1, 1, 2]) {
      await userEvent.click(pileItem(root));
      await userEvent.click(recipient(root, to));
    }
    await expectShown(root, { shares: [3, 2, 1], pile: 1 });
    await expect(give(root)).toBeDisabled();
    await expect(reason(root)).toHaveAttribute('aria-label', 'They do not have the same');
    await expect(within(root).getByText('They do not have the same')).toBeVisible();
    await userEvent.click(bird(root));
    await expect(said(audio)).toContain('ui.widget.es.why.unequal');
    await userEvent.click(item(root, 0, 2));
    await userEvent.click(recipient(root, 2));
    await expectShown(root, { shares: [2, 2, 2], pile: 1 });
    await expect(give(root)).toBeEnabled();
    await expect(within(root).getByText('Give the seagull what is left')).toBeVisible();
    await expect(args.onResponse).not.toHaveBeenCalled();
    await expectFits(canvasElement, root);
  },
};

// ---------- stress ----------

/**
 * Stress: 24 counters among 6 plates. Everything fits 1280 × 800 at one item size ≥ 20 px, in
 * fives, never overlapping, before and after dealing.
 */
export const Stress24: Story = {
  args: { config: stress24 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, { shares: [0, 0, 0, 0, 0, 0], pile: 24 });
    await expectItemSize(root, 30);
    await expectItemsApart(root);
    await expectFits(canvasElement, root);
    for (let k = 0; k < 3; k++) await userEvent.click(dealRound(root));
    await userEvent.click(pileItem(root));
    await userEvent.click(recipient(root, 5));
    await expectShown(root, { shares: [3, 3, 3, 3, 3, 4], pile: 5 });
    await expectNothingStates(root, [24, 4]);
    await expectItemsApart(root);
    await expectItemSize(root, 30);
    await expectFits(canvasElement, root);
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

// ---------- disabled ----------

/** `disabled`: no input at all (feedback showing, or the runner waiting). */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(dealRound(root)).toBeDisabled();
    await expect(give(root)).toBeDisabled();
    await expect(bird(root)).toBeDisabled();
    await expect(checkButton(root)).toBeDisabled();
    await expect(pileItem(root)).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(pileItem(root));
    await userEvent.click(recipient(root, 0));
    await pointerDrag(pileItem(root), center(recipient(root, 1)), 'mouse');
    await userEvent.click(padKey(root, '4'));
    await expectShown(root, { shares: [0, 0, 0], pile: 12 });
    await expect(args.onInteract).not.toHaveBeenCalled();
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

// ---------- demo mode ----------

const demoPlay: WidgetDemo = createDemoController({ strict: true });
/**
 * Demo (03 §6.3), every op: a fish flies to the first pebbling, two to the second and one back,
 * a round flies to each in turn, one more to the third, the last fish hops to the seagull, and
 * Pip types 1. Input is off while a step plays; afterwards the widget is back to normal.
 */
export const DemoPlay: Story = {
  args: { config: leftover, demo: demoPlay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const first = demoPlay.play({ op: 'deal', args: { to: 0 } });
    await waitFor(() => expect(dealRound(root)).toBeDisabled());
    await first;
    await expectShown(root, { shares: [1, 0, 0], pile: 6 });
    await demoPlay.play({ op: 'deal', args: { to: 1, count: 2 } });
    await expectShown(root, { shares: [1, 2, 0], pile: 4 });
    await demoPlay.play({ op: 'deal', args: { to: 1, count: -1 } });
    await expectShown(root, { shares: [1, 1, 0], pile: 5 });
    const round = demoPlay.play({ op: 'deal-round' });
    await waitFor(() => expect(shown(root).shares).toEqual([2, 1, 0]));
    await round;
    await expectShown(root, { shares: [2, 2, 1], pile: 2 });
    // Not yet: the model does nothing (the shares are not equal).
    await demoPlay.play({ op: 'set-aside-leftover' });
    await expectShown(root, { shares: [2, 2, 1], pile: 2 });
    await demoPlay.play({ op: 'deal', args: { to: 2 } });
    await demoPlay.play({ op: 'set-aside-leftover' });
    await expectShown(root, { shares: [2, 2, 2], pile: 0, seagull: 1 });
    await demoPlay.play({ op: 'answer', args: { value: 1 } });
    await expect(root.querySelector('.ni-esw__blank')).toHaveAttribute(
      'aria-label',
      'Your answer: 1',
    );
    // Back to normal, and the demo's answer is the child's to check.
    await expect(root.querySelectorAll('[data-flash="true"]')).toHaveLength(0);
    await waitFor(() => expect(checkButton(root)).toBeEnabled());
    await expect(bird(root)).toBeEnabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ shares: [2, 2, 2], leftover: 1, value: 1 }),
    );
  },
};

const demoChoice: WidgetDemo = createDemoController({ strict: true });
/** Demo `answer {id}`: Pip picks "Not fair" on the pre-dealt plates. */
export const DemoPlayChoice: Story = {
  args: { config: fair, demo: demoChoice },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoChoice.play({ op: 'answer', args: { id: 'no' } });
    await expect(option(root, 'no')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(checkButton(root)).toBeEnabled());
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'no' });
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });
/**
 * Demo invite: Pip's hand points at the take-one spot (deal to the second pebbling, which is
 * ringed too), then at "Give one to each", the seagull's button and the answer blank.
 */
export const DemoInvite: Story = {
  args: { config: leftover, demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    const spot = () => root.querySelector('.ni-esw__spot') as HTMLElement;
    demoInvite.invite({ op: 'deal', args: { to: 1 } });
    await waitFor(() => expect(spot()).toHaveClass('ni-invite'));
    await expect(root.querySelector('.ni-esw__rec.ni-invite')).not.toBeNull();
    await expectPointerOn(hand(), pileItem(root), root);
    demoInvite.invite({ op: 'deal-round' });
    await waitFor(() => expect(dealRound(root)).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), dealRound(root), root);
    demoInvite.invite({ op: 'set-aside-leftover' });
    await waitFor(() => expect(give(root)).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), give(root), root);
    demoInvite.invite({ op: 'answer', args: { value: 1 } });
    const blank = root.querySelector('.ni-esw__blank') as HTMLElement;
    await waitFor(() => expect(blank).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), blank, root);
    // The child's own step clears the invite.
    await userEvent.click(dealRound(root));
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
/**
 * Reduced motion: ops are instant (nothing flies or hops); the changed items are highlighted
 * briefly, then the widget is back to normal.
 */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: leftover, demo: demoReduced },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    const round = demoReduced.play({ op: 'deal-round' });
    await waitFor(() =>
      expect(root.querySelectorAll('.ni-esw__item[data-flash="true"]')).toHaveLength(3),
    );
    await round;
    await expectShown(root, { shares: [1, 1, 1], pile: 4 });
    await demoReduced.play({ op: 'deal-round' });
    const hop = demoReduced.play({ op: 'set-aside-leftover' });
    await waitFor(() => expect(shown(root).seagull).toBe(1));
    await expect(root.querySelector('[data-gull-item][data-flash="true"]')).not.toBeNull();
    await hop;
    await expect(performance.now() - started).toBeLessThan(2500);
    await expect(root.querySelectorAll('[data-flash="true"]')).toHaveLength(0);
    await expect(
      getComputedStyle(root.querySelector('.ni-esw__figure') as Element).animationName,
    ).toBe('none');
  },
};
