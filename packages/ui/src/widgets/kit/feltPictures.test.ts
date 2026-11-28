import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, PALETTE, type PaletteColor } from '../../tokens/tokens';

/** An sRGB `color-mix` of two palette colours, as the browser computes it. */
function mix(a: PaletteColor, pct: number, b: PaletteColor): string {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round((ch(PALETTE[a], i) * pct + ch(PALETTE[b], i) * (100 - pct)) / 100),
  );
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const theme = readFileSync(
  fileURLToPath(new URL('../../tokens/theme.css', import.meta.url)),
  'utf8',
);

describe('Felt & Stitch widget pictures (slice 4a): every mark that carries meaning ≥ 3:1', () => {
  it('keeps the light felt edge as the theme defines it', () => {
    expect(theme).toContain(
      '--felt-edge: color-mix(in srgb, var(--color-wood-deep) 65%, var(--color-sand-deep));',
    );
  });

  it.each([
    // [what, foreground, background]
    ['ten-frame mat on paper (no outline)', PALETTE.sea, PALETTE.paper],
    ['ten-frame cell on its denim mat: the rows of five', PALETTE.cloud, PALETTE.sea],
    ['terracotta counter on a cream cell', PALETTE.coral, PALETTE.cloud],
    ['number-line ribbon on paper', PALETTE.sea, PALETTE.paper],
    ['number-line tick and numeral on paper', PALETTE.ink, PALETTE.paper],
    ['number-line mark and pointer on paper (no outline)', PALETTE.coral, PALETTE.paper],
    ['jump arc on paper', PALETTE['coral-deep'], PALETTE.paper],
    ['base-ten piece on paper (no outline)', PALETTE.sea, PALETTE.paper],
    [
      'base-ten unit line on denim (rods 1.5 px, flats 1 px, from a 6 px unit)',
      PALETTE['sky-light'],
      PALETTE.sea,
    ],
    ['counted base-ten unit line on mustard', PALETTE['ink-soft'], PALETTE.sunshine],
    ['number-bond ring on paper', PALETTE.sea, PALETTE.paper],
    ['number-bond ring on its cream face', PALETTE.sea, PALETTE.cloud],
    ['number-bond leg on paper', PALETTE['wood-deep'], PALETTE.paper],
    ['hundred-chart grid line on a cream cell', PALETTE.sea, PALETTE.cloud],
    ['order direction arrow on paper', PALETTE['sea-deep'], PALETTE.paper],
    ['raft log edge on paper', PALETTE['wood-deep'], PALETTE.paper],
    [
      'light felt edge (plate, die tile, stepping stone, chart key) on paper',
      mix('wood-deep', 65, 'sand-deep'),
      PALETTE.paper,
    ],
    ['ruler edge on paper', mix('sunshine-deep', 75, 'wood-deep'), PALETTE.paper],
  ])('%s', (_what, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
