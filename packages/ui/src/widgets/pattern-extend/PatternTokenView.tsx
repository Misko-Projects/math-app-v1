import { PATTERN_SHAPES } from '@number-island/engine';
import type { NarrationKey, PatternToken } from '@number-island/shared';
import type { ReactElement } from 'react';
import type { PaletteColor } from '../../tokens/tokens';
import { ObjectSprite, spriteNameKey } from '../kit';

/**
 * One pattern unit (03 §5.5 `PatternToken`): an island object, a coloured shape, a number or a
 * stack of square tiles. Units of a pattern always differ by shape as well as colour (the engine
 * schema enforces it), and a coloured shape is outlined in a darker shade (≥ 3:1), so a unit never
 * depends on colour alone (06 §7). A tile stack draws exactly `tiles` squares.
 */

const isShape = (sprite: string): boolean => (PATTERN_SHAPES as readonly string[]).includes(sprite);

/**
 * Felt fill and edge per pattern colour (Felt & Stitch, slice 4b), as the kit's shape cards: a felt
 * that holds 3:1 on paper (coral 3.48, sea-deep 5.72) is edged in its own colour (no line drawn);
 * a light felt gets a same-hue edge only as dark as 3:1 needs (yellow 3.43, plain pebble 3.28).
 * Every token of a row is drawn the same way: flat felt, no stitch or grain that could single one out.
 */
const COLORS: Record<string, { fill: PaletteColor; line: string }> = {
  red: { fill: 'coral', line: 'var(--color-coral)' },
  blue: { fill: 'sea-deep', line: 'var(--color-sea-deep)' },
  yellow: {
    fill: 'sunshine',
    line: 'color-mix(in srgb, var(--color-sunshine-deep) 60%, var(--color-wood-deep))',
  },
};
const PLAIN = { fill: 'pebble', line: 'var(--felt-edge)' } as const;

