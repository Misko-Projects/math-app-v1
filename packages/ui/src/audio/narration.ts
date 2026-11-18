// Narration planning (02 §5.5, 03 §8.4): turn a narration key plus vars, or an AI phrase-bank line,
// into the ordered clips to stitch and the words to speak if any clip is unavailable.
//
// Pure: no Web Audio, no DOM. The AudioManager resolves each planned clip through the audio manifest.
import type {
  ClipId,
  CompiledNarrationEntry,
  NarrationJson,
  NarrationVoice,
  PhrasePart,
} from '@number-island/shared';
import { endVariantKey, expandSlot, isSlotToken, parseSlotToken, SlotError } from './slots';

type Vars = Readonly<Record<string, string | number>>;

/** One clip of a line. The first candidate the manifest knows is played. */
export interface PlannedClip {
  /** Clip ids to try in order (a sentence-final `.end` variant first, then the plain clip). */
  candidates: ClipId[];
  /** Punctuation-only static segments: skipped, not a fallback trigger, when they have no audio. */
  optional: boolean;
}

export interface LinePlan {
  /** Display text with vars filled in (captions). */
  text: string;
  /** What Web Speech says when the line cannot be stitched from clips. */
  spoken: string;
  voice: NarrationVoice;
  /** Clips in speaking order; null when the line cannot be built from clips at all. */
  clips: PlannedClip[] | null;
  /** Why `clips` is null, or why a part had to be dropped (dev warnings). */
  problems: string[];
}

/** Plans `say(key, vars)`. Returns null when the key is not in narration.json. */
export function planLine(
  narration: NarrationJson,
  key: string,
  vars: Vars | undefined,
): LinePlan | null {
  const entry = narration[key];
  if (!entry) return null;
  const problems: string[] = [];
  const segments = splitLine(entry.say ?? entry.text);
  // Each non-blank static segment, and whether anything is spoken before it in the line.
  const staticTexts = segments.flatMap((s, i) =>
    s.kind === 'text' && s.text.trim() !== ''
      ? [
          {
            text: s.text,
            followsContent: segments
              .slice(0, i)
              .some((p) => p.kind === 'slot' || p.text.trim() !== ''),
          },
        ]
      : [],
  );
  const tailIsTerminal = trailingIsTerminal(segments);
  const lastSlotIndex = findLastIndex(entry.clips, isSlotToken);

  let clips: PlannedClip[] | null = [];
  let staticIndex = 0;
  for (const [i, clip] of entry.clips.entries()) {
    if (!isSlotToken(clip)) {
      const segment = staticTexts[staticIndex];
      staticIndex += 1;
      clips?.push({
        candidates: [clip],
        optional: segment ? !isSpoken(segment.text, segment.followsContent) : false,
      });
      continue;
    }
    const token = parseSlotToken(clip);
    if (!token) {
      problems.push(`${key}: malformed slot token ${clip}`);
      clips = null;
      continue;
    }
    try {
      const keys = expandSlot(token, vars);
      const sentenceFinal = i === lastSlotIndex && tailIsTerminal;
      const planned = keysToClips(narration, keys, sentenceFinal, problems);
      if (planned === null) clips = null;
      else clips?.push(...planned);
    } catch (e) {
      problems.push(`${key}: ${e instanceof SlotError ? e.message : String(e)}`);
      clips = null;
    }
  }

  return {
    text: fillDisplay(entry.text, narration, vars),
    spoken: spokenText(entry, narration, vars),
    voice: entry.voice ?? 'narrator',
    clips,
    problems,
  };
}

/**
 * Plans `sayPhrases(parts)` (07 §2, phrases mode): pre-rendered `ph.*` phrases and composed numbers,
 * spoken by Glim. Unknown phrase ids are dropped with a problem; an empty result has no clips.
 */
