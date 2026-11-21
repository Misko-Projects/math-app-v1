import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ObjectSprite, SPRITE_IDS } from './sprites';

/**
 * The daily-event sprites (TIM.08, "put the day in order"): waking up, breakfast, lunch, dinner
 * and bedtime, side by side at the size they have on a K order card. A child tells them apart
 * without text and reads them as one day, first to last.
 */
const meta = {
  title: 'Widgets/Kit/Event sprites',
  parameters: { ui: { stage: 'centered' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The day in order. */
const DAY = ['event-wake-up', 'event-breakfast', 'event-lunch', 'event-dinner', 'event-bedtime'];
/** A picture's box on a K order card at the tablet area, five cards in a row (measured: 72 px). */
const CARD_PICTURE_PX = 72;

export const Sheet: Story = {
  render: () => (
    <div
      className="story-sprite-sheet"
      style={{
        display: 'flex',
        gap: 32,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-paper)',
        border: '3px solid var(--color-sand-deep)',
      }}
    >
      {DAY.map((id) => (
        <div
          key={id}
          data-event={id}
          style={{ width: CARD_PICTURE_PX, height: CARD_PICTURE_PX, flex: 'none' }}
        >
          <ObjectSprite sprite={id} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const boxes = [...canvasElement.querySelectorAll<HTMLElement>('[data-event]')];
    await expect(boxes).toHaveLength(5);
    for (const id of DAY) await expect(SPRITE_IDS).toContain(id);
    // Five different drawings, none of them the pebble fallback, each drawn inside its box.
    const drawings = boxes.map((b) => (b.querySelector('svg') as SVGSVGElement).innerHTML);
    await expect(new Set(drawings).size).toBe(5);
    for (const b of boxes) {
      const svg = b.querySelector('svg') as SVGSVGElement;
      await expect(svg).toHaveAttribute('data-sprite', b.dataset.event as string);
      const bb = svg.getBBox();
      await expect(bb.x).toBeGreaterThanOrEqual(0);
      await expect(bb.y).toBeGreaterThanOrEqual(0);
      await expect(bb.x + bb.width).toBeLessThanOrEqual(64);
      await expect(bb.y + bb.height).toBeLessThanOrEqual(64);
      // No text in a sprite (K pre-readers; no letters, no clock numerals).
      await expect(svg.querySelectorAll('text')).toHaveLength(0);
    }
  },
};
