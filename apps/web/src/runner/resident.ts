// The Pebbling a story is about (03 §4.6). Generators write the placeholder `@resident` wherever
// an item names "the resident who asked" (story.addsub: the `who` of a prompt, a hint, a story
// line). The TaskRunner replaces it before anything is presented, with the id of the resident
// whose request is being played. Narration turns that id into the name: `{who|name}` shows the
// words of the name clip `res.<id>` ("Nib") and speaks that clip, so a name is never spelled
// into a line and never falls back to on-device speech.
//
// Framework-free.

import type { ResidentDef } from '@number-island/shared';

/** What generators write for "the resident who asked". */
export const RESIDENT_PLACEHOLDER = '@resident';

export type Resident = Pick<ResidentDef, 'id' | 'name' | 'starterBuddy'>;
/** Who a story is about: the id narration looks the name up by, and the name as it is written. */
export type Who = Pick<ResidentDef, 'id' | 'name'>;

/**
 * The resident a request's stories are about: the one who asked, when the game has such a
 * resident; otherwise (the dev content browser asks as nobody) the game's first starter buddy.
 * A game with no residents leaves the request's own id, as id and as name.
 */
export function requestingResident(residents: readonly Resident[], residentId: string): Who {
  const found =
    residents.find((r) => r.id === residentId) ??
    residents.find((r) => r.starterBuddy) ??
    residents[0];
  return found ? { id: found.id, name: found.name } : { id: residentId, name: residentId };
}

/**
 * `value` about `who`, however deep: a string that is the placeholder (a narration var) becomes
 * the resident's id, which narration turns into the name; a placeholder inside a sentence the
 * engine already wrote out (an item's `prompt.text`) becomes the name itself.
 */
export function withResident<T>(value: T, who: Who): T {
  if (value === RESIDENT_PLACEHOLDER) return who.id as T;
  if (typeof value === 'string') return value.replaceAll(RESIDENT_PLACEHOLDER, who.name) as T;
  if (Array.isArray(value)) return value.map((v) => withResident(v, who)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, withResident(v, who)]),
    ) as T;
  }
  return value;
}

/** The engine calls that build what a child is shown and told. */
interface PresentingEngine {
  generateItem: (...args: never[]) => unknown;
  generateItemFromParams: (...args: never[]) => unknown;
  itemSolution: (...args: never[]) => unknown;
}

/**
 * `engine` with everything it presents about `who`: items (their prompt, hints, widget and
 * overlays), lesson examples and worked solutions. Nothing else of the engine changes.
 */
export function residentEngine<E extends PresentingEngine>(engine: E, who: Who): E {
  const about =
    <F extends (...args: never[]) => unknown>(f: F) =>
    (...args: Parameters<F>) =>
      withResident(f(...args), who) as ReturnType<F>;
  return {
    ...engine,
    generateItem: about(engine.generateItem),
    generateItemFromParams: about(engine.generateItemFromParams),
    itemSolution: about(engine.itemSolution),
  };
}
