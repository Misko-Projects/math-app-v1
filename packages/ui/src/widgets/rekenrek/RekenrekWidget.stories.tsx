import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  expectFill,
  expectNumeralsInside,
  expectOneInvite,
  lookOf,
  settledAll,
  targetsOf,
} from '../../test-support/inviteStory';
import {
  center,
  clearSpies,
  expectAreaCentred,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  areaBox,
  expectFitsArea,
  expectHandClearOfOthers,
  expectTraceOrdered,
  findWidget,
  inArea,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import type { AgeMode } from '../../tokens/tokens';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `rekenrek` (03 §5.5, concrete): tap or drag beads along the wires; keyboard on each wire.
 * Answers `{ rows, value? }` (or a number for `read`) through the engine model. Fixtures mirror
 * the generated items (CPS.02.t2, CPS.03.t2, ADD.08.t2, SUB.07.t1, ADD.17.t1, CPS.04.t2).
 */

type Config = ConfigFor<'rekenrek'>;

/** CPS.02.t2 (K): show 6 on two rows. */
const show6: Config = {
  format: 'rekenrek',
  rows: 2,
  preset: [0, 0],
  mode: 'show',
  target: 6,
  rowRule: 'any',
  thenAsk: null,
};

/** CPS.03.t2 (K): 4 are over; make ten (one row, fill the top row first). */
const makeTen: Config = {
  format: 'rekenrek',
  rows: 1,
  preset: [4, 0],
  mode: 'make-ten',
  target: 10,
  rowRule: 'fill-top-first',
  thenAsk: null,
};

/** ADD.08.t2 (G1): 7 and 5, make a ten, then how many in all? */
const add75: Config = {
  format: 'rekenrek',
  rows: 2,
  preset: [7, 5],
  mode: 'make-ten',
  target: 12,
  a: 7,
  b: 5,
  rowRule: 'fill-top-first',
  thenAsk: 'total',
};

/** ADD.17.t1 (G1): 7 on the bottom row, add 9 (preset 0, 7), then how many in all? */
const add79: Config = {
  format: 'rekenrek',
  rows: 2,
  preset: [0, 7],
  mode: 'add',
  target: 16,
  a: 7,
  b: 9,
  rowRule: 'any',
  thenAsk: 'total',
};

/** SUB.07.t1 (G1): how many beads are over? (two rows, 5 and 6) */
const read11: Config = {
  format: 'rekenrek',
  rows: 2,
  preset: [5, 6],
  mode: 'read',
  rowRule: 'any',
  thenAsk: null,
};

/** CPS.04.t2 (K): show 14, top row first, then how many? */
const teen14: Config = {
  format: 'rekenrek',
  rows: 2,
  preset: [0, 0],
  mode: 'show',
  target: 14,
  rowRule: 'fill-top-first',
  thenAsk: 'total',
};

/** Two rows with the top-first rule: the widget never blocks a bottom-row move. */
const topFirst: Config = { ...show6, target: 13, rowRule: 'fill-top-first' };

const meta = {
  title: 'Widgets/Rekenrek',
  args: {
    config: show6 as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // Every story ends with nothing focused: a leftover keyboard focus ring must not read as an
  // invite in the evidence (invite stories keep their one ring and hand: those are not focus).
  // Every area story's card is centred in the stage on both axes (#92).
  afterEach: async ({ canvasElement }) => {
    (document.activeElement as HTMLElement | null)?.blur();
    await expectAreaCentred(canvasElement);
  },
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-rk';
const row = (root: HTMLElement, r: number) =>
  root.querySelector(`.ni-rk__row[data-row="${r}"]`) as HTMLElement;
const bead = (root: HTMLElement, r: number, i: number) =>
  row(root, r).querySelectorAll('.ni-rk__bead')[i] as HTMLElement;
const pushed = (root: HTMLElement, r: number) =>
  Number(
    row(root, r).getAttribute('aria-valuenow') ??
      row(root, r).querySelectorAll('[data-pushed]').length,
  );
const button = (root: HTMLElement, name: string) => within(root).getByRole('button', { name });

/** Beads glide (320 ms): wait before measuring where one is drawn. */
const settle = () => new Promise((r) => setTimeout(r, 400));

/** A tap (pointer down and up, no movement) on a bead, by mouse or touch. */
async function tapBeadAt(el: HTMLElement, pointerType: 'mouse' | 'touch' = 'mouse') {
  const { x, y } = center(el);
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: pointerType === 'mouse' ? 1 : 31,
    pointerType,
    isPrimary: true,
    clientX: x,
    clientY: y,
    button: 0,
  };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

/**
 * Show 6 as a split (CPS.02.t2): tap the third top bead (three slide over), drag the third bottom
 * bead left with the mouse, then by touch push one back and tap it over again. `{ rows }` answer.
 */
export const ShowSplit: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const rows = [row(root, 0), row(root, 1)];
    for (const r of rows) await expectTargetSize(r, 'g1-up');
    await expectTargetGaps(rows);
    await tapBeadAt(bead(root, 0, 2));
    await waitFor(() => expect(pushed(root, 0)).toBe(3));
    const b = bead(root, 1, 2);
    await pointerDrag(b, { x: center(b).x - 120, y: center(b).y }, 'mouse');
    await waitFor(() => expect(pushed(root, 1)).toBe(3));
    await settle();
    const back = bead(root, 1, 2);
    await pointerDrag(back, { x: center(back).x + 90, y: center(back).y }, 'touch');
    await waitFor(() => expect(pushed(root, 1)).toBe(2));
    await settle();
    await tapBeadAt(bead(root, 1, 2), 'touch');
    await waitFor(() => expect(pushed(root, 1)).toBe(3));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { rows: [3, 3] } });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:bead-0-2',
      'drag:bead-1-2',
      'drop:row-1',
      'drag:bead-1-2',
      'drop:row-1',
      'tap:bead-1-2',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Maths truth: two wires of ten beads, five of colour a then five of colour b (the second group
 * also carries an ink dot, so it reads without colour); the beads pushed over sit to the LEFT of
 * the gap, the rest to its right, evenly spaced.
 */
export const BeadsTruth: Story = {
  args: { config: add75 },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await settle();
    for (const r of [0, 1]) {
      const beads = [...row(root, r).querySelectorAll<HTMLElement>('.ni-rk__bead')];
      await expect(beads).toHaveLength(10);
      await expect(beads.map((b) => b.dataset.tone).join('')).toBe('aaaaabbbbb');
      for (const b of beads.slice(5)) {
        await expect(getComputedStyle(b, '::after').content).not.toBe('none');
      }
      const n = pushed(root, r);
      const xs = beads.map((b) => b.getBoundingClientRect().left);
      const step = (xs[1] as number) - (xs[0] as number);
      for (let i = 1; i < 10; i++) {
        const gap = (xs[i] as number) - (xs[i - 1] as number);
        // Neighbours on the same side are one bead apart; the gap sits between pushed and not.
        await expect(Math.abs(gap - (i === n ? step * 5 : step))).toBeLessThan(1.5);
      }
    }
  },
};

