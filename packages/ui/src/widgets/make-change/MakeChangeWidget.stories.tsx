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
    const started = performance.now();
    await reducedController.play({ op: 'count-up', args: { to: 90 } });
    await reducedController.play({ op: 'count-up', args: { to: 100 } });
    await expect(performance.now() - started).toBeLessThan(500);
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
  },
};
