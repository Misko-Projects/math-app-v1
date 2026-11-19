import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectAreaCentred,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
  waitForSettled,
} from '../../test-support/storyHelpers';
import {
  areaBox,
  contentBox,
  expectFitsArea,
  expectHandClearOfOthers,
  expectNoScroll,
  expectPointerOn,
  expectRingClear,
  expectTraceOrdered,
  findWidget,
  inArea,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import { numberLineViewScale } from '../kit';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `number-line-jump` (03 §5.5, Road Crew): a Pebbling hops along stepping stones (concrete) or a
 * number line, open line or timeline (pictorial). Answers `{ jumps, value? }`.
 */

type Config = ConfigFor<'number-line-jump'>;

/** ADD.03.t1: start on 4, hop 2 more; where do you land? */
const stones: Config = {
  format: 'number-line-jump',
  min: 0,
  max: 10,
  ticksEvery: 1,
  labelsEvery: 1,
  start: 4,
  goal: 'add',
  target: 6,
  allowedJumps: [1],
  path: 'stones',
  thenAsk: 'landing',
};
/** CNT.08.t1: count back from 5 to 3 on the stones. */
const stonesBack: Config = {
  ...stones,
  min: 1,
  max: 8,
  start: 5,
  goal: 'land-on',
  target: 3,
  allowedJumps: [-1],
  thenAsk: null,
};
/** ADD.03.t3: start at 10 and hop 3 more on a 0–15 line. */
const line: Config = {
  ...stones,
  max: 15,
  labelsEvery: 5,
  start: 10,
  target: 13,
  path: 'line',
};
/** CNT.08.t2: count back from 14 to 10. */
const lineBack: Config = {
  ...stonesBack,
  min: 8,
  max: 17,
  start: 14,
  target: 10,
  path: 'line',
};
/** Open line: 47 − 24 with tens and ones. */
const open: Config = {
  ...stones,
  max: 100,
  ticksEvery: null,
  labelsEvery: null,
  start: 47,
  goal: 'subtract',
  target: 23,
  allowedJumps: [-10, -1, 1, 10],
  path: 'open',
};
/** Timeline: from 15 to 45 minutes, how long? */
const timeline: Config = {
  ...stones,
  max: 60,
  ticksEvery: 5,
  labelsEvery: 15,
  start: 15,
  goal: 'difference',
  target: 45,
  allowedJumps: [5, 10],
  path: 'timeline',
  thenAsk: 'total-jump',
  unit: 'min',
};

/** ADD.04.t1 (concrete): a 0–22 road, 15 take away 6, hopping back. Too long for K stones. */
const longRoad: Config = {
  ...stones,
  max: 22,
  start: 15,
  goal: 'subtract',
  target: 9,
  allowedJumps: [-1],
};
/** ADD.04.t2 (concrete): from 4 to 12, how many hops in all? */
const difference: Config = {
  ...stones,
  max: 18,
  start: 4,
  goal: 'difference',
  target: 12,
  thenAsk: 'total-jump',
};
/** CNT.07.t1 (K): what comes after 8? A short road. */
const nextStone: Config = {
  ...stones,
  min: 5,
  max: 11,
  start: 8,
  goal: 'next',
  target: 9,
};
/** CNT.10.t2: land on 77 from 74 on a 72–79 line (no typed answer). */
const lineLandOn: Config = {
  ...stones,
  min: 72,
  max: 79,
  start: 74,
  goal: 'land-on',
  target: 77,
  path: 'line',
  thenAsk: null,
};
/** ADD.27.t1: 6 + 9 on a 0–20 line with hops of 1 to 10. */
const lineTens: Config = {
  ...stones,
  max: 20,
  labelsEvery: 5,
  start: 6,
  target: 15,
  allowedJumps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  path: 'line',
};
/** ADD.08.t3: 7 + 8 on an open line with hops of 1 to 10. */
const openTen: Config = {
  ...stones,
  max: 18,
  ticksEvery: null,
  labelsEvery: null,
  start: 7,
  target: 15,
  allowedJumps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  path: 'open',
};
/** CNT.20.t2: 74 − 33 on an open line with tens and ones back. */
const openBack: Config = {
  ...stones,
  min: 30,
  max: 90,
  ticksEvery: null,
  labelsEvery: null,
  start: 74,
  goal: 'subtract',
  target: 41,
  allowedJumps: [-10, -1],
  path: 'open',
};

const meta = {
  title: 'Widgets/Number line jump',
  args: {
    config: stones as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // No leftover focus ring (from a story's clicks) may read as an invite ring.
  afterEach: async ({ canvasElement }) => {
    (document.activeElement as HTMLElement | null)?.blur();
    // Every area story's card is centred in the stage on both axes.
    await expectAreaCentred(canvasElement);
  },
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-nlj';
const jump = (root: HTMLElement, by: number) =>
  root.querySelector(`.ni-nlj__jump[data-by="${by}"]`) as HTMLElement;
/** Hops by `by`: its button, or (the dial) steps the size to `by` first, then hops. */
async function hopBy(root: HTMLElement, by: number) {
  for (let i = 0; i < 12 && !jump(root, by); i++) {
    const shown = Number(root.querySelector<HTMLElement>('.ni-nlj__jump[data-by]')?.dataset.by);
    const dir = Math.abs(by) > Math.abs(shown) ? 'bigger' : 'smaller';
    await userEvent.click(
      root.querySelector(`.ni-nlj__dialstep[data-dir="${dir}"]`) as HTMLElement,
    );
  }
  await userEvent.click(jump(root, by));
}
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const readout = (root: HTMLElement) =>
  root.querySelector('.ni-nlj__readout .ni-number') as HTMLElement;
const here = (root: HTMLElement) =>
  Number(root.querySelector('.ni-nlj__stone[data-here="true"]')?.getAttribute('data-stone'));
const checkBtn = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const undoBtn = (root: HTMLElement) => within(root).getByRole('button', { name: 'Take back' });

/**
 * Maths truth. Stones: consecutive whole numbers left to right, evenly spaced, the hopper standing
 * over the stone it is on. Lines: evenly spaced ticks, numerals on their ticks, the hopper over
 * its number on the line.
 */
async function expectTruthfulRoad(root: HTMLElement, c: Config, at: number) {
  const hopper = root.querySelector('.ni-nlj__hopper') as HTMLElement;
  await waitForSettled(hopper);
  const road = root.querySelector('.ni-nlj__road');
  if (road) await waitForSettled(road);
  const hb = hopper.getBoundingClientRect();
  const mid = hb.left + hb.width / 2;
  if (c.path === 'stones') {
    const els = [...root.querySelectorAll<HTMLElement>('.ni-nlj__stone')];
    const nums = els.map((e) => Number(e.dataset.stone));
    await expect(nums).toEqual(nums.map((_, i) => c.min + i));
    await expect(els.map((e) => e.textContent)).toEqual(nums.map(String));
    const lefts = els.map((e) => e.getBoundingClientRect().left);
    const steps = lefts.slice(1).map((x, i) => x - (lefts[i] as number));
    for (const d of steps) await expect(Math.abs(d - (steps[0] as number))).toBeLessThan(0.5);
    const stone = els.find((e) => Number(e.dataset.stone) === at) as HTMLElement;
    await expect(stone).toHaveAttribute('data-here', 'true');
    const sb = stone.getBoundingClientRect();
    await expect(Math.abs(mid - (sb.left + sb.width / 2))).toBeLessThan(1);
    return;
  }
  const lineEl = root.querySelector('.ni-nlj__line') as HTMLElement;
  const s = numberLineViewScale({
    min: Number(lineEl.dataset.viewMin),
    max: Number(lineEl.dataset.viewMax),
    width: Number(lineEl.dataset.lineWidth),
    headroom: Number(lineEl.dataset.headroom),
  });
  const ticks = [...root.querySelectorAll<SVGLineElement>('.ni-numberline__tick')].map((l) =>
    Number(l.getAttribute('x1')),
  );
  const steps = ticks.slice(1).map((x, i) => x - (ticks[i] as number));
  for (const d of steps) await expect(Math.abs(d - (steps[0] as number))).toBeLessThan(0.01);
  for (const text of root.querySelectorAll<SVGTextElement>('.ni-numberline__numeral')) {
    await expect(
      Math.abs(
        Number(text.getAttribute('x')) -
          s.x(Number((text.textContent ?? '').replace('\u2212', '-'))),
      ),
    ).toBeLessThan(0.01);
  }
  const lb = lineEl.getBoundingClientRect();
  await expect(Math.abs(mid - (lb.left + s.x(at)))).toBeLessThan(1);
}

/** Concrete stones in K mode: hop +1 twice, type 6, check. K target sizes and gaps throughout. */
export const StonesK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const stoneEls = [...root.querySelectorAll<HTMLElement>('.ni-nlj__stone')];
    await expect(stoneEls).toHaveLength(11);
    for (const s of stoneEls) await expectTargetSize(s, 'k');
    await expectTargetGaps(stoneEls);
    await expect(here(root)).toBe(4);
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).toBeDisabled();
    await userEvent.click(jump(root, 1));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 5 }]);
    await userEvent.click(jump(root, 1));
    await expect(here(root)).toBe(6);
    // Still nothing to check until the landing is typed.
    await expect(check).toBeDisabled();
    await userEvent.click(key(root, '6'));
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [1, 1], value: 6 },
    });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:jump-1',
      'tap:jump-1',
      'tap:key-6',
    ]);
    const controls = [
      jump(root, 1),
      within(root).getByRole('button', { name: 'Take back' }),
      ...root.querySelectorAll<HTMLElement>('.ni-pad__key'),
      check,
    ];
    for (const el of controls) await expectTargetSize(el, 'k');
  },
};

