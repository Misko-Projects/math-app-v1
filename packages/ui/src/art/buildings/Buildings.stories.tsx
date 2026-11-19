import type { Plot } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect } from 'storybook/test';
import type { Lighting } from '../../tokens/tokens';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import { BUILDING_STAGES, type BuildingStage } from '../core/types';
import { CvdCompare } from '../gallery/Gallery';
import { SAMPLE_ISLAND } from '../gallery/sampleIsland';
import { ISLAND_LAYOUT, landPlots, plotKey, SCENE_H, SCENE_W } from '../island/geometry';
import { IslandScene } from '../island/IslandScene';
import { buildingArt, PlacedBuilding } from './BuildingArt';
import { BUILDING_DESIGN, BUILDING_IDS, type BuildingArtId, COAST_BUILDINGS } from './design';

/**
 * Art Gallery: the buildings (05 §4, §6, §11). Every workshop, home, the Storehouse and the shared
 * projects, under construction and at levels 1–3, by day and at sunset. All are drawn at one scale
 * (scene units: a plot is 100 × 70), so the sheets show their true sizes side by side.
 */

/** Gallery captions (story-only labels; children's words live in narration YAML). */
const NAMES: Record<BuildingArtId, string> = {
  'road-crew': 'Road Crew',
  'lantern-grove': 'Lantern Grove',
  'ten-boat-dock': 'Ten-Boat Dock',
  'treasure-beach': 'Treasure Beach',
  'brick-factory': 'Brick Factory',
  'garden-terraces': 'Garden Terraces',
  bakery: 'Bakery',
  market: 'Market',
  'clock-tower': 'Clock Tower & Ferry',
  'builders-yard': "Builder's Yard",
  'weigh-station': 'Weigh Station & Lookout',
  'rhythm-orchard': 'Rhythm Orchard',
  'puzzle-tower': 'Puzzle Tower',
  'practice-pier': 'Practice Pier',
  storehouse: 'Storehouse',
  'shell-cottage': 'Shell Cottage',
  'driftwood-hut': 'Driftwood Hut',
  'burrow-house': 'Burrow House',
  'reef-house': 'Reef House',
  lighthouse: 'Lighthouse',
  'east-bridge': 'Bridge to East Beach',
  'festival-stage': 'Festival Stage',
};

const stageName = (s: BuildingStage) =>
  s === 'construction' ? 'Under construction' : `Level ${s}`;

interface BuildingArgs {
  id: BuildingArtId;
  stage: BuildingStage;
  lighting: Lighting;
}

/** The stage control's options (string keys, so they also work as URL args). */
const STAGE_OF = {
  construction: 'construction',
  'level-1': 1,
  'level-2': 2,
  'level-3': 3,
} as const satisfies Record<string, BuildingStage>;

interface StoryArgs {
  id: BuildingArtId;
  stage: keyof typeof STAGE_OF;
  lighting: Lighting;
}

/**
 * The sheets: every building × every stage, split into pages that each fit one tablet screen
 * (1280 × 800, less the story stage's 40 px padding) with no scrolling. A page draws all its
 * buildings at one scale, so relative sizes on a page are true; the island story shows them all
 * together at the map's scale.
 */
interface SheetPage {
  /** Story-name suffix. */
  key: string;
  /** Building cards across. */
  cols: 1 | 2;
  ids: readonly BuildingArtId[];
}

const SHEET_PAGES: readonly SheetPage[] = [
  {
    key: 'workshops-a',
    cols: 2,
    ids: [
      'road-crew',
      'lantern-grove',
      'treasure-beach',
      'brick-factory',
      'garden-terraces',
      'bakery',
    ],
  },
  {
    key: 'workshops-b',
    cols: 2,
    ids: [
      'market',
      'builders-yard',
      'weigh-station',
      'rhythm-orchard',
      'clock-tower',
      'puzzle-tower',
    ],
  },
  { key: 'on-the-water', cols: 1, ids: ['ten-boat-dock', 'practice-pier', 'east-bridge'] },
  { key: 'storehouse-and-projects', cols: 2, ids: ['storehouse', 'lighthouse', 'festival-stage'] },
  { key: 'homes', cols: 2, ids: ['shell-cottage', 'driftwood-hut', 'burrow-house', 'reef-house'] },
];

