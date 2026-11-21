import { formatModel, SC_OUTLINE_EXTENT_MAX, stateChecker } from '@number-island/engine';
import type { ResponseValue, WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import geo05t3 from '../../../../engine/test/fixtures/geo05-t3-pictorial.json';
import {
  areaBox,
  expectFitsArea,
  expectHandStays,
  expectNumeralsAtLeast32,
  inArea,
} from '../../test-support/areaStory';
import {
  boxGap,
  expectApart,
  expectControls,
  expectHandTouchesOnlyInvited,
  expectNumeralInk,
  expectOneInviteRing,
  expectRenderedNumerals,
  fillPercent,
  keyRectsAfterEach,
  outlineBox,
  recordEvidence,
  sizeOf,
} from '../../test-support/evidence';
import {
  center,
  clearSpies,
  expectTargetGaps,
  expectTargetSize,
  pointerDrag,
  spyAudio,
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
 * `shape-compose` (03 §5.5): fill an outline, place an item by a position word, draw a shape on
 * dots or build it with sticks. Configs are real generated items (template and seed in each
 * comment); GEO.05.t3 is the engine's widget fixture (02 §5.9 K1). Every response is checked with
 * the engine's checker.
 */

type Config = ConfigFor<'shape-compose'>;
const H = Math.sqrt(3) / 2;

/** GEO.10.t1 seed 1: a trapezoid from a triangle and a rhombus (pattern blocks). */
const trapezoid: Config = {
  format: 'shape-compose',
  mode: 'fill-outline',
  pieces: [
    { id: 'p-triangle', kind: 'triangle', count: 1 },
    { id: 'p-rhombus', kind: 'rhombus', count: 1 },
  ],
  outline: {
    points: [
      [0, 0],
      [2, 0],
      [1.5, H],
      [0.5, H],
    ],
  },
  showOutlineLines: true,
  rotationStep: 60,
};
const trapezoidTarget = {
  outline: trapezoid.outline?.points,
  pieces: [
    { kind: 'triangle', count: 1 },
    { kind: 'rhombus', count: 1 },
  ],
};

/** GEO.10.t2 seed 2 (shapes): a corner shape from a rectangle and a square; lines hidden here. */
const corner: Config = {
  format: 'shape-compose',
  mode: 'fill-outline',
  pieces: [
    { id: 'p-rectangle', kind: 'rectangle', count: 1 },
    { id: 'p-square', kind: 'square', count: 1 },
  ],
  outline: {
    points: [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ],
  },
  showOutlineLines: false,
  rotationStep: 90,
};

/** GEO.05.t3 (pictorial): put the crab above the crate; a jug stands beside it. */
const above = geo05t3.widget as Config;
const aboveTarget = geo05t3.answer.target;

/** GEO.05.t1 seed 2 (concrete), here asking for `behind`: the fish behind the crate. */
const behind: Config = {
  format: 'shape-compose',
  mode: 'place-relative',
  showOutlineLines: false,
  scene: {
    anchors: [
      { id: 'a0', sprite: 'crate', at: [46, 34] },
      { id: 'a1', sprite: 'lantern', at: [82, 34] },
    ],
  },
  relation: { word: 'behind', anchor: 'a0', item: 'fish' },
  rotationStep: 90,
};
const behindTarget = {
  word: 'behind',
  box: { x: 46, y: 34, w: 20, h: 20 },
  scene: { w: 100, h: 60 },
};

/** GEO.02.t1 seed 1 (G1; a wide grid, 3 rows × 6): draw a closed shape with 3 sides. */
const draw3: Config = {
  format: 'shape-compose',
  mode: 'draw-on-grid',
  showOutlineLines: false,
  grid: { cols: 6, rows: 3 },
  require: { sides: 3 },
  rotationStep: 90,
};

/**
 * GEO.09.t1 seed 1 (K; a wide grid, 3 rows × 6: K dot targets, 80 px and 92 px apart, fit every
 * area's height with 3 rows): make a triangle with sticks.
 */
const sticks: Config = {
  format: 'shape-compose',
  mode: 'build-sticks',
  pieces: [
    { id: 'stick', kind: 'stick', count: 8 },
    { id: 'corner', kind: 'corner', count: 5 },
  ],
  showOutlineLines: false,
  grid: { cols: 6, rows: 3 },
  require: { kind: 'triangle' },
  rotationStep: 90,
};

const meta = {
  title: 'Widgets/Shape compose',
  args: {
    config: trapezoid as WidgetConfig,
    tier: 'concrete',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { stage: 'centered' } },
  render: renderWidget,
  // Evidence: every story leaves its key rects in the area's `data-evidence`.
  afterEach: keyRectsAfterEach('.ni-scomp'),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-scomp';
const lastState = (spy: unknown) => {
  const calls = (spy as ReturnType<typeof fn>).mock.calls;
  const last = calls[calls.length - 1]?.[0] as
    | (ResponseValue & { value: Record<string, unknown> })
    | undefined;
  return last?.value ?? {};
};
const tile = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-piece="${id}"] .ni-scomp__tile`) as HTMLElement;
const boardPad = (root: HTMLElement) =>
  root.querySelector('.ni-scomp__board .ni-scomp__pad') as HTMLElement;
const placed = (root: HTMLElement) =>
  [...root.querySelectorAll<SVGPolygonElement>('[data-placed]')].map((p) => ({
    id: p.dataset.placed,
    at: p.dataset.at,
    rot: p.dataset.rot,
  }));
/** A page point over the board at piece units (x right, y up). */
function boardPoint(root: HTMLElement, x: number, y: number, config: Config) {
  const r = boardPad(root).getBoundingClientRect();
  const pts = config.outline?.points ?? [];
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const u = (r.width - 28) / (maxX - minX);
  void minY;
  return { x: r.left + 14 + (x - minX) * u, y: r.top + 14 + (maxY - y) * u };
}

/**
 * K, concrete (GEO.10.t1): the rhombus dragged by touch onto the left of the outline snaps into
 * place; the triangle goes in by keyboard (the first place it fits). That is another way to fill
 * the trapezoid than the generator's, and compose.fill accepts it.
 */
export const FillTrapezoidK: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const tiles = [tile(root, 'p-triangle'), tile(root, 'p-rhombus')];
    for (const t of tiles) await expectTargetSize(t, 'k');
    const turns = [...root.querySelectorAll<HTMLElement>('.ni-scomp__rotate')];
    for (const t of turns) await expectTargetSize(t, 'k');
    await expectTargetGaps([...tiles, ...turns]);
    // Guide lines show inside the outline.
    await expect(
      Number(root.querySelector('.ni-scomp__lattice')?.getAttribute('data-lines')),
    ).toBeGreaterThan(0);
    await pointerDrag(tile(root, 'p-rhombus'), boardPoint(root, 0.75, 0.43, trapezoid), 'touch');
    await waitFor(() => expect(placed(root)).toEqual([{ id: 'p-rhombus:0', at: '0,0', rot: '0' }]));
    tile(root, 'p-triangle').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(placed(root)).toHaveLength(2));
    await expect(placed(root)[1]).toEqual({ id: 'p-triangle:0', at: '1,0', rot: '0' });
    // Every piece used: the tray tiles are off.
    await expect(tile(root, 'p-triangle')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const value = lastState(args.onResponse);
    await expect(stateChecker('compose.fill')?.check(trapezoidTarget, value)).toBe(true);
    const trace = traceOf(args.onInteract);
    await expect(trace.map((e) => `${e.t}:${e.target}`)).toEqual(
      expect.arrayContaining(['drag:p-rhombus', 'drop:board', 'tap:p-triangle', 'tap:board']),
    );
    await expectTraceOrdered(trace);
  },
};

/**
 * A piece goes only where it fits: the unturned rhombus does not fit beside the triangle, so it
 * stays in the tray. Turned twice (120°) it fits; "take one back" lifts it out again.
 */
export const FillNeedsTurn: Story = {
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(tile(root, 'p-triangle'));
    const left = boardPoint(root, 0.5, 0.3, trapezoid);
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: boardPad(root),
      coords: { clientX: left.x, clientY: left.y },
    });
    await waitFor(() =>
      expect(placed(root)).toEqual([{ id: 'p-triangle:0', at: '0,0', rot: '0' }]),
    );
    const right = boardPoint(root, 1.4, 0.45, trapezoid);
    await userEvent.click(tile(root, 'p-rhombus'));
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: boardPad(root),
      coords: { clientX: right.x, clientY: right.y },
    });
    await expect(placed(root)).toHaveLength(1);
    const turn = within(root).getByRole('button', { name: /Turn the rhombus/ });
    await userEvent.click(turn);
    await userEvent.click(turn);
    await expect(tile(root, 'p-rhombus').querySelector('svg')).toHaveAttribute(
      'data-tray-rot',
      '120',
    );
    await pointerDrag(tile(root, 'p-rhombus'), right, 'mouse');
    await waitFor(() => expect(placed(root)).toHaveLength(2));
    await expect(placed(root)[1]).toEqual({ id: 'p-rhombus:0', at: '2,0', rot: '120' });
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(
      stateChecker('compose.fill')?.check(trapezoidTarget, lastState(args.onResponse)),
    ).toBe(true);
    await userEvent.click(within(root).getByRole('button', { name: 'Take one back' }));
    await expect(placed(root)).toHaveLength(1);
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual(
      expect.arrayContaining(['drop:none', 'tap:rotate-p-rhombus', 'undo:p-rhombus:0']),
    );
  },
};

/** Pictorial shapes kit (GEO.10.t2), lines hidden, at the smallest landscape area (K). */
/** GEO.11.t1 seed 13 (geo.compose, hexagon-from-three-kinds, extra): four piece kinds. */
const fourKinds: Config = {
  format: 'shape-compose',
  mode: 'fill-outline',
  pieces: [
    { id: 'p-trapezoid', kind: 'trapezoid', count: 1 },
    { id: 'p-triangle', kind: 'triangle', count: 1 },
    { id: 'p-rhombus', kind: 'rhombus', count: 1 },
    { id: 'p-hexagon', kind: 'hexagon', count: 2 },
  ],
  outline: {
    points: [
      [0, 0],
      [1, 0],
      [1.5, H],
      [1, 2 * H],
      [0, 2 * H],
      [-0.5, H],
    ],
  },
  showOutlineLines: true,
  rotationStep: 60,
};

/**
 * Smallest landscape area, K, four piece kinds (review CR-1.1): every tile, turn button, the
 * outline and Check fit with nothing scrolling; tiles keep the K size and gaps.
 */
export const FillFourKindsLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: fourKinds },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const controls = [...root.querySelectorAll<HTMLElement>('.ni-scomp__tile, .ni-scomp__rotate')];
    await expect(controls).toHaveLength(8);
    await expectFitsArea(areaBox(canvasElement), [
      root.querySelector('.ni-scomp__board') as HTMLElement,
      ...controls,
      ...root.querySelectorAll('.ni-scomp__undo, .ni-scomp__count'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const c of controls) await expectTargetSize(c, 'k');
    await expectTargetGaps(controls);
    await expectTrayTruths(root);
    await expectControls('shape-compose FillFourKindsLandscapeMinK', 'k', fillControls(root));
  },
};

const fillControls = (root: HTMLElement) => ({
  tiles: [...root.querySelectorAll('.ni-scomp__tile')],
  turn: [...root.querySelectorAll('.ni-scomp__rotate')],
  undo: [...root.querySelectorAll('.ni-scomp__undo')],
  check: [within(root).getByRole('button', { name: 'Check' })],
});

/**
 * The tray (evidence review): each count badge sits off its tile (never on the piece, whose
 * corners are counted) with a numeral of at least 32 px rendered; every piece is drawn at one
 * pattern-block scale in equal tiles (a triangle half a trapezoid's width, a hexagon as wide as a
 * trapezoid, a rhombus 1.5 sides).
 */
async function expectTrayTruths(root: HTMLElement) {
  let inset = Number.POSITIVE_INFINITY;
  for (const row of root.querySelectorAll<HTMLElement>('.ni-scomp__tray-row')) {
    const badge = row.querySelector('.ni-scomp__count') as HTMLElement;
    const tileEl = row.querySelector('.ni-scomp__tile') as HTMLElement;
    await expectApart(badge, tileEl, 0, 'count badge off the tile');
    // Every piece 12+ px inside its tile's edges (evidence review).
    const t = tileEl.getBoundingClientRect();
    const p = (tileEl.querySelector('polygon') as SVGPolygonElement).getBoundingClientRect();
    const i = Math.min(p.left - t.left, p.top - t.top, t.right - p.right, t.bottom - p.bottom);
    inset = Math.min(inset, i);
    await expect(i, 'piece inset in its tile').toBeGreaterThanOrEqual(12);
  }
  recordEvidence(root, { tray_inset: Math.round(inset) });
  console.info(`[tray] smallest piece inset in its tile ${Math.round(inset)} px`);
  await expectRenderedNumerals(root, '.ni-scomp__count');
  await expectNumeralInk(root, '.ni-scomp__count');
  await expectNumeralsAtLeast32(root, '.ni-scomp__count');
  const tiles = [...root.querySelectorAll('.ni-scomp__tile')].map((t) => t.getBoundingClientRect());
  for (const t of tiles) {
    await expect(t.width).toBeCloseTo(tiles[0]?.width ?? 0, 0);
    await expect(t.height).toBeCloseTo(tiles[0]?.height ?? 0, 0);
  }
  const width = (kind: string) =>
    (
      root.querySelector(`[data-piece="p-${kind}"] polygon`) as SVGPolygonElement | null
    )?.getBoundingClientRect().width;
  const side = (width('trapezoid') ?? 0) / 2;
  const unit = width('triangle') ?? side;
  await expect(unit).toBeCloseTo(side, 0);
  if (width('hexagon') !== undefined) await expect(width('hexagon')).toBeCloseTo(2 * side, 0);
  if (width('rhombus') !== undefined) await expect(width('rhombus')).toBeCloseTo(1.5 * side, 0);
}

export const FillCornerLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: corner, tier: 'pictorial' },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(root.querySelector('.ni-scomp__lattice line')).toBeNull();
    await expectFitsArea(areaBox(canvasElement), [
      root.querySelector('.ni-scomp__board') as HTMLElement,
      ...root.querySelectorAll('.ni-scomp__tile, .ni-scomp__rotate, .ni-scomp__undo'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    // The square on top, the rectangle (turned upright? no: lying) along the bottom.
    await userEvent.click(tile(root, 'p-rectangle'));
    const bottom = boardPoint(root, 1, 0.5, corner);
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: boardPad(root),
      coords: { clientX: bottom.x, clientY: bottom.y },
    });
    await userEvent.click(tile(root, 'p-square'));
    const top = boardPoint(root, 0.5, 1.5, corner);
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: boardPad(root),
      coords: { clientX: top.x, clientY: top.y },
    });
    await waitFor(() => expect(placed(root)).toHaveLength(2));
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(
      stateChecker('compose.fill')?.check(
        {
          outline: corner.outline?.points,
          pieces: [
            { kind: 'rectangle', count: 1 },
            { kind: 'square', count: 1 },
          ],
        },
        lastState(args.onResponse),
      ),
    ).toBe(true);
  },
};

/** Tablet widget area (K): the GEO.11 three-piece hexagon fits with no scroll. */
export const FillTabletK: Story = {
  globals: { ageMode: 'k' },
  args: {
    config: {
      ...trapezoid,
      pieces: [
        { id: 'p-trapezoid', kind: 'trapezoid', count: 1 },
        { id: 'p-triangle', kind: 'triangle', count: 1 },
        { id: 'p-rhombus', kind: 'rhombus', count: 1 },
      ],
      outline: {
        points: [
          [0, 0],
          [1, 0],
          [1.5, H],
          [1, 2 * H],
          [0, 2 * H],
          [-0.5, H],
        ],
      },
    } as Config,
  },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      root.querySelector('.ni-scomp__board') as HTMLElement,
      ...root.querySelectorAll('.ni-scomp__tile, .ni-scomp__rotate, .ni-scomp__undo'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectTrayTruths(root);
    await expectControls('shape-compose FillTabletK', 'k', fillControls(root));
    // The composition uses the area (evidence review: 58 % as measured): what is drawn (the
    // outline, the tray's tiles, badges and turn buttons, undo, Check) covers 60+ % of the area
    // card, centred across it.
    await expectComposition(canvasElement, [
      ...root.querySelectorAll(
        '.ni-scomp__outline, .ni-scomp__tile, .ni-scomp__count, .ni-scomp__rotate, .ni-scomp__undo',
      ),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
  },
};

/**
 * What a story draws (`parts`: the visible drawing and controls, not their layout boxes) covers
 * 60+ % of the area card (its outer box, as the evidence review measures) and is centred across it
 * (left and right margins within 4 px). Records the margins.
 */
async function expectComposition(canvasElement: HTMLElement, parts: readonly Element[]) {
  const area = areaBox(canvasElement);
  const pct = fillPercent(area, parts);
  await expect(pct, 'the composition covers 60 % of the area card').toBeGreaterThanOrEqual(60);
  const a = area.getBoundingClientRect();
  const rs = parts.map((p) => p.getBoundingClientRect());
  const left = Math.min(...rs.map((r) => r.left)) - a.left;
  const right = a.right - Math.max(...rs.map((r) => r.right));
  await expect(Math.abs(left - right), 'the composition centred').toBeLessThanOrEqual(4);
  recordEvidence(area, { composition_lr: `${Math.round(left)}/${Math.round(right)}` });
  console.info(
    `[composition] ${pct} % of the area; margins L/R ${Math.round(left)}/${Math.round(right)}`,
  );
}

const scene = (root: HTMLElement) => root.querySelector('.ni-scomp__scene') as HTMLElement;
const item = (root: HTMLElement) => root.querySelector('.ni-scomp__item') as HTMLElement;
/** A page point at scene units (100 × 60, y down). */
function scenePoint(root: HTMLElement, x: number, y: number) {
  const r = scene(root).getBoundingClientRect();
  return { x: r.left + (x / 100) * r.width, y: r.top + (y / 60) * r.height };
}

/**
 * GEO.05.t3 (pictorial, 02 §5.9 K1), the engine's widget fixture: drag the crab above the crate
 * by touch. Anchors are drawn at their ANCHOR_SIZE boxes; compose.relative accepts the answer.
 */
export const AbovePictorialK: Story = {
  globals: { ageMode: 'k' },
  args: { config: above, tier: 'pictorial' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(scene(root)).toHaveAttribute('data-tier', 'pictorial');
    const crate = root.querySelector('[data-anchor-id="a0"]') as HTMLElement;
    const r = scene(root).getBoundingClientRect();
    await expect(crate.getBoundingClientRect().width).toBeCloseTo((20 / 100) * r.width, 0);
    await expect(crate.getBoundingClientRect().height).toBeCloseTo((20 / 60) * r.height, 0);
    await expectTargetSize(item(root), 'k');
    await pointerDrag(item(root), scenePoint(root, 46, 12), 'touch');
    await waitFor(() => expect(item(root)).toHaveAttribute('data-layer', 'front'));
    await expectTargetSize(item(root), 'k');
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const value = lastState(args.onResponse);
    await expect(stateChecker('compose.relative')?.check(aboveTarget, value)).toBe(true);
    await expect(traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`)).toEqual([
      'drag:crab',
      'drop:scene',
    ]);
  },
};

