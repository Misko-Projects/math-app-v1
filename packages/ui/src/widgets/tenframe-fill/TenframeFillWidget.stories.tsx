import { matches } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
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
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
} from '../../test-support/storyHelpers';
import {
  areaBox,
  expectFitsArea,
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
 * `tenframe-fill` (03 §5.5): concrete (drag counters from the tray into the cells; tap a placed
 * counter to take it back) and pictorial (tap cells to shade them). `thenAsk` adds a numeral
 * answer. Responds `{ cells, value? }` through the engine model. Fixtures mirror the generated
 * items (ADD.01.t3, SUB.03.t1, CPS.02.t1, CNT.14.t2, CNT.04.t3, CPS.03.t1, CPS.04.t1, ADD.13.t1,
 * CMP.03.t2, ADD.18.t1).
 */

type Config = ConfigFor<'tenframe-fill'>;

const base = {
  format: 'tenframe-fill',
  frames: 1,
  size: 10,
  prefilled: [] as Config['prefilled'],
  requireStandardFill: false,
  thenAsk: null,
  skin: 'frame',
} as const;

/** ADD.01.t3 (K): 6 and 3 more, how many in all? */
const add63: Config = {
  ...base,
  prefilled: [{ frame: 0, color: 'a', count: 6 }],
  goal: 'add',
  a: 6,
  b: 3,
  thenAsk: 'total',
};

/** SUB.03.t1 (K): show 7 the standard way. */
const show7Standard: Config = { ...base, goal: 'show-n', n: 7, requireStandardFill: true };

/** CPS.02.t1 (K): show 7 on two frames, one part per frame. */
const split7: Config = { ...base, frames: 2, goal: 'show-n', n: 7 };

/** CNT.14.t2 (K): one more than 12 (ten and two given), then how many? */
const oneMore12: Config = {
  ...base,
  frames: 2,
  prefilled: [
    { frame: 0, color: 'a', count: 10 },
    { frame: 1, color: 'a', count: 2 },
  ],
  goal: 'one-more',
  n: 12,
  thenAsk: 'total',
};

/** CPS.04.t1 (K): show 14 the standard way on two frames, then how many? */
const teen14: Config = {
  ...base,
  frames: 2,
  goal: 'show-n',
  n: 14,
  requireStandardFill: true,
  thenAsk: 'total',
};

/** ADD.13.t1 (G1): 7 and 9 on two frames, how many in all? */
const add79: Config = {
  ...base,
  frames: 2,
  prefilled: [{ frame: 0, color: 'a', count: 7 }],
  goal: 'add',
  a: 7,
  b: 9,
  thenAsk: 'total',
};

/** CNT.04.t3 (pictorial, K): shade 3. */
const shade3: Config = { ...base, goal: 'show-n', n: 3 };

/** CPS.03.t1 on a Pebbling shell: 8 and how many more make ten? */
const makeTenShell: Config = {
  ...base,
  prefilled: [{ frame: 0, color: 'a', count: 8 }],
  goal: 'make-ten',
  thenAsk: 'missing',
  skin: 'shell',
};

/** A five-frame: show 4, how many? */
const fiveFrame: Config = { ...base, size: 5, goal: 'show-n', n: 4, thenAsk: 'total' };

/** CMP.03.t2 (K): 7, take 1 away (the given counters come off into the tray). */
const takeAway: Config = {
  ...base,
  prefilled: [{ frame: 0, color: 'a', count: 7 }],
  goal: 'subtract',
  a: 7,
  b: 1,
};

/** ADD.18.t1 (G1): 17 take away 8, how many are left? */
const subtract17: Config = {
  ...base,
  frames: 2,
  prefilled: [
    { frame: 0, color: 'a', count: 10 },
    { frame: 1, color: 'a', count: 7 },
  ],
  goal: 'subtract',
  a: 17,
  b: 8,
  thenAsk: 'total',
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
  // Every story ends with nothing focused: a leftover keyboard focus ring must not read as an
  // invite in the evidence (invite stories keep their one ring and hand: those are not focus).
  afterEach: async () => {
    (document.activeElement as HTMLElement | null)?.blur();
  },
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-tf';
const supplyCounters = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-tf__supply .ni-tf__counter'),
];
const supplyCounter = (root: HTMLElement, id: number) =>
  root.querySelector(`.ni-tf__supply [data-counter="${id}"]`) as HTMLElement;
const pad = (root: HTMLElement, frame: number, index: number) =>
  root.querySelector(`[data-cell="cell-${frame}-${index}"] .ni-tf__pad`) as HTMLElement;
const cellsOf = (root: HTMLElement, frame = 0) =>
  [...root.querySelectorAll(`.ni-tf__frame[data-frame="${frame}"] .ni-tf__cell`)].map((c) =>
    c.getAttribute('data-filled') === 'true' ? 1 : 0,
  );
const button = (root: HTMLElement, name: string) => within(root).getByRole('button', { name });

/**
 * Concrete add (ADD.01.t3): drag one counter with the mouse, one by touch, tap-to-place the third,
 * then pick 9. Check stays off until the number is picked; one `{ cells, value }` response.
 */
export const AddDragAndTap: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const check = button(root, 'Check');
    await expect(supplyCounters(root)).toHaveLength(3);
    // Colour b differs by a mark too (an ink ring), not only by colour (06 §7).
    await expect(root.querySelector('.ni-tf__supply [data-mark="ring"]')).not.toBeNull();

    await pointerDrag(supplyCounter(root, 6), center(pad(root, 0, 6)), 'mouse');
    await waitFor(() => expect(cellsOf(root)).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 0, 0]));
    await pointerDrag(supplyCounter(root, 7), center(pad(root, 0, 9)), 'touch');
    await waitFor(() => expect(cellsOf(root)[9]).toBe(1));
    // Tap-to-place: tap the counter, then the cell.
    await userEvent.click(supplyCounter(root, 8));
    await userEvent.click(pad(root, 0, 7));
    await waitFor(() => expect(cellsOf(root)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0, 1]));
    await expect(supplyCounters(root)).toHaveLength(0);

    await expect(check).toBeDisabled();
    await userEvent.click(button(root, '9'));
    await expectNumeralsInside(root);
    await userEvent.click(check);
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
    supplyCounter(root, 0).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(pad(root, 0, 0)));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cellsOf(root)[0]).toBe(1));
    supplyCounter(root, 1).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cellsOf(root).filter(Boolean)).toHaveLength(2));
    const placed = root.querySelector('.ni-tf__placed[data-counter="1"]') as HTMLElement;
    placed.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cellsOf(root).filter(Boolean)).toHaveLength(1));
    button(root, 'Check').focus();
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
 * standard order. Cells and tray counters are ≥ 80 px and ≥ 12 px apart; placing speaks the count,
 * tapping a counter speaks its name (06 §5).
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
    for (const c of supplyCounters(root)) await expectTargetSize(c, 'k');
    await expectTargetGaps(supplyCounters(root));
    await expectTargetSize(button(root, 'Check'), 'k');

    await pointerDrag(supplyCounter(root, 0), center(pad(root, 0, 8)), 'touch');
    await waitFor(() => expect(cellsOf(root)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 1 }]);
    await userEvent.click(supplyCounter(root, 1));
    await expect(audio.say).toHaveBeenCalledWith('ui.sprite.counter', undefined);
    await userEvent.click(pad(root, 0, 4));
    await waitFor(() => expect(cellsOf(root)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]));
    await expect(audio.sayPhrases).toHaveBeenLastCalledWith([{ number: 2 }]);
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 1, 0, 0, 0, 0, 0, 0, 0, 0]] },
    });
  },
};

