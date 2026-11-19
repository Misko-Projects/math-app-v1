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
 * `area-tiles` (03 §5.5): a garden plot to cover with tiles (tile), count (count), multiply from
 * its side lengths (multiply), split into rectangles (decompose, MEA.13) or into unit squares
 * (partition, GEO.04). Nothing on screen counts the tiles or states the area before the child
 * types it.
 */

type Config = ConfigFor<'area-tiles'>;

const base = {
  format: 'area-tiles',
  gridShown: true,
  sideLabels: false,
  unit: 'sq-units',
  decimalGrid: false,
} as const;

const full = (w: number, h: number) => ({ w, h, mask: '1'.repeat(w * h) });

/** G1 tile: a 4 × 3 plot (area 12). */
const tile: Config = { ...base, mode: 'tile', region: full(4, 3) };
/** Stress: an L, 7 wide and 5 tall, its top-right 4 × 2 cut away (area 27). */
const L75 = {
  w: 7,
  h: 5,
  mask: ['1110000', '1110000', '1111111', '1111111', '1111111'].join(''),
};
const tileL: Config = { ...base, mode: 'tile', region: L75 };
const gridOff: Config = { ...tile, gridShown: false };
/** K: count a 3 × 2 plot, big and chunky (area 6). */
const countK: Config = { ...base, mode: 'count', region: full(3, 2) };
/** G1 count: an L of 5 × 4 (area 14). */
const countL: Config = {
  ...base,
  mode: 'count',
  region: { w: 5, h: 4, mask: ['11000', '11000', '11111', '11111'].join('') },
};
/** Multiply (stress): 9 cm × 8 cm, labels on, no tiles (area 72). */
const multiply: Config = {
  ...base,
  mode: 'multiply',
  region: full(9, 8),
  gridShown: false,
  sideLabels: true,
  unit: 'sq-cm',
};
/** Decompose (MEA.13): an L of 6 × 5, its top-right 3 × 2 cut away (area 24). */
const decompose: Config = {
  ...base,
  mode: 'decompose',
  region: { w: 6, h: 5, mask: ['111000', '111000', '111111', '111111', '111111'].join('') },
};
/** Partition (GEO.04): a 4 × 3 rectangle, no grid; draw every row and column line. */
const partition: Config = { ...base, mode: 'partition', region: full(4, 3), gridShown: false };
/** Decimal grid (DEC.02): 47 hundredths of one whole. */
const decimal: Config = {
  ...base,
  mode: 'count',
  region: { w: 10, h: 10, mask: '1'.repeat(47) + '0'.repeat(53) },
  decimalGrid: true,
};
/** Stress: tiling 47 hundredths of the 10 × 10 grid. */
const decimalTile: Config = { ...decimal, mode: 'tile' };
/** Tile with side labels in feet (the demo's label-side). */
const tileLabels: Config = { ...tile, sideLabels: true, unit: 'sq-ft' };