/** Make ten (CPS.03.t2), K mode: the wire is a ≥ 80 px target; a tap speaks the count. */
export const MakeTenK: Story = {
  globals: { ageMode: 'k' },
  args: { config: makeTen },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-rk__row')).toHaveLength(1);
    await expectTargetSize(row(root, 0), 'k');
    await expectTargetSize(button(root, 'Check'), 'k');
    await expect(pushed(root, 0)).toBe(4);
    await tapBeadAt(bead(root, 0, 9), 'touch');
    await waitFor(() => expect(pushed(root, 0)).toBe(10));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 10 }]);
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { rows: [10, 0] } });
  },
};

/** Keyboard (06 §7): ← slides one more bead over, → pushes one back, End fills, Home clears. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    row(root, 0).focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowRight}');
    await expect(row(root, 0)).toHaveAttribute('aria-valuenow', '3');
    await userEvent.tab();
    await expect(document.activeElement).toBe(row(root, 1));
    await userEvent.keyboard('{End}{Home}{ArrowUp}{ArrowUp}{ArrowUp}');
    await expect(row(root, 1)).toHaveAttribute('aria-valuenow', '3');
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { rows: [3, 3] } });
    const trace = traceOf(args.onInteract);
    await expect(trace.every((e) => e.t === 'move')).toBe(true);
    await expect(trace[0]?.target).toBe('row-0');
  },
};

/**
 * 7 and 5, make a ten, then how many (ADD.08.t2): three bottom beads go back, three top beads
 * over; then 12 on the 0–20 tray. Check twice inside 400 ms submits once (06 §4).
 */
