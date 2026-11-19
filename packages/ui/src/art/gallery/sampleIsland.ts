import type { IslandDef, Plot } from '@number-island/shared';

// A sample GameData island for the Art Gallery stories: a 3-plot sandbar inside four growing
// rings, and a road that winds clockwise outwards through them. Stories only; the real island is
// authored in packages/content/game (U02 game data).

function perimeter(x0: number, x1: number, y0: number, y1: number): Plot[] {
  const out: Plot[] = [];
  for (let x = x0; x <= x1; x++) out.push([x, y0]);
  for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
  for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
  for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
  return out;
}

/** Rotate a clockwise loop so it starts at `start`. */
function from(loop: Plot[], start: Plot): Plot[] {
  const i = loop.findIndex((p) => p[0] === start[0] && p[1] === start[1]);
  return [...loop.slice(i), ...loop.slice(0, i)];
}

const sandbar: Plot[] = [
  [5, 3],
  [6, 3],
  [7, 3],
];
const ring1 = perimeter(4, 8, 2, 4);
const ring2 = perimeter(3, 9, 1, 5);
const ring3 = perimeter(2, 10, 0, 6);
// The last ring adds uneven bulges (a cove, a point and a bay), so the coast is not a rectangle.
const ring4: Plot[] = [
  ...Array.from({ length: 5 }, (_, i): Plot => [3 + i, 7]),
  ...Array.from({ length: 4 }, (_, i): Plot => [1, 2 + i]),
  ...Array.from({ length: 3 }, (_, i): Plot => [11, 1 + i]),
  [0, 3],
  [0, 4],
];

/** The road's plots in order: the sandbar, then each ring clockwise, stepping outward. */
export const SAMPLE_PATH: readonly Plot[] = [
  ...sandbar,
  ...from(ring1, [8, 3]),
  ...from(ring2, [9, 2]),
  ...from(ring3, [10, 1]),
];

function road(): IslandDef['road'] {
  const out: IslandDef['road'] = [];
  const plots = SAMPLE_PATH;
  // One stone per plot for the first 40 plots, then three per plot (a long road shares plots).
  for (let n = 1; n <= 100; n++) {
    const i = n <= 40 ? n - 1 : Math.min(plots.length - 1, 40 + Math.floor((n - 41) / 3));
    const plot = plots[i] as Plot;
    out.push({ n, plot: [plot[0], plot[1]] });
  }
  return out;
}

export const SAMPLE_ISLAND: Pick<IslandDef, 'grid' | 'rings' | 'road'> = {
  grid: [12, 8],
  rings: [
    { plots: sandbar, unlock: { start: true } },
    { plots: ring1, unlock: { start: true } },
    { plots: ring2, unlock: { roadLength: 20 } },
    { plots: ring3, unlock: { residentCount: 8 } },
    { plots: ring4, unlock: { building: 'lighthouse' } },
  ],
  road: road(),
};

export const SAMPLE_RING_COUNT = SAMPLE_ISLAND.rings.length;
