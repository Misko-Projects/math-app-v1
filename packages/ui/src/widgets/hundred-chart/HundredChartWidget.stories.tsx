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
  expectHandOffGlyphsOf,
  expectInside,
  expectNoScroll,
  expectPointerOn,
  expectRingClear,
  findWidget,
  inArea,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `hundred-chart` (03 §5.5, Road Crew): find, next, fill, move and pattern on a 1–100, 1–120 or
 * 101–200 chart, shown as a window of whole rows with row stepping. Pictorial tier only. The
 * fixtures mirror the K01 generators (CNT.01 next, CNT.07/09/10/16/18 fill, CNT.20, MDA.01/02 and
 * PV.03 move, CPS.09 find); pattern has no generator yet.
 */

type Config = ConfigFor<'hundred-chart'>;

/** CNT.01.t1: what number comes after 12? */
const next: Config = {
  format: 'hundred-chart',
  first: 1,
  rows: 10,
  hidden: [],
  mode: 'next',
  from: 12,
};
/** CPS.09.t2: 30 and what number make 100? Tap it. */
const find: Config = { ...next, mode: 'find', from: undefined };
/** CNT.09.t1: fill 46, 47, 48 after 45. */
const fill: Config = { ...next, mode: 'fill', hidden: [46, 47, 48], from: 45 };
/** CNT.09.t2: count by tens: 20, 30, 40, 50 after 10 (five rows). */
const fillTens: Config = { ...next, mode: 'fill', hidden: [20, 30, 40, 50], from: 10 };
/** CNT.10.t1: a 101–200 chart. */
const fillHundreds: Config = {
  ...next,
  first: 101,
  mode: 'fill',
  hidden: [112, 113, 114],
  from: 111,
};
/** CNT.10.t1 on a 1–120 chart: across 100. */
const fillAcross100: Config = { ...next, rows: 12, mode: 'fill', hidden: [99, 100, 101], from: 98 };
/** CNT.20.t1: start at 23, down, down, right. */
const move: Config = { ...next, mode: 'move', from: 23, moves: ['down', 'down', 'right'] };
/** MDA.02.t2: start at 95, up nine times (95 − 90). */
const moveUp: Config = {
  ...next,
  mode: 'move',
  from: 95,
  moves: ['up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up'],
};
const pattern: Config = {
  ...next,
  mode: 'pattern',
  from: undefined,
  patternStep: 5,
  patternStart: 5,
};
const chart120: Config = { ...find, rows: 12 };

