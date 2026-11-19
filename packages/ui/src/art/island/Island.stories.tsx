import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Lighting } from '../../tokens/tokens';
import { CvdCompare, GalleryCell, GalleryGrid, GallerySection } from '../gallery/Gallery';
import { SAMPLE_ISLAND, SAMPLE_RING_COUNT } from '../gallery/sampleIsland';
import { HORIZON_Y, landCrop, plotKey, SCENE_H, SCENE_W } from './geometry';
import { CAMERA_MAX_Y, HORIZON_GAP, IslandScene } from './IslandScene';
import { PLOT_MARKER_INSET, PLOT_MARKER_STROKE, type PlotMarkerProps } from './PlotMarker';
import { ROAD_STONE_STATES, RoadStone, STONE_NUMERAL } from './RoadStone';
import { TerrainTile, TILE_KINDS } from './TerrainTile';

/**
 * Art Gallery: the island (05 §3, §11). The map is a gently tilted top-down 12 × 8 plot grid on a
 * layered sea with parallax, by day or at sunset. It grows from a 3-plot sandbar in rings, and the
 * Numbered Road winds through it. Use the controls to change lighting, rings, road length, the
 * counted stone and the camera pan.
 */

interface SceneArgs {
  lighting: Lighting;
  ringsUnlocked: number;
  roadLength: number;
  counting: number;
  cameraX: number;
  cameraY: number;
  markers: boolean;
}

// Free plots off the road of the sample island (the sample's road runs through every ring, so
// these are chosen beyond the stones the marker stories lay).
const MARKERS: PlotMarkerProps[] = [
  { plot: [6, 1], state: 'available' },
  { plot: [8, 5], state: 'available' },
  { plot: [4, 5], footprint: [2, 1], state: 'selected' },
];

/** The map as a full screen: the scene covers the viewport, its sky and sea bleeding past it. */
function SceneView(a: SceneArgs) {
  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      <IslandScene
        island={SAMPLE_ISLAND}
        ringsUnlocked={a.ringsUnlocked}
        roadLength={a.roadLength}
        counting={a.counting > 0 ? a.counting : null}
        lighting={a.lighting}
        camera={{ x: a.cameraX, y: a.cameraY }}
        plotMarkers={a.markers ? MARKERS : []}
        fit="fill"
        title="The island map"
      />
    </div>
  );
}

const meta = {
  title: 'Art Gallery/Island',
  parameters: { ui: { stage: 'flush' } },
  argTypes: {
    lighting: { control: 'inline-radio', options: ['day', 'sunset'] },
    ringsUnlocked: { control: { type: 'range', min: 1, max: SAMPLE_RING_COUNT, step: 1 } },
    roadLength: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    counting: { control: { type: 'number', min: 0, max: 100 } },
    cameraX: { control: { type: 'range', min: -160, max: 160, step: 10 } },
    cameraY: { control: { type: 'range', min: -60, max: 140, step: 10 } },
    markers: { control: 'boolean' },
  },
  args: {
    lighting: 'day',
    ringsUnlocked: 3,
    roadLength: 20,
    counting: 0,
    cameraX: 0,
    cameraY: 0,
    markers: false,
  },
  render: (args) => <SceneView {...(args as SceneArgs)} />,
} satisfies Meta<SceneArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Scene units → CSS px, and where scene y lands on the page. */
function sceneToPage(svg: SVGSVGElement) {
  const m = svg.getScreenCTM() as DOMMatrix;
  return { scale: m.a, y: (y: number) => m.d * y + m.f, x: (x: number) => m.a * x + m.e };
}

/** The CSS px size of a text element's font, as rendered. */
function textPx(text: SVGTextElement): number {
  const ctm = text.getCTM();
  return Number(text.getAttribute('font-size')) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
}

/**
 * 06 §7, 05 §11: every numeral on the road (numbered stones and signposts) is ink, at one size,
 * at least `minPx`, and says its own stone's number.
 */
