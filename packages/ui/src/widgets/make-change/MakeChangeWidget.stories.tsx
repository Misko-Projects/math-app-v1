import { TRAY_NARROW_PIECES_MAX, type WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { expectControls, expectOneInvite } from '../../test-support/controlChecks';
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
 * `make-change` (03 §5.5, concrete, MON.07): give the change by counting up from the price. No
 * money template exists yet (K02 authors MON), so these are hand-made, spec-valid configs (each
 * passes the engine's make-change `configSchema`).
 */

/** Paid $1 for 65¢: 35¢ change, counting up 70, 80, 90, $1.00. */
const change65: ConfigFor<'make-change'> = {
  format: 'make-change',
  price: 65,
  paid: 100,
  purse: { quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited', penny: 'unlimited' },
  countUpLine: true,
};

/** Paid $2 for 85¢: change past a dollar (a bill in the purse), no line. */
const crossDollar: ConfigFor<'make-change'> = {
  format: 'make-change',
  price: 85,
  paid: 200,
  purse: { dollar: 2, quarter: 'unlimited', dime: 'unlimited', nickel: 'unlimited' },
  countUpLine: false,
};

const meta = {
  title: 'Widgets/Make change',
  args: {
    config: change65 as WidgetConfig,
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

const ROOT = '.ni-mchange';
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

function trayDrawn(root: HTMLElement) {
  const out: Record<string, number> = {};
  for (const el of root.querySelectorAll<HTMLElement>('[data-zone="tray"] [data-piece]')) {
    const k = el.dataset.piece as string;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

async function tapPlace(root: HTMLElement, k: string) {
  await userEvent.click(stackTop(root, k) as HTMLElement);
  await userEvent.click(trayPad(root));
}

/**
 * Maths truth on the count-up line: one hop per piece given, in order, each from the count so far
 * to that plus the piece's value, ending where the tray's change takes the price; every hop is
 * drawn to one scale (its length over its value is the same for every hop).
 */
async function expectLineTrue(root: HTMLElement, price: number) {
  const hops = [...root.querySelectorAll<SVGGElement>('.ni-mchange__hop')];
  let at = price;
  const perCent: number[] = [];
  for (const h of hops) {
    const v = CENTS[h.dataset.piece as string] as number;
    await expect(Number(h.dataset.from)).toBe(at);
    at += v;
    await expect(Number(h.dataset.to)).toBe(at);
    // A hop that runs off the end of the line is not drawn to its length (it is marked `off`).
    if (h.dataset.off === 'true') continue;
    const box = (h.querySelector('.ni-mchange__arc') as SVGPathElement).getBBox();
    perCent.push(box.width / v);
  }
  for (const r of perCent) await expect(Math.abs(r - (perCent[0] as number))).toBeLessThan(0.05);
  const drawn = Object.entries(trayDrawn(root)).reduce((a, [k, n]) => a + (CENTS[k] ?? 0) * n, 0);
  await expect(at).toBe(price + drawn);
  await expect(Number(root.dataset.reached)).toBe(at);
}

/**
 * Count up by tap-to-place: nickel (70), dime (80), dime (90), dime ($1.00). Each coin says its
 * name; the line hops exactly; check sends the change. Sizes: coins ≥ 64 px, ≥ 12 px apart.
 */
export const CountUpByTapping: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-money__tag[data-kind="price"]')).toHaveTextContent('65¢');
    await expect(root.querySelector('.ni-money__tag[data-kind="paid"]')).toHaveTextContent('$1.00');
    const line = root.querySelector('.ni-mchange__line') as SVGElement;
    await expect(line.querySelector('[data-end="price"]')).toHaveTextContent('65¢');
    await expect(line.querySelector('[data-end="paid"]')).toHaveTextContent('$1.00');
    const tops = [...root.querySelectorAll<HTMLElement>('[data-zone="purse"] .ni-money__top')];
    for (const el of tops) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(tops);
    await tapPlace(root, 'nickel');
    await expect(audio.say).toHaveBeenCalledWith('ui.money.nickel', { cents: 5 });
    for (let i = 0; i < 3; i++) await tapPlace(root, 'dime');
    await expect(trayDrawn(root)).toEqual({ nickel: 1, dime: 3 });
    await expectLineTrue(root, 65);
    await expect(line).toHaveAttribute('data-reached', '100');
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 1, dime: 3, quarter: 0 } },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.slice(0, 2).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:purse-nickel',
      'tap:tray',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Too much change runs past the paid mark on the line; taking a coin back fixes it. */
export const TooMuchShows: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(stackTop(root, 'quarter') as HTMLElement, center(trayPad(root)), 'touch');
    await pointerDrag(stackTop(root, 'quarter') as HTMLElement, center(trayPad(root)), 'mouse');
    await waitFor(() => expect(trayDrawn(root)).toEqual({ quarter: 2 }));
    await expectLineTrue(root, 65);
    const line = root.querySelector('.ni-mchange__line') as SVGElement;
    await expect(line).toHaveAttribute('data-reached', '115');
    // The last hop ends right of the paid mark.
    const paidX = (line.querySelector('[data-end="paid"] line') as SVGLineElement).getBBox().x;
    const hops = line.querySelectorAll<SVGGElement>('.ni-mchange__hop');
    const lastStop = (hops[hops.length - 1] as SVGGElement).querySelector(
      'circle',
    ) as SVGCircleElement;
    await expect(Number(lastStop.getAttribute('cx'))).toBeGreaterThan(paidX);
    await pointerDrag(pileTop(root, 'quarter') as HTMLElement, center(pursePad(root)), 'touch');
    await waitFor(() => expect(trayDrawn(root)).toEqual({ quarter: 1 }));
    await tapPlace(root, 'dime');
    await expectLineTrue(root, 65);
    await userEvent.click(check(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 0, dime: 1, quarter: 1 } },
    });
  },
};

/** Across a dollar with a bill, no line; the keyboard path gives the change. */
export const KeyboardAcrossADollar: Story = {
  args: { config: crossDollar },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-mchange__line')).toBeNull();
    for (const k of ['nickel', 'dime', 'dollar']) {
      (stackTop(root, k) as HTMLElement).focus();
      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard('{Enter}');
    }
    await expect(trayDrawn(root)).toEqual({ dollar: 1, dime: 1, nickel: 1 });
    check(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { coins: { penny: 0, nickel: 1, dime: 1, quarter: 0, dollar: 1 } },
    });
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'dime');
    await expect(trayDrawn(root)).toEqual({});
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

