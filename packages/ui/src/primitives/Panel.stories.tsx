import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { BigButton } from './BigButton';
import { ArrowIcon } from './icons';
import { NumberDisplay } from './NumberDisplay';
import { Panel } from './Panel';

const meta = {
  title: 'Primitives/Panel',
  component: Panel,
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

// Panel titles here are parent-area style headings used as fixtures; child screens put narration
// keys inside panels instead.
function Body() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <NumberDisplay value={7} speakOnTap={false} />
      <BigButton label="ui.btn.next" icon={<ArrowIcon tone="light" />} />
    </div>
  );
}

/** The four surfaces: paper, sand, sky and driftwood. */
export const Tones: Story = {
  render: () => (
    <div
      className="story-grid"
      style={{ ['--story-col' as string]: '300px', width: 'min(1200px, 100%)' }}
    >
      {(['paper', 'sand', 'sky', 'wood'] as const).map((tone) => (
        <Panel key={tone} tone={tone} title={tone} as="section" aria-label={`${tone} panel`}>
          <Body />
        </Panel>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const panels = within(canvasElement).getAllByRole('region');
    await expect(panels).toHaveLength(4);
  },
};

export const KMode: Story = {
  globals: { ageMode: 'k' },
  render: () => (
    <Panel tone="paper">
      <Body />
    </Panel>
  ),
};
