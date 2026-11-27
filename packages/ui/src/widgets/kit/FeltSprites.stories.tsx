import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { expect } from 'storybook/test';
import { CvdCompare } from '../../art/gallery/Gallery';
import { CRAB_FACES, FELT_KINDS, FELT_TONES_USED, type FeltKind } from './felt-sprites';
import { ObjectSprite, type SpriteTone } from './sprites';

/**
 * Felt & Stitch counted objects (slice 3): each kind at the smallest and largest size shipped
 * content draws it at (the slice 3 fit probe), every tone content gives it on the cream mat and on
 * the sage tray edge, the two counters under colour-vision simulations, the crab faces, and the
 * fallback a browser without container queries draws.
 */
const meta = {
  title: 'Widgets/Kit/Felt sprites',
  parameters: { ui: { stage: 'centered' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const KINDS = Object.keys(FELT_KINDS) as FeltKind[];

/** Smallest and largest drawn size in px (fit probe, 3 seeds at both viewports). */
const DRAWN_PX: Readonly<Record<FeltKind, readonly [number, number]>> = {
  shell: [11, 113],
  crab: [18, 125],
  fish: [15, 112],
  counter: [10, 112],
  pebble: [16, 169],
  leaf: [28, 286],
  starfish: [25, 121],
  firefly: [20, 96],
  dot: [22, 112],
  stone: [86, 112],
};

const MAT: CSSProperties = {
  background: 'var(--color-paper)',
  borderRadius: 18,
  padding: 14,
};
const SAGE: CSSProperties = { ...MAT, background: 'var(--color-leaf)' };

function Sprite({
  kind,
  px,
  tone = 'a',
  variant,
}: {
  kind: string;
  px: number;
  tone?: SpriteTone;
  variant?: number;
}) {
  return (
    <span style={{ display: 'block', width: px, height: px, flex: 'none' }} data-px={px}>
      <ObjectSprite sprite={kind} tone={tone} variant={variant} />
    </span>
  );
}

function Row({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...style }}>
      <span className="story-cell__name" style={{ width: 72, textAlign: 'right' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** Every kind at its smallest drawn size, then 32 and 48 px (the tier steps), then its largest. */
export const SizeSheet: Story = {
  render: () => (
    <div style={{ ...MAT, display: 'grid', gap: 10 }} data-sheet="sizes">
      {KINDS.map((k) => {
        const [lo, hi] = DRAWN_PX[k];
        const sizes = [...new Set([lo, 24, 32, 48, Math.min(hi, 170)])].filter((s) => s >= lo);
        return (
          <Row key={k} label={k}>
            {sizes.map((s) => (
              <Sprite key={s} kind={k} px={s} tone="a" />
            ))}
            {k === 'counter' || k === 'pebble' || k === 'dot'
              ? sizes.map((s) => <Sprite key={`b${s}`} kind={k} px={s} tone="b" />)
              : null}
          </Row>
        );
      })}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Tiers follow the drawn size: no stitch below 32 px, no grain below 48 px, both from 48.
    const at = (px: number) =>
      canvasElement.querySelector(`[data-px="${px}"] .ni-sprite[data-sprite="crab"]`) ??
      canvasElement.querySelector(`[data-px="${px}"] .ni-sprite`);
    const shown = (el: Element | null, cls: string) => {
      const part = el?.querySelector(`.${cls}`);
      return part ? getComputedStyle(part).display !== 'none' : false;
    };
    await expect(shown(at(24), 'ni-felt-md')).toBe(false);
    await expect(shown(at(32), 'ni-felt-md')).toBe(true);
    await expect(shown(at(32), 'ni-felt-lg')).toBe(false);
    await expect(shown(at(48), 'ni-felt-lg')).toBe(true);
    // The lift is the drawing's drop-shadow, never a shape: no ellipse is drawn under a sprite.
    for (const svg of canvasElement.querySelectorAll('.ni-sprite')) {
      const lift = svg.querySelector('.ni-felt-lift');
      await expect(lift && getComputedStyle(lift).filter).toContain('drop-shadow');
      await expect(svg.querySelector('ellipse[fill^="rgb("]')).toBeNull();
    }
  },
};

/**
 * Every kind at the smallest size content draws it, on what it sits on there: a picture card
 * (numeral-pick, order), the cream mat, and the sage tray edge. Silhouettes alone tell them apart.
 */
export const SmallestOnSurfaces: Story = {
  render: () => {
    const surfaces: [string, CSSProperties][] = [
      [
        'card',
        {
          background: 'var(--color-cloud)',
          border: '3px solid var(--color-ink)',
          borderRadius: 12,
        },
      ],
      ['mat', { background: 'var(--color-paper)', borderRadius: 12 }],
      ['sage', { background: 'var(--color-leaf)', borderRadius: 12 }],
    ];
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {surfaces.map(([name, style]) => (
          <Row key={name} label={name}>
            {[
              ...KINDS.map((k) => [k, 'a'] as const),
              ['counter', 'b'] as const,
              ['pebble', 'b'] as const,
            ].map(([k, tone]) => (
              <div
                key={`${k}${tone}`}
                style={{
                  ...style,
                  width: Math.max(44, DRAWN_PX[k][0] + 10),
                  height: Math.max(44, DRAWN_PX[k][0] + 10),
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Sprite kind={k} px={DRAWN_PX[k][0]} tone={tone} />
              </div>
            ))}
          </Row>
        ))}
      </div>
    );
  },
};

/** Every tone content gives each kind, small and large, on the cream mat and the sage tray. */
export const Tones: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      {[MAT, SAGE].map((bg, i) => (
        <div key={i === 0 ? 'mat' : 'sage'} style={{ ...bg, display: 'grid', gap: 8 }}>
          {KINDS.map((k) => (
            <Row key={k} label={k}>
              {FELT_TONES_USED[k].flatMap((tone) => [
                <Sprite key={`${tone}24`} kind={k} px={24} tone={tone} />,
                <Sprite key={`${tone}64`} kind={k} px={64} tone={tone} />,
              ])}
            </Row>
          ))}
        </div>
      ))}
    </div>
  ),
};

/** The two counters (ten-frames, number bonds) under each simulation: the ring tells them apart. */
export const CountersColourVision: Story = {
  render: () => (
    <CvdCompare col={330}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        {[10, 16, 24, 48].flatMap((px) => [
          <Sprite key={`a${px}`} kind="counter" px={px} tone="a" />,
          <Sprite key={`b${px}`} kind="counter" px={px} tone="b" />,
        ])}
      </div>
    </CvdCompare>
  ),
  play: async ({ canvasElement }) => {
    // Colour b carries its mark at every size (06 §7, never colour alone).
    for (const b of canvasElement.querySelectorAll(
      '.ni-sprite[data-sprite="counter"][data-tone="b"]',
    )) {
      const ring = b.querySelector('[data-mark="ring"] circle');
      await expect(ring && getComputedStyle(ring).display).not.toBe('none');
    }
    for (const a of canvasElement.querySelectorAll(
      '.ni-sprite[data-sprite="counter"][data-tone="a"]',
    )) {
      await expect(a.querySelector('[data-mark="ring"]')).toBeNull();
    }
  },
};

/** The crab faces: the same body and box, a different face from 48 px. */
export const CrabFaces: Story = {
  render: () => (
    <div style={{ ...MAT, display: 'grid', gap: 10 }}>
      {[24, 72].map((px) => (
        <Row key={px} label={`${px} px`}>
          {Array.from({ length: CRAB_FACES }, (_, v) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one cell per face
            <Sprite key={v} kind="crab" px={px} variant={v} />
          ))}
        </Row>
      ))}
    </div>
  ),
};

/**
 * What a browser without container queries draws: the first tier at every size, a whole sprite
 * (forced here with `.ni-felt-nocq`, which hides the tiers as the base rule does).
 */
export const NoContainerQueries: Story = {
  render: () => (
    <div
      className="ni-felt-nocq"
      style={{ ...MAT, display: 'flex', gap: 12, flexWrap: 'wrap', maxWidth: 900 }}
    >
      {KINDS.map((k) => (
        <Sprite key={k} kind={k} px={72} tone="a" />
      ))}
      <Sprite kind="counter" px={72} tone="b" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const part of canvasElement.querySelectorAll('.ni-felt-md, .ni-felt-lg')) {
      await expect(getComputedStyle(part).display).toBe('none');
    }
    // The silhouette tier is all there: every piece is painted, the counter b keeps its ring.
    for (const svg of canvasElement.querySelectorAll('.ni-sprite')) {
      await expect(svg.querySelectorAll('[data-felt-piece]').length).toBeGreaterThan(0);
    }
    await expect(canvasElement.querySelector('[data-mark="ring"]')).not.toBeNull();
  },
};
