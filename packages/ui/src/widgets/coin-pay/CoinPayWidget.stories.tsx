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
 * `coin-pay` (03 §5.5, concrete): pay an amount by moving coins from the purse to the tray. No
 * money template exists yet (K02 authors MON), so these are hand-made, spec-valid configs (each
 * passes the engine's coin-pay `configSchema`).
 */

/** MON.05-style: pay 40¢; two quarters, four dimes, four nickels and plenty of pennies. */
const pay40: ConfigFor<'coin-pay'> = {
  format: 'coin-pay',
  target: 40,
  purse: { quarter: 2, dime: 4, nickel: 4, penny: 'unlimited' },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
};

/** Fewest coins for 65¢, no running total. */
const fewest: ConfigFor<'coin-pay'> = {
  format: 'coin-pay',
  target: 65,
  purse: { quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited', penny: 'unlimited' },
  requireFewest: true,
  mode: 'pay',
  showRunningTotal: false,
};

/** MON.03-style: $1.35 with a dollar bill in the purse (every kind: the widest purse). */
const dollar: ConfigFor<'coin-pay'> = {
  format: 'coin-pay',
  target: 135,
  purse: { dollar: 1, quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited', penny: 5 },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
};

/** PUZ.09-style: another way to make 30¢; two ways found already. */
const newWay: ConfigFor<'coin-pay'> = {
  format: 'coin-pay',
  target: 30,
  purse: { quarter: 1, dime: 3, nickel: 6, penny: 5 },
  requireFewest: false,
  mode: 'new-way',
  found: ['q1d0n1p0', 'q0d3n0p0'],
  showRunningTotal: true,
};

/** 30¢ in pennies only: a long pile, every penny drawn. */
const pennies: ConfigFor<'coin-pay'> = {
  format: 'coin-pay',
  target: 30,
  purse: { penny: 'unlimited' },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
};

const meta = {
  title: 'Widgets/Coin pay',
  args: {
    config: pay40 as WidgetConfig,
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

const ROOT = '.ni-cpay';
const CENTS: Record<string, number> = { penny: 1, nickel: 5, dime: 10, quarter: 25, dollar: 100 };
const stackTop = (root: HTMLElement, k: string) =>
  root.querySelector<HTMLElement>(`[data-stack="${k}"] .ni-money__top`);
const pileTop = (root: HTMLElement, k: string) =>
  root.querySelector<HTMLElement>(`[data-pile="${k}"] .ni-money__top`);
const trayPad = (root: HTMLElement) =>
  root.querySelector('[data-zone="tray"] > .ni-money__pad') as HTMLElement;
const pursePad = (root: HTMLElement) =>
  root.querySelector('[data-zone="purse"] > .ni-money__pad') as HTMLElement;
const check = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });

/** What the tray draws: every piece in every pile (art elements), by kind. */
function trayDrawn(root: HTMLElement) {
  const out: Record<string, number> = {};
  for (const el of root.querySelectorAll<HTMLElement>('[data-zone="tray"] [data-piece]')) {
    const k = el.dataset.piece as string;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
const drawnCents = (root: HTMLElement) =>
  Object.entries(trayDrawn(root)).reduce((a, [k, n]) => a + CENTS[k] * n, 0);

/** Maths truth: the running total (when shown) is the sum of the pieces drawn in the tray. */
async function expectTotalTrue(root: HTMLElement) {
  const total = root.querySelector<HTMLElement>('.ni-money__tag[data-kind="total"]');
  await expect(Number(root.dataset.total)).toBe(drawnCents(root));
  if (total) await expect(Number(total.dataset.cents)).toBe(drawnCents(root));
}

async function tapPlace(root: HTMLElement, k: string) {
  await userEvent.click(stackTop(root, k) as HTMLElement);
  await userEvent.click(trayPad(root));
}

/**
 * Tap-to-place: tap a coin (it says its name and value), tap the tray. Quarter, dime, nickel make
 * 40¢; the running total says so; check sends the tray's counts. Sizes: every coin ≥ 64 px,
 * ≥ 12 px apart.
 */
export const TapToPlace: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-money__tag[data-kind="price"]')).toHaveTextContent('40¢');
    const tops = [...root.querySelectorAll<HTMLElement>('[data-zone="purse"] .ni-money__top')];
    await expect(tops.map((el) => el.dataset.piece)).toEqual([
      'quarter',
      'dime',
      'nickel',
      'penny',
    ]);
    for (const el of tops) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(tops);
    // The purse shows exactly what it holds: 2 quarters, 4 dimes, 4 nickels, a heap of pennies.
    await expect(
      root.querySelectorAll('[data-stack="quarter"] [data-piece="quarter"]'),
    ).toHaveLength(2);
    await expect(root.querySelectorAll('[data-stack="dime"] [data-piece="dime"]')).toHaveLength(4);
    await expect(root.querySelector('[data-stack="penny"]')).toHaveAttribute('data-left', 'many');
    await expect(check(root)).toBeDisabled();

    await userEvent.click(stackTop(root, 'quarter') as HTMLElement);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.money.quarter', { cents: 25 });
    await expect(trayPad(root)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(trayPad(root));
    await tapPlace(root, 'dime');
    await tapPlace(root, 'nickel');
    await expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 1, nickel: 1 });
    await expect(root.querySelector('[data-stack="quarter"]')).toHaveAttribute('data-left', '1');
    await expectTotalTrue(root);
    await expect(root.querySelector('.ni-money__tag[data-kind="total"]')).toHaveTextContent('40¢');
    const piles = [...root.querySelectorAll<HTMLElement>('[data-zone="tray"] .ni-money__top')];
    for (const el of piles) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(piles);

    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 1, dime: 1, quarter: 1 } },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:purse-quarter',
      'tap:tray',
      'tap:purse-dime',
      'tap:tray',
      'tap:purse-nickel',
      'tap:tray',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Drag with a mouse and with a finger, and back: a tray coin dragged to the purse goes home. */
export const DragMouseAndTouch: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(stackTop(root, 'quarter') as HTMLElement, center(trayPad(root)), 'mouse');
    await waitFor(() => expect(trayDrawn(root)).toEqual({ quarter: 1 }));
    // A drag that lands says the coin's name.
    await expect(audio.say).toHaveBeenLastCalledWith('ui.money.quarter', { cents: 25 });
    await pointerDrag(stackTop(root, 'dime') as HTMLElement, center(trayPad(root)), 'touch');
    await pointerDrag(stackTop(root, 'dime') as HTMLElement, center(trayPad(root)), 'touch');
    await waitFor(() => expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 2 }));
    await expectTotalTrue(root);
    // Back to the purse by touch.
    await pointerDrag(pileTop(root, 'dime') as HTMLElement, center(pursePad(root)), 'touch');
    await waitFor(() => expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 1 }));
    await expectTotalTrue(root);
    // A drop away from every target glides home: nothing changes.
    await pointerDrag(stackTop(root, 'nickel') as HTMLElement, { x: 2, y: 2 }, 'mouse');
    await expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 1 });
    await tapPlace(root, 'nickel');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 1, dime: 1, quarter: 1 } },
    });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.slice(0, 2)).toEqual(['drag:purse-quarter', 'drop:tray']);
    await expect(trace).toContain('drag:tray-dime');
    await expect(trace).toContain('drop:purse');
    await expect(trace).toContain('drop:none');
  },
};

