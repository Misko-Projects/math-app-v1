// Misconception rule registry (03 §7.1), one line per rule, keyed by `detect.rule`.
// E01 registers the three fixture rules; K01/K02 add the rest of the 03 §7.2 library.

import type { GeneratedItem, MisconceptionSpec } from '@number-island/shared';
import { boundMisconceptions, boundTemplate } from '../content/binding';
import type { MisconceptionRule } from './rules';
import { countAllInstead } from './rules/countAllInstead';
import { countStartNumber } from './rules/countStartNumber';
import { decadeTransition } from './rules/decadeTransition';
import { offByOneCounting } from './rules/offByOneCounting';
import { recountFromOne } from './rules/recountFromOne';
import { teenReversal } from './rules/teenReversal';

const RULES: Record<string, MisconceptionRule> = {
  countStartNumber: countStartNumber,
  countAllInstead: countAllInstead,
  offByOneCounting: offByOneCounting,
  recountFromOne: recountFromOne,
  decadeTransition: decadeTransition,
  teenReversal: teenReversal,
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
    if (rule) out.push({ spec, rule });
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
