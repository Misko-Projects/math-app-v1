import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { type SpyAudio, spyAudio } from '../../test-support/storyHelpers';
import {
  expectAreaFit,
  expectNote,
  expectRing,
  inArea,
  namedStory,
  stepButton,
} from '../../test-support/twoStepStory';
import { expectTraceOrdered, findWidget, traceOf } from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `puzzle-grid` (03 §5.5): a small grid puzzle, its tray and Check. Every story runs in a
 * workshop's widget area: `landscapeMin` (906 × 373, the smallest) unless its name says tablet
 * (1226 × 493). The configs are the largest puzzles the shipped templates build (PUZ.01, PUZ.02,
 * PUZ.03, CPS.06) and the variants of issue #13 (mini-KenKen 3 × 3 and 4 × 4, a magic square, a
 * missing-number grid) at the bounds of the model.
 */

type Config = ConfigFor<'puzzle-grid'>;
type Cell = Config['cells'][number];

const line = (cells: [number, number][], sum: number) => ({
  kind: 'line-sum' as const,
  cells,
  sum,
});
const rowLine = (r: number, n: number, sum: number) =>
  line(
    Array.from({ length: n }, (_, c): [number, number] => [r, c]),
    sum,
  );
const colLine = (c: number, n: number, sum: number) =>
  line(
    Array.from({ length: n }, (_, r): [number, number] => [r, c]),
    sum,
  );
/** A grid of givens (numbers) and blanks (null), with each cell's cage where there are cages. */
const gridCells = (values: (number | null)[][], cages?: string[][]): Cell[] =>
  values.flatMap((row, r) =>
    row.map((v, c) => ({
      r,
      c,
      ...(v === null ? { blank: true } : { given: v }),
      ...(cages ? { cage: cages[r]?.[c] } : {}),
    })),
  );

/** PUZ.01.t1 at its largest: 3 × 4, a snake from 80 to 91, five blanks, a tray of 14. */
const SNAKE: [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 3],
  [1, 2],
  [1, 1],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [2, 3],
];
const PATH_BLANKS = new Set([1, 4, 5, 8, 10]);
const path: Config = {
  format: 'puzzle-grid',
  variant: 'number-path',
  rows: 3,
  cols: 4,
  cells: SNAKE.map(([r, c], i) =>
    PATH_BLANKS.has(i) ? { r, c, blank: true } : { r, c, given: 80 + i },
  ),
  constraints: [{ kind: 'adjacent-step', step: 1 }],
  palette: Array.from({ length: 14 }, (_, i) => 79 + i),
  uniqueSolution: true,
};

/** PUZ.02.t3 (abstract): every side makes 12; the chain blank set (top, left middle, bottom). */
const triangle: Config = {
  format: 'puzzle-grid',
  variant: 'sum-triangle',
  rows: 3,
  cols: 5,
  cells: [
    { r: 0, c: 2, blank: true },
    { r: 1, c: 1, blank: true },
    { r: 1, c: 3, given: 4 },
    { r: 2, c: 0, given: 2 },
    { r: 2, c: 2, blank: true },
    { r: 2, c: 4, given: 5 },
  ],
  constraints: [
    line(
      [
        [0, 2],
        [1, 1],
        [2, 0],
      ],
      12,
    ),
    line(
      [
        [0, 2],
        [1, 3],
        [2, 4],
      ],
      12,
    ),
    line(
      [
        [2, 0],
        [2, 2],
        [2, 4],
      ],
      12,
    ),
  ],
  palette: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  uniqueSolution: true,
};

/** CPS.06.t3: every way to make `whole`, a row each. */
const ways = (whole: number): Config => {
  const rows = Math.floor(whole / 2);
  return {
    format: 'puzzle-grid',
    variant: 'all-ways',
    rows,
    cols: 2,
    cells: Array.from({ length: rows }, (_, r) => [
      { r, c: 0, blank: true },
      { r, c: 1, blank: true },
    ]).flat(),
    constraints: Array.from({ length: rows }, (_, r) => rowLine(r, 2, whole)),
    palette: Array.from({ length: whole - 1 }, (_, i) => i + 1),
    uniqueSolution: false,
  };
};

