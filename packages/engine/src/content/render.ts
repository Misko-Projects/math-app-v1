// 03 §8.4 display formatting: renders a narration line's `text` with its vars for the screen
// (GeneratedItem.prompt.text, captions, content:sample). Speech is composed separately from clips
// by AudioManager.say (02 §5.5).

import { parseLine, type Slot } from '@number-island/content/narration-line';
import type { NarrationJson } from '@number-island/shared';
import { boundNarration } from './binding';

const group = (n: number): string => {
  const sign = n < 0 ? '-' : '';
  const [int, frac] = String(Math.abs(n)).split('.');
  const withCommas =
    (int as string).length >= 4 ? (int as string).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return `${sign}${withCommas}${frac !== undefined ? `.${frac}` : ''}`;
};

function lookupText(narration: NarrationJson, key: string): string | undefined {
  return narration[key]?.text;
}

function formatSlot(slot: Slot, vars: Record<string, string | number>, narration: NarrationJson) {
  const v = vars[slot.name];
  if (v === undefined) return `{${slot.raw}}`;
  const count = (): number => {
    const c = slot.countVar !== undefined ? vars[slot.countVar] : undefined;
    return typeof c === 'number' ? c : Number(c);
  };
  switch (slot.type) {
    case undefined:
    case 'num':
    case 'ord':
      return typeof v === 'number' ? group(v) : String(v);
    case 'digits':
      return String(v);
    case 'cents':
      return `${group(Number(v))}¢`;
    case 'dollars': {
      const cents = Number(v);
      return `$${group(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`;
    }
    case 'time':
    case 'frac':
      return String(v);
    case 'dec': {
      // The value is in hundredths; the slot names how many places to show.
      return (Number(v) / 100).toFixed(slot.places ?? 2);
    }
    case 'noun':
    case 'unit':
    case 'shape': {
      const key = `${slot.type}.${v}.${count() === 1 ? 'one' : 'many'}`;
      return lookupText(narration, key) ?? String(v);
    }
    case 'name':
      return lookupText(narration, `res.${v}`) ?? String(v);
    case 'word':
      return lookupText(narration, `word.${v}`) ?? String(v);
    default:
      return String(v);
  }
}

/**
 * Display text of `key` with `vars` interpolated. Returns the key itself when the line is missing
 * (content validation, V16, prevents that in shipped content).
 */
export function render(
  key: string,
  vars: Record<string, string | number> = {},
  narration: NarrationJson = boundNarration(),
): string {
  const entry = narration[key];
  if (!entry) return key;
  return renderLine(entry.text, vars, narration);
}

/** Interpolates one line (a narration `text` or `say`) with 03 §8.4 display formatting. */
export function renderLine(
  line: string,
  vars: Record<string, string | number> = {},
  narration: NarrationJson = boundNarration(),
): string {
  const { segments } = parseLine(line);
  return segments
    .map((s) => (s.kind === 'text' ? s.text : formatSlot(s.slot, vars, narration)))
    .join('');
}

/**
 * The display text and, when it differs, the spoken form of a line, each interpolated. Checks that
 * a line never gives something away read both: the child hears `say` (03 §8.4).
 */
export function renderForms(
  key: string,
  vars: Record<string, string | number> = {},
  narration: NarrationJson = boundNarration(),
): string[] {
  const entry = narration[key];
  if (!entry) return [key];
  const forms = [renderLine(entry.text, vars, narration)];
  if (entry.say !== undefined) forms.push(renderLine(entry.say, vars, narration));
  return forms;
}

/** Slot names a line uses, in its display text and its spoken form. */
export function lineSlots(key: string, narration: NarrationJson = boundNarration()): string[] {
  const entry = narration[key];
  if (!entry) return [];
  const names = new Set<string>();
  for (const line of [entry.text, entry.say]) {
    if (line === undefined) continue;
    for (const s of parseLine(line).segments) {
      if (s.kind === 'slot') {
        names.add(s.slot.name);
        if (s.slot.countVar) names.add(s.slot.countVar);
      }
    }
  }
  return [...names];
}
