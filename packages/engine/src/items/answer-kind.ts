// The answer kind a template's items take (03 §5.5 `AnswerSpec.kind`), read from its generator
// rather than from its format: a format's capabilities (`FORMAT_SUPPORT`) say what it *can*
// accept, but a generator decides what each item asks for (count.ordinal answers a tap-count
// item with a choice). Only constructed (non-choice) first attempts are evidence (04 §7a).

import type { AnswerKind, ItemTemplate } from '@number-island/shared';
import { FORMAT_SUPPORT } from '@number-island/shared';
import { generateItem } from './generate';

const KINDS = new WeakMap<ItemTemplate, AnswerKind | null>();

/**
 * The answer kind of a template's items: that of the item generated at seed 0 (a generator gives
 * every item of a template the same kind). Null when the item cannot be generated, for example
 * when its generator is not registered. Memoized per template object; deterministic, because the
 * generator registry is static.
 */
export function templateAnswerKind(t: ItemTemplate): AnswerKind | null {
  if (KINDS.has(t)) return KINDS.get(t) ?? null;
  let kind: AnswerKind | null;
  try {
    kind = generateItem(t, 0).answer.kind;
  } catch {
    kind = null;
  }
  KINDS.set(t, kind);
  return kind;
}

/**
 * Whether a template's items take a constructed (non-choice) answer: from its answer kind when
 * known, else from whether its format accepts any non-choice answer (03 §5.5 `FORMAT_SUPPORT`).
 */
export function isConstructedTemplate(t: ItemTemplate): boolean {
  const kind = templateAnswerKind(t);
  if (kind !== null) return kind !== 'choice';
  return FORMAT_SUPPORT[t.format].answers.some((a) => a !== 'choice');
}