const meta = {
  title: 'Widgets/Area tiles',
  args: {
    config: tile as WidgetConfig,
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

const ROOT = '.ni-atw';

// ---------- helpers ----------

const cell = (root: HTMLElement, r: number, c: number) =>
  root.querySelector(`[data-place-target="cell-${r}-${c}"]`) as HTMLElement;
const tileAt = (root: HTMLElement, r: number, c: number) =>
  root.querySelector(`.ni-atw__tile[data-tile="${r}-${c}"]`) as HTMLElement | null;
const stack = (root: HTMLElement) => root.querySelector('.ni-atw__stack') as HTMLElement;
const trayPad = (root: HTMLElement) => root.querySelector('.ni-atw__traypad') as HTMLElement;
const rowButton = (root: HTMLElement, r: number) =>
  root.querySelector(`.ni-atw__row[data-row="${r}"]`) as HTMLElement;
const gapMarker = (root: HTMLElement, dir: 'v' | 'h', at: number) =>
  root.querySelector(`.ni-atw__gap[data-gap="${dir}-${at}"]`) as HTMLElement;
const sideLabel = (root: HTMLElement, side: 'top' | 'left') =>
  root.querySelector(`.ni-atw__side[data-side="${side}"]`) as HTMLElement;
const padKey = (root: HTMLElement, k: string) =>
  root.querySelector(`.ni-pad__key[data-key="${k}"]`) as HTMLElement;
const blank = (root: HTMLElement) => root.querySelector('.ni-atw__blank') as HTMLElement;
const checkButton = (root: HTMLElement) => within(root).getByRole('button', { name: 'Check' });
const laidTiles = (root: HTMLElement) =>
  root.querySelectorAll('.ni-atw__tile:not(.ni-atw__tile--static)').length;
const pitchOf = (root: HTMLElement) => {
  const grid = root.querySelector('.ni-atw__grid') as HTMLElement;
  return Number.parseFloat(grid.style.getPropertyValue('--p'));
};

async function type(root: HTMLElement, digits: string) {
  for (const d of digits) await userEvent.click(padKey(root, d));
}

/**
 * Nothing in the widget's text, accessible names or data attributes states these numbers (the
 * number pad's own digit keys aside).
 */
async function expectNothingStates(root: HTMLElement, forbidden: number[]) {
  const pad = root.querySelector('.ni-pad');
  const scope = [...root.querySelectorAll('*')].filter((el) => !pad?.contains(el));
  const words = [
    ...scope.filter((el) => el.children.length === 0).map((el) => el.textContent ?? ''),
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
    const name = `${el.getAttribute('class') ?? el.tagName}`;
    await expect(r.left, `${name} left`).toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(r.right, `${name} right`).toBeLessThanOrEqual(box.right + 0.5);
    await expect(r.top, `${name} top`).toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(r.bottom, `${name} bottom`).toBeLessThanOrEqual(box.bottom + 0.5);
  }
}

async function expectBigNumerals(els: Element[]) {
  for (const el of els) {
    await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(32);
  }
}

/** Tiles never touch: each laid or drawn tile's art is apart from its right and lower neighbour. */
async function expectTilesApart(root: HTMLElement) {
  const art = (el: Element | null) =>
    (el?.querySelector('.ni-atw__tile-art') as HTMLElement | null)?.getBoundingClientRect();
  for (const t of root.querySelectorAll<HTMLElement>('.ni-atw__grid .ni-atw__tile')) {
    await waitForSettled(t);
    const [r = 0, c = 0] = (t.dataset.tile ?? '').split('-').map(Number);
    const a = art(t) as DOMRect;
    const right = art(root.querySelector(`.ni-atw__grid [data-tile="${r}-${c + 1}"]`));
    const below = art(root.querySelector(`.ni-atw__grid [data-tile="${r + 1}-${c}"]`));
    if (right) await expect(right.left).toBeGreaterThan(a.right);
    if (below) await expect(below.top).toBeGreaterThan(a.bottom);
  }
}

const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const numbersSaid = (audio: SpyAudio) =>
  (audio.sayPhrases.mock.calls as unknown[][]).map(
    (c) => (c[0] as { number: number }[])[0]?.number,
  );
const steps = (onInteract: unknown) => traceOf(onInteract).map((e) => `${e.t}:${e.target}`);
const state = (value: Record<string, unknown>) => ({ kind: 'state', value });

// ---------- tile ----------

/**
 * Evidence, START: the empty 4 × 3 plot, the tile stack in its tray, a "fill this row" button at
 * each row's end, the empty answer blank with its unit. Check is off.
 */
export const TileStart: Story = {
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(laidTiles(root)).toBe(0);
    await expect(root.querySelectorAll('.ni-atw__cell')).toHaveLength(12);
    await expect(root.querySelectorAll('.ni-atw__row')).toHaveLength(3);
    await expect(stack(root)).toBeVisible();
    await expect(within(root).getByText('square units')).toBeVisible();
    await expect(within(root).getByText('Fill it with tiles')).toBeVisible();
    await expect(checkButton(root)).toBeDisabled();
    await expectNothingStates(root, [12]);
    await expectFits(canvasElement, root);
  },
};

/** Evidence, IN PROGRESS: the top row filled and two tiles laid in the next; no counter anywhere. */
export const TileInProgress: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(rowButton(root, 0));
    await userEvent.click(cell(root, 1, 0));
    await userEvent.click(cell(root, 1, 1));
    await expect(laidTiles(root)).toBe(6);
    await expectNothingStates(root, [6, 12]);
    await expect(args.onResponse).not.toHaveBeenCalled();
    await expectTilesApart(root);
    await expectFits(canvasElement, root);
  },
};

