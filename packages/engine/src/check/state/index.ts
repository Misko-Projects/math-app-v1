// State checker registry (03 §5.7), one line per checker. E01 registers the checkers the fixture
// formats use; U03–U05 and K01/K02 add the rest of `StateCheckerId`.

import type { StateCheckerId } from '@number-island/shared';
import { bondNewWay } from './bond.newWay';
import { bondSplit } from './bond.split';
import { jumpsReach } from './jumps.reach';
import { rekenrekTotal } from './rekenrek.total';
import { selectExactSet } from './select.exactSet';
import { setCount } from './set.count';
import { tenframeMakeTen } from './tenframe.makeTen';
import { tenframeTotal } from './tenframe.total';
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
};

export function stateChecker(id: StateCheckerId): StateChecker | undefined {
  return CHECKERS[id];
}

export type { StateChecker } from './types';