/** The room a page lays out in: the tablet screen less the story stage's padding. */
const PAGE_ROOM = { w: 1200, h: 720 } as const;
/** A card's fixed height besides its art: border, padding, title and stage captions. */
const CARD_CHROME_H = 88;
const CARD_PAD = 12;
const CARD_BORDER = 3;
const CARD_GAP = { col: 20, row: 14 } as const;
const TILE_GAP = 8;

function rowsOf<T>(items: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** The largest scale (≤ 1, in 0.01 steps) at which a page fits PAGE_ROOM. */
function pageScale(page: SheetPage, stages: number): number {
  const cardInner =
    (PAGE_ROOM.w - CARD_GAP.col * (page.cols - 1)) / page.cols - 2 * (CARD_PAD + CARD_BORDER);
  const byWidth = Math.min(
    ...page.ids.map(
      (id) => (cardInner - TILE_GAP * (stages - 1)) / (stages * BUILDING_DESIGN[id].viewBox.w),
    ),
  );
  const rows = rowsOf(page.ids, page.cols);
  const artH = rows.reduce(
    (sum, row) => sum + Math.max(...row.map((id) => BUILDING_DESIGN[id].viewBox.h)),
    0,
  );
  const byHeight =
    (PAGE_ROOM.h - CARD_GAP.row * (rows.length - 1) - rows.length * CARD_CHROME_H) / artH;
  return Math.floor(Math.min(1, byWidth, byHeight) * 100) / 100;
}

function BuildingTile({
  id,
  stage,
  lighting,
  scale,
}: BuildingArgs & {
  scale: number;
}) {
  const Art = buildingArt[id];
  if (!Art) return null;
  const vb = BUILDING_DESIGN[id].viewBox;
  return (
    <Art
      stage={stage}
      lighting={lighting}
      size={vb.w * scale}
      style={{ position: 'relative' }}
      title={`${NAMES[id]}, ${stageName(stage)}`}
    />
  );
}

/** One building at a large scale on its footprint (a grassy plot), for the controls. */
function BuildingView({ id, stage, lighting }: BuildingArgs) {
  const d = BUILDING_DESIGN[id];
  const vb = d.viewBox;
  const scale = Math.min(3, 640 / vb.w, 560 / vb.h);
  const fw = d.footprint[0] * ISLAND_LAYOUT.cellW;
  const fh = d.footprint[1] * ISLAND_LAYOUT.cellH;
  const box: CSSProperties = { position: 'relative', width: vb.w * scale };
  return (
    <figure style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: 16 }}>
      <div style={box} data-lighting={lighting}>
        <ArtSvg
          width={vb.w}
          height={vb.h}
          originX={vb.x}
          originY={vb.y}
          size={vb.w * scale}
          style={{ position: 'absolute', inset: 0 }}
        >
          <rect
            x={-fw / 2}
            y={-fh}
            width={fw}
            height={fh}
            rx={10}
            fill={paint('leaf-light')}
            stroke={paint('leaf-deep')}
            strokeWidth={2}
            opacity={0.7}
            data-part="footprint"
          />
        </ArtSvg>
        <BuildingTile id={id} stage={stage} lighting={lighting} scale={scale} />
      </div>
      <figcaption className="story-cell__name">
        {NAMES[id]} · {stageName(stage)}
      </figcaption>
    </figure>
  );
}

/**
 * One sheet page: a card per building, its name on top and its stages in equal columns whose art
 * is centred and bottom-aligned (captions share a baseline). Every tile is drawn at the page scale.
 */
