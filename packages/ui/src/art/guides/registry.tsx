import type { ReactNode } from 'react';
import { BUNNY_BOX, Bunny22Figure } from './Bunny22';
import { SHELLY_BOX, ShellyFigure } from './Shelly';
import type { GuideMood } from './types';

/**
 * The guides a child can choose (05 §1, §10). Every guide says the same lines in the same shared
 * guide voice and behaves the same; only the character and the name differ. The order is the
 * chooser's. Adding a guide is one entry here and one drawing file.
 */
export interface GuideDef {
  /** Stored on the child profile (`ChildProfile.guide`, 02 §5.8). Never change an id. */
  id: string;
  /** The name as written, on the name tag only (never inside a prompt or a speech bubble). */
  name: string;
  /** What kind of animal, for the accessible name ("22, the bunny"). */
  animal: string;
  /** The narration line that says who this is ("Shelly the turtle", "twenty-two the bunny"). */
  nameLine: string;
  /** The design box of the drawing, in art units. */
  box: { x: number; y: number; w: number; h: number };
  Figure: (props: { mood: GuideMood }) => ReactNode;
}

const SHELLY: GuideDef = {
  id: 'shelly',
  name: 'Shelly',
  animal: 'turtle',
  nameLine: 'ui.guide.name.shelly',
  box: SHELLY_BOX,
  Figure: ShellyFigure,
};

export const GUIDES: readonly GuideDef[] = [
  SHELLY,
  {
    id: '22',
    name: '22',
    animal: 'bunny',
    nameLine: 'ui.guide.name.22',
    box: BUNNY_BOX,
    Figure: Bunny22Figure,
  },
];

/**
 * The guide a child chose. A profile with no guide yet, or with a guide this build does not know
 * (chosen on a newer device), draws the first guide; the stored value is left as it is.
 */
export function guideById(id: string | null | undefined): GuideDef {
  return GUIDES.find((g) => g.id === id) ?? SHELLY;
}

/** True when `id` names a guide this build can draw. */
export function isKnownGuide(id: string | null | undefined): boolean {
  return GUIDES.some((g) => g.id === id);
}

/** The accessible name: "Shelly, the turtle", "22, the bunny". */
export function guideLabel(guide: GuideDef): string {
  return `${guide.name}, the ${guide.animal}`;
}