export const AddThenTotal: Story = {
  args: { config: add75 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    row(root, 0).focus();
    await userEvent.keyboard('{End}');
    row(root, 1).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await expect(button(root, 'Check')).toBeDisabled();
    await userEvent.click(button(root, '12'));
    await userEvent.click(button(root, 'Check'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { rows: [10, 2], value: 12 },
    });
  },
};

/** Read (SUB.07.t1), K mode: the preset beads are a picture; pick how many (0–20). */
export const Read: Story = {
  globals: { ageMode: 'k' },
  args: { config: read11 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).queryByRole('slider')).toBeNull();
    await expect(within(root).getByRole('img', { name: 'Top row: 5' })).toBeVisible();
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    await expect(button(root, 'Check')).toBeDisabled();
    await userEvent.click(button(root, '11'));
    await expectNumeralsInside(root);
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 11 });
  },
};

/** `fill-top-first` never blocks a move (the checker judges): the bottom row slides first too. */
export const RowRuleNeverBlocks: Story = {
  args: { config: topFirst },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapBeadAt(bead(root, 1, 2));
    await waitFor(() => expect(pushed(root, 1)).toBe(3));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { rows: [0, 3] } });
  },
};

/** `disabled`: no input at all, and nothing changes how the wires look. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const before = lookOf(row(root, 0));
    await tapBeadAt(bead(root, 0, 4));
    row(root, 0).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(pushed(root, 0)).toBe(0);
    await expect(lookOf(row(root, 0))).toBe(before);
    await expect(button(root, 'Check')).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3): Pip slides beads, highlights them and counts them all (picks 12). */
export const DemoMode: Story = {
  args: { config: { ...add75, preset: [0, 0] }, disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'slide', args: { row: 0, count: 7 } });
    await expect(pushed(root, 0)).toBe(7);
    await demoController.play({ op: 'slide', args: { row: 1, count: 5 } });
    await demoController.play({ op: 'highlight', args: { row: 0, upTo: 5 } });
    await demoController.play({ op: 'count-total' });
    await expect(button(root, '12')).toHaveAttribute('aria-pressed', 'true');
    await expect(demoController.play({ op: 'place' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'slide', args: { row: 1, count: -2 } });
    await expect(root.querySelector('.ni-invite')).toBeNull();
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** Invites (K): `slide` rings the wire to move; `answer` rings the numeral card. */
export const DemoInviteK: Story = {
  globals: { ageMode: 'k' },
  args: { config: add75, demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'slide', args: { row: 1, count: -2 } });
    await waitFor(() => expect(row(root, 1).classList.contains('ni-invite')).toBe(true));
    await expectOneInvite(root, row(root, 1));
    inviteController.invite({ op: 'answer', args: { value: 12 } });
    const ringed = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    if (root.dataset.step === 'rack') {
      await expectOneInvite(root, ringed);
      await userEvent.click(ringed);
    }
    const card = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-pick.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await expect(card.dataset.id).toBe('opt-12');
    await expectOneInvite(root, card);
  },
};

const areaSlideController: WidgetDemo = createDemoController({ strict: true });

/**
 * The `slide` invite in the tablet widget area (1226 × 493), K: one ring on the wire to move, and
 * Pip's hand covers no bead of the other wire, no key and no numeral.
 */