/**
 * Maths truth: a ten-frame is 2 rows × 5 evenly spaced cells, and two frames are two of them;
 * counters split across the frames answer one part per frame (CPS.02.t1).
 */
export const TwoFramesSplit: Story = {
  args: { config: split7 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const frame of [0, 1]) {
      const cells = [
        ...root.querySelectorAll<HTMLElement>(`.ni-tf__frame[data-frame="${frame}"] .ni-tf__cell`),
      ].map((c) => c.getBoundingClientRect());
      await expect(cells).toHaveLength(10);
      const xs = [...new Set(cells.map((r) => Math.round(r.left)))];
      const ys = [...new Set(cells.map((r) => Math.round(r.top)))];
      await expect(xs).toHaveLength(5);
      await expect(ys).toHaveLength(2);
      const steps = xs.slice(1).map((x, i) => x - (xs[i] as number));
      for (const s of steps) {
        await expect(Math.abs(s - (steps[0] as number))).toBeLessThanOrEqual(1);
      }
    }
    for (const [frame, cell] of [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ] as const) {
      const first = supplyCounters(root)[0] as HTMLElement;
      await pointerDrag(first, center(pad(root, frame, cell)), 'mouse');
    }
    await waitFor(() => expect(cellsOf(root, 1)[0]).toBe(1));
    await userEvent.click(button(root, 'Check'));
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
 * One more than 12 (CNT.14.t2): the given ten and two are locked (not buttons); the asked number
 * is picked on a 0–20 tray. Check twice inside 400 ms submits once (06 §4).
 */
export const TwoFramesTeen: Story = {
  args: { config: oneMore12 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-tf__placed[data-locked="true"]')).toHaveLength(12);
    await expect(within(root).queryByRole('button', { name: 'Counter 1' })).toBeNull();
    await userEvent.click(supplyCounter(root, 12));
    await userEvent.click(pad(root, 1, 5));
    await waitFor(() => expect(cellsOf(root, 1)[5]).toBe(1));
    await userEvent.click(button(root, '13'));
    await userEvent.click(button(root, 'Check'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: {
        cells: [
          [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          [1, 1, 0, 0, 0, 2, 0, 0, 0, 0],
        ],
        value: 13,
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
    await expect(root.querySelector('.ni-tf__supply')).toBeNull();
    const cells = [...root.querySelectorAll<HTMLElement>('.ni-tf__shade')];
    for (const c of cells) await expectTargetSize(c, 'k');
    await expectTargetGaps(cells);
    const box = (n: number) => button(root, `Box ${n}`);
    await userEvent.click(box(1));
    await userEvent.click(box(2));
    await userEvent.click(box(7));
    await userEvent.click(box(8));
    await userEvent.click(box(8));
    await expect(box(7)).toHaveAttribute('aria-pressed', 'true');
    await expect(box(8)).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button(root, 'Check'));
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
    await pointerDrag(supplyCounter(root, 8), center(pad(root, 0, 8)), 'touch');
    await waitFor(() => expect(cellsOf(root)[8]).toBe(1));
    await userEvent.click(button(root, '1'));
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

/** A five-frame (one row of five) asking how many. */
export const FiveFrame: Story = {
  args: { config: fiveFrame },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-tf__pad')).toHaveLength(5);
    await userEvent.click(supplyCounter(root, 0));
    await userEvent.click(pad(root, 0, 0));
    await userEvent.click(button(root, '1'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 0, 0, 0, 0]], value: 1 },
    });
  },
};

/** Take away (CMP.03.t2): the given counters can be tapped off the frame into the tray. */
export const TakeAway: Story = {
  args: { config: takeAway },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(button(root, 'Counter 7'));
    await userEvent.click(button(root, 'Counter 6'));
    await waitFor(() => expect(supplyCounters(root)).toHaveLength(2));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [[1, 1, 1, 1, 1, 0, 0, 0, 0, 0]] },
    });
  },
};