/** Tapping the next stone hops there; tapping any other stone just says its number. */
export const StonesTapBack: Story = {
  args: { config: stonesBack },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const stone = (n: number) =>
      root.querySelector(`.ni-nlj__stone[data-stone="${n}"]`) as HTMLElement;
    await userEvent.click(stone(8));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 8 }]);
    await expect(here(root)).toBe(5);
    await userEvent.click(stone(4));
    await userEvent.click(jump(root, -1));
    await expect(here(root)).toBe(3);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [-1, -1] },
    });
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual([
      'stone-8',
      'stone-4',
      'jump--1',
    ]);
  },
};

/** Undo takes back the last hop (trace `undo`), and the check sends what is left. */
export const Undo: Story = {
  args: { config: line, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const undo = within(root).getByRole('button', { name: 'Take back' });
    await expect(undo).toBeDisabled();
    for (let i = 0; i < 4; i++) await userEvent.click(jump(root, 1));
    await userEvent.click(undo);
    await expect(root.querySelectorAll('.ni-numberline__jump')).toHaveLength(3);
    await userEvent.click(key(root, '1'));
    await userEvent.click(key(root, '3'));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [1, 1, 1], value: 13 },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.find((e) => e.t === 'undo')).toMatchObject({ target: 'jump-1' });
    await expectTraceOrdered(trace);
  },
};