/** PUZ.03.t2, the tower outline (the tallest): 3 rectangles and 4 squares. */
const tower: Config = {
  format: 'puzzle-grid',
  variant: 'shape-fill',
  rows: 4,
  cols: 3,
  cells: [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 0],
    [2, 1],
    [2, 2],
    [3, 0],
    [3, 1],
    [3, 2],
  ].map(([r, c]) => ({ r: r as number, c: c as number, blank: true })),
  constraints: [
    {
      kind: 'use-each',
      values: ['rectangle', 'rectangle', 'rectangle', 'square', 'square', 'square', 'square'],
    },
  ],
  palette: ['square', 'rectangle'],
  uniqueSolution: false,
};

/** A 3 × 3 mini-KenKen: 1 2 3 / 2 3 1 / 3 1 2. */
const kenken3: Config = {
  format: 'puzzle-grid',
  variant: 'cage-sum',
  rows: 3,
  cols: 3,
  cells: gridCells(
    [
      [null, null, null],
      [null, null, null],
      [null, null, 2],
    ],
    [
      ['a', 'a', 'b'],
      ['c', 'd', 'b'],
      ['c', 'd', 'e'],
    ],
  ),
  constraints: [
    { kind: 'row-unique' },
    { kind: 'col-unique' },
    { kind: 'cage-sum', cage: 'a', sum: 3 },
    { kind: 'cage-sum', cage: 'b', sum: 4 },
    { kind: 'cage-sum', cage: 'c', sum: 5 },
    { kind: 'cage-sum', cage: 'd', sum: 4 },
    { kind: 'cage-sum', cage: 'e', sum: 2 },
  ],
  palette: [1, 2, 3],
  uniqueSolution: true,
};

/** A 4 × 4 mini-KenKen, the tightest grid: cages of one to four boxes, sums up to 12. */
const kenken4: Config = {
  format: 'puzzle-grid',
  variant: 'cage-sum',
  rows: 4,
  cols: 4,
  // 1 2 3 4 / 3 4 1 2 / 2 1 4 3 / 4 3 2 1
  cells: gridCells(
    [
      [null, null, null, null],
      [null, null, 1, null],
      [null, null, null, null],
      [4, null, null, null],
    ],
    [
      ['a', 'a', 'b', 'b'],
      ['c', 'd', 'e', 'b'],
      ['c', 'd', 'f', 'f'],
      ['g', 'h', 'h', 'f'],
    ],
  ),
  constraints: [
    { kind: 'row-unique' },
    { kind: 'col-unique' },
    { kind: 'cage-sum', cage: 'a', sum: 3 },
    { kind: 'cage-sum', cage: 'b', sum: 9 },
    { kind: 'cage-sum', cage: 'c', sum: 5 },
    { kind: 'cage-sum', cage: 'd', sum: 5 },
    { kind: 'cage-sum', cage: 'e', sum: 1 },
    { kind: 'cage-sum', cage: 'f', sum: 8 },
    { kind: 'cage-sum', cage: 'g', sum: 4 },
    { kind: 'cage-sum', cage: 'h', sum: 5 },
  ],
  palette: [1, 2, 3, 4],
  uniqueSolution: false,
};

/** A magic square: every row, column and diagonal makes 15, with 1, 3, 7 and 9 once each. */
const magic: Config = {
  format: 'puzzle-grid',
  variant: 'magic-square',
  rows: 3,
  cols: 3,
  cells: gridCells([
    [2, null, 6],
    [null, 5, null],
    [4, null, 8],
  ]),
  constraints: [
    rowLine(0, 3, 15),
    rowLine(1, 3, 15),
    rowLine(2, 3, 15),
    colLine(0, 3, 15),
    colLine(1, 3, 15),
    colLine(2, 3, 15),
    line(
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      15,
    ),
    line(
      [
        [0, 2],
        [1, 1],
        [2, 0],
      ],
      15,
    ),
    { kind: 'use-each', values: [1, 3, 7, 9] },
  ],
  palette: [1, 3, 7, 9],
  uniqueSolution: true,
};

/** A missing-number grid: the sum of each row and column at its end. */
const numbers: Config = {
  format: 'puzzle-grid',
  variant: 'missing-digit',
  rows: 3,
  cols: 3,
  cells: gridCells([
    [3, null, 5],
    [null, 6, 2],
    [4, 1, null],
  ]),
  constraints: [
    rowLine(0, 3, 15),
    rowLine(1, 3, 15),
    rowLine(2, 3, 14),
    colLine(0, 3, 14),
    colLine(1, 3, 14),
    colLine(2, 3, 16),
  ],
  palette: [5, 6, 7, 8, 9],
  uniqueSolution: true,
};