export function planPhrases(narration: NarrationJson, parts: readonly PhrasePart[]): LinePlan {
  const problems: string[] = [];
  const words: string[] = [];
  let clips: PlannedClip[] | null = [];
  const lastIndex = parts.length - 1;

  for (const [i, part] of parts.entries()) {
    if ('id' in part) {
      const entry = narration[part.id];
      if (!entry) {
        problems.push(`phrase ${part.id} is not in narration.json`);
        continue;
      }
      words.push(entry.say ?? entry.text);
      if (entry.clips.some(isSlotToken)) {
        problems.push(`phrase ${part.id} has slots, which phrase lines cannot fill`);
        clips = null;
        continue;
      }
      clips?.push(...entry.clips.map((c) => ({ candidates: [c], optional: false })));
      continue;
    }
    try {
      const keys = expandSlot({ name: 'n', type: 'num' }, { n: part.number });
      words.push(wordsFor(narration, keys, String(part.number)));
      // A number that ends the line takes the falling, sentence-final variant (03 §8.3).
      const planned = keysToClips(narration, keys, i === lastIndex, problems);
      if (planned === null) clips = null;
      else clips?.push(...planned);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
      clips = null;
    }
  }

  const spoken = tidy(words.join(' '));
  return { text: spoken, spoken, voice: 'glim', clips: clips?.length ? clips : null, problems };
}

function keysToClips(
  narration: NarrationJson,
  keys: readonly string[],
  sentenceFinal: boolean,
  problems: string[],
): PlannedClip[] | null {
  const out: PlannedClip[] = [];
  for (const [i, k] of keys.entries()) {
    const entry = narration[k];
    if (!entry || entry.clips.length === 0) {
      problems.push(`clip set ${k} is not in narration.json`);
      return null;
    }
    const isLast = i === keys.length - 1;
    const end = sentenceFinal && isLast ? endVariantKey(k) : null;
    entry.clips.forEach((clip, j) => {
      const finalClip = j === entry.clips.length - 1;
      // A02 renders the `.end` variant of `num.23` as the clip `num.23.end#0` (`<key>#<i>`, 03 §8.4).
      const candidates = end && finalClip ? [`${end}#0`, clip] : [clip];
      out.push({ candidates, optional: false });
    });
  }
  return out;
}

// ---------- spoken and display text ----------

type TextSegment = { kind: 'text'; text: string };
type Segment = TextSegment | { kind: 'slot'; raw: string };

/** Splits a narration line at `{slots}`; `{{` and `}}` are literal braces (03 §8.4). */
export function splitLine(line: string): Segment[] {
  const out: Segment[] = [];
  let text = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1];
    if ((ch === '{' && next === '{') || (ch === '}' && next === '}')) {
      text += ch;
      i += 2;
    } else if (ch === '{') {
      const end = line.indexOf('}', i + 1);
      if (end < 0) {
        text += line.slice(i);
        break;
      }
      if (text) out.push({ kind: 'text', text });
      text = '';
      out.push({ kind: 'slot', raw: line.slice(i + 1, end) });
      i = end + 1;
    } else {
      text += ch;
      i += 1;
    }
  }
  if (text) out.push({ kind: 'text', text });
  return out;
}

/**
 * True when a static segment has something to say: words, numbers, or a math symbol or blank
 * that 03 §8.4 reads aloud ("plus", "equals", "what number"). A `?` is a blank when it stands
 * alone: after a space, or with nothing spoken before it in the line (`followsContent` false). It
 * is punctuation when it directly ends a word or a slot ("{b}?").
 */
export function isSpoken(text: string, followsContent = true): boolean {
  if (/[\p{L}\p{N}+−×÷=<>_□]/u.test(text)) return true;
  if (/\s\?/.test(text) || /(^|\s)-(\s|$)/.test(text)) return true;
  return !followsContent && /^\s*\?/.test(text);
}

/** True when nothing but terminal punctuation (or nothing) follows the last slot. */
function trailingIsTerminal(segments: readonly Segment[]): boolean {
  const lastSlot = findLastIndex(segments, (s) => s.kind === 'slot');
  if (lastSlot < 0) return false;
  return segments.slice(lastSlot + 1).every((s) => s.kind === 'text' && !isSpoken(s.text));
}

