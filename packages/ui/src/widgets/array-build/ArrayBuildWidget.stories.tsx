import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  type SpyAudio,
  spyAudio,
  touchDragAndHold,
  waitForSettled,
} from '../../test-support/storyHelpers';
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
 * `array-build` (03 §5.5): build a rows × cols array by dragging its corner (or tapping a cell,
 * or the arrow keys), read an array's total on the number pad, or split an array (MUL.07). The
 * widget never shows a count or the size of the child's own rectangle.
 */

type Config = ConfigFor<'array-build'>;

const base = {
  format: 'array-build',
  orientationMatters: false,
  gridShown: true,
} as const;

/** G1: "3 rows of 4" on a 6 × 8 board. */
const dims: Config = {
  ...base,
  mode: 'build-dims',
  maxRows: 6,
  maxCols: 8,
  rows: 3,
  cols: 4,
  sprite: 'shell',
};
/** K: "2 rows of 3" on a small board: big, chunky sprites. */
const dimsK: Config = {
  ...base,
  mode: 'build-dims',
  maxRows: 3,
  maxCols: 4,
  rows: 2,
  cols: 3,
  sprite: 'starfish',
};
/** "6 rows of 3" fits this 4 × 7 board only turned (3 rows of 6); orientation is free. */
const turned: Config = {
  ...base,
  mode: 'build-dims',
  maxRows: 4,
  maxCols: 7,
  rows: 6,
  cols: 3,
  sprite: 'fish',
};
const total12: Config = {
  ...base,
  mode: 'build-total',
  maxRows: 6,
  maxCols: 8,
  total: 12,
  sprite: 'leaf',
};
/** new-way for 24 with 3 found (3 × 8, its turn 8 × 3, and 4 × 6): 2 × 12 is left. */
const newWay: Config = {
  ...base,
  mode: 'new-way',
  maxRows: 8,
  maxCols: 12,
  total: 24,
  found: [
    [3, 8],
    [8, 3],
    [4, 6],
  ],
  sprite: 'stone',
};
const gridOff: Config = { ...dims, gridShown: false, sprite: 'crab' };
const read: Config = {
  ...base,
  mode: 'read',
  maxRows: 6,
  maxCols: 6,
  rows: 3,
  cols: 5,
  sprite: 'shell',
  gridShown: false,
};
const readK: Config = {
  ...base,
  mode: 'read',
  maxRows: 5,
  maxCols: 5,
  rows: 2,
  cols: 4,
  sprite: 'fish',
};
const read10: Config = {
  ...base,
  mode: 'read',
  maxRows: 10,
  maxCols: 10,
  rows: 10,
  cols: 10,
  sprite: 'counter',
};
const split: Config = {
  ...base,
  mode: 'split',
  maxRows: 10,
  maxCols: 10,
  rows: 6,
  cols: 9,
  sprite: 'counter',
};
const build10: Config = {
  ...base,
  mode: 'build-dims',
  maxRows: 10,
  maxCols: 10,
  rows: 7,
  cols: 8,
  sprite: 'shell',
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
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-abw';

// ---------- helpers ----------

const cell = (root: HTMLElement, r: number, c: number) =>
  root.querySelector(`[data-cell="${r}-${c}"]`) as HTMLElement;
const corner = (root: HTMLElement) => root.querySelector('.ni-abw__corner') as HTMLElement;
const stick = (root: HTMLElement) => root.querySelector('.ni-abw__stick') as HTMLElement;
const gap = (root: HTMLElement, col: number) =>
  root.querySelector(`.ni-abw__gap[data-gap="${col}"]`) as HTMLElement;
const padKey = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const checkButton = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const addRowButton = (root: HTMLElement) => within(root).getByRole('button', { name: 'Add a row' });
const pitchOf = (root: HTMLElement) =>
  cell(root, 0, 1).getBoundingClientRect().left - cell(root, 0, 0).getBoundingClientRect().left;

/** The rectangle the sprites make (every filled cell, and nothing else). */
function builtDims(root: HTMLElement) {
  const filled = [...root.querySelectorAll<HTMLElement>('[data-filled="true"]')];
  const rows = new Set(filled.map((el) => el.dataset.cell?.split('-')[0])).size;
  const cols = new Set(filled.map((el) => el.dataset.cell?.split('-')[1])).size;
  const sprites = root.querySelectorAll('.ni-abw__sprite').length;
  return { rows, cols, sprites };
}
async function expectBuilt(root: HTMLElement, rows: number, cols: number) {
  await waitFor(() => expect(builtDims(root)).toEqual({ rows, cols, sprites: rows * cols }));
}

/** Nothing in the widget's text, accessible names or data attributes states these numbers. */
async function expectNothingStates(root: HTMLElement, forbidden: number[], except?: Element) {
  const scope = [...root.querySelectorAll('*')].filter((el) => !except?.contains(el));
  const words = [
    ...scope
      .filter((el) => el.children.length === 0)
      .map((el) => (except?.contains(el) ? '' : (el.textContent ?? ''))),
    ...scope.map((el) => el.getAttribute('aria-label') ?? ''),
    ...scope.map((el) => el.getAttribute('title') ?? ''),
  ].join(' ');
  const numbers = new Set((words.match(/\d+/g) ?? []).map(Number));
  for (const f of forbidden) await expect(numbers.has(f), `${f} shown`).toBe(false);
  for (const el of scope) {
    for (const a of el.getAttributeNames()) {
      if (!a.startsWith('data-')) continue;
      await expect(forbidden.map(String), `${a}="${el.getAttribute(a)}"`).not.toContain(
        el.getAttribute(a),
      );
    }
  }
}

/** Sprites never overlap: every two neighbours (row or column) are apart. */
async function expectSpritesApart(root: HTMLElement) {
  const rect = (el: Element | null) => (el as HTMLElement).getBoundingClientRect();
  for (const s of root.querySelectorAll<HTMLElement>('[data-filled="true"]')) {
    const [r = 0, c = 0] = (s.dataset.cell ?? '').split('-').map(Number);
    const a = rect(s.querySelector('.ni-abw__sprite'));
    const right = cell(root, r, c + 1)?.querySelector('.ni-abw__sprite');
    const below = cell(root, r + 1, c)?.querySelector('.ni-abw__sprite');
    if (right) await expect(rect(right).left).toBeGreaterThan(a.right);
    if (below) await expect(rect(below).top).toBeGreaterThan(a.bottom);
  }
}

/**
 * The widget fits its stage with no scrolling: the stage stays within the tablet's 720 px, the
 * widget's scroll size equals its client size, and every drawn part lies inside the widget.
 */
async function expectFits(canvasElement: HTMLElement, root: HTMLElement) {
  const stage = canvasElement.querySelector('.story-widget-stage') as HTMLElement;
  await expect(stage.getBoundingClientRect().height).toBeLessThanOrEqual(720);
  await expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth);
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  await expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight);
  const box = root.getBoundingClientRect();
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    await expect(r.left, `${el.className} left`).toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(r.right, `${el.className} right`).toBeLessThanOrEqual(box.right + 0.5);
    await expect(r.top, `${el.className} top`).toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(r.bottom, `${el.className} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
  }
}

async function expectBigNumerals(els: Element[]) {
  for (const el of els) {
    await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(32);
  }
}

const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const numbersSaid = (audio: SpyAudio) =>
  (audio.sayPhrases.mock.calls as unknown[][]).map(
    (c) => (c[0] as { number: number }[])[0]?.number,
  );
/** A sprite's settled width (after its pop-in). */
async function spriteWidth(root: HTMLElement) {
  const sprite = root.querySelector('.ni-abw__sprite') as HTMLElement;
  await waitForSettled(sprite);
  return sprite.getBoundingClientRect().width;
}
const state = (value: Record<string, number>) => ({ kind: 'state', value });

// ---------- build modes ----------

/**
 * Evidence, START: "3 rows of 4" on an empty board. The task chip shows the task; the corner
 * handle waits at the top-left, breathing gently; Check is off until something is built.
 */
export const BuildDimsStart: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectBuilt(root, 0, 0);
    await expect(corner(root)).toHaveAttribute('data-empty', 'true');
    await expect(corner(root)).toBeEnabled();
    await expect(addRowButton(root)).toBeEnabled();
    await expect(checkButton(root)).toBeDisabled();
    await expect(within(root).getByText('Make your rectangle here')).toBeVisible();
    await expectFits(canvasElement, root);
  },
};

/** Evidence, IN PROGRESS: two of the three rows built (tap the cell at the end of row 2). */
export const BuildDimsInProgress: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(cell(root, 1, 3));
    await expectBuilt(root, 2, 4);
    await expect(checkButton(root)).toBeEnabled();
    await expect(args.onResponse).not.toHaveBeenCalled();
    await expectFits(canvasElement, root);
  },
};

/**
 * G1 build-dims: "3 rows of 4". Check stays off on an empty board; tapping cell (3rd row, 4th
 * column) makes the 3 × 4 rectangle, and Check answers `{ rows: 3, cols: 4 }`.
 */
export const BuildDims: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(canvas.getByRole('button', { name: '3 rows of 4' })).toBeVisible();
    await expect(canvas.getByRole('group', { name: 'Make your rectangle here' })).toBeVisible();
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(cell(root, 2, 3));
    await expectBuilt(root, 3, 4);
    // No count or size of the child's rectangle anywhere but the task chip.
    await expectNothingStates(root, [12], root.querySelector('.ni-abw__task') ?? undefined);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
    // G1 sizes: the handle, the chip and the buttons are ≥ 64 px and ≥ 12 px apart.
    const targets = [
      corner(root),
      canvas.getByRole('button', { name: '3 rows of 4' }),
      addRowButton(root),
      checkButton(root),
    ];
    for (const el of targets) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(targets);
    await expectBigNumerals([...root.querySelectorAll('.ni-abw__num')]);
    await expectSpritesApart(root);
    await expectFits(canvasElement, root);
  },
};

/**
 * K build-dims: "2 rows of 3" with big, chunky sprites. Every control is an icon with a spoken
 * label; two taps on "add a row" build it.
 */
export const BuildDimsK: Story = {
  globals: { ageMode: 'k' },
  args: { config: dimsK },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    // Icon-only controls (06 §5): no label text to read.
    await expect(root.querySelectorAll('.ni-btn__label')).toHaveLength(0);
    const chip = within(root).getByRole('button', { name: '2 rows of 3' });
    await userEvent.click(chip);
    await expect(audio.say).toHaveBeenCalledWith('ui.widget.ab.task.dims', { rows: 2, cols: 3 });
    await userEvent.click(addRowButton(root));
    await expect(said(audio)).toContain('ui.widget.ab.add-row');
    await expectBuilt(root, 1, 3);
    await userEvent.click(addRowButton(root));
    await expectBuilt(root, 2, 3);
    const targets = [corner(root), chip, addRowButton(root), checkButton(root)];
    for (const el of targets) await expectTargetSize(el, 'k');
    await expectTargetGaps(targets);
    // Chunky: each sprite is over 100 px across.
    await expect(await spriteWidth(root)).toBeGreaterThan(100);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 2, cols: 3 }));
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual(['add-row', 'add-row']);
    await expectFits(canvasElement, root);
  },
};

/**
 * "6 rows of 3" on a board only 4 rows tall: the child builds it turned, 3 rows of 6. The widget
 * sends what was built; the checker accepts the turn (orientation is free).
 */
export const BuildDimsTurned: Story = {
  args: { config: turned },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('button', { name: '6 rows of 3' })).toBeVisible();
    await userEvent.click(cell(root, 2, 5));
    await expectBuilt(root, 3, 6);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 6 }));
  },
};

/**
 * build-total: "make a rectangle with 12". The chip shows the total; the board never counts the
 * child's rectangle, so a wrong try (2 × 5) shows no 10, 2 or 5 anywhere.
 */
export const BuildTotal: Story = {
  args: { config: total12 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(
      within(root).getByRole('button', { name: 'Make a rectangle with 12' }),
    ).toBeVisible();
    await userEvent.click(cell(root, 1, 4));
    await expectBuilt(root, 2, 5);
    await expectNothingStates(root, [10, 2, 5]);
    await userEvent.click(cell(root, 2, 3));
    await expectBuilt(root, 3, 4);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
    await expectBigNumerals([...root.querySelectorAll('.ni-abw__num')]);
  },
};

/**
 * new-way (stress): 24 on an 8 × 12 board with three rectangles already made, shown as small
 * pictures. The child makes the one left, 2 × 12. Everything fits.
 */
export const NewWay: Story = {
  args: { config: newWay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const canvas = within(root);
    await expect(canvas.getByRole('button', { name: 'Make 24 a new way' })).toBeVisible();
    const found = canvas.getByRole('group', { name: 'You did them before' });
    const thumbs = within(found).getAllByRole('img');
    await expect(thumbs.map((t) => t.getAttribute('aria-label'))).toEqual([
      '3 rows of 8',
      '8 rows of 3',
      '4 rows of 6',
    ]);
    // Each made rectangle is a silhouette with its sides, the numerals ≥ 32 px.
    await expect(thumbs[0]).toHaveTextContent('3 × 8');
    await expectBigNumerals([...root.querySelectorAll('.ni-abw__thumb-dims')]);
    await userEvent.click(cell(root, 1, 11));
    await expectBuilt(root, 2, 12);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 2, cols: 12 }));
    await expectSpritesApart(root);
    await expectFits(canvasElement, root);
  },
};

// ---------- the drag, tap and keyboard paths ----------

/**
 * Mouse: drag the corner handle out 4 cells across and 3 down (the rectangle grows under the
 * pointer), then back one column. Trace: drag corner → drop on the far cell, each time.
 */
export const DragCorner: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const p = pitchOf(root);
    const from = center(corner(root));
    await pointerDrag(corner(root), { x: from.x + 4 * p, y: from.y + 3 * p }, 'mouse', 10);
    await expectBuilt(root, 3, 4);
    const again = center(corner(root));
    await pointerDrag(corner(root), { x: again.x - p, y: again.y }, 'mouse');
    await expectBuilt(root, 3, 3);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 3 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:corner',
      'drop:cell-2-3',
      'drag:corner',
      'drop:cell-2-2',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Touch: hold the finger mid-drag (the rectangle already shows 2 × 2), then let go at 3 × 4. */
export const TouchDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const p = pitchOf(root);
    const from = center(corner(root));
    const lift = await touchDragAndHold(corner(root), { x: from.x + 2 * p, y: from.y + 2 * p });
    await expectBuilt(root, 2, 2);
    await expect(corner(root)).toHaveAttribute('data-dragging', 'true');
    await lift();
    const lift2 = await touchDragAndHold(corner(root), {
      x: center(corner(root)).x + 2 * p,
      y: center(corner(root)).y + p,
    });
    await lift2();
    await expectBuilt(root, 3, 4);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:corner',
      'drop:cell-1-1',
      'drag:corner',
      'drop:cell-2-3',
    ]);
    await expectTraceOrdered(trace);
  },
};

/**
 * Tap: tapping a cell makes the rectangle reach it, growing or shrinking. Tapping a sprite also
 * speaks its name.
 */
export const TapCell: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(cell(root, 3, 5));
    await expectBuilt(root, 4, 6);
    await expect(said(audio)).not.toContain('ui.sprite.shell');
    // A sprite inside the rectangle: the rectangle shrinks to reach it, and it names itself.
    await userEvent.click(cell(root, 2, 3));
    await expectBuilt(root, 3, 4);
    await expect(said(audio)).toContain('ui.sprite.shell');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(['tap:cell-3-5', 'tap:cell-2-3']);
    await expectTraceOrdered(trace);
  },
};

/** Keyboard (06 §7): arrow keys on the handle move the corner one cell; Enter checks. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    corner(root).focus();
    // Enter on an empty board sends nothing.
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowRight}');
    await expectBuilt(root, 1, 1);
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}{ArrowDown}');
    await expectBuilt(root, 3, 4);
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}');
    await expect(corner(root)).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'move:cell-0-0',
      'move:cell-0-1',
      'move:cell-0-2',
      'move:cell-0-3',
      'move:cell-1-3',
      'move:cell-2-3',
      'move:cell-2-2',
      'move:cell-2-3',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** "Add a row": the first row is the item's width; each press adds one; full board → off. */
export const AddRow: Story = {
  args: { config: { ...dims, maxRows: 3 } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(addRowButton(root));
    await expectBuilt(root, 1, 4);
    await userEvent.click(addRowButton(root));
    await userEvent.click(addRowButton(root));
    await expectBuilt(root, 3, 4);
    await expect(addRowButton(root)).toBeDisabled();
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
    await expect(traceOf(args.onInteract).map((e) => e.target)).toEqual([
      'add-row',
      'add-row',
      'add-row',
    ]);
  },
};

/** Grid off (`grid.off`): no cell squares, only faint dots where cells snap. */
export const GridOff: Story = {
  args: { config: gridOff },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-abw__board')).toHaveAttribute('data-grid', 'off');
    const dot = getComputedStyle(cell(root, 5, 7), '::before');
    await expect(dot.width).toBe('6px');
    await userEvent.click(cell(root, 2, 3));
    await expectBuilt(root, 3, 4);
    // A filled cell has no dot under its sprite.
    await expect(getComputedStyle(cell(root, 0, 0), '::before').content).toBe('none');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
  },
};

// ---------- read ----------

/**
 * G1 read: the 3 × 5 array as a picture; type 15 on the pad. Nothing shows 15 before the child
 * types it. Tapping a sprite names it.
 */
export const Read: Story = {
  args: { config: read, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const picture = within(root).getByRole('img', { name: 'Look at the picture' });
    await expect(picture.querySelectorAll('.ni-abw__sprite')).toHaveLength(15);
    await expectNothingStates(root, [15]);
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(cell(root, 1, 2));
    await expect(said(audio)).toContain('ui.sprite.shell');
    await userEvent.click(padKey(root, '1'));
    await userEvent.click(padKey(root, '5'));
    await expect(root.querySelector('.ni-abw__blank')).toHaveAttribute(
      'aria-label',
      'Your answer: 15',
    );
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 15 });
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:sprite-1-2',
      'tap:key-1',
      'tap:key-5',
    ]);
    await expectTraceOrdered(trace);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const key of keys) await expectTargetSize(key, 'g1-up');
    await expectTargetGaps([...keys, checkButton(root)]);
    await expectBigNumerals([root.querySelector('.ni-abw__blank') as Element]);
    await expectFits(canvasElement, root);
  },
};

/** K read: 2 rows of 4 fish, big; K-sized pad keys, and the check icon beside the blank. */
export const ReadK: Story = {
  globals: { ageMode: 'k' },
  args: { config: readK, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-btn__label')).toHaveLength(0);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const key of keys) await expectTargetSize(key, 'k');
    await expectTargetSize(checkButton(root), 'k');
    await expectTargetGaps([...keys, checkButton(root)]);
    await expect(await spriteWidth(root)).toBeGreaterThan(100);
    await userEvent.keyboard('8');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 8 });
    await expectFits(canvasElement, root);
  },
};

// ---------- split ----------

/**
 * Split (MUL.07, stress 6 × 9): Check waits for both the split line and the total. Tap a gap
 * marker, drag the stick to another gap, nudge it with the arrow keys, type 54.
 */
export const Split: Story = {
  args: { config: split },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(within(root).getByRole('img', { name: 'Look at the picture' })).toBeVisible();
    await expect(root.querySelectorAll('.ni-abw__gap')).toHaveLength(8);
    await expectNothingStates(root, [54]);
    await userEvent.click(padKey(root, '5'));
    await userEvent.click(padKey(root, '4'));
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(gap(root, 3));
    await expect(gap(root, 3)).toHaveAttribute('aria-pressed', 'true');
    // Drag the stick two gaps right.
    const p = pitchOf(root);
    const from = center(stick(root));
    await pointerDrag(stick(root), { x: from.x + 2 * p, y: from.y }, 'mouse');
    await expect(gap(root, 5)).toHaveAttribute('aria-pressed', 'true');
    stick(root).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(gap(root, 4)).toHaveAttribute('aria-pressed', 'true');
    await expect(checkButton(root)).toBeEnabled();
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ rows: 6, cols: 9, split: 4, value: 54 }),
    );
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual([
      'tap:key-5',
      'tap:key-4',
      'tap:gap-3',
      'drag:split',
      'drop:gap-5',
      'move:gap-4',
    ]);
    await expectTraceOrdered(trace);
    // The two parts pull apart: the column after the split starts further right.
    const left = cell(root, 0, 3).getBoundingClientRect();
    const right = cell(root, 0, 4).getBoundingClientRect();
    await expect(right.left - left.right).toBeGreaterThan(10);
    const gaps = [...root.querySelectorAll<HTMLElement>('.ni-abw__gap')];
    for (const g of gaps) await expectTargetSize(g, 'g1-up');
    await expectTargetGaps([...gaps, stick(root)]);
    await expectTargetSize(stick(root), 'g1-up');
    await expectSpritesApart(root);
    await expectFits(canvasElement, root);
  },
};

// ---------- stress ----------

/** Stress: a 10 × 10 read with the pad. 100 separate sprites; everything fits 1280 × 800. */
export const Stress10x10: Story = {
  args: { config: read10, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-abw__sprite')).toHaveLength(100);
    await expectNothingStates(root, [100]);
    await expect(await spriteWidth(root)).toBeGreaterThanOrEqual(40);
    await expectSpritesApart(root);
    await expectFits(canvasElement, root);
  },
};

/** Stress: building 7 × 8 on a 10 × 10 board. The full board and the handle fit. */
export const StressBuild: Story = {
  args: { config: build10 },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(cell(root, 9, 9));
    await expectBuilt(root, 10, 10);
    await expectFits(canvasElement, root);
    await userEvent.click(cell(root, 6, 7));
    await expectBuilt(root, 7, 8);
    await expect(await spriteWidth(root)).toBeGreaterThanOrEqual(36);
    await expectSpritesApart(root);
    await expectTargetSize(corner(root), 'g1-up');
    await expectFits(canvasElement, root);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 7, cols: 8 }));
  },
};

// ---------- disabled ----------

/** `disabled`: no input at all (feedback showing, or the runner waiting). */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(corner(root)).toBeDisabled();
    await expect(addRowButton(root)).toBeDisabled();
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(cell(root, 2, 3));
    const from = center(corner(root));
    await pointerDrag(corner(root), { x: from.x + 200, y: from.y + 200 }, 'mouse');
    await expectBuilt(root, 0, 0);
    await expect(args.onInteract).not.toHaveBeenCalled();
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

// ---------- demo mode ----------

const demoPlay: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (03 §6.3), build: the corner animates out to 3 × 4, a row is added, Pip counts the rows
 * (1, 2, 3, 4) and skip-counts them (4, 8, 12, 16); `answer` is accepted. Input is off while a
 * step plays; afterwards the widget is back to its normal, interactive look.
 */
export const DemoPlay: Story = {
  args: { config: dims, demo: demoPlay },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const growing = demoPlay.play({ op: 'drag-rect', args: { rows: 3, cols: 4 } });
    // Mid-animation the corner is on its way out: fewer than 12 sprites.
    await waitFor(() => expect(builtDims(root).sprites).toBeGreaterThan(0));
    await expect(builtDims(root).sprites).toBeLessThan(12);
    await expect(corner(root)).toBeDisabled();
    await growing;
    await expectBuilt(root, 3, 4);
    await demoPlay.play({ op: 'add-row' });
    await expectBuilt(root, 4, 4);
    const counting = demoPlay.play({ op: 'count-rows' });
    await waitFor(() => expect(root.querySelector('.ni-abw__count')).toHaveTextContent('2'));
    await expect(root.querySelectorAll('[data-lit="true"]')).toHaveLength(4);
    await counting;
    await expect(numbersSaid(audio)).toEqual([1, 2, 3, 4]);
    audio.sayPhrases.mockClear();
    await demoPlay.play({ op: 'skip-count-rows' });
    await expect(numbersSaid(audio)).toEqual([4, 8, 12, 16]);
    await demoPlay.play({ op: 'answer', args: { value: 16 } });
    await expectBuilt(root, 4, 4);
    // Back to normal: no highlight or count left, the controls on again.
    await waitFor(() => expect(root.querySelector('.ni-abw__count')).toBeNull());
    await expect(root.querySelectorAll('[data-lit="true"]')).toHaveLength(0);
    await expect(corner(root)).toBeEnabled();
    await expect(checkButton(root)).toBeEnabled();
  },
};

const demoSplit: WidgetDemo = createDemoController({ strict: true });

/** Demo, split: the line moves to after column 5, then Pip types the total. */
export const DemoPlaySplit: Story = {
  args: { config: split, demo: demoSplit },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoSplit.play({ op: 'split-at', args: { col: 5 } });
    await expect(gap(root, 5)).toHaveAttribute('aria-pressed', 'true');
    await demoSplit.play({ op: 'count-rows' });
    await demoSplit.play({ op: 'answer', args: { value: 54 } });
    await expect(root.querySelector('.ni-abw__blank')).toHaveAttribute(
      'aria-label',
      'Your answer: 54',
    );
    // The demo's answer is the child's to check: Check is on, and sends the demo's state.
    await waitFor(() => expect(checkButton(root)).toBeEnabled());
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ rows: 6, cols: 9, split: 5, value: 54 }),
    );
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });

/** Demo invite: Pip's hand points at the corner handle (drag it), then at "add a row". */
export const DemoInvite: Story = {
  args: { config: dims, demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoInvite.play({ op: 'drag-rect', args: { rows: 2, cols: 2 } });
    demoInvite.invite({ op: 'drag-rect', args: { rows: 3, cols: 4 } });
    await waitFor(() => expect(corner(root)).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, corner(root), root);
    demoInvite.invite({ op: 'add-row' });
    await waitFor(() => expect(addRowButton(root)).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, addRowButton(root), root);
    // The child's own step clears the invite.
    await userEvent.click(addRowButton(root));
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

const demoInviteSplit: WidgetDemo = createDemoController({ strict: true });

/** Demo invite, split: the hand points at the gap after column 4. */
export const DemoInviteSplit: Story = {
  args: { config: split, demo: demoInviteSplit },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    demoInviteSplit.invite({ op: 'split-at', args: { col: 4 } });
    await waitFor(() => expect(gap(root, 4)).toHaveClass('ni-invite'));
    await expectPointerOn(root.querySelector('.ni-hand') as HTMLElement, gap(root, 4), root);
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

const demoReduced: WidgetDemo = createDemoController({ strict: true });

/**
 * Reduced motion: ops are instant (no corner animation, no row-by-row count); the highlight shows
 * briefly (every row lit with the final count), then the widget is back to normal.
 */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: dims, demo: demoReduced },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    const growing = demoReduced.play({ op: 'drag-rect', args: { rows: 3, cols: 4 } });
    // The rectangle appears whole at once: never a part-built step.
    await waitFor(() => expect(builtDims(root).sprites).toBeGreaterThan(0));
    await expectBuilt(root, 3, 4);
    await growing;
    const counting = demoReduced.play({ op: 'skip-count-rows' });
    await waitFor(() => expect(root.querySelectorAll('[data-lit="true"]')).toHaveLength(12));
    await expect(root.querySelector('.ni-abw__count')).toHaveTextContent('12');
    await counting;
    await expect(performance.now() - started).toBeLessThan(1500);
    await waitFor(() => expect(root.querySelector('.ni-abw__count')).toBeNull());
    await expect(getComputedStyle(corner(root)).transitionDuration).toMatch(/^0s/);
    await expect(getComputedStyle(corner(root)).animationName).toBe('none');
  },
};
