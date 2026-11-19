import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../tokens/tokens';
import { pairRatio } from '../core/contrast';
import { OUTLINE_OF } from '../core/paint';
import { CHARACTER_CONTRAST_PAIRS } from './contrast';
import { Pebbling } from './Pebbling';
import {
  COIN_LOOK,
  CRITTER_W,
  clockHour,
  coinValue,
  drawableNumber,
  effectiveFamily,
  fractionParts,
  hundredFrames,
  PALETTE_FILLS,
  PEBBLE_MARK,
  PEBBLING_FAMILIES,
  PEBBLING_PALETTES,
  PEBBLING_SPECIES,
  paletteOf,
  pebblingFromResident,
  resolveFraction,
  speciesOf,
  TEN_FRAME,
  tenFrameSlots,
  tensLayout,
} from './pebbling';

const resident = (over: Partial<Parameters<typeof pebblingFromResident>[0]> = {}) => ({
  id: 'res-7' as Parameters<typeof pebblingFromResident>[0]['id'],
  species: 'crab',
  palette: 'coral',
  number: 7,
  ...over,
});

describe('species and palettes (05 §5)', () => {
  it('lists exactly the species and palettes the game data uses', () => {
    expect([...PEBBLING_SPECIES].sort()).toEqual(
      [
        'crab',
        'hermit-crab',
        'turtle',
        'snail',
        'starfish',
        'seal',
        'puffin',
        'seahorse',
        'whale',
        'clockfish',
        'clam',
      ].sort(),
    );
    expect([...PEBBLING_PALETTES].sort()).toEqual(
      ['coral', 'sun', 'sunshine', 'leaf', 'sea', 'sky', 'sand', 'wood'].sort(),
    );
    expect([...PEBBLING_FAMILIES].sort()).toEqual([
      'clock',
      'coin',
      'fraction',
      'hundreds',
      'tens',
    ]);
  });

  it('maps every palette to token fills, outlined in the fill’s own shade', () => {
    expect(Object.keys(PALETTE_FILLS).sort()).toEqual([...PEBBLING_PALETTES].sort());
    for (const p of PEBBLING_PALETTES) {
      const f = PALETTE_FILLS[p];
      for (const c of [f.body, f.deep, f.accent, f.belly, f.cheek])
        expect(PALETTE).toHaveProperty(c);
      expect(f.deep).toBe(OUTLINE_OF[f.body]);
    }
  });
});

describe('ResidentDef → Pebbling props', () => {
  it('passes species, palette, number and family through', () => {
    expect(pebblingFromResident(resident())).toEqual({
      species: 'crab',
      palette: 'coral',
      number: 7,
    });
    expect(
      pebblingFromResident(resident({ species: 'turtle', number: 30, family: 'tens' })),
    ).toEqual({
      species: 'turtle',
      palette: 'coral',
      number: 30,
      family: 'tens',
    });
  });

  it('normalises game-data spellings', () => {
    expect(speciesOf('hermit crab')).toBe('hermit-crab');
    expect(speciesOf('Sea Star')).toBe('starfish');
    expect(speciesOf('seal pup')).toBe('seal');
    expect(speciesOf('puffin chick')).toBe('puffin');
    expect(paletteOf('Sea-Glass')).toBe('sea');
    expect(paletteOf('moss')).toBe('leaf');
  });

  it('falls back to the family’s own species and a stable palette for unknown names', () => {
    const a = pebblingFromResident(
      resident({ species: 'kraken', palette: 'plaid', family: 'clock', number: 3 }),
    );
    expect(a.species).toBe('clockfish');
    expect(PEBBLING_PALETTES).toContain(a.palette);
    expect(
      pebblingFromResident(
        resident({ species: 'kraken', palette: 'plaid', family: 'clock', number: 3 }),
      ),
    ).toEqual(a);
    expect(pebblingFromResident(resident({ species: 'kraken' })).species).toBe('crab');
    expect(pebblingFromResident(resident({ number: null })).number).toBeNull();
  });

  it('treats inherited names such as "constructor" as unknown (review s_eab7ff900e77 #2)', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(speciesOf(name), name).toBeUndefined();
      expect(paletteOf(name), name).toBeUndefined();
      const spec = pebblingFromResident(resident({ species: name, palette: name, number: 4 }));
      expect(PEBBLING_SPECIES, name).toContain(spec.species);
      expect(PEBBLING_PALETTES, name).toContain(spec.palette);
    }
  });

  it('draws a plain number above ten as the tens family', () => {
    expect(effectiveFamily({ number: 7 })).toBeUndefined();
    expect(effectiveFamily({ number: 14 })).toBe('tens');
    expect(effectiveFamily({ number: null })).toBeUndefined();
    expect(effectiveFamily({ number: 3, family: 'clock' })).toBe('clock');
  });
});

