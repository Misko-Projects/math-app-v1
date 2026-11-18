import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { VisuallyHidden } from './VisuallyHidden';

const meta = {
  title: 'Primitives/VisuallyHidden',
  component: VisuallyHidden,
} satisfies Meta<typeof VisuallyHidden>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An icon-only button stays accessible: its name comes from the hidden label. */
export const IconButtonLabel: Story = {
  args: { children: 'Play the question again' },
  render: (args) => (
    <button
      type="button"
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        border: 0,
        background: '#1f6f8b',
        color: '#fff',
        fontSize: 28,
      }}
    >
      <span aria-hidden="true">▶</span>
      <VisuallyHidden {...args} />
    </button>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Play the question again' });
    await expect(button).toBeVisible();
    const label = canvas.getByText('Play the question again');
    await expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  },
};
