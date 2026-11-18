// 03 §8.4: slot syntax `{name}`, `{name|type}`, `{name|type:countVar}`; `{{` and `}}` are literal
// braces. The build splits the spoken line at its slots: each non-blank static segment becomes a
// clip `<key>#<i>` and each slot a token `$name[|type[:countVar]]` (02 §5.5 `narration.json`).

/** Slot types from the 03 §8.3 typed-slot table. `noun`, `unit` and `shape` need a countVar. */
export const SLOT_TYPES = [
  'num',
  'digits',
  'ord',
  'cents',
  'dollars',
  'time',
  'frac',
  'dec',
  'noun',
  'unit',
  'shape',
  'name',
  'word',
] as const;
export type SlotType = (typeof SLOT_TYPES)[number];
const COUNTED_TYPES: readonly SlotType[] = ['noun', 'unit', 'shape'];

export interface Slot {
  name: string;
  type?: SlotType;
  /** `noun`/`unit`/`shape`: the var whose value picks `.one` or `.many`. */
  countVar?: string;
  /** `dec`: decimal places, `{v|dec:1}` tenths or `{v|dec:2}` hundredths (03 §8.3). */
  places?: 1 | 2;
  /** The token as written inside the braces, e.g. `item|noun:n`. */
  raw: string;
}

export type Segment = { kind: 'text'; text: string } | { kind: 'slot'; slot: Slot };

export interface ParsedLine {
  segments: Segment[];
  errors: string[];
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseLine(line: string): ParsedLine {
  const segments: Segment[] = [];
  const errors: string[] = [];
  let text = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '{' && line[i + 1] === '{') {
      text += '{';
      i += 2;
    } else if (ch === '}' && line[i + 1] === '}') {
      text += '}';
      i += 2;
    } else if (ch === '{') {
      const end = line.indexOf('}', i + 1);
      if (end < 0) {
        errors.push(`unclosed slot at character ${i + 1} (write {{ for a literal brace)`);
        text += line.slice(i);
        break;
      }
      const raw = line.slice(i + 1, end);
      const slot = parseSlot(raw, errors);
      if (text) segments.push({ kind: 'text', text });
      text = '';
      if (slot) segments.push({ kind: 'slot', slot });
      i = end + 1;
    } else if (ch === '}') {
      errors.push(`stray } at character ${i + 1} (write }} for a literal brace)`);
      text += ch;
      i += 1;
    } else {
      text += ch;
      i += 1;
    }
  }
  if (text) segments.push({ kind: 'text', text });
  return { segments, errors };
}

function parseSlot(raw: string, errors: string[]): Slot | null {
  const [name = '', typePart, ...extra] = raw.split('|');
  if (!IDENT.test(name)) {
    errors.push(`slot {${raw}}: '${name}' is not a variable name`);
    return null;
  }
  if (extra.length > 0) {
    errors.push(`slot {${raw}}: at most one |type`);
    return null;
  }
  if (typePart === undefined) return { name, raw };
  const [type = '', countVar, ...more] = typePart.split(':');
  if (!(SLOT_TYPES as readonly string[]).includes(type)) {
    errors.push(`slot {${raw}}: unknown type '${type}' (one of ${SLOT_TYPES.join(', ')})`);
    return null;
  }
  const t = type as SlotType;
  if (more.length > 0) {
    errors.push(`slot {${raw}}: at most one :countVar`);
    return null;
  }
  if (COUNTED_TYPES.includes(t)) {
    if (countVar === undefined || !IDENT.test(countVar)) {
      errors.push(`slot {${raw}}: type '${t}' needs a count variable, e.g. {${name}|${t}:n}`);
      return null;
    }
    return { name, type: t, countVar, raw };
  }
  if (t === 'dec') {
    if (countVar !== '1' && countVar !== '2') {
      errors.push(
        `slot {${raw}}: type 'dec' needs its decimal places, {${name}|dec:1} (tenths) or {${name}|dec:2} (hundredths)`,
      );
      return null;
    }
    return { name, type: t, places: countVar === '1' ? 1 : 2, raw };
  }
  if (countVar !== undefined) {
    errors.push(`slot {${raw}}: type '${t}' takes no count variable`);
    return null;
  }
  return { name, type: t, raw };
}

/** The `clips` list for `narration.json`: static clip ids and slot tokens in speaking order. */
export function lineClips(key: string, segments: readonly Segment[]): string[] {
  const clips: string[] = [];
  let i = 0;
  for (const s of segments) {
    if (s.kind === 'slot') {
      const { name, type, countVar, places } = s.slot;
      const suffix = countVar ?? places;
      clips.push(`$${name}${type ? `|${type}` : ''}${suffix !== undefined ? `:${suffix}` : ''}`);
    } else if (s.text.trim() !== '') {
      clips.push(`${key}#${i}`);
      i += 1;
    }
  }
  return clips;
}

/** Display text with each slot replaced by `placeholder` (03 §8.5 checks the interpolated line). */
export function renderWithPlaceholders(
  segments: readonly Segment[],
  placeholder: (slot: Slot) => string,
): string {
  return segments.map((s) => (s.kind === 'text' ? s.text : placeholder(s.slot))).join('');
}

export function slotsOf(segments: readonly Segment[]): Slot[] {
  return segments.flatMap((s) => (s.kind === 'slot' ? [s.slot] : []));
}

// ---------- 03 §8.5 reading level ----------

/** Standalone math symbols do not count as words (03 §8.5). */
const MATH_SYMBOLS = new Set(['+', '-', '−', '×', '÷', '=', '<', '>', '?', '__', '_']);

export function words(text: string): string[] {
  return text.split(/\s+/).filter((t) => t !== '' && !MATH_SYMBOLS.has(t));
}

/** Sentences: tokens that end with . ! or ? (ignoring closing quotes and brackets); at least 1. */
export function sentenceCount(text: string): number {
  const tokens = words(text);
  if (tokens.length === 0) return 0;
  let n = 0;
  tokens.forEach((t, i) => {
    const bare = t.replace(/["'”’)\]]+$/, '');
    if (/[.!?]$/.test(bare) && /[A-Za-z0-9]/.test(bare)) n += 1;
    else if (i === tokens.length - 1) n += 1; // a final sentence without terminal punctuation
  });
  return n;
}

/** Lowercase word with surrounding punctuation removed; null for numbers, money and times. */
export function vocabWord(token: string): string | null {
  const w = token
    .toLowerCase()
    .replace(/^[^a-z0-9$]+/, '')
    .replace(/[^a-z0-9%¢]+$/, '')
    .replace(/[’]/g, "'");
  if (w === '' || /[0-9$¢%]/.test(w)) return null;
  return w;
}

export const READING_LIMITS: Readonly<
  Record<'K' | '1' | '2' | '3+', { words: number; sentences: number }>
> = {
  K: { words: 12, sentences: 2 },
  '1': { words: 16, sentences: 2 },
  '2': { words: 20, sentences: 3 },
  '3+': { words: 24, sentences: 3 },
};

export function readingBand(grade: string): keyof typeof READING_LIMITS {
  if (grade === 'K' || grade === '1' || grade === '2') return grade;
  return '3+';
}

/** fb.* lines must not contain these (03 §8.5, tone error). */
export const FEEDBACK_TONE_WORDS: readonly string[] = [
  'wrong',
  'bad',
  'fail',
  'failed',
  'lose',
  'hurry',
  'easy',
  'simple',
  'simply',
  'obviously',
  'smart',
  'genius',
];
