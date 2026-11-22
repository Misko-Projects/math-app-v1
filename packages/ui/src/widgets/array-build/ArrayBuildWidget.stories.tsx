import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { clearSpies, type SpyAudio, spyAudio } from '../../test-support/storyHelpers';
import {
  clickAt,
  enterNumber,
  expectAreaFit,
  expectCountable,
  expectNote,
  expectRing,
  goNext,
  inArea,
  namedStory,
  secondFingerTap,
  stepButton,
  touchDragBetween,
} from '../../test-support/twoStepStory';
import {
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `array-build` (03 §5.5): a rows × cols array of sprites. Build modes show the board with its
 * arrow pad and Check; `read` the ask step alone; `split` two steps. Every story runs in a
 * workshop's widget area: `landscapeMin` (906 × 373, the smallest) unless its name says tablet
 * (1226 × 493).
 */

type Config = ConfigFor<'array-build'>;

const base = {
  format: 'array-build',
  maxRows: 5,
  maxCols: 5,
  orientationMatters: false,
  sprite: 'shell',
  gridShown: true,
} as const;

/** Build 3 rows of 4 (4 rows of 3 is right too) on a 5 × 5 board. */
const dims: Config = { ...base, mode: 'build-dims', rows: 3, cols: 4 };
/** 2 rows of 3 exactly, on a 3 × 3 board: three rows cannot be the answer. */
const strict: Config = {
  ...base,
  mode: 'build-dims',
  maxRows: 3,
  maxCols: 3,
  rows: 2,
  cols: 3,
  orientationMatters: true,
};
/** Any rectangle of 12 on a 6 × 6 board. */
const total: Config = { ...base, mode: 'build-total', maxRows: 6, maxCols: 6, total: 12 };
/** A new rectangle of 12: 3 × 4 was found before. */
const newWay: Config = { ...total, mode: 'new-way', found: [[3, 4]] };
/** `read`: 3 rows of 4 crabs. */
const read: Config = { ...base, mode: 'read', rows: 3, cols: 4, sprite: 'crab' };
/** `split`: 3 rows of 7 fish (7 × 3 = 5 × 3 + 2 × 3). */
const split: Config = {
  ...base,
  mode: 'split',
  maxRows: 3,
  maxCols: 7,
  rows: 3,
  cols: 7,
  sprite: 'fish',
};
/** The bound: the largest board, 10 × 10 (ARRAY_SIDE_MAX). */
const boundBoard: Config = { ...base, mode: 'build-total', maxRows: 10, maxCols: 10, total: 100 };
/** The largest picture: 10 rows of 10. */
const boundRead: Config = {
  ...base,
  mode: 'read',
  maxRows: 10,
  maxCols: 10,
  rows: 10,
  cols: 10,
  sprite: 'pebble',
};

const meta = {
  title: 'Widgets/Array build',
  args: {
    config: dims as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { audio: spyAudio() } },
  decorators: [namedStory],
  render: inArea('landscapeMin'),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-abw';

// ---------- helpers ----------

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const board = (root: HTMLElement) => q(root, '.ni-abw__board');
const pad = (root: HTMLElement, dir: 'up' | 'down' | 'left' | 'right') =>
  q(root, `[data-cue="pad-${dir}"] button`);
const padButtons = (root: HTMLElement) => all(root, '.ni-work__btn button');
const audioOf = (parameters: { ui?: { audio?: unknown } }) => parameters.ui?.audio as SpyAudio;
const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const state = (value: Record<string, unknown>) => ({ kind: 'state', value });
const steps = (args: { onInteract?: unknown }) =>
  traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);

/** What the picture shows: the sprites drawn, in rows and columns. */
function shown(root: HTMLElement) {
  const ids = all(root, '[data-ab-sprite]').map((el) => el.dataset.abSprite as string);
  const rows = new Set(ids.map((id) => id.split('-')[0])).size;
  return { rows, cols: rows === 0 ? 0 : ids.length / rows, n: ids.length };
}
async function expectShown(root: HTMLElement, rows: number, cols: number) {
  await waitFor(() => expect(shown(root)).toEqual({ rows, cols, n: rows * cols }));
}

/** Rows and columns are straight: one left edge per column, one top edge per row, one size. */
async function expectAligned(root: HTMLElement) {
  const rects = all(root, '[data-ab-sprite]').map((el) => ({
    id: el.dataset.abSprite as string,
    r: el.getBoundingClientRect(),
  }));
  const tops = new Map<string, number>();
  const lefts = new Map<string, number>();
  for (const { id, r } of rects) {
    const [row, col] = id.split('-') as [string, string];
    await expect(Math.round(r.width)).toBeGreaterThanOrEqual(26);
    if (!tops.has(row)) tops.set(row, r.top);
    if (!lefts.has(col)) lefts.set(col, r.left);
    await expect(Math.abs(r.top - (tops.get(row) as number))).toBeLessThan(0.5);
    await expect(Math.abs(r.left - (lefts.get(col) as number))).toBeLessThan(0.5);
  }
}

/** The centre of the board's cell (r, c), 0-based, on the page. */
function cellPoint(root: HTMLElement, r: number, c: number) {
  const cells = q(root, '.ni-abw__cells').getBoundingClientRect();
  const grid = q(root, '.ni-abw__grid');
  const pitch = Number.parseFloat(grid.style.backgroundSize);
  return { x: cells.left + (c + 0.5) * pitch, y: cells.top + (r + 0.5) * pitch };
}

/** A pressed button keeps the keyboard focus; its focus outline is not part of the layout. */
const blur = () => (document.activeElement as HTMLElement | null)?.blur();

/** The build step's controls and parts, for `expectAreaFit`. */
const buildFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => {
  blur();
  const action = stepButton(root, 'check') ?? stepButton(root, 'next');
  return {
    ageMode,
    story,
    controls: { pad: padButtons(root), board: [board(root)], action: [action] },
    parts: all(root, '.ni-work'),
  };
};
/** The ask step's controls and parts, for `expectAreaFit`. */
const askFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => {
  blur();
  const back = stepButton(root, 'back');
  return {
    ageMode,
    story,
    controls: {
      answer: all(root, '.ni-entry button, .ni-stepper button'),
      ...(back ? { back: [back] } : {}),
      check: [stepButton(root, 'check')],
    },
    parts: all(root, '.ni-abw__picture, .ni-entry, .ni-stepper'),
  };
};

async function press(root: HTMLElement, dir: 'up' | 'down' | 'left' | 'right', times = 1) {
  for (let i = 0; i < times; i += 1) await userEvent.click(pad(root, dir));
}

// ---------- the board in the two areas ----------

/** Tablet (1226 × 493): the pad, the 5 × 5 board and Check, all in view. */
export const TabletBuild: Story = {
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'down', 3);
    await press(root, 'right', 3);
    await expectShown(root, 3, 4);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'array-build tablet build'));
    await expectCountable(board(root));
  },
};

