import {
  COIN_FOUND_MAX,
  COIN_FOUND_WAY_PIECES_MAX,
  TRAY_NARROW_PIECES_MAX,
  TRAY_PIECES_MAX,
  type WidgetConfig,
} from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { expectControls, expectOneInvite, settled } from '../../test-support/controlChecks';
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

/** 12¢ in pennies only: the longest pile the tray holds (TRAY_PIECES_MAX), every penny drawn. */
const pennies: ConfigFor<'coin-pay'> = {
  format: 'coin-pay',
  target: 12,
  purse: { penny: 'unlimited' },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
};

/** A purse of 12 pieces with two bills, every one moved to the tray (12 pieces in 5 piles). */
const stressPurse = (): ConfigFor<'coin-pay'> => ({
  format: 'coin-pay',
  target: 297,
  purse: { dollar: 2, quarter: 3, dime: 3, nickel: 2, penny: 2 },
  requireFewest: false,
  mode: 'pay',
  showRunningTotal: true,
});
const STRESS = [
  'dollar',
  'dollar',
  'quarter',
  'quarter',
  'quarter',
  'dime',
  'dime',
  'dime',
  'nickel',
  'nickel',
  'penny',
  'penny',
];

/**
 * The widest trays the bound allows (12 pieces): the longest pile of each kind beside the others.
 * Each is `[purse, pieces to place]`; the target is whatever they add up to.
 */
const WORST_TRAYS: Record<string, number>[] = [
  { penny: 12 },
  { dollar: 10, penny: 2 },
  { dollar: 3, quarter: 3, dime: 2, nickel: 2, penny: 2 },
  { dollar: 1, quarter: 8, dime: 1, nickel: 1, penny: 1 },
  { dollar: 1, quarter: 1, dime: 1, nickel: 1, penny: 8 },
  { quarter: 3, dime: 3, nickel: 3, penny: 3 },
  { dollar: 6, quarter: 6 },
];

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
  Object.entries(trayDrawn(root)).reduce((a, [k, n]) => a + (CENTS[k] ?? 0) * n, 0);

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

/** A real tap at a point: whatever is on top there takes it (as a finger would). */
async function tapAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y);
  if (!el) throw new Error(`nothing at ${x}, ${y}`);
  await userEvent.click(el);
}

/** Every piece drawn in the tray lies inside the tray's dashed outline, and every pile in it. */
async function expectTrayEnclosesPieces(root: HTMLElement) {
  const zone = trayPad(root).getBoundingClientRect();
  const parts = root.querySelectorAll<HTMLElement>(
    '[data-zone="tray"] [data-piece], [data-zone="tray"] .ni-money__pile',
  );
  await expect(parts.length).toBeGreaterThan(0);
  for (const el of parts) {
    const r = el.getBoundingClientRect();
    await expect(r.left).toBeGreaterThanOrEqual(zone.left);
    await expect(r.right).toBeLessThanOrEqual(zone.right);
    await expect(r.top).toBeGreaterThanOrEqual(zone.top);
    await expect(r.bottom).toBeLessThanOrEqual(zone.bottom);
  }
}

/** The purse's stacks sit in one row, inside the purse. */
async function expectPurseOneRow(root: HTMLElement) {
  const stacks = [...root.querySelectorAll<HTMLElement>('[data-zone="purse"] .ni-money__stack')];
  await expect(stacks.length).toBeGreaterThan(0);
  const bottoms = stacks.map((el) => el.getBoundingClientRect().bottom);
  await expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(24);
  const zone = (root.querySelector('[data-zone="purse"]') as HTMLElement).getBoundingClientRect();
  for (const el of stacks) {
    const r = el.getBoundingClientRect();
    await expect(r.left).toBeGreaterThanOrEqual(zone.left);
    await expect(r.right).toBeLessThanOrEqual(zone.right);
  }
}