function Sheet({
  page,
  lighting,
  stages = BUILDING_STAGES,
}: {
  page: SheetPage;
  lighting: Lighting;
  stages?: readonly BuildingStage[];
}) {
  const scale = pageScale(page, stages.length);
  return (
    <div
      data-sheet={lighting}
      data-page={page.key}
      data-scale={scale}
      data-lighting={lighting === 'sunset' ? 'sunset' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${page.cols}, minmax(0, 1fr))`,
        gap: `${CARD_GAP.row}px ${CARD_GAP.col}px`,
        width: `min(${PAGE_ROOM.w}px, 100%)`,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {page.ids.map((id) => (
        <section
          key={id}
          aria-label={NAMES[id]}
          data-group={id}
          style={{
            display: 'grid',
            gridTemplateRows: 'auto 1fr',
            gap: 6,
            padding: CARD_PAD,
            borderRadius: 24,
            border: `${CARD_BORDER}px solid var(--color-sand-deep)`,
            background: 'var(--color-paper)',
            boxSizing: 'border-box',
          }}
        >
          <h2
            className="story-heading"
            style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.2, textAlign: 'left' }}
            data-title={id}
          >
            {NAMES[id]}
          </h2>
          <div
            data-row={id}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
              gap: TILE_GAP,
              alignItems: 'end',
            }}
          >
            {stages.map((s) => (
              <figure
                key={String(s)}
                className="story-cell"
                style={{ margin: 0, gap: 4, justifyContent: 'flex-end' }}
              >
                <BuildingTile id={id} stage={s} lighting={lighting} scale={scale} />
                <figcaption className="story-cell__name" style={{ fontSize: '0.8rem' }}>
                  {stageName(s)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Every building at level 3 in one screen (no captions: each drawing is a titled image), all at
 * one scale: the reduced-motion check and a side-by-side view of the finished town.
 */
const LINEUP_COLS = 6;
const LINEUP_GAP = 12;
function lineupScale(): number {
  const colW = (PAGE_ROOM.w - LINEUP_GAP * (LINEUP_COLS - 1)) / LINEUP_COLS;
  const byWidth = Math.min(...BUILDING_IDS.map((id) => colW / BUILDING_DESIGN[id].viewBox.w));
  const rows = rowsOf(BUILDING_IDS, LINEUP_COLS);
  const artH = rows.reduce(
    (sum, row) => sum + Math.max(...row.map((id) => BUILDING_DESIGN[id].viewBox.h)),
    0,
  );
  const byHeight = (PAGE_ROOM.h - LINEUP_GAP * (rows.length - 1)) / artH;
  return Math.floor(Math.min(1, byWidth, byHeight) * 100) / 100;
}

function Lineup({ lighting, stage }: { lighting: Lighting; stage: BuildingStage }) {
  const scale = lineupScale();
  return (
    <div
      data-lineup={lighting}
      data-lighting={lighting === 'sunset' ? 'sunset' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${LINEUP_COLS}, minmax(0, 1fr))`,
        gap: LINEUP_GAP,
        alignItems: 'end',
        justifyItems: 'center',
        width: `min(${PAGE_ROOM.w}px, 100%)`,
        margin: '0 auto',
      }}
    >
      {BUILDING_IDS.map((id) => (
        <BuildingTile key={id} id={id} stage={stage} lighting={lighting} scale={scale} />
      ))}
    </div>
  );
}

/** One consistent card layout: each card's title is at its left edge and its captions share a baseline. */
async function expectSheetLayout(root: HTMLElement) {
  const problems: string[] = [];
  for (const card of root.querySelectorAll<HTMLElement>('[data-group]')) {
    const id = card.dataset.group;
    const title = card.querySelector('[data-title]') as HTMLElement;
    const row = card.querySelector('[data-row]') as HTMLElement;
    if (Math.abs(title.getBoundingClientRect().left - row.getBoundingClientRect().left) > 0.5) {
      problems.push(`${id} title is not at the card's left edge`);
    }
    const caps = [...row.querySelectorAll('figcaption')].map((c) => c.getBoundingClientRect());
    const base = (caps[0] as DOMRect).bottom;
    if (caps.some((c) => Math.abs(c.bottom - base) > 0.5)) {
      problems.push(`${id} captions do not share a baseline`);
    }
    // Art is centred in its column, and stays inside its card.
    const c = card.getBoundingClientRect();
    for (const fig of row.querySelectorAll('figure')) {
      const f = fig.getBoundingClientRect();
      const a = (fig.querySelector('svg') as SVGSVGElement).getBoundingClientRect();
      if (Math.abs(a.left + a.width / 2 - (f.left + f.width / 2)) > 1) {
        problems.push(`${id} art is off-centre`);
      }
      if (a.left < c.left || a.right > c.right || a.top < c.top || a.bottom > c.bottom) {
        problems.push(`${id} art spills out of its card`);
      }
    }
  }
  await expect(problems).toEqual([]);
}

/** The pages list every building exactly once. */
async function expectPagesCoverEveryBuilding() {
  const listed = SHEET_PAGES.flatMap((p) => p.ids);
  await expect([...listed].sort()).toEqual([...BUILDING_IDS].sort());
}