/** The smallest area (906 × 373): the same parts, every control at full size, nothing scrolls. */
export const LandscapeMinBuild: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'down', 3);
    await press(root, 'right', 3);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'array-build 906x373 build'));
    await expectCountable(board(root));
    await expectAligned(root);
  },
};

/** The bound in the smallest area: the 10 × 10 board, full; every sprite still countable. */
export const BoundBoardLandscapeMin: Story = {
  args: { config: boundBoard },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await clickAt(cellPoint(root, 9, 9).x, cellPoint(root, 9, 9).y);
    await expectShown(root, 10, 10);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'array-build 906x373 10x10'));
    await expectCountable(board(root));
    await expectAligned(root);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 10, cols: 10 }));
  },
};

// ---------- the three ways to build ----------

/** The arrows: three rows down, then three more in each row; Check sends the rectangle. */
export const PadBuilds: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(stepButton(root, 'check')).toBeDisabled();
    await press(root, 'down');
    await expectShown(root, 1, 1);
    await press(root, 'down', 2);
    await press(root, 'right', 3);
    await expectShown(root, 3, 4);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
    await expect(steps(args).slice(0, 2)).toEqual(['tap:pad-down', 'tap:pad-down']);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** 4 rows of 3 is not 3 rows of 4: the picture and the response keep rows and columns apart. */