describe('only numbers a family can show exactly are drawn (review s_eab7ff900e77 #1)', () => {
  it('accepts exact values and rejects ones that would be drawn as a nearby quantity', () => {
    const ok = (number: number | null, family?: (typeof PEBBLING_FAMILIES)[number]) =>
      drawableNumber(family ? { number, family } : { number });
    // Plain critters 0–10; above ten the Ten Turtles, to 109.
    expect([0, 7, 10, 14, 100, 109].every((n) => ok(n))).toBe(true);
    expect([2.5, -1, 110, Number.NaN].some((n) => ok(n))).toBe(false);
    // Half-Crabs: fractions with the shell's denominators.
    expect([0, 0.5, 0.25, 1 / 3, 0.333, 2 / 3, 0.75, 1].every((v) => ok(v, 'fraction'))).toBe(true);
    expect([1 / 7, 0.14, 1.5, -0.25].some((v) => ok(v, 'fraction'))).toBe(false);
    // Coin Clams: 1, 5, 10, 25 only.
    expect([1, 5, 10, 25].every((v) => ok(v, 'coin'))).toBe(true);
    expect([7, 2, 50].some((v) => ok(v, 'coin'))).toBe(false);
    // Clockfish: whole hours 1–12. The Hundred Whale: 0–100.
    expect(ok(12, 'clock') && !ok(0, 'clock') && !ok(3.5, 'clock') && !ok(13, 'clock')).toBe(true);
    expect(ok(100, 'hundreds') && ok(46, 'hundreds') && !ok(101, 'hundreds')).toBe(true);
    expect(ok(null) && ok(null, 'coin')).toBe(true);
  });

  it('rejects fractions near a whole or nothing that a shell would round (review s_9507c6228fb4 #1)', () => {
    for (const v of [0.9995, 0.0005, 0.999, 0.001, 1 - 1e-9, 1e-9]) {
      expect(drawableNumber({ number: v, family: 'fraction' }), String(v)).toBe(false);
      expect(resolveFraction(v), String(v)).toBeNull();
    }
    // The intentional decimal alias still reads as a third.
    expect(resolveFraction(0.333)).toEqual({ parts: 3, filled: 1 });
  });

  it('draws exactly the fractions it accepts, as the value it was given', () => {
    for (let i = 0; i <= 20000; i++) {
      const v = i / 20000;
      const shell = resolveFraction(v);
      expect(drawableNumber({ number: v, family: 'fraction' }), String(v)).toBe(shell !== null);
      if (!shell) continue;
      // A proper part is never a whole or nothing, and the shell shows the value within tolerance.
      if (shell.parts > 1) expect(shell.filled > 0 && shell.filled < shell.parts).toBe(true);
      expect(Math.abs(shell.filled / shell.parts - v), String(v)).toBeLessThan(1e-3);
      expect(fractionParts(v)).toEqual(shell);
    }
  });

  it('renders an undrawable fraction as a plain shell, never a nearby one', () => {
    for (const v of [0.9995, 0.0005]) {
      const html = renderToStaticMarkup(
        createElement(Pebbling, {
          species: 'crab',
          palette: 'coral',
          number: v,
          family: 'fraction',
        }),
      );
      expect(html, String(v)).toContain(`data-unsupported-number="${v}"`);
      expect(html, String(v)).not.toContain('data-number=');
    }
    const half = renderToStaticMarkup(
      createElement(Pebbling, {
        species: 'crab',
        palette: 'coral',
        number: 0.5,
        family: 'fraction',
      }),
    );
    expect(half).toContain('data-number="0.5"');
    expect(half).not.toContain('data-unsupported-number');
  });

  it('every resident in the game data is drawn exactly', () => {
    const game = compileContent(readContentFiles()).content?.game;
    expect(game?.residents.length).toBeGreaterThanOrEqual(40);
    const off = (game?.residents ?? [])
      .map((r) => ({ id: r.id, spec: pebblingFromResident(r) }))
      .filter(({ spec }) => !drawableNumber(spec))
      .map(({ id, spec }) => `${id} ${spec.family ?? 'plain'} ${spec.number}`);
    expect(off).toEqual([]);
  });
});