/** Pictorial line, counting back with no typed answer: the hops are the answer. */
export const LineBack: Story = {
  args: { config: lineBack, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-pad')).toBeNull();
    // Hop arrows point left for a backward hop (direction, not colour).
    await expect(jump(root, -1).querySelector('[data-back="true"]')).not.toBeNull();
    for (let i = 0; i < 4; i++) await userEvent.click(jump(root, -1));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [-1, -1, -1, -1] },
    });
    for (const by of [-1]) await expectTargetSize(jump(root, by), 'g1-up');
  },
};

/**
 * Open line: the child chooses the jump sizes; each arc shows its size. Enter on an unfinished
 * answer sends nothing; later a double Enter and Check inside 400 ms submit once.
 */
export const OpenLine: Story = {
  args: { config: open, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-numberline__tick')).toHaveLength(0);
    await userEvent.click(jump(root, -10));
    // Desktop keys with nothing focused (Enter on a focused jump button would hop again).
    const blur = () => (document.activeElement as HTMLElement | null)?.blur();
    blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.click(jump(root, -10));
    for (let i = 0; i < 4; i++) await userEvent.click(jump(root, -1));
    await expect(within(root).getAllByText('−10')).toHaveLength(2);
    blur();
    await userEvent.keyboard('23');
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [-10, -10, -1, -1, -1, -1], value: 23 },
    });
    const buttons = [-10, -1, 1, 10].map((b) => jump(root, b));
    await expectTargetGaps(buttons);
  },
};

/** Timeline in minutes: arcs read "+10 min"; type the total jump. */
export const Timeline: Story = {
  args: { config: timeline, tier: 'pictorial' },
  // In the tablet's widget area: the whole widget is on one screen.
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(jump(root, 10));
    await userEvent.click(jump(root, 10));
    await userEvent.click(jump(root, 10));
    await expect(within(root).getAllByText('+10 min')).toHaveLength(3);
    await userEvent.keyboard('30');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [10, 10, 10], value: 30 },
    });
    await expectJumpFits(canvasElement, root, 'g1-up');
  },
};