const meta = {
  title: 'Widgets/PuzzleGrid',
  args: {
    config: path as WidgetConfig,
    tier: 'pictorial',
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

const ROOT = '.ni-pz';

// ---------- helpers ----------

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const box = (root: HTMLElement, r: number, c: number) => q(root, `[data-cue="cell-${r}-${c}"]`);
const card = (root: HTMLElement, value: number | string) => q(root, `[data-cue="card-${value}"]`);
const clearCard = (root: HTMLElement) => q(root, '[data-cue="clear"]');
const boxes = (root: HTMLElement) => all(root, '.ni-pz__cell');
const cards = (root: HTMLElement) => all(root, '.ni-pz__card');
const current = (root: HTMLElement) => q(root, '.ni-pz__cell[data-current="true"]');
const marked = (root: HTMLElement) =>
  all(root, '.ni-pz__cell[data-marked="true"]').map((el) => `${el.dataset.r},${el.dataset.c}`);
const lit = (root: HTMLElement) =>
  all(root, '.ni-pz__cell[data-lit="true"]').map((el) => `${el.dataset.r},${el.dataset.c}`);
const audioOf = (parameters: { ui?: { audio?: unknown } }) => parameters.ui?.audio as SpyAudio;
const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const steps = (args: { onInteract?: unknown }) =>
  traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
const state = (fill: (number | string)[][]) => ({ kind: 'state', value: { fill } });
const cellPx = (root: HTMLElement) => Number(root.dataset.cell);

/** Puts `value` in the box at (r, c): touch the box, then the card. */
async function fill(root: HTMLElement, r: number, c: number, value: number | string) {
  await userEvent.click(box(root, r, c));
  await userEvent.click(card(root, value));
}

/** The controls and parts of the layout, for `expectAreaFit`. */
const fit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => ({
  ageMode,
  story,
  controls: { boxes: boxes(root), cards: cards(root), check: [stepButton(root, 'check')] },
  parts: all(root, '.ni-pz__puzzle, .ni-pz__tray'),
  minFill: 0.5,
});

/** Numerals are at least 32 px, a cage's label at least 24 px, and each stays inside its box. */
async function expectReadable(root: HTMLElement) {
  for (const el of all(root, '.ni-pz__numeral, .ni-pz__tag, .ni-pz__sign')) {
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    await expect(size, `"${el.textContent}"`).toBeGreaterThanOrEqual(32);
  }
  for (const el of all(root, '.ni-pz__cage-label')) {
    await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(24);
  }
  for (const el of all(root, '.ni-pz__numeral, .ni-pz__cage-label')) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const glyphs = range.getBoundingClientRect();
    const home = (el.closest('button') as HTMLElement).getBoundingClientRect();
    await expect(glyphs.left, `"${el.textContent}" left`).toBeGreaterThanOrEqual(home.left);
    await expect(glyphs.right, `"${el.textContent}" right`).toBeLessThanOrEqual(home.right);
  }
}

// ---------- number path (PUZ.01) ----------

/** The largest path in the smallest area: fill, change and empty a box by touch; Check sends. */
export const NumberPath: Story = {
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid number-path 906x373'));
    await expectReadable(root);
    await expect(cellPx(root)).toBeGreaterThanOrEqual(64);
    // The path's direction is a filled arrowhead in each gap, never a bare chevron: beside two
    // numbers a chevron reads as the "greater than" or "less than" sign of the compare widget.
    const arrows = [...root.querySelectorAll<SVGPathElement>('.ni-pz__arrow')];
    await expect(arrows).toHaveLength(11);
    for (const arrow of arrows) {
      await expect(arrow.getAttribute('d')).toMatch(/Z$/);
      await expect(getComputedStyle(arrow).fill).not.toBe('none');
    }
    await expect(q(root, '.ni-pz__puzzle').textContent).not.toMatch(/[<>]/);
    // The first empty box is the current one; Check waits for every box.
    await expect(current(root)).toBe(box(root, 0, 1));
    await expect(stepButton(root, 'check')).toBeDisabled();
    await userEvent.click(card(root, 82));
    await expect(box(root, 0, 1)).toHaveTextContent('82');
    await expect(audioOf(parameters).sayPhrases).toHaveBeenCalledWith([{ number: 82 }]);
    // The next empty box in reading order is current now.
    await expect(current(root)).toBe(box(root, 1, 2));
    // Change the first box: touch it, then another card.
    await fill(root, 0, 1, 81);
    await expect(box(root, 0, 1)).toHaveTextContent('81');
    // Empty a box with the tray's last card, and fill it again.
    await fill(root, 1, 2, 90);
    await userEvent.click(box(root, 1, 2));
    await userEvent.click(clearCard(root));
    await expect(box(root, 1, 2)).toHaveAttribute('data-kind', 'empty');
    await expect(box(root, 1, 2)).toHaveAccessibleName('Empty box, Row 2, box 3');
    await expect(box(root, 0, 0)).toHaveAccessibleName('80 Row 1, box 1');
    await fill(root, 1, 2, 85);
    await fill(root, 1, 3, 84);
    await fill(root, 2, 0, 88);
    await fill(root, 2, 2, 90);
    // A given says its number and stays as it is.
    await userEvent.click(box(root, 0, 0));
    await expect(audioOf(parameters).sayPhrases).toHaveBeenLastCalledWith([{ number: 80 }]);
    await expect(marked(root)).toEqual([]);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state([
        [80, 81, 82, 83],
        [87, 86, 85, 84],
        [88, 89, 90, 91],
      ]),
    );
    await expect(marked(root)).toEqual([]);
    await expect(steps(args).slice(0, 4)).toEqual([
      'tap:card-82',
      'tap:cell-0-1',
      'tap:card-81',
      'tap:cell-1-2',
    ]);
    await expect(steps(args)).toContain('undo:clear');
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** On the tablet the same path has larger boxes. */
export const NumberPathTablet: Story = {
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid number-path tablet'));
    await expectReadable(root);
    await expect(cellPx(root)).toBeGreaterThan(64);
  },
};