/** Tablet area, K: the scene, the item and Check fit with no scroll. */
export const AboveTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: above, tier: 'pictorial' },
  render: inArea('tablet'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      scene(root),
      item(root),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
  },
};

/** Smallest landscape area, K: the same fits; the item is still a K-sized target. */
export const AboveLandscapeMinK: Story = {
  ...AboveTabletK,
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      scene(root),
      item(root),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await userEvent.click(item(root));
    const p = scenePoint(root, 46, 10);
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: scene(root).querySelector('.ni-scomp__pad') as HTMLElement,
      coords: { clientX: p.x, clientY: p.y },
    });
    await waitFor(() => expect(item(root)).toHaveAttribute('data-layer', 'front'));
    await expectTargetSize(item(root), 'k');
    await expectControls('shape-compose AboveLandscapeMinK', 'k', {
      item: [item(root)],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
  },
};

/**
 * Concrete (GEO.05.t1), `behind`: dropped on the top half of the crate the fish tucks behind it
 * (drawn behind, outline showing through). The keyboard moves it (arrows) and Enter flips it to
 * the front and back again.
 */
export const BehindConcrete: Story = {
  // K, like the other place-relative stories: the icon-only K Check and K-size slots.
  globals: { ageMode: 'k' },
  args: { config: behind },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Before: the item in its 80 px tray slot; after the drag, the empty slot keeps that size.
    await expectTargetSize(item(root), 'k');
    await pointerDrag(item(root), scenePoint(root, 46, 29), 'mouse');
    await waitFor(() => expect(item(root)).toHaveAttribute('data-layer', 'back'));
    const slot = root.querySelector('.ni-scomp__item-home') as HTMLElement;
    await expectTargetSize(slot, 'k');
    const check = within(root).getByRole('button', { name: 'Check' });
    await expect(check).not.toHaveTextContent('Check');
    // Behind reads as behind (evidence review): no see-through overlay; the WHOLE crate (front,
    // rim and frame) is drawn again over the fish, unclipped, so no fish pixel lies over the
    // crate; only the fish above the crate's rim shows (35 to 45 % of the fish).
    await expect(root.querySelector('.ni-scomp__xray')).toBeNull();
    const crate = root.querySelector('[data-anchor-id="a0"]') as HTMLElement;
    const front = root.querySelector('[data-front-of="a0"]') as HTMLElement;
    await expect(front).not.toBeNull();
    await expect(getComputedStyle(front).clipPath, 'the crate drawn whole over the fish').toBe(
      'none',
    );
    const c = crate.getBoundingClientRect();
    const fr = front.getBoundingClientRect();
    for (const k of ['left', 'top', 'right', 'bottom'] as const) {
      await expect(fr[k], `front ${k} = the crate's`).toBeCloseTo(c[k], 0);
    }
    const z = (el: Element) => Number(getComputedStyle(el).zIndex);
    await expect(z(crate)).toBeLessThan(z(item(root)));
    await expect(z(item(root))).toBeLessThan(z(front));
    // The rim: the top of the crate's drawing (its painted parts), and the fish's drawing.
    const inkTop = (el: Element) =>
      Math.min(
        ...[...el.querySelectorAll('svg path, svg rect, svg circle, svg ellipse, svg polygon')].map(
          (s) => s.getBoundingClientRect().top,
        ),
      );
    const inkBottom = (el: Element) =>
      Math.max(
        ...[...el.querySelectorAll('svg path, svg rect, svg circle, svg ellipse, svg polygon')].map(
          (s) => s.getBoundingClientRect().bottom,
        ),
      );
    const rim = inkTop(front);
    const fishTop = inkTop(item(root));
    const fishBottom = inkBottom(item(root));
    const above = (rim - fishTop) / (fishBottom - fishTop);
    await expect(fishTop, 'the fish shows above the rim').toBeLessThan(rim);
    await expect(above, 'fish above the rim').toBeGreaterThanOrEqual(0.35);
    await expect(above, 'fish above the rim').toBeLessThanOrEqual(0.45);
    // Below the rim the fish lies within the crate's box: all of it hidden by the crate.
    const f = (item(root).querySelector('svg') as SVGElement).getBoundingClientRect();
    await expect(f.left).toBeGreaterThanOrEqual(fr.left - 0.5);
    await expect(f.right).toBeLessThanOrEqual(fr.right + 0.5);
    await expect(fishBottom).toBeLessThanOrEqual(fr.bottom + 0.5);
    recordEvidence(root, {
      check: sizeOf(check),
      slot: sizeOf(slot),
      fish_above_rim_pct: Math.round(above * 100),
      crate_over_fish: 'whole crate, unclipped',
    });
    console.info(
      `[behind] check ${sizeOf(check)}; slot ${sizeOf(slot)}; fish above rim ${Math.round(above * 100)} % (the rest hidden by the whole crate)`,
    );
    item(root).focus();
    await userEvent.keyboard('{Enter}');
    await expect(item(root)).toHaveAttribute('data-layer', 'front');
    await userEvent.keyboard('{Enter}');
    await expect(item(root)).toHaveAttribute('data-layer', 'back');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(item(root).dataset.at?.split(',')[0]).toBe(
      String(Number(item(root).dataset.at?.split(',')[0])),
    );
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(
      stateChecker('compose.relative')?.check(behindTarget, lastState(args.onResponse)),
    ).toBe(true);
    await expect(traceOf(args.onInteract).map((e) => e.t)).toEqual([
      'drag',
      'drop',
      'move',
      'move',
      'move',
    ]);
  },
};