/**
 * The count-up line still reads as one line of hops: every hop and every piece riding one lies
 * inside the line's picture, no two riding pieces cover each other, and every hop has its stop.
 */
async function expectLineReads(root: HTMLElement) {
  const line = root.querySelector('.ni-mchange__line') as SVGSVGElement;
  const frame = line.getBoundingClientRect();
  const hops = [...line.querySelectorAll<SVGGElement>('.ni-mchange__hop')];
  for (const h of hops) {
    const r = h.getBoundingClientRect();
    await expect(r.left).toBeGreaterThanOrEqual(frame.left - 0.5);
    await expect(r.right).toBeLessThanOrEqual(frame.right + 0.5);
    await expect(r.top).toBeGreaterThanOrEqual(frame.top - 0.5);
    if (h.dataset.off !== 'true') await expect(h.querySelector('.ni-mchange__stop')).not.toBeNull();
  }
  const riders = [...line.querySelectorAll<SVGGElement>('.ni-mchange__rider')].map((g) =>
    g.getBoundingClientRect(),
  );
  for (const [i, a] of riders.entries()) {
    for (const b of riders.slice(i + 1)) {
      const apart =
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      // Coins on neighbouring levels may touch at a corner; they never cover one another.
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      await expect(apart || Math.min(overlapX, overlapY) <= 6).toBe(true);
    }
  }
}

