import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { clearSpies, type SpyAudio, spyAudio } from '../../test-support/storyHelpers';
import {
  clickAt,
  enterNumber,
  expectAreaFit,
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
 * `area-tiles` (03 §5.5): a region of unit squares. `tile` and `decompose` are two steps (work
 * on the region, then type), `partition` one step with Check, `count` and `multiply` the ask
 * step alone. Every story runs in a workshop's widget area: `landscapeMin` (906 × 373, the
 * smallest) unless its name says tablet (1226 × 493).
 */

type Config = ConfigFor<'area-tiles'>;

const base = {
  format: 'area-tiles',
  gridShown: true,
  sideLabels: false,
  unit: 'sq-units',
  decimalGrid: false,
} as const;
const rect = (w: number, h: number) => ({ w, h, mask: '1'.repeat(w * h) });
/** An L of 10 squares: a 4 × 3 box without the last two squares of its top row. */
const L = { w: 4, h: 3, mask: '110011111111' };

/** Tile a 4 × 3 rectangle. */
const tile: Config = { ...base, mode: 'tile', region: rect(4, 3) };
/** Tile the L. */
const tileL: Config = { ...base, mode: 'tile', region: L };
/** Count the L's squares. */
const count: Config = { ...base, mode: 'count', region: L };
/** Multiply the sides: 6 cm by 4 cm, no grid. */
const multiply: Config = {
  ...base,
  mode: 'multiply',
  region: rect(6, 4),
  gridShown: false,
  sideLabels: true,
  unit: 'sq-cm',
};
/** Split the L into rectangles. */
const decompose: Config = { ...base, mode: 'decompose', region: L };
/** Split a plain 4 × 3 rectangle into rows and columns of squares. */
const partition: Config = { ...base, mode: 'partition', region: rect(4, 3), gridShown: false };
/** The bound of a region to work on: 10 wide and 6 tall (AREA_WORK_W_MAX × AREA_WORK_H_MAX). */
const boundTile: Config = { ...base, mode: 'tile', region: rect(10, 6) };
/** The bound of a region to read: 10 × 10 (AREA_SIDE_MAX), with its side lengths. */
const boundRead: Config = { ...multiply, region: rect(10, 10), gridShown: true };
/** 47 hundredths of one whole. */
const decimal: Config = {
  ...base,
  mode: 'count',
  decimalGrid: true,
  region: { w: 10, h: 10, mask: '1'.repeat(47) + '0'.repeat(53) },
};

