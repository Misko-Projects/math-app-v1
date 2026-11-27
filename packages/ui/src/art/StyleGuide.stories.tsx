import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { expect } from 'storybook/test';
import {
  type Lighting,
  litColor,
  PALETTE,
  type PaletteColor,
  SUNSET_PALETTE,
} from '../tokens/tokens';
import { ArtSvg } from './core/ArtSvg';
import { ART_CONTRAST_PAIRS, pairRatio } from './core/contrast';
import { OUTLINE_OF, paint, STROKE } from './core/paint';
import { ContactShadow, Highlight } from './core/Shading';
import { RoadStone } from './island/RoadStone';
import { TerrainTile } from './island/TerrainTile';

/**
 * Art Gallery: the style guide (05 §1, §11; 06 §7). The rules every art component follows, shown
 * with the real tokens and components, so the guide cannot drift from the art.
 */
const meta = {
  title: 'Art Gallery/Style guide',
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const page: CSSProperties = {
  display: 'grid',
  gap: 36,
  width: 'min(1120px, 100%)',
  margin: '0 auto',
  color: 'var(--color-ink)',
  fontFamily: 'var(--font-body)',
  fontSize: 17,
  lineHeight: 1.5,
};

const card: CSSProperties = {
  display: 'grid',
  gap: 14,
  padding: 24,
  borderRadius: 28,
  background: 'var(--color-paper)',
  border: '3px solid var(--color-sand-deep)',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={card}>
      <h2 className="story-heading" style={{ margin: 0 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The art fills and the outline shade each one uses (05 §11). */
const ART_FILLS: PaletteColor[] = [
  'sea',
  'shallows',
  'sky',
  'sand',
  'pebble',
  'coral',
  'sun',
  'sunshine',
  'leaf',
  'leaf-light',
  'wood',
  'cloud',
];

function FillSwatch({ fill }: { fill: PaletteColor }) {
  const edge = OUTLINE_OF[fill];
  return (
    <figure
      data-swatch={fill}
      style={{ margin: 0, display: 'grid', gap: 6, justifyItems: 'center', width: 138 }}
    >
      <ArtSvg width={96} height={72} size={96}>
        <ContactShadow cx={48} cy={64} rx={34} ry={6} />
        <rect
          x={10}
          y={8}
          width={76}
          height={52}
          rx={18}
          fill={paint(fill)}
          stroke={paint(edge)}
          strokeWidth={STROKE.outline}
        />
        <Highlight d="M20 26q2 -10 14 -10h10q-14 2 -16 12z" />
      </ArtSvg>
      {/* One token per line, never broken (nowrap): the fill, then its outline. */}
      <figcaption style={{ fontSize: 14, textAlign: 'center', whiteSpace: 'nowrap' }}>
        <strong>{fill}</strong>
        <br />
        <span style={{ color: 'var(--color-ink-soft)' }}>↳ {edge}</span>
      </figcaption>
    </figure>
  );
}

const ART_PAIRS = ART_CONTRAST_PAIRS;

function ContrastTable() {
  return (
    <table style={{ borderCollapse: 'separate', borderSpacing: '0 6px', width: '100%' }}>
      <thead>
        <tr style={{ textAlign: 'left' }}>
          <th>Use</th>
          <th>Pair</th>
          <th>Needs</th>
          <th>Day</th>
          <th>Sunset</th>
        </tr>
      </thead>
      <tbody>
        {ART_PAIRS.map((p) => (
          <tr key={p.use} data-pair={p.use}>
            <td>{p.use}</td>
            <td>
              {p.fg} on {p.bg}
            </td>
            <td>≥ {p.min}:1</td>
            {(['day', 'sunset'] as const).map((l) => {
              const ratio = pairRatio(p, l);
              return (
                <td key={l} data-lighting-ratio={l} data-ratio={ratio.toFixed(2)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {/* The pair as the art draws it: a mark in fg on a bg tile (06 §7 reads the
                        mark, not text, for 3:1 pairs). The ratio itself is ink on paper. */}
                    <svg width="44" height="30" viewBox="0 0 44 30" aria-hidden="true">
                      <rect
                        x="1.5"
                        y="1.5"
                        width="41"
                        height="27"
                        rx="8"
                        fill={litColor(p.bg, l)}
                        stroke={PALETTE['ink-soft']}
                        strokeWidth="1.5"
                      />
                      <ellipse
                        cx="22"
                        cy="15"
                        rx="12"
                        ry="7.5"
                        fill="none"
                        stroke={litColor(p.fg, l)}
                        strokeWidth="4"
                      />
                    </svg>
                    <strong>
                      {ratio.toFixed(1)}:1 {ratio >= p.min ? '✓ pass' : '✗ fails'}
                    </strong>
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LightingStrip({ lighting }: { lighting: Lighting }) {
  const names = Object.keys(SUNSET_PALETTE) as (keyof typeof SUNSET_PALETTE)[];
  return (
    // A balanced grid: 14 swatches as two full rows of 7, never a lone orphan.
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.ceil(names.length / 2)}, minmax(0, 1fr))`,
        gap: 8,
      }}
      data-lighting={lighting}
      data-strip={lighting}
    >
      {names.map((n) => (
        <div key={n} style={{ display: 'grid', gap: 4, fontSize: 13, whiteSpace: 'nowrap' }}>
          <div
            style={{
              height: 44,
              borderRadius: 12,
              background: `var(--color-${n})`,
              border: '2px solid rgb(38 70 83 / 0.2)',
            }}
          />
          <span>{n}</span>
        </div>
      ))}
    </div>
  );
}

const MOTION_ROWS: [string, string][] = [
  ['Sea', 'Wave rows drift slowly in opposite directions; glints sparkle; the foam line breathes.'],
  ['Sky', 'Clouds drift. The sky is the fixed backdrop: it never moves when the camera pans.'],
  ['Parallax', 'When the camera pans, the far sea lags behind the near sea and the island.'],
  [
    'Road',
    'The next stone hops inside a dashed ring that pulses in size (never fading); the counted stone lifts and sparkles.',
  ],
  ['Flags and smoke', 'Flags flutter (--animate-flutter); chimneys puff (--animate-smoke).'],
  ['Characters', 'Idle bob, blink and sway (--animate-bob, --animate-blink, --animate-sway).'],
  [
    'Reduced motion (06 §7)',
    'Every loop stops, parallax is off (the sea moves together with the island) and transitions become ≤ 150 ms fades.',
  ],
];

/** The art style guide (05 §11). */
export const StyleGuide: Story = {
  render: () => (
    <div style={page}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            lineHeight: 1.1,
          }}
        >
          Number Island art
        </h1>
        <p style={{ margin: 0, maxWidth: 760 }}>
          Cozy flat vector: soft rounded shapes, 2–3 px outlines in a darker shade of the fill, one
          soft highlight and a contact shadow. No gradients beyond gentle sky and sea washes. All
          art is SVG React components in <code>packages/ui/src/art</code>, painted only with the
          design tokens, so day and sunset share one palette.
        </p>
      </header>

      <Section title="Fills and outlines">
        <p style={{ margin: 0 }}>
          Every fill outlines in the shade listed under it (<code>OUTLINE_OF</code>), never black.
          The highlight sits top-left (light comes from the top-left); the shadow is a flat ink oval
          at 18% opacity.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {ART_FILLS.map((f) => (
            <FillSwatch key={f} fill={f} />
          ))}
        </div>
      </Section>

      <Section title="Shape language">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
          <RoadStone n={7} size={140} title="A laid road stone" />
          <TerrainTile kind="meadow" size={190} title="A meadow tile" />
          <ul style={{ margin: 0, paddingLeft: 22, listStyle: 'disc', maxWidth: 520 }}>
            <li>Rounded everything: corners, joins and line caps.</li>
            <li>Outline {STROKE.outline} px at design size; inner detail lines 2–2.5 px.</li>
            <li>One highlight (cloud at about 40%) and one contact shadow per object.</li>
            <li>Shapes are a little irregular (no two stones look stamped), never jagged.</li>
            <li>The island is drawn as one landmass with a side face that shows the tilt.</li>
          </ul>
        </div>
      </Section>

      <Section title="Lighting: day and sunset">
        <p style={{ margin: 0 }}>
          A scene marked <code>data-lighting="sunset"</code> warms only the environment colours.
          Ink, pebble, paper and cloud never change, so numerals and controls keep their contrast.
        </p>
        <strong>Day</strong>
        <LightingStrip lighting="day" />
        <strong>Sunset</strong>
        <LightingStrip lighting="sunset" />
      </Section>

      <Section title="Numerals, rings and icons: contrast (06 §7)">
        <p style={{ margin: 0 }}>
          Numerals and controls need ≥ 4.5:1 and icons, rings and outlines ≥ 3:1, by day and at
          sunset. Numerals use Baloo 2 ExtraBold; math numerals are ≥ 32 px.
        </p>
        <ContrastTable />
      </Section>

      <Section title="State without colour alone (06 §7)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'end' }}>
          {(['laid', 'next', 'counting', 'planned'] as const).map((s) => (
            <figure key={s} style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: 4 }}>
              <RoadStone n={12} state={s} size={100} title={`${s} stone`} />
              <figcaption style={{ fontSize: 14 }}>{s}</figcaption>
            </figure>
          ))}
        </div>
        <p style={{ margin: 0 }}>
          Laid: solid stone and shadow. Next: dashed outline, pulsing dashed ring, hops. Counting:
          lifted, solid ring, sparkle. Planned: flat, dashed, no shadow. Each tenth stone is larger
          and flies a flag: leaf green for a ten, coral with a dot for a hundred. Where the road is
          crowded, stones are small beads: a ten or a hundred there carries its number on a signpost
          that flies the same flag, and the next and counted stones stand beside the road as full
          stones, pinned to their place. See the Island → Colour vision story for every state under
          simulated colour-vision deficiencies.
        </p>
      </Section>

      <Section title="Motion">
        <table style={{ borderCollapse: 'separate', borderSpacing: '0 6px' }}>
          <tbody>
            {MOTION_ROWS.map(([k, v]) => (
              <tr key={k}>
                <th style={{ textAlign: 'left', paddingRight: 16, verticalAlign: 'top' }}>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Typography">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 56 }}>
            0 1 2 3 4 5 6 7 8 9
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 24 }}>
            Andika for child text: a g (single-storey)
          </span>
        </div>
      </Section>

      <Section title="Originality (05 §1)">
        <ul style={{ margin: 0, paddingLeft: 22, listStyle: 'disc' }}>
          <li>
            Everything is original: no characters, names, art or music from existing games or shows.
          </li>
          <li>
            Pebblings are sea and shore critters whose shell or back holds pebbles in a 2 × 5
            ten-frame. They are never stacked blocks with faces (Numberblocks) and never DragonBox
            Nooms.
          </li>
          <li>
            The guides (Shelly the turtle, the bunny 22) are felt plush toys; Glim is a small
            lantern-robot. None copies an existing character's silhouette, outfit or colours.
          </li>
          <li>Any non-original asset is listed in LICENSES-ASSETS.md (none in the art kit).</li>
        </ul>
      </Section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Every listed pair passes its 06 §7 threshold by day and at sunset.
    for (const p of ART_PAIRS) {
      for (const l of ['day', 'sunset'] as const) {
        await expect(pairRatio(p, l), `${p.use} (${l})`).toBeGreaterThanOrEqual(p.min);
      }
    }
    await expect(canvasElement.querySelectorAll('[data-pair]').length).toBe(ART_PAIRS.length);
    // Swatch captions are exactly two unbroken lines (fill, outline), never cut mid-token.
    for (const cap of canvasElement.querySelectorAll<HTMLElement>('[data-swatch] figcaption')) {
      const line = Number.parseFloat(getComputedStyle(cap).lineHeight) || 21;
      await expect(Math.round(cap.getBoundingClientRect().height / line)).toBe(2);
      await expect(cap.scrollWidth).toBeLessThanOrEqual(cap.closest('figure')?.clientWidth ?? 0);
    }
    // Lighting strips are balanced: equal full rows, no orphan swatch.
    for (const strip of canvasElement.querySelectorAll<HTMLElement>('[data-strip]')) {
      const rows = new Map<number, number>();
      for (const c of strip.children) {
        const top = Math.round(c.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      await expect(new Set(rows.values()).size).toBe(1);
    }
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
