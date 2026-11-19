import type { StimulusSpec } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { expectEqualShares, measuredShares } from '../../test-support/fractionStoryArea';
import { StimulusView } from './StimulusView';

/**
 * The `fraction` stimulus (U05, #14): StimulusView's `fraction` case, drawn by FractionView. These
 * are the pictures fraction-pick, compare and order show (frac.partition, frac.compare). Every
 * picture is measured from its drawn paths: equal parts are equal, unequal parts are unequal,
 * there are exactly `parts` of them, and exactly `shaded` are filled. Filled and empty parts
 * differ by fill and by outline (solid vs dashed): check them with the vision simulator.
 */
const meta = {
  title: 'Widgets/Kit/Fraction pictures',
  parameters: { ui: { stage: 'padded' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type Fraction = Extract<StimulusSpec, { kind: 'fraction' }>;
const pic = (
  shape: Fraction['shape'],
  parts: number,
  shaded: number,
  equalParts = true,
): Fraction => ({ kind: 'fraction', shape, parts, shaded, equalParts });

/** Every shape the stimulus has, equal and unequal, with K01's counts (halves to eighths). */
const GALLERY: Fraction[] = [
  pic('circle', 2, 1),
  pic('circle', 3, 1),
  pic('circle', 4, 3),
  pic('circle', 8, 1),
  pic('circle', 2, 0, false),
  pic('circle', 4, 0, false),
  pic('rect', 2, 1),
  pic('rect', 4, 1),
  pic('rect', 3, 2),
  pic('rect', 4, 0, false),
  pic('bar', 6, 1),
  pic('bar', 8, 1),
  pic('bar', 3, 0, false),
  pic('loaf', 4, 1),
  pic('loaf', 3, 0, false),
];

function Gallery() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 230px)',
        gap: 20,
        alignItems: 'center',
        justifyItems: 'center',
      }}
    >
      {GALLERY.map((s) => (
        <div
          key={`${s.shape}-${s.parts}-${s.shaded}-${s.equalParts}`}
          className="kit-fraction-cell"
          data-spec={JSON.stringify(s)}
        >
          <StimulusView spec={s} maxWidth={200} maxHeight={150} />
        </div>
      ))}
    </div>
  );
}

/** The gallery: each picture measures true (part count, equal or not, filled count, outlines). */
export const Pictures: Story = {
  render: () => <Gallery />,
  play: async ({ canvasElement }) => {
    const cells = [...canvasElement.querySelectorAll<HTMLElement>('.kit-fraction-cell')];
    await expect(cells).toHaveLength(GALLERY.length);
    for (const cell of cells) {
      const s = JSON.parse(cell.dataset.spec as string) as Fraction;
      const view = cell.querySelector('.ni-fraction') as HTMLElement;
      await expect(view).toHaveAttribute('role', 'img');
      await expect(view).toHaveAttribute('aria-label', 'Look at the picture');
      const shares = measuredShares(view);
      if (s.equalParts) await expectEqualShares(shares, s.parts);
      else {
        await expect(shares).toHaveLength(s.parts);
        await expect(Math.max(...shares) / Math.min(...shares)).toBeGreaterThan(1.5);
      }
      const filled = [...view.querySelectorAll<SVGPathElement>('[data-fraction="filled"]')];
      const empty = [...view.querySelectorAll<SVGPathElement>('[data-fraction="empty"]')];
      await expect(filled).toHaveLength(s.shaded);
      await expect(empty).toHaveLength(s.parts - s.shaded);
      for (const p of filled) await expect(getComputedStyle(p).strokeDasharray).toBe('none');
      for (const p of empty) await expect(getComputedStyle(p).strokeDasharray).not.toBe('none');
      // Filled parts differ in lightness from empty ones, not only in hue (06 §7).
      if (filled[0] && empty[0]) {
        await expect(getComputedStyle(filled[0]).fill).not.toBe(getComputedStyle(empty[0]).fill);
      }
    }
  },
};

/** The pictures frac.compare's order items show: strips of 2, 3, 4, 6 and 8 with one part filled. */
export const CompareStrips: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16 }}>
      {[2, 3, 4, 6, 8].map((d) => (
        <div key={d} className="kit-fraction-cell" data-parts={d}>
          <StimulusView spec={pic('bar', d, 1)} maxWidth={420} maxHeight={90} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cells = [...canvasElement.querySelectorAll<HTMLElement>('.kit-fraction-cell')];
    // Same whole: every strip is drawn the same width, so one part of each compares by eye.
    const widths = cells.map((c) =>
      Math.round((c.querySelector('svg') as SVGElement).getBoundingClientRect().width),
    );
    await expect(new Set(widths).size).toBe(1);
    for (const c of cells) {
      await expectEqualShares(measuredShares(c), Number(c.dataset.parts));
    }
  },
};