const meta = {
  title: 'Widgets/Hundred chart',
  args: {
    config: next as WidgetConfig,
    tier: 'pictorial',
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

const ROOT = '.ni-hc';
const cell = (root: HTMLElement, n: number) =>
  root.querySelector(`.ni-hc__cell[data-n="${n}"]`) as HTMLElement;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const step = (root: HTMLElement, dir: 'up' | 'down') =>
  root.querySelector(`.ni-hc__step[data-dir="${dir}"]`) as HTMLElement;
const checkBtn = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const typeKeys = async (root: HTMLElement, digits: string) => {
  for (const d of digits) await userEvent.click(key(root, d));
};

/**
 * Maths truth: the cell at row r, column c shows first + 10(r − 1) + (c − 1) (10(r − 1) + c on a
 * 1–100 chart); every column is one straight line of cells and every row one level line.
 */
async function expectTruthfulChart(root: HTMLElement, c: Config) {
  const cells = [...root.querySelectorAll<HTMLElement>('.ni-hc__cell')];
  await expect(cells.length % 10).toBe(0);
  const lefts = new Map<string, number>();
  const tops = new Map<string, number>();
  for (const el of cells) {
    const r = Number(el.dataset.row);
    const col = Number(el.dataset.col);
    const n = c.first + 10 * (r - 1) + (col - 1);
    await expect(Number(el.dataset.n), `row ${r}, column ${col}`).toBe(n);
    if (!c.hidden.includes(n)) {
      await expect(el.querySelector('.ni-hc__num')?.textContent, `cell ${n}`).toBe(String(n));
    }
    const b = el.getBoundingClientRect();
    const left = lefts.get(String(col));
    if (left === undefined) lefts.set(String(col), b.left);
    else await expect(Math.abs(b.left - left)).toBeLessThan(0.5);
    const top = tops.get(String(r));
    if (top === undefined) tops.set(String(r), b.top);
    else await expect(Math.abs(b.top - top)).toBeLessThan(0.5);
  }
  // Every cell lies fully inside the chart frame's visible (content) box: nothing clipped.
  const frame = contentBox(root.querySelector('.ni-hc__chart') as HTMLElement);
  for (const el of cells) {
    await expectInside(el.getBoundingClientRect(), frame, 0, `cell ${el.dataset.n} in the frame`);
  }
  // Rows run down the screen in order, columns left to right.
  const rowTops = [...tops.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map((e) => e[1]);
  for (let i = 1; i < rowTops.length; i++) {
    await expect(rowTops[i] as number).toBeGreaterThan(rowTops[i - 1] as number);
  }
  const colLefts = [...lefts.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map((e) => e[1]);
  for (let i = 1; i < colLefts.length; i++) {
    await expect(colLefts[i] as number).toBeGreaterThan(colLefts[i - 1] as number);
  }
}

/** Steps the window until `n` is shown. */
async function showCell(root: HTMLElement, n: number) {
  for (let i = 0; i < 12 && !cell(root, n); i++) {
    const firstShown = Number(root.querySelector<HTMLElement>('.ni-hc__cell')?.dataset.n);
    await userEvent.click(step(root, n < firstShown ? 'up' : 'down'));
  }
  await expect(cell(root, n)).not.toBeNull();
}

/** Next (G1): 12 has a start flag; tap 13 (it speaks), check → number 13. Cell size rule. */
export const Next: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-cells', 'tap');
    await expectTruthfulChart(root, next);
    await expect(within(root).getByRole('button', { name: 'Start 12' })).toBeVisible();
    const check = checkBtn(root);
    await expect(check).toBeDisabled();
    await userEvent.click(cell(root, 13));
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 13 }]);
    await expect(cell(root, 13)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 13 });
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:cell-13',
    ]);
    const cells = [...root.querySelectorAll<HTMLElement>('button.ni-hc__cell')];
    for (const el of cells.slice(0, 20)) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(cells.slice(0, 20));
    await expectTargetSize(check, 'g1-up');
  },
};

/** Find in K mode: K-size cells; 90 is further down, so step the rows to it. */
export const FindK: Story = {
  globals: { ageMode: 'k' },
  args: { config: find },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-cells', 'tap');
    await expectTruthfulChart(root, find);
    await expect(cell(root, 90)).toBeNull();
    await showCell(root, 90);
    await expectTruthfulChart(root, find);
    await userEvent.click(cell(root, 90));
    const check = checkBtn(root);
    await expectTargetSize(check, 'k');
    await expectTargetSize(cell(root, 90), 'k');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 90 });
    await expect(traceOf(args.onInteract).some((e) => e.target === 'rows-down')).toBe(true);
  },
};

/**
 * Fill: type 46, 47, 48 on the pad; the blank being filled moves on by itself, backspace on an
 * empty blank goes back. Enter on an unfinished chart sends nothing; then a double Enter and
 * Check submit once. A blank never says its number.
 */
export const Fill: Story = {
  args: { config: fill },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expectTruthfulChart(root, fill);
    await expect(cell(root, 46)).toHaveAttribute('data-active', 'true');
    await typeKeys(root, '46');
    await expect(cell(root, 47)).toHaveAttribute('data-active', 'true');
    await userEvent.click(key(root, 'back'));
    await expect(cell(root, 46)).toHaveAttribute('data-active', 'true');
    await userEvent.click(key(root, 'back'));
    await userEvent.click(key(root, 'back'));
    await expect(cell(root, 46).querySelector('.ni-hc__num')).toHaveTextContent('');
    // Desktop keys with nothing focused (Enter on a focused pad key presses that key).
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('464748');
    await expect(within(root).getByText('Missing number: 48')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [46, 47, 48] });
    await expect(audio.sayPhrases).not.toHaveBeenCalledWith([{ number: 46 }]);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);
  },
};

