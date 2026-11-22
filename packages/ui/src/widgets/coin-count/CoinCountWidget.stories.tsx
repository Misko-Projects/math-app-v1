import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { expectControls, expectOneInvite } from '../../test-support/controlChecks';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
import { expectFitsArea, inArea } from '../../test-support/widgetArea';
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
 * `coin-count` (03 §5.5, pictorial): how much money is in the purse? No money template exists
 * yet (K02 authors MON), so these are hand-made, spec-valid configs (each passes the engine's
 * coin-count `configSchema`).
 */

/** MON.02-style: a mix of six coins, 51¢, counted biggest first. */
const mixed: ConfigFor<'coin-count'> = {
  format: 'coin-count',
  coins: ['dime', 'penny', 'quarter', 'nickel', 'dime', 'penny'],
  bills: [],
  arrangement: 'mixed',
  answerUnit: 'cents',
};

/** MON.06-style: a dollar bill, a quarter and a nickel, written $1.30. */
const dollars: ConfigFor<'coin-count'> = {
  format: 'coin-count',
  coins: ['quarter', 'nickel'],
  bills: [1],
  arrangement: 'sorted',
  answerUnit: 'dollars-cents',
};

/** MON.08-style: which purse has more? 30¢ against 31¢. */
const compare: ConfigFor<'coin-count'> = {
  format: 'coin-count',
  coins: ['quarter', 'nickel'],
  bills: [],
  arrangement: 'sorted',
  answerUnit: 'cents',
  compareWith: { coins: ['dime', 'dime', 'dime', 'penny'], bills: [] },
};

/** The fullest purse the format allows (12 coin slots): 2 bills and 6 coins, $2.67. */
const full: ConfigFor<'coin-count'> = {
  format: 'coin-count',
  coins: ['quarter', 'quarter', 'dime', 'nickel', 'penny', 'penny'],
  bills: [1, 1],
  arrangement: 'sorted',
  answerUnit: 'dollars-cents',
};

/** Twelve coins (the most a purse holds), $1.10. */
const twelve: ConfigFor<'coin-count'> = {
  format: 'coin-count',
  coins: [
    'quarter',
    'penny',
    'dime',
    'quarter',
    'nickel',
    'penny',
    'quarter',
    'dime',
    'penny',
    'nickel',
    'penny',
    'penny',
  ],
  bills: [],
  arrangement: 'mixed',
  answerUnit: 'cents',
};

const meta = {
  title: 'Widgets/Coin count',
  args: {
    config: mixed as WidgetConfig,
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

const ROOT = '.ni-ccount';
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const pieces = (root: HTMLElement, side = 'left') => [
  ...root.querySelectorAll<HTMLElement>(`.ni-ccount__purse[data-side="${side}"] .ni-ccount__piece`),
];
const centsOf = (els: HTMLElement[]) => els.reduce((a, el) => a + Number(el.dataset.cents), 0);
const diameter = (root: HTMLElement, coin: string) =>
  Number(
    (root.querySelector(`.ni-coin-art[data-coin="${coin}"]`) as SVGElement).getAttribute(
      'data-diameter',
    ),
  );

/** Maths truth: the coins drawn are the config's coins, and they compare by size as real ones do. */
async function expectTruePurse(root: HTMLElement, config: ConfigFor<'coin-count'>) {
  const ps = pieces(root);
  await expect(ps.map((p) => p.dataset.kind)).toEqual([
    ...config.bills.map(() => 'bill'),
    ...config.coins,
  ]);
  const want =
    config.coins.reduce((a, c) => a + { penny: 1, nickel: 5, dime: 10, quarter: 25 }[c], 0) +
    100 * config.bills.reduce((a, b) => a + b, 0);
  await expect(centsOf(ps)).toBe(want);
}

/**
 * Cents: tap a coin to hear its name and value (and mark it), type 51 on the pad, check. Sizes:
 * every coin and key ≥ 64 px and ≥ 12 px apart; the dime is the smallest coin, then the penny,
 * the nickel and the quarter, as real coins are.
 */
export const Cents: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectTruePurse(root, mixed);
    await expect(diameter(root, 'dime')).toBeLessThan(diameter(root, 'penny'));
    await expect(diameter(root, 'penny')).toBeLessThan(diameter(root, 'nickel'));
    await expect(diameter(root, 'nickel')).toBeLessThan(diameter(root, 'quarter'));
    // Reeded rims on the dime and quarter, smooth on the penny and nickel.
    await expect(root.querySelector('[data-coin="dime"]')).toHaveAttribute('data-rim', 'reeded');
    await expect(root.querySelector('[data-coin="quarter"]')).toHaveAttribute('data-rim', 'reeded');
    await expect(root.querySelector('[data-coin="penny"]')).toHaveAttribute('data-rim', 'smooth');
    await expect(root.querySelector('[data-coin="nickel"]')).toHaveAttribute('data-rim', 'smooth');

    const ps = pieces(root);
    for (const p of ps) await expectTargetSize(p, 'g1-up');
    await expectTargetGaps(ps);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);

    // Tapping the quarter says "a quarter, twenty-five cents" and marks it.
    const quarter = ps[2] as HTMLElement;
    await expect(quarter).toHaveAccessibleName('A quarter, 25¢');
    await userEvent.click(quarter);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.money.quarter', { cents: 25 });
    await expect(quarter).toHaveAttribute('data-marked', 'true');
    await expect(quarter).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(ps[1] as HTMLElement);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.money.penny', { cents: 1 });
    // Tapping again unmarks it.
    await userEvent.click(quarter);
    await expect(quarter).not.toHaveAttribute('data-marked');

    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '5'));
    await userEvent.click(key(root, '1'));
    await expect(within(root).getByRole('button', { name: 'Cents: 51' })).toBeVisible();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 51 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:coin-2',
      'tap:coin-1',
      'tap:coin-2',
      'tap:key-5',
      'tap:key-1',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Dollars and cents: `$ _ . _ _`. Check waits for both cents digits (so .3 is never read as .30
 * or .03); a full dollars box moves on to the cents. The bill speaks "paper money, one dollar".
 */