/** In a pile every piece shows: each one is offset from the one before by at least `min` px. */
async function expectPilesReadable(root: HTMLElement, min = 16) {
  // A piece that just landed pops in (a short transform): measure once it has come to rest.
  await settled(root);
  for (const pile of root.querySelectorAll<HTMLElement>('[data-zone="tray"] .ni-money__pile')) {
    const xs = [...pile.querySelectorAll<HTMLElement>('[data-piece]')]
      .map((el) => el.getBoundingClientRect().left)
      .sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      await expect((xs[i] as number) - (xs[i - 1] as number)).toBeGreaterThanOrEqual(min);
    }
  }
}

/**
 * A full tray (TRAY_PIECES_MAX pennies): every one is drawn in the pile, inside the tray; the
 * purse dims and takes no more until a penny comes back, and then it does again.
 */
export const TrayFull: Story = {
  args: { config: pennies },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < TRAY_PIECES_MAX; i++) await tapPlace(root, 'penny');
    await expect(trayDrawn(root)).toEqual({ penny: TRAY_PIECES_MAX });
    await expect(root.querySelector('[data-pile="penny"]')).toHaveAttribute(
      'data-count',
      String(TRAY_PIECES_MAX),
    );
    await expectTotalTrue(root);
    await expectTrayEnclosesPieces(root);
    await expectPilesReadable(root);
    // Full: the purse's pennies are off (by pointer and by keyboard), and nothing more goes in.
    await expect(root.querySelector('.ni-money')).toHaveAttribute('data-full', 'true');
    await expect(stackTop(root, 'penny')).toHaveAttribute('aria-disabled', 'true');
    (stackTop(root, 'penny') as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await expect(trayDrawn(root)).toEqual({ penny: TRAY_PIECES_MAX });
    // One back (tap the pile's top penny, tap the purse): the purse takes taps again.
    await userEvent.click(pileTop(root, 'penny') as HTMLElement);
    await userEvent.click(pursePad(root));
    await expect(trayDrawn(root)).toEqual({ penny: TRAY_PIECES_MAX - 1 });
    await expect(root.querySelector('.ni-money')).not.toHaveAttribute('data-full');
    await tapPlace(root, 'penny');
    await expect(trayDrawn(root)).toEqual({ penny: TRAY_PIECES_MAX });
  },
};

/**
 * Take back where it sits: a coin in the tray is the thing a child touches to undo it. Tap it
 * (it says its name), tap the purse; or Enter on it, Enter on the purse. Both are traced, the
 * purse's count comes back, and the running total follows.
 */
export const TakeBack: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'quarter');
    await tapPlace(root, 'dime');
    await tapPlace(root, 'dime');
    clearSpies(audio);
    await userEvent.click(pileTop(root, 'dime') as HTMLElement);
    await expect(audio.say).toHaveBeenLastCalledWith('ui.money.dime', { cents: 10 });
    await expect(pursePad(root)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(pursePad(root));
    await expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 1 });
    await expect(root.querySelector('[data-stack="dime"]')).toHaveAttribute('data-left', '3');
    await expectTotalTrue(root);
    // Keyboard: the same undo.
    (pileTop(root, 'quarter') as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect(document.activeElement).toBe(pursePad(root));
    await userEvent.keyboard('{Enter}');
    await expect(trayDrawn(root)).toEqual({ dime: 1 });
    await expect(root.querySelector('[data-stack="quarter"]')).toHaveAttribute('data-left', '2');
    await expectTotalTrue(root);
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.slice(-4)).toEqual([
      'tap:tray-dime',
      'tap:purse',
      'tap:tray-quarter',
      'tap:purse',
    ]);
  },
};

/**
 * A tap meant to place a coin is never taken by a coin already lying there. With a purse coin
 * chosen, a tap anywhere in the tray places it: on the top coin of every pile (each one the
 * take-back target), at a pile's edge, just inside the tray's rounded corners. And the other way: with a tray
 * coin chosen, a tap on a purse stack takes it back. Tried with the fullest tray (12 pieces in
 * 5 piles) in the smallest area.
 */
