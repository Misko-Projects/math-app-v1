// The loading boundary between the shell and the item core (02 §6a, #95).
//
// The shell (skill graph, folds, learner model) ships in the app's initial JS. The item core
// (generators, state checkers, misconception rules, format models) is far larger and loads
// through a dynamic import of the full entry, `@number-island/engine`. The learner model needs two
// things from the item core, and it reaches them through this port instead of importing them:
//
// - an attempt's item difficulty, rebuilt from its template, params and seed (04 §2.2), which runs
//   the template's generator;
// - whether a template's items take a constructed answer (04 §7a), read from an item it generates.
//
// Loading the full entry installs the port (`items/install.ts`). There is no fallback: a learner
// fold that ran without the item core would rate every attempt at its template's base difficulty
// and store a different learner state, so the port throws until the item core is loaded.

import type { ItemTemplate } from '@number-island/shared';

export interface ItemCore {
  /**
   * The item-core registries this build loaded, by chunk marker (`items/install.ts`). The markers
   * are how `pnpm bundle-size` proves that no registry is in the initial JS.
   */
  readonly parts: readonly string[];
  /** d_item of a logged attempt (04 §2.2), rebuilt through the template's generator. */
  attemptDifficulty(
    t: ItemTemplate,
    params: Readonly<Record<string, number | string | boolean>>,
    seed: number,
  ): number;
  /** Whether a template's items take a constructed (non-choice) answer (04 §7a). */
  isConstructedTemplate(t: ItemTemplate): boolean;
}

/** The learner model was used before the item core was loaded. */
export class ItemCoreNotLoadedError extends Error {
  constructor() {
    super(
      'the item core is not loaded: import `@number-island/engine` (the full entry) before folding learner state (02 §6a)',
    );
    this.name = 'ItemCoreNotLoadedError';
  }
}

let installed: ItemCore | null = null;

/** Called once by the full entry (`items/install.ts`). Installing again replaces the port. */
export function installItemCore(core: ItemCore): void {
  installed = core;
}

/** Whether the full entry has been loaded. */
export function itemCoreLoaded(): boolean {
  return installed !== null;
}

/** The item core, or `ItemCoreNotLoadedError` when the full entry has not been loaded yet. */
export function itemCore(): ItemCore {
  if (installed === null) throw new ItemCoreNotLoadedError();
  return installed;
}