export const AreaTabletInviteSlideK: Story = {
  globals: { ageMode: 'k' },
  args: { config: add75, demo: areaSlideController },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    areaSlideController.invite({ op: 'slide', args: { row: 1, count: -2 } });
    await waitFor(() => expect(row(root, 1).classList.contains('ni-invite')).toBe(true));
    await expectOneInvite(root, row(root, 1));
    await waitFor(() => expect(root.querySelector('.ni-hand svg')).not.toBeNull());
    await expectHandClearOfOthers(root, row(root, 1));
  },
};

const areaInviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * The `answer` invite at 960 × 600 (906 × 373), K, 14 shown on the rack: the answer step's tray,
 * one ring on the numeral card, and Pip's hand covers no other card and no numeral. (The invited
 * card has free room below it. A card or key with a row of others under it has none: a kit
 * matter, listed as a follow-up.)
 */
export const AreaLandscapeMinInviteTeenK: Story = {
  globals: { ageMode: 'k' },
  args: { config: teen14, demo: areaInviteController },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    areaInviteController.invite({ op: 'answer', args: { value: 14 } });
    const ringed = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    if (root.dataset.step === 'rack') {
      await expectOneInvite(root, ringed);
      await userEvent.click(ringed);
    }
    const card = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-pick.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await expect(card.dataset.id).toBe('opt-14');
    await expectOneInvite(root, card);
    await waitFor(() => expect(root.querySelector('.ni-hand svg')).not.toBeNull());
    await expectHandClearOfOthers(root, card);
    await expectFits(canvasElement, 'k');
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: slides are instant state changes, and `play` resolves after the commit. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: makeTen, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'slide', args: { row: 0, count: 6 } });
    await expect(pushed(root, 0)).toBe(10);
    await reducedController.play({ op: 'highlight', args: { row: 0, upTo: 10 } });
    await expect(performance.now() - started).toBeLessThan(500);
  },
};

// ---------- the real widget area (06 §1, §2): 960 × 600, portrait, tablet ----------

async function expectFits(canvasElement: HTMLElement, ageMode: AgeMode) {
  const root = await findWidget(canvasElement, ROOT);
  await settledAll(root);
  const parts = [...root.querySelectorAll<HTMLElement>('.ni-rk__frame, .ni-entry, .ni-rk__act')];
  await expectFitsArea(areaBox(canvasElement), parts, targetsOf(root), ageMode);
  await expectNumeralsInside(root);
  await expectFill(areaBox(canvasElement), parts);
  return root;
}

async function throughSteps(root: HTMLElement, ageMode: AgeMode, canvasElement: HTMLElement) {
  if (root.dataset.step !== 'rack') return;
  button(root, 'Next').focus();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(root.dataset.step).toBe('ask'));
  await waitFor(() => expect(document.activeElement).toBe(button(root, 'Go back')));
  await expectFits(canvasElement, ageMode);
  await userEvent.click(button(root, 'Go back'));
  await waitFor(() => expect(root.dataset.step).toBe('rack'));
}

/** CPS.02.t2 (show 6) in K at 960 × 600. */
export const AreaLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    await expectFits(canvasElement, 'k');
  },
};

/** ADD.17.t1 (add, then 0–20) in G1 at 960 × 600. */
export const AreaLandscapeMinAddG1: Story = {
  args: { config: add79 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'g1-up');
    await throughSteps(root, 'g1-up', canvasElement);
  },
};

/** SUB.07.t1 (read, 0–20) in G1 at 960 × 600. */
export const AreaLandscapeMinReadG1: Story = {
  args: { config: read11 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    await expectFits(canvasElement, 'g1-up');
  },
};

/** CPS.04.t2 (show 14, then 0–20) in K, portrait. */
export const AreaPortraitK: Story = {
  globals: { ageMode: 'k' },
  args: { config: teen14 },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    await throughSteps(root, 'k', canvasElement);
  },
};

/** CPS.03.t2 (make ten, one row) in K on a tablet. */
export const AreaTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: makeTen },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    await expectFits(canvasElement, 'k');
  },
};