/** A 101–200 chart (CNT.10.t1): row r, column c holds 100 + 10(r − 1) + c. */
export const FillHundreds: Story = {
  args: { config: fillHundreds },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectTruthfulChart(root, fillHundreds);
    await expect(cell(root, 101)).toHaveAttribute('data-col', '1');
    await userEvent.keyboard('112113114');
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [112, 113, 114],
    });
  },
};

/** Move (CNT.20): start at 23, follow down, down, right (arrow tiles), tap the landing. */
export const Move: Story = {
  args: { config: move },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const moves = within(root).getByRole('list', { name: 'Moves' });
    await expect(within(moves).getAllByRole('listitem')).toHaveLength(3);
    await showCell(root, 44);
    await userEvent.click(cell(root, 44));
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 44 });
  },
};

/** Pattern: tap 5, 10, 15 and 20, untap 20 → state { values } (sorted). */
export const Pattern: Story = {
  args: { config: pattern },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const n of [10, 5, 15, 20, 20]) await userEvent.click(cell(root, n));
    await expect(cell(root, 20)).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [5, 10, 15] },
    });
  },
};

/** A 1–120 chart (12 rows): stepping reaches 120, in row 12, column 10. */
export const Chart120: Story = {
  args: { config: chart120 },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await showCell(root, 120);
    await expect(cell(root, 120)).toHaveAttribute('data-row', '12');
    await expect(cell(root, 120)).toHaveAttribute('data-col', '10');
    await expectTruthfulChart(root, chart120);
    await expect(step(root, 'down')).toBeDisabled();
  },
};

/** Keyboard: one tab stop, arrows move between cells (the window follows), Enter taps. */
const keyboardDemo: WidgetDemo = createDemoController({ strict: true });

/**
 * Keyboard: one tab stop, arrows move between cells (the window follows), Enter taps. Focus
 * moves only with an arrow key (review F1): a row stepper and Check keep the focus they get,
 * even while the chart re-renders.
 */
export const Keyboard: Story = {
  // A 1–120 chart: "go down" stays enabled after one step, so it can keep its focus.
  args: { config: chart120, demo: keyboardDemo },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    cell(root, 1).focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}');
    await waitFor(() => expect(document.activeElement).toBe(cell(root, 22)));
    await expect(cell(root, 22)).toHaveAttribute('tabindex', '0');
    await expect(cell(root, 1)).toHaveAttribute('tabindex', '-1');
    // Go down with 22 still in view: the stepper keeps the focus.
    await userEvent.click(step(root, 'down'));
    await expect(cell(root, 22)).not.toBeNull();
    await new Promise((r) => requestAnimationFrame(r));
    await expect(document.activeElement).toBe(step(root, 'down'));
    cell(root, 22).focus();
    for (let i = 0; i < 7; i++) await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toBe(cell(root, 92)));
    await userEvent.keyboard('{Enter}');
    await expect(cell(root, 92)).toHaveAttribute('aria-pressed', 'true');
    // Check keeps focus through an unrelated render (a lesson's invite appearing).
    checkBtn(root).focus();
    keyboardDemo.invite({ op: 'tap', args: { n: 92 } });
    await waitFor(() => expect(checkBtn(root)).toHaveClass('ni-invite'));
    await new Promise((r) => requestAnimationFrame(r));
    await expect(document.activeElement).toBe(checkBtn(root));
    keyboardDemo.invite(null);
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 92 });
  },
};

/** Review F2: an unsorted hidden list [48, 46, 47] answers its blanks in reading order. */
export const FillUnsortedHidden: Story = {
  args: { config: { ...fill, hidden: [48, 46, 47] } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(cell(root, 46)).toHaveAttribute('data-active', 'true');
    await typeKeys(root, '464748');
    for (const n of [46, 47, 48]) {
      await expect(cell(root, n).querySelector('.ni-hc__num')).toHaveTextContent(String(n));
    }
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [46, 47, 48] });
  },
};

const fillTapInvite: WidgetDemo = createDemoController({ strict: true });

