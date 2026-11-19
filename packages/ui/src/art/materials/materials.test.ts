import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { pairRatio } from '../core/contrast';
import { materialArtFor, registeredArt } from '../registry';
import { MATERIAL_CONTRAST_PAIRS, MATERIAL_EDGES, MATERIAL_IDS, materialArt } from '.';

const dir = fileURLToPath(new URL('.', import.meta.url));
const render = (id: (typeof MATERIAL_IDS)[number], props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(materialArt[id], props));

describe('material icons (05 §4 Produces)', () => {
  it('registers exactly one icon per produced material', () => {
    expect([...MATERIAL_IDS].sort()).toEqual(
      [
        'beam',
        'bread',
        'brick',
        'coin',
        'flag',
        'fruit',
        'gem',
        'glass',
        'light',
        'plank',
        'produce',
        'rope',
        'stone',
        'ticket',
      ].sort(),
    );
    expect(Object.keys(materialArt).sort()).toEqual([...MATERIAL_IDS].sort());
    expect(registeredArt().material.sort()).toEqual(
      MATERIAL_IDS.map((id) => `material/${id}`).sort(),
    );
    for (const id of MATERIAL_IDS)
      expect(materialArtFor(`material/${id}`), id).toBe(materialArt[id]);
  });

  it('draws each icon on the 64 × 64 design square, decorative unless titled', () => {
    for (const id of MATERIAL_IDS) {
      const plain = render(id, { size: 48 });
      expect(plain, id).toContain('viewBox="0 0 64 64"');
      expect(plain, id).toContain(`data-material="${id}"`);
      expect(plain, id).toContain('aria-hidden="true"');
      expect(plain, id).toContain('width="48"');
      const titled = render(id, { title: 'A thing' });
      expect(titled, id).toContain('role="img"');
      expect(titled, id).toContain('aria-label="A thing"');
    }
  });

  it('outlines every icon with its declared dark silhouette colours', () => {
    for (const id of MATERIAL_IDS) {
      const svg = render(id);
      for (const edge of MATERIAL_EDGES[id])
        expect(svg, `${id} ${edge}`).toContain(`stroke="var(--color-${edge})"`);
    }
  });

  it('gives each icon its own drawing (no two icons share their markup)', () => {
    const shapes = new Set(
      MATERIAL_IDS.map((id) => render(id).replace(/data-material="[^"]+"/, '')),
    );
    expect(shapes.size).toBe(MATERIAL_IDS.length);
  });

  it('renders the same markup every time (deterministic, snapshot-stable)', () => {
    for (const id of MATERIAL_IDS) expect(render(id)).toBe(render(id));
  });
});

describe('material icon contrast (06 §7: icons ≥ 3:1)', () => {
  for (const p of MATERIAL_CONTRAST_PAIRS) {
    for (const l of ['day', 'sunset'] as const) {
      it(`${p.use} (${l}) ≥ ${p.min}:1`, () => {
        expect(pairRatio(p, l)).toBeGreaterThanOrEqual(p.min);
      });
    }
  }

  it('has a row for every silhouette colour on every surface', () => {
    const edges = new Set(Object.values(MATERIAL_EDGES).flat());
    for (const e of edges) {
      expect(MATERIAL_CONTRAST_PAIRS.filter((p) => p.fg === e).length, e).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('material source', () => {
  it('never hard-codes a colour outside the tokens', () => {
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const src = readFileSync(`${dir}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(src, f).not.toMatch(/Math\.random\s*\(/);
    }
  });
});