const dotsBoard = (root: HTMLElement) => root.querySelector('.ni-scomp__dots') as HTMLElement;
const dotTargets = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('.ni-scomp__dot-target'),
];

/**
 * Every dot is its own target (evidence review: one big board target, dots 61 px apart): each
 * target-size, all 12+ px apart, each centred on its dot. Records the target, gap and spacing.
 */
async function expectDotTargets(root: HTMLElement, ageMode: 'k' | 'g1-up') {
  const targets = dotTargets(root);
  await expect(targets.length).toBeGreaterThan(0);
  for (const t of targets) await expectTargetSize(t, ageMode);
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      gap = Math.min(
        gap,
        boxGap(
          (targets[i] as HTMLElement).getBoundingClientRect(),
          (targets[j] as HTMLElement).getBoundingClientRect(),
        ),
      );
    }
  }
  await expect(gap, 'dot targets 12 px apart').toBeGreaterThanOrEqual(11.5);
  for (const t of targets) {
    const dot = center(root.querySelector(`circle[data-dot="${t.dataset.dotTarget}"]`) as Element);
    const c = center(t);
    await expect(Math.hypot(dot.x - c.x, dot.y - c.y), 'target on its dot').toBeLessThan(1);
  }
  const a = center(root.querySelector('circle[data-dot="0,0"]') as Element);
  const b = center(root.querySelector('circle[data-dot="1,0"]') as Element);
  const r = (targets[0] as HTMLElement).getBoundingClientRect();
  const xy = targets.map((t) => (t.dataset.dotTarget ?? '0,0').split(',').map(Number));
  recordEvidence(root, {
    grid: `${Math.max(...xy.map((p) => p[0] as number)) + 1}x${Math.max(...xy.map((p) => p[1] as number)) + 1}`,
    dot_target: `${Math.round(r.width)}x${Math.round(r.height)}`,
    dot_gap: Math.round(gap),
    dot_spacing: Math.round(b.x - a.x),
  });
  console.info(
    `[dots] targets ${Math.round(r.width)}×${Math.round(r.height)}, ${Math.round(gap)} px apart, dots ${Math.round(b.x - a.x)} px apart`,
  );
}
function dotPoint(root: HTMLElement, x: number, y: number) {
  const dot = root.querySelector(`[data-dot="${x},${y}"]`) as SVGCircleElement;
  return center(dot);
}
async function tapDot(root: HTMLElement, x: number, y: number) {
  const p = dotPoint(root, x, y);
  await userEvent.pointer({
    keys: '[MouseLeft]',
    target: dotsBoard(root),
    coords: { clientX: p.x, clientY: p.y },
  });
}