/** Keyboard: Tab to a jump button, Enter and Space hop; digits and Enter answer. */
export const Keyboard: Story = {
  args: { config: line, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    jump(root, 1).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(root.querySelectorAll('.ni-numberline__jump')).toHaveLength(3));
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('13{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [1, 1, 1], value: 13 },
    });
  },
};

/** A jump off the end of the road is not offered. */
export const EdgeOfTheRoad: Story = {
  args: { config: { ...line, start: 15, target: 13, allowedJumps: [-1, 1] }, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(jump(root, 1)).toBeDisabled();
    await expect(jump(root, -1)).toBeEnabled();
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(jump(root, 1)).toBeDisabled();
    await userEvent.keyboard('6');
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (the ADD.03.t1 solution): highlight the start, hop, hop, label the landing. */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight', args: { at: 4 } });
    await expect(root.querySelector('.ni-nlj__stone[data-highlight="true"]')).not.toBeNull();
    await demoController.play({ op: 'hop', args: { by: 1 } });
    await demoController.play({ op: 'bridge-to', args: { at: 6 } });
    await expect(here(root)).toBe(6);
    await demoController.play({ op: 'label-landing' });
    await expect(readout(root)).toHaveTextContent('6');
    await expect(demoController.play({ op: 'drop' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    await expectTruthfulRoad(root, stones, 6);
    // Disabled: an invite waits until the child can act.
    demoController.invite({ op: 'hop', args: { by: 1 } });
    await new Promise((r) => setTimeout(r, 100));
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

const lineDemo: WidgetDemo = createDemoController({ strict: true });

/** Demo on the line: hops draw arcs; `answer` types the value. */
export const DemoLine: Story = {
  args: { config: line, tier: 'pictorial', disabled: true, demo: lineDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await lineDemo.play({ op: 'highlight', args: { at: 10 } });
    for (let i = 0; i < 3; i++) await lineDemo.play({ op: 'hop', args: { by: 1 } });
    await expect(root.querySelectorAll('.ni-numberline__jump')).toHaveLength(3);
    await lineDemo.play({ op: 'answer', args: { value: 13 } });
    await expect(readout(root)).toHaveTextContent('13');
    await expectTruthfulRoad(root, line, 13);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: hops are instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'hop', args: { by: 1 } });
    await reducedController.play({ op: 'hop', args: { by: 1 } });
    await reducedController.play({ op: 'label-landing' });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(here(root)).toBe(6);
  },
};

// ---------- invites (03 §6.3) ----------

/** The ring and Pip's hand are on ONE control, the fingertip on it, the ring clear of the rest. */
async function expectInviteOn(root: HTMLElement, el: HTMLElement) {
  // A tapped control keeps its focus ring; the only ring on screen must be the invite.
  (document.activeElement as HTMLElement | null)?.blur();
  await waitFor(() => expect(el).toHaveClass('ni-invite'));
  await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
  await waitFor(() => expect(root.querySelectorAll('.ni-hand')).toHaveLength(1));
  await waitForSettled(el);
  await new Promise((r) => requestAnimationFrame(r));
  await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, el, root);
  await expectHandClearOfOthers(
    root.querySelector('.ni-hand') as HTMLElement,
    [...root.querySelectorAll('button, .ni-nlp__marker')].filter((t) => t !== el),
  );
  await expectRingClear(
    el,
    targets(root).filter((t) => t !== el),
  );
}

const stonesInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * K stones, `answer {value: 6}`: the ring is on the +1 hop until the hopper stands on 6, then on
 * the 6 key, then on Check.
 */
export const InviteAnswerK: Story = {
  globals: { ageMode: 'k' },
  args: { demo: stonesInvite },
  // In the tablet's widget area, so the whole widget (and the invite) is on one screen.
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    stonesInvite.invite({ op: 'answer', args: { value: 6 } });
    await expectInviteOn(root, jump(root, 1));
    await userEvent.click(jump(root, 1));
    await expectInviteOn(root, jump(root, 1));
    await userEvent.click(jump(root, 1));
    await expectInviteOn(root, key(root, '6'));
    await userEvent.click(key(root, '6'));
    // It ends on the invite: one ring, on Check, and Pip's hand.
    await expectInviteOn(root, checkBtn(root));
  },
};

const bridgeInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Open line, `bridge-to {at: 41}` from 74 with −10 and −1: the −10 hop three times, then −1; it
 * ends on 42 with the ring and Pip's hand on the last −1.
 */
export const InviteBridgeOpen: Story = {
  args: { config: openBack, tier: 'pictorial', demo: bridgeInvite },
  // In the tablet's widget area, so the whole widget (and the invite) is on one screen.
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    bridgeInvite.invite({ op: 'bridge-to', args: { at: 41 } });
    for (let i = 0; i < 3; i++) {
      await expectInviteOn(root, jump(root, -10));
      await userEvent.click(jump(root, -10));
    }
    for (let i = 0; i < 2; i++) {
      await expectInviteOn(root, jump(root, -1));
      await userEvent.click(jump(root, -1));
    }
    await expectTruthfulRoad(root, openBack, 42);
    await expectInviteOn(root, jump(root, -1));
  },
};