/** The price and paid amounts under the line never run into each other (≥ 4 px between). */
async function expectEndLabelsApart(root: HTMLElement) {
  const box = (end: string) =>
    (
      root.querySelector(`.ni-mchange__line [data-end="${end}"] text`) as SVGTextElement
    ).getBoundingClientRect();
  const price = box('price');
  const paid = box('paid');
  await expect(paid.left - price.right).toBeGreaterThanOrEqual(4);
  const frame = (root.querySelector('.ni-mchange__line') as SVGSVGElement).getBoundingClientRect();
  await expect(price.left).toBeGreaterThanOrEqual(frame.left - 0.5);
  await expect(paid.right).toBeLessThanOrEqual(frame.right + 0.5);
}

/**
 * Far too much change (PR #101 review 1): 99¢ paid with $1.00, and the child gives a dollar bill.
 * The line does not stretch until 99¢ and $1.00 are printed on top of each other: the two amounts
 * stay apart, and the bill's hop runs off the end of the line with an arrow, past the paid mark.
 * Taking the bill back and giving the penny lands on $1.00. Also the longest amounts ($9.99 and
 * $10.00) and an overshoot by one penny.
 */
export const OverpayKeepsLabelsApart: Story = {
  args: {
    config: { ...change65, price: 99, paid: 100, purse: { dollar: 1, penny: 'unlimited' } },
  },
  render: (args) => (
    <div style={{ display: 'grid', gap: 16 }}>
      {inArea('landscapeMin')(args)}
      {inArea('landscapeMin')({
        ...args,
        config: {
          ...change65,
          price: 999,
          paid: 1000,
          purse: { dollar: 2, penny: 'unlimited' },
        } as WidgetConfig,
      })}
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const areas = [...canvasElement.querySelectorAll<HTMLElement>('.story-widget-area')];
    for (const [i, price] of [99, 999].entries()) {
      const area = areas[i] as HTMLElement;
      const root = await waitFor(() => {
        const el = area.querySelector<HTMLElement>(ROOT);
        if (!el) throw new Error('no widget yet');
        return el;
      });
      await expectEndLabelsApart(root);
      await tapPlace(root, 'dollar');
      await expectEndLabelsApart(root);
      await expectLineTrue(root, price);
      const line = root.querySelector('.ni-mchange__line') as SVGElement;
      const hop = line.querySelector('.ni-mchange__hop') as SVGGElement;
      await expect(hop).toHaveAttribute('data-off', 'true');
      // The hop is drawn, and it ends right of the paid mark.
      const paidX = (line.querySelector('[data-end="paid"] line') as SVGLineElement).getBBox().x;
      const arc = (hop.querySelector('.ni-mchange__arc') as SVGPathElement).getBBox();
      await expect(arc.x + arc.width).toBeGreaterThan(paidX + 40);
      await expect(hop.querySelector('.ni-mchange__arrow')).not.toBeNull();
      // One penny too many after that is off the picture, and the labels still stand apart.
      await tapPlace(root, 'penny');
      await expectEndLabelsApart(root);
      await expectLineTrue(root, price);
      // Back to nothing, then the right change: a penny lands on the paid mark.
      for (const k of ['penny', 'dollar']) {
        await userEvent.click(pileTop(root, k) as HTMLElement);
        await userEvent.click(pursePad(root));
      }
      await tapPlace(root, 'penny');
      await expect(root.dataset.reached).toBe(String(price + 1));
      await expect(line.querySelector('.ni-mchange__hop')).not.toHaveAttribute('data-off');
      await expectEndLabelsApart(root);
      await expectLineTrue(root, price);
      await expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
    }
    await expect(args.onInteract).toHaveBeenCalled();
  },
};

/**
 * A hop is taken back where its piece sits: tap the coin in the tray, tap the purse (or Enter on
 * each). The last hop of that coin leaves the line, the count steps back, and both are traced.
 */
