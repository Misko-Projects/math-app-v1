import type { Plot } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect } from 'storybook/test';
import { CVD_FILTERS } from '../../tokens/cvd';
import type { Lighting } from '../../tokens/tokens';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import { BUILDING_STAGES, type BuildingStage } from '../core/types';
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

/**
 * Scene units kept free above a building in the single-building view, for rising smoke: puffs
 * start above some chimneys and drift up 70 more.
 */
const FX_HEADROOM = 110;

/** The effects sweep: every building at level 3 in an 8-wide grid, each view in a 128 × 170 room. */
const FX_GRID_COLS = 8;
const FX_ROOM = { w: 128, h: 170 } as const;

/**
 * One building on its footprint (a grassy plot), for the controls: as large as fits `room` (CSS
 * px), with FX_HEADROOM kept free above it.
 */
function BuildingView({
  id,
  stage,
  lighting,
  room = { w: 640, h: 560 },
}: BuildingArgs & { room?: { w: number; h: number } }) {
  const d = BUILDING_DESIGN[id];
  const vb = d.viewBox;
  // Room above the art for idle effects that rise out of it (smoke drifts up to 70 units).
  const scale = Math.min(3, room.w / vb.w, room.h / (vb.h + FX_HEADROOM));
  const fw = d.footprint[0] * ISLAND_LAYOUT.cellW;
  const fh = d.footprint[1] * ISLAND_LAYOUT.cellH;
  const box: CSSProperties = {
    position: 'relative',
    width: vb.w * scale,
    marginTop: FX_HEADROOM * scale,
  };
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
    await expectEffectsOnPage(svg);
    await expectNoSidewaysScroll();
  },
};

/** Every building's idle effects stay on the page (see effectsOffPage). */
async function expectEffectsOnPageForAll(root: HTMLElement) {
  const problems: string[] = [];
  for (const svg of root.querySelectorAll<SVGSVGElement>('svg[data-building]')) {
    problems.push(...(await effectsOffPage(svg)));
  }
  await expect(problems).toEqual([]);
}

/**
 * Idle effects (smoke, flags, sparkles) stay inside the building's own view through their whole
 * loop: every loop is stepped through eight phases and no visible shape may rise above the view
 * (its reserved headroom included) or leave the page at the sides (review s_02c13a977f91 #1:
 * bakery smoke rising off the canvas).
 */