/** A wrong step: after Check the two boxes that do not count on are marked, until one changes. */
export const NumberPathLookAgain: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const [r, c, v] of [
      [0, 1, 81],
      [1, 3, 84],
      [1, 2, 86],
      [2, 0, 88],
      [2, 2, 90],
    ] as const) {
      await fill(root, r, c, v);
    }
    await userEvent.click(stepButton(root, 'check'));
    // The widget still sends what the child made: the engine judges it.
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(marked(root)).toEqual(['1,3', '1,2']);
    await expect(q(root, '.ni-pz__look')).toBeVisible();
    await expectNote(root, 'Look at the two boxes again');
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid look-again 906x373'));
    // Touching a marked box, or a given, changes nothing: the mark stays until a box changes.
    await userEvent.click(box(root, 1, 2));
    await userEvent.click(box(root, 0, 0));
    await expect(marked(root)).toEqual(['1,3', '1,2']);
    await fill(root, 1, 2, 85);
    await expect(marked(root)).toEqual([]);
    await expectNote(root, null);
  },
};

// ---------- sum triangle (PUZ.02) ----------

/** The abstract tier: every side makes 12; a side that does not is marked after Check. */
export const SumTriangle: Story = {
  args: { config: triangle, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid sum-triangle 906x373'));
    await expectReadable(root);
    await expect(all(root, '.ni-pz__side-line')).toHaveLength(3);
    // Every box says what it holds and where it is: which corner, or the middle of which side.
    await expect(box(root, 0, 2)).toHaveAccessibleName('Empty box, Top corner');
    await expect(box(root, 1, 1)).toHaveAccessibleName('Empty box, Middle of the left side');
    await expect(box(root, 1, 3)).toHaveAccessibleName('4 Middle of the right side');
    await expect(box(root, 2, 0)).toHaveAccessibleName('2 Left corner');
    await expect(box(root, 2, 2)).toHaveAccessibleName('Empty box, Middle of the bottom side');
    await expect(box(root, 2, 4)).toHaveAccessibleName('5 Right corner');
    // Cards go into the boxes in reading order: top, left middle, bottom.
    await userEvent.click(card(root, 3));
    await userEvent.click(card(root, 6));
    await userEvent.click(card(root, 5));
    await userEvent.click(stepButton(root, 'check'));
    // 3 + 6 + 2 is 11: the left side is marked, and its line with it.
    await expect(marked(root)).toEqual(['0,2', '1,1', '2,0']);
    await expect(all(root, '.ni-pz__side-line[data-marked="true"]')).toHaveLength(1);
    await expectNote(root, 'Look at the left side again');
    await fill(root, 1, 1, 7);
    await expect(marked(root)).toEqual([]);
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    // The debounce (06 §4) lets a second Check through after 400 ms.
    await waitFor(
      async () => {
        await userEvent.click(stepButton(root, 'check'));
        await expect(args.onResponse).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 },
    );
    await expect(args.onResponse).toHaveBeenLastCalledWith(
      state([
        ['', '', 3, '', ''],
        ['', 7, '', 4, ''],
        [2, '', 5, '', 5],
      ]),
    );
    await expect(marked(root)).toEqual([]);
  },
};