async function expectStoneNumerals(root: HTMLElement, minPx: number) {
  const marks = [
    ...root.querySelectorAll<SVGGElement>('[data-stone]:not([data-bead]), [data-sign]'),
  ];
  await expect(marks.length).toBeGreaterThan(0);
  for (const svg of root.querySelectorAll<SVGSVGElement>('svg')) {
    const sizes = [...svg.querySelectorAll<SVGTextElement>('[data-stone] text, [data-sign] text')]
      .map(textPx)
      .filter((px) => px > 0);
    if (sizes.length < 2) continue;
    await expect(Math.max(...sizes) - Math.min(...sizes), 'numerals are one size').toBeLessThan(
      0.5,
    );
  }
  for (const mark of marks) {
    const text = mark.querySelector('text') as SVGTextElement;
    const n = mark.dataset.stone ?? mark.dataset.sign;
    await expect(textPx(text), `numeral ${n}`).toBeGreaterThanOrEqual(minPx);
    await expect(text.textContent).toBe(n);
  }
}

/**
 * 05 §3: no two road stones touch, whole stones included (rings, flags, lift and sparkle), and no
 * signpost touches a stone but its own or another sign. Measured on the rendered page.
 */
async function expectStonesApart(root: HTMLElement) {
  for (const svg of root.querySelectorAll<SVGSVGElement>('svg[data-scene="island"]')) {
    const stones = [...svg.querySelectorAll<SVGGElement>('[data-stone]')].map((g) => ({
      n: g.dataset.stone,
      box: g.getBoundingClientRect(),
    }));
    const signs = [...svg.querySelectorAll<SVGGElement>('[data-sign]')].map((g) => ({
      n: g.dataset.sign,
      box: (g.querySelector('rect') as SVGRectElement).getBoundingClientRect(),
    }));
    const touch = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const bad: string[] = [];
    for (let i = 0; i < stones.length; i++) {
      const a = stones[i] as (typeof stones)[number];
      for (let j = i + 1; j < stones.length; j++) {
        const b = stones[j] as (typeof stones)[number];
        if (touch(a.box, b.box)) bad.push(`stones ${a.n} and ${b.n}`);
      }
      for (const s of signs) {
        if (s.n !== a.n && touch(a.box, s.box)) bad.push(`sign ${s.n} on stone ${a.n}`);
      }
    }
    for (let i = 0; i < signs.length; i++) {
      for (let j = i + 1; j < signs.length; j++) {
        const a = signs[i] as (typeof signs)[number];
        const b = signs[j] as (typeof signs)[number];
        if (touch(a.box, b.box)) bad.push(`signs ${a.n} and ${b.n}`);
      }
    }
    await expect(bad).toEqual([]);
  }
}

/**
 * 05 §3, a linear board: the road shows one stone for every number from 1 to the next stone,
 * each once, and each stone follows the one before it along the road (never doubling back).
 */