const meta = {
  title: 'Widgets/Area tiles',
  args: {
    config: tile as WidgetConfig,
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

const ROOT = '.ni-atw';

// ---------- helpers ----------

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const surface = (root: HTMLElement) => q(root, '.ni-atw__board');
const pad = (root: HTMLElement, id: string) => q(root, `[data-cue="pad-${id}"] button`);
const padButtons = (root: HTMLElement) => all(root, '.ni-work__btn button');
const audioOf = (parameters: { ui?: { audio?: unknown } }) => parameters.ui?.audio as SpyAudio;
const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const state = (value: Record<string, unknown>) => ({ kind: 'state', value });
const steps = (args: { onInteract?: unknown }) =>
  traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);
const blur = () => (document.activeElement as HTMLElement | null)?.blur();

/** The squares that hold a tile, as `r-c`, in reading order. */
const tiles = (root: HTMLElement) =>
  all(root, '.ni-atw__tile').map((el) => el.getAttribute('data-cell') as string);
const bare = (root: HTMLElement) => all(root, '.ni-atw__cell').length;
/** The split lines drawn, as `v-2`, `h-1`. */
const drawn = (root: HTMLElement) => [
  ...new Set(all(root, '.ni-atw__split').map((el) => el.getAttribute('data-line') as string)),
];
const cursorLine = (root: HTMLElement) =>
  root.querySelector('.ni-atw__cursorline')?.getAttribute('data-line') ?? null;
const cursorCell = (root: HTMLElement) =>
  root.querySelector('.ni-atw__cursor')?.getAttribute('data-cursor') ?? null;

const squareOf = (root: HTMLElement, r: number, c: number) =>
  q(root, `[data-cell="${r}-${c}"]`).getBoundingClientRect();
/** The centre of square (r, c) on the page. */
function cellPoint(root: HTMLElement, r: number, c: number) {
  const b = squareOf(root, r, c);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

/**
 * Every unit square is one size (at least `min` px), squares meet edge to edge on one grid, and
 * every tile covers exactly its square: no gap, no overlap.
 */
async function expectTrueToUnit(root: HTMLElement, min: number) {
  const rects = all(root, '[data-cell]').map((el) => ({
    id: el.getAttribute('data-cell') as string,
    b: el.getBoundingClientRect(),
  }));
  await expect(rects.length).toBeGreaterThan(0);
  const u = (rects[0] as (typeof rects)[number]).b.width;
  await expect(u).toBeGreaterThanOrEqual(min);
  const svg = q(root, '.ni-atw__svg').getBoundingClientRect();
  const seen = new Set<string>();
  for (const { id, b } of rects) {
    const [r, c] = id.split('-').map(Number) as [number, number];
    await expect(Math.abs(b.width - u), `square ${id} width`).toBeLessThan(0.5);
    await expect(Math.abs(b.height - u), `square ${id} height`).toBeLessThan(0.5);
    await expect(Math.abs(b.left - (svg.left + c * u)), `square ${id} left`).toBeLessThan(0.5);
    await expect(Math.abs(b.top - (svg.top + r * u)), `square ${id} top`).toBeLessThan(0.5);
    await expect(seen.has(id), `square ${id} drawn once`).toBe(false);
    seen.add(id);
  }
}

/** The build step's controls and parts, for `expectAreaFit`. */
const buildFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => {
  blur();
  const action = stepButton(root, 'check') ?? stepButton(root, 'next');
  return {
    ageMode,
    story,
    controls: { pad: padButtons(root), surface: [surface(root)], action: [action] },
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
    parts: all(root, '.ni-atw__picture, .ni-entry, .ni-stepper'),
  };
};

async function press(root: HTMLElement, id: string, times = 1) {
  for (let i = 0; i < times; i += 1) await userEvent.click(pad(root, id));
}
/** Fills every row from the top with the pad: "Fill this row", then down. */
async function fillAll(root: HTMLElement, rows: number) {
  for (let r = 0; r < rows; r += 1) {
    await press(root, 'row');
    if (r < rows - 1) await press(root, 'down');
  }
}

// ---------- tile: the region in the two areas ----------

/** Tablet (1226 × 493): the pad, the 4 × 3 region and Next, all in view. */
export const TabletTile: Story = {
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'row');
    await expect(tiles(root)).toHaveLength(4);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'area-tiles tablet tile'));
    await expectTrueToUnit(root, 40);
  },
};

/** The smallest area (906 × 373): the same parts, every control at full size, nothing scrolls. */
export const LandscapeMinTile: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'row');
    await press(root, 'down');
    await press(root, 'tile');
    await expect(tiles(root)).toEqual(['0-0', '0-1', '0-2', '0-3', '1-0']);
    // A partly tiled shape shows which squares are still bare.
    await expect(bare(root)).toBe(7);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'area-tiles 906x373 tile'));
    await expectTrueToUnit(root, 40);
  },
};

/** The bound in the smallest area: 10 × 6, tiled in full; every square at least 40 px. */
export const BoundTileLandscapeMin: Story = {
  args: { config: boundTile },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fillAll(root, 6);
    await expect(tiles(root)).toHaveLength(60);
    await expect(bare(root)).toBe(0);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'area-tiles 906x373 tile 10x6'));
    await expectTrueToUnit(root, 40);
  },
};