/** `disabled`: no input at all, and a tap leaves no focus or drop style behind. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const cell = root.querySelector('[data-cell="cell-0-6"]') as HTMLElement;
    const watched = [supplyCounter(root, 6), pad(root, 0, 6), cell];
    const before = watched.map(lookOf);
    await userEvent.click(root.querySelector('.ni-tf__supply') as HTMLElement);
    await userEvent.click(cell);
    await expect(cellsOf(root)[6]).toBe(0);
    await expect(watched.map(lookOf)).toEqual(before);
    await expect(button(root, 'Check')).toBeDisabled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoController: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo mode (03 §6.3): Pip shows the addends, slides 3 counters in and counts them all, which
 * picks 9; an unsupported op throws in strict mode. No invite while the widget is disabled.
 */
export const DemoMode: Story = {
  args: { disabled: true, demo: demoController },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoController.play({ op: 'show-addends' });
    await demoController.play({ op: 'place', args: { frame: 0, count: 3, color: 'b' } });
    await expect(cellsOf(root)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    await demoController.play({ op: 'highlight', args: { target: 'frame-0' } });
    await demoController.play({ op: 'count-total' });
    await expect(button(root, '9')).toHaveAttribute('aria-pressed', 'true');
    await expect(demoController.play({ op: 'slide' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
    demoController.invite({ op: 'remove', args: { frame: 0, count: 1 } });
    await expect(root.querySelector('.ni-invite')).toBeNull();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const inviteController: WidgetDemo = createDemoController({ strict: true });

/**
 * Invites (K): place → the last counter in the tray; remove → the last counter placed; answer →
 * the numeral card. Exactly one ring at a time, Pip's fingertip on it, the ring clear of the rest.
 */
export const DemoInviteK: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteController.invite({ op: 'place', args: { frame: 0, count: 3, color: 'b' } });
    await waitFor(() => expect(root.querySelector('.ni-tf__supply .ni-invite')).not.toBeNull());
    await expectOneInvite(root, supplyCounter(root, 8));

    await userEvent.click(supplyCounter(root, 6));
    await userEvent.click(pad(root, 0, 6));
    await waitFor(() => expect(root.querySelector('.ni-invite')).toBeNull());
    inviteController.invite({ op: 'remove', args: { frame: 0, count: 1 } });
    const placed = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-tf__placed.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await expect(placed.dataset.counter).toBe('6');
    await expectOneInvite(root, placed);

    inviteController.invite({ op: 'answer', args: { value: 7 } });
    const card = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-pick.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await expect(card.dataset.id).toBe('opt-7');
    await expectOneInvite(root, card);
  },
};

const reducedController: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: every op is an instant state change, and `play` resolves after it commits. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: split7, disabled: true, demo: reducedController },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    await reducedController.play({ op: 'place', args: { frame: 0, count: 7, color: 'a' } });
    await expect(cellsOf(root, 0).filter(Boolean)).toHaveLength(7);
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

// ---------- the real widget area (06 §1, §2): 960 × 600, portrait, tablet ----------

/** The widget fits the area: no scroll, every part inside, full-size targets 12 px apart. */
async function expectFits(canvasElement: HTMLElement, ageMode: AgeMode) {
  const root = await findWidget(canvasElement, ROOT);
  await settledAll(root);
  const parts = [
    ...root.querySelectorAll<HTMLElement>(
      '.ni-tf__frame, .ni-tf__mini, .ni-tf__view, .ni-tf__supply, .ni-entry, .ni-tf__act',
    ),
  ];
  await expectFitsArea(areaBox(canvasElement), parts, targetsOf(root), ageMode);
  await expectNumeralsInside(root);
  await expectFill(areaBox(canvasElement), parts);
  return root;
}

/** Steps layout: Next shows the answer step (and hands it the focus); Back returns. */
async function throughSteps(root: HTMLElement, ageMode: AgeMode, canvasElement: HTMLElement) {
  if (root.dataset.step !== 'build') return;
  button(root, 'Next').focus();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(root.dataset.step).toBe('ask'));
  await waitFor(() => expect(document.activeElement).toBe(button(root, 'Go back')));
  await expectFits(canvasElement, ageMode);
  await userEvent.click(button(root, 'Go back'));
  await waitFor(() => expect(root.dataset.step).toBe('build'));
}

/** ADD.01.t3 in K at 960 × 600: one frame, the tray, then the answer (steps where needed). */
export const AreaLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    await throughSteps(root, 'k', canvasElement);
  },
};