/**
 * Evidence, FINISHED (G1): every row filled with "fill this row", 12 typed; Check sends the tiles
 * and the typed area. G1 sizes: the stack, the row buttons, the keys and Check.
 */
export const TileFinished: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const r of [0, 1, 2]) await userEvent.click(rowButton(root, r));
    await expect(laidTiles(root)).toBe(12);
    await expect(checkButton(root)).toBeDisabled();
    await type(root, '12');
    await expect(blank(root)).toHaveAttribute('aria-label', 'Your answer: 12');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '111111111111', value: 12 }));
    await expect(steps(args.onInteract)).toEqual([
      'tap:row-0',
      'tap:row-1',
      'tap:row-2',
      'tap:key-1',
      'tap:key-2',
    ]);
    const rows = [0, 1, 2].map((r) => rowButton(root, r));
    for (const el of [stack(root), ...rows, checkButton(root)]) {
      await expectTargetSize(el, 'g1-up');
    }
    await expectTargetGaps(rows);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const key of keys) await expectTargetSize(key, 'g1-up');
    await expectTargetGaps([...keys, checkButton(root)]);
    await expectBigNumerals([blank(root)]);
    // The tray's tile is drawn at the cells' own scale.
    const top = stack(root).querySelector('.ni-atw__tile-art') as HTMLElement;
    await expect(Math.round(top.getBoundingClientRect().width)).toBe(Math.round(pitchOf(root)));
    await expectTilesApart(root);
    await expectFits(canvasElement, root);
  },
};

/**
 * K tile: a 3 × 2 plot of chunky cells. Icon-only (no caption or tray words); the stack, the row
 * buttons and the keys are K-sized; a row button says its name.
 */
export const TileK: Story = {
  globals: { ageMode: 'k' },
  args: { config: { ...tile, region: full(3, 2) } },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-btn__label')).toHaveLength(0);
    await expect(root.querySelector('.ni-atw__traylabel')).toBeNull();
    await userEvent.click(rowButton(root, 0));
    await expect(said(audio)).toContain('ui.widget.at.row');
    await userEvent.click(cell(root, 1, 1));
    await expect(laidTiles(root)).toBe(4);
    const rows = [0, 1].map((r) => rowButton(root, r));
    for (const el of [stack(root), ...rows, checkButton(root)]) await expectTargetSize(el, 'k');
    await expectTargetGaps(rows);
    await expect(pitchOf(root)).toBeGreaterThanOrEqual(120);
    await userEvent.keyboard('4');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '111010', value: 4 }));
    await expectTilesApart(root);
    await expectFits(canvasElement, root);
  },
};

// ---------- the drag, tap and keyboard paths ----------

/** Mouse: drag a tile off the stack onto a cell, twice. Trace: drag tray → drop cell. */
export const DragTile: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await pointerDrag(stack(root), center(cell(root, 1, 2)), 'mouse', 10);
    await waitFor(() => expect(tileAt(root, 1, 2)).not.toBeNull());
    await pointerDrag(stack(root), center(cell(root, 0, 0)), 'mouse', 10);
    await waitFor(() => expect(tileAt(root, 0, 0)).not.toBeNull());
    await expect(laidTiles(root)).toBe(2);
    await type(root, '2');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '100000100000', value: 2 }));
    const trace = traceOf(args.onInteract);
    await expect(steps(args.onInteract)).toEqual([
      'drag:tray',
      'drop:cell-1-2',
      'drag:tray',
      'drop:cell-0-0',
      'tap:key-2',
    ]);
    await expectTraceOrdered(trace);
  },
};

