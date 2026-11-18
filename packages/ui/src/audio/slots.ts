// Slot tokens in `narration.json` clip lists (03 §8.4) and their expansion into clip-set keys
// (03 §8.3 typed-slot table). A token is `$<var>` or `$<var>|<type>[:<suffix>]`: the suffix is the
// count variable for `noun`, `unit` and `shape`, and the decimal places (`1` or `2`) for `dec`.
//
// Expansion yields narration *keys* of the clip inventory (`num.23`, `money.cent.many`), not clip
// ids: the caller maps each key to its clips through narration.json, and to its words when it has
// to fall back to Web Speech.
import type { SlotType } from '@number-island/content';
import { numberClips } from '@number-island/shared';

export interface SlotToken {
  name: string;
  type?: SlotType;
  /** Count variable (`noun`/`unit`/`shape`) or decimal places (`dec`). */
  suffix?: string;
}

/** A slot that cannot be spoken from clips (bad token, missing var, value out of range). */
export class SlotError extends Error {
  override name = 'SlotError';
}

const TYPES = new Set<string>([
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
] satisfies SlotType[]);

const TOKEN = /^\$([A-Za-z_][A-Za-z0-9_]*)(?:\|([a-z]+)(?::([A-Za-z0-9_]+))?)?$/;

export function isSlotToken(clip: string): boolean {
  return clip.startsWith('$');
}

/** Parses `$var`, `$var|type` or `$var|type:suffix`; null when the token is malformed. */
export function parseSlotToken(token: string): SlotToken | null {
  const m = TOKEN.exec(token);
  if (!m) return null;
  const [, name, type, suffix] = m;
  if (!name) return null;
  if (type === undefined) return { name };
  if (!TYPES.has(type)) return null;
  const t = type as SlotType;
  const needsSuffix = t === 'noun' || t === 'unit' || t === 'shape' || t === 'dec';
  if (needsSuffix !== (suffix !== undefined)) return null;
  if (t === 'dec' && suffix !== '1' && suffix !== '2') return null;
  return suffix === undefined ? { name, type: t } : { name, type: t, suffix };
}

type Vars = Readonly<Record<string, string | number>>;

/** The clip-set keys that speak one slot, per the 03 §8.3 typed-slot table. */
export function expandSlot(token: SlotToken, vars: Vars | undefined): string[] {
  const raw = vars?.[token.name];
  if (raw === undefined) throw new SlotError(`no value for slot $${token.name}`);
  const type = token.type ?? (typeof raw === 'number' ? 'num' : undefined);
  switch (type) {
    case undefined: {
      // An untyped string var is a content error (V16); accept a numeric string, refuse free text.
      return number(integer(raw, token));
    }
    case 'num':
      return number(integer(raw, token));
    case 'digits': {
      const n = integer(raw, token);
      const digits = [...String(Math.abs(n))].map((d) => `num.${d}`);
      return n < 0 ? ['num.negative', ...digits] : digits;
    }
    case 'ord': {
      const n = integer(raw, token);
      if (n < 1 || n > 31) throw new SlotError(`ordinal $${token.name} = ${n} is outside 1–31`);
      return [`ord.${n}`];
    }
    case 'cents': {
      const n = nonNegative(integer(raw, token), token);
      return [...number(n), n === 1 ? 'money.cent.one' : 'money.cent.many'];
    }
    case 'dollars':
      return dollars(nonNegative(integer(raw, token), token));
    case 'time':
      return time(String(raw), token);
    case 'frac':
      return fraction(String(raw), token);
    case 'dec':
      return decimal(nonNegative(integer(raw, token), token), token.suffix === '1' ? 1 : 2, token);
    case 'noun':
    case 'unit':
    case 'shape': {
      const id = identifier(raw, token);
      const countVar = token.suffix ?? '';
      const countRaw = vars?.[countVar];
      if (countRaw === undefined) {
        throw new SlotError(`slot $${token.name} needs the count variable ${countVar}`);
      }
      const count = Number(countRaw);
      if (!Number.isFinite(count)) throw new SlotError(`count ${countVar} is not a number`);
      return [`${type}.${id}.${count === 1 ? 'one' : 'many'}`];
    }
    case 'name':
      return [`res.${identifier(raw, token)}`];
    case 'word':
      return [`word.${identifier(raw, token)}`];
  }
}