/** Review F3: with 46 filled, a tap invite on 47 rings 4, then 7 (filled and other blanks skipped). */
export const InviteFillTapAfterFilled: Story = {
  args: { config: fill, demo: fillTapInvite },
  // In the tablet's widget area: the whole widget is on one screen.
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectHcFits(canvasElement, root, 'g1-up');
    await typeKeys(root, '46');
    await expect(cell(root, 47)).toHaveAttribute('data-active', 'true');
    fillTapInvite.invite({ op: 'tap', args: { n: 47 } });
    await expectInviteOn(root, key(root, '4'));
    await userEvent.click(key(root, '4'));
    await expectInviteOn(root, key(root, '7'));
  },
};

const inactiveInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Review r2 F1: a tap invite on 47 while 46 is the empty blank being filled: 47 becomes the blank
 * being filled, and the ring goes to 4, then 7.
 */
export const InviteFillInactiveBlank: Story = {
  args: { config: fill, demo: inactiveInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(cell(root, 46)).toHaveAttribute('data-active', 'true');
    inactiveInvite.invite({ op: 'tap', args: { n: 47 } });
    await waitFor(() => expect(cell(root, 47)).toHaveAttribute('data-active', 'true'));
    await expectInviteOn(root, key(root, '4'));
    await userEvent.click(key(root, '4'));
    await expectInviteOn(root, key(root, '7'));
  },
};

const wrongEntryInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * Review r2 F1: 45 typed into blank 46 (the caret moved on to 47), then the answer invite: 46
 * becomes the blank being filled again, the ring is on backspace, then 6, and on through 48 to Check.
 */
export const InviteFillAfterWrongEntry: Story = {
  args: { config: fill, demo: wrongEntryInvite },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await typeKeys(root, '45');
    await expect(cell(root, 47)).toHaveAttribute('data-active', 'true');
    wrongEntryInvite.invite({ op: 'answer', args: { values: [46, 47, 48] } });
    await waitFor(() => expect(cell(root, 46)).toHaveAttribute('data-active', 'true'));
    await expectInviteOn(root, key(root, 'back'));
    await userEvent.click(key(root, 'back'));
    await expectInviteOn(root, key(root, '6'));
    await userEvent.click(key(root, '6'));
    for (const k of ['4', '7', '4', '8']) {
      await expectInviteOn(root, key(root, k));
      await userEvent.click(key(root, k));
    }
    await expectInviteOn(root, checkBtn(root));
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [46, 47, 48] });
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(cell(root, 13)).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo (the CNT.09.t1 solution): highlight the row, fill the blanks, answer. Disabled: no cue. */
export const DemoMode: Story = {
  args: { config: fill, disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'highlight-row', args: { n: 45 } });
    await expect(root.querySelector('.ni-hc__band')).not.toBeNull();
    await demoController.play({ op: 'highlight-col', args: { n: 45 } });
    await demoController.play({ op: 'tap', args: { n: 46 } });
    await expect(cell(root, 46)).toHaveTextContent('46');
    await demoController.play({ op: 'slide', args: { dir: 'right' } });
    await expect(root.querySelector('.ni-hc__token')).not.toBeNull();
    await demoController.play({ op: 'answer', args: { values: [46, 47, 48] } });
    await expect(cell(root, 48)).toHaveTextContent('48');
    await expect(demoController.play({ op: 'hop' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'answer', args: { values: [46, 47, 48] } });
    await new Promise((r) => setTimeout(r, 100));
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: instant; `answer` replaces every entry (unnamed blanks clear). */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: fill, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await reducedController.play({ op: 'answer', args: { values: [46, 47, 48] } });
    await reducedController.play({ op: 'slide', args: { dir: 'down' } });
    await reducedController.play({ op: 'answer', args: { values: [46] } });
    await expect(cell(root, 46)).toHaveTextContent('46');
    await expect(cell(root, 47).querySelector('.ni-hc__num')).toHaveTextContent('');
  },
};

// ---------- invites (03 §6.3) ----------