export const TakeBackAHop: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapPlace(root, 'nickel');
    await tapPlace(root, 'dime');
    await tapPlace(root, 'dime');
    await expect(root.querySelectorAll('.ni-mchange__hop')).toHaveLength(3);
    await expect(root.dataset.reached).toBe('90');
    await userEvent.click(pileTop(root, 'dime') as HTMLElement);
    await userEvent.click(pursePad(root));
    await expect(root.querySelectorAll('.ni-mchange__hop')).toHaveLength(2);
    await expect(root.dataset.reached).toBe('80');
    await expectLineTrue(root, 65);
    (pileTop(root, 'nickel') as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect(document.activeElement).toBe(pursePad(root));
    await userEvent.keyboard('{Enter}');
    await expect(trayDrawn(root)).toEqual({ dime: 1 });
    await expect(root.dataset.reached).toBe('75');
    await expectLineTrue(root, 65);
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace.slice(-4)).toEqual([
      'tap:tray-dime',
      'tap:purse',
      'tap:tray-nickel',
      'tap:purse',
    ]);
  },
};

/**
 * The hardest lines the bounds allow, in the smallest area: a full tray of penny hops; and pennies
 * beside dollar bills (hops of 1¢ on a line 212¢ long). Each still reads as one line of hops.
 */
export const HardestLinesLandscapeMin: Story = {
  args: { config: { ...change65, price: 95, purse: { penny: 'unlimited' } } },
  render: (args) => (
    <div style={{ display: 'grid', gap: 16 }}>
      {inArea('landscapeMin')(args)}
      {inArea('landscapeMin')({
        ...args,
        config: {
          ...change65,
          price: 288,
          paid: 500,
          purse: { dollar: 2, dime: 'unlimited', penny: 'unlimited' },
        } as WidgetConfig,
      })}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const areas = [...canvasElement.querySelectorAll<HTMLElement>('.story-widget-area')];
    const cases: [number, string[]][] = [
      [95, Array.from({ length: TRAY_NARROW_PIECES_MAX }, () => 'penny')],
      // $2.12 of change in 5 pieces: a penny, a dime, two bills, then a penny again.
      [288, ['penny', 'dime', 'dollar', 'dollar', 'penny']],
    ];
    for (const [i, [price, pieces]] of cases.entries()) {
      const area = areas[i] as HTMLElement;
      const root = await waitFor(() => {
        const el = area.querySelector<HTMLElement>(ROOT);
        if (!el) throw new Error('no widget yet');
        return el;
      });
      for (const k of pieces) await tapPlace(root, k);
      await expect(root.querySelectorAll('.ni-mchange__hop')).toHaveLength(TRAY_NARROW_PIECES_MAX);
      await expectLineTrue(root, price);
      await expectLineReads(root);
      await expect(area.scrollWidth).toBeLessThanOrEqual(area.clientWidth + 1);
      await expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
    }
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo: Pip counts up 70, 80, 90, a dollar (each spoken), then invites the child's next coin. */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    for (const to of [70, 80, 90, 100]) {
      await demoController.play({ op: 'count-up', args: { to } });
      await expect(Number(root.dataset.reached)).toBe(to);
      await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: to }]);
    }
    await expect(trayDrawn(root)).toEqual({ nickel: 1, dime: 3 });
    await expectLineTrue(root, 65);
    // No single coin counts up from 100 to 103: nothing happens.
    await demoController.play({ op: 'count-up', args: { to: 103 } });
    await expect(Number(root.dataset.reached)).toBe(100);
    await demoController.play({ op: 'drop', args: { coin: 'dime', to: 'purse' } });
    await demoController.play({ op: 'answer', args: { coins: { quarter: 1, dime: 1 } } });
    await expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 1 });
    await expectLineTrue(root, 65);
    await expect(demoController.play({ op: 'say-total' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'count-up', args: { to: 105 } });
    await waitFor(() => expect(root.querySelector('.ni-money__top.ni-invite')).not.toBeNull());
    const invited = root.querySelector('.ni-money__top.ni-invite') as HTMLElement;
    await expect(invited.dataset.id).toBe('purse-nickel');
    await expectPointerOn(root.querySelector('.ni-invite-hand') as HTMLElement, invited, root);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await reducedController.play({ op: 'count-up', args: { to: 90 } });
    await reducedController.play({ op: 'count-up', args: { to: 100 } });
    // Reduced motion is judged by its effect, not by a stopwatch: no glide, pop or sweep was
    // started (a control's own colour transition is not motion).
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition)),
    ).toHaveLength(0);
    await expect(trayDrawn(root)).toEqual({ quarter: 1, dime: 1 });
  },
};

