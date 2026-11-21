// State checker registry (03 §5.7), one line per checker. E01 registers the checkers the fixture
// formats use; U03–U05 and K01/K02 add the rest of `StateCheckerId`.

import type { StateCheckerId } from '@number-island/shared';
import { arrayArea } from './array.area';
import { arrayDims } from './array.dims';
import { balanceEqual } from './balance.equal';
import { basetenExact } from './baseten.exact';
import { basetenValue } from './baseten.value';
import { bondNewWay } from './bond.newWay';
import { bondSplit } from './bond.split';
import { chartValues } from './chart.values';
import { clockTime } from './clock.time';
import { composeFill } from './compose.fill';
import { composeRelative } from './compose.relative';
import { fractionCut } from './fraction.cut';
import { fractionPartition } from './fraction.partition';
import { gridPolygon } from './grid.polygon';
import { groupsEqual } from './groups.equal';
import { jumpsReach } from './jumps.reach';
import { patternTokens } from './pattern.tokens';
import { puzzleSatisfies } from './puzzle.satisfies';
import { rekenrekTotal } from './rekenrek.total';
import { selectExactSet } from './select.exactSet';
import { setCount } from './set.count';
import { shareFair } from './share.fair';
import { sortByRule } from './sort.byRule';
import { tenframeMakeTen } from './tenframe.makeTen';
import { tenframeTotal } from './tenframe.total';
import { tilesCover } from './tiles.cover';
import { tradeResult } from './trade.result';
import type { StateChecker } from './types';
import { unitsIterate } from './units.iterate';

/** Found by `pnpm bundle-size` to prove this module is not in the initial JS (02 §6a, #95). */
export const CHECKERS_CHUNK_MARK = 'number-island:item-core/state-checkers';

const CHECKERS: Partial<Record<StateCheckerId, StateChecker>> = {
  'set.count': setCount,
  'tenframe.total': tenframeTotal,
  'tenframe.makeTen': tenframeMakeTen,
  'bond.split': bondSplit,
  'bond.newWay': bondNewWay,
  'rekenrek.total': rekenrekTotal,
  'jumps.reach': jumpsReach,
  'select.exactSet': selectExactSet,
  'sort.byRule': sortByRule,
  'compose.fill': composeFill,
  'compose.relative': composeRelative,
  'grid.polygon': gridPolygon,
  'puzzle.satisfies': puzzleSatisfies,
  'units.iterate': unitsIterate,
  'chart.values': chartValues, // K01 data (bar-graph-build)
  'clock.time': clockTime, // K01 time (clock-set)
  'fraction.cut': fractionCut, // K01 fractions (fraction-cut)
  'fraction.partition': fractionPartition, // K01 fractions (fraction-line partition)
  'pattern.tokens': patternTokens, // K01 patterns (pattern-extend extend, fill)
  // U04 (#13)
  'baseten.value': basetenValue,
  'baseten.exact': basetenExact,
  'trade.result': tradeResult,
  'array.dims': arrayDims,
  'array.area': arrayArea,
  'groups.equal': groupsEqual,
  'share.fair': shareFair,
  'tiles.cover': tilesCover,
  // K01 (#11): balance make-equal (the balance format has no model yet, U04)
  'balance.equal': balanceEqual,
};

export function stateChecker(id: StateCheckerId): StateChecker | undefined {
  return CHECKERS[id];
}

export type { StateChecker } from './types';
