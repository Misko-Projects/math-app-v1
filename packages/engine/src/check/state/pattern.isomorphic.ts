// pattern.isomorphic `{ source, units? }` (03 §5.5 pattern-extend `translate`): the child rebuilds a
// pattern with new units (ABB as clap, stomp, stomp, or as red, blue, blue). Response
// `{ tokens: PatternToken[] }`, the new pattern in reading order. Correct when it is as long as
// `source` and some one-to-one mapping from the source units to the new units turns `source` into
// `tokens`: equal source units always become the same new unit, and different source units always
// become different new units. Any such mapping counts (state equivalence, 03 §5.5), so AAB may become
// fish, fish, crab or crab, crab, fish. With `units`, every new token must be one of them (the
// widget's palette, `translateTo`). U05 (#14).
import { sameToken } from './pattern.tokens';
import type { StateChecker } from './types';

type Token = Readonly<Record<string, unknown>>;

const isToken = (v: unknown): v is Token =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const tokenList = (v: unknown): Token[] | undefined =>
  Array.isArray(v) && v.every(isToken) ? (v as Token[]) : undefined;

/** Whether `got` is `source` under a one-to-one renaming of its units. */
export function isIsomorphic(source: readonly Token[], got: readonly Token[]): boolean {
  if (source.length === 0 || source.length !== got.length) return false;
  for (let i = 0; i < source.length; i += 1) {
    for (let j = i + 1; j < source.length; j += 1) {
      const same = sameToken(source[i] as Token, source[j] as Token);
      if (same !== sameToken(got[i] as Token, got[j] as Token)) return false;
    }
  }
  return true;
}

export const patternIsomorphic: StateChecker = {
  id: 'pattern.isomorphic',
  check(target, value) {
    const source = tokenList(target.source);
    const got = tokenList(value.tokens);
    if (!source || !got || !isIsomorphic(source, got)) return false;
    const units = target.units === undefined ? undefined : tokenList(target.units);
    if (target.units !== undefined && !units) return false;
    return !units || got.every((g) => units.some((u) => sameToken(u, g)));
  },
  // Swapping two tokens of a pattern can give another valid renaming (AB AB → BA BA); that is a
  // correct alternative, not a near miss.
  exempt(target, _original, mutated) {
    return patternIsomorphic.check(target, mutated);
  },
};
