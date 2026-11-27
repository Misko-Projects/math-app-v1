import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { GalleryCell, GalleryGrid, GallerySection } from '../gallery/Gallery';
import { Guide } from './Guide';
import { GuideNameTag } from './GuideNameTag';
import { GUIDES } from './registry';
import { GUIDE_MOODS } from './types';

/**
 * Art Gallery: the guides a child chooses (05 §1, §10), sewn in Felt & Stitch: felt pieces with
 * the baked grain, even running stitches, button-bead eyes and a soft lift. Every guide has every
 * mood; the name lives on the name tag, never on the character.
 */
const meta = {
  title: 'Art Gallery/Guides',
  parameters: { ui: { stage: 'padded' } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Each guide in every mood, with its name tag. */
export const AllMoods: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      {GUIDES.map((g) => (
        <GallerySection key={g.id} title={`${g.name} (${g.animal})`}>
          <GalleryGrid>
            {GUIDE_MOODS.map((mood) => (
              <GalleryCell key={mood} name={mood}>
                <Guide guide={g.id} mood={mood} height={220} labelled />
              </GalleryCell>
            ))}
          </GalleryGrid>
          <GuideNameTag guide={g.id} />
        </GallerySection>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const drawn = canvasElement.querySelectorAll('svg[data-character="guide"]');
    await expect(drawn.length).toBe(GUIDES.length * GUIDE_MOODS.length);
    // No numeral is drawn on a character: the name is on the tag only.
    for (const svg of drawn) await expect(svg.querySelector('text')).toBeNull();
  },
};

function close(guide: string): Story {
  return {
    render: () => (
      <div style={{ display: 'grid', placeItems: 'center', gap: 16, minHeight: '80vh' }}>
        <div style={{ display: 'flex', gap: 32, alignItems: 'end' }}>
          <Guide guide={guide} mood="idle" height={400} labelled />
          <Guide guide={guide} mood="cheer" height={400} labelled />
        </div>
        <GuideNameTag guide={guide} fontSize={36} />
      </div>
    ),
  };
}

/** Shelly large, at rest and cheering (the look check captures it at device scale 2). */
export const CloseShelly: Story = close('shelly');
/** The bunny large, at rest and cheering, with the name tag "22". */
export const CloseBunny: Story = close('22');
