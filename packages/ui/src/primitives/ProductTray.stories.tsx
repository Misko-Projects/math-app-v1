import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { BigButton } from './BigButton';
import { ArrowIcon } from './icons';
import { ProductTray, type TrayItem } from './ProductTray';

function Plank() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
      <rect
        x="4"
        y="11"
        width="40"
        height="26"
        rx="4"
        fill="var(--color-sunshine-light)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path
        d="M10 19h16M22 29h16"
        stroke="var(--color-wood-deep)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const planks = (n: number): TrayItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `plank-${i}`, icon: <Plank /> }));

const meta = {
  title: 'Primitives/ProductTray',
  component: ProductTray,
  args: { items: planks(3), goal: 8 },
} satisfies Meta<typeof ProductTray>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Products in ten-frames, with the goal's empty slots (progress as products, never "3/8"). */
export const Partial: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', { name: 'Your things: 3' }),
    ).toBeVisible();
  },
};

/** Nothing made yet, and no goal. */
/** Nothing made yet: an empty ten-frame shows where products will go (plus the line in text mode). */
export const Empty: Story = {
  args: { items: [], goal: undefined },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.ni-tray__slot')).toHaveLength(10);
  },
};

/** Empty in K mode: no words, just the empty slots. */
export const EmptyK: Story = { globals: { ageMode: 'k' }, args: { items: [], goal: undefined } };

/** A full ten. */
export const FullTen: Story = { args: { items: planks(10), goal: 10 } };

/** Stress: 34 products fill four ten-frames: at most three per row, then they wrap, centred. */
export const ManyStress: Story = {
  args: { items: planks(34), goal: undefined },
  render: (args) => (
    <div style={{ width: 'min(1100px, 100%)', display: 'grid', justifyItems: 'center' }}>
      <ProductTray {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tray = within(canvasElement).getByRole('region');
    await expect(tray.querySelectorAll('.ni-tray__frame')).toHaveLength(4);
    await expect(tray.scrollWidth).toBeLessThanOrEqual(tray.clientWidth + 1);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** K mode (no name tag) with a new product popping in. */
export const AddingK: Story = {
  globals: { ageMode: 'k' },
  render: () => {
    const [items, setItems] = useState<TrayItem[]>(planks(4));
    return (
      <div style={{ display: 'grid', justifyItems: 'center', gap: 28 }}>
        <ProductTray items={items} goal={6} />
        <BigButton
          label="ui.btn.next"
          icon={<ArrowIcon />}
          tone="sun"
          onPress={() => setItems((p) => [...p, { id: `plank-${p.length}`, icon: <Plank /> }])}
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(canvas.getByRole('region', { name: 'Your things: 5' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('.ni-tray__item[data-new="true"]')).toHaveLength(1);
  },
};