/**
 * Swaps the utterance's final clip-set key for its sentence-final `.end` variant (03 §8.3) when it
 * is a number word. Returns null when no variant applies.
 */
export function endVariantKey(key: string): string | null {
  return /^num\.(\d+|hundred|thousand|million)$/.test(key) ? `${key}.end` : null;
}

function number(n: number): string[] {
  try {
    return numberClips(n);
  } catch (e) {
    throw new SlotError(e instanceof Error ? e.message : String(e));
  }
}

function integer(raw: string | number, token: SlotToken): number {
  const n = typeof raw === 'number' ? raw : raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(n)) {
    throw new SlotError(`slot $${token.name} needs an integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

function nonNegative(n: number, token: SlotToken): number {
  if (n < 0) throw new SlotError(`slot $${token.name} cannot be negative (${n})`);
  return n;
}

function identifier(raw: string | number, token: SlotToken): string {
  const id = String(raw);
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(id)) {
    throw new SlotError(`slot $${token.name} needs a clip id, got ${JSON.stringify(raw)}`);
  }
  return id;
}

/**
 * 125 → "one dollar and twenty-five cents". Under one dollar the cents are read alone (25 → "twenty-
 * five cents"), as a teacher would; zero is "zero dollars".
 */
function dollars(cents: number): string[] {
  const d = Math.floor(cents / 100);
  const c = cents % 100;
  const centsPart = [...number(c), c === 1 ? 'money.cent.one' : 'money.cent.many'];
  if (d === 0 && c > 0) return centsPart;
  const dollarsPart = [...number(d), d === 1 ? 'money.dollar.one' : 'money.dollar.many'];
  return c > 0 ? [...dollarsPart, 'word.and', ...centsPart] : dollarsPart;
}

/** "7:05" → seven oh five; "7:00" → seven o'clock; "7:30 pm" → seven thirty p m. */
function time(raw: string, token: SlotToken): string[] {
  const m = /^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i.exec(raw.trim());
  if (!m) throw new SlotError(`slot $${token.name} needs "h:mm", got ${JSON.stringify(raw)}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new SlotError(`slot $${token.name} has an invalid time ${raw}`);
  const out = [`num.${h}`];
  if (min === 0) out.push('time.oclock');
  else if (min < 10) out.push('time.oh', `num.${min}`);
  else out.push(`num.${min}`);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem) out.push(`time.${meridiem}`);
  return out;
}

/** "3/4" → three fourths; "1/2" → one half; "3/1" → three wholes. */
function fraction(raw: string, token: SlotToken): string[] {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(raw);
  if (!m) throw new SlotError(`slot $${token.name} needs "a/b", got ${JSON.stringify(raw)}`);
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (b === 0) throw new SlotError(`slot $${token.name} has a zero denominator`);
  return [...number(a), `den.${b}.${a === 1 ? 'one' : 'many'}`];
}

/**
 * `dec` values are hundredths (03 §8.3): 30:1 → three tenths; 47:2 → forty-seven hundredths;
 * 250:2 → two and fifty hundredths. A whole number with no fraction part reads as the whole only.
 */
function decimal(hundredths: number, places: 1 | 2, token: SlotToken): string[] {
  if (places === 1 && hundredths % 10 !== 0) {
    throw new SlotError(`slot $${token.name} = ${hundredths} hundredths is not a whole tenth`);
  }
  const whole = Math.floor(hundredths / 100);
  const rest = hundredths % 100;
  const numerator = places === 1 ? rest / 10 : rest;
  const denominator = places === 1 ? 10 : 100;
  const part = [...number(numerator), `den.${denominator}.${numerator === 1 ? 'one' : 'many'}`];
  if (whole === 0) return part;
  if (numerator === 0) return number(whole);
  return [...number(whole), 'word.and', ...part];
}
