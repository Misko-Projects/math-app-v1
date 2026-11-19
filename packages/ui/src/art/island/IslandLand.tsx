import type { Plot } from '@number-island/shared';
import { useMemo } from 'react';
import { hashSeed, paint, seededRandom } from '../core/paint';
import {
  ISLAND_LAYOUT,
  landLoops,
  organicPath,
  plotBox,
  plotKey,
  type TerrainKind,
} from './geometry';

export interface IslandLandProps {
  /** The land plots (the union of the unlocked rings). */
  plots: readonly Plot[];
  /** Terrain per plot key (`x,y`); plots without an entry are sand. */
  terrain: ReadonlyMap<string, TerrainKind>;
  /** Plot keys (`x,y`) kept clear of detail, such as highlighted building plots. */
  clearPlots?: readonly string[];
}

const ROUND = 44;

/**
 * The island's land (05 §3, §11): a shallows halo and a breathing foam line in the sea, the land's
 * side face (the tilt), the sandy top with its outline, the grass inland, and per-plot detail
 * (grass tufts, meadow flowers, beach ripples and shore rocks). The outline is one traced path
 * around the whole union, so neighbouring plots read as one landmass, not a grid of tiles.
 */
export function IslandLand({ plots, terrain, clearPlots = [] }: IslandLandProps) {
  const clear = useMemo(() => new Set(clearPlots), [clearPlots]);
  const paths = useMemo(() => {
    const green = plots.filter((p) => {
      const t = terrain.get(plotKey(p));
      return t === 'grass' || t === 'meadow';
    });
    // Each layer is the same traced outline, pushed out (or in) and given its own soft wobble.
    return {
      halo: organicPath(landLoops(plots, 46), { radius: 80, wobble: 16, step: 60, seed: 3 }),
      foam: organicPath(landLoops(plots, 21), { radius: 64, wobble: 10, step: 56, seed: 5 }),
      land: organicPath(landLoops(plots, 10), { radius: ROUND, wobble: 8, step: 52, seed: 7 }),
      grass:
        green.length > 0
          ? organicPath(landLoops(green, -8), { radius: 34, wobble: 4, step: 38, seed: 11 })
          : '',
    };
  }, [plots, terrain]);
  if (plots.length === 0) return null;
  return (
    <g data-layer="land">
      <path d={paths.halo} fill={paint('shallows')} opacity={0.7} />
      <path
        className="motion-loop art-foam"
        d={paths.foam}
        fill="none"
        stroke={paint('foam')}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {/* The side face: the land's outline dropped by the lip height. */}
      <path
        d={paths.land}
        transform={`translate(0 ${ISLAND_LAYOUT.lip})`}
        fill={paint('sand-deep')}
        stroke={paint('wood-deep')}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path
        d={paths.land}
        fill={paint('sand')}
        stroke={paint('sand-deep')}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {paths.grass ? (
        <path
          d={paths.grass}
          fill={paint('leaf-light')}
          stroke={paint('leaf-deep')}
          strokeWidth={3}
          strokeLinejoin="round"
        />
      ) : null}
      {plots
        .filter((p) => !clear.has(plotKey(p)))
        .map((p) => (
          <PlotDetail key={plotKey(p)} plot={p} kind={terrain.get(plotKey(p)) ?? 'sand'} />
        ))}
    </g>
  );
}

/** Scattered detail on one plot, deterministic per plot. */
export function PlotDetail({ plot, kind }: { plot: Plot; kind: TerrainKind }) {
  const b = plotBox(plot);
  const rnd = seededRandom(hashSeed(plot[0], plot[1], 101));
  const spot = () => ({
    x: b.x + 18 + rnd() * (b.w - 36),
    y: b.y + 16 + rnd() * (b.h - 32),
  });
  const key = `${plot[0]},${plot[1]}`;
  if (kind === 'grass' || kind === 'meadow') {
    const tufts = Array.from({ length: 3 }, spot);
    const flowers = kind === 'meadow' ? Array.from({ length: 4 }, spot) : [];
    return (
      <g data-terrain={kind} data-plot={key}>
        {tufts.map((t) => (
          <path
            key={`t${t.x.toFixed(2)},${t.y.toFixed(2)}`}
            d={`M${t.x - 7} ${t.y + 4}q2 -9 5 -12M${t.x} ${t.y + 4}v-13M${t.x + 7} ${t.y + 4}q-2 -9 -5 -12`}
            fill="none"
            stroke={paint('leaf-deep')}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
        {flowers.map((f, i) => (
          <Flower key={`f${f.x.toFixed(2)},${f.y.toFixed(2)}`} x={f.x} y={f.y} warm={i % 2 === 0} />
        ))}
      </g>
    );
  }
  if (kind === 'rock') {
    // The rocks reach 20 left and 28 right of their spot: keep them inside their own plot.
    const a = { x: b.x + 24 + rnd() * (b.w - 56), y: b.y + 22 + rnd() * (b.h - 40) };
    return (
      <g data-terrain="rock" data-plot={key}>
        <ellipse cx={a.x} cy={a.y + 10} rx={20} ry={5} fill={paint('ink')} opacity={0.15} />
        <path
          d={`M${a.x - 20} ${a.y + 9}q-2 -16 12 -20q10 -8 20 2q12 4 8 18z`}
          fill={paint('pebble')}
          stroke={paint('pebble-deep')}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path
          d={`M${a.x - 10} ${a.y - 4}q6 -6 12 -4`}
          fill="none"
          stroke={paint('cloud')}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.6}
        />
        <path
          d={`M${a.x + 14} ${a.y + 10}q-1 -9 7 -10q7 0 8 10z`}
          fill={paint('pebble')}
          stroke={paint('pebble-deep')}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </g>
    );
  }
  // The ripple reaches 14 left and 25 right of its spot: keep it inside its own plot.
  const r = { x: b.x + 18 + rnd() * (b.w - 48), y: b.y + 16 + rnd() * (b.h - 44) };
  return (
    <g data-terrain="sand" data-plot={key}>
      <path
        d={`M${r.x - 14} ${r.y}q7 -5 14 0q7 5 14 0`}
        fill="none"
        stroke={paint('sand-deep')}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.8}
      />
      <circle cx={r.x + 22} cy={r.y + 12} r={2.5} fill={paint('sand-deep')} />
    </g>
  );
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
          strokeWidth={1.2}
        />
      ))}
      <circle cx={x} cy={y} r={2.6} fill={paint('sunshine')} />
    </g>
  );
}
