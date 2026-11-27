import { fractionPicture, type PictureShape } from '@number-island/engine';
import type { ReactNode } from 'react';
import { pictureProps } from './a11y';
import {
  cutPaths,
  fitScale,
  type PartGeom,
  pictureGeoms,
  type ShapeFrame,
  shapeFrame,
} from './fractionShapes';
import './fraction.css';

/**
 * A fraction picture (03 §5.1 `{ kind: 'fraction', shape, parts, shaded, equalParts }`): a whole
 * cut into `parts` parts, the first `shaded` of them filled. Equal parts are exactly equal (the
 * engine's geometry, mapped linearly); with `equalParts: false` they are visibly unequal and there
 * are still `parts` of them. Filled and empty parts differ by fill AND outline (solid vs dashed),
 * as the Half-Crab's FractionShell draws them, so the picture never relies on colour alone
 * (06 §7). The cuts are two-tone lines (dark with a light core), so they show between two filled
 * parts too. The picture has no numerals: grade 1 names fractions in words (FRA.yaml).
 */

export interface FractionViewProps {
  shape: PictureShape;
  parts: number;
  shaded: number;
  equalParts: boolean;
  /** Box the picture fits in, in CSS px. */
  maxWidth?: number;
  maxHeight?: number;
  /** Accessible name (a picture's name never says the quantity asked for). */
  label?: string;
  /** Demo `overlay {a, b}`: an a/b guide drawn over the picture to compare. */
  overlay?: { a: number; b: number } | null;
  /** Demo `count-parts`: the part being counted. */
  counting?: number | null;
  className?: string;
}

export function FractionView({
  shape,
  parts,
  shaded,
  equalParts,
  maxWidth = 320,
  maxHeight = 240,
  label,
  overlay,
  counting = null,
  className,
}: FractionViewProps) {
  const frame = shapeFrame(shape);
  const picture = fractionPicture(shape, parts, equalParts);
  const geoms = pictureGeoms(frame, picture);
  const scale = fitScale(frame, maxWidth, maxHeight);
  const filled = Math.max(0, Math.min(geoms.length, Math.floor(shaded)));
  return (
    <div
      className={['ni-fraction', className].filter(Boolean).join(' ')}
      data-shape={shape}
      data-parts={geoms.length}
      data-shaded={filled}
      data-equal={equalParts ? 'true' : 'false'}
      {...pictureProps(label)}
    >
      <svg
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        width={Math.round(frame.width * scale)}
        height={Math.round(frame.height * scale)}
        aria-hidden="true"
        focusable="false"
      >
        <WholeBase frame={frame} />
        <FractionParts geoms={geoms} filled={(i) => i < filled} counting={counting} />
        <CutLines paths={cutPaths(frame, picture)} />
        {overlay ? <Overlay frame={frame} a={overlay.a} b={overlay.b} /> : null}
        <WholeOutline frame={frame} />
      </svg>
    </div>
  );
}

/**
 * A fraction written as stacked numerals, a over b with a bar (each digit ≥ 32 px, 05 §11). The
 * caller names it (its parent's label); the digits themselves are hidden from assistive tech.
 */
/**
 * A fraction's name in words, as it is said (03 §8.3: "three fourths", "one half"), from the
 * number and denominator clips' text; never "3/4" or "3 over 4" (K02 slice 5a).
 */
export function fractionWords(
  t: (key: string, vars?: Record<string, string | number>) => string,
  a: number,
  b: number,
): string {
  return `${t(`num.${a}`)} ${t(`den.${b}.${a === 1 ? 'one' : 'many'}`)}`;
}

/** Reads "a/b" (whole numbers only) as {a, b}, or null. */
export function fractionLabel(label: string | undefined): { a: number; b: number } | null {
  const m = /^(\d+)\/(\d+)$/.exec(label ?? '');
  return m ? { a: Number(m[1]), b: Number(m[2]) } : null;
}

