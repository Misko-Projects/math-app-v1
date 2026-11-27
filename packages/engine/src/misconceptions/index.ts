// Misconception rule registry (03 §7.1), one line per rule, keyed by `detect.rule`.
// E01 registers the three fixture rules; K01/K02 add the rest of the 03 §7.2 library.

import type { GeneratedItem, MisconceptionSpec } from '@number-island/shared';
import { boundMisconceptions, boundTemplate } from '../content/binding';
import type { MisconceptionRule } from './rules';
import { biggerUnitMore } from './rules/biggerUnitMore';
import { coinsAsOnes, coinValueBySize } from './rules/coins';
import {
  borrowAcrossZero,
  borrowNoDecrement,
  forgotToRegroupAdd,
  smallerFromLarger,
} from './rules/columnBugs';
import { compareFirstDigit } from './rules/compareFirstDigit';
import { countAllInstead } from './rules/countAllInstead';
import { countStartNumber } from './rules/countStartNumber';
import { decadeTransition } from './rules/decadeTransition';
import { multiplyInsteadOfDivide, neighbourFact, toldNumberBack } from './rules/division';
import { dollarAsOne } from './rules/dollarAsOne';
import { equalsAddAll } from './rules/equalsAddAll';
import { equalsMeansAnswer } from './rules/equalsMeansAnswer';
import { faceValue } from './rules/faceValue';
import { firstStepOnly } from './rules/firstStepOnly';
import { forgotTheTen } from './rules/forgotTheTen';
import { fractionBiggerDenominator } from './rules/fractionBiggerDenominator';
import { fractionCompareTops, fractionPartToPart, fractionSwapped } from './rules/fractionNames';
import { fractionUnequalParts } from './rules/fractionUnequalParts';
import { hourHandNext } from './rules/hourHandNext';
import { hourMinuteSwap } from './rules/hourMinuteSwap';
import {
  cageRepeatDigit,
  digitOrderReversed,
  growAsRepeat,
  wayCountedTwice,
} from './rules/k02Puzzles';
import {
  equalSharesLookAlike,
  functionAddForTake,
  functionBackwards,
  functionColumnPattern,
  functionFirstPairDouble,
  shareCountedWhole,
} from './rules/k02SharesMachines';
import { keywordMoreMeansAdd } from './rules/keywordMoreMeansAdd';
import { linePlotPositionAsCount, linePlotWrongStack } from './rules/linePlot';
import { minuteHandAsMinutes } from './rules/minuteHandNumber';
import {
  addInsteadOfMultiply,
  doubleOnce,
  partialProductDropped,
  skipCountSlip,
  tensDropped,
  timesZeroKeeps,
} from './rules/multiplication';
import { offByOneCounting } from './rules/offByOneCounting';
import { patternRestart } from './rules/patternRestart';
import { perceptualSize } from './rules/perceptualSize';
import { placeSwap } from './rules/placeSwap';
import { recountFromOne } from './rules/recountFromOne';
import { roundDownAlways, roundWrongPlace } from './rules/rounding';
import { rulerCountTicks, rulerReadEnd } from './rules/rulerReading';
import { startUnknownReversed } from './rules/startUnknownReversed';
import { symbolReversed } from './rules/symbolReversed';
import { teenReversal } from './rules/teenReversal';
import { unequalShare } from './rules/unequalShare';
import { unitGaps } from './rules/unitGaps';
import { writeAsSpoken } from './rules/writeAsSpoken';
import { wrongOperation } from './rules/wrongOperation';
import { zeroPlaceholder } from './rules/zeroPlaceholder';

/** Found by `pnpm bundle-size` to prove this module is not in the initial JS (02 §6a, #95). */
export const RULES_CHUNK_MARK = 'number-island:item-core/misconception-rules';

