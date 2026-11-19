import type { Plot } from '@number-island/shared';
import { useMemo } from 'react';
import { paint } from '../core/paint';
import { ISLAND_LAYOUT, landLoops, organicPath, plotKey, type TerrainKind } from './geometry';
import { type Blocked, PlotDetail } from './plotDetail';

export interface IslandLandProps {
  /** The land plots (the union of the unlocked rings). */
  plots: readonly Plot[];
  /** Terrain per plot key (`x,y`); plots without an entry are sand. */
  terrain: ReadonlyMap<string, TerrainKind>;
  /** Plot keys (`x,y`) kept clear of detail, such as highlighted building plots. */
  clearPlots?: readonly string[];
  /** Ground that detail keeps off: the road's footprint (roadFootprint). */
  blocked?: Blocked;
}

const ROUND = 44;

/**
 * The island's land (05 §3, §11): a shallows halo and a breathing foam line in the sea, the land's
 * side face (the tilt), the sandy top with its outline, the grass inland, and per-plot detail
 * (grass tufts, meadow flowers, beach ripples and shore rocks) kept off the road. The outline is
 * one traced path around the whole union, so neighbouring plots read as one landmass, not a grid
 * of tiles.
 */
export function IslandLand({ plots, terrain, clearPlots = [], blocked }: IslandLandProps) {
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
      <path data-part="halo" d={paths.halo} fill={paint('shallows')} opacity={0.7} />
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
        data-part="land-top"
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
          <PlotDetail
            key={plotKey(p)}
            plot={p}
            kind={terrain.get(plotKey(p)) ?? 'sand'}
            blocked={blocked}
          />
        ))}
    </g>
  );
}

export { PlotDetail } from './plotDetail';