// ---------- real shapes ----------

/** ADD.04.t1 at the default stage: a long road is a window of stones that follows the hopper. */
export const LongRoadWindow: Story = {
  args: { config: longRoad },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectTruthfulRoad(root, longRoad, 15);
    for (let i = 0; i < 6; i++) await userEvent.click(jump(root, -1));
    await expectTruthfulRoad(root, longRoad, 9);
    await userEvent.click(key(root, '9'));
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [-1, -1, -1, -1, -1, -1], value: 9 },
    });
  },
};

/** ADD.04.t2: the total jump (8 hops from 4 to 12) is typed. */
export const DifferenceStones: Story = {
  args: { config: difference },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 8; i++) await userEvent.click(jump(root, 1));
    await expectTruthfulRoad(root, difference, 12);
    await userEvent.click(key(root, '8'));
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [1, 1, 1, 1, 1, 1, 1, 1], value: 8 },
    });
  },
};

/** ADD.27.t1: ten hop sizes on a 0–20 line; 6 + 9 as one hop of 9. */
export const LineTenHops: Story = {
  args: { config: lineTens, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(jump(root, 9));
    await expectTruthfulRoad(root, lineTens, 15);
    await userEvent.keyboard('15');
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [9], value: 15 },
    });
  },
};

// ---------- the workshop's widget area (06 §1, §2) ----------

/** Every target the widget shows: tappable stones, hop buttons, take-back, pad keys, Check. */
function targets(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>('button.ni-nlj__stone'),
    ...root.querySelectorAll<HTMLElement>('.ni-nlj__jump'),
    ...root.querySelectorAll<HTMLElement>('.ni-pad__key'),
    root.querySelector<HTMLElement>('.ni-nlj__check .ni-btn'),
  ].filter((el): el is HTMLElement => el !== null);
}

/**
 * The widget uses the area (the #89 bar): the bounding box of its parts covers at least 60 % of
 * the area card's inner box.
 */