/** Every target the widget shows. */
function targets(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>('button.ni-hc__cell'),
    ...root.querySelectorAll<HTMLElement>('.ni-hc__step, .ni-hc__mark'),
    ...root.querySelectorAll<HTMLElement>('.ni-pad__key'),
    root.querySelector<HTMLElement>('.ni-hc__checkslot .ni-btn'),
  ].filter((el): el is HTMLElement => el !== null);
}

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
  await expectHandOffGlyphsOf(
    root.querySelector('.ni-hand') as HTMLElement,
    [...root.querySelectorAll('button, .ni-nlp__marker')].filter((t) => t !== el),
  );
  await expectRingClear(
    el,
    targets(root).filter((t) => t !== el),
  );
}

const findInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * G1 at the minimum, CPS.09 `tap {n: 70}`: 70 is below the window, so the ring is on "go down"
 * until 70 shows; then on the cell; once it is picked, on Check.
 */
export const InviteFindG1MinLandscape: Story = {
  args: { config: find, demo: findInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    findInvite.invite({ op: 'tap', args: { n: 70 } });
    for (let i = 0; i < 10 && !cell(root, 70); i++) {
      await expectInviteOn(root, step(root, 'down'));
      await userEvent.click(step(root, 'down'));
    }
    await expectInviteOn(root, cell(root, 70));
    await userEvent.click(cell(root, 70));
    await expectInviteOn(root, checkBtn(root));
    await expectHcFits(canvasElement, root, 'g1-up');
  },
};

const fillInvite: WidgetDemo = createDemoController({ strict: true });

/** G1 fill at the minimum: the invite rings the next key of the blank being filled, then Check. */
export const InviteFillG1MinLandscape: Story = {
  args: { config: fill, demo: fillInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    fillInvite.invite({ op: 'answer', args: { values: [46, 47, 48] } });
    await expectInviteOn(root, key(root, '4'));
    await userEvent.click(key(root, '4'));
    await expectInviteOn(root, key(root, '6'));
    await userEvent.click(key(root, '6'));
    await typeKeys(root, '4748');
    await expectInviteOn(root, checkBtn(root));
    await expectHcFits(canvasElement, root, 'g1-up');
  },
};

// ---------- the workshop's widget area (06 §1, §2) ----------

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

async function expectHcFits(
  canvasElement: HTMLElement,
  root: HTMLElement,
  age: 'k' | 'g1-up',
  fits: 'true' | 'at-rest' = 'true',
) {
  await waitForSettled(root);
  await expect(root).toHaveAttribute('data-fits', fits);
  const parts = [
    ...root.querySelectorAll('.ni-hc__chart, .ni-hc__moves, .ni-hc__map, .ni-hc__readout'),
    ...root.querySelectorAll('.ni-hc__checkslot, .ni-hc__padcell'),
  ];
  await expectFitsArea(areaBox(canvasElement), parts, targets(root), age);
  await expectFill(canvasElement, parts);
}

/** K at the 960 × 600 minimum, CNT.01 next: ten K cells don't fit across, so 13 is typed. */
export const NextKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-cells', 'type');
    await expectHcFits(canvasElement, root, 'k');
    await expectTruthfulChart(root, next);
    await typeKeys(root, '13');
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 13 });
  },
};

const tensInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * K fill at the minimum (CNT.09.t2 tens): the window follows the blank being filled. Review F4:
 * an answer invite on the bottom-row 0 key keeps Pip's hand inside the area card (it may hang
 * into the card's padding, covering nothing) and nothing scrolls.
 */