/** ADD.13.t1 in G1 at 960 × 600: two frames, 9 counters to add, a 0–20 answer. */
export const AreaLandscapeMinG1: Story = {
  args: { config: add79 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await expectFits(canvasElement, 'g1-up');
    await throughSteps(root, 'g1-up', canvasElement);
    await userEvent.click(supplyCounters(root).at(-1) as HTMLElement);
    await userEvent.click(pad(root, 0, 7));
    await waitFor(() => expect(cellsOf(root)[7]).toBe(1));
    await expect(args.onInteract).toHaveBeenCalled();
  },
};

/**
 * CNT.14.t2 in K at 960 × 600: two full-size ten-frames don't fit, so the frame being filled is in
 * front and the other is a small frame button that brings it forward (focus follows it).
 */
export const AreaLandscapeMinPagedK: Story = {
  globals: { ageMode: 'k' },
  args: { config: oneMore12 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    await expect(root.dataset.paged).toBe('true');
    await expect(root.querySelector('.ni-tf__frame')?.getAttribute('data-frame')).toBe('1');
    const mini = root.querySelector('.ni-tf__mini') as HTMLElement;
    await expect(mini.querySelectorAll('.ni-tf__mini-cell svg')).toHaveLength(10);
    mini.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(root.querySelector('.ni-tf__frame')?.getAttribute('data-frame')).toBe('0'),
    );
    await waitFor(() => expect(document.activeElement).toBe(root.querySelector('.ni-tf__mini')));
    await expectFits(canvasElement, 'k');
  },
};

