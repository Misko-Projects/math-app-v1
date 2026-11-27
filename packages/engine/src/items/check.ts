// 03 §5.7 checking: `checkResponse(item, r)` (pure and deterministic) and
// `detectProcessMisconceptions(item, r, meta)` (02 §5.2, run by the TaskRunner after the check).

import type {
  AnswerSpec,
  CheckResult,
  GeneratedItem,
  MisconceptionId,
  NarrationKey,
  ResponseValue,
} from '@number-island/shared';
import { stateChecker } from '../check/state';
import { boundMisconceptions, boundTemplate } from '../content/binding';
import { applicableMisconceptions, type ProcessMeta, sameResponse } from '../misconceptions';
import { devLog } from './devlog';

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Whether the response kind is the one the answer expects (03 §5.1 compatibility). */
export function compatible(answer: AnswerSpec, r: ResponseValue): boolean {
  return answer.kind === r.kind;
}

/** 03 §5.7 `matches` by answer kind. */
export function matches(answer: AnswerSpec, r: ResponseValue): boolean {
  switch (answer.kind) {
    case 'number':
      // Compare after rounding to 6 decimals; the difference is rounded too, so a response exactly
      // at the tolerance (2.1 vs 2 ± 0.1) is not lost to floating-point noise.
      return (
        r.kind === 'number' &&
        round6(Math.abs(round6(r.value) - round6(answer.value))) <= (answer.tolerance ?? 0)
      );
    case 'numbers': {
      if (r.kind !== 'numbers' || r.values.length !== answer.values.length) return false;
      if (answer.fraction?.equivalentOk && answer.values.length === 2) {
        const [a, b] = r.values as [number, number];
        const [c, d] = answer.values as [number, number];
        return b !== 0 && a * d === b * c;
      }
      if (answer.ordered)
        return answer.values.every((v, i) => round6(v) === round6(r.values[i] as number));
      const want = [...answer.values].map(round6).sort((x, y) => x - y);
      const got = [...r.values].map(round6).sort((x, y) => x - y);
      return want.every((v, i) => v === got[i]);
    }
    case 'choice':
      return r.kind === 'choice' && r.id === answer.id;
    case 'placement':
      return r.kind === 'placement' && round6(Math.abs(r.value - answer.value)) <= answer.tolerance;
    case 'state': {
      if (r.kind !== 'state') return false;
      const checker = stateChecker(answer.checker);
      return checker ? checker.check(answer.target, r.value) : false;
    }
  }
}

/**
 * Orders whose cards a size line would not fit, by generator: a pattern's cards go in pattern
 * order and daily events in the order of the day, so "find the smallest one first" would not fit
 * (PR #84 review), and fraction pieces go biggest piece first, which on a part-count card is the
 * smallest number (PR #84 review round 2). The generators declare these keys, so V16 checks they
 * exist.
 */
const GENERATOR_ORDER_RETRY: Readonly<Record<string, NarrationKey>> = {
  'pattern.repeat': 'fb.order.retry-pattern',
  'time.sequence': 'fb.order.retry-day',
  'frac.compare': 'fb.order.retry-pieces',
};

/**
 * The retry line of a wrong answer that no misconception explains: `fb.<format>.retry`, except
 * that an order item's line fits its order (PR #84 review). A descending order finds the biggest
 * first (`fb.order.retry-desc`), and some generators have their own line.
 */
export function retryFeedback(item: GeneratedItem): NarrationKey {
  const w = item.widget;
  if (w.format === 'order') {
    const generator = boundTemplate(item.templateId)?.generator;
    // Same-denominator fractions (FRA.06) have pieces of one size: "find the biggest pieces"
    // cannot tell the cards apart, so they get the plain biggest-first line (PR #139 review).
    const sameParts = generator === 'frac.compare' && item.params.kind === 'sameDen';
    const own = generator && !sameParts ? GENERATOR_ORDER_RETRY[generator] : undefined;
    if (own) return own;

    if (w.direction === 'desc') return 'fb.order.retry-desc';
  }
  // A mystery number has no next box: check the clues (#17 slice 4e).
  if (
    item.params.variant === 'clues' &&
    boundTemplate(item.templateId)?.generator === 'puzzle.grid'
  ) {
    return 'fb.clues.retry';
  }
  // A balance that does not tilt cannot be watched: work out each side (#17 slice 4e).
  if (w.format === 'balance' && !w.showTilt) return 'fb.balance.retry-sides';
  // "Show it with counters" is only true on a story with a counters board (#17 slice 4e).
  if (w.format === 'story-problem' && w.workspace !== 'counters') {
    return 'fb.story-problem.retry-listen';
  }
  return `fb.${item.format}.retry`;
}

export function checkResponse(item: GeneratedItem, r: ResponseValue): CheckResult {
  if (r.kind === 'skip') {
    return { correct: false, partialCredit: 0, misconceptionIds: [], feedback: 'fb.skip' };
  }
  if (!compatible(item.answer, r)) {
    devLog({
      event: 'response.incompatible',
      templateId: item.templateId,
      answerKind: item.answer.kind,
      responseKind: r.kind,
    });
    return { correct: false, partialCredit: 0, misconceptionIds: [], feedback: 'fb.retry' };
  }
  const correct = matches(item.answer, r);
  const closeness =
    item.answer.kind === 'placement' && r.kind === 'placement'
      ? 1 -
        Math.min(
          1,
          Math.abs(r.value - item.answer.value) / (0.25 * (item.answer.max - item.answer.min)),
        )
      : undefined;
  const misconceptionIds = correct ? [] : answerMisconceptions(item, r);
  const library = boundMisconceptions();
  const feedback = correct
    ? `fb.correct.${1 + (((item.seed % 6) + 6) % 6)}`
    : misconceptionIds.length > 0
      ? (library.find((m) => m.id === misconceptionIds[0])?.feedback ?? retryFeedback(item))
      : retryFeedback(item);
  return {
    correct,
    partialCredit: correct ? 1 : 0,
    misconceptionIds,
    feedback,
    ...(closeness !== undefined ? { closeness } : {}),
  };
}

/**
 * Answer and state rules that match an incorrect response, by priority (descending) then id.
 * When two rules predict the same response, only the higher-priority one is tagged (03 §7.1).
 */
function answerMisconceptions(item: GeneratedItem, r: ResponseValue): MisconceptionId[] {
  const out: MisconceptionId[] = [];
  const taggedPredictions: ResponseValue[] = [];
  for (const { spec, rule } of applicableMisconceptions(item, ['answer', 'state'])) {
    if (!rule.match(item, r)) continue;
    const predicted = rule.predict?.(item) ?? null;
    if (predicted && taggedPredictions.some((p) => sameResponse(p, predicted))) continue;
    if (predicted) taggedPredictions.push(predicted);
    out.push(spec.id);
  }
  return out;
}

/**
 * Process misconceptions (02 §5.2, 03 §5.7): rules that read the interaction trace and latency.
 * They may tag a correct response. The runner merges these with checkResponse's ids.
 */
export function detectProcessMisconceptions(
  item: GeneratedItem,
  r: ResponseValue,
  meta: ProcessMeta,
): MisconceptionId[] {
  if (r.kind === 'skip') return [];
  return applicableMisconceptions(item, ['process'])
    .filter(({ rule }) => rule.match(item, r, meta))
    .map(({ spec }) => spec.id);
}