async function expectLinearBoard(root: HTMLElement, last: number) {
  const svg = root.querySelector('svg[data-scene="island"]') as SVGSVGElement;
  const stones = [...svg.querySelectorAll<SVGGElement>('[data-stone]')].map((g) => {
    const b = g.getBoundingClientRect();
    return { n: Number(g.dataset.stone), x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  const numbers = stones.map((s) => s.n).sort((a, b) => a - b);
  await expect(numbers).toEqual(Array.from({ length: last }, (_, i) => i + 1));
  const at = new Map(stones.map((s) => [s.n, s]));
  for (let n = 1; n + 2 <= last; n++) {
    const a = at.get(n) as (typeof stones)[number];
    const b = at.get(n + 1) as (typeof stones)[number];
    const c = at.get(n + 2) as (typeof stones)[number];
    const ab = Math.hypot(a.x - b.x, a.y - b.y);
    const ac = Math.hypot(a.x - c.x, a.y - c.y);
    await expect(ac, `stone ${n + 2} comes before ${n + 1}`).toBeGreaterThan(ab);
  }
}

async function expectNoSidewaysScroll() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

/**
 * A full-screen scene fills the viewport (06 §1: the map scales to fit, landscape or portrait):
 * its whole view is on screen, and the sky and sea it bleeds paint every corner of the page.
 */
async function expectCoversViewport(svg: SVGSVGElement) {
  const r = svg.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  await expect(r.top).toBeLessThanOrEqual(0);
  await expect(r.left).toBeLessThanOrEqual(0);
  await expect(r.bottom).toBeGreaterThanOrEqual(vh);
  await expect(r.right).toBeGreaterThanOrEqual(vw);
  await expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  // The whole view (the viewBox) is on screen.
  const vb = svg.viewBox.baseVal;
  const page = sceneToPage(svg);
  await expect(page.x(vb.x)).toBeGreaterThanOrEqual(-1);
  await expect(page.y(vb.y)).toBeGreaterThanOrEqual(-1);
  await expect(page.x(vb.x + vb.width)).toBeLessThanOrEqual(vw + 1);
  await expect(page.y(vb.y + vb.height)).toBeLessThanOrEqual(vh + 1);
  // Every corner of the page is painted by the scene (sky above, sea below).
  for (const [x, y] of [
    [1, 1],
    [vw - 2, 1],
    [1, vh - 2],
    [vw - 2, vh - 2],
  ] as const) {
    const hit = document.elementFromPoint(x, y);
    await expect(hit?.closest('svg[data-scene="island"]'), `corner ${x},${y}`).toBe(svg);
  }
}

/**
 * The whole island stays in the sea: its shallows halo (whose curved top is the highest thing the
 * land draws) sits below the horizon with a band of open water between, unclipped. Only the
 * drifting wave glyphs are clipped to the sea. The road and buildings move with the land; the sky
 * never moves.
 */
async function expectHorizonClip(svg: SVGSVGElement) {
  const island = svg.querySelector('[data-layer="island"]') as SVGGElement;
  await expect(island.closest('[clip-path]')).toBeNull();
  const page = sceneToPage(svg);
  const horizon = page.y(HORIZON_Y);
  const halo = (svg.querySelector('[data-part="halo"]') as SVGPathElement).getBoundingClientRect();
  await expect(halo.top - horizon, 'open water behind the halo').toBeGreaterThanOrEqual(
    HORIZON_GAP * page.scale - 1,
  );
  const rect = svg.querySelector('clipPath rect');
  await expect(Number(rect?.getAttribute('y'))).toBe(HORIZON_Y);
  await expect(svg.querySelector('[data-layer="sea-far"]')?.closest('[clip-path]')).toBeTruthy();
  const on = svg.querySelector('[data-layer="on-island"]') as SVGGElement;
  await expect(on.getAttribute('transform')).toBe(island.getAttribute('transform'));
  // The sky is the fixed backdrop: it is never moved by the camera.
  await expect(svg.querySelector('[data-layer="sky"]')?.closest('[transform]')).toBeNull();
}

/** 05 §11: no ground detail (tuft, flower, rock, ripple) touches a road stone or signpost. */
async function expectDetailOffRoad(root: HTMLElement) {
  for (const svg of root.querySelectorAll<SVGSVGElement>('svg[data-scene="island"]')) {
    const marks = [
      ...[...svg.querySelectorAll('[data-stone]')].map((s) => s.getBoundingClientRect()),
      ...[...svg.querySelectorAll('[data-sign] rect')].map((s) => s.getBoundingClientRect()),
    ];
    const bad: string[] = [];
    for (const d of svg.querySelectorAll('[data-detail]')) {
      const a = d.getBoundingClientRect();
      for (const b of marks) {
        const touch = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        if (touch) bad.push(`${d.getAttribute('data-detail')} touches the road`);
      }
    }
    await expect(bad).toEqual([]);
  }
}

/**
 * The next stone stays easy to tap (06 §4: K targets ≥ 80 px): its tap target is ≥ 80 CSS px
 * across at the default zoom and is the topmost thing at the stone's centre.
 */
async function expectNextTappable(root: HTMLElement, next: number) {
  const svg = root.querySelector('svg[data-scene="island"]') as SVGSVGElement;
  const hit = svg.querySelector('[data-hit="next"]') as SVGCircleElement;
  await expect(hit).toBeTruthy();
  const page = sceneToPage(svg);
  await expect(2 * Number(hit.getAttribute('r')) * (1280 / 1400)).toBeGreaterThanOrEqual(80);
  const stone = svg.querySelector(`[data-stone="${next}"]`) as SVGGElement;
  await expect(stone.getAttribute('data-state')).toBe('next');
  const x = page.x(Number(hit.getAttribute('cx')));
  const y = page.y(Number(hit.getAttribute('cy')));
  const s = stone.getBoundingClientRect();
  await expect(Math.abs(s.left + s.width / 2 - x)).toBeLessThan(s.width / 2);
  if (x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight) {
    await expect(document.elementFromPoint(x, y)).toBe(hit);
  }
  // The tap target is the last thing drawn on the island, above buildings and markers.
  await expect(hit.parentElement?.lastElementChild).toBe(hit);
}

/** The island part-grown, by day: sandbar, two rings, the road to 20. */
export const Scene: Story = {
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(sceneToPage(svg).scale).toBeGreaterThan(0.25);
    // Laid stones 1–20, every one a numbered stone, plus the next stone (21).
    await expect(
      canvasElement.querySelectorAll('[data-stone][data-state="laid"]:not([data-bead])').length,
    ).toBe(20);
    await expect(canvasElement.querySelector('[data-stone="21"]')?.getAttribute('data-state')).toBe(
      'next',
    );
    await expectLinearBoard(canvasElement, 21);
    await expectStoneNumerals(canvasElement, 18);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
    await expectHorizonClip(svg);
    await expectCoversViewport(svg);
    await expectNextTappable(canvasElement, 21);
    await expectNoSidewaysScroll();
  },
};

/** The same island at sunset: the theme warms sky, sea, sand and grass; numerals keep their ink. */
export const Sunset: Story = {
  args: { lighting: 'sunset', ringsUnlocked: 4, roadLength: 34, counting: 34 },
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(svg.getAttribute('data-lighting')).toBe('sunset');
    await expect(getComputedStyle(svg).getPropertyValue('--color-sky').trim()).toBe('#f3b98f');
    await expect(getComputedStyle(svg).getPropertyValue('--color-ink').trim()).toBe('#264653');
    await expect(canvasElement.querySelector('[data-stone="34"]')?.getAttribute('data-state')).toBe(
      'counting',
    );
    await expectCoversViewport(svg);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
  },
};

/**
 * Day one, framed close: the view centred on the sandbar at 800 of the scene's 1400 units across
 * (about 1.75 × the full map's zoom), so the first stone reads large.
 */
const SANDBAR_VIEW = (() => {
  const w = 800;
  const h = w / (SCENE_W / SCENE_H);
  const land = landCrop(SAMPLE_ISLAND, 1);
  return { x: land.x + land.w / 2 - w / 2, y: land.y + land.h / 2 - h / 2, w, h };
})();

/**
 * Day one: the 3-plot sandbar (05 §3), with the first stone waiting to be laid. A tiny island is
 * framed close, so its one numeral is larger than on the full map (≥ 28 CSS px at 1280).
 */
export const Sandbar: Story = {
  args: { ringsUnlocked: 1, roadLength: 0 },
  render: (args) => (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      <IslandScene
        island={SAMPLE_ISLAND}
        ringsUnlocked={args.ringsUnlocked}
        roadLength={args.roadLength}
        lighting={args.lighting}
        crop={SANDBAR_VIEW}
        fit="fill"
        title="The island map on day one"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(canvasElement.querySelectorAll('[data-terrain]').length).toBe(3);
    await expect(canvasElement.querySelectorAll('[data-terrain="sand"]').length).toBe(3);
    await expect(canvasElement.querySelector('[data-stone="1"]')?.getAttribute('data-state')).toBe(
      'next',
    );
    await expectNextTappable(canvasElement, 1);
    await expectStoneNumerals(canvasElement, window.innerWidth >= 1280 ? 28 : 12);
    await expectCoversViewport(svg);
    await expectNoSidewaysScroll();
  },
};

/**
 * The whole island and a road of 100 (stress state), a linear board: one stone for every number.
 * Where stones have a plot each they are numbered stones; where three share a plot they are evenly
 * spaced beads, and signposts carry 40, 50 … 100 and the next stone at the same numeral size.
 */
export const LongRoad: Story = {
  args: { ringsUnlocked: SAMPLE_RING_COUNT, roadLength: 100 },
  play: async ({ canvasElement }) => {
    await expectLinearBoard(canvasElement, 100);
    const numbered = [
      ...canvasElement.querySelectorAll<SVGGElement>('[data-stone]:not([data-bead])'),
    ].map((s) => Number(s.dataset.stone));
    for (let n = 1; n <= 39; n++) await expect(numbered).toContain(n);
    const signs = [...canvasElement.querySelectorAll<SVGGElement>('[data-sign]')].map((s) =>
      Number(s.dataset.sign),
    );
    for (const n of [40, 50, 60, 70, 80, 90, 100]) await expect(signs).toContain(n);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
    await expectStoneNumerals(canvasElement, 18);
    await expectNoSidewaysScroll();
  },
};

/**
 * Counting the last stones of a long road: 99 is counted in order, between 98 and 100 on the road,
 * with its own signpost; the 90 and 100 signposts stay where they are.
 */
export const LongRoadCounting: Story = {
  args: { ringsUnlocked: SAMPLE_RING_COUNT, roadLength: 100, counting: 99 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-stone="99"]')?.getAttribute('data-state')).toBe(
      'counting',
    );
    await expect(canvasElement.querySelector('[data-sign="99"]')?.getAttribute('data-state')).toBe(
      'counting',
    );
    for (const n of [90, 100])
      await expect(canvasElement.querySelector(`[data-sign="${n}"]`)).toBeTruthy();
    await expectLinearBoard(canvasElement, 100);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
    await expectStoneNumerals(canvasElement, 18);
  },
};