export function FracNumeral({
  a,
  b,
  className,
  drawn = false,
}: {
  a: ReactNode;
  b: ReactNode;
  className?: string;
  /**
   * Draw the numbers as generated content, not text (K02 slice 5a): the control around it is
   * named in words ("three eighths"), and a text "3 8" inside would not match that name (axe
   * label-content-name-mismatch). Numbers only.
   */
  drawn?: boolean;
}) {
  const cls = ['ni-frac-num', className].filter(Boolean).join(' ');
  if (drawn) {
    return (
      <span className={cls} aria-hidden="true" data-drawn="true">
        <span data-slot="a" data-n={String(a)} /> <span data-slot="b" data-n={String(b)} />
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden="true">
      <span data-slot="a">{a}</span> <span data-slot="b">{b}</span>
    </span>
  );
}

/**
 * The whole's rim (or crust) and its parts area, under the parts. `ghost`: once the whole is cut
 * apart, only a faint dashed outline of where it was (nothing shows between the parts).
 */
export function WholeBase({ frame, ghost = false }: { frame: ShapeFrame; ghost?: boolean }) {
  if (ghost) {
    return frame.kind === 'circle' ? (
      <circle className="ni-fraction__ghost" cx={frame.cx} cy={frame.cy} r={frame.rim} />
    ) : (
      <path className="ni-fraction__ghost" d={frame.outline} />
    );
  }
  if (frame.kind === 'circle') {
    return (
      <g className="ni-fraction__base" data-ghost={ghost ? 'true' : undefined}>
        <circle className="ni-fraction__rim" cx={frame.cx} cy={frame.cy} r={frame.rim} />
        <circle className="ni-fraction__bed" cx={frame.cx} cy={frame.cy} r={frame.r} />
      </g>
    );
  }
  return (
    <g
      className="ni-fraction__base"
      data-shape={frame.shape}
      data-ghost={ghost ? 'true' : undefined}
    >
      <path className="ni-fraction__rim" d={frame.outline} />
      <rect className="ni-fraction__bed" x={frame.x} y={frame.y} width={frame.w} height={frame.h} />
      {frame.shape === 'loaf' ? <LoafScores frame={frame} /> : null}
      {frame.cells ? <GridCells frame={frame} /> : null}
    </g>
  );
}

/** The whole's outline on top of everything, so its edge reads the same whatever is filled. */
export function WholeOutline({ frame }: { frame: ShapeFrame }) {
  if (frame.kind === 'circle') {
    return <circle className="ni-fraction__outline" cx={frame.cx} cy={frame.cy} r={frame.rim} />;
  }
  return <path className="ni-fraction__outline" d={frame.outline} />;
}

/** A loaf's crust scores (decoration on the crust, outside the counted whole). */
function LoafScores({ frame }: { frame: Extract<ShapeFrame, { kind: 'box' }> }) {
  const marks = [0.25, 0.5, 0.75].map((t) => frame.x + t * frame.w);
  return (
    <g className="ni-fraction__scores">
      {marks.map((x) => (
        <path
          key={x}
          d={`M${x - 16} ${frame.y - 12}Q${x} ${frame.y - 26} ${x + 16} ${frame.y - 16}`}
        />
      ))}
    </g>
  );
}

/** Faint cell lines of a grid whole (not cuts: a grid is one whole until it is cut). */
/** The lines between a grid's cells, in the frame's units (empty for a frame with no cells). */
export function gridCellPath(frame: ShapeFrame): string {
  if (frame.kind !== 'box' || !frame.cells) return '';
  const [cols, rows] = frame.cells;
  const lines: string[] = [];
  for (let c = 1; c < cols; c += 1) {
    const x = frame.x + (c * frame.w) / cols;
    lines.push(`M${x} ${frame.y}V${frame.y + frame.h}`);
  }
  for (let r = 1; r < rows; r += 1) {
    const y = frame.y + (r * frame.h) / rows;
    lines.push(`M${frame.x} ${y}H${frame.x + frame.w}`);
  }
  return lines.join('');
}

function GridCells({ frame }: { frame: Extract<ShapeFrame, { kind: 'box' }> }) {
  return <path className="ni-fraction__cells" d={gridCellPath(frame)} />;
}

/**
 * Parts: empty ones first (dashed), then filled ones (solid), so an edge between a filled and an
 * empty part is solid. `render` may wrap a part (a tap target); `transform` moves a part apart.
 */
export function FractionParts({
  geoms,
  filled,
  counting = null,
  render,
  transform,
}: {
  geoms: readonly PartGeom[];
  filled: (i: number) => boolean;
  counting?: number | null;
  render?: (i: number, path: ReactNode) => ReactNode;
  transform?: (i: number) => string | undefined;
}) {
  const order = geoms.map((_, i) => i).sort((a, b) => Number(filled(a)) - Number(filled(b)));
  return (
    <g className="ni-fraction__parts">
      {order.map((i) => {
        const g = geoms[i] as PartGeom;
        const lit = filled(i);
        const path = (
          <path
            className="ni-fraction__part"
            d={g.d}
            data-part={i}
            data-fraction={lit ? 'filled' : 'empty'}
            data-counting={counting === i ? 'true' : undefined}
          />
        );
        return (
          <g key={i} transform={transform?.(i)} data-part-group={i}>
            {render ? render(i, path) : path}
          </g>
        );
      })}
    </g>
  );
}

/** Two-tone cut lines: a dark line that shows on empty parts, with a light core between filled ones. */
export function CutLines({ paths }: { paths: readonly string[] }) {
  if (paths.length === 0) return null;
  const d = paths.join('');
  return (
    <g className="ni-fraction__cuts" data-cuts={paths.length}>
      <path className="ni-fraction__cut" d={d} />
      <path className="ni-fraction__cut-core" d={d} />
    </g>
  );
}

/** Demo overlay: an a/b guide (its cut lines, and the first a parts outlined) over the picture. */
function Overlay({ frame, a, b }: { frame: ShapeFrame; a: number; b: number }) {
  const shape: PictureShape =
    frame.kind === 'circle'
      ? 'circle'
      : frame.shape === 'bar' || frame.shape === 'loaf'
        ? frame.shape
        : 'rect';
  const pic = fractionPicture(shape, b, true);
  const geoms = pictureGeoms(frame, pic);
  return (
    <g className="ni-fraction__overlay" data-overlay={`${a}/${b}`}>
      <path className="ni-fraction__overlay-cut" d={cutPaths(frame, pic).join('')} />
      {geoms.slice(0, a).map((g) => (
        <path key={g.d} className="ni-fraction__overlay-part" d={g.d} />
      ))}
    </g>
  );
}
