import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { Lighting } from '../../tokens/tokens';
import { GalleryCell, GalleryGrid, GallerySection } from '../gallery/Gallery';
import { PIP_POSES, Pip, type PipPose } from './Pip';
import {
  expectArtInsideBox,
  expectCaptionsAligned,
  expectCellsApart,
  expectNoSidewaysScroll,
  expectSomeLoops,
} from './storyChecks';

/**
 * Art Gallery: Pip (05 §1, §10), the puffin ferry captain who guides the children: a chunky round
 * puffin in a white captain's cap with an anchor badge and a striped neckerchief. Idle bobs, sways
 * and blinks; each pose has its own motion.
 */

interface PipArgs {
  pose: PipPose;
  direction: 'left' | 'right';
  lighting: Lighting;
  size: number;
}

const meta = {
  title: 'Art Gallery/Characters/Pip',
  parameters: { ui: { stage: 'padded' } },
  argTypes: {
    pose: { control: 'inline-radio', options: PIP_POSES },
    direction: { control: 'inline-radio', options: ['left', 'right'] },
    lighting: { control: 'inline-radio', options: ['day', 'sunset'] },
    size: { control: { type: 'range', min: 100, max: 440, step: 10 } },
  },
  args: { pose: 'idle', direction: 'right', lighting: 'day', size: 320 },
  render: (a: PipArgs) => (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
      <Pip pose={a.pose} direction={a.direction} lighting={a.lighting} size={a.size} title="Pip" />
    </div>
  ),
} satisfies Meta<PipArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pip, driven by the controls (pose, pointing direction, lighting, size). */
export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const svg = canvasElement.querySelector('svg[data-character="pip"]') as SVGSVGElement;
    await expect(svg.getAttribute('data-pose')).toBe(args.pose);
    await expect(svg.querySelectorAll('[data-part="eye"]').length).toBe(2);
    await expectSomeLoops();
  },
};

/**
 * Test only: the Playground with Storybook's Reduced motion global (review s_30013473fe6d #2):
 * Pip holds still, so its loop check expects no idle loop instead.
 */
export const PlaygroundReducedMotion: Story = {
  ...Playground,
  tags: ['!dev', '!autodocs', '!visual'],
  globals: { motion: 'reduced' },
};

const CELLS: { pose: PipPose; direction?: 'left' | 'right'; name: string }[] = [
  { pose: 'idle', name: 'idle' },
  { pose: 'talk', name: 'talk' },
  { pose: 'point', direction: 'right', name: 'point → right' },
  { pose: 'point', direction: 'left', name: 'point ← left' },
  { pose: 'cheer', name: 'cheer' },
  { pose: 'think', name: 'think' },
];

/** Pip's five poses (pointing both ways), by day, and the idle pose at sunset. */
export const Poses: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <GallerySection title="Pip's poses">
      <GalleryGrid col={262}>
        {CELLS.map((c) => (
          <GalleryCell key={c.name} name={c.name}>
            <Pip pose={c.pose} direction={c.direction} size={262} title={`Pip ${c.name}`} />
          </GalleryCell>
        ))}
        <GalleryCell name="idle at sunset">
          <Pip lighting="sunset" size={262} title="Pip at sunset" />
        </GalleryCell>
      </GalleryGrid>
    </GallerySection>
  ),
  play: async ({ canvasElement }) => {
    const poses = [
      ...canvasElement.querySelectorAll<SVGSVGElement>('svg[data-character="pip"]'),
    ].map((s) => s.dataset.pose);
    for (const p of PIP_POSES) await expect(poses).toContain(p);
    await expect(canvasElement.querySelectorAll('[data-part="thought"]').length).toBe(1);
    await expect(canvasElement.querySelectorAll('svg[data-direction="left"]').length).toBe(1);
    await expectCellsApart(canvasElement);
    await expectArtInsideBox(canvasElement, 'svg[data-character="pip"]');
    await expectCaptionsAligned(canvasElement);
    await expectNoSidewaysScroll();
  },
};