/** Touch: hold a tile over a cell (the cell lights up as the drop target), then let go. */
export const TouchDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const target = cell(root, 2, 3);
    const lift = await touchDragAndHold(stack(root), center(target));
    await expect(target).toHaveAttribute('data-over', 'true');
    await expect(stack(root)).toHaveAttribute('data-dragging', 'true');
    await lift();
    await waitFor(() => expect(tileAt(root, 2, 3)).not.toBeNull());
    // A drop away from every cell glides home: nothing is laid.
    const box = root.getBoundingClientRect();
    await pointerDrag(stack(root), { x: box.left + 4, y: box.bottom - 4 }, 'touch');
    await expect(laidTiles(root)).toBe(1);
    await type(root, '1');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '000000000001', value: 1 }));
    await expect(steps(args.onInteract)).toEqual([
      'drag:tray',
      'drop:cell-2-3',
      'drag:tray',
      'drop:none',
      'tap:key-1',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * Tap: tapping a cell lays a tile; or tap the stack (it lifts and says "Tile"), then a cell.
 * Tapping a laid tile says "Tile" too.
 */
export const TapToPlace: Story = {
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(cell(root, 0, 1));
    await expect(tileAt(root, 0, 1)).not.toBeNull();
    await userEvent.click(stack(root));
    await expect(stack(root)).toHaveAttribute('data-selected', 'true');
    await expect(said(audio)).toContain('ui.widget.at.tile');
    // Every empty cell is ready for it.
    await expect(cell(root, 2, 2)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(cell(root, 2, 2));
    await expect(tileAt(root, 2, 2)).not.toBeNull();
    await expect(stack(root)).not.toHaveAttribute('data-selected');
    audio.say.mockClear();
    await userEvent.click(tileAt(root, 0, 1) as HTMLElement);
    await expect(said(audio)).toContain('ui.widget.at.tile');
    // Tapped again, it is put down where it is.
    await userEvent.click(tileAt(root, 0, 1) as HTMLElement);
    await type(root, '2');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '010000000010', value: 2 }));
    await expect(steps(args.onInteract)).toEqual([
      'tap:cell-0-1',
      'tap:tray',
      'tap:cell-2-2',
      'tap:tile-0-1',
      'tap:tile-0-1',
      'tap:key-2',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/**
 * Keyboard (06 §7): Enter on a focused cell lays a tile and moves on to the next empty cell. A
 * laid tile goes back with Enter (focus jumps to the tray), then Enter on the tray. Digits type;
 * Enter checks.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    cell(root, 0, 0).focus();
    await userEvent.keyboard('{Enter}');
    await expect(tileAt(root, 0, 0)).not.toBeNull();
    await waitFor(() => expect(cell(root, 0, 1)).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(cell(root, 0, 2)).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    await expect(laidTiles(root)).toBe(3);
    // Take the middle one back.
    (tileAt(root, 0, 1) as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(trayPad(root)).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    await expect(tileAt(root, 0, 1)).toBeNull();
    await expect(laidTiles(root)).toBe(2);
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('2');
    await expect(args.onResponse).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledTimes(1);
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '101000000000', value: 2 }));
    await expect(steps(args.onInteract)).toEqual([
      'tap:cell-0-0',
      'tap:cell-0-1',
      'tap:cell-0-2',
      'tap:tile-0-1',
      'tap:tray',
      'tap:key-2',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Take back: tap a laid tile, then the tray; or drag a laid tile back onto the tray. */
export const TakeBack: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(rowButton(root, 1));
    await expect(laidTiles(root)).toBe(4);
    await userEvent.click(tileAt(root, 1, 3) as HTMLElement);
    await expect(trayPad(root)).toHaveAttribute('data-armed', 'true');
    await userEvent.click(stack(root));
    await expect(tileAt(root, 1, 3)).toBeNull();
    await pointerDrag(tileAt(root, 1, 0) as HTMLElement, center(stack(root)), 'mouse', 10);
    await waitFor(() => expect(tileAt(root, 1, 0)).toBeNull());
    await expect(laidTiles(root)).toBe(2);
    await type(root, '2');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '000001100000', value: 2 }));
    await expect(steps(args.onInteract)).toEqual([
      'tap:row-1',
      'tap:tile-1-3',
      'tap:tray',
      'drag:tile-1-0',
      'drop:tray',
      'tap:key-2',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
  },
};

/** Grid off (`grid.off`): only the plot's outline; tiles still snap into the hidden cells. */
export const GridOff: Story = {
  args: { config: gridOff },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-atw__gridline')).toBeNull();
    await expect(root.querySelector('.ni-atw__outline')).not.toBeNull();
    await userEvent.click(rowButton(root, 0));
    await userEvent.click(cell(root, 2, 1));
    await type(root, '5');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '111100000100', value: 5 }));
    await expectFits(canvasElement, root);
  },
};