export const FillTensKMinLandscape: Story = {
  globals: { ageMode: 'k' },
  args: { config: fillTens, demo: tensInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectHcFits(canvasElement, root, 'k');
    tensInvite.invite({ op: 'answer', args: { values: [20, 30, 40, 50] } });
    await waitFor(() => expect(key(root, '2')).toHaveClass('ni-invite'));
    await userEvent.click(key(root, '2'));
    (document.activeElement as HTMLElement | null)?.blur();
    await waitFor(() => expect(key(root, '0')).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await waitForSettled(key(root, '0'));
    await new Promise((r) => requestAnimationFrame(r));
    const hand = root.querySelector('.ni-hand') as HTMLElement;
    // The fingertip on 0, clear of its digit, the hand (bob included) inside the area card.
    await expectPointerOn(hand, key(root, '0'), areaBox(canvasElement));
    await expectHandOffGlyphsOf(
      hand,
      [...root.querySelectorAll('button')].filter((b) => b !== key(root, '0')),
    );
    await expectHcFits(canvasElement, root, 'k');
    await expectTruthfulChart(root, fillTens);
    // Type the rest (the window follows the blanks) and check; the invite stays on, so the story
    // ends with its one ring and Pip's hand on Check.
    await typeKeys(root, '0304050');
    await expect(cell(root, 50)).not.toBeNull();
    await expectTruthfulChart(root, fillTens);
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [20, 30, 40, 50],
    });
    (document.activeElement as HTMLElement | null)?.blur();
    await waitFor(() => expect(checkBtn(root)).toHaveClass('ni-invite'));
    await expect(root.querySelectorAll('.ni-invite')).toHaveLength(1);
    await waitForSettled(checkBtn(root));
    await new Promise((r) => requestAnimationFrame(r));
    // The hand may hang into the card's padding here (minimum-area relief): inside the card.
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      checkBtn(root),
      areaBox(canvasElement),
    );
    await expectRingClear(
      checkBtn(root),
      targets(root).filter((t) => t !== checkBtn(root)),
    );
    await expectNoScroll(areaBox(canvasElement));
  },
};

/** G1 fill across 100 on a 1–120 chart (CNT.10.t1) at the minimum. */
export const FillAcross100G1MinLandscape: Story = {
  args: { config: fillAcross100 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectHcFits(canvasElement, root, 'g1-up');
    await expectTruthfulChart(root, fillAcross100);
    await expect(cell(root, 100)).not.toBeNull();
    await expect(cell(root, 101)).not.toBeNull();
  },
};

/** G1 move up nine (MDA.02) at the minimum: tappable cells, the moves strip, step up to 5. */
export const MoveUpG1MinLandscape: Story = {
  args: { config: moveUp },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-cells', 'tap');
    await expectHcFits(canvasElement, root, 'g1-up');
    await expect(cell(root, 95)).not.toBeNull();
    await showCell(root, 5);
    await expectTruthfulChart(root, moveUp);
    await userEvent.click(cell(root, 5));
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 5 });
    await expectHcFits(canvasElement, root, 'g1-up');
  },
};

/** K pattern in portrait (typed: ten K cells don't fit across): type a number and mark it. */
export const PatternKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: pattern },
  render: inArea('portrait'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-cells', 'type');
    await expectHcFits(canvasElement, root, 'k');
    for (const n of ['5', '10']) {
      await typeKeys(root, n);
      await userEvent.click(within(root).getByRole('button', { name: 'Mark it' }));
    }
    await expect(cell(root, 10)).toHaveAttribute('data-selected', 'true');
    await userEvent.click(checkBtn(root));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [5, 10] },
    });
  },
};

/** Portrait, G1 find: ten 64 px cells don't fit 692 px, so the answer is typed under the chart. */
export const FindG1Portrait: Story = {
  args: { config: find },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectHcFits(canvasElement, root, 'g1-up');
    await expectTruthfulChart(root, find);
  },
};

/** Portrait, K fill. */
export const FillKPortrait: Story = {
  globals: { ageMode: 'k' },
  args: { config: fill },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectHcFits(canvasElement, root, 'k');
    await expectTruthfulChart(root, fill);
  },
};

/** Tablet, K find: K cells fit across 1226 px. */
export const FindKTablet: Story = {
  globals: { ageMode: 'k' },
  args: { config: find },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root).toHaveAttribute('data-cells', 'tap');
    await expectHcFits(canvasElement, root, 'k');
  },
};

/** Tablet, G1 fill on 101–200. */
export const FillHundredsG1Tablet: Story = {
  args: { config: fillHundreds },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectHcFits(canvasElement, root, 'g1-up');
    await expectTruthfulChart(root, fillHundreds);
  },
};
