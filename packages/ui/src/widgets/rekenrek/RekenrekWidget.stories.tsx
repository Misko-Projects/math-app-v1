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
import {
  expectTraceOrdered,
  findWidget,
  renderWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `rekenrek` (03 §5.5, concrete): tap or drag beads along the wires; keyboard on each row. Answers
 * `{ rows, value? }` (or a number for `read`) through the engine model.
 */

type Config = ConfigFor<'rekenrek'>;

/** CPS.02.t2: show 6 on two rows (a split). */
const show6: Config = {
  format: 'rekenrek',
  rows: 2,
  preset: [0, 0],
  mode: 'show',
  target: 6,
  rowRule: 'any',
  thenAsk: null,
};

/** CPS.03.t2: 4 are over; make ten (one row, fill the top row first). */
const makeTen: Config = {
  format: 'rekenrek',
  rows: 1,
  preset: [4, 0],
  mode: 'make-ten',
  target: 10,
  rowRule: 'fill-top-first',
  thenAsk: null,
};

/** 7 + 5 on two rows, then how many in all? (the pad answers up to 20) */
const add75: Config = {
  format: 'rekenrek',
  rows: 2,
  preset: [0, 0],
  mode: 'add',
  target: 12,
  a: 7,
  b: 5,
  rowRule: 'fill-top-first',
  thenAsk: 'total',
};

/** Read: how many beads are over? */
const read7: Config = {
  format: 'rekenrek',
  rows: 1,
  preset: [7, 0],
  mode: 'read',
  rowRule: 'any',
  thenAsk: null,
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

/** Beads glide (320 ms): wait before measuring where one is drawn. */
const settle = () => new Promise((r) => setTimeout(r, 400));

/** A tap (pointer down and up, no movement) on bead `i`, by mouse or touch. */
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
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
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

/** Make ten (CPS.03.t2), K mode: the row is a ≥ 80 px target; a tap speaks the count. */
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
    await expectTargetSize(within(root).getByRole('button', { name: 'Check' }), 'k');
    await expect(pushed(root, 0)).toBe(4);
    await tapBeadAt(bead(root, 0, 9), 'touch');
    await waitFor(() => expect(pushed(root, 0)).toBe(10));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 10 }]);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
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
 * 7 + 5 then how many (thenAsk total, up to 20: the pad). Enter before the number does nothing;
 * a double Enter and Enter-then-Check inside 400 ms submit once (06 §4).
 */
export const AddThenTotal: Story = {
  args: { config: add75 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    row(root, 0).focus();
    await userEvent.keyboard('{End}');
    await settle();
    await tapBeadAt(bead(root, 1, 1));
    await waitFor(() => expect(pushed(root, 1)).toBe(2));
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('12');
    await expect(within(root).getByRole('button', { name: 'Your answer: 12' })).toBeVisible();
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { rows: [10, 2], value: 12 },
    });
  },
};

/** Read: the preset beads are a picture; pick how many (0–10). */
export const Read: Story = {
  globals: { ageMode: 'k' },
  args: { config: read7 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).queryByRole('slider')).toBeNull();
    await expect(within(root).getByRole('img', { name: 'Top row' })).toBeVisible();
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await userEvent.click(within(root).getByRole('button', { name: '7' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 7 });
  },
};

/** `fill-top-first` never blocks a move (the checker judges): the bottom row slides first too. */
export const RowRuleNeverBlocks: Story = {
  args: { config: topFirst },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapBeadAt(bead(root, 1, 2));
    await waitFor(() => expect(pushed(root, 1)).toBe(3));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'state', value: { rows: [0, 3] } });
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await tapBeadAt(bead(root, 0, 4));
    row(root, 0).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(pushed(root, 0)).toBe(0);
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3): Pip slides beads over, highlights them and counts them all. */
export const DemoMode: Story = {
  args: { config: add75, disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'slide', args: { row: 0, count: 7 } });
    await expect(pushed(root, 0)).toBe(7);
    await demoController.play({ op: 'slide', args: { row: 1, count: 5 } });
    await demoController.play({ op: 'highlight', args: { row: 0, upTo: 5 } });
    await demoController.play({ op: 'count-total' });
    await waitFor(() =>
      expect(within(root).getByRole('button', { name: 'Your answer: 12' })).toBeVisible(),
    );
    await expect(demoController.play({ op: 'place' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'slide', args: { row: 1, count: -2 } });
    await waitFor(() => expect(root.querySelector('.ni-rk__row.ni-invite')).not.toBeNull());
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: slides are instant state changes. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: makeTen, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'slide', args: { row: 0, count: 6 } });
    await reducedController.play({ op: 'highlight', args: { row: 0, upTo: 10 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await waitFor(() => expect(pushed(root, 0)).toBe(10));
  },
};