/** CPS.04.t1 in K, portrait: two frames, 14 to show, a 0–20 answer. */
export const AreaPortraitK: Story = {
  globals: { ageMode: 'k' },
  args: { config: teen14 },
  render: inArea('portrait'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    await throughSteps(root, 'k', canvasElement);
  },
};

/** ADD.18.t1 in G1 on a tablet: 17 take away 8, how many are left? */
export const AreaTabletG1: Story = {
  args: { config: subtract17 },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'g1-up');
    await throughSteps(root, 'g1-up', canvasElement);
  },
};

/** ADD.01.t3 in K on a tablet. */
export const AreaTabletK: Story = {
  globals: { ageMode: 'k' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    await throughSteps(root, 'k', canvasElement);
  },
};

/** CNT.04.t3 pictorial in K at 960 × 600. */
export const AreaLandscapeMinPictorialK: Story = {
  globals: { ageMode: 'k' },
  args: { config: shade3, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    await expectFits(canvasElement, 'k');
  },
};

const areaInvite: WidgetDemo = createDemoController({ strict: true });

/** An invite in the steps layout: answering waits behind Next, so Next is the one ring. */
export const AreaInviteStepsK: Story = {
  globals: { ageMode: 'k' },
  args: { demo: areaInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    areaInvite.invite({ op: 'answer', args: { value: 9 } });
    if (root.dataset.step === 'build') {
      const next = await waitFor(() => {
        const el = root.querySelector<HTMLElement>('.ni-tf__act .ni-invite');
        expect(el).not.toBeNull();
        return el as HTMLElement;
      });
      await expect(next).toHaveAccessibleName('Next');
      await expectOneInvite(root, next);
      await userEvent.click(next);
    }
    const card = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-pick.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await expect(card.dataset.id).toBe('opt-9');
    await expectOneInvite(root, card);
    await expectFits(canvasElement, 'k');
  },
};

/** Every counter the answer step's picture draws is ≥ 32 px (or there is no picture). */
async function expectLegiblePicture(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>('.ni-tf__vcell, .ni-tf__mini-cell')) {
    await expect(el.getBoundingClientRect().width).toBeGreaterThanOrEqual(32);
  }
}

/** CPS.04.t1 in K at 960 × 600: two frames, 14 to show, then the 0–20 answer; no step scrolls. */
export const AreaLandscapeMinTeenK: Story = {
  globals: { ageMode: 'k' },
  args: { config: teen14 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await expectFits(canvasElement, 'k');
    await expectLegiblePicture(root);
    await throughSteps(root, 'k', canvasElement);
    if (root.dataset.step === 'build') {
      await userEvent.click(button(root, 'Next'));
      await waitFor(() => expect(root.dataset.step).toBe('ask'));
    }
    await expectLegiblePicture(root);
    // 21 numeral cards, each a full K target, in an even 7 × 3 grid.
    const cards = [...root.querySelectorAll<HTMLElement>('.ni-pick')];
    await expect(cards).toHaveLength(21);
    for (const c of cards) await expectTargetSize(c, 'k');
    await expectTargetGaps(cards);
    await expect(new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size).toBe(3);
    await expectFits(canvasElement, 'k');
    await userEvent.click(button(root, '14'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { cells: [new Array(10).fill(0), new Array(10).fill(0)], value: 14 },
    });
  },
};

