import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { pairRatio } from '../core/contrast';
import { ISLAND_LAYOUT, plotBox } from '../island/geometry';
import { decorArtFor, registeredArt } from '../registry';
import {
  DECOR,
  DECOR_CONTRAST_PAIRS,
  DECOR_DESIGN,
  DECOR_GROUPS,
  DECOR_IDS,
  type DecorId,
  DecorPiece,
  decorAnchor,
  decorArt,
  decorBox,
  groundY,
} from '.';

const dir = fileURLToPath(new URL('.', import.meta.url));
const svg = (id: DecorId, lighting?: 'day' | 'sunset') =>
  renderToStaticMarkup(createElement(decorArt[id], { lighting }));

const WIDE: Partial<Record<DecorId, [number, number]>> = {
  fountain: [2, 2],
  'lantern-string': [2, 1],
  bunting: [2, 1],
  'rainbow-arch': [2, 1],
  'picnic-blanket': [2, 1],
};

/** Pieces with an idle loop (05 §11: flags flutter, windmill turns, fountain water, …). */
const LOOPING: DecorId[] = [
  'flag-pole',
  'bunting',
  'windmill',
  'fountain',
  'lantern-string',
  'paper-lanterns',
  'shell-chime',
  'star-balloon',
  'kite-stand',
  'palm-tree',
  'swing-bench',
];

const LIT: DecorId[] = ['lamp-post', 'lantern-string', 'paper-lanterns', 'moon-lamp'];

describe('decor registry (05 §6)', () => {
  it('registers every decor id (at least 30), each once, under decor/<id>', () => {
    expect(DECOR_IDS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(DECOR_IDS).size).toBe(DECOR_IDS.length);
    expect(Object.keys(DECOR).sort()).toEqual([...DECOR_IDS].sort());
    expect(Object.keys(decorArt).sort()).toEqual([...DECOR_IDS].sort());
    expect(Object.keys(DECOR_DESIGN).sort()).toEqual([...DECOR_IDS].sort());
    expect(registeredArt().decor.sort()).toEqual(DECOR_IDS.map((id) => `decor/${id}`).sort());
    for (const id of DECOR_IDS) expect(decorArtFor(`decor/${id}`), id).toBe(decorArt[id]);
  });

  it('puts every piece in a gallery group', () => {
    const groups = new Set(DECOR_GROUPS.map((g) => g.id));
    for (const id of DECOR_IDS) expect(groups.has(DECOR[id].group), id).toBe(true);
    expect(DECOR['rainbow-arch'].group).toBe('festival');
  });
});

describe('decor design map (footprint, viewBox, anchor bottom-centre)', () => {
  it('uses the specified footprints', () => {
    for (const id of DECOR_IDS) expect(DECOR_DESIGN[id].footprint, id).toEqual(WIDE[id] ?? [1, 1]);
  });

  it('spans the footprint width and stands inside the footprint box (origin = bottom-centre)', () => {
    for (const id of DECOR_IDS) {
      const { footprint, viewBox: v } = DECOR_DESIGN[id];
      const w = footprint[0] * ISLAND_LAYOUT.cellW;
      const h = footprint[1] * ISLAND_LAYOUT.cellH;
      expect(v.x, id).toBe(-w / 2);
      expect(v.w, id).toBe(w);
      expect(v.h, id).toBeGreaterThan(0);
      expect(v.y + v.h, `${id} bottom`).toBeLessThanOrEqual(0);
      expect(v.y + v.h, `${id} bottom`).toBeGreaterThan(-h);
    }
  });

  it('places a piece on a plot by its anchor and box', () => {
    const b = plotBox([3, 2], [2, 2]);
    expect(decorAnchor('fountain', [3, 2])).toEqual({ x: b.x + b.w / 2, y: b.y + b.h });
    const box = decorBox('fountain', [3, 2]);
    expect(box.x).toBe(b.x);
    expect(box.w).toBe(b.w);
    expect(box.y + box.h).toBeLessThanOrEqual(b.y + b.h);
    expect(groundY([1, 1])).toBeLessThan(0);
    expect(groundY([2, 2])).toBeLessThan(groundY([1, 1]));
  });
});