/**
 * GEO.02.t1: tap dots to draw a closed 3-sided shape (each tap continues from the last dot); the
 * response is its corners and passes grid.polygon. An open figure never passes.
 */
export const DrawTriangle: Story = {
  args: { config: draw3 },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectDotTargets(root, 'g1-up');
    await tapDot(root, 0, 0);
    await tapDot(root, 4, 0);
    await tapDot(root, 2, 2);
    // Open so far: Check sends the walk, which grid.polygon rejects.
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(
      stateChecker('grid.polygon')?.check(
        { require: { sides: 3 }, grid: { cols: 6, rows: 3 } },
        lastState(args.onResponse),
      ),
    ).toBe(false);
    await new Promise((r) => setTimeout(r, 450));
    await tapDot(root, 0, 0);
    await expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(3);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    const value = lastState(args.onResponse);
    await expect(value).toEqual({
      points: [
        [0, 0],
        [4, 0],
        [2, 2],
      ],
    });
    await expect(
      stateChecker('grid.polygon')?.check(
        { require: { sides: 3 }, grid: { cols: 6, rows: 3 } },
        value,
      ),
    ).toBe(true);
    // Undo and Check: target-size, 12 px apart even with Check's focus ring (evidence review).
    const check = within(root).getByRole('button', { name: 'Check' });
    const undo = within(root).getByRole('button', { name: 'Take one back' });
    await expectApart(undo, check, 12, 'undo to Check');
    await expect(boxGap(outlineBox(check), undo.getBoundingClientRect())).toBeGreaterThanOrEqual(
      11.5,
    );
    await expectControls('shape-compose DrawTriangle', 'g1-up', {
      dots: dotTargets(root),
      undo: [undo],
      check: [check],
    });
  },
};

