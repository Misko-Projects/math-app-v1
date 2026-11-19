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
import { equalityEq } from './equality/eq';
import { estimateQuantity } from './estimate/quantity';
import { geoCompose } from './geo/compose';
import { geoDraw } from './geo/draw';
import { geoIdentify } from './geo/identify';
import { geoPosition } from './geo/position';
import { meaLength } from './mea/length';
import { meaMassVolume } from './mea/massvolume';
import { numberlinePlace } from './numberline/place';
import { pvNumber } from './pv/number';
import { storyAddsub } from './story/addsub';
import { subitizeFlash } from './subitize/flash';
import type { GeneratorDef } from './types';

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
