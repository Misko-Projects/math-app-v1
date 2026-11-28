import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, PALETTE, type PaletteColor } from '../../tokens/tokens';
import { BAR_EDGE } from './ChartView';
import { insetPolygon, shapeColor, shapeSetFelt } from './ShapeView';

/** The hex a CSS colour in `var(--color-x)` or `color-mix(in srgb, var(--color-a) N%, var(--color-b))` form resolves to. */
function resolve(css: string): string {
  const v = /^var\(--color-([a-z-]+)\)$/.exec(css);
  if (v) return PALETTE[v[1] as PaletteColor];
  if (css === 'var(--felt-edge)') return resolve(FELT_EDGE);
  const m =
    /^color-mix\(in srgb, var\(--color-([a-z-]+)\) (\d+)%, var\(--color-([a-z-]+)\)\)$/.exec(css);
  if (!m) throw new Error(`cannot resolve ${css}`);
  const [a, pct, b] = [PALETTE[m[1] as PaletteColor], Number(m[2]), PALETTE[m[3] as PaletteColor]];
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round((ch(a, i) * pct + ch(b, i) * (100 - pct)) / 100));
  return `#${out.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
const FELT_EDGE = 'color-mix(in srgb, var(--color-wood-deep) 65%, var(--color-sand-deep))';

const css = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('Felt & Stitch widget pictures (slice 4b): every edge that carries meaning ≥ 3:1', () => {
  it('keeps the warm felt edge as the theme defines it', () => {
    expect(css('../../tokens/theme.css')).toContain(`--felt-edge: ${FELT_EDGE};`);
  });

  it.each(['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'tan'])(
    'edges a %s felt shape ≥ 3:1 on its paper card, with no line darker than it needs',
    (name) => {
      const c = shapeColor(name);
      const edge = resolve(c.line);
      expect(contrastRatio(edge, PALETTE.paper)).toBeGreaterThanOrEqual(3);
      // A felt that holds 3:1 alone is edged in its own colour: no line is drawn round it.
      if (contrastRatio(resolve(c.fill), PALETTE.paper) >= 3) expect(c.line).toBe(c.fill);
      // shape-compose seams (pieces edge to edge) are the fill's own darker shade, never ink.
      expect(c.seam).not.toContain('ink');
    },
  );

  it('edges a light chart bar inside the bar, ≥ 3:1 on its sand lane; the others need none', () => {
    for (const [fill, edge] of Object.entries(BAR_EDGE)) {
      expect(contrastRatio(PALETTE[fill as PaletteColor], PALETTE.sand)).toBeLessThan(3);
      expect(contrastRatio(resolve(edge as string), PALETTE.sand)).toBeGreaterThanOrEqual(3);
    }
    for (const fill of ['sea-deep', 'coral-deep', 'ink'] as const) {
      expect(contrastRatio(PALETTE[fill], PALETTE.sand)).toBeGreaterThanOrEqual(3);
    }
    const chart = css('./chart.css');
    expect(chart).not.toMatch(/\.ni-chart__bar\s*\{[^}]*stroke/);
  });

  it('tells a shaded fraction part from an unshaded one by lightness, and holds each edge', () => {
    expect(contrastRatio(PALETTE.sea, PALETTE.cloud)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(PALETTE.sea, PALETTE.sand)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(PALETTE['wood-deep'], PALETTE.sand)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(PALETTE['wood-deep'], PALETTE.cloud)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(resolve(FELT_EDGE), PALETTE.paper)).toBeGreaterThanOrEqual(3);
    const frac = css('./fraction.css');
    expect(frac).toMatch(
      /\.ni-fraction__part\[data-fraction="empty"\] \{[^}]*stroke: var\(--color-wood-deep\)/,
    );
    expect(frac).toMatch(
      /\.ni-fraction__part\[data-fraction="filled"\] \{[^}]*fill: var\(--color-sea\);/,
    );
    expect(frac).toMatch(/\.ni-fraction__outline \{[^}]*stroke: var\(--felt-edge\)/);
  });

  it('draws nothing dashed on the clock rim (look check)', () => {
    expect(css('./clock.css')).not.toMatch(/stroke-dasharray/);
    expect(css('./ClockView.tsx')).not.toMatch(/strokeDasharray|__stitch/);
  });

  it('separates bar-model parts with plain ink-soft lines ≥ 3:1 on every part colour', () => {
    for (const bg of ['sky-light', 'sunshine-light', 'leaf-light', 'cloud'] as const) {
      expect(contrastRatio(PALETTE['ink-soft'], PALETTE[bg])).toBeGreaterThanOrEqual(3);
    }
    expect(css('./bar-model.css')).toContain('border: 3px solid var(--color-ink-soft);');
  });
});

describe('Felt shapes: one treatment per screen, a true inset stitch', () => {
  it('insets every side of a polygon by exactly d, also at an acute corner', () => {
    const tri: [number, number][] = [
      [0, -40],
      [30, 30],
      [-30, 30],
    ];
    const d = 4;
    const inner = insetPolygon(tri, d);
    expect(inner).not.toBeNull();
    // Each inner side lies at distance d from its outer side.
    for (let i = 0; i < 3; i += 1) {
      const [p, q] = [tri[i], tri[(i + 1) % 3]] as [[number, number], [number, number]];
      const r = (inner as [number, number][])[i] as [number, number];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const dist = Math.abs((q[0] - p[0]) * (p[1] - r[1]) - (p[0] - r[0]) * (q[1] - p[1])) / len;
      expect(dist).toBeCloseTo(d, 4);
    }
    // Too small for the inset: no stitch at all.
    expect(insetPolygon(tri, 40)).toBeNull();
  });

  it('dresses a whole set by its smallest shape', () => {
    const big = { shape: 'hexagon', scale: 1.5 } as const;
    const small = { shape: 'circle', scale: 0.5 } as const;
    expect(shapeSetFelt([big], 2)).toEqual({ grain: true, stitch: true });
    // One small shape makes the whole set plainer, every shape alike.
    expect(shapeSetFelt([big, small], 2).stitch).toBe(false);
    expect(shapeSetFelt([big, small], 0.5)).toEqual({ grain: false, stitch: false });
    // An open figure or a solid carries neither, so its set is flat.
    expect(shapeSetFelt([big, { shape: 'cube', scale: 1 }], 3)).toEqual({
      grain: false,
      stitch: false,
    });
  });
});