/** Keyboard: arrows move between boxes, a digit goes in, Backspace empties, Enter on Check sends. */
export const SumTriangleKeyboard: Story = {
  tags: ['!visual'],
  args: { config: triangle, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    box(root, 0, 2).focus();
    await userEvent.keyboard('4');
    await expect(box(root, 0, 2)).toHaveTextContent('4');
    // The focus follows to the next empty box.
    await expect(box(root, 1, 1)).toHaveFocus();
    await userEvent.keyboard('6');
    await expect(box(root, 2, 2)).toHaveFocus();
    await userEvent.keyboard('5');
    // Up to the left middle, then on up to the top: change it.
    await userEvent.keyboard('{ArrowUp}');
    await expect(box(root, 1, 1)).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(box(root, 0, 2)).toHaveFocus();
    await userEvent.keyboard('{Backspace}');
    await expect(box(root, 0, 2)).toHaveAttribute('data-kind', 'empty');
    await expect(stepButton(root, 'check')).toBeDisabled();
    await userEvent.keyboard('3');
    // A digit that is not on the tray (0) and a key on a given change nothing.
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('0');
    await expect(box(root, 1, 1)).toHaveTextContent('6');
    await userEvent.keyboard('7');
    await expect(box(root, 1, 1)).toHaveTextContent('7');
    box(root, 1, 3).focus();
    await userEvent.keyboard('9{Backspace}');
    await expect(box(root, 1, 3)).toHaveTextContent('4');
    // Enter makes a focused box current; a card is a button too.
    box(root, 2, 2).focus();
    await userEvent.keyboard('{Enter}');
    await expect(current(root)).toBe(box(root, 2, 2));
    card(root, 5).focus();
    await userEvent.keyboard(' ');
    await expect(box(root, 2, 2)).toHaveTextContent('5');
    stepButton(root, 'check').focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith(
      state([
        ['', '', 3, '', ''],
        ['', 7, '', 4, ''],
        [2, '', 5, '', 5],
      ]),
    );
    await expect(steps(args)).toContain('undo:clear');
  },
};

/** Kindergarten mode: boxes and cards at 80 px in the smallest area. */
export const SumTriangleKindergarten: Story = {
  globals: { ageMode: 'k' },
  args: { config: triangle },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'k', 'puzzle-grid K sum-triangle 906x373'));
    await expect(cellPx(root)).toBeGreaterThanOrEqual(80);
  },
};

// ---------- all the ways (CPS.06) ----------

/** Five ways to make 10, in two columns of way cards; a turn-around is marked after Check. */
export const AllWays: Story = {
  args: { config: ways(10) },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid all-ways 906x373'));
    await expectReadable(root);
    await expect(all(root, '.ni-pz__way')).toHaveLength(5);
    await expect(all(root, '.ni-pz__sign')).toHaveLength(5);
    // Card after card fills way after way.
    for (const v of [1, 9, 2, 8, 3, 7, 4, 6, 9, 1]) await userEvent.click(card(root, v));
    await userEvent.click(stepButton(root, 'check'));
    await expect(marked(root)).toEqual(['4,0', '4,1']);
    await expectNote(root, 'This way is here again. Try a new one.');
    await fill(root, 4, 0, 5);
    await fill(root, 4, 1, 5);
    await expect(marked(root)).toEqual([]);
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
  },
};