/** Keyboard: Enter on a coin jumps to the tray; Enter there places it. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    (stackTop(root, 'dime') as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect(document.activeElement).toBe(trayPad(root));
    await userEvent.keyboard('{Enter}');
    await expect(trayDrawn(root)).toEqual({ dime: 1 });
    (stackTop(root, 'dime') as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    // Back: Enter on the tray's dime, then Enter on the purse.
    (pileTop(root, 'dime') as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect(document.activeElement).toBe(pursePad(root));
    await userEvent.keyboard('{Enter}');
    await expect(trayDrawn(root)).toEqual({ dime: 1 });
    await expect(args.onInteract).toHaveBeenCalled();
  },
};

/** The purse runs out: after two quarters the quarter stack is an empty outline. */
export const PurseRunsOut: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'quarter');
    await tapPlace(root, 'quarter');
    await expect(stackTop(root, 'quarter')).toBeNull();
    await expect(root.querySelector('[data-stack="quarter"] .ni-money__empty')).not.toBeNull();
    await expect(root.querySelector('[data-stack="quarter"]')).toHaveAttribute('data-left', '0');
    await expect(trayDrawn(root)).toEqual({ quarter: 2 });
    await expectTotalTrue(root);
  },
};

/** requireFewest with no running total: nothing shows the total; the tray is still the answer. */
export const FewestNoTotal: Story = {
  args: { config: fewest },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'quarter');
    await tapPlace(root, 'quarter');
    await tapPlace(root, 'dime');
    await tapPlace(root, 'nickel');
    await expect(root.querySelector('.ni-money__tag[data-kind="total"]')).toBeNull();
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 1, dime: 1, quarter: 2 } },
    });
  },
};

/** A dollar bill in the purse: the response lists `dollar`; the running total reads $1.35. */
export const DollarBill: Story = {
  args: { config: dollar },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('[data-stack="dollar"] .ni-bill-art')).toHaveAttribute(
      'data-bill',
      '1',
    );
    await tapPlace(root, 'dollar');
    await expect(audio.say).toHaveBeenCalledWith('ui.money.bill', { cents: 100 });
    await tapPlace(root, 'quarter');
    await tapPlace(root, 'dime');
    await expectTotalTrue(root);
    await expect(root.querySelector('.ni-money__tag[data-kind="total"]')).toHaveTextContent(
      '$1.35',
    );
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 0, dime: 1, quarter: 1, dollar: 1 } },
    });
  },
};