/** Tablet area, the line and a full count-up: no scroll. */
export const TabletArea: Story = {
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const k of ['nickel', 'dime', 'dime', 'dime']) await tapPlace(root, k);
    await expectLineTrue(root, 65);
    await expectFitsArea(canvasElement, root);
  },
};

/** The smallest landscape area with the line: no scroll. */
export const LandscapeMinArea: Story = {
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const k of ['nickel', 'dime', 'dime', 'penny', 'penny']) await tapPlace(root, k);
    await expectLineTrue(root, 65);
    await expectFitsArea(canvasElement, root);
  },
};

/** The smallest landscape area with a bill in the purse. */
export const DollarLandscapeMin: Story = {
  args: { config: crossDollar },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const k of ['nickel', 'dime', 'dollar']) await tapPlace(root, k);
    await expectFitsArea(canvasElement, root);
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo invite (03 §6.3): Pip invites the child to count up from 65¢ to 70¢: the nickel is ringed and Pip's hand hangs under it. The story ends in the invited state, so the settled
 * picture shows the ring and the hand.
 */
export const DemoInvite: Story = {
  args: { disabled: true, demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'count-up', args: { to: 70 } });
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

/** The purse's stacks sit in one row (their tops share a top edge within the lean of a stack). */
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

/** The widest purses the count-up board takes, twelve of each kind, with a tray they can fill. */
const FULL_BOARDS: {
  purse: Record<string, number>;
  price: number;
  paid: number;
  give: string[];
}[] = [
  // The bill and two coin kinds: $2.60 of change in 5 pieces (2 bills, 2 quarters, a dime).
  {
    purse: { dollar: 12, quarter: 12, dime: 12 },
    price: 740,
    paid: 1000,
    give: [...rep('dollar', 2), ...rep('quarter', 2), 'dime'],
  },
  // Four coin kinds: 66¢ of change in 5 pieces (2 quarters, a dime, a nickel, a penny).
  {
    purse: { quarter: 12, dime: 12, nickel: 12, penny: 12 },
    price: 34,
    paid: 100,
    give: [...rep('quarter', 2), 'dime', 'nickel', 'penny'],
  },
];
function rep(k: string, n: number): string[] {
  return Array.from({ length: n }, () => k);
}

