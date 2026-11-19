// Shared by compare.sets and compare.numbers (03 §5.6): the §5.5 compare and balance features under
// their format names and weights (those formats have no engine model yet, so the generators emit
// and declare them, K01), and the answer of a two-sided comparison.

import type { LessonStep, StimulusSpec } from '@number-island/shared';

/**
 * The side drawn to look like more on a compare.sets conflict item (03 §7.2 MC.perceptual-size):
 * the side whose objects are drawn bigger and spread out (`sizeVaries`). Null when no side is.
 */
export function bigLookingSide(w: {
  left: StimulusSpec;
  right: StimulusSpec;
}): 'left' | 'right' | null {
  const big = (s: StimulusSpec) => s.kind === 'objects' && s.set.sizeVaries === true;
  if (big(w.left) && !big(w.right)) return 'left';
  if (big(w.right) && !big(w.left)) return 'right';
  return null;
}

/** 03 §5.5 compare features (K01: emitted by the generators until the format has a model). */
export const COMPARE_FEATURES: Record<string, { weight: number; doc: string }> = {
  closeness: { weight: 1.0, doc: 'compare: smaller ÷ larger of the two values (1 when equal)' },
  conflict: { weight: 0.8, doc: 'compare: the perceptual cue contradicts the number' },
  'ask.fewer': { weight: 0.3, doc: 'compare: asks which is fewer (or less)' },
  'ask.symbol': { weight: 0.4, doc: 'compare: place <, > or = between the sides' },
  equal: { weight: 0.4, doc: 'compare: both sides are the same' },
  magnitude: { weight: 0.3, doc: 'compare: digits of the larger value − 1' },
};

/** 03 §5.5 balance features the comparison generators can produce (K01, as above). */
export const BALANCE_FEATURES: Record<string, { weight: number; doc: string }> = {
  'judge.false': { weight: 0.3, doc: 'balance judge: the sides are not balanced' },
  size: { weight: 0.3, doc: 'balance: the largest number ÷ 10' },
  'showTilt.off': { weight: 0.4, doc: 'balance: the tilt is hidden' },
};

type FeatureDecls = Record<string, { weight: number; doc: string }>;

/** The named entries of a feature table (a generator declares only the features it emits). */
export function featureSubset(src: FeatureDecls, names: readonly string[]): FeatureDecls {
  const out: FeatureDecls = {};
  for (const n of names) {
    const f = src[n];
    if (!f) throw new Error(`unknown feature ${n}`);
    out[n] = f;
  }
  return out;
}

export type Side = 'left' | 'right' | 'same';
export type Ask = 'more' | 'fewer';

/** Which side answers "which has more / fewer?" (`same` when equal). */
export function sideAnswer(left: number, right: number, ask: Ask): Side {
  if (left === right) return 'same';
  const leftMore = left > right;
  return (ask === 'more') === leftMore ? 'left' : 'right';
}

/** The relation symbol between left and right. */
export function relation(left: number, right: number): '<' | '>' | '=' {
  return left < right ? '<' : left > right ? '>' : '=';
}

/** Smaller ÷ larger, in hundredths (1 when equal, 0 when one side is empty). */
export function closeness(x: number, y: number): number {
  const hi = Math.max(x, y);
  if (hi <= 0) return 1;
  return Math.round((Math.min(x, y) / hi) * 100) / 100;
}

export const digits = (n: number): number => String(Math.abs(Math.trunc(n))).length;

export const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };
