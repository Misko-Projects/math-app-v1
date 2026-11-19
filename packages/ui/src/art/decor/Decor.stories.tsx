import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect } from 'storybook/test';
import { type Lighting, PALETTE } from '../../tokens/tokens';
import { CvdCompare, GallerySection } from '../gallery/Gallery';
import { DECOR, DECOR_DESIGN, DECOR_GROUPS, DECOR_IDS, type DecorId, DecorTile } from '.';
import { expectArtInsideCells, expectCellsApart, expectNoSidewaysScroll } from './galleryChecks';

/**
 * Art Gallery: decor (05 §6: flowers, lamps, flags, paths, fountains…). Every piece stands on its
 * own plot in the island's tilted view, drawn at one shared scale, so sizes compare honestly; 2-plot
 * pieces are twice as wide. Lamps and lanterns light up at sunset.
 */

interface DecorArgs {
  id: DecorId;
  lighting: Lighting;
  ground: 'sand' | 'grass';
  scale: number;
}

const name = (id: string) => id.replaceAll('-', ' ');
/** CSS px per scene unit in the sheets. */
const SHEET_SCALE = 1.3;
const TILE_PAD = 16;

const cellStyle = (lighting: Lighting): CSSProperties => ({
  margin: 0,
  display: 'grid',
  justifyItems: 'center',
  alignContent: 'end',
  gap: 6,
  padding: '10px 10px 8px',
  borderRadius: 22,
  background: lighting === 'sunset' ? 'var(--color-horizon)' : 'var(--color-paper)',
  border: '3px solid var(--color-sand-shadow)',
});

function Tile({
  id,
  lighting,
  scale = SHEET_SCALE,
}: {
  id: DecorId;
  lighting: Lighting;
  scale?: number;
}) {
  const w = DECOR_DESIGN[id].footprint[0] * 100 + TILE_PAD;
  return (
    <figure data-cell={id} data-lighting={lighting} style={cellStyle(lighting)}>
      <DecorTile
        id={id}
        lighting={lighting}
        ground={DECOR[id].group === 'beach' ? 'sand' : 'grass'}
        size={Math.round(w * scale)}
        title={name(id)}
      />
      <figcaption className="story-cell__name" style={{ color: 'var(--color-ink)' }}>
        {name(id)}
      </figcaption>
    </figure>
  );
}

function DecorSheet({ lighting }: { lighting: Lighting }) {
  return (
    <div style={{ display: 'grid', gap: 32, width: 'min(1200px, 100%)', margin: '0 auto' }}>
      {DECOR_GROUPS.map((g) => (
        <GallerySection key={g.id} title={g.name}>
          <div
            data-group={g.id}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            {DECOR_IDS.filter((id) => DECOR[id].group === g.id).map((id) => (
              <Tile key={id} id={id} lighting={lighting} />
            ))}
          </div>
        </GallerySection>
      ))}
    </div>
  );
}

async function expectSheet(root: HTMLElement) {
  const tiles = [...root.querySelectorAll<SVGSVGElement>('svg[data-decor-tile]')];
  await expect(tiles.map((t) => t.dataset.decorTile).sort()).toEqual([...DECOR_IDS].sort());
  for (const t of tiles) await expect(t.getAttribute('role')).toBe('img');
  // One scale for all: a 2-plot piece's tile is twice the plot width (plus the same padding).
  const width = (id: DecorId) =>
    (root.querySelector(`svg[data-decor-tile="${id}"]`) as SVGSVGElement).getBoundingClientRect()
      .width;
  await expect(Math.abs(width('bunting') - width('mailbox') - 100 * SHEET_SCALE)).toBeLessThan(2);
  await expectCellsApart(root);
  await expectArtInsideCells(root);
  await expectNoSidewaysScroll();
}

const meta = {
  title: 'Art Gallery/Decor',
  parameters: { ui: { stage: 'padded' } },
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
    const w = DECOR_DESIGN[args.id].footprint[0] * 100 + TILE_PAD;
    return (
      <figure
        data-cell={args.id}
        data-lighting={args.lighting}
        style={{ ...cellStyle(args.lighting), padding: 24, maxWidth: '100%' }}
      >
        <DecorTile
          id={args.id}
          lighting={args.lighting}
          ground={args.ground}
          size={`min(${Math.round(w * args.scale)}px, 86vw)`}
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
    await expectNoSidewaysScroll();
  },
};

/** Every piece by where it comes from (05 §6, §7), at one shared scale, by day. */
export const Sheet: Story = {
  parameters: { controls: { disable: true } },
  render: () => <DecorSheet lighting="day" />,
  play: async ({ canvasElement }) => {
    await expectSheet(canvasElement);
    // By day nothing is lit.
    await expect(canvasElement.querySelectorAll('[data-glow]').length).toBe(0);
  },
};

const LIT: DecorId[] = ['lamp-post', 'lantern-string', 'paper-lanterns', 'moon-lamp'];

/** The same sheet at sunset: the theme warms the ground; lamps and lanterns glow. */
export const Sunset: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div
      data-lighting="sunset"
      style={{ margin: -40, padding: 40, background: 'var(--color-sky)' }}
    >
      <DecorSheet lighting="sunset" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expectSheet(canvasElement);
    for (const id of LIT) {
      const piece = canvasElement.querySelector(`[data-decor="${id}"]`) as SVGGElement;
      await expect(piece.dataset.lit).toBe('true');
      await expect(piece.querySelector('[data-glow="on"]'), `${id} glows`).toBeTruthy();
    }
    const svg = canvasElement.querySelector('svg[data-decor-tile="lamp-post"]') as SVGSVGElement;
    await expect(getComputedStyle(svg).getPropertyValue('--color-ink').trim()).toBe(PALETTE.ink);
  },
};

const CVD_SET: DecorId[] = [
  'tulip-patch',
  'round-bush',
  'flower-pot',
  'beach-umbrella',
  'bunting',
  'rainbow-arch',
];

/**
 * 06 §7 colour-vision check: the most colourful pieces under simulated CVD. Each still reads by
 * shape (cups vs. petals, stripes, pennants, bands with an outline between them).
 */
export const ColourVision: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <CvdCompare col={360}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          justifyContent: 'center',
          alignItems: 'flex-end',
        }}
      >
        {CVD_SET.map((id) => (
          <DecorTile
            key={id}
            id={id}
            ground="grass"
            size={Math.round((DECOR_DESIGN[id].footprint[0] * 100 + TILE_PAD) * 0.72)}
          />
        ))}
      </div>
    </CvdCompare>
  ),
  play: async ({ canvasElement }) => {
    const columns = canvasElement.querySelectorAll('[data-cvd]');
    await expect(columns.length).toBeGreaterThan(3);
    for (const c of columns)
      await expect(c.querySelectorAll('svg[data-decor-tile]').length).toBe(CVD_SET.length);
    await expectNoSidewaysScroll();
  },
};
