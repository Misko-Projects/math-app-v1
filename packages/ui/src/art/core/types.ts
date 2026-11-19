import type { ComponentType } from 'react';
import type { ArtProps } from './ArtSvg';

/**
 * A building's state (05 §11: "parameterised by state (under construction / level 1–3)"). Level 1 is
 * the building as first built (02 §5.8 BuildingDef.levels); levels 2 and 3 are upgrades.
 */
export type BuildingStage = 'construction' | 1 | 2 | 3;

export const BUILDING_STAGES: readonly BuildingStage[] = ['construction', 1, 2, 3];

export interface BuildingArtProps extends ArtProps {
  stage: BuildingStage;
}

/** Art for a building, keyed by its GameData `art` id (`building/<id>`). */
export type BuildingArt = ComponentType<BuildingArtProps>;

/** Art for a decor item or a material icon (`decor/<id>`, `material/<id>`). */
export type ItemArt = ComponentType<ArtProps>;