/**
 * Stress: tiling the 7 × 5 L (area 27). Row by row with "fill this row" (the top rows stop at the
 * notch); cells ≥ 28 px; row buttons ≥ 64 px and ≥ 12 px apart; everything fits.
 */
export const StressL: Story = {
  args: { config: tileL },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-atw__cell')).toHaveLength(27);
    await expectFits(canvasElement, root);
    for (const r of [0, 1, 2, 3, 4]) await userEvent.click(rowButton(root, r));
    await expect(laidTiles(root)).toBe(27);
    await expectNothingStates(root, [27]);
    await expect(pitchOf(root)).toBeGreaterThanOrEqual(28);
    const rows = [...root.querySelectorAll<HTMLElement>('.ni-atw__row')];
    for (const el of rows) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(rows);
    await type(root, '27');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: L75.mask, value: 27 }));
    await expectTilesApart(root);
    await expectFits(canvasElement, root);
  },
};

/**
 * Stress: tiling 47 hundredths of the 10 × 10 decimal grid. Cells ≥ 28 px; the row buttons
 * stagger into lanes so they keep 64 px and 12 px apart.
 */
export const StressDecimalTile: Story = {
  args: { config: decimalTile },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(pitchOf(root)).toBeGreaterThanOrEqual(28);
    const rows = [...root.querySelectorAll<HTMLElement>('.ni-atw__row')];
    await expect(rows).toHaveLength(5);
    for (const el of rows) await expectTargetSize(el, 'g1-up');
    await expectTargetGaps(rows);
    for (const r of [0, 1, 2, 3, 4]) await userEvent.click(rowButton(root, r));
    await expect(laidTiles(root)).toBe(47);
    await type(root, '47');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ tiles: decimal.region.mask, value: 47 }),
    );
    await expectFits(canvasElement, root);
  },
};

// ---------- count, multiply ----------

/** G1 count: the 5 × 4 L already tiled, as a picture; type 14. Tapping a tile names it. */
export const Count: Story = {
  args: { config: countL, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const picture = within(root).getByRole('img', { name: 'Look at the picture' });
    await expect(picture.querySelectorAll('.ni-atw__tile')).toHaveLength(14);
    await expectNothingStates(root, [14]);
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(picture.querySelector('[data-tile="2-3"]') as HTMLElement);
    await expect(said(audio)).toContain('ui.widget.at.tile');
    await type(root, '14');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 14 });
    await expect(steps(args.onInteract)).toEqual(['tap:tile-2-3', 'tap:key-1', 'tap:key-4']);
    await expectTilesApart(root);
    await expectFits(canvasElement, root);
  },
};

/** K count: a 3 × 2 plot of big, chunky tiles; icon-only controls, K-sized keys. */
export const CountK: Story = {
  globals: { ageMode: 'k' },
  args: { config: countK, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-btn__label')).toHaveLength(0);
    // No words to read: no caption text, no unit label.
    await expect(root.querySelector('.ni-atw__unit')).toBeNull();
    await expect(root.querySelector('.ni-atw__caption')?.textContent).toBe('');
    const art = root.querySelector('.ni-atw__tile-art') as HTMLElement;
    await expect(art.getBoundingClientRect().width).toBeGreaterThan(120);
    const keys = [...root.querySelectorAll<HTMLElement>('.ni-pad__key')];
    for (const key of keys) await expectTargetSize(key, 'k');
    await expectTargetSize(checkButton(root), 'k');
    await expectTargetGaps([...keys, checkButton(root)]);
    await userEvent.keyboard('6');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 6 });
    await expectTilesApart(root);
    await expectFits(canvasElement, root);
  },
};

/**
 * Multiply (stress 9 cm × 8 cm): a plain rectangle, no tiles; the side lengths as ≥ 32 px numerals
 * with "cm", spoken on tap. The blank's unit says "sq cm". Type 72.
 */