export const PlaceOverAPile: Story = {
  args: { config: { ...stressPurse(), purse: { ...stressPurse().purse, penny: 3 } } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Eleven pieces in five piles (one penny among them); the next penny fills the tray.
    for (const k of STRESS.slice(0, 11)) await tapPlace(root, k);
    await expect(drawnCents(root)).toBe(316);
    const tops = [...root.querySelectorAll<HTMLElement>('[data-zone="tray"] .ni-money__top')];
    await expect(tops).toHaveLength(5);
    const zone = trayPad(root).getBoundingClientRect();
    const points = [
      ...tops.map((el) => center(el)),
      // The very edge of a pile's top coin, and the tray's corners.
      ...tops.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + 2, y: r.top + r.height / 2 };
      }),
      { x: zone.left + 16, y: zone.top + 16 },
      { x: zone.right - 16, y: zone.bottom - 16 },
    ];
    for (const at of points) {
      await userEvent.click(stackTop(root, 'penny') as HTMLElement);
      await expect(root.querySelector('.ni-money')).toHaveAttribute('data-armed-for', 'tray');
      await tapAt(at.x, at.y);
      // The penny went in (12 pieces), and no pile coin was picked up instead.
      await expect(trayDrawn(root).penny).toBe(2);
      await expect(root.querySelectorAll('[data-zone="tray"] [data-piece]')).toHaveLength(12);
      await expect(root.querySelector('.ni-money')).not.toHaveAttribute('data-armed-for');
      await expect(pursePad(root)).not.toHaveAttribute('data-armed');
      // Take it back for the next point: tap the pile's top penny, then a purse stack's coin.
      await userEvent.click(pileTop(root, 'penny') as HTMLElement);
      const c = center(stackTop(root, 'penny') as HTMLElement);
      await tapAt(c.x, c.y);
      await expect(trayDrawn(root).penny).toBe(1);
    }
    await expectTotalTrue(root);
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
    await expectPointerOn(root.querySelector('.ni-invite-hand') as HTMLElement, invited, root);
    demoController.invite(null);
    await waitFor(() => expect(root.querySelector('.ni-invite-hand')).toBeNull());
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: every demo op is an instant state change. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await reducedController.play({ op: 'drop', args: { coin: 'quarter' } });
    await reducedController.play({ op: 'count-up', args: { coin: 'dime' } });
    await reducedController.play({ op: 'say-total' });
    // Reduced motion is judged by its effect, not by a stopwatch: no glide, pop or sweep was
    // started (a control's own colour transition is not motion).
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition)),
    ).toHaveLength(0);
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

/**
 * The most ways a new-way item lists (`COIN_FOUND_MAX`), each as long as a found way may be
 * (`COIN_FOUND_WAY_PIECES_MAX` pieces), in the smallest area: every way is drawn whole, piece for piece,
 * and nothing clips or scrolls.
 */