/** The bound's ask step: the 60 tiles as a picture beside the pad; 60 can be typed. */
export const BoundTileAskLandscapeMin: Story = {
  args: { config: boundTile },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fillAll(root, 6);
    await goNext(root);
    await enterNumber(root, 60);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'area-tiles 906x373 ask 10x6'),
      minFill: 0.5,
    });
    await expectTrueToUnit(root, 26);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '1'.repeat(60), value: 60 }));
  },
};

// ---------- tile: the three ways to lay tiles ----------

/** The pad: the cursor's square gets a tile; the arrows move the cursor; the same button undoes. */
export const PadTiles: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(cursorCell(root)).toBe('0-0');
    // The cursor and what is under it are put in words for assistive tech, as they change.
    const words = () => q(root, '[data-cursor-words]').textContent;
    await expect(words()).toBe('You are at row 1, square 1. No tile here');
    await press(root, 'tile');
    await expect(words()).toBe('You are at row 1, square 1. A tile is here');
    await expect(surface(root)).toHaveAccessibleName(
      'Fill the shape with tiles. Row 1 has 4. Row 2 has 4. Row 3 has 4. 1 tile. row 1, square 1',
    );
    await press(root, 'right');
    await press(root, 'down');
    await expect(cursorCell(root)).toBe('1-1');
    await press(root, 'tile');
    await expect(tiles(root)).toEqual(['0-0', '1-1']);
    // The same button takes the tile back from where it lies.
    await press(root, 'tile');
    await expect(tiles(root)).toEqual(['0-0']);
    // At the region's edge the cursor stays.
    await press(root, 'down', 4);
    await expect(cursorCell(root)).toBe('2-1');
    await expect(steps(args).slice(0, 3)).toEqual([
      'tap:pad-tile',
      'tap:pad-right',
      'tap:pad-down',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * "Fill this row" lays the cursor's whole row. On a full row the note says so; a full row may
 * be right, so nothing is ringed.
 */
export const FillRowAndLimit: Story = {
  args: { config: tileL },
  play: async ({ canvasElement, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'row');
    // The L's top row has two squares: the notch gets no tile.
    await expect(tiles(root)).toEqual(['0-0', '0-1']);
    await expectNote(root, null);
    clearSpies(audio);
    await press(root, 'row');
    await expectNote(root, 'This row is full.');
    await expect(said(audio)).toContain('ui.widget.at.note.row');
    await expectRing(root, null);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'area-tiles 906x373 limit row'));
  },
};

/** The child's next step clears the note. */
export const LimitClearsOnNextStep: Story = {
  args: { config: tileL },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'row', 2);
    await expectNote(root, 'This row is full.');
    await press(root, 'down');
    await expectNote(root, null);
  },
};

/** Touch drag: a finger lays a tile on every square it crosses. */
export const TouchPaint: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await touchDragBetween(surface(root), cellPoint(root, 1, 0), cellPoint(root, 1, 3), 16);
    await expect(tiles(root)).toEqual(['1-0', '1-1', '1-2', '1-3']);
    await expect(steps(args)).toEqual(['drag:surface', 'drop:cell-1-3']);
    await expect(cursorCell(root)).toBe('1-3');
  },
};

/** A fast stroke (one move across the row) still tiles every square it crossed. */
export const TouchPaintFast: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await touchDragBetween(surface(root), cellPoint(root, 1, 0), cellPoint(root, 1, 3), 1);
    await expect(tiles(root)).toEqual(['1-0', '1-1', '1-2', '1-3']);
    // A fast stroke over the L's notch lays nothing outside the shape (see PaintExtremes).
  },
};

/** Tap: a bare square gets a tile ("Tile" is spoken); a tap on the tile takes it back. */
export const TapTile: Story = {
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    clearSpies(audio);
    const p = cellPoint(root, 2, 1);
    await clickAt(p.x, p.y);
    await expect(tiles(root)).toEqual(['2-1']);
    await expect(said(audio)).toEqual(['ui.widget.at.tile']);
    await clickAt(p.x, p.y);
    await expect(tiles(root)).toEqual([]);
    await expect(steps(args)).toEqual(['tap:cell-2-1', 'tap:tile-2-1']);
  },
};