const meta = {
  title: 'Art Gallery/Buildings',
  parameters: { ui: { stage: 'padded' } },
  argTypes: {
    id: { control: 'select', options: BUILDING_IDS },
    stage: {
      control: 'select',
      options: Object.keys(STAGE_OF),
    },
    lighting: { control: 'inline-radio', options: ['day', 'sunset'] },
  },
  args: { id: 'bakery', stage: 'level-2', lighting: 'day' },
  render: (args) => (
    <BuildingView id={args.id} stage={STAGE_OF[args.stage]} lighting={args.lighting} />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

async function expectNoSidewaysScroll() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

/**
 * The on-screen boxes of a building's drawing, leaving out idle effects (smoke) that may drift
 * outside. A group holding an effect is split into its children.
 */
function drawnRects(el: Element): DOMRect[] {
  if (el.getAttribute('data-part') === 'fx') return [];
  if (el.querySelector('[data-part="fx"]')) return [...el.children].flatMap(drawnRects);
  return [el.getBoundingClientRect()];
}

/** Every building's art stays inside its own art box (nothing clipped or spilling onto a neighbour). */
async function expectArtInsideBoxes(root: HTMLElement) {
  const problems: string[] = [];
  const svgs = [...root.querySelectorAll<SVGSVGElement>('svg[data-building]')];
  await expect(svgs.length).toBeGreaterThan(0);
  for (const svg of svgs) {
    const box = svg.getBoundingClientRect();
    const art = svg.querySelector('[data-part="art"]') as SVGGElement;
    const label = `${svg.dataset.building} ${svg.dataset.stage}`;
    for (const r of drawnRects(art)) {
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < box.left - 1) problems.push(`${label} spills left`);
      if (r.right > box.right + 1) problems.push(`${label} spills right`);
      if (r.top < box.top - 1) problems.push(`${label} spills above`);
      if (r.bottom > box.bottom + 1) problems.push(`${label} spills below`);
    }
  }
  await expect([...new Set(problems)]).toEqual([]);
}

/** No two tiles on a sheet overlap. */
async function expectNoOverlap(root: HTMLElement) {
  const svgs = [...root.querySelectorAll<SVGSVGElement>('svg[data-building]')];
  const boxes = svgs.map((s) => s.getBoundingClientRect());
  const problems: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i] as DOMRect;
      const b = boxes[j] as DOMRect;
      const overlap =
        a.left < b.right - 0.5 &&
        b.left < a.right - 0.5 &&
        a.top < b.bottom - 0.5 &&
        b.top < a.bottom - 0.5;
      if (overlap) {
        problems.push(
          `${svgs[i]?.dataset.building} ${svgs[i]?.dataset.stage} × ${svgs[j]?.dataset.building} ${svgs[j]?.dataset.stage}`,
        );
      }
    }
  }
  await expect(problems).toEqual([]);
}

/** Every building on a page renders every stage at the page scale. */
async function expectEveryBuilding(root: HTMLElement, page: SheetPage, lighting: Lighting) {
  const problems: string[] = [];
  const sheet = root.querySelector<HTMLElement>('[data-sheet]');
  const scale = Number(sheet?.dataset.scale);
  if (!(scale > 0)) problems.push('the sheet has no scale');
  for (const id of page.ids) {
    for (const s of BUILDING_STAGES) {
      const label = `${id} ${String(s)}`;
      const svg = root.querySelector<SVGSVGElement>(
        `svg[data-building="${id}"][data-stage="${String(s)}"]`,
      );
      if (!svg) {
        problems.push(`${label} missing`);
        continue;
      }
      if (svg.getAttribute('role') !== 'img') problems.push(`${label} is not a titled image`);
      if (lighting === 'sunset' && svg.getAttribute('data-lighting') !== 'sunset') {
        problems.push(`${label} is not lit for sunset`);
      }
      const vbw = BUILDING_DESIGN[id].viewBox.w;
      if (Math.abs(svg.getBoundingClientRect().width - vbw * scale) > 0.5) {
        problems.push(`${label} is not at the page scale`);
      }
      if (!svg.querySelector('[data-part="art"] *')) problems.push(`${label} draws nothing`);
    }
  }
  await expect(problems).toEqual([]);
}