/** new-way: the ways already found show as rows of coins, exactly their keys' coins. */
export const NewWay: Story = {
  args: { config: newWay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const ways = [...root.querySelectorAll<HTMLElement>('.ni-cpay__way')];
    await expect(ways.map((w) => w.dataset.way)).toEqual(['q1d0n1p0', 'q0d3n0p0']);
    const coinsIn = (w: HTMLElement) =>
      [...w.querySelectorAll<SVGElement>('.ni-coin-art')].map((c) => c.getAttribute('data-coin'));
    await expect(coinsIn(ways[0] as HTMLElement)).toEqual(['quarter', 'nickel']);
    await expect(coinsIn(ways[1] as HTMLElement)).toEqual(['dime', 'dime', 'dime']);
    await tapPlace(root, 'dime');
    await tapPlace(root, 'dime');
    await tapPlace(root, 'nickel');
    await tapPlace(root, 'nickel');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 2, dime: 2, quarter: 0 } },
    });
  },
};

/** Thirty pennies: every one is drawn in the pile, which stays inside the tray. */
export const ThirtyPennies: Story = {
  args: { config: pennies },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 30; i++) await tapPlace(root, 'penny');
    await expect(trayDrawn(root)).toEqual({ penny: 30 });
    await expect(root.querySelector('[data-pile="penny"]')).toHaveAttribute('data-count', '30');
    await expectTotalTrue(root);
    const pile = (root.querySelector('[data-pile="penny"]') as HTMLElement).getBoundingClientRect();
    const zone = (root.querySelector('[data-zone="tray"]') as HTMLElement).getBoundingClientRect();
    await expect(pile.right).toBeLessThanOrEqual(zone.right);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(stackTop(root, 'quarter') as HTMLElement);
    await userEvent.click(trayPad(root));
    await expect(trayDrawn(root)).toEqual({});
    await expect(args.onInteract).not.toHaveBeenCalled();
    await expect(check(root)).toBeDisabled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3): Pip counts up as it pays 40¢ (25, 35, 40: each the tray's exact sum), says
 * the total, takes a coin back and pays with `answer`; then invites the child to drop a dime.
 */
export const DemoMode: Story = {
  args: { config: fewest, disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const steps: [string, number][] = [
      ['quarter', 25],
      ['dime', 35],
      ['nickel', 40],
    ];
    for (const [coin, cents] of steps) {
      await demoController.play({ op: 'count-up', args: { coin } });
      await expect(drawnCents(root)).toBe(cents);
      await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: cents }]);
    }
    await demoController.play({ op: 'say-total' });
    await expect(audio.say).toHaveBeenLastCalledWith('ui.money.total', { cents: 40 });
    await demoController.play({ op: 'drop', args: { coin: 'nickel', to: 'purse' } });
    await expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 1 });
    await demoController.play({ op: 'count-up' });
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 35 }]);
    await demoController.play({
      op: 'answer',
      args: { coins: { quarter: 2, dime: 1, nickel: 1 } },
    });
    await expect(trayDrawn(root)).toEqual({ quarter: 2, dime: 1, nickel: 1 });
    await expectTotalTrue(root);
    await expect(demoController.play({ op: 'sort-coins' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'drop', args: { coin: 'dime' } });
    await waitFor(() => expect(root.querySelector('.ni-money__top.ni-invite')).not.toBeNull());
    const invited = root.querySelector('.ni-money__top.ni-invite') as HTMLElement;
    await expect(invited.dataset.id).toBe('purse-dime');
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, invited, root);
    demoController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-hand')).toBeNull());
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: every demo op is an instant state change. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'drop', args: { coin: 'quarter' } });
    await reducedController.play({ op: 'count-up', args: { coin: 'dime' } });
    await reducedController.play({ op: 'say-total' });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 1 });
  },
};

/** Tablet area: the widest purse (a bill and every coin) and a full tray, no scroll. */
export const TabletArea: Story = {
  args: { config: dollar },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'dollar');
    for (const k of ['quarter', 'dime', 'nickel', 'penny']) await tapPlace(root, k);
    await expectTotalTrue(root);
    await expectFitsArea(canvasElement, root);
  },
};

/** The smallest landscape area: the widest purse and the ways found, no scroll. */
export const LandscapeMinArea: Story = {
  args: { config: { ...newWay, purse: { quarter: 1, dime: 3, nickel: 6, penny: 5 } } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const k of ['quarter', 'dime', 'nickel', 'penny']) await tapPlace(root, k);
    await expectFitsArea(canvasElement, root);
  },
};

/** The widest purse (a bill and four coins) at the smallest landscape area. */
export const DollarLandscapeMin: Story = {
  args: { config: dollar },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'dollar');
    for (const k of ['quarter', 'dime', 'nickel', 'penny']) await tapPlace(root, k);
    await expectFitsArea(canvasElement, root);
  },
};