/**
 * A drag at the extremes: across the L's notch (no tile lands outside the shape), ending far
 * outside the region, with a second finger tapping on the way.
 */
export const PaintExtremes: Story = {
  args: { config: tileL },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const from = cellPoint(root, 0, 0);
    const r = surface(root).getBoundingClientRect();
    await touchDragBetween(surface(root), from, { x: r.right + 300, y: from.y }, 24, () =>
      secondFingerTap(surface(root)),
    );
    await expect(tiles(root)).toEqual(['0-0', '0-1']);
    await expect(steps(args)).toEqual(['drag:surface', 'drop:surface']);
    // A tap in the notch does nothing.
    const first = squareOf(root, 0, 0);
    await clickAt(first.left + 2.5 * first.width, first.top + first.height / 2);
    await expect(tiles(root)).toEqual(['0-0', '0-1']);
  },
};

/** Keyboard: Tab to the pad, Enter presses; then Next, the number, and Enter on Check. */
export const KeyboardTile: Story = {
  args: { config: { ...tile, region: rect(2, 1) } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    pad(root, 'row').focus();
    await userEvent.keyboard('{Enter}');
    await expect(tiles(root)).toEqual(['0-0', '0-1']);
    stepButton(root, 'next').focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(root).toHaveAttribute('data-step', 'ask'));
    await enterNumber(root, 2);
    stepButton(root, 'check').focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '11', value: 2 }));
  },
};

/** The ask step: the tiled region as a picture beside the answer; the response carries both. */
export const TileAsk: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await fillAll(root, 3);
    await goNext(root);
    await expect(tiles(root)).toHaveLength(12);
    await expect(root.querySelector('.ni-atw__cursor')).toBeNull();
    await expect(q(root, '.ni-atw__picture')).toHaveAccessibleName(
      expect.stringMatching(
        /^Look at the picture\. Row 1 has 4\. Row 2 has 4\. Row 3 has 4\. 12 tiles\. /,
      ),
    );
    await enterNumber(root, 12);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'area-tiles 906x373 tile ask'),
      minFill: 0.5,
    });
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '1'.repeat(12), value: 12 }));
  },
};

/** A shape left partly bare is sent as it is (the checker, not the widget, judges it). */
export const PartlyTiledIsSentAsIs: Story = {
  args: { config: tileL },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'row');
    await goNext(root);
    await expect(bare(root)).toBe(8);
    await enterNumber(root, 10);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '110000000000', value: 10 }));
  },
};

/**
 * Kindergarten sizes (the format has no kindergarten content: this is Grade 2 content at the
 * larger targets): the pad's buttons are 80 px and more, and the region still fits.
 */
export const KindergartenSizes: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'row');
    await expectAreaFit(canvasElement, buildFit(root, 'k', 'area-tiles K sizes 906x373'));
    await expectTrueToUnit(root, 40);
  },
};

// ---------- count and multiply ----------

/** `count` in the smallest area: the L as a picture, the answer control and Check. */
export const CountLandscapeMin: Story = {
  args: { config: count, tier: 'pictorial' },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    await expect(q(root, '.ni-atw__picture')).toHaveAccessibleName(
      'Look at the picture. Row 1 has 2. Row 2 has 4. Row 3 has 4',
    );
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'area-tiles 906x373 count'),
      minFill: 0.5,
    });
    await expectTrueToUnit(root, 26);
    clearSpies(audio);
    await userEvent.click(q(root, '.ni-atw__picture'));
    await expect(said(audio)).toEqual(['ui.widget.at.square']);
    await enterNumber(root, 10);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 10 });
  },
};