/** ADD.01.t3 in K at 960 × 600, the answer step: the picture is legible or not shown. */
export const AreaLandscapeMinAskK: Story = {
  globals: { ageMode: 'k' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    if (root.dataset.step === 'build') {
      await userEvent.click(button(root, 'Next'));
      await waitFor(() => expect(root.dataset.step).toBe('ask'));
    }
    await expectLegiblePicture(root);
    await expectFits(canvasElement, 'k');
  },
};

const teenInvite: WidgetDemo = createDemoController({ strict: true });

/**
 * CPS.04.t1 in K at 960 × 600: an answer invite on a bottom-row card (17) in the answer step. The
 * ring, Pip's hand and the whole widget stay inside the area (no scroll).
 */
export const AreaInviteTeenK: Story = {
  globals: { ageMode: 'k' },
  args: { config: teen14, demo: teenInvite },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await expectFits(canvasElement, 'k');
    if (root.dataset.step === 'build') {
      await userEvent.click(button(root, 'Next'));
      await waitFor(() => expect(root.dataset.step).toBe('ask'));
    }
    teenInvite.invite({ op: 'answer', args: { value: 17 } });
    const card = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-pick.ni-invite');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await expectOneInvite(root, card);
    await expectFits(canvasElement, 'k');
  },
};

/**
 * PR #93 F1: a make-ten item as the addsub.facts generator builds it (ADD.08.t1: 8 in frame 1,
 * 5 of colour b in frame 2, thenAsk total). There is no tray: the child moves counters from frame
 * 2 into frame 1 (one by drag, one by tap-to-place … keyboard), picks 13, and the engine's
 * tenframe.makeTen checker accepts the response.
 */
export const MakeTenMoveCounters: Story = {
  args: {
    config: {
      ...base,
      frames: 2,
      prefilled: [
        { frame: 0, color: 'a', count: 8 },
        { frame: 1, color: 'b', count: 5 },
      ],
      goal: 'make-ten',
      a: 8,
      b: 5,
      thenAsk: 'total',
    },
  },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-tf__supply')).toBeNull();
    const placed = (id: number) =>
      root.querySelector(`.ni-tf__placed[data-counter="${id}"]`) as HTMLElement;
    // Frame 1's given counters stay put; frame 2's can be picked up.
    await expect(placed(0).getAttribute('role')).toBeNull();
    await expect(placed(12)).toHaveAttribute('role', 'button');
    await pointerDrag(placed(12), center(pad(root, 0, 8)), 'touch');
    await waitFor(() => expect(cellsOf(root)[8]).toBe(1));
    placed(11).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(pad(root, 0, 9)));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cellsOf(root).every(Boolean)).toBe(true));
    await expect(cellsOf(root, 1).filter(Boolean)).toHaveLength(3);
    if (root.dataset.step === 'build') await userEvent.click(button(root, 'Next'));
    await userEvent.click(button(root, '13'));
    await userEvent.click(button(root, 'Check'));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    const response = (args.onResponse as unknown as { mock: { calls: [ResponseValue][] } }).mock
      .calls[0]?.[0] as ResponseValue;
    await expect(
      matches(
        { kind: 'state', checker: 'tenframe.makeTen', target: { total: 13, value: 13 } },
        response,
      ),
    ).toBe(true);
  },
};

const emptyHighlight: WidgetDemo = createDemoController({ strict: true });

/**
 * PR #93 F5: the generators' hint `highlight {target: 'empty-cells'}` lights every empty cell
 * while it plays (6 given: the 4 empty cells), and nothing else.
 */
export const DemoHighlightEmptyCells: Story = {
  args: { disabled: true, demo: emptyHighlight },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const playing = emptyHighlight.play({ op: 'highlight', args: { target: 'empty-cells' } });
    await waitFor(() =>
      expect(root.querySelectorAll('.ni-tf__cell[data-lit="true"]')).toHaveLength(4),
    );
    for (const cell of root.querySelectorAll('.ni-tf__cell[data-lit="true"]')) {
      await expect(cell.getAttribute('data-filled')).toBeNull();
    }
    await playing;
    await expect(root.querySelectorAll('.ni-tf__cell[data-lit="true"]')).toHaveLength(0);
  },
};
