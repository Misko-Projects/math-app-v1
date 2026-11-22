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

/**
 * As many columns as fit (each card is at most 262 px: a 200 px picture in the stimulus card), so
 * the gallery wraps inside any viewport instead of running off its right edge.
 */
function Gallery() {
  return (
    <div
      className="kit-fraction-gallery"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
        gap: 20,
        width: '100%',
        boxSizing: 'border-box',
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

/** Margin every card keeps from the edges of the viewport (or of the frame it is drawn in), px. */
const EDGE = 8;

/**
 * Every picture card lies fully inside the viewport with EDGE px to spare, or inside `frame` (the
 * stage content box at a given viewport, already 40 px in from its edges), and nothing scrolls
 * sideways.
 */
async function expectCardsInside(canvasElement: HTMLElement, frame?: HTMLElement) {
  const margin = frame ? 0 : EDGE;
  const box = frame?.getBoundingClientRect() ?? {
    left: 0,
    right: document.documentElement.clientWidth,
  };
  const cards = [...canvasElement.querySelectorAll<HTMLElement>('.kit-fraction-cell .ni-stimulus')];
  await expect(cards.length).toBeGreaterThan(0);
  for (const [i, card] of cards.entries()) {
    const r = card.getBoundingClientRect();
    await expect(r.left, `card ${i} left`).toBeGreaterThanOrEqual(box.left + margin);
    await expect(r.right, `card ${i} right`).toBeLessThanOrEqual(box.right - margin);
  }
  if (frame) {
    await expect(frame.scrollWidth, 'the frame does not scroll across').toBeLessThanOrEqual(
      frame.clientWidth + 1,
    );
    return;
  }
  const root = document.documentElement;
  await expect(root.scrollWidth, 'the page does not scroll across').toBeLessThanOrEqual(
    root.clientWidth + 1,
  );
}

const frameOf = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.kit-fraction-frame') as HTMLElement;

/** The tablet viewport (1280 × 800): the gallery wraps, every card fully visible. */
export const PicturesAt1280: Story = {
  render: atViewport(1280),
  play: async ({ canvasElement }) => expectCardsInside(canvasElement, frameOf(canvasElement)),
};

/** The desktop viewport (1440 × 900): the same. */
export const PicturesAt1440: Story = {
  render: atViewport(1440),
  play: async ({ canvasElement }) => expectCardsInside(canvasElement, frameOf(canvasElement)),
};

/**
 * The gallery as the padded story stage lays it out at a viewport `vw` px wide (40 px padding
 * each side), whatever viewport the story runs in.
 */
function atViewport(vw: number) {
  return () => (
    <div className="kit-fraction-frame" style={{ width: vw - 80, maxWidth: 'none' }}>
      <Gallery />
    </div>
  );
}

/** The gallery: each picture measures true (part count, equal or not, filled count, outlines). */
export const Pictures: Story = {
  render: () => <Gallery />,
  play: async ({ canvasElement }) => {
    await expectCardsInside(canvasElement);
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

function Strips() {
  return (
    <div style={{ display: 'grid', gap: 16, justifyItems: 'start', maxWidth: '100%' }}>
      {[2, 3, 4, 6, 8].map((d) => (
        <div key={d} className="kit-fraction-cell" data-parts={d} style={{ maxWidth: '100%' }}>
          <StimulusView spec={pic('bar', d, 1)} maxWidth={420} maxHeight={90} />
        </div>
      ))}
    </div>
  );
}

/** The pictures frac.compare's order items show: strips of 2, 3, 4, 6 and 8 with one part filled. */
export const CompareStrips: Story = {
  render: () => <Strips />,
  play: async ({ canvasElement }) => {
    await expectCardsInside(canvasElement);
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

/** The strips at the tablet (1280) and desktop (1440) viewports: fully visible, no side scroll. */
export const CompareStripsAt1280And1440: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      {[1280, 1440].map((vw) => (
        <div key={vw} className="kit-fraction-frame" data-vw={vw} style={{ width: vw - 80 }}>
          <Strips />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const frame of canvasElement.querySelectorAll<HTMLElement>('.kit-fraction-frame')) {
      await expectCardsInside(frame, frame);
    }
  },
};