export const RowsAreNotColumns: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'down', 4);
    await press(root, 'right', 2);
    await expectShown(root, 4, 3);
    await expect(board(root)).toHaveAccessibleName('Make your rows here. 4 rows of 3');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 4, cols: 3 }));
  },
};

/** Every step is undone by the opposite arrow, down to an empty board (Check waits again). */
export const PadUndo: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'right', 2);
    await press(root, 'down');
    await expectShown(root, 2, 2);
    await press(root, 'up');
    await expectShown(root, 1, 2);
    await press(root, 'left');
    await expectShown(root, 1, 1);
    await press(root, 'left');
    await expectShown(root, 0, 0);
    await expect(stepButton(root, 'check')).toBeDisabled();
    // An arrow back on an empty board does nothing.
    await press(root, 'up');
    await expectShown(root, 0, 0);
    await expectNote(root, null);
  },
};

/** Touch drag (a finger on a tablet): the rectangle follows the finger out to its cell. */
export const TouchDragRectangle: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await touchDragBetween(board(root), cellPoint(root, 0, 0), cellPoint(root, 2, 3));
    await expectShown(root, 3, 4);
    await expect(steps(args)).toEqual(['drag:board', 'drop:cell-2-3']);
    // Dragging back makes it smaller again.
    await touchDragBetween(board(root), cellPoint(root, 2, 3), cellPoint(root, 0, 1));
    await expectShown(root, 1, 2);
  },
};

/** Tap: the rectangle reaches the cell that was touched; the sprite's name is spoken. */
export const TapBoard: Story = {
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    clearSpies(audio);
    const p = cellPoint(root, 1, 2);
    await clickAt(p.x, p.y);
    await expectShown(root, 2, 3);
    await expect(steps(args)).toEqual(['tap:cell-1-2']);
    await expect(said(audio)).toEqual(['ui.sprite.shell']);
  },
};

/**
 * A drag at the extremes: it ends far outside the board (the rectangle stops at the board's
 * edge), and a second finger that taps the board on the way neither moves nor ends it.
 */
export const DragExtremes: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = board(root).getBoundingClientRect();
    await touchDragBetween(
      board(root),
      cellPoint(root, 1, 1),
      { x: r.right + 300, y: r.bottom + 300 },
      10,
      () => secondFingerTap(board(root)),
    );
    await expectShown(root, 5, 5);
    await expect(steps(args)).toEqual(['drag:board', 'drop:cell-4-4']);
    // Up and left of the board: one sprite is the smallest a drag makes.
    await touchDragBetween(board(root), cellPoint(root, 4, 4), { x: r.left - 200, y: r.top - 200 });
    await expectShown(root, 1, 1);
  },
};

/** Keyboard: Tab to the arrows, Enter presses them; Enter on Check sends the rectangle. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    pad(root, 'down').focus();
    await userEvent.keyboard('{Enter}{Enter}');
    pad(root, 'right').focus();
    await userEvent.keyboard('{Enter}{Enter}');
    await expectShown(root, 2, 3);
    stepButton(root, 'check').focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 2, cols: 3 }));
    await expect(steps(args)).toEqual([
      'tap:pad-down',
      'tap:pad-down',
      'tap:pad-right',
      'tap:pad-right',
    ]);
  },
};

/**
 * Kindergarten sizes (the format has no kindergarten content: this is Grade 2 content at the
 * larger targets): the pad's buttons are 80 px and more, and the board still fits.
 */
