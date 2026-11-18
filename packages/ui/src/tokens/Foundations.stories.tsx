import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { BigButton } from '../primitives/BigButton';
import { CategoryMark } from '../primitives/CategoryMark';
import {
  ArrowIcon,
  CheckIcon,
  CloseIcon,
  CrateIcon,
  HandPointerIcon,
  HomeIcon,
  LightbulbIcon,
  SpeakerIcon,
  StarIcon,
} from '../primitives/icons';
import { NumberDisplay } from '../primitives/NumberDisplay';
import { HintButton, HomeButton, ReplayButton } from '../primitives/presets';
import {
  CATEGORY_MARKS,
  CONTRAST_PAIRS,
  contrastRatio,
  DURATION_MS,
  PALETTE,
  type PaletteColor,
  TARGET_PX,
  Z_LAYER,
} from './tokens';

const meta = {
  title: 'Foundations/Tokens',
  parameters: { ui: { stage: 'padded' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const GROUPS: { name: string; colors: PaletteColor[] }[] = [
  { name: 'Sea', colors: ['sea', 'sea-deep', 'sea-dark', 'shallows', 'foam', 'sky', 'sky-light'] },
  {
    name: 'Shore',
    colors: ['sand', 'sand-deep', 'sand-shadow', 'horizon', 'paper', 'pebble', 'pebble-deep'],
  },
  {
    name: 'Warm',
    colors: [
      'coral',
      'coral-deep',
      'sun',
      'sun-deep',
      'sunshine',
      'sunshine-light',
      'sunshine-deep',
    ],
  },
  {
    name: 'Leaf, wood, ink',
    colors: [
      'leaf',
      'leaf-deep',
      'leaf-dark',
      'leaf-light',
      'wood',
      'wood-deep',
      'ink',
      'ink-soft',
    ],
  },
];

function Swatch({ name }: { name: PaletteColor }) {
  const hex = PALETTE[name];
  return (
    <div
      style={{ display: 'grid', gap: 6, width: 128, fontFamily: 'var(--font-body)', fontSize: 14 }}
    >
      <div
        style={{
          height: 80,
          borderRadius: 18,
          border: '3px solid rgb(38 70 83 / 0.18)',
          background: hex,
        }}
      />
      <span style={{ fontWeight: 700 }}>{name}</span>
      <span>{hex}</span>
    </div>
  );
}

/** The palette (05 §11) with each fill's outline shade. */
export const Palette: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 28 }}>
      {GROUPS.map((g) => (
        <section key={g.name} aria-label={g.name}>
          <h2 className="story-heading">{g.name}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {g.colors.map((c) => (
              <Swatch key={c} name={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};

/** Text and icon pairs used by the primitives, each ≥ 4.5:1 (06 §7). */
export const Contrast: Story = {
  render: () => (
    <table
      style={{
        borderCollapse: 'separate',
        borderSpacing: '0 10px',
        fontFamily: 'var(--font-body)',
      }}
    >
      <thead>
        <tr style={{ textAlign: 'left' }}>
          <th style={{ padding: '0 16px' }}>Use</th>
          <th style={{ padding: '0 16px' }}>Sample</th>
          <th style={{ padding: '0 16px' }}>Ratio</th>
        </tr>
      </thead>
      <tbody>
        {CONTRAST_PAIRS.map((p) => (
          <tr key={p.use}>
            <td style={{ padding: '0 16px' }}>{p.use}</td>
            <td style={{ padding: '0 16px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '8px 18px',
                  borderRadius: 14,
                  background: PALETTE[p.bg],
                  color: PALETTE[p.fg],
                  border: '2px solid rgb(38 70 83 / 0.2)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 22,
                }}
              >
                Aa 123
              </span>
            </td>
            <td style={{ padding: '0 16px', fontWeight: 700 }}>
              {contrastRatio(PALETTE[p.fg], PALETTE[p.bg]).toFixed(2)}:1
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
  play: async () => {
    for (const p of CONTRAST_PAIRS) {
      await expect(contrastRatio(PALETTE[p.fg], PALETTE[p.bg]), p.use).toBeGreaterThanOrEqual(4.5);
    }
  },
};

/** Sizes per age mode (06 §4), motion durations and z-layers. */
export const SizesMotionLayers: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 32, fontFamily: 'var(--font-body)' }}>
      <section aria-label="Touch targets">
        <h2 className="story-heading">Touch targets</h2>
        <div style={{ display: 'flex', gap: 48, alignItems: 'flex-end' }}>
          {(['k', 'g1-up'] as const).map((m) => (
            <div key={m} style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                {(['min', 'icon', 'big'] as const).map((k) => (
                  <div
                    key={k}
                    style={{
                      width: TARGET_PX[m][k],
                      height: TARGET_PX[m][k],
                      borderRadius: 18,
                      background: 'var(--color-shallows)',
                      border: '3px solid var(--color-sea-deep)',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                    }}
                  >
                    {TARGET_PX[m][k]}
                  </div>
                ))}
              </div>
              <span style={{ fontWeight: 700 }}>{m === 'k' ? 'K' : 'G1+'}: min · icon · big</span>
            </div>
          ))}
        </div>
      </section>
      <section aria-label="Motion">
        <h2 className="story-heading">Motion (reduced motion caps transitions at 150 ms)</h2>
        <p>
          {Object.entries(DURATION_MS)
            .map(([k, v]) => `${k} ${v} ms`)
            .join(' · ')}
        </p>
      </section>
      <section aria-label="Layers">
        <h2 className="story-heading">z-layers</h2>
        <p>
          {Object.entries(Z_LAYER)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}
        </p>
      </section>
    </div>
  ),
};

const CVD_FILTERS: { id: string; name: string; matrix: string | null }[] = [
  { id: 'none', name: 'Typical vision', matrix: null },
  {
    id: 'protanopia',
    name: 'Protanopia',
    matrix: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  },
  {
    id: 'deuteranopia',
    name: 'Deuteranopia',
    matrix: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  },
  {
    id: 'tritanopia',
    name: 'Tritanopia',
    matrix: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
  },
  {
    id: 'achromatopsia',
    name: 'Achromatopsia',
    matrix: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0',
  },
];

function Specimen() {
  return (
    <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <HomeButton caption={false} />
        <ReplayButton caption={false} />
        <HintButton caption={false} glow />
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <BigButton label="ui.btn.check" icon={<CheckIcon />} tone="sun" showLabel={false} />
        <NumberDisplay value={7} speakOnTap={false} />
      </div>
      {/* Math-relevant categories: colour + shape (CATEGORY_MARKS), distinct in every filter. */}
      <div style={{ display: 'flex', gap: 10 }}>
        {CATEGORY_MARKS.map((m, i) => (
          <CategoryMark key={m.id} index={i} size={40} />
        ))}
      </div>
    </div>
  );
}

/**
 * Colour-vision check (06 §7): the primitives and palette under simulated colour-vision
 * deficiencies. Controls stay distinguishable by shape, icon and outline, never colour alone. The
 * toolbar's "Vision" simulator (a11y addon) applies the same filters to any story.
 */
export const ColourVision: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 24,
      }}
    >
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        {CVD_FILTERS.filter((f) => f.matrix).map((f) => (
          <filter key={f.id} id={`cvd-${f.id}`}>
            <feColorMatrix type="matrix" values={f.matrix as string} />
          </filter>
        ))}
      </svg>
      {CVD_FILTERS.map((f) => (
        <section
          key={f.id}
          aria-label={f.name}
          style={{
            display: 'grid',
            gap: 12,
            justifyItems: 'center',
            padding: 20,
            borderRadius: 28,
            background: 'var(--color-paper)',
            border: '3px solid var(--color-sand-deep)',
          }}
        >
          <h2 className="story-heading" style={{ margin: 0 }}>
            {f.name}
          </h2>
          <div style={{ filter: f.matrix ? `url(#cvd-${f.id})` : undefined }}>
            <Specimen />
          </div>
        </section>
      ))}
    </div>
  ),
};

const ICONS = [
  ['home', HomeIcon],
  ['lightbulb', LightbulbIcon],
  ['speaker', SpeakerIcon],
  ['check', CheckIcon],
  ['close', CloseIcon],
  ['arrow', ArrowIcon],
  ['star', StarIcon],
  ['hand', HandPointerIcon],
  ['crate', CrateIcon],
] as const;

/** Icons: original, chunky, outlined (05 §11). */
export const Icons: Story = {
  render: () => (
    <div
      className="story-grid"
      style={{ ['--story-col' as string]: '120px', width: 'min(900px, 100%)' }}
    >
      {ICONS.map(([name, Icon]) => (
        <div key={name} className="story-cell">
          <div style={{ width: 72, height: 72 }}>
            <Icon />
          </div>
          <span className="story-cell__name">{name}</span>
        </div>
      ))}
    </div>
  ),
};
