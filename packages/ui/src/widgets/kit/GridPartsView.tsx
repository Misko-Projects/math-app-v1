import { type GridPartsSpec, gridPartRect, type NarrationKey } from '@number-island/shared';

/**
 * A grid-parts picture (03 §5.1, FRA.16): one whole, a grid of squares, cut along its lines into
 * parts. Each part has its own fill and a thick ink edge, and thin lines show its squares so a
 * child can count them; nothing is written on a part. Squares are 22 px or more (06 §4) and at
 * most 56. The accessible name gives the grid and each part's shape with the squares along its
 * sides (the stand-in for seeing it), never a part's size as a number of squares in a share.
 */

/** Part fills (palette tokens), each told apart by the edges as well as the colour (06 §7). */
const FILLS = ['sunshine-light', 'shallows', 'sun', 'leaf-light', 'sky', 'sand-deep'] as const;
/** The smallest and largest square. */
export const GRID_SQUARE_MIN = 22;
const GRID_SQUARE_MAX = 56;
const EDGE = 5;

type T = (key: NarrationKey, vars?: Record<string, string | number>) => string;

/** The size of a square that fits the grid in the box (22 to 56 px). */
export function gridSquarePx(spec: GridPartsSpec, maxWidth: number, maxHeight: number): number {
  const fit = Math.floor(Math.min((maxWidth - EDGE) / spec.cols, (maxHeight - EDGE) / spec.rows));
  return Math.max(GRID_SQUARE_MIN, Math.min(GRID_SQUARE_MAX, fit));
}

/** One part's words: "a square 2 squares wide and 2 tall", "a bar 4 squares long", … */
function partWords(cells: number[], cols: number, t: T): string {
  const r = gridPartRect(cells, cols);
  if (!r) return '';
  if (r.w === 1 || r.h === 1) return t('ui.widget.grid.bar', { n: Math.max(r.w, r.h) });
  if (r.w === r.h) return t('ui.widget.grid.square', { w: r.w, h: r.h });
  return t('ui.widget.grid.rect', { w: r.w, h: r.h });
}

/** The picture's accessible name: the grid, how many parts, then each part in reading order. */
export function describeGridParts(spec: GridPartsSpec, t: T): string {
  const parts = spec.parts.map((p) => partWords(p, spec.cols, t)).join(', ');
  return `${t('ui.widget.grid.intro', { rows: spec.rows, cols: spec.cols, n: spec.parts.length })} ${parts}.`;
}

export function GridPartsView({
  spec,
  maxWidth,
  maxHeight,
  label,
}: {
  spec: GridPartsSpec;
  maxWidth: number;
  maxHeight: number;
  label: string;
}) {
  const s = gridSquarePx(spec, maxWidth, maxHeight);
  const w = spec.cols * s;
  const h = spec.rows * s;
  const pad = EDGE / 2;
  const rects = spec.parts.map((p) => gridPartRect(p, spec.cols));
  return (
    <svg
      className="ni-grid-parts"
      role="img"
      aria-label={label}
      viewBox={`${-pad} ${-pad} ${w + EDGE} ${h + EDGE}`}
      width={w + EDGE}
      height={h + EDGE}
      data-square-px={s}
      data-parts={spec.parts.length}
    >
      {rects.map((r, k) =>
        r ? (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
            key={k}
            className="ni-grid-parts__part"
            data-part={k}
          >
            <rect
              x={r.col * s}
              y={r.row * s}
              width={r.w * s}
              height={r.h * s}
              fill={`var(--color-${FILLS[k % FILLS.length]})`}
            />
            {/* Thin lines between the part's own squares, so each square can be counted. */}
            {Array.from({ length: r.w - 1 }, (_, i) => (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: grid lines are positional
                key={`v${i}`}
                x1={(r.col + i + 1) * s}
                x2={(r.col + i + 1) * s}
                y1={r.row * s}
                y2={(r.row + r.h) * s}
                stroke="var(--color-ink-soft)"
                strokeWidth="1.5"
              />
            ))}
            {Array.from({ length: r.h - 1 }, (_, i) => (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: grid lines are positional
                key={`h${i}`}
                x1={r.col * s}
                x2={(r.col + r.w) * s}
                y1={(r.row + i + 1) * s}
                y2={(r.row + i + 1) * s}
                stroke="var(--color-ink-soft)"
                strokeWidth="1.5"
              />
            ))}
          </g>
        ) : null,
      )}
      {/* The cuts: a thick ink edge around every part (the whole's outline included). */}
      {rects.map((r, k) =>
        r ? (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional
            key={`e${k}`}
            className="ni-grid-parts__edge"
            x={r.col * s}
            y={r.row * s}
            width={r.w * s}
            height={r.h * s}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={EDGE}
            strokeLinejoin="round"
          />
        ) : null,
      )}
    </svg>
  );
}