/**
 * The next stone, 51, right beside the ten-stone 50 on a crowded stretch: both keep a readable
 * signpost, the next stone has clear ground around it, and its tap target is ≥ 80 px and on top.
 * (The buildings slice of the art kit adds the same check with a building beside the road.)
 */
export const NextBesideTen: Story = {
  args: { ringsUnlocked: SAMPLE_RING_COUNT, roadLength: 50 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-sign="50"]')?.getAttribute('data-state')).toBe(
      'laid',
    );
    await expect(canvasElement.querySelector('[data-sign="51"]')?.getAttribute('data-state')).toBe(
      'next',
    );
    await expectLinearBoard(canvasElement, 51);
    await expectNextTappable(canvasElement, 51);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
    await expectStoneNumerals(canvasElement, 18);
  },
};

/**
 * The whole long-road island panned as far down as it goes: the camera holds, so the island and
 * its halo stay in the sea with a clear band of water between them and the horizon.
 */
export const PannedToTheBack: Story = {
  args: { ringsUnlocked: SAMPLE_RING_COUNT, roadLength: 100, cameraY: 140 },
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(svg.querySelector('[data-layer="island"]')?.getAttribute('transform')).toContain(
      `-${CAMERA_MAX_Y})`,
    );
    await expectHorizonClip(svg);
    await expectCoversViewport(svg);
    await expectLinearBoard(canvasElement, 100);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
  },
};