const polygon = (n: number, r = 26, rot = -90): string =>
  Array.from({ length: n }, (_, k) => {
    const a = ((rot + (360 / n) * k) * Math.PI) / 180;
    return `${(32 + r * Math.cos(a)).toFixed(2)},${(33 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

type ShapeProps = { fill: string; stroke: string };
const SHAPES: Record<string, (p: ShapeProps) => ReactElement> = {
  circle: (p) => <circle cx="32" cy="32" r="24" {...p} />,
  square: (p) => <rect x="9" y="9" width="46" height="46" rx="4" {...p} />,
  triangle: (p) => <path d="M32 7 58 55H6Z" {...p} />,
  rectangle: (p) => <rect x="4" y="16" width="56" height="32" rx="4" {...p} />,
  rhombus: (p) => <path d="M32 5 57 32 32 59 7 32Z" {...p} />,
  trapezoid: (p) => <path d="M18 14h28l13 36H5Z" {...p} />,
  pentagon: (p) => <polygon points={polygon(5)} {...p} />,
  hexagon: (p) => <polygon points={polygon(6, 27, 0)} {...p} />,
  octagon: (p) => <polygon points={polygon(8, 27, 22.5)} {...p} />,
  oval: (p) => <ellipse cx="32" cy="32" rx="27" ry="17" {...p} />,
  kite: (p) => <path d="M32 4 52 26 32 60 12 26Z" {...p} />,
};

export function ShapeArt({ kind, color }: { kind: string; color?: string }) {
  const c = COLORS[color ?? ''] ?? PLAIN;
  const draw = SHAPES[kind] ?? SHAPES.circle;
  return (
    <svg
      className="ni-pattern__shape"
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      data-shape={kind}
      data-color={color}
    >
      {draw?.({ fill: `var(--color-${c.fill})`, stroke: c.line })}
    </svg>
  );
}

/** Where tile k of a stack sits: columns of five from the bottom left (so any count reads). */
export function tilePositions(n: number): { col: number; row: number }[] {
  return Array.from({ length: Math.max(0, n) }, (_, k) => ({ col: Math.floor(k / 5), row: k % 5 }));
}

/**
 * A growing shape pattern drawn as one shape (ALG.10): step 1 is a column of `start` tiles and each
 * step adds a column of `step` tiles on its right, bottom-aligned, every tile `tile` px square.
 */
export type Growth = { start: number; step: number; tile: number };

/** Columns a stack of `n` tiles takes in a growing shape. */
export const growthCols = (n: number, g: Pick<Growth, 'start' | 'step'>): number =>
  n <= g.start ? 1 : 1 + Math.ceil((n - g.start) / g.step);
/** Rows of a growing shape: its first column or an added one, whichever is taller. */
export const growthRows = (g: Pick<Growth, 'start' | 'step'>): number => Math.max(g.start, g.step);

/** Where tile k sits in a growing shape: the first column fills up, then each added column. */
export function growthPositions(
  n: number,
  g: Pick<Growth, 'start' | 'step'>,
): { col: number; row: number }[] {
  return Array.from({ length: Math.max(0, n) }, (_, k) =>
    k < g.start
      ? { col: 0, row: k }
      : { col: 1 + Math.floor((k - g.start) / g.step), row: (k - g.start) % g.step },
  );
}

/**
 * A stack of `n` tiles, drawn at the scale of a `frame`-tile stack (the largest in the pattern), so
 * every step of a growing pattern uses the same tile size and the growth shows. With `growth` the
 * stack is that shape at a fixed tile size instead.
 */
export function TileStack({
  n,
  frame = n,
  growth,
}: {
  n: number;
  frame?: number;
  growth?: Growth;
}) {
  if (growth) {
    const cols = growthCols(n, growth);
    const rows = growthRows(growth);
    const u = growth.tile;
    const w = cols * u + 4;
    const h = rows * u + 4;
    return (
      <svg
        className="ni-pattern__tiles"
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        style={{ width: w, height: h }}
        aria-hidden="true"
        focusable="false"
        data-tiles={n}
        data-tile-px={u}
      >
        {growthPositions(n, growth).map((p, k) => (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: tile k of the shape
            key={k}
            className="ni-pattern__tile"
            x={2 + p.col * u}
            y={2 + (rows - 1 - p.row) * u}
            width={u}
            height={u}
            rx="2"
          />
        ))}
      </svg>
    );
  }
  const tiles = tilePositions(n);
  const size = Math.max(n, frame, 1);
  const cols = Math.max(1, Math.ceil(size / 5));
  const rows = Math.max(1, Math.min(5, size));
  const unit = 10;
  return (
    <svg
      className="ni-pattern__tiles"
      viewBox={`0 0 ${cols * unit + 4} ${rows * unit + 4}`}
      preserveAspectRatio="xMinYMax meet"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      data-tiles={n}
    >
      {tiles.map((p, k) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: tile k of the stack
          key={k}
          className="ni-pattern__tile"
          x={2 + p.col * unit}
          y={2 + (rows - 1 - p.row) * unit}
          width={unit}
          height={unit}
          rx="1.5"
        />
      ))}
    </svg>
  );
}

export function PatternTokenView({
  token,
  frame,
  growth,
}: {
  token: PatternToken;
  frame?: number;
  growth?: Growth;
}) {
  if ('n' in token) return <span className="ni-pattern__numeral">{token.n}</span>;
  if ('tiles' in token) return <TileStack n={token.tiles} frame={frame} growth={growth} />;
  if (token.color !== undefined || isShape(token.sprite)) {
    return <ShapeArt kind={token.sprite} color={token.color} />;
  }
  return <ObjectSprite sprite={token.sprite} />;
}

/** The narration key that names a unit when tapped (a number speaks itself). */
export function tokenSpeech(token: PatternToken): NarrationKey | number {
  if ('n' in token) return token.n;
  if ('tiles' in token) return token.tiles;
  if (isShape(token.sprite)) return `shape.${token.sprite}.one`;
  return spriteNameKey(token.sprite);
}

/** A unit's accessible name: "red circle", "Shell", "12", "7 squares". */
export function tokenName(
  token: PatternToken,
  t: (key: NarrationKey, vars?: Record<string, string | number>) => string,
): string {
  if ('n' in token) return String(token.n);
  if ('tiles' in token) return t('ui.widget.pattern.squares', { n: token.tiles });
  if (isShape(token.sprite)) {
    const shape = t(`shape.${token.sprite}.one`);
    return token.color ? `${t(`word.${token.color}`)} ${shape}` : shape;
  }
  return t(spriteNameKey(token.sprite));
}
