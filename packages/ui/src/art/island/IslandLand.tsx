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
}

const ROUND = 44;

/**
 * The island's land (05 §3, §11): a shallows halo and a breathing foam line in the sea, the land's
 * side face (the tilt), the sandy top with its outline, the grass inland, and per-plot detail
 * (grass tufts, meadow flowers, beach ripples and shore rocks). The outline is one traced path
 * around the whole union, so neighbouring plots read as one landmass, not a grid of tiles.
 */
export function IslandLand({ plots, terrain }: IslandLandProps) {
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
      {plots.map((p) => (
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
  if (kind === 'grass' || kind === 'meadow') {
    const tufts = Array.from({ length: 3 }, spot);
    const flowers = kind === 'meadow' ? Array.from({ length: 4 }, spot) : [];
    return (
      <g data-terrain={kind}>
        {tufts.map((t) => (
          <path
            key={`t${t.x.toFixed(1)}`}
            d={`M${t.x - 7} ${t.y + 4}q2 -9 5 -12M${t.x} ${t.y + 4}v-13M${t.x + 7} ${t.y + 4}q-2 -9 -5 -12`}
            fill="none"
            stroke={paint('leaf-deep')}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
        {flowers.map((f, i) => (
          <Flower key={`f${f.x.toFixed(1)}`} x={f.x} y={f.y} warm={i % 2 === 0} />
        ))}
      </g>
    );
  }
  if (kind === 'rock') {
    const a = spot();
    return (
      <g data-terrain="rock">
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
  const r = spot();
  return (
    <g data-terrain="sand">
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