/**
 * Building placement: dashed plots with a plus are free; the solid ring with a check is chosen.
 * Each marker sits well inside its plot, clear of the grass edge.
 */
export const PlotMarkers: Story = {
  args: { markers: true, ringsUnlocked: 4, roadLength: 12 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-plot-marker="available"]').length).toBe(2);
    await expect(canvasElement.querySelectorAll('[data-plot-marker="selected"]').length).toBe(1);
    // Markers draw on top of the road and everything on the island (only the next stone's
    // invisible tap target is above them), and no flower, tuft or rock is drawn on a marked plot.
    const layer = canvasElement.querySelector('[data-layer="on-island"]') as SVGGElement;
    await expect(layer === layer.ownerSVGElement?.lastElementChild).toBe(true);
    const last = [...layer.children].slice(-MARKERS.length - 1, -1);
    for (const el of last) await expect(el.hasAttribute('data-plot-marker')).toBe(true);
    await expect(layer.lastElementChild?.getAttribute('data-hit')).toBe('next');
    for (const m of MARKERS) {
      const [w, h] = m.footprint ?? [1, 1];
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          const key = `${m.plot[0] + dx},${m.plot[1] + dy}`;
          await expect(
            canvasElement.querySelector(`[data-terrain][data-plot="${key}"]`),
          ).toBeNull();
        }
      }
    }
    for (const rect of canvasElement.querySelectorAll('[data-plot-marker] > rect')) {
      await expect(Number(rect.getAttribute('x')) % 100).toBe(PLOT_MARKER_INSET);
    }
    // Every marker sits fully on the grass of its plots, with a margin of one outline width all
    // round: points just outside its outline, plus that margin, are all inside the grass fill.
    const grass = canvasElement.querySelector('[data-part="grass"]') as SVGPathElement;
    const outside: string[] = [];
    for (const rect of canvasElement.querySelectorAll<SVGRectElement>(
      '[data-plot-marker] > rect',
    )) {
      const [x, y, w, h, rx, sw] = ['x', 'y', 'width', 'height', 'rx', 'stroke-width'].map((a) =>
        Number(rect.getAttribute(a)),
      ) as [number, number, number, number, number, number];
      const o = sw / 2 + PLOT_MARKER_STROKE;
      const pts: [number, number][] = [];
      for (let px = x + rx; px <= x + w - rx; px += 4) pts.push([px, y - o], [px, y + h + o]);
      for (let py = y + rx; py <= y + h - rx; py += 4) pts.push([x - o, py], [x + w + o, py]);
      for (const [cx, cy, ang] of [
        [x + rx, y + rx, 225],
        [x + w - rx, y + rx, 315],
        [x + rx, y + h - rx, 135],
        [x + w - rx, y + h - rx, 45],
      ] as const) {
        const a = (ang * Math.PI) / 180;
        pts.push([cx + Math.cos(a) * (rx + o), cy + Math.sin(a) * (rx + o)]);
      }
      for (const [px, py] of pts) {
        if (!grass.isPointInFill(new DOMPoint(px, py))) {
          outside.push(`${rect.parentElement?.dataset.plot} at ${px.toFixed(0)},${py.toFixed(0)}`);
        }
      }
    }
    await expect(outside).toEqual([]);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
  },
};

