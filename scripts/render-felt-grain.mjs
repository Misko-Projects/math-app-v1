#!/usr/bin/env node
// Renders the felt grain tile (Felt & Stitch, 05 §11) that every felt surface lays over its colour.
// The recipe is the art-direction mockup's own: two stretched fractal noises (horizontal and vertical
// fibres) bent by a slow displacement field, with light and dark fibres. They are flattened onto
// neutral grey (#808080) into an opaque WebP, which compresses far better than an alpha tile. A felt
// surface lays it over its token colour with `background-blend-mode: soft-light`, where the grey is
// neutral: the colour stays the token's and only the fibres lighten or darken it. It is baked once,
// because an SVG filter per element costs raster time on every repaint (06 §8).
// The WebP is committed; rerun after changing the recipe:
//
//   node scripts/render-felt-grain.mjs
//
// Uses the Playwright Chromium that `pnpm browsers` installs.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export const GRAIN_OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/ui/src/tokens/felt-grain.webp',
);
/** Tile size in CSS px; drawn at 1×, so it stays a fine grain at any device scale. */
export const TILE = 192;
/**
 * Strength of the fibres over the grey. The mockup lays its tile at 0.42–0.46 with normal blending;
 * soft-light halves the swing, so the fibres are drawn stronger here.
 */
export const STRENGTH = 0.8;
/** WebP quality: the fibres are soft noise, so a lossy opaque tile stays well under 20 KB. */
const QUALITY = 0.72;

/** The fibre filter (the mockup's grain_tile, at TILE px): alpha light and dark fibres. */
export function grainSvg(size = TILE) {
  const g = 3.4;
  const gd = 1.9;
  const pad = 48;
  const reg = `x='${-pad}' y='${-pad}' width='${size + 2 * pad}' height='${size + 2 * pad}'`;
  const sub = `x='0' y='0' width='${size}' height='${size}'`;
  const noise = (freq, seed, result) =>
    `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' seed='${seed}' stitchTiles='stitch' ${sub} result='${result}0'/>`;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>` +
    `<filter id='g' filterUnits='userSpaceOnUse' ${reg} color-interpolation-filters='sRGB'>` +
    noise('.085 1.5', 5, 'h') +
    `<feTile in='h0' ${reg} result='h'/>` +
    noise('1.5 .085', 8, 'v') +
    `<feTile in='v0' ${reg} result='v'/>` +
    // The displacement field is read from the alpha channel: premultiplication cannot damage it.
    noise('.07', 3, 'd') +
    `<feColorMatrix in='d0' type='matrix' values='0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1' ${sub} result='d1'/>` +
    `<feTile in='d1' ${reg} result='d'/>` +
    noise('.06', 17, 'e') +
    `<feColorMatrix in='e0' type='matrix' values='0 0 0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 1' ${sub} result='e1'/>` +
    `<feTile in='e1' ${reg} result='e'/>` +
    `<feComposite in='d' in2='e' operator='arithmetic' k1='0' k2='1' k3='1' k4='0' result='map'/>` +
    `<feDisplacementMap in='h' in2='map' scale='26' xChannelSelector='R' yChannelSelector='G' result='hd'/>` +
    `<feDisplacementMap in='v' in2='map' scale='26' xChannelSelector='G' yChannelSelector='R' result='vd'/>` +
    `<feComposite in='hd' in2='vd' operator='arithmetic' k1='0' k2='.5' k3='.5' k4='0' result='m'/>` +
    `<feColorMatrix in='m' type='matrix' values='0 0 0 0 1 0 0 0 0 .97 0 0 0 0 .9 0 0 0 ${g} ${(-g * 0.55).toFixed(2)}' result='lt'/>` +
    `<feColorMatrix in='m' type='matrix' values='0 0 0 0 .2 0 0 0 0 .11 0 0 0 0 .05 0 0 0 ${-gd} ${(gd * 0.45).toFixed(2)}' result='dk'/>` +
    `<feMerge><feMergeNode in='dk'/><feMergeNode in='lt'/></feMerge></filter>` +
    `<rect ${reg} filter='url(#g)'/></svg>`
  );
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const url = `data:image/svg+xml,${encodeURIComponent(grainSvg())}`;
    const dataUrl = await page.evaluate(
      async ({ url, size, strength, quality }) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, size, size);
        ctx.globalAlpha = strength;
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/webp', quality);
      },
      { url, size: TILE, strength: STRENGTH, quality: QUALITY },
    );
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
    writeFileSync(GRAIN_OUT, bytes);
    console.log(`felt-grain.webp: ${TILE}×${TILE}, ${bytes.length} bytes`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
