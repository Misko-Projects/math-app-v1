import type { Plot } from '@number-island/shared';
import { hashSeed, paint, seededRandom } from '../core/paint';
import { plotBox, type TerrainKind } from './geometry';
import type { StoneExtent } from './RoadStone';

/** One piece of ground detail and the box of everything it draws, in scene units. */
export type DetailItem =
  | { kind: 'tuft'; x: number; y: number; box: StoneExtent }
  | { kind: 'flower'; x: number; y: number; warm: boolean; box: StoneExtent }
  | { kind: 'rock'; x: number; y: number; box: StoneExtent }
  | { kind: 'ripple'; x: number; y: number; box: StoneExtent };

/** A test for ground that detail must keep off (for example the road's footprint). */
export type Blocked = (box: StoneExtent) => boolean;

// Each item's reach around its spot (left, right, up, down), from the drawing below.
const REACH = {
  tuft: { left: 9, right: 9, top: 11, bottom: 6 },
  flower: { left: 9, right: 9, top: 9, bottom: 9 },
  rock: { left: 22, right: 31, top: 16, bottom: 16 },
  ripple: { left: 16, right: 27, top: 6, bottom: 16 },
} as const;

/** How many seeded spots an item tries before it is left out. */
const TRIES = 8;

/**
 * The ground detail of one plot (05 §11): grass tufts and meadow flowers, a shore rock or a sand
 * ripple. Deterministic per plot. Each item stays inside its own plot and keeps off `blocked`
 * ground (the road's footprint): it tries a few seeded spots and is left out when none is clear,
 * so detail never sits under, behind or on the road.
 */
export function plotDetailItems(plot: Plot, kind: TerrainKind, blocked?: Blocked): DetailItem[] {
  const b = plotBox(plot);
  const rnd = seededRandom(hashSeed(plot[0], plot[1], 101));
  const place = <K extends keyof typeof REACH>(
    k: K,
  ): { x: number; y: number; box: StoneExtent } | null => {
    const r = REACH[k];
    for (let i = 0; i < TRIES; i++) {
      const x = b.x + r.left + 2 + rnd() * (b.w - r.left - r.right - 4);
      const y = b.y + r.top + 2 + rnd() * (b.h - r.top - r.bottom - 4);
      const box = { left: x - r.left, right: x + r.right, top: y - r.top, bottom: y + r.bottom };
      if (!blocked?.(box)) return { x, y, box };
    }
    return null;
  };
  const out: DetailItem[] = [];
  if (kind === 'grass' || kind === 'meadow') {
    for (let i = 0; i < 3; i++) {
      const p = place('tuft');
      if (p) out.push({ kind: 'tuft', ...p });
    }
    if (kind === 'meadow') {
      for (let i = 0; i < 4; i++) {
        const p = place('flower');
        if (p) out.push({ kind: 'flower', warm: i % 2 === 0, ...p });
      }
    }
  } else if (kind === 'rock') {
    const p = place('rock');
    if (p) out.push({ kind: 'rock', ...p });
  } else {
    const p = place('ripple');
    if (p) out.push({ kind: 'ripple', ...p });
  }
  return out;
}

/** Scattered detail on one plot (see plotDetailItems). */
export function PlotDetail({
  plot,
  kind,
  blocked,
}: {
  plot: Plot;
  kind: TerrainKind;
  blocked?: Blocked;
}) {
  const items = plotDetailItems(plot, kind, blocked);
  return (
    <g data-terrain={kind} data-plot={`${plot[0]},${plot[1]}`}>
      {items.map((it) => (
        <g key={`${it.kind}${it.x.toFixed(2)},${it.y.toFixed(2)}`} data-detail={it.kind}>
          <DetailMark item={it} />
        </g>
      ))}
    </g>
  );
}

function DetailMark({ item }: { item: DetailItem }) {
  const { x, y } = item;
  switch (item.kind) {
    case 'tuft':
      return (
        <path
          d={`M${x - 7} ${y + 4}q2 -9 5 -12M${x} ${y + 4}v-13M${x + 7} ${y + 4}q-2 -9 -5 -12`}
          fill="none"
          stroke={paint('leaf-deep')}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      );
    case 'flower':
      return <Flower x={x} y={y} warm={item.warm} />;
    case 'rock':
      return (
        <>
          <ellipse cx={x} cy={y + 10} rx={20} ry={5} fill={paint('ink')} opacity={0.15} />
          <path
            d={`M${x - 20} ${y + 9}q-2 -16 12 -20q10 -8 20 2q12 4 8 18z`}
            fill={paint('pebble')}
            stroke={paint('pebble-deep')}
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <path
            d={`M${x - 10} ${y - 4}q6 -6 12 -4`}
            fill="none"
            stroke={paint('cloud')}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.6}
          />
          <path
            d={`M${x + 14} ${y + 10}q-1 -9 7 -10q7 0 8 10z`}
            fill={paint('pebble')}
            stroke={paint('pebble-deep')}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        </>
      );
    case 'ripple':
      return (
        <>
          <path
            d={`M${x - 14} ${y}q7 -5 14 0q7 5 14 0`}
            fill="none"
            stroke={paint('sand-deep')}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.8}
          />
          <circle cx={x + 22} cy={y + 12} r={2.5} fill={paint('sand-deep')} />
        </>
      );
  }
}

function Flower({ x, y, warm }: { x: number; y: number; warm: boolean }) {
  const petal = paint(warm ? 'coral' : 'cloud');
  const edge = paint(warm ? 'coral-deep' : 'pebble-deep');
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle
          key={a}
          cx={x + Math.cos((a * Math.PI) / 180) * 4.5}
          cy={y + Math.sin((a * Math.PI) / 180) * 4.5}
          r={3.4}
          fill={petal}
          stroke={edge}
          strokeWidth={1.5}
        />
      ))}
      <circle cx={x} cy={y} r={2.6} fill={paint('sunshine')} />
    </g>
  );
}