async function playFullBoards(canvasElement: HTMLElement) {
  const areas = [...canvasElement.querySelectorAll<HTMLElement>('.story-widget-area')];
  await expect(areas).toHaveLength(FULL_BOARDS.length);
  for (const [i, board] of FULL_BOARDS.entries()) {
    const area = areas[i] as HTMLElement;
    const root = await waitFor(() => {
      const el = area.querySelector<HTMLElement>(ROOT);
      if (!el) throw new Error('no widget yet');
      return el;
    });
    await expectPurseOneRow(root);
    for (const k of board.give) await tapPlace(root, k);
    await expect(root.querySelectorAll('.ni-mchange__hop')).toHaveLength(TRAY_NARROW_PIECES_MAX);
    await expect(root.dataset.reached).toBe(String(board.paid));
    await expectPurseOneRow(root);
    // The piles are one row too: every pile's top piece shares a bottom edge.
    const bottoms = [
      ...root.querySelectorAll<HTMLElement>('[data-zone="tray"] .ni-money__pile'),
    ].map((el) => el.getBoundingClientRect().bottom);
    await expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(24);
    // A full tray takes no more.
    await expect(root.querySelector('.ni-money')).toHaveAttribute('data-full', 'true');
    await expectLineTrue(root, board.price);
    // Nothing scrolls, and every pile's top piece (the bottom row's too) is inside the area, so a
    // piece is taken back without moving the view.
    await expect(area.scrollWidth).toBeLessThanOrEqual(area.clientWidth + 1);
    await expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
    const a = area.getBoundingClientRect();
    const tops = [...root.querySelectorAll<HTMLElement>('[data-zone="tray"] .ni-money__top')];
    for (const el of [...tops, check(root)]) {
      const r = el.getBoundingClientRect();
      await expect(r.bottom).toBeLessThanOrEqual(a.bottom - 3);
      await expect(r.right).toBeLessThanOrEqual(a.right - 3);
    }
    const lowest = tops.reduce((x, y) =>
      y.getBoundingClientRect().bottom > x.getBoundingClientRect().bottom ? y : x,
    );
    const kind = lowest.dataset.piece as string;
    const before = trayDrawn(root)[kind] as number;
    await userEvent.click(lowest);
    await userEvent.click(pursePad(root));
    await expect(trayDrawn(root)[kind] ?? 0).toBe(before - 1);
    await expect(area.scrollTop).toBe(0);
  }
}

const fullBoards = (args: WidgetHostProps) => (
  <div style={{ display: 'grid', gap: 16 }}>
    {FULL_BOARDS.map((b, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of cases
      <div key={i}>
        {inArea('landscapeMin')({
          ...args,
          config: { ...change65, price: b.price, paid: b.paid, purse: b.purse } as WidgetConfig,
        })}
      </div>
    ))}
  </div>
);

/**
 * The fullest boards the bounds allow, in the smallest area (PR #101 review 1): a purse of twelve
 * of every kind it may hold beside the count-up line (the bill and two coin kinds; four coin
 * kinds), and a full tray (five pieces, one row). The purse stays one row, the piles stay one row,
 * nothing scrolls, and a piece is taken back where it sits.
 */
export const FullPurseAndTrayLandscapeMin: Story = {
  render: fullBoards,
  play: async ({ canvasElement }) => {
    await playFullBoards(canvasElement);
  },
};

/** The same fullest boards at the K target size (80 px). */
export const FullPurseAndTrayLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  render: fullBoards,
  play: async ({ canvasElement }) => {
    await playFullBoards(canvasElement);
  },
};

/**
 * Evidence audit (06 §4): in K every control is at least 80 px both ways and 12 px from every
 * other control.
 */
export const SizesK: Story = {
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

/**
 * 65¢ of change in 5 coins, the most the tray holds beside the count-up line
 * (TRAY_NARROW_PIECES_MAX): a quarter and four dimes.
 */
const STRESS = ['quarter', 'dime', 'dime', 'dime', 'dime'];
const stressChange: ConfigFor<'make-change'> = { ...change65, price: 35 };

/** Stress, tablet: a full tray of change, every hop on the line; nothing clips or scrolls. */
export const StressTablet: Story = {
  args: { config: stressChange },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const k of STRESS) await tapPlace(root, k);
    await expect(root.querySelectorAll('.ni-mchange__hop')).toHaveLength(TRAY_NARROW_PIECES_MAX);
    await expectLineTrue(root, 35);
    await expectLineReads(root);
    await expectFitsArea(canvasElement, root);
    await expectControls(root, 'g1-up');
  },
};

/** Stress, smallest landscape area: the same full tray. */
export const StressLandscapeMin: Story = {
  args: { config: stressChange },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const k of STRESS) await tapPlace(root, k);
    await expect(root.querySelectorAll('.ni-mchange__hop')).toHaveLength(TRAY_NARROW_PIECES_MAX);
    await expectLineTrue(root, 35);
    await expectLineReads(root);
    await expectFitsArea(canvasElement, root);
  },
};
