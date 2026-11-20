// Installs the item core behind the `item-core.ts` port (02 §6a, #95). The full entry
// (`@number-island/engine`) imports this module for its side effect, so loading the full entry is
// what makes the learner model usable. The shell entry (`@number-island/engine/shell`) never
// imports it.

import { CHECKERS_CHUNK_MARK } from '../check/state';
import { GENERATORS_CHUNK_MARK } from '../generators';
import { installItemCore } from '../item-core';
import { RULES_CHUNK_MARK } from '../misconceptions';
import { isConstructedTemplate } from './answer-kind';
import { attemptDifficulty } from './attempt-difficulty';

/**
 * One marker per item-core registry (generators, state checkers, misconception rules). Each is
 * declared in its registry's module, so it is emitted in the chunk that holds the registry;
 * `pnpm bundle-size` fails when one of them is in the initial JS.
 */
export const ITEM_CORE_MARKS: readonly string[] = [
  GENERATORS_CHUNK_MARK,
  CHECKERS_CHUNK_MARK,
  RULES_CHUNK_MARK,
];

installItemCore({ parts: ITEM_CORE_MARKS, attemptDifficulty, isConstructedTemplate });