/** Two ways to make 5: one column, larger boxes. */
export const AllWaysSmall: Story = {
  tags: ['!visual'],
  args: { config: ways(5) },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid all-ways small 906x373'));
    for (const v of [2, 3, 4, 1]) await userEvent.click(card(root, v));
    await userEvent.click(stepButton(root, 'check'));
    // Any order of the ways, either way round, is what the child made: it is sent as it is.
    await expect(args.onResponse).toHaveBeenCalledWith(
      state([
        [2, 3],
        [4, 1],
      ]),
    );
    await expect(marked(root)).toEqual([]);
  },
};

// ---------- shape puzzle (PUZ.03) ----------

/** The tower outline: two rectangle boxes side by side are one piece; one alone is half a piece. */
export const ShapeFill: Story = {
  args: { config: tower },
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    // A tall, narrow outline and three cards: the boxes are as large as four rows allow.
    await expectAreaFit(canvasElement, {
      ...fit(root, 'g1-up', 'puzzle-grid shape-fill 906x373'),
      minFill: 0.45,
    });
    await expect(q(root, '.ni-pz__tray')).toHaveAccessibleName('Pieces');
    await userEvent.click(card(root, 'square'));
    await expect(said(audioOf(parameters))).toContain('shape.square.one');
    await expect(box(root, 0, 1)).toHaveAccessibleName('square, Row 1, box 2');
    await userEvent.click(card(root, 'rectangle'));
    await expect(all(root, '.ni-pz__piece--half')).toHaveLength(1);
    await userEvent.click(card(root, 'rectangle'));
    await expect(all(root, '.ni-pz__piece--half')).toHaveLength(0);
    await expect(all(root, '.ni-pz__piece--rectangle')).toHaveLength(1);
    // A rectangle down the right side, one along the bottom, squares for the rest.
    await userEvent.click(card(root, 'rectangle'));
    await fill(root, 2, 2, 'rectangle');
    await fill(root, 2, 0, 'square');
    await fill(root, 2, 1, 'square');
    await fill(root, 3, 0, 'rectangle');
    // Half of the last rectangle is on: its card is still needed, and looks it.
    await expect(card(root, 'rectangle')).not.toHaveAttribute('data-spent');
    await fill(root, 3, 1, 'rectangle');
    await expect(card(root, 'rectangle')).toHaveAttribute('data-spent', 'true');
    await fill(root, 3, 2, 'square');
    await expect(card(root, 'square')).toHaveAttribute('data-spent', 'true');
    await expect(all(root, '.ni-pz__piece--rectangle')).toHaveLength(3);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state([
        ['', 'square', ''],
        ['rectangle', 'rectangle', 'rectangle'],
        ['square', 'square', 'rectangle'],
        ['rectangle', 'rectangle', 'square'],
      ]),
    );
    await expect(marked(root)).toEqual([]);
  },
};

/** Too many squares: after Check the squares are marked to be counted again. */
export const ShapeFillLookAgain: Story = {
  tags: ['!visual'],
  args: { config: tower },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let k = 0; k < 10; k += 1) await userEvent.click(card(root, 'square'));
    await userEvent.click(stepButton(root, 'check'));
    await expect(marked(root)).toHaveLength(10);
    await expectNote(root, 'Count them again');
  },
};

// ---------- mini-KenKen ----------

/** 3 × 3: every cage shows its sum and a plus in its first box; a single box shows its number. */
export const KenKen3: Story = {
  args: { config: kenken3, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid kenken 3x3 906x373'));
    await expectReadable(root);
    await expect(all(root, '.ni-pz__cage-label').map((el) => el.textContent)).toEqual([
      '3+',
      '4+',
      '5+',
      '4+',
      '2',
    ]);
    await expect(box(root, 0, 0)).toHaveAccessibleName('3+ Empty box, Row 1, box 1');
    for (const v of [1, 2, 3, 2, 3, 1, 3, 1]) await userEvent.click(card(root, v));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state([
        [1, 2, 3],
        [2, 3, 1],
        [3, 1, 2],
      ]),
    );
    await expect(marked(root)).toEqual([]);
  },
};