export const Multiply: Story = {
  args: { config: multiply, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-atw__tile')).toHaveLength(0);
    await expect(sideLabel(root, 'top')).toHaveAccessibleName('9 cm');
    await expect(sideLabel(root, 'left')).toHaveAccessibleName('8 cm');
    await expect(within(root).getByText('sq cm')).toBeVisible();
    await expectNothingStates(root, [72]);
    await expectBigNumerals([...root.querySelectorAll('.ni-atw__side-num')]);
    await userEvent.click(sideLabel(root, 'top'));
    await expect(numbersSaid(audio)).toContain(9);
    for (const el of [sideLabel(root, 'top'), sideLabel(root, 'left')]) {
      await expectTargetSize(el, 'g1-up');
    }
    await type(root, '72');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 72 });
    await expect(steps(args.onInteract)).toEqual(['tap:side-top', 'tap:key-7', 'tap:key-2']);
    await expectFits(canvasElement, root);
  },
};

/** Decimal grid (DEC.02): 47 hundredths of one whole, as a picture; the rest of the whole shows. */
export const Decimal: Story = {
  args: { config: decimal, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-atw__whole')).not.toBeNull();
    await expect(root.querySelector('.ni-atw__hundredths')).not.toBeNull();
    await expect(within(root).getByText('One whole')).toBeVisible();
    await expect(root.querySelectorAll('.ni-atw__tile')).toHaveLength(47);
    await expectNothingStates(root, [47]);
    await expect(pitchOf(root)).toBeGreaterThanOrEqual(20);
    await type(root, '47');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 47 });
    await expectTilesApart(root);
    await expectFits(canvasElement, root);
  },
};

// ---------- decompose, partition ----------

/**
 * Decompose (MEA.13): the 6 × 5 L. Tap a column gap marker to cut it, again to erase it, then cut
 * after row 2; the two pieces get different patterns. Type 24. Check waits for a line and a total.
 */
export const Decompose: Story = {
  args: { config: decompose, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelectorAll('.ni-atw__gap[data-dir="v"]')).toHaveLength(5);
    await expect(root.querySelectorAll('.ni-atw__gap[data-dir="h"]')).toHaveLength(4);
    await expectNothingStates(root, [24]);
    await type(root, '24');
    await expect(checkButton(root)).toBeDisabled();
    await userEvent.click(gapMarker(root, 'v', 3));
    await expect(gapMarker(root, 'v', 3)).toHaveAttribute('aria-pressed', 'true');
    await expect(root.querySelector('[data-split="v-3"]')).not.toBeNull();
    await userEvent.click(gapMarker(root, 'v', 3));
    await expect(root.querySelector('[data-split="v-3"]')).toBeNull();
    await userEvent.click(gapMarker(root, 'h', 2));
    // Two pieces, two patterns.
    const pieces = new Set(
      [...root.querySelectorAll('.ni-atw__soil[data-piece]')].map((el) =>
        el.getAttribute('data-piece'),
      ),
    );
    await expect(pieces.size).toBe(2);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ splits: [{ dir: 'h', at: 2 }], value: 24 }),
    );
    await expect(steps(args.onInteract)).toEqual([
      'tap:key-2',
      'tap:key-4',
      'tap:gap-v-3',
      'tap:gap-v-3',
      'tap:gap-h-2',
    ]);
    const gaps = [...root.querySelectorAll<HTMLElement>('.ni-atw__gap')];
    for (const g of gaps) await expectTargetSize(g, 'g1-up');
    await expectTargetGaps(gaps);
    await expectFits(canvasElement, root);
  },
};

/**
 * Partition (GEO.04): a 4 × 3 rectangle. Draw the three column lines and two row lines until it is
 * cut into unit squares; Check sends `{ rows, cols }`. No number pad.
 */
export const Partition: Story = {
  args: { config: partition, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-pad')).toBeNull();
    await expect(checkButton(root)).toBeDisabled();
    for (const at of [1, 2, 3]) await userEvent.click(gapMarker(root, 'v', at));
    for (const at of [1, 2]) await userEvent.click(gapMarker(root, 'h', at));
    await expect(root.querySelectorAll('.ni-atw__split')).toHaveLength(5);
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ rows: 3, cols: 4 }));
    await expect(steps(args.onInteract)).toEqual([
      'tap:gap-v-1',
      'tap:gap-v-2',
      'tap:gap-v-3',
      'tap:gap-h-1',
      'tap:gap-h-2',
    ]);
    const gaps = [...root.querySelectorAll<HTMLElement>('.ni-atw__gap')];
    for (const g of gaps) await expectTargetSize(g, 'g1-up');
    await expectTargetGaps([...gaps, checkButton(root)]);
    await expectFits(canvasElement, root);
  },
};

