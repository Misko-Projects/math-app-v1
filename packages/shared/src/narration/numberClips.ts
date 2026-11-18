// 03 §8.3: number words composed from the fixed clip inventory in `narration/numbers.yaml`.
// Shared so the engine (rendered text, hint checks) and `AudioManager.say` (02 §5.5) agree.

const MAX = 1_000_000;

/**
 * Clip ids that speak the integer `n` (|n| ≤ 1,000,000), US English with no "and" inside whole
 * numbers: 305 → `num.3 num.hundred num.5`, 12,345 → `num.12 num.thousand num.3 num.hundred num.45`.
 * The caller swaps the last clip of an utterance for its `.end` variant (`num.23.end`) when only
 * terminal punctuation follows the slot (03 §8.3).
 *
 * @throws RangeError when `n` is not a safe integer or |n| > 1,000,000.
 */
export function numberClips(n: number): string[] {
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX) {
    throw new RangeError(`numberClips: expected an integer with |n| ≤ 1,000,000, got ${n}`);
  }
  // `-0` is a safe integer; `-0 < 0` is false, so it reads as zero rather than "negative zero".
  if (n < 0) return ['num.negative', ...numberClips(-n)];
  if (n < 100) return [`num.${Math.abs(n)}`];
  if (n < 1000) {
    const rest = n % 100;
    return [`num.${Math.floor(n / 100)}`, 'num.hundred', ...(rest > 0 ? [`num.${rest}`] : [])];
  }
  if (n < MAX) {
    const rest = n % 1000;
    return [
      ...numberClips(Math.floor(n / 1000)),
      'num.thousand',
      ...(rest > 0 ? numberClips(rest) : []),
    ];
  }
  return ['num.1', 'num.million'];
}