export const FoundMaxLandscapeMin: Story = {
  args: {
    config: {
      ...newWay,
      purse: { quarter: 1, dime: 3, nickel: 6, penny: 5 },
      found: ['q0d1n4p0', 'q0d2n2p0', 'q0d3n0p0'].slice(0, COIN_FOUND_MAX),
    },
  },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const ways = [...root.querySelectorAll<HTMLElement>('.ni-cpay__found li')];
    await expect(ways).toHaveLength(COIN_FOUND_MAX);
    const list = (root.querySelector('.ni-cpay__found') as HTMLElement).getBoundingClientRect();
    for (const li of ways) {
      for (const piece of li.children) {
        const r = piece.getBoundingClientRect();
        await expect(r.left).toBeGreaterThanOrEqual(list.left - 0.5);
        await expect(r.right).toBeLessThanOrEqual(list.right + 0.5);
      }
    }
    await expect(ways.map((li) => li.children.length)).toEqual([COIN_FOUND_WAY_PIECES_MAX, 4, 3]);
    for (const k of ['quarter', 'nickel']) await tapPlace(root, k);
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

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo invite (03 §6.3): Pip invites the child to drop a dime: the dime on top of its stack is ringed and Pip's hand hangs under it. The story ends in the invited state, so the settled
 * picture shows the ring and the hand.
 */
export const DemoInvite: Story = {
  // In the tablet's widget area, so the picture shows the widget at the size a child meets it.
  render: inArea('tablet'),
  args: { disabled: true, demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'drop', args: { coin: 'dime' } });
    await waitFor(() => expect(root.querySelector('.ni-money__top.ni-invite')).not.toBeNull());
    await waitFor(() => expect(root.querySelector('.ni-invite-hand')).not.toBeNull());
    const hand = root.querySelector('.ni-invite-hand') as HTMLElement;
    await expect(hand).toBeVisible();
    await expectPointerOn(
      hand,
      root.querySelector('.ni-money__top.ni-invite') as HTMLElement,
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

/** Stress, tablet: the 12-piece purse emptied into the tray; nothing clips or scrolls. */
export const StressTablet: Story = {
  args: { config: stressPurse() },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(canvasElement, root);
    for (const k of STRESS) await tapPlace(root, k);
    await expect(drawnCents(root)).toBe(317);
    await expectTotalTrue(root);
    await expectFitsArea(canvasElement, root);
    await expectControls(root, 'g1-up');
  },
};

/** Stress, smallest landscape area: the same 12 pieces in the tray. */
export const StressLandscapeMin: Story = {
  args: { config: stressPurse() },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const k of STRESS) await tapPlace(root, k);
    await expectTotalTrue(root);
    await expectFitsArea(canvasElement, root);
  },
};

/** Some of `WORST_TRAYS`, each in its own smallest area. */
const worstTraysRender = (cases: Record<string, number>[]) => (args: WidgetHostProps) => (
  <div style={{ display: 'grid', gap: 16 }}>
    {cases.map((tray, i) => {
      const target = Object.entries(tray).reduce((a, [k, n]) => a + (CENTS[k] ?? 0) * n, 0);
      const config = { ...stressPurse(), target, purse: tray } as WidgetConfig;
      // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of cases
      return <div key={i}>{inArea('landscapeMin')({ ...args, config })}</div>;
    })}
  </div>
);

/**
 * For each tray: every piece is drawn inside the tray's outline, every pile shows each of its
 * pieces, the total is true, the purse is one row, and nothing clips or scrolls.
 */
async function playWorstTrays(canvasElement: HTMLElement, cases: Record<string, number>[]) {
  const areas = [...canvasElement.querySelectorAll<HTMLElement>('.story-widget-area')];
  await expect(areas).toHaveLength(cases.length);
  for (const [i, area] of areas.entries()) {
    const root = await waitFor(() => {
      const el = area.querySelector<HTMLElement>(ROOT);
      if (!el) throw new Error('no widget yet');
      return el;
    });
    const tray = cases[i] as Record<string, number>;
    for (const [k, n] of Object.entries(tray)) {
      for (let j = 0; j < n; j++) await tapPlace(root, k);
    }
    await expect(trayDrawn(root)).toEqual(tray);
    await expectTotalTrue(root);
    await expectTrayEnclosesPieces(root);
    await expectPilesReadable(root);
    await expectPurseOneRow(root);
    await expect(area.scrollWidth).toBeLessThanOrEqual(area.clientWidth + 1);
    await expect(area.scrollHeight, `tray ${JSON.stringify(tray)}`).toBeLessThanOrEqual(
      area.clientHeight + 1,
    );
    for (const el of root.querySelectorAll<HTMLElement>('.ni-money__top, .ni-btn')) {
      const r = el.getBoundingClientRect();
      const a = area.getBoundingClientRect();
      await expect(r.bottom).toBeLessThanOrEqual(a.bottom);
      await expect(r.right).toBeLessThanOrEqual(a.right);
    }
  }
}

/**
 * The widest trays the bound allows, in the smallest area (three short stories, so each settles
 * quickly): the longest piles of one kind.
 */