async function expectFill(canvasElement: HTMLElement, parts: Element[], min = 0.6) {
  const inner = contentBox(areaBox(canvasElement));
  const rects = parts.map((p) => p.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const fill =
    ((right - left) * (bottom - top)) / ((inner.right - inner.left) * (inner.bottom - inner.top));
  await expect(fill, `widget fill ${(fill * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(min);
}

/**
 * `fits` 'true': the widget fits the area with room for Pip's hand under any pad key. 'at-rest':
 * a K pad (three rows of 84 px) leaves no room under its bottom row at 960 × 600, so an invite on
 * 9, 0 or take-back adds a little room below (the only known overflow; see the widget's notes).
 */
async function expectJumpFits(
  canvasElement: HTMLElement,
  root: HTMLElement,
  age: 'k' | 'g1-up',
  fits: 'true' | 'at-rest' = 'true',
) {
  await waitForSettled(root);
  await expect(root).toHaveAttribute('data-fits', fits);
  const parts = [
    ...root.querySelectorAll('.ni-nlj__stones, .ni-nlj__line, .ni-nlj__jumps'),
    ...root.querySelectorAll('.ni-nlj__readout, .ni-nlj__check, .ni-nlj__padcell'),
  ];
  await expectFitsArea(areaBox(canvasElement), parts, targets(root), age);
  await expectFill(canvasElement, parts);
}

/**
 * At the 906 × 373 minimum an invite on a bottom control (the bottom pad row, the hop row) fits:
 * one ring, the fingertip on the control, the hand (bob included) inside the area card (it may hang
 * into the card's padding, covering nothing), clear of every other glyph, and nothing scrolls.
 */
async function expectMinAreaInvite(canvasElement: HTMLElement, root: HTMLElement, el: HTMLElement) {
  (document.activeElement as HTMLElement | null)?.blur();
  await waitFor(() => expect(el).toHaveClass('ni-invite'));
  await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
  await waitFor(() => expect(root.querySelectorAll('.ni-hand')).toHaveLength(1));
  await waitForSettled(el);
  await new Promise((r) => requestAnimationFrame(r));
  const hand = root.querySelector('.ni-hand') as HTMLElement;
  await expectPointerOn(hand, el, areaBox(canvasElement));
  await expectHandClearOfOthers(
    hand,
    [...root.querySelectorAll('button')].filter((b) => b !== el),
  );
  await expectRingClear(
    el,
    targets(root).filter((t) => t !== el),
  );
  await expectNoScroll(areaBox(canvasElement));
}

/** K stones 0–10 at the 960 × 600 minimum: the pad (4 × 3) beside the road; hop and answer. */
export const StonesKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { demo: createDemoController({ strict: true }) },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectJumpFits(canvasElement, root, 'k');
    // A lesson's answer invite: after a wrong digit it rings backspace on the pad's bottom row.
    (args.demo as WidgetDemo).invite({ op: 'answer', args: { value: 6 } });
    await userEvent.click(jump(root, 1));
    await userEvent.click(jump(root, 1));
    await userEvent.click(key(root, '5'));
    await expectMinAreaInvite(canvasElement, root, key(root, 'back'));
    await userEvent.click(key(root, 'back'));
    (args.demo as WidgetDemo).invite(null);
    await expectTruthfulRoad(root, stones, 6);
    await userEvent.click(key(root, '6'));
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [1, 1], value: 6 },
    });
    await expectJumpFits(canvasElement, root, 'k');
  },
};

/** K, the 0–22 road at the minimum: a window of picture stones that follows the hopper. */
export const LongRoadKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: longRoad },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-nlj__stones')).toHaveAttribute('data-tappable', 'false');
    await expectJumpFits(canvasElement, root, 'k');
    await expectTruthfulRoad(root, longRoad, 15);
    for (let i = 0; i < 6; i++) await userEvent.click(jump(root, -1));
    await expectTruthfulRoad(root, longRoad, 9);
    await expectJumpFits(canvasElement, root, 'k');
  },
};

/**
 * K, CNT.07.t1 at the minimum: seven K stone buttons would fit across, but not the height with
 * room for Pip's hand under the hop row, so the road is a picture; Check beside the hop buttons.
 */
export const NextStoneKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...nextStone, thenAsk: null, goal: 'land-on' } },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-nlj__stones')).toHaveAttribute('data-tappable', 'false');
    await expect(root.querySelector('.ni-nlj__stones')).toHaveAttribute('data-window', '7');
    await expectJumpFits(canvasElement, root, 'k');
  },
};

/** G1, ADD.27.t1 at the minimum: ten hop sizes, a 0–20 line and the pad. */
export const LineTenHopsG1MinLandscape: Story = {
  args: { config: lineTens, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-hops', 'dial');
    await expectJumpFits(canvasElement, root, 'g1-up');
    await hopBy(root, 9);
    await expectTruthfulRoad(root, lineTens, 15);
  },
};

/**
 * G1, ADD.08.t3 at the minimum: ten hop sizes on an open line and the pad; an invite under the
 * hop row fits (the hand may hang into the card's padding).
 */
const openTenInvite: WidgetDemo = createDemoController({ strict: true });

export const OpenTenHopsG1MinLandscape: Story = {
  args: { config: openTen, tier: 'pictorial', demo: openTenInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectJumpFits(canvasElement, root, 'g1-up');
    await hopBy(root, 3);
    await hopBy(root, 5);
    await expectTruthfulRoad(root, openTen, 15);
    await expectJumpFits(canvasElement, root, 'g1-up');
    // A lesson's hop invite rings a control in the hop row (the dial step toward 2): the hand
    // under it fits the area too.
    openTenInvite.invite({ op: 'hop', args: { by: 2 } });
    const step = root.querySelector('.ni-nlj__dialstep[data-dir="smaller"]') as HTMLElement;
    await expectMinAreaInvite(canvasElement, root, step);
  },
};

/** G1, CNT.10.t2 at the minimum: land on 77, no pad. */
export const LineLandOnG1MinLandscape: Story = {
  args: { config: lineLandOn, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectJumpFits(canvasElement, root, 'g1-up');
    await expectTruthfulRoad(root, lineLandOn, 74);
  },
};

/** K, CNT.10.t2-like line at the minimum (a K child on a line item): fits at rest. */
export const LineLandOnKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: lineLandOn, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectJumpFits(canvasElement, root, 'k');
  },
};

/** G1 open line back by tens and ones (CNT.20.t2), portrait. */
export const OpenBackG1Portrait: Story = {
  args: { config: openBack, tier: 'pictorial' },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectJumpFits(canvasElement, root, 'g1-up');
  },
};

/** K stones in portrait: everything stacked, the big pad. */
export const StonesKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: difference },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectJumpFits(canvasElement, root, 'k');
  },
};

/** K stones on the tablet. */
export const StonesKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: longRoad },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectJumpFits(canvasElement, root, 'k');
  },
};

/** G1 ten hop sizes on the tablet. */
export const LineTenHopsG1Tablet: Story = {
  args: { config: lineTens, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectJumpFits(canvasElement, root, 'g1-up');
  },
};

// ---------- review round 1 ----------

/** A −5..5 line: start at −1, hop back 2, land on −3. */
const belowZero: Config = {
  ...stones,
  min: -5,
  max: 5,
  start: -1,
  goal: 'subtract',
  target: -3,
  allowedJumps: [-2],
  path: 'line',
};

const signDemo: WidgetDemo = createDemoController({ strict: true });

/** Review F8: a landing below zero keeps its sign: the demo labels −3 and the answer is −3. */
export const NegativeLanding: Story = {
  args: { config: belowZero, tier: 'pictorial', demo: signDemo },
  // In the tablet's widget area: the whole widget is on one screen.
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await signDemo.play({ op: 'hop', args: { by: -2 } });
    await signDemo.play({ op: 'label-landing' });
    await expect(readout(root)).toHaveTextContent('−3');
    // The line's numerals print a real minus sign (U+2212) too, never a hyphen.
    const numerals = [...root.querySelectorAll('.ni-numberline__numeral')].map(
      (t) => t.textContent,
    );
    await expect(numerals).toContain('\u22123');
    await expect(numerals.some((t) => t?.includes('-'))).toBe(false);
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { jumps: [-2], value: -3 },
    });
    await expectJumpFits(canvasElement, root, 'g1-up');
  },
};

const signReduced: WidgetDemo = createDemoController({ strict: true });

/** Review F8 with reduced motion: the instant label keeps the sign too. */
export const NegativeLandingReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: belowZero, tier: 'pictorial', demo: signReduced },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await signReduced.play({ op: 'hop', args: { by: -2 } });
    await signReduced.play({ op: 'label-landing' });
    await expect(readout(root)).toHaveTextContent('−3');
  },
};

/** 0 to 8 with hops of 3 and 4: 6 is reached by 3 + 3 (a first hop of 4 is a dead end). */
const deadEnd: Config = {
  ...stones,
  min: 0,
  max: 8,
  start: 0,
  goal: 'add',
  target: 6,
  allowedJumps: [3, 4],
  path: 'line',
  thenAsk: null,
};

const pathInvite: WidgetDemo = createDemoController({ strict: true });

/** Review F9: the answer cue follows a reachable path: hop 3, hop 3, then Check. */
export const InviteReachablePath: Story = {
  args: { config: deadEnd, tier: 'pictorial', demo: pathInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    pathInvite.invite({ op: 'answer', args: { value: 6 } });
    await expectInviteOn(root, jump(root, 3));
    await userEvent.click(jump(root, 3));
    await expectInviteOn(root, jump(root, 3));
    await userEvent.click(jump(root, 3));
    await expectTruthfulRoad(root, deadEnd, 6);
    await expectInviteOn(root, checkBtn(root));
  },
};