async function effectsOffPage(svg: SVGSVGElement): Promise<string[]> {
  const problems: string[] = [];
  const anims = svg.getAnimations({ subtree: true });
  for (const a of anims) a.pause();
  const view = (svg.closest('figure') ?? svg).getBoundingClientRect();
  const pageW = document.documentElement.scrollWidth;
  for (let k = 0; k < 8; k++) {
    for (const a of anims) {
      const dur = Number(a.effect?.getComputedTiming().duration) || 0;
      a.currentTime = (dur * k) / 8;
    }
    for (const el of svg.querySelectorAll<SVGGraphicsElement>('circle, path, rect, ellipse')) {
      if (Number(getComputedStyle(el).opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const left = r.left + window.scrollX;
      if (r.top < view.top - 0.5 || left < -0.5 || left + r.width > pageW + 0.5) {
        problems.push(`${svg.dataset.building} ${svg.dataset.stage}: leaves its view at ${k}/8`);
        break;
      }
    }
  }
  for (const a of anims) a.play();
  return [...new Set(problems)];
}

async function expectEffectsOnPage(svg: SVGSVGElement) {
  await expect(await effectsOffPage(svg)).toEqual([]);
}

/** Every building at level 3 in the single-building view: idle effects stay on the page. */
export const EffectsStayOnPage: Story = {
  parameters: { controls: { disable: true }, ui: { stage: 'centered' } },
  render: () => (
    <div
      data-effects-grid
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${FX_GRID_COLS}, ${FX_ROOM.w}px)`,
        width: 'max-content',
        gap: '8px 8px',
        alignItems: 'end',
        justifyContent: 'center',
      }}
    >
      {BUILDING_IDS.map((id) => (
        <BuildingView key={id} id={id} stage={3} lighting="day" room={FX_ROOM} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expectEffectsOnPageForAll(canvasElement);
    // One screen (review s_10a4c0889357 #1): the whole sweep fits the tablet room.
    const grid = canvasElement.querySelector('[data-effects-grid]') as HTMLElement;
    await expect(grid.getBoundingClientRect().height).toBeLessThanOrEqual(PAGE_ROOM.h);
    await expect(grid.getBoundingClientRect().width).toBeLessThanOrEqual(PAGE_ROOM.w);
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

/** A building placed on the island map: its footprint's top-left plot and its stage. */
interface Placed {
  id: BuildingArtId;
  plot: Plot;
  stage: BuildingStage;
}

/**
 * The island town by day (05 §3): the road runs through the middle, the tall landmarks stand along
 * the back, workshops sit either side, and the dock, pier and clock tower's ferry open onto the
 * sea from coast plots. Every building has room of its own and keeps clear of the road.
 */
const TOWN: readonly Placed[] = [
  { id: 'lighthouse', plot: [2, 0], stage: 3 },
  { id: 'lantern-grove', plot: [5, 0], stage: 2 },
  { id: 'rhythm-orchard', plot: [8, 0], stage: 1 },
  { id: 'shell-cottage', plot: [10, 1], stage: 1 },
  { id: 'festival-stage', plot: [1, 2], stage: 1 },
  { id: 'driftwood-hut', plot: [11, 2], stage: 3 },
  { id: 'garden-terraces', plot: [9, 3], stage: 2 },
  { id: 'clock-tower', plot: [2, 5], stage: 1 },
  { id: 'practice-pier', plot: [9, 6], stage: 2 },
  { id: 'ten-boat-dock', plot: [4, 7], stage: 2 },
];

/**
 * The rest of the town at sunset: the other workshops, the Storehouse and the bridge, laid out
 * round the same road, so together with TOWN every building but the homes stands on the island.
 */
const REST_OF_TOWN: readonly Placed[] = [
  { id: 'weigh-station', plot: [2, 1], stage: 2 },
  { id: 'puzzle-tower', plot: [5, 0], stage: 2 },
  { id: 'bakery', plot: [7, 1], stage: 1 },
  { id: 'brick-factory', plot: [9, 0], stage: 1 },
  { id: 'builders-yard', plot: [1, 2], stage: 1 },
  { id: 'storehouse', plot: [9, 3], stage: 2 },
  { id: 'road-crew', plot: [2, 5], stage: 2 },
  { id: 'east-bridge', plot: [8, 6], stage: 2 },
  { id: 'market', plot: [3, 7], stage: 1 },
  { id: 'treasure-beach', plot: [5, 7], stage: 1 },
];

const HOMES: readonly BuildingArtId[] = [
  'shell-cottage',
  'driftwood-hut',
  'burrow-house',
  'reef-house',
];

const TOWN_ISLAND = SAMPLE_ISLAND;
const TOWN_ROAD = 12;

/**
 * Room kept between a building's drawing and the road (stones and trail), in scene units: about
 * 8 CSS px when the map fills a 1280 × 800 tablet screen (05 §11: nothing hides a road stone).
 */
const ROAD_CLEARANCE = 9;

function bottomRow(t: Placed) {
  return t.plot[1] + BUILDING_DESIGN[t.id].footprint[1];
}

function footprintPlots(t: Placed): Plot[] {
  const [w, h] = BUILDING_DESIGN[t.id].footprint;
  const out: Plot[] = [];
  for (let dx = 0; dx < w; dx++)
    for (let dy = 0; dy < h; dy++) out.push([t.plot[0] + dx, t.plot[1] + dy]);
  return out;
}

/** The island with buildings on it, scaled to fit the screen whole (no scrolling). */
function IslandTown({
  town,
  roadLength,
  lighting,
  title,
}: {
  town: readonly Placed[];
  roadLength: number;
  lighting: Lighting;
  title: string;
}) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: `min(100vw, calc(100vh * ${SCENE_W / SCENE_H}))` }}>
        <IslandScene
          island={TOWN_ISLAND}
          ringsUnlocked={TOWN_ISLAND.rings.length}
          roadLength={roadLength}
          lighting={lighting}
          title={title}
        >
          {/* Back rows first, so nearer buildings are drawn over farther ones. */}
          {[...town]
            .sort((a, b) => bottomRow(a) - bottomRow(b) || a.plot[0] - b.plot[0])
            .map((t) => (
              <PlacedBuilding key={t.id} {...t} lighting={lighting} />
            ))}
        </IslandScene>
      </div>
    </div>
  );
}

interface SceneBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** The gap between two boxes (0 when they touch or overlap). */
function gapBetween(a: SceneBox, b: SceneBox): number {
  const dx = Math.max(a.l - b.r, b.l - a.r, 0);
  const dy = Math.max(a.t - b.b, b.t - a.b, 0);
  return Math.hypot(dx, dy);
}

function intersects(a: SceneBox, b: SceneBox): boolean {
  return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
}

/** Converts on-screen boxes into the island's scene units. */
function sceneUnits(scene: Element): (r: DOMRect) => SceneBox {
  const m = (scene.querySelector('[data-layer="on-island"]') as SVGGElement).getScreenCTM();
  if (!m) throw new Error('the island layer has no screen transform');
  return (r) => ({
    l: (r.left - m.e) / m.a,
    t: (r.top - m.f) / m.d,
    r: (r.right - m.e) / m.a,
    b: (r.bottom - m.f) / m.d,
  });
}

/** How opaque an element is drawn, its groups' opacity included (up to `top`). */
function drawnOpacity(el: Element, top: Element): number {
  let o = 1;
  for (let n: Element | null = el; n && n !== top; n = n.parentElement) {
    o *= Number(getComputedStyle(n).opacity);
  }
  return o;
}

/**
 * Everything each placed building draws, in scene units, over its whole idle loop: every shape
 * (roofs, flags, smoke puffs, boats, the water) as the box it sweeps while visible. Running
 * animations are paused and stepped through their loops, then resumed.
 */
function buildingShapes(scene: Element): Map<string, SceneBox[]> {
  const toScene = sceneUnits(scene);
  const groups = [...scene.querySelectorAll('g[data-building]')];
  const anims = document.getAnimations().filter((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target;
    return target ? groups.some((g) => g.contains(target)) : false;
  });
  const saved = anims.map((a) => ({ a, time: a.currentTime, running: a.playState === 'running' }));
  for (const a of anims) a.pause();
  const swept = new Map<Element, SceneBox>();
  const owner = new Map<Element, string>();
  const STEPS = 16;
  try {
    for (let k = 0; k < STEPS; k++) {
      for (const a of anims) {
        const d = Number(a.effect?.getComputedTiming().duration) || 0;
        a.currentTime = (k / STEPS) * d;
      }
      for (const g of groups) {
        for (const el of g.querySelectorAll('*')) {
          if (el.children.length > 0 || drawnOpacity(el, g) < 0.05) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const s = toScene(r);
          const was = swept.get(el);
          swept.set(
            el,
            was
              ? {
                  l: Math.min(was.l, s.l),
                  t: Math.min(was.t, s.t),
                  r: Math.max(was.r, s.r),
                  b: Math.max(was.b, s.b),
                }
              : s,
          );
          owner.set(el, `${g.getAttribute('data-building')}`);
        }
      }
    }
  } finally {
    for (const { a, time, running } of saved) {
      a.currentTime = time;
      if (running) a.play();
    }
  }
  const out = new Map<string, SceneBox[]>();
  for (const [el, box] of swept) {
    const id = owner.get(el) as string;
    out.set(id, [...(out.get(id) ?? []), box]);
  }
  return out;
}

/** The whole box of a building's drawing (every shape, effects included). */
function outerBox(shapes: readonly SceneBox[]): SceneBox {
  return shapes.reduce((a, s) => ({
    l: Math.min(a.l, s.l),
    t: Math.min(a.t, s.t),
    r: Math.max(a.r, s.r),
    b: Math.max(a.b, s.b),
  }));
}

/**
 * The road as drawn, in scene units: every stone, bead, pin and signpost as its box, and the trail
 * as discs (its stroke's half-width) every few units along its centre line.
 */
function roadMarks(scene: Element): {
  boxes: SceneBox[];
  discs: { x: number; y: number; r: number }[];
} {
  const toScene = sceneUnits(scene);
  const layer = scene.querySelector('[data-layer="road"]') as SVGGElement;
  const boxes = [...layer.children]
    .filter((c) => c.tagName.toLowerCase() !== 'path')
    .map((c) => toScene(c.getBoundingClientRect()));
  const discs: { x: number; y: number; r: number }[] = [];
  for (const p of layer.querySelectorAll<SVGPathElement>(':scope > path')) {
    const r = Number(p.getAttribute('stroke-width')) / 2;
    const len = p.getTotalLength();
    for (let s = 0; s <= len; s += 4) {
      const pt = p.getPointAtLength(s);
      discs.push({ x: pt.x, y: pt.y, r });
    }
  }
  return { boxes, discs };
}

/**
 * The town reads cleanly: no two buildings' drawings (effects included, over their whole loop)
 * overlap, and no building comes within ROAD_CLEARANCE of a road stone or the trail.
 */
async function expectTownClear(scene: Element, count: number) {
  const shapes = buildingShapes(scene);
  await expect(shapes.size, 'every building draws something').toBe(count);
  const road = roadMarks(scene);
  await expect(road.boxes.length).toBeGreaterThan(0);
  await expect(road.discs.length).toBeGreaterThan(0);
  const problems: string[] = [];
  const outer = [...shapes].map(([id, s]) => ({ id, box: outerBox(s) }));
  for (let i = 0; i < outer.length; i++) {
    for (let j = i + 1; j < outer.length; j++) {
      const a = outer[i] as (typeof outer)[number];
      const b = outer[j] as (typeof outer)[number];
      if (intersects(a.box, b.box)) problems.push(`${a.id} overlaps ${b.id}`);
    }
  }
  for (const [id, list] of shapes) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const s of list) {
      for (const b of road.boxes) nearest = Math.min(nearest, gapBetween(s, b));
      for (const d of road.discs) {
        const dx = Math.max(s.l - d.x, d.x - s.r, 0);
        const dy = Math.max(s.t - d.y, d.y - s.b, 0);
        nearest = Math.min(nearest, Math.hypot(dx, dy) - d.r);
      }
    }
    if (nearest < ROAD_CLEARANCE)
      problems.push(`${id} is ${nearest.toFixed(1)} units from the road`);
  }
  await expect(problems).toEqual([]);
}

/**
 * Each building of a town has its own plots on land; a coast building's water opens onto the sea
 * (its footprint, or the plots just in front of it, touch the sea).
 */
async function expectTownPlots(town: readonly Placed[]) {
  const land = new Set(landPlots(TOWN_ISLAND, TOWN_ISLAND.rings.length).map(plotKey));
  const taken = new Set<string>();
  for (const t of town) {
    const plots = footprintPlots(t);
    for (const p of plots) {
      await expect(taken.has(plotKey(p)), `${t.id} overlaps another building`).toBe(false);
      taken.add(plotKey(p));
    }
    if (COAST_BUILDINGS.includes(t.id)) {
      const below = plots.map((p): Plot => [p[0], p[1] + 1]);
      const wet = [...plots, ...below].some((p) => !land.has(plotKey(p)));
      await expect(wet, `${t.id} sits on the coast`).toBe(true);
      await expect(land.has(plotKey(t.plot)), `${t.id} starts on land`).toBe(true);
    } else {
      for (const p of plots) await expect(land.has(plotKey(p)), `${t.id} on land`).toBe(true);
    }
  }
}

const islandStory: Pick<Story, 'parameters' | 'argTypes'> = {
  parameters: { ui: { stage: 'flush' } },
  argTypes: { id: { table: { disable: true } }, stage: { table: { disable: true } } },
};

/**
 * The buildings on the island map, placed with plotBox(plot, footprint) by the hub's helper: each
 * on plots of its own, clear of its neighbours and of the road, the water buildings on the coast.
 */
export const OnTheIsland: Story = {
  ...islandStory,
  args: { lighting: 'day' },
  render: (args) => (
    <IslandTown
      town={TOWN}
      roadLength={TOWN_ROAD}
      lighting={args.lighting}
      title="The island town"
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('g[data-building]').length).toBe(TOWN.length);
    await expectTownPlots(TOWN);
    await expectTownClear(canvasElement, TOWN.length);
    await expectNoSidewaysScroll();
  },
};

/** The rest of the town at sunset, round the same road: windows and lanterns lit. */
export const TheRestOfTheTownAtSunset: Story = {
  ...islandStory,
  args: { lighting: 'sunset' },
  render: (args) => (
    <IslandTown
      town={REST_OF_TOWN}
      roadLength={TOWN_ROAD}
      lighting={args.lighting}
      title="The rest of the island town at sunset"
    />
  ),
  play: async ({ canvasElement }) => {
    // The two island stories together show every building but the homes, each once.
    const shown = [...TOWN, ...REST_OF_TOWN].map((t) => t.id).filter((id) => !HOMES.includes(id));
    await expect(new Set(shown).size).toBe(shown.length);
    await expect([...shown].sort()).toEqual(
      BUILDING_IDS.filter((id) => !HOMES.includes(id)).sort(),
    );
    await expect(canvasElement.querySelectorAll('g[data-building]').length).toBe(
      REST_OF_TOWN.length,
    );
    await expectTownPlots(REST_OF_TOWN);
    await expectTownClear(canvasElement, REST_OF_TOWN.length);
    await expectNoSidewaysScroll();
  },
};

/**
 * Buildings beside the next stone (05 §3: buildings sit beside numbered stones; 05 §11: nothing
 * hides a road stone). The road ends at 20, so 21 (on plot 7,5) is next. A market stands at its
 * front left and a cottage is going up right in front of it, both low enough to leave every
 * stone, the trail and the next stone's ring clear. The stone stays on top and readable, and its
 * tap target takes the tap everywhere over the stone.
 */
const NEXT_BESIDE: readonly Placed[] = [
  { id: 'market', plot: [5, 6], stage: 1 },
  { id: 'shell-cottage', plot: [7, 6], stage: 'construction' },
];
const NEXT_BESIDE_ROAD = 20;

export const BesideTheNextStone: Story = {
  ...islandStory,
  args: { lighting: 'day' },
  render: (args) => (
    <IslandTown
      town={NEXT_BESIDE}
      roadLength={NEXT_BESIDE_ROAD}
      lighting={args.lighting}
      title="Buildings beside the next stone"
    />
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
    // Clear: no building (smoke and flags included) covers or crowds any stone or the trail.
    await expectTownClear(canvasElement, NEXT_BESIDE.length);
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

/** The building the colour-vision matrix shows, and its scale (fits 4 rows in one tablet screen). */
const CVD_BUILDING: BuildingArtId = 'lantern-grove';
const CVD_SCALE = 0.62;
const CVD_LABEL_W = 150;

/**
 * 06 §7 colour-vision check: one building's four stages (rows) under each simulation (columns).
 * Stages differ by silhouette (a roped plot; two trees and a cart; a third tree and a lamp post; a
 * treehouse and bunting), never by colour alone, so every column still reads all four.
 */
export const ColourVision: Story = {
  parameters: { controls: { disable: true }, ui: { stage: 'centered' } },
  render: () => (
    <section aria-label={`${NAMES[CVD_BUILDING]} under colour-vision simulations`}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        {CVD_FILTERS.filter((f) => f.matrix).map((f) => (
          <filter key={f.id} id={`art-cvd-${f.id}`}>
            <feColorMatrix type="matrix" values={f.matrix as string} />
          </filter>
        ))}
      </svg>
      <h2 className="story-heading" style={{ margin: '0 0 12px', fontSize: '1.3rem' }}>
        {NAMES[CVD_BUILDING]}: every stage under colour-vision simulations
      </h2>
      <div
        data-cvd-matrix
        style={{
          display: 'grid',
          gridTemplateColumns: `${CVD_LABEL_W}px repeat(${CVD_FILTERS.length}, minmax(0, 1fr))`,
          gap: 8,
          alignItems: 'end',
          justifyItems: 'center',
          width: `min(${PAGE_ROOM.w}px, 100%)`,
          padding: CARD_PAD,
          borderRadius: 24,
          border: `${CARD_BORDER}px solid var(--color-sand-deep)`,
          background: 'var(--color-paper)',
          boxSizing: 'border-box',
        }}
      >
        <span />
        {CVD_FILTERS.map((f) => (
          <span key={f.id} className="story-cell__name" data-col={f.id}>
            {f.name}
          </span>
        ))}
        {BUILDING_STAGES.map((s) => (
          <div key={String(s)} style={{ display: 'contents' }} data-cvd-row={String(s)}>
            <span
              className="story-cell__name"
              style={{ justifySelf: 'start', alignSelf: 'center', textAlign: 'left' }}
            >
              {stageName(s)}
            </span>
            {CVD_FILTERS.map((f) => (
              <div
                key={f.id}
                data-cvd={f.id}
                style={{ filter: f.matrix ? `url(#art-cvd-${f.id})` : undefined }}
              >
                <BuildingTile id={CVD_BUILDING} stage={s} lighting="day" scale={CVD_SCALE} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  ),
  play: async ({ canvasElement }) => {
    // Every stage under every simulation, each at least 120 px wide.
    for (const s of BUILDING_STAGES) {
      const row = [
        ...canvasElement.querySelectorAll<SVGSVGElement>(
          `[data-cvd-row="${String(s)}"] svg[data-building="${CVD_BUILDING}"]`,
        ),
      ];
      await expect(row.length).toBe(CVD_FILTERS.length);
      for (const svg of row) {
        await expect(svg.dataset.stage).toBe(String(s));
        await expect(svg.getBoundingClientRect().width).toBeGreaterThanOrEqual(120);
      }
    }
    // Stages differ by shape: each adds parts the one before lacks.
    const parts = (s: BuildingStage) =>
      canvasElement.querySelectorAll(
        `[data-cvd="none"] svg[data-stage="${String(s)}"] [data-part="art"] *`,
      ).length;
    await expect(parts(2)).toBeGreaterThan(parts(1));
    await expect(parts(3)).toBeGreaterThan(parts(2));
    await expectArtInsideBoxes(canvasElement);
    await expectNoSidewaysScroll();
  },
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