/** `multiply`: a plain rectangle with its side lengths in 32 px numerals, and the unit. */
export const MultiplySideLengths: Story = {
  args: { config: multiply, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(q(root, '[data-side="top"]').textContent).toBe('6cm');
    await expect(q(root, '[data-side="left"]').textContent).toBe('4cm');
    for (const el of all(root, '.ni-atw__len')) {
      await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(32);
    }
    await expect(root.querySelector('.ni-atw__gridline')).toBeNull();
    // Each label sits along its own side, clear of the shape.
    const svg = q(root, '.ni-atw__svg').getBoundingClientRect();
    const top = q(root, '[data-side="top"] .ni-atw__len').getBoundingClientRect();
    const left = q(root, '[data-side="left"]').getBoundingClientRect();
    await expect(top.bottom).toBeLessThanOrEqual(svg.top);
    await expect(left.right).toBeLessThanOrEqual(svg.left + 0.5);
    await enterNumber(root, 24);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'area-tiles 906x373 multiply'),
      minFill: 0.5,
    });
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 24 });
  },
};

/** The largest picture: 10 × 10 with its side lengths; 100 can be typed. */
export const ReadBoundLandscapeMin: Story = {
  args: { config: boundRead, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await enterNumber(root, 100);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'area-tiles 906x373 read 10x10'),
      minFill: 0.5,
    });
    await expectTrueToUnit(root, 26);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 100 });
  },
};

/** The decimal grid: one whole of 100 squares, 47 of them filled. */
export const DecimalGrid: Story = {
  args: { config: decimal, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(all(root, '[data-cell]')).toHaveLength(47);
    await expect(root.querySelector('.ni-atw__wholeline')).not.toBeNull();
    await expectTrueToUnit(root, 26);
    await enterNumber(root, 47);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 47 });
  },
};

/** `multiply` on the tablet. */
export const TabletMultiply: Story = {
  render: inArea('tablet'),
  args: { config: multiply, tier: 'pictorial' },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, {
      ...askFit(root, 'g1-up', 'area-tiles tablet multiply'),
      minFill: 0.5,
    });
  },
};

// ---------- decompose and partition ----------

/** `decompose`: the cursor line, "Line here" draws it and erases it; then the total is typed. */
export const DecomposePad: Story = {
  args: { config: decompose },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(cursorLine(root)).toBe('cursor-v-2');
    const words = () => q(root, '[data-cursor-words]').textContent;
    await expect(words()).toBe('You are at the line down after 2. It is not drawn');
    // The cursor's line is dashed until it is drawn, and solid once it is.
    await expect(root.querySelector('.ni-atw__cursordash')).not.toBeNull();
    await press(root, 'cut');
    await expect(drawn(root)).toEqual(['v-2']);
    await expect(root.querySelector('.ni-atw__cursordash')).toBeNull();
    await expect(words()).toBe('You are at the line down after 2. It is drawn');
    await expect(surface(root)).toHaveAccessibleName(
      'Cut the shape into parts. Row 1 has 2. Row 2 has 4. Row 3 has 4. 1 line. the line down after 2',
    );
    // The same button erases the line where it is.
    await press(root, 'cut');
    await expect(drawn(root)).toEqual([]);
    await press(root, 'down');
    await expect(cursorLine(root)).toBe('cursor-h-1');
    await press(root, 'cut');
    await expect(drawn(root)).toEqual(['h-1']);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'area-tiles 906x373 decompose'));
    await goNext(root);
    await expect(drawn(root)).toEqual(['h-1']);
    await enterNumber(root, 10);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ splits: [{ dir: 'h', at: 1 }], value: 10 }),
    );
  },
};

