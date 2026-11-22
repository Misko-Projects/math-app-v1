// Format state models (03 §6.3) and format features (03 §5.5), one line per format.
// E01 registers the 11 fixture formats; U03–U05 register the others here (U04: #13).

import type { AnswerSpec, ItemFormat, WidgetConfig } from '@number-island/shared';
import { areaTiles } from './area-tiles';
import { arrayBuild } from './array-build';
import { balance } from './balance';
import { baseTenBuild } from './base-ten-build';
import { baseTenTrade } from './base-ten-trade';
import { compare } from './compare';
import { compareLength } from './compare-length';
import { dotFlash } from './dot-flash';
import { equalGroups } from './equal-groups';
import { equalShare } from './equal-share';
import { expandedForm } from './expanded-form';
import { fractionCut } from './fraction-cut';
import { fractionLine } from './fraction-line';
import { fractionPick } from './fraction-pick';
import { hundredChart } from './hundred-chart';
import { makeSet } from './make-set';
import { measureLength } from './measure-length';
import { numberBond } from './number-bond';
import { numberLineJump } from './number-line-jump';
import { numberLinePlace } from './number-line-place';
import { numberPad } from './number-pad';
import { numeralPick } from './numeral-pick';
import { order } from './order';
import { perimeterWalk } from './perimeter-walk';
import { puzzleGrid } from './puzzle-grid';
import { rekenrek } from './rekenrek';
import { shapeCompose } from './shape-compose';
import { shapeSort } from './shape-sort';
import { storyProblem } from './story-problem';
import { tapCount } from './tap-count';
import { tenframeFill } from './tenframe-fill';
import type { FormatModel, FormatState } from './types';

// The models are stored type-erased; `formatModel()` is the typed accessor.
// biome-ignore lint/suspicious/noExplicitAny: each entry is a FormatModel for its own format.
type AnyModel = FormatModel<any, any>;

const MODELS: Partial<Record<ItemFormat, AnyModel>> = {
  'tap-count': tapCount,
  'make-set': makeSet,
  'dot-flash': dotFlash,
  'numeral-pick': numeralPick,
  'number-pad': numberPad,
  compare,
  order,
  'tenframe-fill': tenframeFill,
  'number-bond': numberBond,
  rekenrek,
  'number-line-jump': numberLineJump,
  'hundred-chart': hundredChart,
  'number-line-place': numberLinePlace,
  // U04 (#13)
  'base-ten-build': baseTenBuild,
  'base-ten-trade': baseTenTrade,
  'expanded-form': expandedForm,
  'array-build': arrayBuild,
  'equal-groups': equalGroups,
  'equal-share': equalShare,
  'area-tiles': areaTiles,
  // U04 (#13): equality, stories and puzzles
  'story-problem': storyProblem,
  balance,
  'puzzle-grid': puzzleGrid,
  // U05 (#14) measurement and geometry
  'measure-length': measureLength,
  'compare-length': compareLength,
  'perimeter-walk': perimeterWalk,
  'shape-compose': shapeCompose,
  'shape-sort': shapeSort,
  // U05 (#14) fractions
  'fraction-cut': fractionCut,
  'fraction-pick': fractionPick,
  'fraction-line': fractionLine,
};

export function formatModel<F extends ItemFormat>(
  format: F,
): FormatModel<F, FormatState<F>> | undefined {
  return MODELS[format] as FormatModel<F, FormatState<F>> | undefined;
}

export function formatModels(): ItemFormat[] {
  return Object.keys(MODELS) as ItemFormat[];
}

/** 03 §5.4 `FORMAT_FEATURES[format][feature].weight`. Formats without a model have none yet. */
export function formatFeatures(
  format: ItemFormat,
): Record<string, { weight: number; doc: string }> {
  return MODELS[format]?.features ?? {};
}

/** Raw format feature values for a built widget (empty for formats without a model). */
export function formatFeatureValues(
  widget: WidgetConfig,
  answer: AnswerSpec,
): Record<string, number> {
  const m = MODELS[widget.format];
  return m ? m.featureValues(widget, answer) : {};
}

export type { FormatModel, FormatState } from './types';
export { UnsupportedOpError } from './types';
