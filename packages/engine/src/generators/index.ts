// Generator registry (03 §5.3): one line per generator, so parallel PRs rarely conflict.
// E01 registers the five reference generators; K01 adds every other K–1 generator, K02 the rest.

import type { GeneratorId } from '@number-island/shared';
import { addsubFacts } from './addsub/facts';
import { addsubThree } from './addsub/three';
import { bondParts } from './bond/parts';
import { compareNumbers } from './compare/numbers';
import { compareSets } from './compare/sets';
import { countOrdinal } from './count/ordinal';
import { countSequence } from './count/sequence';
import { countSet } from './count/set';
import { dataChart } from './data/chart';
import { dataSort } from './data/sort';
import { divShare } from './div/share';
import { equalityEq } from './equality/eq';
import { estimateQuantity } from './estimate/quantity';
import { fracCompare } from './frac/compare';
import { fracPartition } from './frac/partition';
import { geoCompose } from './geo/compose';
import { geoDraw } from './geo/draw';
import { geoIdentify } from './geo/identify';
import { geoPosition } from './geo/position';
import { mdaAddSub } from './mda/addsub';
import { meaLength } from './mea/length';
import { meaMassVolume } from './mea/massvolume';
import { numberlinePlace } from './numberline/place';
import { patternGrow } from './pattern/grow';
import { patternRepeat } from './pattern/repeat';
import { puzzleGrid } from './puzzle/grid';
import { pvNumber } from './pv/number';
import { pvRegroup } from './pv/regroup';
import { pvEstimate } from './pv/estimate';
import { pvRound } from './pv/round';
import { pvTenMore } from './pv/tenmore';
import { storyAddsub } from './story/addsub';
import { subitizeFlash } from './subitize/flash';
import { timeClock } from './time/clock';
import { timeSequence } from './time/sequence';
import type { GeneratorDef } from './types';

/** Found by `pnpm bundle-size` to prove this module is not in the initial JS (02 §6a, #95). */
export const GENERATORS_CHUNK_MARK = 'number-island:item-core/generators';

const GENERATORS: GeneratorDef[] = [
  countSet,
  countSequence,
  subitizeFlash,
  bondParts,
  addsubFacts,
  geoIdentify,
  geoCompose,
  geoPosition,
  geoDraw,
  meaLength,
  meaMassVolume,
  countOrdinal,
  pvNumber,
  compareSets,
  compareNumbers,
  numberlinePlace,
  estimateQuantity,
  divShare, // K01 sharing and fractions (MUL.12, FRA.07)
  fracPartition, // K01 fractions (FRA.01, FRA.07)
  fracCompare, // K01 fractions (FRA.08)
  timeClock, // K01 time
  timeSequence, // K01 time
  dataSort, // K01 data (DAT.01, DAT.10)
  dataChart, // K01 data (DAT.02, DAT.09)
  patternRepeat, // K01 patterns (ALG.01, ALG.04)
  patternGrow, // K01 patterns (ALG.02)
  puzzleGrid, // K01 puzzles (PUZ.01, PUZ.02, CPS.06)
  // K01 (#11): place value and two-digit addition and subtraction
  pvRegroup,
  pvTenMore,
  pvRound, // K02 (#17) rounding (PV.08, PV.18, CMP.12)
  pvEstimate, // K02 (#17) slice 2b: estimate by rounding (PV.19)
  mdaAddSub,
  equalityEq,
  storyAddsub,
  addsubThree,
];

const BY_ID = new Map<GeneratorId, GeneratorDef>(GENERATORS.map((g) => [g.id, g]));
if (BY_ID.size !== GENERATORS.length) throw new Error('duplicate generator id in the registry');

export const registry = {
  get(id: GeneratorId): GeneratorDef | undefined {
    return BY_ID.get(id);
  },
  ids(): GeneratorId[] {
    return [...BY_ID.keys()].sort();
  },
  all(): GeneratorDef[] {
    return [...GENERATORS];
  },
};

export type { BuildContext, GeneratorDef, GeneratorOutput, ParamDecl } from './types';
export { GenerationError } from './types';