export const KindergartenSizes: Story = {
  globals: { ageMode: 'k' },
  args: { config: strict },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'down', 2);
    await press(root, 'right', 2);
    await expectShown(root, 2, 3);
    await expectAreaFit(canvasElement, buildFit(root, 'k', 'array-build K sizes 906x373'));
  },
};

// ---------- limits ----------

/**
 * The board's last row: the note says why nothing moved. Nothing is ringed: three rows may be
 * part of an answer, and a longer row is as good a next step as one row less.
 */
export const LimitRows: Story = {
  args: { config: strict },
  play: async ({ canvasElement, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'down', 3);
    await expectNote(root, null);
    clearSpies(audio);
    await press(root, 'down');
    await expectShown(root, 3, 1);
    await expectNote(root, 'That is the most rows.');
    await expect(said(audio)).toContain('ui.widget.ab.note.rows');
    await expectRing(root, null);
    await expect(root.querySelector('.ni-hand')).toBeNull();
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'array-build 906x373 limit rows'));
  },
};

/** The child's next step clears the note. */
export const LimitClearsOnNextStep: Story = {
  args: { config: strict },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'down', 4);
    await expectNote(root, 'That is the most rows.');
    await press(root, 'up');
    await expectNote(root, null);
    await expectRing(root, null);
    await expectShown(root, 2, 1);
  },
};

/** The board's last column: the same, the note alone. */
export const LimitColumns: Story = {
  args: { config: strict },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'right', 4);
    await expectShown(root, 1, 3);
    await expectNote(root, 'The rows are full.');
    await expectRing(root, null);
  },
};

// ---------- a total, and a new way ----------

/** `build-total`: any rectangle of 12 (here 2 rows of 6). */
export const BuildTotal: Story = {
  args: { config: total },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-abw__found')).toBeNull();
    const p = cellPoint(root, 1, 5);
    await clickAt(p.x, p.y);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 2, cols: 6 }));
  },
};

/** `new-way`: the rectangle found before is listed above the pad, in 32 px numerals. */
export const NewWay: Story = {
  args: { config: newWay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const way = q(root, '.ni-abw__way');
    await expect(way.textContent).toBe('3 × 4');
    await expect(Number.parseFloat(getComputedStyle(way).fontSize)).toBeGreaterThanOrEqual(32);
    await expect(q(root, '.ni-abw__found .ni-visually-hidden').textContent).toBe(
      'You made these before. 3 rows of 4',
    );
    await press(root, 'down', 2);
    await press(root, 'right', 5);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'array-build 906x373 new way'));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 2, cols: 6 }));
  },
};

/** No grid under the array: the board is plain, and the arrows work the same. */
export const NoGrid: Story = {
  args: { config: { ...dims, gridShown: false } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-abw__grid')).toBeNull();
    await press(root, 'down', 2);
    await expectShown(root, 2, 1);
  },
};

// ---------- read ----------

/** `read` in the smallest area: the array as a picture, the answer control and Check. */
export const ReadLandscapeMin: Story = {
  args: { config: read, tier: 'pictorial' },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, 3, 4);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'array-build 906x373 read'),
      minFill: 0.5,
    });
    await expectCountable(q(root, '.ni-abw__picture'));
    await expect(q(root, '.ni-abw__picture')).toHaveAccessibleName(
      'Look at the picture. 3 rows of 4',
    );
    clearSpies(audio);
    await userEvent.click(q(root, '.ni-abw__picture'));
    await expect(said(audio)).toEqual(['ui.sprite.crab']);
    await expect(stepButton(root, 'check')).toBeDisabled();
    await enterNumber(root, 12);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 12 });
  },
};

