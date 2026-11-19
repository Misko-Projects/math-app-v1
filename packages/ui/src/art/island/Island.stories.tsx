import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Lighting } from '../../tokens/tokens';
import { CvdCompare, GalleryCell, GalleryGrid, GallerySection } from '../gallery/Gallery';
import { SAMPLE_ISLAND, SAMPLE_RING_COUNT } from '../gallery/sampleIsland';
import { HORIZON_Y, landCrop, plotKey, SCENE_H, SCENE_W } from './geometry';
import { IslandScene } from './IslandScene';
import type { PlotMarkerProps } from './PlotMarker';
import { ROAD_STONE_STATES, RoadStone } from './RoadStone';
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

const FIT = { width: `min(100vw, calc(100vh * ${SCENE_W / SCENE_H}))`, margin: '0 auto' };

// Free plots off the road of the sample island (the sample's road runs through every ring, so
// these are chosen beyond the stones the marker stories lay).
const MARKERS: PlotMarkerProps[] = [
  { plot: [6, 1], state: 'available' },
  { plot: [8, 5], state: 'available' },
  { plot: [4, 5], footprint: [2, 1], state: 'selected' },
];

function SceneView(a: SceneArgs) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={FIT}>
        <IslandScene
          island={SAMPLE_ISLAND}
          ringsUnlocked={a.ringsUnlocked}
          roadLength={a.roadLength}
          counting={a.counting > 0 ? a.counting : null}
          lighting={a.lighting}
          camera={{ x: a.cameraX, y: a.cameraY }}
          plotMarkers={a.markers ? MARKERS : []}
          title="The island map"
        />
      </div>
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
    cameraY: { control: { type: 'range', min: -60, max: 60, step: 10 } },
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

/** Scene units → CSS px for an SVG drawn at its viewBox width. */
function scaleOf(svg: SVGSVGElement): number {
  return svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
}

/** 06 §7, 05 §11: numerals on numbered stones are ink on pebble and large enough to read. */
async function expectStoneNumerals(root: HTMLElement, minPx: number) {
  const stones = [...root.querySelectorAll<SVGGElement>('[data-stone]:not([data-compact])')];
  await expect(stones.length).toBeGreaterThan(0);
  for (const stone of stones) {
    const text = stone.querySelector('text') as SVGTextElement;
    const ctm = text.getCTM();
    const px = Number(text.getAttribute('font-size')) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
    await expect(px, `numeral ${stone.dataset.stone}`).toBeGreaterThanOrEqual(minPx);
    await expect(text.textContent).toBe(stone.dataset.stone);
  }
}

/**
 * 05 §3: no two road stones touch, whole stones included (rings, flags, lift and sparkle), and no
 * pebble sits under a numbered stone. Measured on the rendered page.
 */
async function expectStonesApart(root: HTMLElement) {
  for (const svg of root.querySelectorAll<SVGSVGElement>('svg[data-scene="island"]')) {
    const stones = [...svg.querySelectorAll<SVGGElement>('[data-stone]')].map((g) => ({
      n: g.dataset.stone,
      box: g.getBoundingClientRect(),
    }));
    for (let i = 0; i < stones.length; i++) {
      for (let j = i + 1; j < stones.length; j++) {
        const a = stones[i]?.box as DOMRect;
        const b = stones[j]?.box as DOMRect;
        const touch = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        await expect(touch, `stones ${stones[i]?.n} and ${stones[j]?.n} touch`).toBe(false);
      }
    }
  }
}

async function expectNoSidewaysScroll() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

/** Nothing on the island reaches into the sky: island and waves are clipped at the horizon. */
async function expectHorizonClip(svg: SVGSVGElement) {
  const island = svg.querySelector('[data-layer="island"]') as SVGGElement;
  const clipped = island.parentElement as unknown as SVGGElement;
  await expect(clipped.getAttribute('clip-path') ?? '').toMatch(/^url\(#/);
  const rect = svg.querySelector('clipPath rect');
  await expect(Number(rect?.getAttribute('y'))).toBe(HORIZON_Y);
  await expect(clipped.contains(svg.querySelector('[data-layer="sea-far"]'))).toBe(true);
  // The sky is the fixed backdrop: it is never moved by the camera.
  await expect(svg.querySelector('[data-layer="sky"]')?.closest('[transform]')).toBeNull();
}

/** The island part-grown, by day: sandbar, two rings, the road to 20. */
export const Scene: Story = {
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(scaleOf(svg)).toBeGreaterThan(0.5);
    // Laid stones 1–20, every one numbered, plus the next stone (21).
    await expect(
      canvasElement.querySelectorAll('[data-stone][data-state="laid"]:not([data-compact])').length,
    ).toBe(20);
    await expect(canvasElement.querySelector('[data-stone="21"]')?.getAttribute('data-state')).toBe(
      'next',
    );
    await expectStoneNumerals(canvasElement, 18);
    await expectStonesApart(canvasElement);
    await expectHorizonClip(svg);
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
    await expectStonesApart(canvasElement);
  },
};

/** Day one: the 3-plot sandbar (05 §3), with the first stone waiting to be laid. */
export const Sandbar: Story = {
  args: { ringsUnlocked: 1, roadLength: 0 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-terrain]').length).toBe(3);
    await expect(canvasElement.querySelectorAll('[data-terrain="sand"]').length).toBe(3);
    await expect(canvasElement.querySelector('[data-stone="1"]')?.getAttribute('data-state')).toBe(
      'next',
    );
  },
};