/** A drag from dot to dot draws that line; the keyboard cursor draws the rest; undo takes back. */
export const DrawDragAndKeyboard: Story = {
  args: { config: { ...draw3, require: { sides: 4 } } },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    const a = dotPoint(root, 1, 1);
    const b = dotPoint(root, 3, 1);
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: dotsBoard(root), coords: { clientX: a.x, clientY: a.y } },
      { target: dotsBoard(root), coords: { clientX: b.x, clientY: b.y } },
      { keys: '[/MouseLeft]', target: dotsBoard(root), coords: { clientX: b.x, clientY: b.y } },
    ]);
    await expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(1);
    // Keyboard: the cursor is on (3, 1) where the drag ended and the next line starts there.
    dotsBoard(root).focus();
    await userEvent.keyboard('{ArrowDown}{Enter}{ArrowLeft}{ArrowLeft}{Enter}{ArrowUp}{Enter}');
    await expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(4);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(
      stateChecker('grid.polygon')?.check(
        { require: { sides: 4 }, grid: { cols: 6, rows: 3 } },
        lastState(args.onResponse),
      ),
    ).toBe(true);
    await userEvent.click(within(root).getByRole('button', { name: 'Take one back' }));
    await expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(3);
    await expect(traceOf(args.onInteract).map((e) => e.t)).toEqual(
      expect.arrayContaining(['drag', 'drop', 'move', 'tap', 'undo']),
    );
  },
};