/** The largest picture (10 rows of 10) beside the pad: countable, and 100 can be typed. */
export const ReadBoundLandscapeMin: Story = {
  args: { config: boundRead, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, 10, 10);
    await enterNumber(root, 100);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'array-build 906x373 read 10x10'),
      minFill: 0.5,
    });
    await expectCountable(q(root, '.ni-abw__picture'));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 100 });
  },
};

/** `read` on the tablet. */
export const TabletRead: Story = {
  render: inArea('tablet'),
  args: { config: read, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'array-build tablet read'),
      minFill: 0.5,
    });
  },
};

// ---------- split ----------

/** `split`, the build step: the arrows put the line in and move it; nothing else moves. */
export const SplitPad: Story = {
  args: { config: split },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectShown(root, 3, 7);
    await expect(root.querySelector('.ni-abw__line')).toBeNull();
    await press(root, 'left');
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '6');
    await press(root, 'left');
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '5');
    await press(root, 'right');
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '6');
    // The line never leaves the array.
    await press(root, 'right', 2);
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '6');
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'array-build 906x373 split'));
    // The line's arrows carry the line; they do not look like the step's Next arrow.
    await expect(pad(root, 'right').querySelector('svg')?.innerHTML).not.toBe(
      stepButton(root, 'next').querySelector('svg')?.innerHTML,
    );
    await expectCountable(board(root));
    await expectAligned(root);
    await expect(steps(args)[0]).toBe('tap:pad-left');
  },
};

/** A finger slides the line along the board to the gap under it; a tap puts it there too. */
export const SplitTouchDrag: Story = {
  args: { config: split },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const r = q(root, '.ni-abw__cells').getBoundingClientRect();
    const pitch = r.height / 3;
    const y = r.top + r.height / 2;
    await touchDragBetween(board(root), { x: r.left + 4, y }, { x: r.left + 5 * pitch, y });
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '5');
    await expect(steps(args)).toEqual(['drag:board', 'drop:gap-5']);
    await clickAt(r.left + 2 * pitch - 3, y);
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '2');
    // Past the array's ends the line stays inside it.
    await touchDragBetween(board(root), { x: r.left + 40, y }, { x: r.right + 400, y: y + 300 });
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '6');
  },
};

/** Next waits for the line and says so, with the ring on the board; then the total is typed. */
export const SplitAsk: Story = {
  args: { config: split },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(stepButton(root, 'next'));
    await expect(root).toHaveAttribute('data-step', 'build');
    await expectNote(root, 'Put the line in.');
    await expectRing(root, board(root));
    await press(root, 'left', 2);
    await expectRing(root, null);
    await goNext(root);
    await expect(q(root, '.ni-abw__picture')).toHaveAccessibleName(
      'Look at the picture. 3 rows of 7. The line is after 5',
    );
    await enterNumber(root, 21);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'array-build 906x373 split ask'),
      minFill: 0.5,
    });
    await expectCountable(q(root, '.ni-abw__picture'));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ rows: 3, cols: 7, split: 5, value: 21 }),
    );
  },
};

/** Back returns to the line, which is where it was; the typed number is kept. */
export const SplitBack: Story = {
  args: { config: split },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'right');
    await goNext(root);
    await enterNumber(root, 2);
    await userEvent.click(stepButton(root, 'back'));
    await waitFor(() => expect(root).toHaveAttribute('data-step', 'build'));
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '1');
  },
};

// ---------- disabled, tap-only, demo ----------