/** The whole island and a road of 100 (stress state): a crowded road numbers its landmarks. */
export const LongRoad: Story = {
  args: { ringsUnlocked: SAMPLE_RING_COUNT, roadLength: 100 },
  play: async ({ canvasElement }) => {
    const numbered = [
      ...canvasElement.querySelectorAll<SVGGElement>('[data-stone]:not([data-compact])'),
    ].map((s) => Number(s.dataset.stone));
    for (const n of [1, 10, 20, 50, 90, 100]) await expect(numbered).toContain(n);
    await expectStonesApart(canvasElement);
    await expectStoneNumerals(canvasElement, 16);
    await expectNoSidewaysScroll();
  },
};

/** Counting the last stones of a crowded road: 99 is counted beside 100, and neither covers the other. */
export const LongRoadCounting: Story = {
  args: { ringsUnlocked: SAMPLE_RING_COUNT, roadLength: 100, counting: 99 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-stone="99"]')?.getAttribute('data-state')).toBe(
      'counting',
    );
    await expectStonesApart(canvasElement);
  },
};

/** Building placement: dashed plots with a plus are free; the solid ring with a check is chosen. */
export const PlotMarkers: Story = {
  args: { markers: true, ringsUnlocked: 4, roadLength: 12 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-plot-marker="available"]').length).toBe(2);
    await expect(canvasElement.querySelectorAll('[data-plot-marker="selected"]').length).toBe(1);
    // Markers draw on top, and no flower, tuft or rock is drawn on a marked plot.
    const layer = canvasElement.querySelector('[data-layer="island"]') as SVGGElement;
    const last = [...layer.children].slice(-MARKERS.length);
    for (const el of last) await expect(el.hasAttribute('data-plot-marker')).toBe(true);
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
    await expectStonesApart(canvasElement);
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
  },
};

const GROWTH_ROAD = [0, 12, 20, 45, 70];

/** Island growth: the sandbar and each ring, each framed on its land so numerals stay readable. */
export const Growth: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <GallerySection title="Island growth (rings)">
      <div style={{ display: 'grid', gap: 28, width: 'min(1100px, 100%)' }}>
        {SAMPLE_ISLAND.rings.map((ring, i) => (
          <GalleryCell
            key={plotKey(ring.plots[0] ?? [0, 0])}
            name={`${i === 0 ? 'Sandbar (start)' : `Ring ${i + 1}`} · road ${GROWTH_ROAD[i] ?? 0}`}
          >
            <IslandScene
              island={SAMPLE_ISLAND}
              ringsUnlocked={i + 1}
              roadLength={GROWTH_ROAD[i] ?? 0}
              crop={landCrop(SAMPLE_ISLAND, i + 1, 2.2)}
              size="100%"
              title={`Island with ${i + 1} ring${i === 0 ? '' : 's'}`}
            />
          </GalleryCell>
        ))}
      </div>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    await expectStonesApart(canvasElement);
    // ≥ 18 px at the 1440 px desktop capture; the test browser's narrower viewport gives ~15 px.
    await expectStoneNumerals(canvasElement, 14);
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
    // 05 §11: numerals ≥ 32 px at the standalone stone's default size.
    await expectStoneNumerals(canvasElement, 32);
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
    // `size` is the rendered width (ArtProps): a four-digit stone fits a 112 px slot.
    await expectNoSidewaysScroll();
  },
};

/** Sizing contract: `size` is the rendered width for every number of digits. */
export const StoneSizing: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <GallerySection title="Stones at size 112 (a recipe-card slot)">
      <GalleryGrid col={150}>
        {[7, 42, 100, 1000].map((n) => (
          <GalleryCell key={n} name={String(n)}>
            <div data-slot style={{ width: 112 }}>
              <RoadStone n={n} size={112} title={`Stone ${n}`} />
            </div>
          </GalleryCell>
        ))}
      </GalleryGrid>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    for (const svg of canvasElement.querySelectorAll('[data-slot] svg')) {
      await expect(Math.round(svg.getBoundingClientRect().width)).toBe(112);
    }
  },
};

const CVD_CROP = landCrop(SAMPLE_ISLAND, 2, 1.7, 40);

/**
 * 06 §7 colour-vision check: the stone states and plot markers under simulated CVD. States differ
 * by outline style (solid, dashed), rings, lift and icons, so they stay distinct in every column.
 */
export const ColourVision: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <GallerySection title="Colour vision: road stones and plot markers">
      <CvdCompare col={540}>
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
      </CvdCompare>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    await expectStonesApart(canvasElement);
    // ≥ 22 px in the 1440 px desktop capture; the test browser's narrower viewport gives ~20 px.
    await expectStoneNumerals(canvasElement, 18);
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
