import { type ReactElement, useId } from 'react';
import grainUrl from '../../tokens/felt-grain.webp';

/**
 * Felt & Stitch in SVG pictures (05 §11, slice 4b): the baked felt grain as an SVG pattern, laid
 * over a shape with soft-light blending (the tile is neutral grey, so the colour stays the
 * token's), as the equal-groups art does. One pattern per picture; grain goes only on mats and
 * single large pieces, never on every bar, cell, coin or token (raster cost, felt4b task 0).
 */

/** A pattern id unique to this picture. */
export function useGrainId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** The grain tile as a pattern, in the picture's own units (it scales with the picture). */
export function GrainDefs({ id, size = 192 }: { id: string; size?: number }): ReactElement {
  return (
    <defs>
      <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
        <image href={grainUrl} width={size} height={size} />
      </pattern>
    </defs>
  );
}

/** Blend for a grain layer: soft-light, never catching a press. */
export const GRAIN_LAYER = { mixBlendMode: 'soft-light', pointerEvents: 'none' } as const;
