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

const css = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

/** The declarations of the rule whose selector list is exactly `selector` (whitespace-normalised). */
function rule(sheet: string, selector: string): Record<string, string> {
  const norm = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (norm(m[1] ?? '') !== selector) continue;
    const out: Record<string, string> = {};
    for (const d of norm(m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    return out;
  }
  throw new Error(`no rule ${selector}`);
}

describe('Felt & Stitch widget pictures (slice 4a): the shipped styles draw these colours', () => {
  const kit = css('./kit.css');
  const build = css('../base-ten-build/base-ten-build.css');
  const trade = css('../base-ten-trade/base-ten-trade.css');
  const tf = css('../tenframe-fill/tenframe-fill.css');

  it('keeps the light felt edge as the theme defines it', () => {
    expect(theme).toContain(
      '--felt-edge: color-mix(in srgb, var(--color-wood-deep) 65%, var(--color-sand-deep));',
    );
  });

  it('draws base-ten unit lines in sky-light on denim: 1.5 px in the (scaled) kit picture, 1 px on build flats', () => {
    const block = rule(kit, '.ni-baseten__block');
    expect(block['background-color']).toBe('var(--color-sea)');
    expect(block['--lw']).toBe('1.5px');
    expect(block['background-image']).toContain('var(--color-sky-light) var(--lw)');
    // The kit picture is scaled down as a whole: its flats keep 1.5 px, or their grid vanishes (R2).
    expect(kit).not.toMatch(/\.ni-baseten__block--flat[^{]*\{[^}]*--lw/);
    expect(rule(build, '.ni-btb')['--line']).toBe('var(--color-sky-light)');
    expect(rule(build, '.ni-btb__art--tens')['background-image']).toContain('var(--line) 1.5px');
    expect(
      rule(build, '.ni-btb__art--hundreds, .ni-btb__art--thousands')['background-image'],
    ).toContain('var(--line) 1px');
  });

  it('edges base-ten pieces that lie on wood in a darker denim (review R1)', () => {
    expect(rule(build, '.ni-btb__art').border).toBe('var(--bw) solid var(--color-sea-deep)');
    expect(rule(trade, '.ni-btt__piece').border).toBe('2px solid var(--color-sea-dark)');
    expect(rule(trade, '.ni-btt__mat').background).toBe('var(--color-wood)');
    expect(contrastRatio(PALETTE['sea-deep'], PALETTE['sand-shadow'])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(PALETTE['sea-dark'], PALETTE.wood)).toBeGreaterThanOrEqual(3);
  });

  it('draws the ten-frame drop rings in ink inside the cream cell, never on the denim mat (review R1)', () => {
    const armed = rule(tf, '.ni-tf__pad.ni-drop-target[data-armed="true"]');
    expect(armed['outline-color']).toBe('var(--color-ink)');
    expect(armed['outline-offset']).toMatch(/^calc\(-\d+px/);
    const over = rule(tf, '.ni-tf__pad.ni-drop-target[data-over="true"]');
    expect(over.outline).toBe('5px solid var(--color-ink)');
    expect(over['outline-offset']).toMatch(/^calc\(-\d+px/);
    expect(rule(tf, '.ni-tf__cell').background).toBe('var(--color-cloud)');
    expect(contrastRatio(PALETTE.ink, PALETTE.cloud)).toBeGreaterThanOrEqual(3);
  });

  it('draws the number line as a denim ribbon with plain ink ticks', () => {
    expect(rule(kit, '.ni-numberline__axis').stroke).toBe('var(--color-sea)');
    expect(rule(kit, '.ni-numberline__tick').stroke).toBe('var(--color-ink)');
    expect(rule(kit, '.ni-objects__frame').background).toContain('var(--color-sea)');
  });
});

describe('Felt & Stitch widget pictures (slice 4a): every mark that carries meaning ≥ 3:1', () => {
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