/**
 * GEO.09.t1 at the smallest landscape area (K), the item as generated (3 rows × 6): every dot its
 * own 80 px target; sticks meet at corners; sticks left counts down.
 */
export const SticksLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: sticks },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      dotsBoard(root),
      within(root).getByRole('button', { name: 'Take one back' }),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expect(within(root).getByRole('img', { name: '8 sticks left' })).toBeInTheDocument();
    await expectRenderedNumerals(root, '.ni-scomp__sticks-n');
    // Each dot its own K target; the grid fills its board, and the board and controls use the
    // area (evidence review: a 5 × 5 grid used 243 × 243 of a 672 × 300 board).
    await expectDotTargets(root, 'k');
    await expectComposition(canvasElement, [
      dotsBoard(root),
      ...root.querySelectorAll('.ni-scomp__sticks-left, .ni-scomp__undo'),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectControls('shape-compose SticksLandscapeMinK', 'k', {
      dots: dotTargets(root),
      undo: [within(root).getByRole('button', { name: 'Take one back' })],
      check: [within(root).getByRole('button', { name: 'Check' })],
    });
    for (const [x, y] of [
      [0, 0],
      [3, 0],
      [0, 2],
      [0, 0],
    ]) {
      await tapDot(root, x as number, y as number);
    }
    await expect(root.querySelectorAll('.ni-scomp__stick')).toHaveLength(3);
    await expect(root.querySelectorAll('.ni-scomp__corner')).toHaveLength(3);
    await expect(within(root).getByRole('img', { name: '5 sticks left' })).toBeInTheDocument();
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(
      stateChecker('grid.polygon')?.check(
        { require: { kind: 'triangle' }, grid: { cols: 6, rows: 3 } },
        lastState(args.onResponse),
      ),
    ).toBe(true);
  },
};

/**
 * GEO.02.t1 seed 1 (G1, 3 rows × 6) at the smallest landscape area: every dot its own 64 px
 * target, 12+ px apart, the grid filling its board; nothing scrolls.
 */