/** 4 × 4, the tightest grid in the smallest area: 64 px boxes, 24 px cage labels, all inside. */
export const KenKen4: Story = {
  args: { config: kenken4, tier: 'abstract' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid kenken 4x4 906x373'));
    await expectReadable(root);
    await expect(cellPx(root)).toBeGreaterThanOrEqual(64);
    await expect(all(root, '.ni-pz__cage-label')).toHaveLength(8);
    // Row by row with the first row's 2 doubled: the row is marked.
    for (const v of [1, 2, 2, 4, 3, 4, 2, 2, 1, 4, 3, 3, 2, 1]) {
      await userEvent.click(card(root, v));
    }
    await userEvent.click(stepButton(root, 'check'));
    await expect(marked(root)).toEqual(['0,0', '0,1', '0,2', '0,3']);
    await expectNote(root, 'Look at this row again');
    // A column next: set the row right, and swap two numbers of the second row.
    await fill(root, 0, 2, 3);
    await fill(root, 1, 0, 4);
    await fill(root, 1, 1, 3);
    await waitFor(
      async () => {
        await userEvent.click(stepButton(root, 'check'));
        await expect(q(root, '[role="status"]').textContent).toBe('Look at this column again');
      },
      { timeout: 3000 },
    );
    await expect(marked(root)).toEqual(['0,0', '1,0', '2,0', '3,0']);
  },
};

/** A cage whose numbers do not make its sum is marked when the rows and columns hold. */
export const KenKenCageLookAgain: Story = {
  tags: ['!visual'],
  args: { config: kenken3, tier: 'abstract' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // 3 2 1 / 2 1 3 / 1 3 (2): every row and column holds, and the first cage makes 5, not 3.
    for (const v of [3, 2, 1, 2, 1, 3, 1, 3]) await userEvent.click(card(root, v));
    await userEvent.click(stepButton(root, 'check'));
    await expect(marked(root)).toEqual(['0,0', '0,1']);
    await expectNote(root, 'Look at this group again');
  },
};

/** 4 × 4 on the tablet. */
export const KenKen4Tablet: Story = {
  render: inArea('tablet'),
  args: { config: kenken4, tier: 'abstract' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid kenken 4x4 tablet'));
    await expectReadable(root);
  },
};

// ---------- magic square and number grid ----------

/** A magic square: each line's sum at its end; a card whose number is in the grid is spent. */
export const MagicSquare: Story = {
  args: { config: magic, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid magic-square 906x373'));
    await expectReadable(root);
    // Three rows, three columns and the two diagonals: eight sums, each named.
    await expect(all(root, '.ni-pz__tag')).toHaveLength(8);
    await expect(q(root, '.ni-pz__tag')).toHaveAccessibleName('This line makes 15');
    await userEvent.click(card(root, 9));
    await expect(card(root, 9)).toHaveAttribute('data-spent', 'true');
    await expect(card(root, 7)).not.toHaveAttribute('data-spent');
    for (const v of [7, 1, 3]) await userEvent.click(card(root, v));
    await userEvent.click(stepButton(root, 'check'));
    // 2 + 9 + 6 is 17: the first row is marked, and its sum with it.
    await expect(marked(root)).toEqual(['0,0', '0,1', '0,2']);
    await expect(all(root, '.ni-pz__tag[data-marked="true"]')).toHaveLength(1);
    await fill(root, 0, 1, 7);
    await fill(root, 1, 0, 9);
    await waitFor(
      async () => {
        await userEvent.click(stepButton(root, 'check'));
        await expect(args.onResponse).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 },
    );
    await expect(args.onResponse).toHaveBeenLastCalledWith(
      state([
        [2, 7, 6],
        [9, 5, 1],
        [4, 3, 8],
      ]),
    );
    await expect(marked(root)).toEqual([]);
  },
};

/** A missing-number grid: the sums of its rows and columns. */
export const NumberGrid: Story = {
  args: { config: numbers, tier: 'abstract' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid number-grid 906x373'));
    await expectReadable(root);
    await expect(all(root, '.ni-pz__tag')).toHaveLength(6);
    for (const v of [7, 7, 9]) await userEvent.click(card(root, v));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state([
        [3, 7, 5],
        [7, 6, 2],
        [4, 1, 9],
      ]),
    );
    await expect(marked(root)).toEqual([]);
  },
};

// ---------- disabled, demo ----------

