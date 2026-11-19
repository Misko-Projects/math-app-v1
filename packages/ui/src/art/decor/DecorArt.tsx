import type { Plot } from '@number-island/shared';
import type { Lighting } from '../../tokens/tokens';
import { type ArtProps, ArtSvg } from '../core/ArtSvg';
import { filled, paint } from '../core/paint';
import type { ItemArt } from '../core/types';
import { type Box, plotBox } from '../island/geometry';
import { DECOR, type DecorId } from './catalog';

export interface DecorPieceProps {
  id: DecorId;
  /** Sunset lights the lamps and lanterns. Inside a scene, pass the scene's lighting. */
  lighting?: Lighting;
  /** Anchor in scene units: the bottom-centre of the item's footprint box. Default 0, 0. */
  x?: number;
  y?: number;
}

/**
 * A decor item drawn in scene units around its anchor, for use inside an island scene's SVG:
 * `<DecorPiece id="fountain" {...decorAnchor('fountain', plot)} lighting={lighting} />`.
 */
export function DecorPiece({ id, lighting, x = 0, y = 0 }: DecorPieceProps) {
  const def = DECOR[id];
  return (
    <g
      transform={x || y ? `translate(${x} ${y})` : undefined}
      data-decor={id}
      data-footprint={`${def.footprint[0]}x${def.footprint[1]}`}
      data-lit={lighting === 'sunset' ? 'true' : undefined}
    >
      {def.draw({ lit: lighting === 'sunset' })}
    </g>
  );
}

/** The anchor point (bottom-centre of the footprint box) of a decor item whose top-left plot is `plot`. */
export function decorAnchor(id: DecorId, plot: Plot): { x: number; y: number } {
  const b = plotBox(plot, DECOR[id].footprint);
  return { x: b.x + b.w / 2, y: b.y + b.h };
}

/** The scene box the item's art covers when placed on `plot` (its viewBox moved to the anchor). */
export function decorBox(id: DecorId, plot: Plot): Box {
  const a = decorAnchor(id, plot);
  const v = DECOR[id].viewBox;
  return { x: a.x + v.x, y: a.y + v.y, w: v.w, h: v.h };
}

export interface DecorSvgProps extends ArtProps {
  id: DecorId;
}

/** A decor item as a standalone picture (reward cards, the decor tray, the gallery). */
export function DecorSvg({ id, lighting, ...art }: DecorSvgProps) {
  const v = DECOR[id].viewBox;
  return (
    <ArtSvg
      width={v.w}
      height={v.h}
      originX={v.x}
      originY={v.y}
      lighting={lighting}
      {...art}
      rootProps={{ 'data-decor-art': id }}
    >
      <DecorPiece id={id} lighting={lighting} />
    </ArtSvg>
  );
}

export function decorArtComponent(id: DecorId): ItemArt {
  // biome-ignore lint/correctness/noComponentHookFactories: one stable component per registry id, made once at module load.
  const Art = (props: ArtProps) => <DecorSvg id={id} {...props} />;
  Art.displayName = `DecorArt(${id})`;
  return Art;
}

export interface DecorTileProps extends ArtProps {
  id: DecorId;
  /** The plot it stands on. Default sand. */
  ground?: 'sand' | 'grass';
}

const TILE_PAD = 8;
const LIP = 9;

/**
 * A decor item standing on its own plot (its footprint drawn as a little island tile), for shop
 * and reward cards and the gallery: shows how big the item is and how it sits on the ground.
 */
export function DecorTile({ id, ground = 'sand', lighting, ...art }: DecorTileProps) {
  const def = DECOR[id];
  const w = def.footprint[0] * 100;
  const h = def.footprint[1] * 70;
  const top = Math.min(def.viewBox.y, -h) - TILE_PAD;
  const x0 = -w / 2 - TILE_PAD;
  const fill = ground === 'grass' ? 'leaf-light' : 'sand';
  const edge = ground === 'grass' ? 'leaf-deep' : 'sand-deep';
  const tile = `M${-w / 2 + 14} ${-h + 3}H${w / 2 - 14}Q${w / 2 - 3} ${-h + 3} ${w / 2 - 3} ${-h + 14}V-14Q${w / 2 - 3} -3 ${w / 2 - 14} -3H${-w / 2 + 14}Q${-w / 2 + 3} -3 ${-w / 2 + 3} -14V${-h + 14}Q${-w / 2 + 3} ${-h + 3} ${-w / 2 + 14} ${-h + 3}Z`;
  return (
    <ArtSvg
      width={w + 2 * TILE_PAD}
      height={-top + LIP + TILE_PAD}
      originX={x0}
      originY={top}
      lighting={lighting}
      {...art}
      rootProps={{ 'data-decor-tile': id }}
    >
      <path d={tile} transform={`translate(0 ${LIP})`} {...filled('sand-deep', 2.6)} />
      <path
        d={tile}
        fill={paint(fill)}
        stroke={paint(edge)}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <DecorPiece id={id} lighting={lighting} />
    </ArtSvg>
  );
}
