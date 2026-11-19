import type { PaletteColor } from '../../tokens/tokens';
import type { ArtContrastPair } from '../core/contrast';

/**
 * The silhouette line colours of each material icon (the `Contour` strokes). An icon's outline is
 * what makes it readable at 48 px, so every one is a dark shade that stays ≥ 3:1 on the surfaces
 * icons sit on (06 §7, icons ≥ 3:1).
 */
export const MATERIAL_EDGES = {
  stone: ['ink-soft'],
  light: ['sea-deep', 'wood-deep'],
  plank: ['wood-deep'],
  gem: ['sea-dark'],
  brick: ['wood-deep'],
  produce: ['wood-deep', 'leaf-dark'],
  bread: ['wood-deep'],
  coin: ['wood-deep'],
  ticket: ['ink-soft'],
  glass: ['wood-deep'],
  beam: ['wood-deep'],
  rope: ['wood-deep'],
  flag: ['wood-deep', 'ink-soft'],
  fruit: ['wood-deep', 'leaf-dark'],
} as const satisfies Record<string, readonly PaletteColor[]>;

/** Where material icons are shown: recipe cards and panels (paper), the Storehouse (sand) and the
 * product tray's slots (closest token: sand-shadow). */
const SURFACES = [
  { bg: 'paper', name: 'recipe card' },
  { bg: 'sand', name: 'Storehouse' },
  { bg: 'sand-shadow', name: 'product tray slot' },
] as const satisfies readonly { bg: PaletteColor; name: string }[];

function edgeRows(): ArtContrastPair[] {
  const users = new Map<PaletteColor, string[]>();
  for (const [id, edges] of Object.entries(MATERIAL_EDGES)) {
    for (const e of edges as readonly PaletteColor[]) users.set(e, [...(users.get(e) ?? []), id]);
  }
  const rows: ArtContrastPair[] = [];
  for (const [fg, ids] of users) {
    for (const s of SURFACES) {
      rows.push({ use: `Icon outline (${ids.join(', ')}) on the ${s.name}`, fg, bg: s.bg, min: 3 });
    }
  }
  return rows;
}

/**
 * Every material-icon mark and the surface it sits on, with its 06 §7 threshold, checked by day and
 * at sunset (materials.test.ts). Same shape as core/contrast.ts.
 */
export const MATERIAL_CONTRAST_PAIRS: readonly ArtContrastPair[] = [
  ...edgeRows(),
  { use: 'Ticket boat (sea-deep on the ticket paper)', fg: 'sea-deep', bg: 'paper', min: 3 },
  { use: 'Ticket perforation (ink-soft on paper)', fg: 'ink-soft', bg: 'paper', min: 3 },
  {
    use: 'Beam measuring marks (wood-deep on the timber)',
    fg: 'wood-deep',
    bg: 'sunshine',
    min: 3,
  },
];
