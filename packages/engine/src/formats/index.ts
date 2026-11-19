// Format state models (03 §6.3) and format features (03 §5.5), one line per format.
// E01 registers the 11 fixture formats; U03–U05 register the others here (U04: #13).

import type { AnswerSpec, ItemFormat, WidgetConfig } from '@number-island/shared';
import { areaTiles } from './area-tiles';
import { arrayBuild } from './array-build';
import { baseTenBuild } from './base-ten-build';
import { baseTenTrade } from './base-ten-trade';
import { dotFlash } from './dot-flash';
import { equalGroups } from './equal-groups';
import { equalShare } from './equal-share';
import { expandedForm } from './expanded-form';
import { hundredChart } from './hundred-chart';
import { makeSet } from './make-set';
import { numberBond } from './number-bond';
import { numberLineJump } from './number-line-jump';
import { numberPad } from './number-pad';
import { numeralPick } from './numeral-pick';
import { order } from './order';
import { rekenrek } from './rekenrek';
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
  order,
  'tenframe-fill': tenframeFill,
  'number-bond': numberBond,
  rekenrek,
  'number-line-jump': numberLineJump,
  'hundred-chart': hundredChart,
  // U04 (#13)
  'base-ten-build': baseTenBuild,
  'base-ten-trade': baseTenTrade,
  'expanded-form': expandedForm,
  'array-build': arrayBuild,
  'equal-groups': equalGroups,
  'equal-share': equalShare,
  'area-tiles': areaTiles,
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