/** K partition: the same markers at K size (≥ 80 px), icon-only, each saying its name. */
export const PartitionK: Story = {
  globals: { ageMode: 'k' },
  args: { config: partition, tier: 'pictorial' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const gaps = [...root.querySelectorAll<HTMLElement>('.ni-atw__gap')];
    for (const g of gaps) await expectTargetSize(g, 'k');
    await expectTargetGaps([...gaps, checkButton(root)]);
    await userEvent.click(gapMarker(root, 'v', 2));
    await expect(said(audio)).toContain('ui.widget.at.gap.v');
    await expectFits(canvasElement, root);
  },
};

// ---------- disabled ----------

/** `disabled`: no input at all (feedback showing, or the runner waiting). */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(rowButton(root, 0)).toBeDisabled();
    await expect(checkButton(root)).toBeDisabled();
    await expect(stack(root)).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(cell(root, 0, 0));
    await pointerDrag(stack(root), center(cell(root, 1, 1)), 'mouse');
    await userEvent.click(padKey(root, '3'));
    await expect(laidTiles(root)).toBe(0);
    await expect(args.onInteract).not.toHaveBeenCalled();
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

// ---------- demo mode ----------

const demoPlay: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (03 §6.3), tile: a tile flies in from the tray, another flies back, row 2 fills cell by
 * cell, the top side's length lights up and is spoken, and Pip types the answer. Input is off
 * while a step plays; afterwards the widget is back to its normal, interactive look.
 */
export const DemoPlay: Story = {
  args: { config: tileLabels, demo: demoPlay },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as SpyAudio;
    clearSpies(audio);
    const root = await findWidget(canvasElement, ROOT);
    const flying = demoPlay.play({ op: 'place-tile', args: { r: 0, c: 0 } });
    await waitFor(() => expect(tileAt(root, 0, 0)).not.toBeNull());
    // Mid-flight: the tile is animating in from the tray, and input is off.
    await expect((tileAt(root, 0, 0) as HTMLElement).getAnimations().length).toBeGreaterThan(0);
    await expect(rowButton(root, 0)).toBeDisabled();
    await flying;
    await demoPlay.play({ op: 'place-tile', args: { r: 0, c: 1 } });
    await demoPlay.play({ op: 'place-tile', args: { r: 0, c: 1, remove: true } });
    await expect(tileAt(root, 0, 1)).toBeNull();
    await expect(laidTiles(root)).toBe(1);
    const filling = demoPlay.play({ op: 'fill-row', args: { r: 2 } });
    await waitFor(() => expect(tileAt(root, 2, 0)).not.toBeNull());
    await expect(tileAt(root, 2, 3)).toBeNull();
    await expect(root.querySelector('.ni-atw__lit')).not.toBeNull();
    await filling;
    await expect(laidTiles(root)).toBe(5);
    const labelling = demoPlay.play({ op: 'label-side', args: { side: 'top' } });
    await waitFor(() => expect(sideLabel(root, 'top')).toHaveAttribute('data-flash', 'true'));
    await labelling;
    await expect(numbersSaid(audio)).toContain(4);
    await demoPlay.play({ op: 'answer', args: { value: 12 } });
    await expect(blank(root)).toHaveAttribute('aria-label', 'Your answer: 12');
    // Back to normal: no highlight left, the controls on again.
    await waitFor(() => expect(root.querySelector('.ni-atw__lit')).toBeNull());
    await expect(root.querySelector('[data-flash]')).toBeNull();
    await expect(rowButton(root, 0)).toBeEnabled();
    await waitFor(() => expect(checkButton(root)).toBeEnabled());
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(state({ tiles: '100000001111', value: 12 }));
  },
};

const demoSplit: WidgetDemo = createDemoController({ strict: true });