/** The camera panned right and down: the far sea lags behind the island (parallax). */
export const Parallax: Story = {
  args: { ringsUnlocked: 4, roadLength: 30, cameraX: 140, cameraY: 40 },
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(svg.getAttribute('data-parallax')).toBe('on');
    const far = svg.querySelector('[data-layer="sea-far"]')?.getAttribute('transform');
    const island = svg.querySelector('[data-layer="island"]')?.getAttribute('transform');
    await expect(far).not.toBe(island);
    await expectHorizonClip(svg);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
  },
};

/** 06 §7: with reduced motion, parallax is off (sea and island move together) and no loop runs. */
export const ReducedMotion: Story = {
  args: { ringsUnlocked: 4, roadLength: 30, cameraX: 140, cameraY: 40, counting: 12 },
  globals: { motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(svg.getAttribute('data-parallax')).toBe('off');
    const t = (layer: string) =>
      svg.querySelector(`[data-layer="${layer}"]`)?.getAttribute('transform');
    await expect(t('sea-far')).toBe(t('island'));
    await expect(t('sea-near')).toBe(t('island'));
    await expectHorizonClip(svg);
    const running = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
    await expect(running.length).toBe(0);
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
  },
};

const GROWTH_ROAD = [0, 12, 20, 45, 70];
/** CSS px per scene unit for every growth stage: one zoom, so numerals are one size (≈ 21 px). */
const GROWTH_ZOOM = 0.92;

/**
 * Island growth: the sandbar and each ring, each framed on its land at the same zoom, so every
 * stage's numerals are the same size as on the map. Every stage keeps a clear zone around the
 * next stone (no tuft or flower next to it).
 */
export const Growth: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <GallerySection title="Island growth (rings)">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 28,
          justifyContent: 'center',
          alignItems: 'end',
          width: '100%',
        }}
      >
        {SAMPLE_ISLAND.rings.map((ring, i) => {
          const crop = landCrop(SAMPLE_ISLAND, i + 1, undefined, 50);
          return (
            <GalleryCell
              key={plotKey(ring.plots[0] ?? [0, 0])}
              name={`${i === 0 ? 'Sandbar (start)' : `Ring ${i + 1}`} · road ${GROWTH_ROAD[i] ?? 0}`}
            >
              <div
                data-growth-stage
                style={{ width: crop.w * GROWTH_ZOOM, maxWidth: 'calc(100vw - 96px)' }}
              >
                <IslandScene
                  island={SAMPLE_ISLAND}
                  ringsUnlocked={i + 1}
                  roadLength={GROWTH_ROAD[i] ?? 0}
                  crop={crop}
                  size="100%"
                  title={`Island with ${i + 1} ring${i === 0 ? '' : 's'}`}
                />
              </div>
            </GalleryCell>
          );
        })}
      </div>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
    // ≥ 20 px in the 1280 and 1440 px captures; the test browser's narrow viewport shrinks the
    // widest stages, so there it only checks they stay legible.
    await expectStoneNumerals(canvasElement, window.innerWidth >= 1280 ? 20 : 6);
    if (window.innerWidth >= 1280) {
      const sizes = [...canvasElement.querySelectorAll<SVGTextElement>('[data-stone] text')].map(
        textPx,
      );
      await expect(Math.max(...sizes) - Math.min(...sizes), 'one numeral size').toBeLessThan(0.5);
    }
    await expectNoSidewaysScroll();
  },
};