/** The token written inside the braces → the same token as narration.json writes it. */
function tokenOf(raw: string): string {
  return `$${raw.trim()}`;
}

function slotWords(narration: NarrationJson, raw: string, vars: Vars | undefined): string {
  const token = parseSlotToken(tokenOf(raw));
  const name = raw.split('|')[0]?.trim() ?? raw;
  const value = vars?.[name];
  if (!token) return value === undefined ? '' : String(value);
  try {
    return wordsFor(narration, expandSlot(token, vars), value === undefined ? '' : String(value));
  } catch {
    return value === undefined ? '' : String(value);
  }
}

/** The words of clip-set keys (`num.23` → "twenty-three"), or `fallback` if any is unknown. */
function wordsFor(narration: NarrationJson, keys: readonly string[], fallback: string): string {
  const words: string[] = [];
  for (const k of keys) {
    const entry = narration[k];
    if (!entry) return fallback;
    words.push(entry.say ?? entry.text);
  }
  return words.join(' ');
}

/** The line as Web Speech should say it: `say` if authored, else `text` with spoken symbols. */
export function spokenText(
  entry: CompiledNarrationEntry,
  narration: NarrationJson,
  vars: Vars | undefined,
): string {
  const authoredSay = entry.say !== undefined;
  const parts = splitLine(entry.say ?? entry.text).map((s) =>
    s.kind === 'slot'
      ? ` ${slotWords(narration, s.raw, vars)} `
      : authoredSay
        ? s.text
        : speakSymbols(s.text),
  );
  return tidy(parts.join(''));
}

/** Display text (captions): numerals with a thousands comma from 1,000 (03 §8.4). */
function fillDisplay(text: string, narration: NarrationJson, vars: Vars | undefined): string {
  return splitLine(text)
    .map((s) => (s.kind === 'slot' ? displayValue(s.raw, narration, vars) : s.text))
    .join('');
}

function displayValue(raw: string, narration: NarrationJson, vars: Vars | undefined): string {
  const [name = '', typeAndSuffix] = raw.split('|').map((p) => p.trim());
  const value = vars?.[name];
  if (value === undefined) return `{${raw}}`;
  const [type, suffix] = (typeAndSuffix ?? '').split(':');
  const n = Number(value);
  switch (type) {
    case undefined:
    case '':
    case 'num':
      return Number.isSafeInteger(n) ? n.toLocaleString('en-US') : String(value);
    case 'cents':
      return `${value}¢`;
    case 'dollars':
      return Number.isFinite(n) ? `$${(n / 100).toFixed(2)}` : String(value);
    case 'dec':
      return Number.isFinite(n) ? (n / 100).toFixed(suffix === '1' ? 1 : 2) : String(value);
    case 'noun':
    case 'unit':
    case 'shape':
    case 'name':
    case 'word': {
      // Show the clip's own words ("planks", "Shelly") rather than the raw id.
      const t = parseSlotToken(tokenOf(raw));
      if (!t) return String(value);
      try {
        return wordsFor(narration, expandSlot(t, vars), String(value));
      } catch {
        return String(value);
      }
    }
    default:
      return String(value);
  }
}

const SYMBOLS: [RegExp, string][] = [
  [/\s*\+\s*/g, ' plus '],
  [/\s+[−-]\s+/g, ' minus '],
  [/\s*×\s*/g, ' times '],
  [/\s*÷\s*/g, ' divided by '],
  [/\s*=\s*/g, ' equals '],
  [/\s*<\s*/g, ' is less than '],
  [/\s*>\s*/g, ' is greater than '],
  [/(^|\s)(?:\?|_{1,}|□)(?=\s|$|[.,!])/g, '$1what number'],
];

/** 03 §8.4 spoken symbols, for lines without an authored `say`. */
export function speakSymbols(text: string): string {
  return SYMBOLS.reduce((t, [re, word]) => t.replace(re, word), text);
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function findLastIndex<T>(list: readonly T[], pred: (item: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (item !== undefined && pred(item)) return i;
  }
  return -1;
}
