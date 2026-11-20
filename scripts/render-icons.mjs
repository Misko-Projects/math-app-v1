#!/usr/bin/env node
// Renders the PWA's PNG icons from the original SVG art in apps/web/public (W00, 02 §1).
// Chrome's install criteria want 192×192 and 512×512 PNG icons; the SVGs stay in the manifest too.
// The PNGs are committed; rerun after changing an SVG:
//
//   node scripts/render-icons.mjs
//
// Uses the Playwright Chromium that `pnpm browsers` installs.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/web/public');

/** `transparent`: keep the rounded corners of the "any" icon see-through. */
export const ICONS = [
  { svg: 'icon.svg', out: 'icon-192.png', size: 192, transparent: true },
  { svg: 'icon.svg', out: 'icon-512.png', size: 512, transparent: true },
  { svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512, transparent: false },
  // iOS masks the home-screen icon itself and fills transparency with black: use the full-bleed art.
  { svg: 'icon-maskable.svg', out: 'apple-touch-icon.png', size: 180, transparent: false },
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const icon of ICONS) {
      const page = await browser.newPage({
        viewport: { width: icon.size, height: icon.size },
        deviceScaleFactor: 1,
      });
      const svg = readFileSync(join(PUBLIC_DIR, icon.svg)).toString('base64');
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">` +
          `<img alt="" width="${icon.size}" height="${icon.size}" style="display:block" ` +
          `src="data:image/svg+xml;base64,${svg}"></body></html>`,
      );
      await page.locator('img').evaluate((img) => /** @type {HTMLImageElement} */ (img).decode());
      await page.screenshot({
        path: join(PUBLIC_DIR, icon.out),
        omitBackground: icon.transparent,
        clip: { x: 0, y: 0, width: icon.size, height: icon.size },
      });
      await page.close();
      console.log(`render-icons: ${icon.svg} → ${icon.out} (${icon.size}×${icon.size})`);
    }
  } finally {
    await browser.close();
  }
}

await main();