const RULES: Record<string, MisconceptionRule> = {
  countStartNumber: countStartNumber,
  countAllInstead: countAllInstead,
  offByOneCounting: offByOneCounting,
  unitGaps: unitGaps,
  biggerUnitMore: biggerUnitMore,
  rulerCountTicks: rulerCountTicks,
  rulerReadEnd: rulerReadEnd,
  linePlotPositionAsCount: linePlotPositionAsCount,
  linePlotWrongStack: linePlotWrongStack,
  recountFromOne: recountFromOne,
  decadeTransition: decadeTransition,
  teenReversal: teenReversal,
  perceptualSize: perceptualSize,
  forgotTheTen: forgotTheTen,
  wrongOperation: wrongOperation,
  hourMinuteSwap: hourMinuteSwap, // K01 time
  hourHandNext: hourHandNext, // K01 time
  fractionUnequalParts: fractionUnequalParts, // K01 fractions
  fractionBiggerDenominator: fractionBiggerDenominator, // K01 fractions
  // K02 (#17) slice 5a: naming and comparing grade 3 fractions
  fractionPartToPart: fractionPartToPart,
  fractionSwapped: fractionSwapped,
  fractionCompareTops: fractionCompareTops,
  unequalShare: unequalShare, // K01 sharing
  patternRestart: patternRestart, // K01 patterns
  placeSwap: placeSwap,
  faceValue: faceValue,
  writeAsSpoken: writeAsSpoken,
  // K01 (#11): equality and story problems
  equalsMeansAnswer: equalsMeansAnswer,
  equalsAddAll: equalsAddAll,
  startUnknownReversed: startUnknownReversed,
  keywordMoreMeansAdd: keywordMoreMeansAdd,
  firstStepOnly: firstStepOnly, // K02 (#17) slice 4d: two-step stories
  dollarAsOne: dollarAsOne, // K02 (#17) slice 4d: money stories
  symbolReversed: symbolReversed,
  // K02 (#17): place value to 1000
  zeroPlaceholder: zeroPlaceholder,
  compareFirstDigit: compareFirstDigit,
  // K02 (#17): multi-digit column bugs
  forgotToRegroupAdd: forgotToRegroupAdd,
  borrowAcrossZero: borrowAcrossZero,
  smallerFromLarger: smallerFromLarger,
  borrowNoDecrement: borrowNoDecrement,
  // K02 (#17): rounding
  roundDownAlways: roundDownAlways,
  roundWrongPlace: roundWrongPlace,
  // K02 (#17) slice 3a: equal groups
  addInsteadOfMultiply: addInsteadOfMultiply,
  skipCountSlip: skipCountSlip,
  // K02 (#17) slice 3b: facts and strategies
  timesZeroKeeps: timesZeroKeeps,
  doubleOnce: doubleOnce,
  tensDropped: tensDropped,
  partialProductDropped: partialProductDropped,
  // K02 (#17) slice 3c: division facts and missing factors
  multiplyInsteadOfDivide: multiplyInsteadOfDivide,
  toldNumberBack: toldNumberBack,
  neighbourFact: neighbourFact,
  // K02 (#17) slice 4a: time and money
  minuteHandNumber: minuteHandAsMinutes,
  coinsAsOnes: coinsAsOnes,
  coinValueBySize: coinValueBySize,
  // K02 (#17) slice 4e: patterns and puzzles
  growAsRepeat: growAsRepeat,
  cageRepeatDigit: cageRepeatDigit,
  digitOrderReversed: digitOrderReversed,
  wayCountedTwice: wayCountedTwice,
  // K02 (#17) slice 4c-2: equal shares that look different, input–output machines
  equalSharesLookAlike: equalSharesLookAlike,
  shareCountedWhole: shareCountedWhole,
  functionColumnPattern: functionColumnPattern,
  functionFirstPairDouble: functionFirstPairDouble,
  functionBackwards: functionBackwards,
  functionAddForTake: functionAddForTake,
};

export function misconceptionRule(id: string): MisconceptionRule | undefined {
  return RULES[id];
}

export function registeredRuleIds(): string[] {
  return Object.keys(RULES);
}

/**
 * The generator that built an item. `GeneratedItem` carries no generator field (02 §5.9 E3), so it
 * is resolved through the bound template (`templateId` → `ItemTemplate.generator`).
 */
export function itemGenerator(item: GeneratedItem): string | undefined {
  return boundTemplate(item.templateId)?.generator;
}

export interface ApplicableMisconception {
  spec: MisconceptionSpec;
  rule: MisconceptionRule;
}

/**
 * Library entries that apply to the item (its generator is in `appliesTo.generators` and its skill
 * in `skills`) and whose rule is registered, filtered by detection kind, sorted by priority
 * (descending), then id.
 */
export function applicableMisconceptions(
  item: GeneratedItem,
  kinds: readonly MisconceptionSpec['detect']['kind'][],
  specs: readonly MisconceptionSpec[] = boundMisconceptions(),
): ApplicableMisconception[] {
  const generator = itemGenerator(item);
  if (generator === undefined) return [];
  const out: ApplicableMisconception[] = [];
  for (const spec of specs) {
    if (!kinds.includes(spec.detect.kind)) continue;
    if (!spec.appliesTo.generators.includes(generator)) continue;
    if (!spec.skills.includes(item.skillId)) continue;
    const rule = RULES[spec.detect.rule];
    if (rule && (!rule.applies || rule.applies(item))) out.push({ spec, rule });
  }
  return out.sort((x, y) =>
    x.spec.priority !== y.spec.priority
      ? y.spec.priority - x.spec.priority
      : x.spec.id < y.spec.id
        ? -1
        : x.spec.id > y.spec.id
          ? 1
          : 0,
  );
}

export type { MisconceptionRule, ProcessMeta } from './rules';
export { sameResponse } from './rules';