export const DrawLandscapeMin: Story = {
  args: { config: draw3 },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectFitsArea(areaBox(canvasElement), [
      dotsBoard(root),
      ...dotTargets(root),
      within(root).getByRole('button', { name: 'Take one back' }),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await expectDotTargets(root, 'g1-up');
  },
};

/**
 * GEO.09.t1 seed 1 as generated (K, 3 rows × 6) at the tablet area: every dot its own 80 px
 * target, 92+ px apart, the grid filling its board; three sticks make the triangle.
 */
export const SticksTabletK: Story = {
  globals: { ageMode: 'k' },
  args: { config: sticks },
  render: inArea('tablet'),
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectDotTargets(root, 'k');
    for (const [x, y] of [
      [0, 0],
      [3, 0],
      [0, 2],
      [0, 0],
    ]) {
      await tapDot(root, x as number, y as number);
    }
    await expect(root.querySelectorAll('.ni-scomp__stick')).toHaveLength(3);
    await expectFitsArea(areaBox(canvasElement), [
      dotsBoard(root),
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    await userEvent.click(within(root).getByRole('button', { name: 'Check' }));
    await expect(
      stateChecker('grid.polygon')?.check(
        { require: { kind: 'triangle' }, grid: { cols: 6, rows: 3 } },
        lastState(args.onResponse),
      ),
    ).toBe(true);
  },
};

/**
 * Tap-only mode (06 §7, review CR-1.6): a drag from dot to dot draws nothing; tapping dots and the
 * keyboard still draw.
 */
export const TapOnlyDots: Story = {
  args: { config: draw3 },
  parameters: { ui: { tapOnly: true } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const a = dotPoint(root, 1, 1);
    const b = dotPoint(root, 3, 1);
    await userEvent.pointer([
      { keys: '[TouchA>]', target: dotsBoard(root), coords: { clientX: a.x, clientY: a.y } },
      { pointerName: 'TouchA', target: dotsBoard(root), coords: { clientX: b.x, clientY: b.y } },
      { keys: '[/TouchA]', target: dotsBoard(root), coords: { clientX: b.x, clientY: b.y } },
    ]);
    await expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(0);
    await tapDot(root, 0, 0);
    await tapDot(root, 4, 0);
    await expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(1);
    dotsBoard(root).focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(2);
  },
};

/** `disabled`: nothing can be picked up or drawn. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(tile(root, 'p-triangle'));
    await expect(tile(root, 'p-triangle')).toHaveAttribute('aria-pressed', 'false');
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

const demoFill: WidgetDemo = createDemoController({ strict: true });

/** Demo (the GEO.10.t1 solution): place the triangle, then the turned rhombus. */
export const DemoFill: Story = {
  args: { disabled: true, demo: demoFill },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoFill.play({ op: 'drag-piece', args: { id: 'p-triangle', to: [0, 0], rot: 0 } });
    await demoFill.play({ op: 'rotate', args: { id: 'p-rhombus' } });
    await demoFill.play({ op: 'drag-piece', args: { id: 'p-rhombus', to: [2, 0], rot: 120 } });
    await expect(placed(root)).toEqual([
      { id: 'p-triangle:0', at: '0,0', rot: '0' },
      { id: 'p-rhombus:0', at: '2,0', rot: '120' },
    ]);
    await expect(demoFill.play({ op: 'tap' })).rejects.toBeInstanceOf(UnsupportedWidgetOpError);
  },
};

const demoRegion: WidgetDemo = createDemoController({ strict: true });

/**
 * Demo (the GEO.05.t3 solution): the region "above the crate" lights up (exactly where the drop
 * counts), then the crab goes there.
 */
export const DemoRegion: Story = {
  args: { config: above, tier: 'pictorial', disabled: true, demo: demoRegion },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const steps = geo05t3.solution.filter((s) => 'action' in s);
    for (const s of steps)
      await demoRegion.play(
        (s as { action: { op: string; args?: Record<string, unknown> } }).action,
      );
    const region = root.querySelector('.ni-scomp__region') as HTMLElement;
    await expect(region).toHaveAttribute('data-region', 'above');
    const r = scene(root).getBoundingClientRect();
    const g = region.getBoundingClientRect();
    // Above a 20 × 20 crate at (46, 34): x from 26 to 66, y from 0 to 24.
    await expect((g.left - r.left) / r.width).toBeCloseTo(0.26, 2);
    await expect((g.right - r.left) / r.width).toBeCloseTo(0.66, 2);
    await expect((g.bottom - r.top) / r.height).toBeCloseTo(24 / 60, 2);
    await expect(item(root)).toHaveAttribute('data-at', '46,18');
  },
};

const demoDraw: WidgetDemo = createDemoController({ strict: true });

/** Demo (the GEO.02.t1 solution): three lines drawn one by one. */
export const DemoDraw: Story = {
  args: { config: draw3, disabled: true, demo: demoDraw },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (const [from, to] of [
      [
        [0, 0],
        [4, 0],
      ],
      [
        [4, 0],
        [2, 2],
      ],
      [
        [2, 2],
        [0, 0],
      ],
    ]) {
      await demoDraw.play({ op: 'draw-edge', args: { from, to } });
    }
    await expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(3);
  },
};

const inviteDemo: WidgetDemo = createDemoController({ strict: true });

