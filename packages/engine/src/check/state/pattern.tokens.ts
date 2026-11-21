// pattern.tokens `{ expected }` (03 §5.5 pattern-extend `extend`, `fill`): the tokens the child
// placed in the blanks, in order (response `{ tokens: PatternToken[] }`), are exactly the expected
// ones. A token is `{ sprite, color? }` (a repeating unit), `{ n }` (a number) or `{ tiles }`; two
// tokens match when every field matches (a missing colour matches only a missing colour).
import type { StateChecker } from './types';

type Token = Readonly<Record<string, unknown>>;

const isToken = (v: unknown): v is Token =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Whether two pattern tokens are the same unit. */
export function sameToken(a: Token, b: Token): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (x === undefined && y === undefined) continue;
    if (x !== y) return false;
  }
  return true;
}

export const patternTokens: StateChecker = {
  id: 'pattern.tokens',
  check(target, value) {
    const want = target.expected;
    const got = value.tokens;
    if (!Array.isArray(want) || !Array.isArray(got) || want.length !== got.length) return false;
    return want.every((w, i) => isToken(w) && isToken(got[i]) && sameToken(w, got[i] as Token));
  },
};
