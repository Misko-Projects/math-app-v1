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
  render: () => (
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
  ),
  play: async ({ canvasElement }) => {
    const states = [
      ...canvasElement.querySelectorAll<SVGSVGElement>('svg[data-character="glim"]'),
    ].map((s) => s.dataset.state);
    for (const s of GLIM_STATES) await expect(states).toContain(s);
    await expect(canvasElement.querySelectorAll('[data-part="voice-bars"]').length).toBe(1);
    await expect(canvasElement.querySelectorAll('[data-part="thinking-dots"]').length).toBe(1);
    await expectCellsApart(canvasElement);
    await expectArtInsideBox(canvasElement, 'svg[data-character="glim"]');
    await expectCaptionsAligned(canvasElement);
    await expectNoSidewaysScroll();
  },
};
