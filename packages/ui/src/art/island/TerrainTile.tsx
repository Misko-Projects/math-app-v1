import type { ArtProps } from '../core/ArtSvg';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import { ISLAND_LAYOUT, type TerrainKind } from './geometry';
import { PlotDetail } from './IslandLand';

/** Terrain tiles plus the two sea tiles, for legends, recipe cards and workshop backdrops. */
export type TileKind = TerrainKind | 'shallows' | 'sea';

export const TILE_KINDS: readonly TileKind[] = [
  'sand',
  'grass',
  'meadow',
  'rock',
  'shallows',
  'sea',
];

export interface TerrainTileProps extends ArtProps {
  kind: TileKind;
}

const W = ISLAND_LAYOUT.cellW;
const H = ISLAND_LAYOUT.cellH;
const PAD = 26;
/** The plot sits at the island's grid origin, so PlotDetail scatters the same detail as on the map. */
const PX = ISLAND_LAYOUT.padX;
const PY = ISLAND_LAYOUT.skyH + ISLAND_LAYOUT.padTop;

/**
 * One island tile as a standalone piece (05 §3): a single plot on a square of sea, with the land's
 * side face, a sandy edge and its top (sand, grass or meadow) and the same scattered detail the map
 * draws on that kind of plot. Or a square of shallows or open sea.
 */
export function TerrainTile({ kind, size = 120, ...rest }: TerrainTileProps) {
  const w = W + 2 * PAD;
  const h = H + 2 * PAD + ISLAND_LAYOUT.lip;
  const water = kind === 'sea' || kind === 'shallows';
  const green = kind === 'grass' || kind === 'meadow';
  return (
    <ArtSvg width={w} height={h} originX={PX - PAD} originY={PY - PAD} size={size} {...rest}>
      <g data-terrain={kind}>
        <rect
          x={PX - PAD + 1.5}
          y={PY - PAD + 1.5}
          width={w - 3}
          height={h - 3}
          rx={22}
          fill={paint(kind === 'shallows' ? 'shallows' : 'sea')}
          stroke={paint(kind === 'shallows' ? 'sea' : 'sea-deep')}
          strokeWidth={3}
        />
        {water ? (
          <Waves kind={kind} />
        ) : (
          <>
            <rect
              x={PX - 10}
              y={PY - 10}
              width={W + 20}
              height={H + 20}
              rx={28}
              fill={paint('shallows')}
              opacity={0.7}
            />
            <rect
              x={PX - 2}
              y={PY - 2 + ISLAND_LAYOUT.lip}
              width={W + 4}
              height={H + 4}
              rx={22}
              fill={paint('sand-deep')}
              stroke={paint('wood-deep')}
              strokeWidth={3}
            />
            <rect
              x={PX - 2}
              y={PY - 2}
              width={W + 4}
              height={H + 4}
              rx={22}
              fill={paint('sand')}
              stroke={paint('sand-deep')}
              strokeWidth={3}
            />
            {green ? (
              <rect
                x={PX + 9}
                y={PY + 8}
                width={W - 18}
                height={H - 16}
                rx={16}
                fill={paint('leaf-light')}
                stroke={paint('leaf-deep')}
                strokeWidth={3}
              />
            ) : null}
            <PlotDetail plot={[0, 0]} kind={kind} />
          </>
        )}
      </g>
    </ArtSvg>
  );
}

function Waves({ kind }: { kind: 'sea' | 'shallows' }) {
  const wave = kind === 'sea' ? 'foam' : 'cloud';
  return (
    <>
      {[
        [0.28, 0.3],
        [0.66, 0.48],
        [0.34, 0.72],
      ].map(([fx, fy]) => (
        <path
          key={`${fx}-${fy}`}
          d={`M${PX - PAD + (W + 2 * PAD) * (fx ?? 0) - 16} ${PY - PAD + (H + 2 * PAD) * (fy ?? 0)}q8 -7 16 0q8 -7 16 0`}
          fill="none"
          stroke={paint(wave)}
          strokeWidth={3.5}
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}
    </>
  );
}
