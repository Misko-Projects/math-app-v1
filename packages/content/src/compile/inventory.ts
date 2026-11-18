import { SHAPE_KINDS } from '@number-island/shared';

// 03 §8.3 clip inventory: the clip sets `narration/numbers.yaml` must define so every typed slot
// value has a pre-rendered clip (V16). Nouns come from contexts.yaml (V26) and resident names
// (`res.<id>`) from game data.

export const UNIT_IDS = [
  'in',
  'ft',
  'cm',
  'm',
  'g',
  'kg',
  'L',
  'sq-unit',
  'sq-cm',
  'sq-m',
  'sq-in',
  'sq-ft',
  'shell',
  'cube',
  'stick',
] as const;

export const WORD_IDS = [
  'and',
  'true',
  'false',
  'even',
  'odd',
  'more',
  'fewer',
  'same',
  'left',
  'right',
  'yes',
  'no',
  'box',
] as const;

export const TIME_IDS = [
  'oclock',
  'oh',
  'am',
  'pm',
  'quarter',
  'half',
  'past',
  'to',
  'minute.one',
  'minute.many',
  'hour.one',
  'hour.many',
] as const;

export const DENOMINATORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 100] as const;

/** Every clip key the 03 §8.3 inventory requires, excluding nouns and resident names. */
export function requiredClipKeys(): string[] {
  const keys: string[] = [];
  for (let n = 0; n <= 99; n += 1) keys.push(`num.${n}`);
  keys.push('num.hundred', 'num.thousand', 'num.million', 'num.negative');
  for (const b of DENOMINATORS) keys.push(`den.${b}.one`, `den.${b}.many`);
  for (let n = 1; n <= 31; n += 1) keys.push(`ord.${n}`);
  for (const t of TIME_IDS) keys.push(`time.${t}`);
  keys.push('money.cent.one', 'money.cent.many', 'money.dollar.one', 'money.dollar.many');
  for (const u of UNIT_IDS) keys.push(`unit.${u}.one`, `unit.${u}.many`);
  for (const w of WORD_IDS) keys.push(`word.${w}`);
  for (const s of SHAPE_KINDS) keys.push(`shape.${s}.one`, `shape.${s}.many`);
  return keys;
}

/** Keys every content set needs regardless of its skills (V16, 03 §9.2). */
export const ALWAYS_REQUIRED_KEYS = [
  'fb.correct.1',
  'fb.correct.2',
  'fb.correct.3',
  'fb.correct.4',
  'fb.correct.5',
  'fb.correct.6',
  'h.replay',
  'h.show-me',
  'fb.skip',
  'fb.testout.to-lesson',
] as const;