/** Disabled (feedback showing, the runner waiting): nothing takes a touch. */
export const Disabled: Story = {
  tags: ['!visual'],
  args: { config: triangle, disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const el of [...boxes(root), ...cards(root), stepButton(root, 'check')]) {
      await expect(el).toBeDisabled();
    }
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoTriangle: WidgetDemo = createDemoController({ strict: true });
/** Demo play (PUZ.02's solution): a side is shown, then its box is filled; `answer` fills the rest. */
export const DemoPlayTriangle: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced' },
  args: { config: triangle, tier: 'abstract', demo: demoTriangle },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoTriangle.play({ op: 'check-line', args: { index: 1 } });
    await expect(lit(root)).toEqual(['0,2', '1,3', '2,4']);
    await expect(all(root, '.ni-pz__side-line[data-lit="true"]')).toHaveLength(1);
    await demoTriangle.play({ op: 'fill', args: { r: 0, c: 2, value: 3 } });
    await expect(box(root, 0, 2)).toHaveTextContent('3');
    await demoTriangle.play({ op: 'answer', args: { values: [3, 7, 5] } });
    await expect(box(root, 1, 1)).toHaveTextContent('7');
    await expect(box(root, 2, 2)).toHaveTextContent('5');
    await expect(args.onInteract).not.toHaveBeenCalled();
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state([
        ['', '', 3, '', ''],
        ['', 7, '', 4, ''],
        [2, '', 5, '', 5],
      ]),
    );
    // An op the format does not list throws in development (03 §6.3).
    await expect(demoTriangle.play({ op: 'teleport' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const demoCage: WidgetDemo = createDemoController({ strict: true });
/** Demo play (mini-KenKen): a cage is shown lit, then one of its boxes is filled. */
export const DemoPlayCage: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced' },
  args: { config: kenken3, tier: 'abstract', demo: demoCage },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoCage.play({ op: 'highlight-cage', args: { id: 'c' } });
    await expect(lit(root)).toEqual(['1,0', '2,0']);
    await expect(all(root, '.ni-pz__cage-shape[data-lit="true"]')).toHaveLength(1);
    await demoCage.play({ op: 'fill', args: { r: 1, c: 0, value: 2 } });
    await expect(box(root, 1, 0)).toHaveTextContent('2');
    // A given is never written over.
    await demoCage.play({ op: 'fill', args: { r: 2, c: 2, value: 1 } });
    await expect(box(root, 2, 2)).toHaveTextContent('2');
  },
};

const demoShapes: WidgetDemo = createDemoController({ strict: true });
/** Demo play (PUZ.03's solution): a rectangle goes on box by box, then a square. */
export const DemoPlayShapes: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced' },
  args: { config: tower, demo: demoShapes },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoShapes.play({ op: 'fill', args: { r: 1, c: 0, value: 'rectangle' } });
    await expect(all(root, '.ni-pz__piece--half')).toHaveLength(1);
    await demoShapes.play({ op: 'fill', args: { r: 2, c: 0, value: 'rectangle' } });
    await expect(all(root, '.ni-pz__piece--rectangle')).toHaveLength(1);
    await demoShapes.play({ op: 'fill', args: { r: 0, c: 1, value: 'square' } });
    await expect(all(root, '.ni-pz__piece--square')).toHaveLength(1);
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });
/** Demo invite: one ring, on the invited box, with the hand inside it; a touch takes it away. */
export const DemoInvite: Story = {
  globals: { motion: 'reduced' },
  args: { config: path, demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    demoInvite.invite({ op: 'fill', args: { r: 2, c: 0, value: 88 } });
    await expectRing(root, box(root, 2, 0));
    const hand = await waitFor(() => {
      const el = root.querySelector<HTMLElement>('.ni-hand');
      if (!el) throw new Error('no hand yet');
      return el;
    });
    // The hand points into the empty box, and the area still fits with it (the bottom row).
    const h = hand.getBoundingClientRect();
    const b = box(root, 2, 0).getBoundingClientRect();
    await expect(h.left).toBeGreaterThanOrEqual(b.left - 1);
    await expect(h.right).toBeLessThanOrEqual(b.right + 1);
    await expect(h.top).toBeGreaterThanOrEqual(b.top - 1);
    await expect(h.bottom).toBeLessThanOrEqual(b.bottom + 9);
    await expectAreaFit(canvasElement, fit(root, 'g1-up', 'puzzle-grid invite 906x373'));
    await userEvent.click(box(root, 2, 0));
    await expectRing(root, null);
    demoInvite.invite({ op: 'check-line', args: { index: 0 } });
    await expectRing(root, null);
  },
};
