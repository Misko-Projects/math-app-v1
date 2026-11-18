import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { expectTargetSize } from '../test-support/storyHelpers';
import { BigButton } from './BigButton';
import { ArrowIcon, CheckIcon, StarIcon } from './icons';
import { ProductTray } from './ProductTray';
import { Sheet } from './Sheet';

const meta = {
  title: 'Primitives/Sheet',
  component: Sheet,
  args: { open: true, onClose: fn(), label: 'ui.story.sheet' },
  parameters: { ui: { stage: 'flush' } },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const stars = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, icon: <StarIcon /> }));

function Demo({ placement }: { placement: 'bottom' | 'center' }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <BigButton
        label="ui.btn.next"
        icon={<ArrowIcon />}
        tone="sun"
        onPress={() => setOpen(true)}
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label="ui.story.sheet"
        placement={placement}
      >
        <div style={{ display: 'grid', justifyItems: 'center', gap: 28, paddingBottom: 8 }}>
          <ProductTray items={stars} goal={10} />
          <BigButton
            label="ui.btn.check"
            icon={<CheckIcon tone="light" />}
            tone="leaf"
            onPress={() => setOpen(false)}
          />
        </div>
      </Sheet>
    </div>
  );
}

/** A bottom sheet: slides up over a dimmed scene; Escape, the close button or the backdrop close it. */
export const Bottom: Story = {
  render: () => <Demo placement="bottom" />,
  play: async ({ canvasElement }) => {
    const doc = within(canvasElement.ownerDocument.body);
    const dialog = await doc.findByRole('dialog', { name: 'Your treasure chest' });
    await waitFor(() => expect(dialog).toBeVisible());
    const close = within(dialog).getByRole('button', { name: 'Go back' });
    await expectTargetSize(close, 'g1-up');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(doc.queryByRole('dialog')).toBeNull());
    // Reopen, then close with the close button.
    await userEvent.click(doc.getByRole('button', { name: 'Next' }));
    const again = await doc.findByRole('dialog', { name: 'Your treasure chest' });
    await userEvent.click(within(again).getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(doc.queryByRole('dialog')).toBeNull());
    await userEvent.click(doc.getByRole('button', { name: 'Next' }));
    await doc.findByRole('dialog', { name: 'Your treasure chest' });
  },
};

/** A centred card (confirmations, rewards). */
export const Center: Story = {
  globals: { ageMode: 'k' },
  render: () => <Demo placement="center" />,
  play: async ({ canvasElement }) => {
    const doc = within(canvasElement.ownerDocument.body);
    const dialog = await doc.findByRole('dialog', { name: 'Your treasure chest' });
    await expectTargetSize(within(dialog).getByRole('button', { name: 'Go back' }), 'k');
  },
};