describe('ten-frame (05 §5)', () => {
  it('fills the top row left → right, then the bottom row', () => {
    for (let n = 0; n <= 10; n++) {
      const slots = tenFrameSlots(n);
      expect(slots).toHaveLength(10);
      expect(slots.filter((s) => s.lit)).toHaveLength(n);
      const order = slots.filter((s) => s.lit).map((s) => [s.row, s.col]);
      const expected = Array.from({ length: n }, (_, i) => [Math.floor(i / 5), i % 5]);
      expect(order).toEqual(expected);
    }
    // 3 lights the first three of the top row; the bottom row stays empty until five.
    expect(tenFrameSlots(3).filter((s) => s.row === 1 && s.lit)).toHaveLength(0);
    expect(
      tenFrameSlots(6)
        .filter((s) => s.row === 0)
        .every((s) => s.lit),
    ).toBe(true);
    expect(tenFrameSlots(-2).some((s) => s.lit)).toBe(false);
    expect(tenFrameSlots(14).every((s) => s.lit)).toBe(true);
  });

  it('keeps pebbles countable: ≥ 9 CSS px across at a 120 px buddy', () => {
    expect((TEN_FRAME.pebbleR * 2 * 120) / CRITTER_W).toBeGreaterThanOrEqual(9);
  });

  it('splits 0–100 into Ten Turtles (rows of five) and a friend with the ones', () => {
    expect(tensLayout(10)).toEqual({ tens: 1, ones: 0, rows: [1] });
    for (let n = 11; n <= 19; n++)
      expect(tensLayout(n)).toEqual({ tens: 1, ones: n - 10, rows: [1] });
    expect(tensLayout(40)).toEqual({ tens: 4, ones: 0, rows: [4] });
    expect(tensLayout(70)).toEqual({ tens: 7, ones: 0, rows: [5, 2] });
    expect(tensLayout(100)).toEqual({ tens: 10, ones: 0, rows: [5, 5] });
    for (let n = 0; n <= 100; n++) {
      const t = tensLayout(n);
      expect(t.tens * 10 + t.ones).toBe(n);
    }
  });

  it('lights the Hundred Whale frame by frame', () => {
    expect(hundredFrames(100)).toEqual(Array(10).fill(10));
    expect(hundredFrames(46)).toEqual([10, 10, 10, 10, 6, 0, 0, 0, 0, 0]);
    expect(hundredFrames(0).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('family values', () => {
  it('reads fractions as equal parts', () => {
    expect(fractionParts(0.5)).toEqual({ parts: 2, filled: 1 });
    expect(fractionParts(0.25)).toEqual({ parts: 4, filled: 1 });
    expect(fractionParts(0.75)).toEqual({ parts: 4, filled: 3 });
    expect(fractionParts(1 / 3)).toEqual({ parts: 3, filled: 1 });
    expect(fractionParts(0.333)).toEqual({ parts: 3, filled: 1 });
    expect(fractionParts(2 / 3)).toEqual({ parts: 3, filled: 2 });
    expect(fractionParts(1)).toEqual({ parts: 1, filled: 1 });
    expect(fractionParts(0)).toEqual({ parts: 1, filled: 0 });
  });

  it('reads clock hours 1–12', () => {
    expect([1, 3, 12, 0, 13, 24].map(clockHour)).toEqual([1, 3, 12, 12, 1, 12]);
  });

  it('tells coins apart by size and rim', () => {
    expect([1, 5, 10, 25, 30, 7].map(coinValue)).toEqual([1, 5, 10, 25, 25, 5]);
    expect(COIN_LOOK[10].r).toBeLessThan(COIN_LOOK[1].r);
    expect(COIN_LOOK[1].r).toBeLessThan(COIN_LOOK[5].r);
    expect(COIN_LOOK[5].r).toBeLessThan(COIN_LOOK[25].r);
    expect(COIN_LOOK[10].rim).toBe('reeded');
    expect(COIN_LOOK[5].rim).toBe('smooth');
  });
});

describe('contrast of pebbles, eyes and marks (06 §7)', () => {
  it('covers every palette’s pebble bed', () => {
    for (const p of PEBBLING_PALETTES) {
      const bed = PALETTE_FILLS[p].belly;
      expect(CHARACTER_CONTRAST_PAIRS.some((r) => r.fg === PEBBLE_MARK.lit && r.bg === bed)).toBe(
        true,
      );
      expect(CHARACTER_CONTRAST_PAIRS.some((r) => r.fg === PEBBLE_MARK.empty && r.bg === bed)).toBe(
        true,
      );
    }
  });

  for (const p of CHARACTER_CONTRAST_PAIRS) {
    for (const l of ['day', 'sunset'] as const) {
      it(`${p.use} (${l}) ≥ ${p.min}:1`, () => {
        expect(pairRatio(p, l)).toBeGreaterThanOrEqual(p.min);
      });
    }
  }
});

describe('character source', () => {
  it('never hard-codes a colour outside the tokens', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    }
  });

  it('never uses Math.random (art must render the same every time)', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x) && !x.endsWith('.test.ts'))) {
      expect(readFileSync(`${dir}${f}`, 'utf8'), f).not.toMatch(/Math\.random/);
    }
  });
});
