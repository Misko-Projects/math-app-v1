// MC.pattern-restart (03 §7.2): restarts a repeating pattern from the beginning instead of
// continuing the core. State, with a prediction (pattern.repeat items):
// - pattern-extend `extend` / `fill`: the blanks get the pattern's first tokens (index 0 on);
// - order: the cards to place go in the order of the pattern's first cards;
// - pattern-extend `core`: the bracket stops where the first unit comes back (AAB → just the A),
//   the same "it starts again here" reading.
// `predict` is null when the restart gives the right answer (the shown part ends on a whole core,
// or the first unit does not come back early), so such items cannot discriminate.

import type { GeneratedItem, PatternToken, ResponseValue } from '@number-island/shared';
import { sameToken } from '../../check/state/pattern.tokens';
import { type MisconceptionRule, sameResponse } from '../rules';

/** Where the first unit of a core comes back (the core length when it does not come back early). */
export function earlyCoreLength(core: string): number {
  for (let j = 1; j < core.length; j += 1) if (core[j] === core[0]) return j;
  return core.length;
}

function predictRestart(item: GeneratedItem): ResponseValue | null {
  const w = item.widget;
  const a = item.answer;
  if (w.format === 'pattern-extend' && w.kind === 'repeat' && a.kind === 'state') {
    if (a.checker === 'select.exactSet') {
      const core = typeof item.params.core === 'string' ? item.params.core : '';
      const j = earlyCoreLength(core);
      if (core.length === 0 || j === core.length) return null;
      return { kind: 'state', value: { values: Array.from({ length: j }, (_, i) => i) } };
    }
    if (a.checker !== 'pattern.tokens' || !Array.isArray(a.target.expected)) return null;
    const expected = a.target.expected as PatternToken[];
    const first = w.sequence.slice(0, expected.length);
    if (first.length < expected.length || first.some((x) => x === null)) return null;
    const tokens = first as PatternToken[];
    if (tokens.every((x, i) => sameToken(x, expected[i] as PatternToken))) return null;
    return { kind: 'state', value: { tokens } };
  }
  if (w.format === 'order' && a.kind === 'numbers' && w.fixed) {
    const fixed = w.fixed;
    const fixedIds = new Set(Object.values(fixed));
    const sprite = (id: string | undefined): string | undefined => {
      const s = w.items.find((i) => i.id === id)?.stimulus;
      return s?.kind === 'objects' ? s.set.sprite : undefined;
    };
    const free = w.items.filter((i) => !fixedIds.has(i.id));
    const used = new Set<string>();
    const placed: number[] = [];
    for (let k = 0; k < free.length; k += 1) {
      const want = sprite(fixed[k]);
      const card = free.find((i) => !used.has(i.id) && sprite(i.id) === want);
      if (!card) return null;
      used.add(card.id);
      placed.push(card.value);
    }
    const values = [...a.values.slice(0, a.values.length - free.length), ...placed];
    if (values.every((v, i) => v === a.values[i])) return null;
    return { kind: 'numbers', values };
  }
  return null;
}

/**
 * "Make the next repeat" orders (`mode: core`, ALG.04.t3) free exactly one core after whole cores,
 * so starting again from the first card is the answer: the rule does not apply to them (03 §7.1
 * `applies`; PR #84 review).
 */
const nextRepeat = (item: GeneratedItem): boolean =>
  item.widget.format === 'order' && item.params.mode === 'core';

export const patternRestart: MisconceptionRule = {
  id: 'patternRestart',
  kind: 'state',
  applies: (item) => !nextRepeat(item),
  predict: predictRestart,
  match(item, r) {
    const p = predictRestart(item);
    return p !== null && sameResponse(p, r);
  },
};