describe('decor rendering', () => {
  it('draws every piece as an SVG at its viewBox, decorative by default', () => {
    for (const id of DECOR_IDS) {
      const v = DECOR_DESIGN[id].viewBox;
      const out = svg(id);
      expect(out, id).toContain(`viewBox="${v.x} ${v.y} ${v.w} ${v.h}"`);
      expect(out, id).toContain(`data-decor="${id}"`);
      expect(out, id).toContain('aria-hidden="true"');
      expect(out).toBe(svg(id));
    }
  });

  it('lights lamps and lanterns at sunset only', () => {
    for (const id of DECOR_IDS) {
      expect(svg(id, 'day'), `${id} by day`).not.toContain('data-glow');
      if (LIT.includes(id))
        expect(svg(id, 'sunset'), `${id} at sunset`).toContain('data-glow="on"');
    }
  });

  it('marks every idle loop motion-loop, so reduced motion stops it (06 §7)', () => {
    for (const id of LOOPING) expect(svg(id), id).toContain('motion-loop');
    for (const id of DECOR_IDS) {
      const out = renderToStaticMarkup(
        createElement('svg', null, createElement(DecorPiece, { id, lighting: 'sunset' })),
      );
      const animated = [
        ...out.matchAll(
          /<[^>]+(?:class="[^"]*art-(?:spin|foam|glint|hop)[^"]*"|style="[^"]*animation[^"]*")[^>]*>/g,
        ),
      ];
      for (const [tag] of animated) expect(tag, id).toMatch(/class="[^"]*motion-loop/);
    }
    expect(svg('windmill')).toMatch(/class="motion-loop art-loop art-spin"/);
  });

  it('uses only art.css loops and theme tokens, which all stop under reduced motion', () => {
    const artCss = readFileSync(fileURLToPath(new URL('../art.css', import.meta.url)), 'utf8');
    const themeCss = readFileSync(
      fileURLToPath(new URL('../../tokens/theme.css', import.meta.url)),
      'utf8',
    );
    const media = artCss.slice(artCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    const themeMedia = themeCss.slice(themeCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    const themeProvider = themeCss.slice(themeCss.indexOf('[data-reduced-motion="true"] {'));
    for (const id of DECOR_IDS) {
      for (const lighting of ['day', 'sunset'] as const) {
        const out = svg(id, lighting);
        expect(out, id).not.toContain('<style');
        for (const [, cls] of out.matchAll(/\b(art-(?:spin|foam|glint|hop|ring|drift))\b/g)) {
          expect(media, `${id} ${cls}`).toContain(`.${cls}`);
          expect(artCss, `${id} ${cls}`).toContain(`[data-reduced-motion="true"] .${cls}`);
        }
        for (const [, token] of out.matchAll(/animation:\s*var\((--animate-[a-z-]+)\)/g)) {
          expect(themeMedia, `${id} ${token}`).toContain(`${token}: none`);
          expect(themeProvider, `${id} ${token}`).toContain(`${token}: none`);
        }
      }
    }
  });
});

describe('decor contrast (06 §7)', () => {
  for (const p of DECOR_CONTRAST_PAIRS) {
    for (const l of ['day', 'sunset'] as const) {
      it(`${p.use} (${l}) ≥ ${p.min}:1`, () => {
        expect(pairRatio(p, l)).toBeGreaterThanOrEqual(p.min);
      });
    }
  }
});

describe('decor source', () => {
  it('never hard-codes a colour outside the tokens', () => {
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(`${dir}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(src, f).not.toMatch(/Math\.random\s*\(/);
    }
  });
});