/** A finger's stroke draws the nearest line of its direction, and erases it again; a tap moves the cursor. */
export const DecomposeStroke: Story = {
  args: { config: decompose },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const a = squareOf(root, 1, 2);
    const b = squareOf(root, 2, 2);
    // Down the left edge of column 2: the up-and-down line after column 2.
    await touchDragBetween(
      surface(root),
      { x: a.left + 6, y: a.top + 4 },
      { x: b.left + 9, y: b.bottom - 4 },
    );
    await expect(drawn(root)).toEqual(['v-2']);
    await expect(steps(args)).toEqual(['drag:surface', 'drop:line-v-2']);
    // Across, under row 0, ending outside the region.
    const r = surface(root).getBoundingClientRect();
    await touchDragBetween(
      surface(root),
      { x: a.left - 60, y: a.top + 3 },
      { x: r.right + 200, y: a.top + 10 },
    );
    await expect(drawn(root)).toEqual(['v-2', 'h-1']);
    // The same stroke again erases the line.
    await touchDragBetween(
      surface(root),
      { x: a.left + 6, y: a.top + 4 },
      { x: b.left + 9, y: b.bottom - 4 },
    );
    await expect(drawn(root)).toEqual(['h-1']);
    // A tap only moves the cursor.
    await clickAt(a.right - 3, a.top + a.height / 2);
    await expect(cursorLine(root)).toBe('cursor-v-3');
    await expect(drawn(root)).toEqual(['h-1']);
  },
};

/** `partition`: Check waits for a line; rows and columns of squares are sent as drawn. */
export const PartitionCheck: Story = {
  args: { config: partition },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(stepButton(root, 'check')).toBeDisabled();
    await press(root, 'left');
    for (let i = 0; i < 3; i += 1) {
      await press(root, 'cut');
      await press(root, 'right');
    }
    await press(root, 'up');
    await press(root, 'cut');
    await press(root, 'down');
    await press(root, 'cut');
    await expect(drawn(root)).toEqual(['v-1', 'v-2', 'v-3', 'h-1', 'h-2']);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'area-tiles 906x373 partition'));
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
  },
};

// ---------- disabled, demo ----------

/** Disabled: nothing moves and nothing is traced. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(pad(root, 'tile')).toBeDisabled();
    await touchDragBetween(surface(root), cellPoint(root, 0, 0), cellPoint(root, 0, 3));
    await expect(tiles(root)).toEqual([]);
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoPlay: WidgetDemo = createDemoController({ strict: true });
/** Demo play: the guide lays a tile, fills the rows and types the area. */
export const DemoPlay: Story = {
  globals: { motion: 'reduced' },
  args: { config: { ...tile, region: rect(3, 2) }, demo: demoPlay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoPlay.play({ op: 'place-tile', args: { r: 0, c: 0 } });
    await expect(tiles(root)).toEqual(['0-0']);
    await demoPlay.play({ op: 'place-tile', args: { r: 0, c: 0, remove: true } });
    await expect(tiles(root)).toEqual([]);
    await demoPlay.play({ op: 'fill-row', args: { r: 0 } });
    await demoPlay.play({ op: 'fill-row', args: { r: 1 } });
    await expect(tiles(root)).toHaveLength(6);
    await demoPlay.play({ op: 'answer', args: { value: 6 } });
    await expect(root).toHaveAttribute('data-step', 'ask');
    await expect(args.onInteract).not.toHaveBeenCalled();
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '111111', value: 6 }));
  },
};

const demoLines: WidgetDemo = createDemoController({ strict: true });
/** Demo play: a split line is drawn on the L. */
export const DemoDrawSplit: Story = {
  globals: { motion: 'reduced' },
  args: { config: decompose, demo: demoLines },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoLines.play({ op: 'draw-split', args: { at: 1, dir: 'h' } });
    await expect(drawn(root)).toEqual(['h-1']);
    await expect(cursorLine(root)).toBe('cursor-h-1');
  },
};

const demoSide: WidgetDemo = createDemoController({ strict: true });
/** Demo play: a side length lights up and its number is spoken. */
export const DemoLabelSide: Story = {
  globals: { motion: 'reduced' },
  args: { config: multiply, tier: 'pictorial', demo: demoSide },
  play: async ({ canvasElement, parameters }) => {
    const audio = audioOf(parameters);
    const root = await findWidget(canvasElement, ROOT);
    clearSpies(audio);
    await demoSide.play({ op: 'label-side', args: { side: 'top' } });
    await expect(q(root, '[data-side="top"]')).toHaveAttribute('data-lit', 'true');
    await expect(q(root, '[data-side="left"]')).not.toHaveAttribute('data-lit');
    await expect(audio.sayPhrases).toHaveBeenCalledWith([{ number: 6 }]);
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });
/**
 * Demo invite in the smallest area: one ring, on "Tile here", with the demonstration hand on
 * it; the whole task stays in view.
 */
