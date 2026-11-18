import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  spyAudio,
} from '../../test-support/storyHelpers';
import { findWidget, renderWidget, traceOf } from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `hundred-chart` (03 §5.5, Road Crew): find, next, fill, move and pattern on a 1–100, 1–120 or
 * 101–200 chart. Pictorial tier only.
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
const find: Config = { ...next, mode: 'find', from: undefined };
/** CNT.09.t1: fill 46, 47, 48 after 45. */
const fill: Config = { ...next, mode: 'fill', hidden: [46, 47, 48], from: 45 };
/** CNT.10.t1: a 101–200 chart. */
const fillHundreds: Config = {
  ...next,
  first: 101,
  mode: 'fill',
  hidden: [112, 113, 114],
  from: 111,
};
const move: Config = { ...next, mode: 'move', from: 23, moves: ['down', 'down', 'right'] };
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
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-hc';
const cell = (root: HTMLElement, n: number) =>
  root.querySelector(`.ni-hc__cell[data-n="${n}"]`) as HTMLElement;
const key = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;

/** Next: 12 has a start flag; tap 13 (it speaks), check → number 13. Cell size rule. */
export const Next: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-hc__cell')).toHaveLength(100);
    await expect(within(root).getByRole('button', { name: 'Start 12' })).toBeVisible();
    const check = within(root).getByRole('button', { name: 'Check' });
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
    // Cells: as large as fit (72 × 50 px), wider than the 64 px rule and ≥ 48 px tall.
    const r = cell(root, 13).getBoundingClientRect();
    await expect(r.width).toBeGreaterThanOrEqual(64);
    await expect(r.height).toBeGreaterThanOrEqual(48);
    await expectTargetSize(check, 'g1-up');
  },
};

/** Find in K mode: the chart fits beside a K-sized check button. */
export const FindK: Story = {
  globals: { ageMode: 'k' },
  args: { config: find },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(cell(root, 37));
    await userEvent.click(cell(root, 73));
    const check = within(root).getByRole('button', { name: 'Check' });
    await expectTargetSize(check, 'k');
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 73 });
  },
};

/**
 * Fill: type 46, 47, 48 on the pad; the active blank moves on by itself; tapping a blank chooses
 * it. Enter on an unfinished chart sends nothing; then a double Enter and Check submit once.
 */
export const Fill: Story = {
  args: { config: fill },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(cell(root, 46)).toHaveAttribute('aria-current', 'true');
    // A blank never says its number.
    await userEvent.click(cell(root, 47));
    await expect(audio.sayPhrases).not.toHaveBeenCalled();
    await expect(cell(root, 47)).toHaveAttribute('aria-current', 'true');
    await userEvent.click(key(root, '4'));
    await userEvent.click(key(root, '7'));
    await expect(cell(root, 48)).toHaveAttribute('aria-current', 'true');
    // Desktop keys with nothing focused (Enter on a focused pad key presses that key).
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('48');
    await expect(cell(root, 46)).toHaveAttribute('aria-current', 'true');
    await userEvent.keyboard('46');
    await expect(within(root).getByRole('button', { name: 'Missing number: 46' })).toBeVisible();
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'numbers', values: [46, 47, 48] });
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const k of keys) await expectTargetSize(k, 'g1-up');
    await expectTargetGaps(keys);
  },
};

/** A 101–200 chart (CNT.10.t1): three-digit numerals fit their cells. */
export const FillHundreds: Story = {
  args: { config: fillHundreds },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(cell(root, 200)).toHaveTextContent('200');
    await userEvent.keyboard('112113114');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'numbers',
      values: [112, 113, 114],
    });
  },
};

/** Move: start at 23, follow down, down, right (arrow icons), tap the landing. */
export const Move: Story = {
  args: { config: move },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const moves = within(root).getByRole('list', { name: 'Moves' });
    await expect(within(moves).getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(cell(root, 44));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
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
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { values: [5, 10, 15] },
    });
  },
};

/** A 1–120 chart (12 rows). */
export const Chart120: Story = {
  args: { config: chart120 },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-hc__cell')).toHaveLength(120);
    await expect(cell(root, 120)).toHaveTextContent('120');
  },
};

/** Keyboard: one tab stop on the chart, arrows move between cells, Enter taps. */
export const Keyboard: Story = {
  args: { config: find },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    cell(root, 1).focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}');
    await waitFor(() => expect(document.activeElement).toBe(cell(root, 22)));
    await expect(cell(root, 22)).toHaveAttribute('tabindex', '0');
    await expect(cell(root, 1)).toHaveAttribute('tabindex', '-1');
    await userEvent.keyboard('{Enter}');
    await expect(cell(root, 22)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 22 });
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

/** Demo (the CNT.09.t1 solution): highlight the row, fill the blanks, answer; then invite. */
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
    demoController.invite({ op: 'tap', args: { n: 47 } });
    await waitFor(() => expect(cell(root, 47).classList.contains('ni-invite')).toBe(true));
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: instant; `answer` replaces every entry (unnamed blanks clear). */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: fill, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'answer', args: { values: [46, 47, 48] } });
    await reducedController.play({ op: 'slide', args: { dir: 'down' } });
    await expect(performance.now() - started).toBeLessThan(500);
    await reducedController.play({ op: 'answer', args: { values: [46] } });
    await expect(cell(root, 46)).toHaveTextContent('46');
    await expect(cell(root, 47)).toHaveTextContent('');
  },
};