/** Terrain tiles and the two water tiles, by day and at sunset. */
export const TerrainTiles: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 32 }}>
      {(['day', 'sunset'] as const).map((lighting) => (
        <GallerySection
          key={lighting}
          title={lighting === 'day' ? 'Tiles by day' : 'Tiles at sunset'}
        >
          <GalleryGrid col={160}>
            {TILE_KINDS.map((k) => (
              <GalleryCell key={k} name={k}>
                <TerrainTile kind={k} lighting={lighting} size={150} title={k} />
              </GalleryCell>
            ))}
          </GalleryGrid>
        </GallerySection>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('svg[role="img"]').length).toBe(
      TILE_KINDS.length * 2,
    );
  },
};

const STONE_NUMBERS = [1, 7, 10, 20, 85, 100, 1000];

/** Road stones in every state and digit count; every tenth stone is bigger and flies a flag. */
export const RoadStones: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 28 }}>
      {ROAD_STONE_STATES.map((state) => (
        <GallerySection key={state} title={`Stones: ${state}`}>
          <GalleryGrid col={230}>
            {STONE_NUMBERS.map((n) => (
              <GalleryCell key={n} name={String(n)}>
                <RoadStone n={n} state={state} title={`${state} ${n}`} />
              </GalleryCell>
            ))}
          </GalleryGrid>
        </GallerySection>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // 05 §11: numerals ≥ 32 px at the standalone stone's default size, one size for all.
    await expectStoneNumerals(canvasElement, 32);
    const sizes = [...canvasElement.querySelectorAll<SVGTextElement>('[data-stone] text')].map(
      textPx,
    );
    await expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(0.5);
    for (const n of [10, 20, 100, 1000]) {
      await expect(
        canvasElement.querySelector(`[data-stone="${n}"] [data-part="ten-flag"]`),
      ).toBeTruthy();
    }
    // No stone (with its ring, flag or sparkle) touches its neighbour, and captions line up.
    for (const grid of canvasElement.querySelectorAll<HTMLElement>('.story-grid')) {
      const svgs = [...grid.querySelectorAll('svg[role="img"]')].map((s) =>
        s.getBoundingClientRect(),
      );
      for (let i = 1; i < svgs.length; i++) {
        const a = svgs[i - 1] as DOMRect;
        const b = svgs[i] as DOMRect;
        if (Math.abs(a.top - b.top) < a.height) {
          await expect(b.left, `stones ${i - 1} and ${i} overlap`).toBeGreaterThanOrEqual(a.right);
        }
      }
      const captions = [...grid.querySelectorAll('figcaption')].map((c) =>
        c.getBoundingClientRect(),
      );
      for (let i = 1; i < captions.length; i++) {
        const a = captions[i - 1] as DOMRect;
        const b = captions[i] as DOMRect;
        // Same grid row (the next cell is to the right): captions share a baseline.
        if (b.left > a.left) await expect(Math.abs(a.bottom - b.bottom)).toBeLessThanOrEqual(1);
      }
    }
    await expectNoSidewaysScroll();
  },
};

/**
 * One numeral size for every number (05 §11): 7, 42, 100 and 1000 at their default size. A longer
 * number makes a wider stone; its numeral never shrinks.
 */
export const StoneNumerals: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <GallerySection title="Every numeral one size: longer numbers make wider stones">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'end' }}>
        {[7, 42, 100, 1000].map((n) => (
          <GalleryCell key={n} name={String(n)}>
            <RoadStone n={n} title={`Stone ${n}`} />
          </GalleryCell>
        ))}
      </div>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    const texts = [...canvasElement.querySelectorAll<SVGTextElement>('[data-stone] text')];
    const sizes = texts.map(textPx);
    await expect(sizes.length).toBe(4);
    await expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(0.5);
    await expect(Math.min(...sizes)).toBeGreaterThanOrEqual(32);
    await expect(Number(texts[0]?.getAttribute('font-size'))).toBe(STONE_NUMERAL);
    const widths = [...canvasElement.querySelectorAll('svg[role="img"]')].map(
      (s) => s.getBoundingClientRect().width,
    );
    for (let i = 1; i < widths.length; i++) {
      await expect(widths[i] as number).toBeGreaterThan(widths[i - 1] as number);
    }
    // Each numeral fits inside its stone with room to spare.
    for (const t of texts) {
      const stone = t.closest('[data-stone]')?.getBoundingClientRect() as DOMRect;
      const box = t.getBoundingClientRect();
      await expect(box.width).toBeLessThan(stone.width * 0.85);
    }
    await expectNoSidewaysScroll();
  },
};