/** Demo, decompose: the line after row 2 draws itself (its marker ringed), then the total. */
export const DemoPlaySplit: Story = {
  args: { config: decompose, demo: demoSplit },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const drawing = demoSplit.play({ op: 'draw-split', args: { at: 2, dir: 'h' } });
    await waitFor(() =>
      expect(root.querySelector('[data-split="h-2"]')).toHaveAttribute('data-flash', 'true'),
    );
    await expect(gapMarker(root, 'h', 2)).toHaveClass('ni-invite');
    await drawing;
    await expect(gapMarker(root, 'h', 2)).toHaveAttribute('aria-pressed', 'true');
    await demoSplit.play({ op: 'answer', args: { value: 24 } });
    await waitFor(() => expect(checkButton(root)).toBeEnabled());
    await expect(gapMarker(root, 'h', 2)).not.toHaveClass('ni-invite');
    await userEvent.click(checkButton(root));
    await expect(args.onResponse).toHaveBeenCalledWith(
      state({ splits: [{ dir: 'h', at: 2 }], value: 24 }),
    );
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });

/** Demo invite: Pip's hand on a cell (lay a tile here), a row button, a laid tile, the blank. */
export const DemoInvite: Story = {
  args: { demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    demoInvite.invite({ op: 'place-tile', args: { r: 1, c: 2 } });
    await waitFor(() => expect(cell(root, 1, 2)).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), cell(root, 1, 2), root);
    demoInvite.invite({ op: 'fill-row', args: { r: 2 } });
    await waitFor(() => expect(rowButton(root, 2)).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), rowButton(root, 2), root);
    await userEvent.click(rowButton(root, 0));
    await expect(root.querySelector('.ni-hand')).toBeNull();
    demoInvite.invite({ op: 'place-tile', args: { r: 0, c: 3, remove: true } });
    await waitFor(() => expect(tileAt(root, 0, 3)).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), tileAt(root, 0, 3) as HTMLElement, root);
    demoInvite.invite({ op: 'answer', args: { value: 12 } });
    await waitFor(() => expect(blank(root)).toHaveClass('ni-invite'));
    await expectPointerOn(hand(), blank(root), root);
    // The child's own step clears the invite.
    await userEvent.click(padKey(root, '1'));
    await expect(root.querySelector('.ni-hand')).toBeNull();
  },
};

const demoInviteSplit: WidgetDemo = createDemoController({ strict: true });

/** Demo invite, decompose: the hand on the gap marker for the line after column 3. */
export const DemoInviteSplit: Story = {
  args: { config: decompose, demo: demoInviteSplit },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    demoInviteSplit.invite({ op: 'draw-split', args: { at: 3, dir: 'v' } });
    await waitFor(() => expect(gapMarker(root, 'v', 3)).toHaveClass('ni-invite'));
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      gapMarker(root, 'v', 3),
      root,
    );
  },
};

const demoUnsupported: WidgetDemo = createDemoController({ strict: true });

/** An op area-tiles doesn't define throws UnsupportedWidgetOpError in development. */
export const DemoUnsupportedOp: Story = {
  args: { demo: demoUnsupported },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(demoUnsupported.play({ op: 'drag-rect' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};

const demoReduced: WidgetDemo = createDemoController({ strict: true });

/**
 * Reduced motion: ops are instant (no flight, no cell-by-cell fill); the highlight shows briefly,
 * then the widget is back to normal. Tiles don't pop in.
 */
export const ReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { demo: demoReduced },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const started = performance.now();
    const placing = demoReduced.play({ op: 'place-tile', args: { r: 0, c: 0 } });
    await waitFor(() => expect(tileAt(root, 0, 0)).not.toBeNull());
    await expect((tileAt(root, 0, 0) as HTMLElement).getAnimations()).toHaveLength(0);
    await placing;
    const filling = demoReduced.play({ op: 'fill-row', args: { r: 1 } });
    // The whole row at once, ringed.
    await waitFor(() => expect(laidTiles(root)).toBe(5));
    await expect(root.querySelector('.ni-atw__lit')).not.toBeNull();
    await filling;
    await expect(performance.now() - started).toBeLessThan(1500);
    await waitFor(() => expect(root.querySelector('.ni-atw__lit')).toBeNull());
    await expect(getComputedStyle(tileAt(root, 1, 0) as HTMLElement).animationName).toBe('none');
  },
};
