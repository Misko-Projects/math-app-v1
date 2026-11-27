import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { expectTargetSize } from '../test-support/storyHelpers';
import { GuideChooser } from './GuideChooser';

/**
 * The guide chooser (05 §10): at first start nothing is picked and the confirm button waits; a tap
 * picks a guide (it cheers and says its name); "Let's go!" confirms. Switching from the island
 * adds Home, which leaves without changing.
 */

function Chooser({
  initial,
  switching = false,
  onConfirm,
}: {
  initial: string | null;
  switching?: boolean;
  onConfirm?: (guide: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(initial);
  return (
    <GuideChooser
      selected={selected}
      onSelect={setSelected}
      onConfirm={() => onConfirm?.(selected)}
      {...(switching ? { onHome: () => {} } : {})}
      backdrop={<div className="absolute inset-0 bg-sea-light" />}
    />
  );
}

const meta = {
  title: 'Patterns/Guide chooser',
  parameters: { ui: { stage: 'flush' } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** First start: nothing picked, confirm disabled; tapping a card picks it, confirm sends it. */
export const FirstStart: Story = {
  render: () => <Chooser initial={null} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const confirm = c.getByRole('button', { name: "Let's go!" });
    await expect(confirm).toBeDisabled();
    const cards = c.getAllByRole('button', { pressed: false });
    await expect(cards.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Shelly, the turtle',
      '22, the bunny',
    ]);
    for (const card of cards) {
      expectTargetSize(card, 'k');
    }
  },
};

/** One picked: the card cheers on sunny felt; Let's go! is ready. */
export const OnePicked: Story = {
  render: () => <Chooser initial="22" />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('radio', { name: '22, the bunny' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(c.getByRole('button', { name: "Let's go!" })).toBeEnabled();
  },
};

/** Keyboard: Tab moves between the cards, Space picks, Tab reaches Let's go!, Enter confirms. */
const confirmed = fn();

export const Keyboard: Story = {
  render: () => <Chooser initial={null} onConfirm={confirmed} />,
  play: async ({ canvasElement }) => {
    confirmed.mockClear();
    const c = within(canvasElement);
    await userEvent.tab();
    await userEvent.tab();
    await expect(c.getByRole('radio', { name: 'Shelly, the turtle' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(c.getByRole('radio', { name: '22, the bunny' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.tab();
    await expect(c.getByRole('button', { name: "Let's go!" })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(confirmed).toHaveBeenCalledWith('22');
  },
};

/** Switching from the island: Home leaves without changing; the current guide is picked. */
export const Switching: Story = {
  render: () => <Chooser initial="shelly" switching />,
};
