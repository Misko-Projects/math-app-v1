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
 * `tenframe-fill` (03 §5.5): concrete (drag counters from the tray into the cells; tap a placed
 * counter to take it back) and pictorial (tap cells to shade them). `thenAsk` adds a numeral
 * answer. Responds `{ cells, value? }` through the engine model.
 */

type Config = ConfigFor<'tenframe-fill'>;

/** ADD.01.t3: 6 and 3 more, how many in all? */
const add63: Config = {
  format: 'tenframe-fill',
  frames: 1,
  size: 10,
  prefilled: [{ frame: 0, color: 'a', count: 6 }],
  goal: 'add',
  a: 6,
  b: 3,
  requireStandardFill: false,
  thenAsk: 'total',
  skin: 'frame',
};

/** SUB.03.t1: show 7 the standard way. */
const show7Standard: Config = {
  format: 'tenframe-fill',
  frames: 1,
  size: 10,
  prefilled: [],
  goal: 'show-n',
  n: 7,
  requireStandardFill: true,
  thenAsk: null,
  skin: 'frame',
};

/** CPS.02.t1: split 7 across two frames. */
const split7: Config = {
  format: 'tenframe-fill',
  frames: 2,
  size: 10,
  prefilled: [],
  goal: 'show-n',
  n: 7,
  requireStandardFill: false,
  thenAsk: null,
  skin: 'frame',
};

/** CNT.14.t2: one more than 10, then how many? (two frames, answer on the pad) */
const oneMore10: Config = {
  format: 'tenframe-fill',
  frames: 2,
  size: 10,
  prefilled: [{ frame: 0, color: 'a', count: 10 }],
  goal: 'one-more',
  n: 11,
  requireStandardFill: false,
  thenAsk: 'total',
  skin: 'frame',
};

/** CNT.04.t3 (pictorial): shade 3. */
const shade3: Config = {
  format: 'tenframe-fill',
  frames: 1,
  size: 10,
  prefilled: [],
  goal: 'show-n',
  n: 3,
  requireStandardFill: false,
  thenAsk: null,
  skin: 'frame',
};

/** CPS.03.t1 on a Pebbling shell: 8 and how many more make ten? */
const makeTenShell: Config = {
  format: 'tenframe-fill',
  frames: 1,
  size: 10,
  prefilled: [{ frame: 0, color: 'a', count: 8 }],
  goal: 'make-ten',
  requireStandardFill: false,
  thenAsk: 'missing',
  skin: 'shell',
};

/** A five-frame: show 4. */
const fiveFrame: Config = {
  format: 'tenframe-fill',
  frames: 1,
  size: 5,
  prefilled: [],
  goal: 'show-n',
  n: 4,
  requireStandardFill: false,
  thenAsk: 'total',
  skin: 'frame',
};

/** Take away: 7, take 2 away (prefilled counters can be taken off). */
const takeAway: Config = {
  format: 'tenframe-fill',
  frames: 1,
  size: 10,
  prefilled: [{ frame: 0, color: 'a', count: 7 }],
  goal: 'subtract',
  n: 5,
  requireStandardFill: false,
  thenAsk: null,
  skin: 'frame',
};

const meta = {
  title: 'Widgets/Ten frame fill',
  args: {
    config: add63 as WidgetConfig,
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

const ROOT = '.ni-tf';
const trayCounter = (root: HTMLElement, id: number) =>
  root.querySelector(`.ni-tf__tray [data-counter="${id}"]`) as HTMLElement;
const pad = (root: HTMLElement, frame: number, index: number) =>
  root.querySelector(`[data-cell="cell-${frame}-${index}"] .ni-tf__pad`) as HTMLElement;
const cellsOf = (root: HTMLElement, frame = 0) =>
  [...root.querySelectorAll(`[data-frame="${frame}"] .ni-tf__cell`)].map((c) =>
    c.getAttribute('data-filled') === 'true' ? 1 : 0,
  );

/**
 * Concrete add (ADD.01.t3): drag one counter with the mouse, one by touch, tap-to-place the third,
 * then pick 9. Check stays off until the number is picked; one `{ cells, value }` response.
 */
export const AddDragAndTap: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    const check = canvas.getByRole('button', { name: 'Check' });
    await expect(root.querySelectorAll('.ni-tf__tray .ni-tf__counter')).toHaveLength(3);
    // Colour b differs by a mark too (an ink ring), not only by colour (06 §7).
    await expect(root.querySelector('.ni-tf__tray [data-mark="ring"]')).not.toBeNull();

    await pointerDrag(trayCounter(root, 6), center(pad(root, 0, 6)), 'mouse');
    await waitFor(() => expect(cellsOf(root)).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 0, 0]));
    await pointerDrag(trayCounter(root, 7), center(pad(root, 0, 9)), 'touch');
    await waitFor(() => expect(cellsOf(root)[9]).toBe(1));
    // Tap-to-place: tap the counter, then the cell.
    await userEvent.click(trayCounter(root, 8));
    await userEvent.click(pad(root, 0, 7));
    await waitFor(() => expect(cellsOf(root)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0, 1]));
    await expect(root.querySelectorAll('.ni-tf__tray .ni-tf__counter')).toHaveLength(0);

    await expect(check).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '9' }));
    await userEvent.click(check);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 1, 1, 1, 1, 1, 2, 2, 0, 2]], value: 9 },
    });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:counter-6',
      'drop:cell-0-6',
      'drag:counter-7',
      'drop:cell-0-9',
      'tap:counter-8',
      'tap:cell-0-7',
      'tap:opt-9',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Keyboard (06 §7): Enter on a tray counter picks it up and moves focus to the first free cell;
 * Enter puts it there. A placed counter is a button: Enter takes it back (an `undo`).
 */