/** One building with state controls: pick the building, its stage and the lighting. */
export const Building: Story = {
  play: async ({ canvasElement, args }) => {
    const svg = canvasElement.querySelector('svg[data-building]') as SVGSVGElement;
    await expect(svg.dataset.building).toBe(args.id);
    await expect(svg.dataset.stage).toBe(String(STAGE_OF[args.stage]));
    await expectArtInsideBoxes(canvasElement);
    await expectNoSidewaysScroll();
  },
};

/** A sheet page by day: its buildings under construction and at levels 1–3. */
function dayPage(page: SheetPage): Story {
  return {
    parameters: { controls: { disable: true }, ui: { stage: 'centered' } },
    render: () => <Sheet page={page} lighting="day" />,
    play: async ({ canvasElement }) => {
      await expectPagesCoverEveryBuilding();
      await expectEveryBuilding(canvasElement, page, 'day');
      // Construction sites carry a scaffold and a sign; built levels never do.
      const unfinished = page.ids.filter((id) => {
        const site = canvasElement.querySelector(
          `svg[data-building="${id}"][data-stage="construction"]`,
        );
        const l1 = canvasElement.querySelector(`svg[data-building="${id}"][data-stage="1"]`);
        return (
          !site?.querySelector('[data-part="scaffold"]') ||
          !site.querySelector('[data-part="sign"]') ||
          l1?.querySelector('[data-part="scaffold"]')
        );
      });
      await expect(unfinished).toEqual([]);
      await expectArtInsideBoxes(canvasElement);
      await expectNoOverlap(canvasElement);
      await expectSheetLayout(canvasElement);
      await expectNoSidewaysScroll();
    },
  };
}

/** A sheet page at sunset: the theme warms the land and sea, and windows and lanterns glow. */
function sunsetPage(page: SheetPage): Story {
  return {
    parameters: { controls: { disable: true }, ui: { stage: 'centered' } },
    render: () => <Sheet page={page} lighting="sunset" />,
    play: async ({ canvasElement }) => {
      await expectPagesCoverEveryBuilding();
      await expectEveryBuilding(canvasElement, page, 'sunset');
      // Glow is a shape (a halo), not only a colour (06 §7): every window and lantern turns into
      // a glowing halo, so none is left unlit.
      await expect(canvasElement.querySelectorAll('[data-part="glow"]').length).toBeGreaterThan(0);
      await expect(canvasElement.querySelectorAll('[data-part="window"]').length).toBe(0);
      await expect(canvasElement.querySelectorAll('[data-part="lantern"]').length).toBe(0);
      await expectArtInsideBoxes(canvasElement);
      await expectNoOverlap(canvasElement);
      await expectSheetLayout(canvasElement);
      await expectNoSidewaysScroll();
    },
  };
}

const page = (key: string) => SHEET_PAGES.find((p) => p.key === key) as SheetPage;

export const ByDayWorkshopsA: Story = dayPage(page('workshops-a'));
export const ByDayWorkshopsB: Story = dayPage(page('workshops-b'));
export const ByDayOnTheWater: Story = dayPage(page('on-the-water'));
export const ByDayStorehouseAndProjects: Story = dayPage(page('storehouse-and-projects'));
export const ByDayHomes: Story = dayPage(page('homes'));
export const AtSunsetWorkshopsA: Story = sunsetPage(page('workshops-a'));
export const AtSunsetWorkshopsB: Story = sunsetPage(page('workshops-b'));
export const AtSunsetOnTheWater: Story = sunsetPage(page('on-the-water'));
export const AtSunsetStorehouseAndProjects: Story = sunsetPage(page('storehouse-and-projects'));
export const AtSunsetHomes: Story = sunsetPage(page('homes'));