export const DollarsAndCents: Story = {
  args: { config: dollars },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectTruePurse(root, dollars);
    const bill = pieces(root)[0] as HTMLElement;
    await expect(bill.querySelector('.ni-bill-art')).toHaveAttribute('data-bill', '1');
    await userEvent.click(bill);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.money.bill', { cents: 100 });
    const canvas = within(root);
    const check = canvas.getByRole('button', { name: 'Check' });
    await userEvent.click(key(root, '1'));
    // Tap the cents box to type there.
    await userEvent.click(canvas.getByRole('button', { name: 'Cents:' }));
    await userEvent.click(key(root, '3'));
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '0'));
    await expect(canvas.getByRole('button', { name: 'Dollars: 1' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Cents: 30' })).toBeVisible();
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [1, 30] });
  },
};

/** A leading zero in the cents stays: 1, 0, 5 → $1.05 (typing moves on from a full box). */
export const CentsLeadingZero: Story = {
  args: { config: { ...dollars, coins: ['nickel'] } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    // The dollars box holds up to three digits, so tap the cents box after the 1.
    await userEvent.click(key(root, '1'));
    await userEvent.click(canvas.getByRole('button', { name: 'Cents:' }));
    await userEvent.click(key(root, '0'));
    await userEvent.click(key(root, '5'));
    await expect(canvas.getByRole('button', { name: 'Cents: 05' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [1, 5] });
  },
};

/** Keyboard: digits typed on a keyboard fill the box; Enter checks. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.keyboard('52');
    await userEvent.keyboard('{Backspace}');
    await userEvent.keyboard('1');
    await expect(within(root).getByRole('button', { name: 'Cents: 51' })).toBeVisible();
    // Coins are reachable by Tab and speak on Enter.
    (pieces(root)[0] as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect(pieces(root)[0]).toHaveAttribute('data-marked', 'true');
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 51 });
  },
};

/**
 * Which purse has more? Two purses, a choice under each and "they are the same". Picking speaks
 * nothing new; check sends `left`, `right` or `same`.
 */
export const ComparePurses: Story = {
  args: { config: compare },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(centsOf(pieces(root, 'left'))).toBe(30);
    await expect(centsOf(pieces(root, 'right'))).toBe(31);
    await expect(pieces(root, 'right').map((p) => p.dataset.id)).toEqual([
      'r-coin-0',
      'r-coin-1',
      'r-coin-2',
      'r-coin-3',
    ]);
    const choices = [...root.querySelectorAll<HTMLElement>('.ni-ccount__choice .ni-pick')];
    // Tab order: "same" (between the purses), then "this one" under the left and right purse.
    await expect(choices.map((c) => c.dataset.id)).toEqual(['same', 'left', 'right']);
    const [, left, right] = choices as [HTMLElement, HTMLElement, HTMLElement];
    // Each "this one" sits under its own purse.
    const leftPurse = root.querySelector('[data-side="left"]') as HTMLElement;
    const rightPurse = root.querySelector('[data-side="right"]') as HTMLElement;
    await expect(left.getBoundingClientRect().top).toBeGreaterThan(
      leftPurse.getBoundingClientRect().bottom,
    );
    await expect(right.getBoundingClientRect().left).toBeGreaterThan(
      leftPurse.getBoundingClientRect().right,
    );
    await expect(right.getBoundingClientRect().top).toBeGreaterThan(
      rightPurse.getBoundingClientRect().bottom,
    );
    for (const c of choices) await expectTargetSize(c, 'g1-up');
    await expectTargetGaps([...choices, ...pieces(root, 'left'), ...pieces(root, 'right')]);
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(left);
    await userEvent.click(right);
    await expect(right).toHaveAttribute('aria-pressed', 'true');
    await expect(left).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'choice', id: 'right' });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:left',
      'tap:right',
    ]);
  },
};

