import { CATEGORY_MARKS, type CategoryShape, PALETTE } from '../tokens/tokens';

const SHAPES: Record<CategoryShape, string> = {
  circle: 'M24 6a18 18 0 1 1 0 36a18 18 0 1 1 0-36Z',
  triangle: 'M24 6 43 40H5L24 6Z',
  square: 'M8 8h32v32H8Z',
  diamond: 'M24 4 44 24 24 44 4 24Z',
  star: 'm24 4 5.9 12.2 13.4 1.9-9.7 9.4 2.3 13.3L24 34.5l-11.9 6.3 2.3-13.3-9.7-9.4 13.4-1.9L24 4Z',
  hexagon: 'M14 6h20l10 18-10 18H14L4 24 14 6Z',
};

export interface CategoryMarkProps {
  /** Category index (0-based); wraps around the six marks. */
  index: number;
  /** Size in CSS px (default 32). */
  size?: number;
}

/**
 * The mark for a math-relevant category: a palette fill and a distinct shape with an ink outline,
 * so categories never depend on colour alone (06 §7). Decorative: pair it with a spoken or written
 * category name.
 */
export function CategoryMark({ index, size = 32 }: CategoryMarkProps) {
  const mark =
    CATEGORY_MARKS[
      ((index % CATEGORY_MARKS.length) + CATEGORY_MARKS.length) % CATEGORY_MARKS.length
    ];
  if (!mark) return null;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-shape={mark.shape}
    >
      <path
        d={SHAPES[mark.shape]}
        fill={PALETTE[mark.fill]}
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
