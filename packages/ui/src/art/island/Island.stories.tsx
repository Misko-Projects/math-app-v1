import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Lighting } from '../../tokens/tokens';
import { CvdCompare, GalleryCell, GalleryGrid, GallerySection } from '../gallery/Gallery';
import { SAMPLE_ISLAND, SAMPLE_RING_COUNT } from '../gallery/sampleIsland';
import { plotKey, SCENE_H, SCENE_W } from './geometry';
import { IslandScene } from './IslandScene';
import { ROAD_STONE_STATES, RoadStone } from './RoadStone';
import { TerrainTile, TILE_KINDS } from './TerrainTile';

/**
 * Art Gallery: the island (05 §3, §11). The map is a gently tilted top-down 12 × 8 plot grid on a
 * layered sea with parallax, by day or at sunset. It grows from a 3-plot sandbar in rings, and the
 * Numbered Road winds through it. Use the controls to change lighting, rings, road length and the
 * camera pan.
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
          plotMarkers={
            a.markers
              ? [
                  { plot: [6, 1], state: 'available' },
                  { plot: [8, 5], state: 'available' },
                  { plot: [4, 5], footprint: [2, 1], state: 'selected' },
                ]
              : []
          }
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
    const svg = stone.ownerSVGElement as SVGSVGElement;
    const ctm = text.getCTM();
    const px = Number(text.getAttribute('font-size')) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
    await expect(px * (svg.getBoundingClientRect().width > 0 ? 1 : 0)).toBeGreaterThanOrEqual(
      minPx,
    );
    await expect(text.textContent).toBe(stone.dataset.stone);
  }
}

/** No two numbered stones overlap (05 §3 road stress state). */
async function expectNoStoneOverlap(root: HTMLElement) {
  const boxes = [
    ...root.querySelectorAll<SVGGElement>('[data-stone]:not([data-compact]) text'),
  ].map((t) => t.getBoundingClientRect());
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i] as DOMRect;
      const b = boxes[j] as DOMRect;
      const overlap =
        a.left < b.right - 1 &&
        b.left < a.right - 1 &&
        a.top < b.bottom - 1 &&
        b.top < a.bottom - 1;
      await expect(overlap, `numerals ${i} and ${j} overlap`).toBe(false);
    }
  }
}

async function expectNoSidewaysScroll() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
}

/** The island part-grown, by day: sandbar, two rings, the road to 20. */
export const Scene: Story = {
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(svg).toBeTruthy();
    await expect(scaleOf(svg)).toBeGreaterThan(0.5);
    // Laid stones 1–20 plus the next stone (21).
    await expect(canvasElement.querySelectorAll('[data-stone][data-state="laid"]').length).toBe(20);
    await expect(canvasElement.querySelector('[data-stone="21"]')?.getAttribute('data-state')).toBe(
      'next',
    );
    await expectStoneNumerals(canvasElement, 20);
    await expectNoStoneOverlap(canvasElement);
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
    await expectNoStoneOverlap(canvasElement);
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

/** The whole island and a road of 100 (stress state): a crowded road numbers only its tens. */
export const LongRoad: Story = {
  args: { ringsUnlocked: SAMPLE_RING_COUNT, roadLength: 100 },
  play: async ({ canvasElement }) => {
    const numbered = [
      ...canvasElement.querySelectorAll<SVGGElement>('[data-stone]:not([data-compact])'),
    ].map((s) => Number(s.dataset.stone));
    for (const n of [1, 10, 20, 50, 90, 100]) await expect(numbered).toContain(n);
    await expect(canvasElement.querySelectorAll('[data-stone]').length).toBe(100);
    await expectNoStoneOverlap(canvasElement);
    await expectStoneNumerals(canvasElement, 16);
    await expectNoSidewaysScroll();
  },
};

/** Building placement: dashed plots with a plus are free; the solid ring with a check is chosen. */
export const PlotMarkers: Story = {
  args: { markers: true, ringsUnlocked: 4, roadLength: 12 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-plot-marker="available"]').length).toBe(2);
    await expect(canvasElement.querySelectorAll('[data-plot-marker="selected"]').length).toBe(1);
  },
};

/** The camera panned right and down: the sky and far sea lag behind the island (parallax). */
export const Parallax: Story = {
  args: { ringsUnlocked: 4, roadLength: 30, cameraX: 140, cameraY: 40 },
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg[data-scene="island"]') as SVGSVGElement;
    await expect(svg.getAttribute('data-parallax')).toBe('on');
    const far = svg.querySelector('[data-layer="sea-far"]')?.getAttribute('transform');
    const island = svg.querySelector('[data-layer="island"]')?.getAttribute('transform');
    await expect(far).not.toBe(island);
  },
};

/** 06 §7: with reduced motion, parallax is off (every layer moves together) and no loop runs. */
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
    const running = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY);
    await expect(running.length).toBe(0);
  },
};

/** Island growth: the sandbar and each ring, side by side. */
export const Growth: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <GallerySection title="Island growth (rings)">
      <GalleryGrid col={360}>
        {SAMPLE_ISLAND.rings.map((ring, i) => (
          <GalleryCell
            key={plotKey(ring.plots[0] ?? [0, 0])}
            name={i === 0 ? 'Sandbar (start)' : `Ring ${i + 1}`}
          >
            <IslandScene
              island={SAMPLE_ISLAND}
              ringsUnlocked={i + 1}
              roadLength={[0, 12, 20, 45, 70][i] ?? 0}
              size={360}
            />
          </GalleryCell>
        ))}
      </GalleryGrid>
    </GallerySection>
  ),
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
    await expectNoSidewaysScroll();
  },
};

/**
 * 06 §7 colour-vision check: the stone states and plot markers under simulated CVD. States differ
 * by outline style (solid, dashed), rings, lift and icons, so they stay distinct in every column.
 */
export const ColourVision: Story = {
  parameters: { ui: { stage: 'padded' }, controls: { disable: true } },
  render: () => (
    <CvdCompare col={300}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
        {ROAD_STONE_STATES.map((s) => (
          <RoadStone key={s} n={8} state={s} size={84} title={s} />
        ))}
      </div>
      <IslandScene
        island={SAMPLE_ISLAND}
        ringsUnlocked={2}
        roadLength={6}
        counting={6}
        plotMarkers={[
          { plot: [4, 2], state: 'available' },
          { plot: [8, 4], state: 'selected' },
        ]}
        size="100%"
        style={{ marginTop: 8 }}
      />
    </CvdCompare>
  ),
};