export const WorstTraysLongPiles: Story = {
  args: { config: stressPurse() },
  render: worstTraysRender(WORST_TRAYS.slice(0, 2)),
  play: async ({ canvasElement }) => {
    await playWorstTrays(canvasElement, WORST_TRAYS.slice(0, 2));
  },
};

/** The widest trays: five piles, and a long pile beside four others. */
export const WorstTraysFivePiles: Story = {
  args: { config: stressPurse() },
  render: worstTraysRender(WORST_TRAYS.slice(2, 5)),
  play: async ({ canvasElement }) => {
    await playWorstTrays(canvasElement, WORST_TRAYS.slice(2, 5));
  },
};

/** The widest trays: even piles of coins, and bills beside quarters. */
export const WorstTraysEvenPiles: Story = {
  args: { config: stressPurse() },
  render: worstTraysRender(WORST_TRAYS.slice(5)),
  play: async ({ canvasElement }) => {
    await playWorstTrays(canvasElement, WORST_TRAYS.slice(5));
  },
};

/** The longest piles at the K target size (80 px). */
export const WorstTraysLongPilesK: Story = {
  globals: { ageMode: 'k' },
  args: { config: stressPurse() },
  render: worstTraysRender(WORST_TRAYS.slice(0, 2)),
  play: async ({ canvasElement }) => {
    await playWorstTrays(canvasElement, WORST_TRAYS.slice(0, 2));
  },
};

/** The even piles, the long pile beside four others, and bills beside quarters, in K. */
export const WorstTraysEvenPilesK: Story = {
  globals: { ageMode: 'k' },
  args: { config: stressPurse() },
  render: worstTraysRender(WORST_TRAYS.slice(4)),
  play: async ({ canvasElement }) => {
    await playWorstTrays(canvasElement, WORST_TRAYS.slice(4));
  },
};

/** The same worst trays at the K target size (80 px): the purse of all five kinds is one row. */
export const WorstTraysFivePilesK: Story = {
  globals: { ageMode: 'k' },
  args: { config: stressPurse() },
  render: worstTraysRender(WORST_TRAYS.slice(2, 4)),
  play: async ({ canvasElement }) => {
    await playWorstTrays(canvasElement, WORST_TRAYS.slice(2, 4));
  },
};

/**
 * The widest purse a new-way board takes (the ways found sit beside it), twelve of each kind, at
 * both target sizes in the smallest area: the purse is one row and nothing scrolls with a full
 * tray (five pieces on this board) under it (PR #101 review 1).
 */
const newWayWidest = (): ConfigFor<'coin-pay'> => ({
  ...newWay,
  target: 125,
  purse: { dollar: 12, quarter: 12, dime: 12 },
  found: ['b1q1d0n0p0'],
});
async function playNewWayWidest(canvasElement: HTMLElement) {
  const root = await findWidget(canvasElement, ROOT);
  await expectPurseOneRow(root);
  // A full new-way tray (five pieces, one row): five quarters make $1.25, the way left.
  for (const k of ['quarter', 'quarter', 'quarter', 'quarter', 'quarter']) await tapPlace(root, k);
  await expect(root.querySelectorAll('[data-zone="tray"] [data-piece]')).toHaveLength(
    TRAY_NARROW_PIECES_MAX,
  );
  await expect(root.querySelector('.ni-money')).toHaveAttribute('data-full', 'true');
  await expectTotalTrue(root);
  await expectTrayEnclosesPieces(root);
  await expectPurseOneRow(root);
  const area = canvasElement.querySelector('.story-widget-area') as HTMLElement;
  await expect(area.scrollWidth).toBeLessThanOrEqual(area.clientWidth + 1);
  await expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
}
export const NewWayWidestPurseLandscapeMin: Story = {
  args: { config: newWayWidest() },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    await playNewWayWidest(canvasElement);
  },
};
export const NewWayWidestPurseLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: newWayWidest() },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    await playNewWayWidest(canvasElement);
  },
};