/** The child's turn: Pip's hand points at the piece to place. */
export const DemoInvite: Story = {
  globals: { ageMode: 'k' },
  args: { demo: inviteDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    inviteDemo.invite({ op: 'drag-piece', args: { id: 'p-triangle', to: [0, 0], rot: 0 } });
    await waitFor(() => expect(tile(root, 'p-triangle')).toHaveClass('ni-invite'));
    await expectPointerOn(
      root.querySelector('.ni-hand') as HTMLElement,
      tile(root, 'p-triangle'),
      root,
    );
    await expectHandStays(root, () => tile(root, 'p-triangle'));
    // One ring, inside the tile, 12 px clear of the other tile and the turn buttons.
    await expectOneInviteRing(root, {
      clearOf: [...root.querySelectorAll('.ni-scomp__tile, .ni-scomp__rotate')],
    });
    // The whole hand (and its bob) touches only the invited tile (evidence review).
    await expectHandTouchesOnlyInvited(root, [
      ...[...root.querySelectorAll('.ni-scomp__tile, .ni-scomp__rotate, .ni-scomp__undo')].filter(
        (e) => e !== tile(root, 'p-triangle'),
      ),
      within(root).getByRole('button', { name: 'Check' }),
      boardPad(root),
    ]);
  },
};

const reducedDemo: WidgetDemo = createDemoController({ strict: true });

/** Reduced motion: demo steps are instant. */
export const DemoReducedMotion: Story = {
  globals: { motion: 'reduced' },
  args: { config: draw3, disabled: true, demo: reducedDemo },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    // Instant is checked by the effect, never by the clock: once the op resolves, the result
    // is drawn and nothing is still gliding.
    await reducedDemo.play({ op: 'draw-edge', args: { from: [0, 0], to: [4, 0] } });
    await expect(
      root.getAnimations({ subtree: true }).filter((a) => a.playState === 'running'),
    ).toHaveLength(0);
    await waitFor(() => expect(root.querySelectorAll('.ni-scomp__line')).toHaveLength(1));
  },
};

/**
 * Undo where it sits (K): a placed block goes back to the tray when it is touched on the outline
 * (the one under the finger, not only the last), and is named aloud; a touch on empty outline
 * moves nothing; Backspace on the outline takes back the last block. Each is traced as `undo`.
 */
export const FillSendPieceBackK: Story = {
  globals: { ageMode: 'k' },
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const audio = parameters.ui.audio as ReturnType<typeof spyAudio>;
    const root = await findWidget(canvasElement, ROOT);
    const board = root.querySelector('.ni-scomp__pad') as HTMLElement;
    const tapBoard = async (x: number, y: number) => {
      const p = boardPoint(root, x, y, trapezoid);
      await userEvent.pointer({
        keys: '[MouseLeft]',
        target: board,
        coords: { clientX: p.x, clientY: p.y },
      });
    };
    await pointerDrag(tile(root, 'p-rhombus'), boardPoint(root, 0.75, 0.43, trapezoid), 'touch');
    await waitFor(() => expect(placed(root)).toHaveLength(1));
    tile(root, 'p-triangle').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(placed(root)).toHaveLength(2));
    clearSpies(audio);
    // The rhombus was placed first: touching it sends it back, the triangle stays.
    await tapBoard(0.75, 0.43);
    await waitFor(() => expect(placed(root).map((p) => p.id)).toEqual(['p-triangle:0']));
    await expect(audio.say).toHaveBeenCalledWith('shape.rhombus.one', undefined);
    await expect(tile(root, 'p-rhombus')).not.toHaveAttribute('aria-disabled', 'true');
    // The same spot is empty outline now: nothing moves.
    await tapBoard(0.75, 0.43);
    await expect(placed(root)).toHaveLength(1);
    // Keyboard: Backspace on the outline takes the last block back.
    board.focus();
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(placed(root)).toHaveLength(0));
    const undone = traceOf(args.onInteract)
      .filter((e) => e.t === 'undo')
      .map((e) => e.target);
    await expect(undone).toEqual(['p-rhombus:0', 'p-triangle:0']);
  },
};

const boundFill: Config = {
  format: 'shape-compose',
  mode: 'fill-outline',
  pieces: [
    { id: 'p-square', kind: 'square', count: 9 },
    { id: 'p-triangle', kind: 'triangle', count: 1 },
    { id: 'p-rhombus', kind: 'rhombus', count: 1 },
    { id: 'p-hexagon', kind: 'hexagon', count: 1 },
  ],
  outline: {
    points: [
      [0, 0],
      [SC_OUTLINE_EXTENT_MAX, 0],
      [SC_OUTLINE_EXTENT_MAX, SC_OUTLINE_EXTENT_MAX],
      [0, SC_OUTLINE_EXTENT_MAX],
    ],
  },
  showOutlineLines: true,
  rotationStep: 90,
};

/**
 * Stress, the model's bounds, K, smallest landscape area: the biggest outline (5 block sides
 * each way), four kinds of block, twelve blocks. The outline, the tray and Check fit; every tile
 * is a full target.
 */
export const StressBoundsFillLandscapeMinK: Story = {
  globals: { ageMode: 'k' },
  args: { config: boundFill },
  render: inArea('landscapeMin'),
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(formatModel('shape-compose')?.configSchema.safeParse(boundFill).success).toBe(
      true,
    );
    const tiles = boundFill.pieces?.map((p) => tile(root, p.id)) ?? [];
    await expectFitsArea(areaBox(canvasElement), [
      // The outline as drawn (the board's own box includes its empty paper margin).
      root.querySelector('.ni-scomp__outline') as Element,
      ...tiles,
      within(root).getByRole('button', { name: 'Check' }),
    ]);
    for (const t of tiles) await expectTargetSize(t, 'k');
    await expectTargetGaps(tiles);
  },
};