/** ADD.08.t2 (make ten, then 0–20) in G1 on a tablet. */
export const AreaTabletG1: Story = {
  args: { config: add75 },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'g1-up');
    await throughSteps(root, 'g1-up', canvasElement);
  },
};

/** CPS.04.t2 in K at 960 × 600: show 14, then the 0–20 answer; neither step scrolls. */
export const AreaLandscapeMinTeenK: Story = {
  globals: { ageMode: 'k' },
  args: { config: teen14 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await expectFits(canvasElement, 'k');
    row(root, 0).focus();
    await userEvent.keyboard('{End}');
    row(root, 1).focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await throughSteps(root, 'k', canvasElement);
    if (root.dataset.step === 'rack') {
      await userEvent.click(button(root, 'Next'));
      await waitFor(() => expect(root.dataset.step).toBe('ask'));
    }
    // A picture of the rack in the answer step only where its beads stay ≥ 32 px.
    for (const b of root.querySelectorAll<HTMLElement>('.ni-rk__bead')) {
      await expect(b.getBoundingClientRect().width).toBeGreaterThanOrEqual(32);
    }
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
    await expect(cards).toHaveLength(21);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectFits(canvasElement, 'k');
    await userEvent.click(button(root, '14'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { rows: [10, 4], value: 14 },
    });
  },
};

/**
 * PR #93 F4: tap-only mode (06 §7 motor setting): pressing a bead and sliding the finger never
 * drags; the press is a tap where it started (the standard rekenrek move).
 */
export const TapOnly: Story = {
  globals: { tapOnly: 'on' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const b = bead(root, 0, 2);
    await pointerDrag(b, { x: center(b).x - 200, y: center(b).y }, 'touch');
    await waitFor(() => expect(pushed(root, 0)).toBe(3));
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual(['tap:bead-0-2']);
  },
};

const cancelController: WidgetDemo = createDemoController({ strict: true });

/**
 * PR #93 F4: a drag in progress is cancelled when input goes away (Pip starts a demo): the wire
 * goes back to where it was and lifting the finger afterwards does nothing.
 */
export const DemoCancelsDrag: Story = {
  args: { demo: cancelController },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const wire = row(root, 0);
    const from = center(bead(root, 0, 4));
    const init = (x: number, buttons: number): PointerEventInit => ({
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 41,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY: from.y,
      button: 0,
      buttons,
    });
    wire.dispatchEvent(new PointerEvent('pointerdown', init(from.x, 1)));
    for (let i = 1; i <= 6; i++) {
      wire.dispatchEvent(new PointerEvent('pointermove', init(from.x - 30 * i, 1)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    await waitFor(() => expect(pushed(root, 0)).toBe(5));
    await cancelController.play({ op: 'highlight', args: { row: 0, upTo: 3 } });
    await expect(pushed(root, 0)).toBe(0);
    wire.dispatchEvent(new PointerEvent('pointerup', init(from.x - 180, 0)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await expect(pushed(root, 0)).toBe(0);

    // PR #93 round 2 F3: a relative slide started (from an async callback) during a five-bead
    // preview moves from the row as it was before the drag (0 + 2), not from the preview (5 + 2);
    // lifting the finger afterwards leaves it at 2.
    const again = (x: number, buttons: number) => ({ ...init(x, buttons), pointerId: 42 });
    wire.dispatchEvent(new PointerEvent('pointerdown', again(from.x, 1)));
    for (let i = 1; i <= 6; i++) {
      wire.dispatchEvent(new PointerEvent('pointermove', again(from.x - 30 * i, 1)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    await waitFor(() => expect(pushed(root, 0)).toBe(5));
    await new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        cancelController
          .play({ op: 'slide', args: { row: 0, count: 2 } })
          .then(() => resolve(), reject);
      }, 0);
    });
    await expect(pushed(root, 0)).toBe(2);
    wire.dispatchEvent(new PointerEvent('pointerup', again(from.x - 180, 0)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await expect(pushed(root, 0)).toBe(2);
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual(['drag:bead-0-4', 'drag:bead-0-4']);
  },
};