const CVD_CROP = landCrop(SAMPLE_ISLAND, 2, 1.7, 40);
/** A crowded stretch of the long road: laid, counted (47) and next (51) beads, with signposts. */
const CVD_BEADS_CROP = { x: 800, y: 500, w: 500, h: 265 };

/**
 * 06 §7 colour-vision check: the stone states, bead and signpost states and plot markers under
 * simulated CVD. States differ by outline style (solid, dashed), rings, lift and icons, so they
 * stay distinct in every column.
 */
export const ColourVision: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <GallerySection title="Colour vision: road stones and plot markers">
      <CvdCompare col={572}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {ROAD_STONE_STATES.map((s) => (
            <RoadStone key={s} n={8} state={s} title={s} />
          ))}
        </div>
        <IslandScene
          island={SAMPLE_ISLAND}
          ringsUnlocked={2}
          roadLength={6}
          counting={6}
          plotMarkers={[
            { plot: [5, 2], state: 'available' },
            { plot: [6, 2], footprint: [2, 1], state: 'selected' },
          ]}
          crop={CVD_CROP}
          size="100%"
          style={{ marginTop: 8 }}
          title="Road stones and plot markers"
        />
        <IslandScene
          island={SAMPLE_ISLAND}
          ringsUnlocked={SAMPLE_RING_COUNT}
          roadLength={50}
          counting={47}
          crop={CVD_BEADS_CROP}
          size="100%"
          style={{ marginTop: 8 }}
          title="Road beads and signposts"
        />
      </CvdCompare>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    await expectStonesApart(canvasElement);
    await expectDetailOffRoad(canvasElement);
    // ≥ 20 px in the 1280 and 1440 px captures; the test browser's narrow viewport gives less.
    await expectStoneNumerals(canvasElement, window.innerWidth >= 1280 ? 20 : 12);
    // The crowded stretch shows each bead state with its signpost, in every column.
    for (const [n, state] of [
      [47, 'counting'],
      [50, 'laid'],
      [51, 'next'],
    ] as const) {
      const signs = canvasElement.querySelectorAll(`[data-sign="${n}"][data-state="${state}"]`);
      const beads = canvasElement.querySelectorAll(
        `[data-bead][data-stone="${n}"][data-state="${state}"]`,
      );
      await expect(signs.length, `sign ${n}`).toBe(5);
      await expect(beads.length, `bead ${n}`).toBe(5);
    }
    // Cards wrap centred: the last row's cards sit symmetrically about the page centre.
    const grid = canvasElement.querySelector('[data-cvd-grid]') as HTMLElement;
    const cards = [...grid.querySelectorAll(':scope > figure')].map((c) =>
      c.getBoundingClientRect(),
    );
    const lastTop = Math.max(...cards.map((c) => Math.round(c.top)));
    const row = cards.filter((c) => Math.round(c.top) === lastTop);
    const box = grid.getBoundingClientRect();
    const left = Math.min(...row.map((c) => c.left)) - box.left;
    const right = box.right - Math.max(...row.map((c) => c.right));
    await expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
    await expectNoSidewaysScroll();
  },
};