/** Disabled: nothing responds, nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const p of pieces(root)) await expect(p).toBeDisabled();
    await expect(key(root, '3')).toBeDisabled();
    await userEvent.keyboard('3');
    await expect(within(root).getByRole('button', { name: 'Cents:' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3): Pip sorts the coins biggest first, counts up (the ring grows and the
 * running total is always the exact sum of the ringed coins: 25, 35, 45, 50, 51, 52), says the
 * total and types it. Then it invites the child to count the next coin.
 */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'sort-coins' });
    const sorted = pieces(root).map((p) => Number(p.dataset.cents));
    await expect(sorted).toEqual([25, 10, 10, 5, 1, 1]);
    const running = [25, 35, 45, 50, 51, 52];
    for (let i = 0; i < 6; i++) {
      await demoController.play({ op: 'count-up', args: { index: i } });
      const counted = pieces(root).filter((p) => p.dataset.counted === 'true');
      await expect(counted).toHaveLength(i + 1);
      const shown = root.querySelector('.ni-ccount__running') as HTMLElement;
      // Maths truth: the running total is the sum of the coins ringed so far.
      await expect(Number(shown.dataset.cents)).toBe(centsOf(counted));
      await expect(Number(shown.dataset.cents)).toBe(running[i]);
      await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: running[i] }]);
    }
    await expect(root.querySelector('.ni-ccount__running')).toHaveTextContent('52¢');
    await demoController.play({ op: 'say-running', args: { value: 52 } });
    await expect(audio.say).toHaveBeenLastCalledWith('ui.money.total', { cents: 52 });
    await demoController.play({ op: 'answer', args: { value: 52 } });
    await expect(within(root).getByRole('button', { name: 'Cents: 52' })).toBeVisible();
    await expect(demoController.play({ op: 'drop' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'count-up', args: { index: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-ccount__piece.ni-invite')).not.toBeNull());
    const invited = root.querySelector('.ni-ccount__piece.ni-invite') as HTMLElement;
    await expect(invited.dataset.cents).toBe('10');
    await expectPointerOn(root.querySelector('.ni-invite-hand') as HTMLElement, invited, root);
    demoController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-invite-hand')).toBeNull());
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: sorting and typing are instant state changes. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: dollars, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await reducedController.play({ op: 'sort-coins' });
    await reducedController.play({ op: 'count-up', args: { index: 2 } });
    await reducedController.play({ op: 'answer', args: { values: [1, 30] } });
    // Reduced motion is judged by its effect, not by a stopwatch: no glide, pop or sweep was
    // started (a control's own colour transition is not motion).
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition)),
    ).toHaveLength(0);
    await expect(root.querySelector('.ni-ccount__running')).toHaveTextContent('$1.30');
    await expect(within(root).getByRole('button', { name: 'Cents: 30' })).toBeVisible();
  },
};

const compareDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo on two purses: count the right purse up, then pick it. */
export const DemoCompare: Story = {
  args: { config: compare, disabled: true, demo: compareDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await compareDemo.play({ op: 'count-up', args: { index: 3, side: 'right' } });
    const running = root.querySelector('[data-side="right"] .ni-ccount__running') as HTMLElement;
    await expect(running).toHaveTextContent('31¢');
    await compareDemo.play({ op: 'answer', args: { id: 'right' } });
    await expect(root.querySelector('.ni-pick[data-id="right"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

/** Tablet (1280 × 800 → 1226 × 493 widget area): the fullest purse, no scroll. */
export const TabletArea: Story = {
  args: { config: full },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectTruePurse(root, full);
    await expectFitsArea(canvasElement, root);
    await userEvent.click(key(root, '2'));
    await userEvent.click(within(root).getByRole('button', { name: 'Cents:' }));
    await userEvent.click(key(root, '6'));
    await userEvent.click(key(root, '7'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [2, 67] });
  },
};

/** The smallest landscape area (960 × 600 → 906 × 373): twelve coins beside the pad, no scroll. */
/** The bound on the tablet: a purse of twelve coins (COIN_SLOTS_MAX), every one a target. */
export const TwelveTablet: Story = {
  args: { config: twelve },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-ccount__piece')).toHaveLength(12);
    await expectFitsArea(canvasElement, root);
    await expectControls(root, 'g1-up');
  },
};

export const LandscapeMinArea: Story = {
  args: { config: twelve },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectTruePurse(root, twelve);
    await expectFitsArea(canvasElement, root);
    const ps = pieces(root);
    for (const p of ps) await expectTargetSize(p, 'g1-up');
    await expectTargetGaps(ps);
  },
};

/** The two purses at the smallest landscape area. */
export const CompareLandscapeMin: Story = {
  args: {
    config: {
      ...compare,
      coins: ['quarter', 'quarter', 'dime', 'nickel', 'penny', 'penny'],
      compareWith: { coins: [], bills: [1] },
    },
  },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(canvasElement, root);
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo invite (03 §6.3): Pip invites the child to count the third coin: it is ringed and Pip's hand hangs under it. The story ends in the invited state, so the settled
 * picture shows the ring and the hand.
 */
export const DemoInvite: Story = {
  // In the tablet's widget area, so the picture shows the widget at the size a child meets it.
  render: inArea('tablet'),
  args: { disabled: true, demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'count-up', args: { index: 2 } });
    await waitFor(() => expect(root.querySelector('.ni-ccount__piece.ni-invite')).not.toBeNull());
    await waitFor(() => expect(root.querySelector('.ni-invite-hand')).not.toBeNull());
    const hand = root.querySelector('.ni-invite-hand') as HTMLElement;
    await expect(hand).toBeVisible();
    await expectPointerOn(
      hand,
      root.querySelector('.ni-ccount__piece.ni-invite') as HTMLElement,
      root,
    );
    await expectOneInvite(root);
  },
};

/**
 * Evidence audit (06 §4): in K every control is at least 80 px both ways and 12 px from every
 * other control.
 */
export const SizesK: Story = {
  // In the tablet's widget area, so the picture shows the widget at the size a child meets it.
  render: inArea('tablet'),
  globals: { ageMode: 'k' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectControls(root, 'k');
  },
};

/** Evidence audit: in G1+ every control is at least 64 px both ways and 12 px apart. */
export const SizesG1: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectControls(root, 'g1-up');
  },
};

/** The fullest comparison (6 coin slots a purse): six coins against two bills. */
const compareMax: ConfigFor<'coin-count'> = {
  format: 'coin-count',
  coins: ['quarter', 'quarter', 'dime', 'nickel', 'penny', 'penny'],
  bills: [],
  arrangement: 'sorted',
  answerUnit: 'cents',
  compareWith: { coins: [], bills: [1, 1] },
};

/** Both purses draw coins at ONE scale (a quarter the same size on either side). */
async function expectOneScale(root: HTMLElement) {
  const scales = new Set(
    [...root.querySelectorAll<HTMLElement>('.ni-ccount__purse')].map((p) => p.dataset.quarter),
  );
  await expect(scales.size).toBe(1);
}

/** Stress, tablet: the fullest comparison; nothing clips or scrolls. */
export const CompareMaxTablet: Story = {
  args: { config: compareMax },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOneScale(root);
    await expectFitsArea(canvasElement, root);
    await expectControls(root, 'g1-up');
  },
};

/** Stress, smallest landscape area: the fullest comparison. */
export const CompareMaxLandscapeMin: Story = {
  args: { config: compareMax },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectOneScale(root);
    await expectFitsArea(canvasElement, root);
  },
};

const runningController: WidgetDemo = createDemoController({ strict: true });

/**
 * Stress, smallest landscape area: twelve coins counted up to the last one; the running total sits
 * in the purse's top band, over no coin, and nothing scrolls.
 */
export const RunningLandscapeMin: Story = {
  args: { config: twelve, disabled: true, demo: runningController },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await runningController.play({ op: 'count-up', args: { index: 11 } });
    const tag = root.querySelector('.ni-ccount__running') as HTMLElement;
    await expect(Number(tag.dataset.cents)).toBe(110);
    const t = tag.getBoundingClientRect();
    for (const p of pieces(root)) {
      const r = p.getBoundingClientRect();
      const apart =
        t.right <= r.left || r.right <= t.left || t.bottom <= r.top || r.bottom <= t.top;
      await expect(apart, `running total clear of ${p.dataset.id}`).toBe(true);
    }
    await expectFitsArea(canvasElement, root);
  },
};