/** Where each building sits, front rows drawn last, so nearer buildings overlap farther ones. */
const TOWN: readonly { id: BuildingArtId; plot: Plot; stage: BuildingStage }[] = [
  { id: 'lighthouse', plot: [2, 0], stage: 3 },
  { id: 'lantern-grove', plot: [4, 0], stage: 2 },
  { id: 'puzzle-tower', plot: [6, 0], stage: 2 },
  { id: 'storehouse', plot: [7, 0], stage: 2 },
  { id: 'rhythm-orchard', plot: [9, 0], stage: 1 },
  { id: 'reef-house', plot: [11, 1], stage: 1 },
  { id: 'brick-factory', plot: [2, 2], stage: 1 },
  { id: 'shell-cottage', plot: [9, 2], stage: 1 },
  { id: 'treasure-beach', plot: [10, 2], stage: 2 },
  { id: 'burrow-house', plot: [9, 3], stage: 2 },
  { id: 'practice-pier', plot: [10, 3], stage: 1 },
  { id: 'builders-yard', plot: [0, 3], stage: 1 },
  { id: 'weigh-station', plot: [2, 4], stage: 1 },
  { id: 'garden-terraces', plot: [9, 4], stage: 2 },
  { id: 'clock-tower', plot: [2, 5], stage: 1 },
  { id: 'festival-stage', plot: [3, 5], stage: 1 },
  { id: 'bakery', plot: [5, 5], stage: 2 },
  { id: 'market', plot: [7, 5], stage: 1 },
  { id: 'road-crew', plot: [5, 6], stage: 'construction' },
  { id: 'east-bridge', plot: [8, 6], stage: 2 },
  { id: 'ten-boat-dock', plot: [3, 7], stage: 1 },
  { id: 'driftwood-hut', plot: [6, 7], stage: 2 },
];

const TOWN_ISLAND = SAMPLE_ISLAND;

function bottomRow(t: (typeof TOWN)[number]) {
  return t.plot[1] + BUILDING_DESIGN[t.id].footprint[1];
}

function footprintPlots(t: (typeof TOWN)[number]): Plot[] {
  const [w, h] = BUILDING_DESIGN[t.id].footprint;
  const out: Plot[] = [];
  for (let dx = 0; dx < w; dx++)
    for (let dy = 0; dy < h; dy++) out.push([t.plot[0] + dx, t.plot[1] + dy]);
  return out;
}

/** The buildings on the island map, placed with plotBox(plot, footprint) by the hub's helper. */
export const OnTheIsland: Story = {
  parameters: { ui: { stage: 'flush' } },
  args: { lighting: 'day' },
  argTypes: { id: { table: { disable: true } }, stage: { table: { disable: true } } },
  render: (args) => (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: `min(100vw, calc(100vh * ${SCENE_W / SCENE_H}))` }}>
        <IslandScene
          island={TOWN_ISLAND}
          ringsUnlocked={TOWN_ISLAND.rings.length}
          roadLength={12}
          lighting={args.lighting}
          title="The island town"
        >
          {[...TOWN]
            .sort((a, b) => bottomRow(a) - bottomRow(b) || a.plot[0] - b.plot[0])
            .map((t) => (
              <PlacedBuilding key={t.id} {...t} lighting={args.lighting} />
            ))}
        </IslandScene>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const placed = [...canvasElement.querySelectorAll<SVGGElement>('g[data-building]')];
    await expect(placed.length).toBe(TOWN.length);
    const land = new Set(landPlots(TOWN_ISLAND, TOWN_ISLAND.rings.length).map(plotKey));
    const taken = new Set<string>();
    for (const t of TOWN) {
      const plots = footprintPlots(t);
      for (const p of plots) {
        await expect(taken.has(plotKey(p)), `${t.id} overlaps another building`).toBe(false);
        taken.add(plotKey(p));
      }
      if (COAST_BUILDINGS.includes(t.id)) {
        // On the coast: the footprint or the plots just in front of it touch the sea.
        const below = plots.map((p): Plot => [p[0], p[1] + 1]);
        const wet = [...plots, ...below].some((p) => !land.has(plotKey(p)));
        await expect(wet, `${t.id} sits on the coast`).toBe(true);
        await expect(land.has(plotKey(t.plot)), `${t.id} starts on land`).toBe(true);
      } else {
        for (const p of plots) await expect(land.has(plotKey(p)), `${t.id} on land`).toBe(true);
      }
    }
    await expectNoSidewaysScroll();
  },
};

/**
 * Buildings beside the next stone (05 §3: buildings sit beside numbered stones; 05 §11: nothing
 * hides a road stone). The road ends at 20, so 21 (on plot 7,5) is next. A bakery stands right in
 * front of it and a tall puzzle tower at its front left, both drawn nearer. The stone stays on top
 * and readable, and its tap target takes the tap everywhere over the stone, roofs included.
 */
