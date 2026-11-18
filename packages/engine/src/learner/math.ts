// Small numeric helpers for the learner model.

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export const logit = (p: number): number => Math.log(p / (1 - p));

/** Median of a non-empty list (mean of the middle two for an even count). */
export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