export const Keyboard: Story = {
  args: { config: show7Standard },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    trayCounter(root, 0).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(pad(root, 0, 0)));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cellsOf(root)[0]).toBe(1));
    trayCounter(root, 1).focus();
    await userEvent.keyboard('{Enter}');
    // Arrow keys move between free cells.
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cellsOf(root).filter(Boolean)).toHaveLength(2));
    const placed = root.querySelector('.ni-tf__placed[data-counter="1"]') as HTMLElement;
    placed.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cellsOf(root).filter(Boolean)).toHaveLength(1));
    within(root).getByRole('button', { name: 'Check' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0]] },
    });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toContain('undo:counter-1');
  },
};

/**
 * K mode, standard fill (SUB.03.t1): a counter dropped anywhere lands in the next cell of the
 * standard order. Cells and tray counters are ≥ 80 px and ≥ 12 px apart; placing speaks the count.
 */
export const StandardFillK: Story = {
  globals: { ageMode: 'k' },
  args: { config: show7Standard },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const pads = [...root.querySelectorAll<HTMLElement>('.ni-tf__pad')];
    await expect(pads).toHaveLength(10);
    for (const p of pads) await expectTargetSize(p, 'k');
    await expectTargetGaps(pads);
    const tray = [...root.querySelectorAll<HTMLElement>('.ni-tf__tray .ni-tf__counter')];
    for (const c of tray) await expectTargetSize(c, 'k');
    await expectTargetGaps(tray);
    await expectTargetSize(within(root).getByRole('button', { name: 'Check' }), 'k');

    await pointerDrag(trayCounter(root, 0), center(pad(root, 0, 8)), 'touch');
    await waitFor(() => expect(cellsOf(root)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 1 }]);
    // Tapping a counter in the tray speaks its name (06 §5).
    await userEvent.click(trayCounter(root, 1));
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.counter', undefined);
    await userEvent.click(pad(root, 0, 4));
    await waitFor(() => expect(cellsOf(root)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 2 }]);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 1, 0, 0, 0, 0, 0, 0, 0, 0]] },
    });
  },
};

/** Two frames (CPS.02.t1): one part per frame; the tray stands beside them. */
export const TwoFramesSplit: Story = {
  args: { config: split7 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const pads = [...root.querySelectorAll<HTMLElement>('.ni-tf__pad')];
    await expect(pads).toHaveLength(20);
    for (const p of pads.slice(0, 6)) await expectTargetSize(p, 'g1-up');
    await expectTargetGaps(pads.slice(0, 10));
    // The tray shows ten counters at a time.
    await expect(root.querySelectorAll('.ni-tf__tray .ni-tf__counter')).toHaveLength(10);
    const firstInTray = () => root.querySelector('.ni-tf__tray .ni-tf__counter') as HTMLElement;
    for (const [frame, cell] of [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ] as const) {
      await pointerDrag(firstInTray(), center(pad(root, frame, cell)), 'mouse');
    }
    await waitFor(() => expect(cellsOf(root, 1)[0]).toBe(1));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: {
        cells: [
          [1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
          [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ],
      },
    });
  },
};

/**
 * One more than 10 (CNT.14.t2): the asked number is up to 20, so the number pad answers. A double
 * Enter and Enter-then-Check inside 400 ms submit once (06 §4).
 */
export const TwoFramesPad: Story = {
  args: { config: oneMore10 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // The prefilled ten is locked: those counters are not buttons.
    await expect(root.querySelectorAll('.ni-tf__placed[data-locked="true"]')).toHaveLength(10);
    await expect(within(root).queryByRole('button', { name: 'Counter 1' })).toBeNull();
    await userEvent.click(trayCounter(root, 10));
    await userEvent.click(pad(root, 1, 0));
    await waitFor(() => expect(cellsOf(root, 1)[0]).toBe(1));
    const key = (k: string) => root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
    // Enter before the number is in does nothing, and doesn't swallow the real submit after it.
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.click(key('1'));
    await userEvent.click(key('1'));
    await expect(within(root).getByRole('button', { name: 'Your answer: 11' })).toBeVisible();
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: {
        cells: [
          [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          [2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ],
        value: 11,
      },
    });
  },
};

/** Pictorial (CNT.04.t3), K mode: tap cells to shade them, tap again to clear. */
export const PictorialShadeK: Story = {
  globals: { ageMode: 'k' },
  args: { config: shade3, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-tf__tray')).toBeNull();
    const cells = [...root.querySelectorAll<HTMLElement>('.ni-tf__shade')];
    for (const c of cells) await expectTargetSize(c, 'k');
    await expectTargetGaps(cells);
    const box = (n: number) => within(root).getByRole('button', { name: `Box ${n}` });
    await userEvent.click(box(1));
    await userEvent.click(box(2));
    await userEvent.click(box(7));
    await userEvent.click(box(8));
    await userEvent.click(box(8));
    await expect(box(7)).toHaveAttribute('aria-pressed', 'true');
    await expect(box(8)).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 1, 0, 0, 0, 0, 1, 0, 0, 0]] },
    });
    const trace = traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
    await expect(trace).toEqual([
      'tap:cell-0-0',
      'tap:cell-0-1',
      'tap:cell-0-6',
      'tap:cell-0-7',
      'undo:cell-0-7',
    ]);
  },
};

/** The Pebbling shell skin (05 §5), make ten: 8 and how many more? */
export const ShellMakeTen: Story = {
  globals: { ageMode: 'k' },
  args: { config: makeTenShell },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-tf__shell')).not.toBeNull();
    await expect(within(root).getByRole('group', { name: 'Shell 1' })).toBeVisible();
    await pointerDrag(trayCounter(root, 8), center(pad(root, 0, 8)), 'touch');
    await waitFor(() => expect(cellsOf(root)[8]).toBe(1));
    await userEvent.click(within(root).getByRole('button', { name: '1' }));
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

/** A five-frame (one row) asking how many. */
export const FiveFrame: Story = {
  args: { config: fiveFrame },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-tf__pad')).toHaveLength(5);
    await userEvent.click(trayCounter(root, 0));
    await userEvent.click(pad(root, 0, 0));
    await userEvent.click(within(root).getByRole('button', { name: '1' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 0, 0, 0, 0]], value: 1 },
    });
  },
};

/** Take away (subtract): the given counters can be tapped off the frame into the tray. */
export const TakeAway: Story = {
  args: { config: takeAway },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(within(root).getByRole('button', { name: 'Counter 7' }));
    await userEvent.click(within(root).getByRole('button', { name: 'Counter 6' }));
    await waitFor(() =>
      expect(root.querySelectorAll('.ni-tf__tray .ni-tf__counter')).toHaveLength(2),
    );
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 1, 1, 1, 1, 0, 0, 0, 0, 0]] },
    });
  },
};

/** `disabled`: no input at all. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(trayCounter(root, 6));
    await userEvent.click(pad(root, 0, 6));
    await expect(cellsOf(root)[6]).toBe(0);
    await expect(within(root).getByRole('button', { name: 'Check' })).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/** Demo mode (03 §6.3): Pip shows the addends, slides 3 counters in and counts them all. */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'show-addends' });
    await demoController.play({ op: 'place', args: { frame: 0, count: 3, color: 'b' } });
    await expect(cellsOf(root)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    await demoController.play({ op: 'highlight', args: { target: 'frame-0' } });
    await demoController.play({ op: 'count-total' });
    await waitFor(() =>
      expect(within(root).getByRole('button', { name: '9' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    await expect(demoController.play({ op: 'slide' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'remove', args: { frame: 0, count: 1 } });
    await waitFor(() => expect(root.querySelector('.ni-tf__cell.ni-invite')).not.toBeNull());
    await expect(root.querySelector('.ni-hand')).not.toBeNull();
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/** Invite: the child's next step is to drag from the tray (pulsing ring and hand). */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'place', args: { frame: 0, count: 3, color: 'b' } });
    await waitFor(() => expect(root.querySelector('.ni-tf__tray.ni-invite')).not.toBeNull());
    await expect(root.querySelector('.ni-tf__tray-wrap .ni-hand')).not.toBeNull();
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: every op is an instant state change. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: split7, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'place', args: { frame: 0, count: 7, color: 'a' } });
    await reducedController.play({
      op: 'move-counters',
      args: { fromFrame: 0, toFrame: 1, count: 3 },
    });
    await reducedController.play({ op: 'remove', args: { frame: 1, count: 1 } });
    await reducedController.play({ op: 'answer', args: { value: 6 } });
    await expect(performance.now() - started).toBeLessThan(500);
    await expect(cellsOf(root, 0).filter(Boolean)).toHaveLength(4);
    await expect(cellsOf(root, 1).filter(Boolean)).toHaveLength(2);
  },
};