/** Disabled: nothing moves and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(pad(root, 'down')).toBeDisabled();
    await touchDragBetween(board(root), cellPoint(root, 0, 0), cellPoint(root, 2, 2));
    await expectShown(root, 0, 0);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoPlay: WidgetDemo = createDemoController({ strict: true });
/** Demo play: the guide drags the rectangle out, then counts its rows by fours. */
export const DemoPlay: Story = {
  globals: { motion: 'reduced' },
  args: { demo: demoPlay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoPlay.play({ op: 'drag-rect', args: { rows: 2, cols: 4 } });
    await expectShown(root, 2, 4);
    await demoPlay.play({ op: 'add-row' });
    await expectShown(root, 3, 4);
    const counting = demoPlay.play({ op: 'skip-count-rows' });
    await waitFor(() => expect(root.querySelector('.ni-work__count')).not.toBeNull());
    const count = q(root, '.ni-work__count');
    await expect(Number.parseFloat(getComputedStyle(count).fontSize)).toBeGreaterThanOrEqual(32);
    await counting;
    await expect(root.querySelector('.ni-work__count')).toBeNull();
    await expect(args.onInteract).not.toHaveBeenCalled();
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
  },
};

const demoSplit: WidgetDemo = createDemoController({ strict: true });
/** Demo play in `split`: the line goes in, then the total is typed on the ask step. */
export const DemoSplit: Story = {
  globals: { motion: 'reduced' },
  args: { config: split, demo: demoSplit },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoSplit.play({ op: 'split-at', args: { col: 5 } });
    await expect(q(root, '.ni-abw__line')).toHaveAttribute('data-split', '5');
    await demoSplit.play({ op: 'answer', args: { value: 21 } });
    await expect(root).toHaveAttribute('data-step', 'ask');
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ rows: 3, cols: 7, split: 5, value: 21 }),
    );
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });
/**
 * Demo invite in the smallest area: one ring, on the arrow that adds a row, with the
 * demonstration hand on it; the whole task stays in view.
 */
export const DemoInviteLandscapeMin: Story = {
  args: { demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    demoInvite.invite({ op: 'drag-rect', args: { rows: 3, cols: 4 } });
    await expectRing(root, pad(root, 'down'));
    await waitFor(() => expect(hand()).not.toBeNull());
    await expectPointerOn(hand(), pad(root, 'down'), root);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'array-build invite'));
  },
};

const demoInvites: WidgetDemo = createDemoController({ strict: true });
/** Each invite rings exactly one control: the arrow toward the rectangle, then Check. */
export const DemoInviteEachControl: Story = {
  args: { demo: demoInvites },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const want = { op: 'drag-rect', args: { rows: 2, cols: 2 } };
    demoInvites.invite(want);
    await expectRing(root, pad(root, 'down'));
    await press(root, 'down', 2);
    await expectRing(root, null);
    demoInvites.invite(want);
    await expectRing(root, pad(root, 'right'));
    await press(root, 'right', 2);
    demoInvites.invite(want);
    await expectRing(root, pad(root, 'left'));
    await press(root, 'left');
    demoInvites.invite(want);
    await expectRing(root, stepButton(root, 'check'));
  },
};

const demoSplitInvite: WidgetDemo = createDemoController({ strict: true });
/** `split` invites: the arrow toward the gap, Next once the line is there, then the answer. */
export const DemoInviteSplit: Story = {
  args: { config: split, demo: demoSplitInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    demoSplitInvite.invite({ op: 'split-at', args: { col: 5 } });
    await expectRing(root, pad(root, 'left'));
    await press(root, 'left', 2);
    demoSplitInvite.invite({ op: 'split-at', args: { col: 5 } });
    await expectRing(root, stepButton(root, 'next'));
    await goNext(root);
    demoSplitInvite.invite({ op: 'answer', args: { value: 21 } });
    await waitFor(() => expect(root.querySelectorAll('.ni-invite')).toHaveLength(1));
    await expect(root.querySelector('.ni-entry .ni-invite')).not.toBeNull();
    await enterNumber(root, 21);
    await expectRing(root, null);
  },
};

const demoUnsupported: WidgetDemo = createDemoController({ strict: true });
/** An op array-build doesn't define throws UnsupportedWidgetOpError in development. */
export const DemoUnsupportedOp: Story = {
  args: { demo: demoUnsupported },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(demoUnsupported.play({ op: 'fill-group' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};
