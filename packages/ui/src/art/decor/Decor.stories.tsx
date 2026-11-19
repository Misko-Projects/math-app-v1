import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect } from 'storybook/test';
import { CVD_FILTERS } from '../../tokens/cvd';
import { type Lighting, PALETTE } from '../../tokens/tokens';
import { CVD_MATRIX, CvdMatrix } from '../gallery/Gallery';
import {
  DECOR,
  DECOR_DESIGN,
  DECOR_IDS,
  type DecorId,
  DecorSvg,
  DecorTile,
  decorArt,
  decorTileBox,
} from '.';
import {
  expectArtInsideCells,
  expectCellsApart,
  expectOneScreen,
  GALLERY_ROOM,
  GALLERY_VIEWPORT,
} from './galleryChecks';

/**
 * Art Gallery: decor (05 §6: flowers, lamps, flags, paths, fountains…), by where it comes from.
 * Every piece stands on its own plot in the island's tilted view. The sheet pages draw every piece
 * at one shared scale, so sizes compare honestly from page to page; 2-plot pieces are twice as
 * wide. Each page is one tablet screen. Lamps and lanterns light up at sunset.
 */

interface DecorArgs {
  id: DecorId;
  lighting: Lighting;
  ground: 'sand' | 'grass';
  scale: number;
}

const name = (id: string) => id.replaceAll('-', ' ');
const groundOf = (id: DecorId) => (DECOR[id].group === 'beach' ? 'sand' : 'grass');

const tileBox = decorTileBox;

/** One titled run of cards on a page. Its pieces fill `cols` columns; 2-plot pieces span two. */
interface SheetSection {
  title: string;
  /** Where these pieces come from (05 §6, §7). */
  source: string;
  cols: number;
  ids: readonly DecorId[];
}

interface SheetPage {
  key: string;
  sections: readonly SheetSection[];
}

const FROM_BUILDING = 'earned by projects and building levels';

/** The day sheets: every decor piece exactly once, by where it comes from. */
const DAY_PAGES: readonly SheetPage[] = [
  {
    key: 'garden',
    sections: [
      {
        title: 'In the garden',
        source: FROM_BUILDING,
        cols: 5,
        ids: [
          'tulip-patch',
          'daisy-patch',
          'flower-pot',
          'round-bush',
          'rock-pile',
          'stepping-path',
          'picket-fence',
          'shell-bench',
          'mailbox',
          'bird-bath',
        ],
      },
    ],
  },
  {
    key: 'landmarks',
    sections: [
      {
        title: 'Island landmarks',
        source: FROM_BUILDING,
        cols: 4,
        ids: [
          'palm-tree',
          'lamp-post',
          'flag-pole',
          'windmill',
          'garden-arch',
          'swing-bench',
          'fountain',
        ],
      },
    ],
  },
  {
    key: 'beach-and-stars',
    sections: [
      {
        title: 'Beach finds',
        source: 'surprise gifts',
        cols: 5,
        ids: ['beach-umbrella', 'sandcastle', 'tide-pool', 'driftwood-sign', 'kite-stand'],
      },
      {
        title: 'Puzzle Tower stars',
        source: 'rare decor for star shards',
        cols: 5,
        ids: ['sea-glass-mosaic', 'star-statue', 'crystal-tower', 'telescope', 'moon-lamp'],
      },
    ],
  },
  {
    key: 'festivals',
    sections: [
      {
        title: 'Festivals and Storm Watch',
        source: 'earned at festivals; Storm Watch reveals the rainbow',
        cols: 6,
        ids: [
          'lantern-string',
          'bunting',
          'rainbow-arch',
          'picnic-blanket',
          'paper-lanterns',
          'festival-drum',
          'shell-chime',
          'star-balloon',
        ],
      },
    ],
  },
];

const pageIds = (page: SheetPage) => page.sections.flatMap((s) => s.ids);
const span = (id: DecorId) => DECOR_DESIGN[id].footprint[0];
const rowsOf = (s: SheetSection) => Math.ceil(s.ids.reduce((n, id) => n + span(id), 0) / s.cols);
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

const CARD = { border: 3, padTop: 10, padX: 10, padBottom: 8, gap: 6, captionH: 20 } as const;
/** A card's height besides its art: border, padding, the gap and the caption line. */
const CARD_CHROME_H = 2 * CARD.border + CARD.padTop + CARD.padBottom + CARD.gap + CARD.captionH;
const CARD_CHROME_W = 2 * (CARD.border + CARD.padX);
const GRID_GAP = { col: 16, row: 14 } as const;
const HEAD = { h: 28, gap: 10 } as const;
const SECTION_GAP = 18;

/** The tallest tile on a page, in scene units: every card on the page is this tall. */
const pageArtH = (page: SheetPage) => Math.max(...pageIds(page).map((id) => tileBox(id).h));

/** The largest scale at which a page fits GALLERY_ROOM (cards across, rows down). */
function pageScale(page: SheetPage): number {
  let scale = Number.POSITIVE_INFINITY;
  for (const s of page.sections) {
    const colW = (GALLERY_ROOM.w - GRID_GAP.col * (s.cols - 1)) / s.cols;
    for (const id of s.ids) {
      const room = span(id) * colW + (span(id) - 1) * GRID_GAP.col - CARD_CHROME_W;
      scale = Math.min(scale, room / tileBox(id).w);
    }
  }
  const rows = page.sections.map(rowsOf);
  const n = page.sections.length;
  const fixed =
    n * (HEAD.h + HEAD.gap) +
    (n - 1) * SECTION_GAP +
    sum(rows.map((r) => r - 1)) * GRID_GAP.row +
    sum(rows) * CARD_CHROME_H;
  return Math.min(scale, (GALLERY_ROOM.h - fixed) / (sum(rows) * pageArtH(page)));
}

/** CSS px per scene unit on every sheet page: the largest scale at which every page fits. */
const SHEET_SCALE = Math.floor(Math.min(...DAY_PAGES.map(pageScale)) * 100) / 100;

function Card({
  id,
  lighting,
  artH,
}: {
  id: DecorId;
  lighting: Lighting;
  /** The page's art height in CSS px (the tallest tile on the page). */
  artH: number;
}) {
  return (
    <figure
      data-cell={id}
      style={{
        gridColumn: span(id) > 1 ? `span ${span(id)}` : undefined,
        margin: 0,
        display: 'grid',
        gridTemplateRows: `${artH}px ${CARD.captionH}px`,
        gap: CARD.gap,
        justifyItems: 'center',
        padding: `${CARD.padTop}px ${CARD.padX}px ${CARD.padBottom}px`,
        borderRadius: 22,
        border: `${CARD.border}px solid var(--color-sand-deep)`,
        background: lighting === 'sunset' ? 'var(--color-sky-light)' : 'var(--color-paper)',
        boxSizing: 'border-box',
      }}
    >
      <DecorTile
        id={id}
        lighting={lighting}
        ground={groundOf(id)}
        size={tileBox(id).w * SHEET_SCALE}
        title={name(id)}
        style={{ alignSelf: 'end' }}
      />
      <figcaption
        className="story-cell__name"
        style={{ color: 'var(--color-ink)', lineHeight: `${CARD.captionH}px` }}
      >
        {name(id)}
      </figcaption>
    </figure>
  );
}

/**
 * One sheet page: titled sections of equal cards in a grid. Every card on the page has the same
 * height, its tile standing on the card's baseline just above the caption, so plots and captions
 * line up across each row.
 */
function Sheet({ page, lighting }: { page: SheetPage; lighting: Lighting }) {
  const artH = Math.ceil(pageArtH(page) * SHEET_SCALE);
  return (
    <div
      data-sheet={page.key}
      data-scale={SHEET_SCALE}
      style={{
        display: 'grid',
        gap: SECTION_GAP,
        width: `min(${GALLERY_ROOM.w}px, 100%)`,
        margin: '0 auto',
      }}
    >
      {page.sections.map((s) => (
        <section key={s.title} aria-label={s.title} style={{ display: 'grid', gap: HEAD.gap }}>
          <header style={{ display: 'flex', alignItems: 'baseline', gap: 14, height: HEAD.h }}>
            <h2
              className="story-heading"
              style={{ margin: 0, fontSize: '1.35rem', lineHeight: `${HEAD.h}px` }}
            >
              {s.title}
            </h2>
            <p className="story-cell__name" style={{ margin: 0 }}>
              {s.source}
            </p>
          </header>
          <div
            data-section={s.title}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${s.cols}, minmax(0, 1fr))`,
              gridAutoRows: artH + CARD_CHROME_H,
              gap: `${GRID_GAP.row}px ${GRID_GAP.col}px`,
            }}
          >
            {s.ids.map((id) => (
              <Card key={id} id={id} lighting={lighting} artH={artH} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The sunset sky behind a sunset page (the stage's wash, warmed by the sunset palette). */
const sunsetSky: CSSProperties = {
  boxSizing: 'border-box',
  minHeight: '100vh',
  padding: 40,
  display: 'grid',
  placeItems: 'center',
  background:
    'radial-gradient(120% 70% at 50% 0%, var(--color-sky-light) 0%, transparent 60%), linear-gradient(180deg, var(--color-sky) 0%, var(--color-horizon) 100%)',
};

/** The day pages list every registered decor piece exactly once. */
async function expectDayPagesCoverEveryDecor() {
  const shown = DAY_PAGES.flatMap(pageIds);
  await expect(new Set(shown).size, 'no piece is on two day pages').toBe(shown.length);
  await expect([...shown].sort()).toEqual(Object.keys(decorArt).sort());
  await expect([...shown].sort()).toEqual([...DECOR_IDS].sort());
}

/**
 * A sheet page renders exactly its pieces, each a titled image at the shared scale, in a tidy grid:
 * equal cards, art centred and standing on the caption line, captions of a row on one baseline.
 */
async function expectSheet(root: HTMLElement, page: SheetPage, lighting: Lighting) {
  const problems: string[] = [];
  const tiles = [...root.querySelectorAll<SVGSVGElement>('svg[data-decor-tile]')];
  await expect(tiles.map((t) => t.dataset.decorTile).sort()).toEqual([...pageIds(page)].sort());
  for (const t of tiles) {
    const id = t.dataset.decorTile as DecorId;
    const r = t.getBoundingClientRect();
    if (t.getAttribute('role') !== 'img') problems.push(`${id} is not a titled image`);
    if (Math.abs(r.width - tileBox(id).w * SHEET_SCALE) > 0.5) problems.push(`${id} off scale`);
    if (Math.abs(r.height - tileBox(id).h * SHEET_SCALE) > 0.5) problems.push(`${id} off scale`);
    if (lighting === 'sunset' && t.dataset.lighting !== 'sunset') problems.push(`${id} not lit`);
  }
  const cards = [...root.querySelectorAll<HTMLElement>('[data-cell]')];
  const height = (cards[0] as HTMLElement).getBoundingClientRect().height;
  const rows = new Map<number, number[]>();
  for (const card of cards) {
    const id = card.dataset.cell;
    const c = card.getBoundingClientRect();
    const art = (card.querySelector('svg') as SVGSVGElement).getBoundingClientRect();
    const cap = (card.querySelector('figcaption') as HTMLElement).getBoundingClientRect();
    if (Math.abs(c.height - height) > 0.5) problems.push(`${id} card is not the page's height`);
    if (Math.abs(cap.top - art.bottom - CARD.gap) > 1)
      problems.push(`${id} art is not on the line`);
    if (Math.abs(art.left + art.width / 2 - (c.left + c.width / 2)) > 1) {
      problems.push(`${id} art is off-centre`);
    }
    const row = Math.round(c.top);
    rows.set(row, [...(rows.get(row) ?? []), cap.bottom]);
  }
  for (const caps of rows.values()) {
    if (Math.max(...caps) - Math.min(...caps) > 0.5) problems.push('captions off the baseline');
  }
  await expect(problems).toEqual([]);
  await expectCellsApart(root);
  await expectArtInsideCells(root);
  await expectOneScreen();
}

const meta = {
  title: 'Art Gallery/Decor',
  parameters: { ui: { stage: 'centered' }, ...GALLERY_VIEWPORT.parameters },
  globals: GALLERY_VIEWPORT.globals,
  argTypes: {
    id: { control: 'select', options: DECOR_IDS },
    lighting: { control: 'inline-radio', options: ['day', 'sunset'] },
    ground: { control: 'inline-radio', options: ['sand', 'grass'] },
    scale: { control: { type: 'range', min: 1, max: 4, step: 0.25 } },
  },
  args: { id: 'windmill', lighting: 'day', ground: 'grass', scale: 3 },
} satisfies Meta<DecorArgs>;

export default meta;
type Story = StoryObj<Meta<DecorArgs>>;

/** One piece, large: pick it, its lighting and the ground it stands on. */
export const Piece: Story = {
  render: (args) => {
    const box = tileBox(args.id);
    return (
      <figure
        data-cell={args.id}
        data-lighting={args.lighting}
        style={{
          margin: 0,
          display: 'grid',
          justifyItems: 'center',
          gap: 10,
          padding: 24,
          borderRadius: 28,
          border: `${CARD.border}px solid var(--color-sand-deep)`,
          background: args.lighting === 'sunset' ? 'var(--color-sky-light)' : 'var(--color-paper)',
        }}
      >
        <DecorTile
          id={args.id}
          lighting={args.lighting}
          ground={args.ground}
          size={`min(${Math.round(box.w * args.scale)}px, 86vw, calc((100vh - 200px) * ${box.w / box.h}))`}
          title={name(args.id)}
        />
        <figcaption
          className="story-cell__name"
          style={{ color: 'var(--color-ink)', fontSize: '1.1rem' }}
        >
          {name(args.id)} · {DECOR_DESIGN[args.id].footprint.join(' × ')} plot
        </figcaption>
      </figure>
    );
  },
  play: async ({ canvasElement, args }) => {
    const tile = canvasElement.querySelector(`svg[data-decor-tile="${args.id}"]`) as SVGSVGElement;
    await expect(tile.querySelector(`[data-decor="${args.id}"]`)).toBeTruthy();
    await expectArtInsideCells(canvasElement);
    await expectOneScreen();
  },
};

/** A day sheet page: its pieces at the shared scale. By day nothing is lit. */
function dayPage(page: SheetPage): Story {
  return {
    parameters: { controls: { disable: true } },
    render: () => <Sheet page={page} lighting="day" />,
    play: async ({ canvasElement }) => {
      await expectDayPagesCoverEveryDecor();
      await expectSheet(canvasElement, page, 'day');
      await expect(canvasElement.querySelectorAll('[data-glow]').length).toBe(0);
    },
  };
}

/** The pieces that light up at sunset (a glow halo, so lit reads by shape too, 06 §7). */
const LIT: readonly DecorId[] = [
  'lamp-post',
  'lantern-string',
  'paper-lanterns',
  'moon-lamp',
  'star-statue',
  'crystal-tower',
];

/** The same page at sunset: the theme warms the sky and the ground; lamps and lanterns glow. */
function sunsetPage(page: SheetPage): Story {
  return {
    parameters: { controls: { disable: true }, ui: { stage: 'flush' } },
    render: () => (
      <div data-lighting="sunset" style={sunsetSky}>
        <Sheet page={page} lighting="sunset" />
      </div>
    ),
    play: async ({ canvasElement }) => {
      await expectSheet(canvasElement, page, 'sunset');
      const lit = LIT.filter((id) => pageIds(page).includes(id));
      for (const id of lit) {
        const piece = canvasElement.querySelector(`[data-decor="${id}"]`) as SVGGElement;
        await expect(piece.dataset.lit).toBe('true');
        await expect(piece.querySelector('[data-glow="on"]'), `${id} glows`).toBeTruthy();
      }
      await expect(
        canvasElement.querySelectorAll('[data-glow="on"]').length,
      ).toBeGreaterThanOrEqual(lit.length);
      // Ink keeps its day value at sunset (06 §7 contrast); only the environment warms.
      const svg = canvasElement.querySelector('svg[data-decor-tile]') as SVGSVGElement;
      await expect(getComputedStyle(svg).getPropertyValue('--color-ink').trim()).toBe(PALETTE.ink);
    },
  };
}

const page = (key: string) => DAY_PAGES.find((p) => p.key === key) as SheetPage;

/** Flowers, bushes, paths and fences from projects and building levels. */
export const ByDayGarden: Story = dayPage(page('garden'));
/** The tall pieces from projects and building levels, and the 2 × 2 fountain. */
export const ByDayLandmarks: Story = dayPage(page('landmarks'));
/** Beach finds (gifts and surprises) and the Puzzle Tower's star-shard decor. */
export const ByDayBeachAndStars: Story = dayPage(page('beach-and-stars'));
/** Festival decor and Storm Watch's rainbow. */
export const ByDayFestivals: Story = dayPage(page('festivals'));
export const AtSunsetGarden: Story = sunsetPage(page('garden'));
export const AtSunsetLandmarks: Story = sunsetPage(page('landmarks'));
export const AtSunsetBeachAndStars: Story = sunsetPage(page('beach-and-stars'));
export const AtSunsetFestivals: Story = sunsetPage(page('festivals'));

/** The most colourful pieces: the ones the colour-vision matrix shows. */
const CVD_SET: readonly DecorId[] = [
  'tulip-patch',
  'round-bush',
  'flower-pot',
  'beach-umbrella',
  'bunting',
  'rainbow-arch',
];
const CVD_TITLE = { h: 24, gap: 10 } as const;
/** CSS px per scene unit in the matrix: the largest at which its five rows fit GALLERY_ROOM. */
const CVD_SCALE = (() => {
  const rows = CVD_FILTERS.length;
  const fixed =
    CVD_TITLE.h +
    CVD_TITLE.gap +
    2 * (CVD_MATRIX.pad + CVD_MATRIX.border) +
    CVD_MATRIX.headH +
    rows * CVD_MATRIX.gap.row;
  const artH = Math.max(...CVD_SET.map((id) => DECOR_DESIGN[id].viewBox.h));
  return Math.floor(((GALLERY_ROOM.h - fixed) / (rows * artH)) * 100) / 100;
})();
const CVD_COL_MIN = 120;

/**
 * 06 §7 colour-vision check: the most colourful pieces (columns) under each simulation (rows).
 * Each still reads by shape: cups vs. petals, stripes, pennants, bands with an outline between.
 */
export const ColourVision: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <section aria-label="Decor under colour-vision simulations">
      <h2
        className="story-heading"
        style={{
          margin: `0 0 ${CVD_TITLE.gap}px`,
          fontSize: '1.25rem',
          lineHeight: `${CVD_TITLE.h}px`,
        }}
      >
        The most colourful decor under colour-vision simulations
      </h2>
      <CvdMatrix
        columns={CVD_SET.map((id) => ({
          key: id,
          label: name(id),
          width: Math.max(CVD_COL_MIN, DECOR_DESIGN[id].viewBox.w * CVD_SCALE),
        }))}
        cell={(id) => (
          <DecorSvg
            id={id as DecorId}
            size={DECOR_DESIGN[id as DecorId].viewBox.w * CVD_SCALE}
            title={name(id)}
          />
        )}
      />
    </section>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-col]').length).toBe(CVD_SET.length);
    for (const f of CVD_FILTERS) {
      const row = canvasElement.querySelector(`[data-cvd-row="${f.id}"]`) as HTMLElement;
      await expect(row.textContent).toContain(f.name);
      const art = [...row.querySelectorAll<SVGSVGElement>('svg[data-decor-art]')];
      await expect(art.map((s) => s.dataset.decorArt)).toEqual([...CVD_SET]);
      // Large enough to judge: a 1-plot piece is at least 100 px wide, a 2-plot one twice that.
      for (const s of art) {
        const w = DECOR_DESIGN[s.dataset.decorArt as DecorId].footprint[0] * 100;
        await expect(s.getBoundingClientRect().width).toBeGreaterThanOrEqual(w);
      }
    }
    await expectOneScreen();
  },
};