export const DemoInviteLandscapeMin: Story = {
  args: { demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    demoInvite.invite({ op: 'place-tile', args: { r: 0, c: 0 } });
    await expectRing(root, pad(root, 'tile'));
    await waitFor(() => expect(hand()).not.toBeNull());
    await expectPointerOn(hand(), pad(root, 'tile'), root);
    await expectAreaFit(canvasElement, buildFit(root, 'g1-up', 'area-tiles invite'));
  },
};

const demoInvites: WidgetDemo = createDemoController({ strict: true });
/** Each invite rings exactly one control: the arrow toward the square, the action, Next, the answer. */
export const DemoInviteEachControl: Story = {
  args: { demo: demoInvites },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    demoInvites.invite({ op: 'place-tile', args: { r: 1, c: 0 } });
    await expectRing(root, pad(root, 'down'));
    await press(root, 'down');
    await expectRing(root, null);
    demoInvites.invite({ op: 'fill-row', args: { r: 1 } });
    await expectRing(root, pad(root, 'row'));
    demoInvites.invite({ op: 'answer', args: { value: 12 } });
    await expectRing(root, stepButton(root, 'next'));
    await goNext(root);
    demoInvites.invite({ op: 'answer', args: { value: 12 } });
    await waitFor(() => expect(root.querySelectorAll('.ni-invite')).toHaveLength(1));
    await expect(root.querySelector('.ni-entry .ni-invite')).not.toBeNull();
    await enterNumber(root, 12);
    await expectRing(root, null);
  },
};

const demoRoute: WidgetDemo = createDemoController({ strict: true });
/**
 * An invite never rings an arrow that does nothing: from the L's last square of row 2, the way
 * to its first square of row 1 goes round the notch, and each ringed arrow moves the cursor.
 */
export const DemoInviteRoundNotch: Story = {
  args: { config: tileL, demo: demoRoute },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await press(root, 'down');
    await press(root, 'right', 3);
    await expect(cursorCell(root)).toBe('1-3');
    const want = { op: 'place-tile', args: { r: 0, c: 0 } };
    for (let guard = 0; guard < 6 && cursorCell(root) !== '0-0'; guard += 1) {
      demoRoute.invite(want);
      await waitFor(() => expect(root.querySelectorAll('.ni-invite')).toHaveLength(1));
      const before = cursorCell(root);
      await userEvent.click(q(root, '.ni-work .ni-invite'));
      await expect(cursorCell(root)).not.toBe(before);
    }
    await expect(cursorCell(root)).toBe('0-0');
    demoRoute.invite(want);
    await expectRing(root, pad(root, 'tile'));
  },
};

const demoLineInvite: WidgetDemo = createDemoController({ strict: true });
/** Line invites: the arrow toward the line, then "Line here". */
export const DemoInviteLine: Story = {
  args: { config: decompose, demo: demoLineInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const want = { op: 'draw-split', args: { at: 1, dir: 'h' } };
    demoLineInvite.invite(want);
    await expectRing(root, pad(root, 'down'));
    await press(root, 'down');
    demoLineInvite.invite(want);
    await expectRing(root, pad(root, 'cut'));
  },
};

const demoUnsupported: WidgetDemo = createDemoController({ strict: true });
/** An op area-tiles doesn't define throws UnsupportedWidgetOpError in development. */
export const DemoUnsupportedOp: Story = {
  args: { demo: demoUnsupported },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(demoUnsupported.play({ op: 'fill-group' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};
