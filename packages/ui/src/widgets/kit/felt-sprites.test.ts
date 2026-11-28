import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { contrastRatio, PALETTE } from '../../tokens/tokens';
import {
  CRAB_FACES,
  FELT_KINDS,
  FELT_SURFACES,
  FELT_TONES_USED,
  type FeltKind,
  feltColors,
} from './felt-sprites';
import type { ObjectLayout, PlacedObject } from './layout';
import { ObjectSetView } from './ObjectSetView';
import { ObjectSprite, type SpriteTone } from './sprites';

const ALL_TONES: SpriteTone[] = ['a', 'b', 'red', 'white', 'blue'];

const worst = (hex: string) =>
  Math.min(...Object.values(FELT_SURFACES).map((bg) => contrastRatio(hex, bg)));

describe('felt sprites', () => {
  it('the surfaces are the felt tokens counted objects lie on', () => {
    expect(FELT_SURFACES.paper).toBe(PALETTE.paper.toUpperCase());
    expect(FELT_SURFACES.cloud).toBe(PALETTE.cloud.toUpperCase());
    expect(FELT_SURFACES.horizon).toBe(PALETTE.horizon.toUpperCase());
    expect(FELT_SURFACES.sand).toBe(PALETTE.sand.toUpperCase());
  });

  it('every tone keeps a 3:1 silhouette at every size (06 §7): the edge below 48 px, then the felt itself or a kept edge', () => {
    const low: string[] = [];
    for (const kind of Object.keys(FELT_KINDS) as FeltKind[]) {
      for (const tone of ALL_TONES) {
        const c = feltColors(kind, tone);
        if (worst(c.edge) < 3)
          low.push(`${kind}/${tone} edge ${c.edge}: ${worst(c.edge).toFixed(2)}`);
        if (!c.keepEdge && worst(c.fill) < 3)
          low.push(`${kind}/${tone} drops its edge but ${c.fill} is ${worst(c.fill).toFixed(2)}`);
      }
    }
    expect(low).toEqual([]);
  });

  it('a kept edge is only as dark as 3:1 needs: mid-dark, never near-black', () => {
    for (const kind of Object.keys(FELT_KINDS) as FeltKind[]) {
      for (const tone of ALL_TONES) {
        const { edge } = feltColors(kind, tone);
        expect(contrastRatio(edge, '#000000'), `${kind}/${tone} ${edge}`).toBeGreaterThan(2);
      }
    }
  });

  it('the tones content uses are all drawable, and group b differs from a in lightness too', () => {
    for (const kind of Object.keys(FELT_TONES_USED) as FeltKind[]) {
      const a = feltColors(kind, 'a');
      const b = feltColors(kind, 'b');
      expect(b.fill, kind).not.toBe(a.fill);
      expect(contrastRatio(a.fill, b.fill), kind).toBeGreaterThan(1.25);
    }
  });

  it('counter b carries its ring at every size and counter a has none (never colour alone)', () => {
    const b = renderToStaticMarkup(createElement(ObjectSprite, { sprite: 'counter', tone: 'b' }));
    const a = renderToStaticMarkup(createElement(ObjectSprite, { sprite: 'counter', tone: 'a' }));
    // The ring is in no detail tier: it shows at 10 px as at 112.
    const ring = b.slice(b.indexOf('data-mark="ring"'));
    expect(ring.slice(0, ring.indexOf('ni-felt'))).toContain('<circle');
    expect(a).not.toContain('data-mark');
  });

  it('draws no shadow shape: no grey ellipse under any sprite', () => {
    for (const sprite of [
      ...Object.keys(FELT_KINDS),
      'apple',
      'crate',
      'event-lunch',
      'ball',
      'cup',
    ]) {
      const svg = renderToStaticMarkup(createElement(ObjectSprite, { sprite }));
      expect(svg, sprite).not.toMatch(/rgb\(38 70 83/);
    }
  });
});

describe('crab faces', () => {
  const crab = (variant: number) =>
    renderToStaticMarkup(createElement(ObjectSprite, { sprite: 'crab', variant }));
  /** Everything but the face group and the per-render grain id. */
  const body = (svg: string) =>
    svg
      .replace(/<g class="ni-felt-lg" data-face="\d+">.*?<\/g><\/g><\/svg>$/, '')
      .replace(/ni-grain[a-zA-Z0-9]+/g, 'G')
      .replace(/data-variant="\d+"/, '');

  it('faces differ, inside the same body and box', () => {
    const faces = Array.from({ length: CRAB_FACES }, (_, v) => crab(v));
    expect(new Set(faces.map((f) => f.match(/data-face="\d+">(.*)/)?.[1])).size).toBe(CRAB_FACES);
    expect(new Set(faces.map(body)).size).toBe(1);
    for (const f of faces) expect(f).toContain('viewBox="0 0 64 64"');
  });

  it('a crab wears the face of its identity (obj-<i>), not of its place or render order', () => {
    const objects: PlacedObject[] = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
      index: i,
      kind: 'object',
      sprite: 'crab',
      x: (i * 3) % 7,
      y: Math.floor(i / 3),
      scale: 1,
      group: 0,
      tone: 'a',
    }));
    const faces = (list: PlacedObject[]) => {
      const layout: ObjectLayout = { width: 8, height: 3, objects: list, frames: [] };
      const html = renderToStaticMarkup(createElement(ObjectSetView, { layout, cell: 64 }));
      return [...html.matchAll(/data-variant="(\d+)"/g)].map((m) => Number(m[1]));
    };
    // The same objects moved and in reverse render order keep their faces.
    const moved = [...objects].reverse().map((o) => ({ ...o, x: 7 - o.x, y: 2 - o.y }));
    expect(faces(objects)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(faces(moved)).toEqual([6, 5, 4, 3, 2, 1, 0]);
  });
});