const NEXT_BESIDE: readonly { id: BuildingArtId; plot: Plot; stage: BuildingStage }[] = [
  { id: 'puzzle-tower', plot: [6, 6], stage: 2 },
  { id: 'bakery', plot: [7, 6], stage: 3 },
];
const NEXT_BESIDE_ROAD = 20;

export const BesideTheNextStone: Story = {
  parameters: { ui: { stage: 'flush' } },
  args: { lighting: 'day' },
  argTypes: { id: { table: { disable: true } }, stage: { table: { disable: true } } },
  render: (args) => (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: `min(100vw, calc(100vh * ${SCENE_W / SCENE_H}))` }}>
        <IslandScene
          island={TOWN_ISLAND}
          ringsUnlocked={TOWN_ISLAND.rings.length}
          roadLength={NEXT_BESIDE_ROAD}
          lighting={args.lighting}
          title="Buildings beside the next stone"
        >
          {NEXT_BESIDE.map((t) => (
            <PlacedBuilding key={t.id} {...t} lighting={args.lighting} />
          ))}
        </IslandScene>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const next = NEXT_BESIDE_ROAD + 1;
    const stone = canvasElement.querySelector(
      `[data-stone="${next}"][data-state="next"]`,
    ) as SVGGElement | null;
    await expect(stone, 'the next stone is a full numbered stone').not.toBeNull();
    const hit = canvasElement.querySelector('[data-hit="next"]') as SVGElement;
    await expect(hit).not.toBeNull();
    // Each building stands on land, on a plot touching the next stone's own plot.
    const spot = TOWN_ISLAND.road.find((s) => s.n === next)?.plot as Plot;
    const land = new Set(landPlots(TOWN_ISLAND, TOWN_ISLAND.rings.length).map(plotKey));
    for (const t of NEXT_BESIDE) {
      const plots = footprintPlots(t);
      for (const p of plots) await expect(land.has(plotKey(p)), `${t.id} on land`).toBe(true);
      const beside = plots.some(
        (p) => Math.max(Math.abs(p[0] - spot[0]), Math.abs(p[1] - spot[1])) === 1,
      );
      await expect(beside, `${t.id} beside stone ${next}`).toBe(true);
    }
    // Readable: the stone (and its numeral) is drawn after, so above, every building.
    const numeral = stone?.querySelector('text') as SVGTextElement;
    for (const b of canvasElement.querySelectorAll('g[data-building]')) {
      const after = b.compareDocumentPosition(numeral) & Node.DOCUMENT_POSITION_FOLLOWING;
      await expect(after, `stone ${next} above ${b.getAttribute('data-building')}`).toBeTruthy();
    }
    // Tappable: across the stone, the topmost element is its tap target, not a roof.
    const r = (stone as SVGGElement).getBoundingClientRect();
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.2, 0.5],
      [0.8, 0.5],
      [0.5, 0.2],
      [0.5, 0.8],
    ] as const) {
      const top = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      await expect(top, `tap at ${fx}, ${fy} of stone ${next}`).toBe(hit);
    }
    await expectNoSidewaysScroll();
  },
};

/**
 * 06 §7 colour-vision check: stages differ by silhouette (scaffold, wings, towers, flags), and the
 * sunset glow is a halo shape, so they stay distinct in every column.
 */
export const ColourVision: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <CvdCompare col={330}>
      <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          {BUILDING_STAGES.map((s) => (
            <BuildingTile
              key={String(s)}
              id="shell-cottage"
              stage={s}
              lighting="day"
              scale={0.45}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          {([1, 3] as const).map((s) => (
            <BuildingTile key={s} id="bakery" stage={s} lighting="day" scale={0.45} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <BuildingTile id="lantern-grove" stage={2} lighting="day" scale={0.45} />
          <BuildingTile id="lantern-grove" stage={2} lighting="sunset" scale={0.45} />
        </div>
      </div>
    </CvdCompare>
  ),
};

/** 06 §7: with reduced motion no idle loop runs (smoke, flags, boats, lanterns, stars). */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true }, ui: { stage: 'centered' } },
  globals: { motion: 'reduced' },
  render: () => <Lineup lighting="sunset" stage={3} />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.motion-loop').length).toBeGreaterThan(50);
    const running = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
    await expect(running.length).toBe(0);
  },
};
