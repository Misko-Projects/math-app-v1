// State checker registry (03 §5.7), one line per checker. E01 registers the checkers the fixture
// formats use; U03–U05 and K01/K02 add the rest of `StateCheckerId`.

import type { StateCheckerId } from '@number-island/shared';
import { arrayArea } from './array.area';
import { arrayDims } from './array.dims';
import { basetenExact } from './baseten.exact';
import { basetenValue } from './baseten.value';
import { bondNewWay } from './bond.newWay';
import { bondSplit } from './bond.split';
import { groupsEqual } from './groups.equal';
import { jumpsReach } from './jumps.reach';
import { rekenrekTotal } from './rekenrek.total';
import { selectExactSet } from './select.exactSet';
import { setCount } from './set.count';
import { shareFair } from './share.fair';
import { tenframeMakeTen } from './tenframe.makeTen';
import { tenframeTotal } from './tenframe.total';
import { tilesCover } from './tiles.cover';
import { tradeResult } from './trade.result';
import type { StateChecker } from './types';

const CHECKERS: Partial<Record<StateCheckerId, StateChecker>> = {
  'set.count': setCount,
  'tenframe.total': tenframeTotal,
  'tenframe.makeTen': tenframeMakeTen,
  'bond.split': bondSplit,
  'bond.newWay': bondNewWay,
  'rekenrek.total': rekenrekTotal,
  'jumps.reach': jumpsReach,
  'select.exactSet': selectExactSet,
  // U04 (#13)
  'baseten.value': basetenValue,
  'baseten.exact': basetenExact,
  'trade.result': tradeResult,
  'array.dims': arrayDims,
  'array.area': arrayArea,
  'groups.equal': groupsEqual,
  'share.fair': shareFair,
  'tiles.cover': tilesCover,
};

export function stateChecker(id: StateCheckerId): StateChecker | undefined {
  return CHECKERS[id];
}

export type { StateChecker } from './types';
