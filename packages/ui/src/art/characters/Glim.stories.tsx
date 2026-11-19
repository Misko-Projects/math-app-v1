import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Lighting } from '../../tokens/tokens';
import { GalleryCell, GalleryGrid, GallerySection } from '../gallery/Gallery';
import { GLIM_STATES, Glim, type GlimState } from './Glim';
import {
  expectArtInsideBox,
  expectCaptionsAligned,
  expectCellsApart,
  expectNoSidewaysScroll,
  expectSomeLoops,
} from './storyChecks';

/**
 * Art Gallery: Glim (07 §7), the lantern-robot who voices AI feedback. A friendly machine, never a
 * person: a glowing lantern with a handle, an antenna, bolts and a screen face with light-bar eyes.
 */

interface GlimArgs {
  state: GlimState;
  lighting: Lighting;
  size: number;
}

const meta = {
  title: 'Art Gallery/Characters/Glim',
  parameters: { ui: { stage: 'padded' } },
  argTypes: {
    state: { control: 'inline-radio', options: GLIM_STATES },
    lighting: { control: 'inline-radio', options: ['day', 'sunset'] },
    size: { control: { type: 'range', min: 80, max: 360, step: 10 } },
  },
  args: { state: 'idle', lighting: 'day', size: 240 },
  render: (a: GlimArgs) => (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
      <Glim state={a.state} lighting={a.lighting} size={a.size} title="Glim" />
    </div>
  ),
} satisfies Meta<GlimArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Glim, driven by the controls (state, lighting, size). */
export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const svg = canvasElement.querySelector('svg[data-character="glim"]') as SVGSVGElement;
    await expect(svg.getAttribute('data-state')).toBe(args.state);
    await expect(svg.querySelector('[data-part="screen-eyes"]')).toBeTruthy();
    await expectSomeLoops();
  },
};

/** Glim's four states side by side. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => <GlimStatesSheet />,
  play: async ({ canvasElement }) => expectGlimStates(canvasElement),
};

/**
 * Test only: the same sheet with Storybook's Reduced motion global (review s_9507c6228fb4 #3). No
 * blink runs, so every Glim rests with its light bars open and its lids hidden.
 */
export const StatesReducedMotion: Story = {
  tags: ['!dev', '!autodocs', '!visual'],
  parameters: { controls: { disable: true } },
  globals: { motion: 'reduced' },
  render: () => <GlimStatesSheet />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-reduced-motion="true"]')).toBeTruthy();
    await expectGlimStates(canvasElement);
  },
};

function GlimStatesSheet() {
  return (
    <GallerySection title="Glim's states">
      <GalleryGrid col={230}>
        {GLIM_STATES.map((s) => (
          <GalleryCell key={s} name={s}>
            <Glim state={s} size={210} title={`Glim ${s}`} />
          </GalleryCell>
        ))}
        <GalleryCell name="idle at sunset">
          <Glim lighting="sunset" size={210} title="Glim at sunset" />
        </GalleryCell>
      </GalleryGrid>
    </GallerySection>
  );
}

async function expectGlimStates(canvasElement: HTMLElement) {
  const states = [
    ...canvasElement.querySelectorAll<SVGSVGElement>('svg[data-character="glim"]'),
  ].map((s) => s.dataset.state);
  for (const s of GLIM_STATES) await expect(states).toContain(s);
  await expect(canvasElement.querySelectorAll('[data-part="voice-bars"]').length).toBe(1);
  await expect(canvasElement.querySelectorAll('[data-part="thinking-dots"]').length).toBe(1);
  await expectCellsApart(canvasElement);
  await expectArtInsideBox(canvasElement, 'svg[data-character="glim"]');
  await expectCaptionsAligned(canvasElement);
  await expectGlimBlinks(canvasElement);
  await expectNoSidewaysScroll();
}

/** Reduced motion is on: Storybook's global (UiProvider's data-reduced-motion) or the OS setting. */
function reducedMotion(root: HTMLElement) {
  return (
    root.querySelector('[data-reduced-motion="true"]') !== null ||
    root.closest('[data-reduced-motion="true"]') !== null ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Glim blinks by swapping its light bars for curved light lids, never by squashing a bar (review
 * s_eab7ff900e77 #4): at the closed moment (97% of the 5 s blink) every blinking Glim shows its
 * lids and hides its bars; at rest it shows the bars. With reduced motion (06 §7) nothing blinks:
 * every Glim rests with its bars open (review s_9507c6228fb4 #3).
 */
async function expectGlimBlinks(root: HTMLElement) {
  const blinks = [
    ...root.querySelectorAll<SVGGElement>('[data-part="screen-eyes"] [data-part="blink"]'),
  ];
  // Every state but "appear" (happy chevrons) has blinking bars.
  await expect(blinks.length).toBe(GLIM_STATES.length);
  const opacity = (el: Element | null) => Number(getComputedStyle(el as Element).opacity);
  if (reducedMotion(root)) {
    for (const b of blinks) {
      await expect(b.getAnimations({ subtree: true }).length, 'no blink runs').toBe(0);
      await expect(opacity(b.querySelector('.art-blink-open')), 'bars shown').toBe(1);
      await expect(opacity(b.querySelector('[data-part="lids"]')), 'lids hidden').toBe(0);
    }
    return;
  }
  const seek = (ms: number) => {
    for (const b of blinks) {
      for (const a of b.getAnimations({ subtree: true })) {
        a.pause();
        a.currentTime = ms + Number(a.effect?.getTiming().delay ?? 0);
      }
    }
  };
  seek(4850);
  for (const b of blinks) {
    await expect(opacity(b.querySelector('.art-blink-open')), 'bars hidden').toBe(0);
    await expect(opacity(b.querySelector('[data-part="lids"]')), 'lids shown').toBe(1);
  }
  seek(1000);
  for (const b of blinks) {
    await expect(opacity(b.querySelector('.art-blink-open')), 'bars shown').toBe(1);
    await expect(opacity(b.querySelector('[data-part="lids"]')), 'lids hidden').toBe(0);
  }
  for (const b of blinks) for (const a of b.getAnimations({ subtree: true })) a.play();
}
