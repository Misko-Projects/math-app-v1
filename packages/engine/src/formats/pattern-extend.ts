// 03 §5.5 pattern-extend (U05 #14). A pattern (`sequence`, `null` = a blank) of tokens: island
// objects `{ sprite }`, coloured shapes `{ sprite: <shape kind>, color }`, numbers `{ n }` or
// growing tile stacks `{ tiles }`. `palette` holds the units the child places (empty for number
// patterns, which are typed).
// - `extend`, `fill`: `place-token {index, token}` puts a unit in the blank at `index` (no token
//   clears it); answers state `{ tokens }`, the tokens in the blanks in reading order
//   (pattern.tokens). Number patterns may also answer `answer {values}` (one per blank).
// - `core`: `bracket-core {from, to}` marks positions from … to (inclusive) as the part that
//   repeats; answers state `{ values }`, the marked indices (select.exactSet). `answer {values}`
//   marks those indices.
// - `translate`: the child rebuilds the whole pattern below it with the `translateTo` units
//   (`place-token {index, token}`, index into the new row); answers state `{ tokens }`, the new row
//   (pattern.isomorphic `{ source, units }`).
// - `rule`: answers the typed step (`answer {value}`, a number; `answer {}` erases it).
// - `table`: an input–output table; `place-token {index, token: {n}}` fills the missing output in
//   row `index`, or `answer {values}` fills every missing output in order; answers `numbers`
//   (ordered).
// `highlight {index}` marks a position (visual).
//
// Supported domain (the same in every widget area and age mode; the widget's stress stories show
// each bound in the smallest area, 906 × 373, at kindergarten sizes):
// - a pattern has 2 to PATTERN_LENGTH_MAX places (translate: PATTERN_TRANSLATE_LENGTH_MAX, both
//   rows on one line each), at most PATTERN_BLANKS_MAX blanks and PATTERN_UNITS_MAX different
//   units (shown, in the palette, in `translateTo`);
// - numbers are whole, 0 to PATTERN_NUMBER_MAX (what the three-digit pad types); a number pattern
//   has no palette; a tile stack has 1 to MAX_TILES tiles;
// - `rule` shows numbers that grow by one whole step of 1 or more (the pad has no minus sign);
// - a pattern of numbers or tile stacks has at most PATTERN_TYPED_LENGTH_MAX places (one line of
//   three-digit cells above the pad);
// - `table` (ALG.09, K02 slice 4c-2): kind `function`, no sequence or palette, 2 to
//   PATTERN_TABLE_ROWS_MAX rows of distinct inputs, at least one output shown and one missing; the
//   widget lays it out as an In / Out table with the pad beside it (or under it where narrow);
// - `translate` rebuilds a picture pattern (island objects or coloured shapes) with picture units.
// `patternAnswerIssues` ties the item's answer to the config: what Check can send is what the
// checker is asked for.

import {
  type AnswerSpec,
  type PatternToken,
  patternExtendConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { sameToken } from '../check/state/pattern.tokens';
import {
  argNumber,
  argNumbers,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'pattern-extend'>;

/** Shape kinds a pattern token may draw as (a coloured shape: `{ sprite: <kind>, color }`). */
export const PATTERN_SHAPES = [
  'circle',
  'triangle',
  'square',
  'rectangle',
  'rhombus',
  'trapezoid',
  'pentagon',
  'hexagon',
  'octagon',
  'oval',
  'kite',
] as const;

/** Colour names a pattern token may carry; the widget paints each with a palette token. */
export const PATTERN_COLORS = ['red', 'blue', 'yellow'] as const;

/** The largest tile stack a growing pattern draws (and the one-more counter builds). */
export const MAX_TILES = 20;
/** Places in a pattern: 2 to 12 (two rows of six at kindergarten sizes in the smallest area). */
export const PATTERN_LENGTH_MAX = 12;
/** Places in a `translate` pattern: at most 6, so the pattern and the new row take one line each. */
export const PATTERN_TRANSLATE_LENGTH_MAX = 6;
/** Blanks in an `extend` or `fill` pattern: at most 4. */
export const PATTERN_BLANKS_MAX = 4;
/** Different units (shown, in the palette, or in `translateTo`): at most 4. */
export const PATTERN_UNITS_MAX = 4;
/** Numbers in a pattern or a table: whole, 0 to 999 (the pad types three digits). */
export const PATTERN_NUMBER_MAX = 999;
/** Places in a pattern of numbers or tile stacks: at most 6 (one line above the pad). */
export const PATTERN_TYPED_LENGTH_MAX = 6;
/** Rows of an input–output table: 2 to 4. */
export const PATTERN_TABLE_ROWS_MAX = 4;

const isPatternNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= PATTERN_NUMBER_MAX;

export interface PatternExtendState extends FormatState<'pattern-extend'> {
  /**
   * Placed tokens. extend / fill / translate: one per `sequence` position (only blanks are
   * filled in extend and fill; every position of the new row in translate). table: one per row.
   */
  placed: (PatternToken | null)[];
  /** core: the marked positions, ascending. */
  selected: number[];
  highlighted: number | null;
  /** rule: the typed step. */
  value: number | null;
}

type Family = 'sprite' | 'n' | 'tiles';

export const tokenFamily = (t: PatternToken): Family =>
  'sprite' in t ? 'sprite' : 'n' in t ? 'n' : 'tiles';

/** A well-formed token from op args (only its own fields), or null. */
export function readToken(v: unknown): PatternToken | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.sprite === 'string') {
    return typeof o.color === 'string'
      ? { sprite: o.sprite, color: o.color }
      : { sprite: o.sprite };
  }
  if (typeof o.n === 'number' && Number.isFinite(o.n)) return { n: o.n };
  if (typeof o.tiles === 'number' && Number.isInteger(o.tiles) && o.tiles >= 0) {
    return { tiles: o.tiles };
  }
  return null;
}

/** The value a number or tile token stands for (null for picture units). */
export const tokenNumber = (t: PatternToken | null): number | null =>
  t === null ? null : 'n' in t ? t.n : 'tiles' in t ? t.tiles : null;

/** The positions of the blanks, in reading order. */
export const blankIndexes = (c: Config): number[] =>
  c.sequence.flatMap((t, i) => (t === null ? [i] : []));

/** The rows of a table whose output is missing, in order. */
export const tableBlanks = (c: Config): number[] =>
  (c.table?.outputs ?? []).flatMap((o, i) => (o === null ? [i] : []));

/**
 * The shortest core a repeating pattern can have: the smallest p with every shown token equal to
 * the shown token p places later (blanks match anything).
 */
export function smallestPeriod(seq: readonly (PatternToken | null)[]): number {
  for (let p = 1; p < seq.length; p += 1) {
    let ok = true;
    for (let i = 0; i + p < seq.length && ok; i += 1) {
      const a = seq[i];
      const b = seq[i + p];
      if (a && b && !sameToken(a, b)) ok = false;
    }
    if (ok) return p;
  }
  return seq.length;
}

/** The step between the first two consecutive shown numbers (null if there are none). */
export function firstStep(seq: readonly (PatternToken | null)[]): number | null {
  for (let i = 0; i + 1 < seq.length; i += 1) {
    const a = tokenNumber(seq[i] ?? null);
    const b = tokenNumber(seq[i + 1] ?? null);
    if (a !== null && b !== null) return b - a;
  }
  return null;
}

/** Whether a table's known rows follow out = in + c (an adding rule) rather than a multiplying one. */
export function additiveTable(table: NonNullable<Config['table']>): boolean {
  const diffs = table.inputs.flatMap((x, i) => {
    const y = table.outputs[i];
    return y === null || y === undefined ? [] : [y - x];
  });
  return diffs.every((d) => d === diffs[0]);
}

/**
 * The places a `core` answer stands for. Every whole repeat is the core (the second AB of
 * AB AB AB as much as the first), so a marked run that is exactly one repeat answers as the first
 * one, which is the set the item's answer names (`patternAnswerIssues`). Any other marking is sent
 * as marked.
 */
export function coreValues(c: Config, selected: readonly number[]): number[] {
  const p = smallestPeriod(c.sequence);
  const first = selected[0];
  const run = selected.every((v, k) => v === (first as number) + k);
  if (first !== undefined && run && selected.length === p && first % p === 0) {
    return Array.from({ length: p }, (_, k) => k);
  }
  return [...selected];
}

/**
 * Why an item's answer is not the one its config asks for (empty: it is). Check sends what the
 * widget holds, so each mode's answer must be something the widget can hold: units from the
 * palette, numbers the pad types, the first repeat as the core, the step the pattern shows.
 */
export function patternAnswerIssues(c: Config, answer: AnswerSpec): string[] {
  const out: string[] = [];
  const shown = c.sequence.find((t): t is PatternToken => t !== null);
  const family: Family = shown ? tokenFamily(shown) : 'n';
  const state = (checker: string): Record<string, unknown> | null => {
    if (answer.kind !== 'state' || answer.checker !== checker) {
      out.push(`${c.mode} answers state ${checker}`);
      return null;
    }
    return answer.target;
  };
  switch (c.mode) {
    case 'extend':
    case 'fill': {
      const target = state('pattern.tokens');
      if (!target) break;
      const expected = Array.isArray(target.expected) ? target.expected : null;
      const blanks = blankIndexes(c).length;
      if (!expected || expected.length !== blanks) {
        out.push(`expected holds one token per blank (${blanks})`);
        break;
      }
      expected.forEach((raw, i) => {
        const t = readToken(raw);
        if (!t || tokenFamily(t) !== family) out.push(`expected[${i}] is not a ${family} token`);
        else if ('n' in t) {
          if (!isPatternNumber(t.n)) out.push(`expected[${i}] cannot be typed on the pad`);
        } else if (c.palette.length > 0) {
          if (!c.palette.some((u) => sameToken(u, t))) {
            out.push(`expected[${i}] is not a unit of the palette`);
          }
        } else if ('tiles' in t && !(t.tiles >= 1 && t.tiles <= MAX_TILES)) {
          out.push(`expected[${i}] is not a stack of 1–${MAX_TILES} tiles`);
        }
      });
      break;
    }
    case 'core': {
      const target = state('select.exactSet');
      if (!target) break;
      const p = smallestPeriod(c.sequence);
      const values = Array.isArray(target.values) ? target.values : [];
      if (values.length !== p || values.some((v, k) => v !== k)) {
        out.push(`the core is the first repeat, places 0 to ${p - 1}`);
      }
      break;
    }
    case 'translate': {
      const target = state('pattern.isomorphic');
      if (!target) break;
      const same = (a: unknown, b: readonly (PatternToken | null)[]) =>
        Array.isArray(a) &&
        a.length === b.length &&
        a.every((raw, i) => {
          const t = readToken(raw);
          const u = b[i];
          return t !== null && u !== null && u !== undefined && sameToken(t, u);
        });
      if (!same(target.source, c.sequence)) out.push('source is the pattern shown');
      if (!same(target.units, c.translateTo ?? [])) out.push('units are the translateTo units');
      break;
    }
    case 'rule': {
      const step = firstStep(c.sequence);
      if (answer.kind !== 'number' || answer.value !== step) {
        out.push(`rule answers the step the pattern shows (${step})`);
      }
      break;
    }
    case 'table': {
      const blanks = tableBlanks(c).length;
      if (answer.kind !== 'numbers' || !answer.ordered || answer.values.length !== blanks) {
        out.push(`table answers the ${blanks} missing outputs in order`);
      } else if (!answer.values.every(isPatternNumber)) {
        out.push('a missing output cannot be typed on the pad');
      }
      break;
    }
  }
  return out;
}

/** A table's rows: 2 to PATTERN_TABLE_ROWS_MAX, distinct whole inputs, a blank and a shown output. */
function tableIssues(c: Config, add: (path: (string | number)[], message: string) => void) {
  if (!c.table) {
    add(['table'], 'table needs the table');
    return;
  }
  const { inputs, outputs } = c.table;
  if (inputs.length !== outputs.length || inputs.length < 2) {
    add(['table'], 'one output per input, two rows or more');
  }
  if (tableBlanks(c).length === 0) add(['table', 'outputs'], 'no missing output');
  if (outputs.every((o) => o === null)) add(['table', 'outputs'], 'no output is shown');
  if (inputs.length > PATTERN_TABLE_ROWS_MAX) {
    add(['table'], `a table has at most ${PATTERN_TABLE_ROWS_MAX} rows`);
  }
  if (new Set(inputs).size !== inputs.length) add(['table', 'inputs'], 'inputs are distinct');
  inputs.forEach((x, i) => {
    if (!isPatternNumber(x)) {
      add(['table', 'inputs', i], `a number is whole, 0–${PATTERN_NUMBER_MAX}`);
    }
  });
  outputs.forEach((x, i) => {
    if (x !== null && !isPatternNumber(x)) {
      add(['table', 'outputs', i], `a number is whole, 0–${PATTERN_NUMBER_MAX}`);
    }
  });
}

const configSchema = patternExtendConfigSchema.superRefine((c, ctx) => {
  const add = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  // A table (an input–output machine, ALG.09) has no pattern: only its rows are checked.
  if (c.mode === 'table') {
    if (c.kind !== 'function') add(['kind'], 'a table is a function machine (kind function)');
    if (c.sequence.length > 0 || c.palette.length > 0) {
      add(['sequence'], 'a table shows no pattern and has no palette');
    }
    tableIssues(c, add);
    return;
  }
  const shown = c.sequence.filter((t): t is PatternToken => t !== null);
  const blanks = blankIndexes(c);
  if (c.sequence.length < 2) add(['sequence'], 'a pattern has at least two places');
  const typedFamily = shown.some((t) => !('sprite' in t));
  const lengthMax =
    c.mode === 'translate'
      ? PATTERN_TRANSLATE_LENGTH_MAX
      : typedFamily
        ? PATTERN_TYPED_LENGTH_MAX
        : PATTERN_LENGTH_MAX;
  if (c.sequence.length > lengthMax) {
    add(['sequence'], `a ${c.mode} pattern has at most ${lengthMax} places`);
  }
  if (blanks.length > PATTERN_BLANKS_MAX) {
    add(['sequence'], `a pattern has at most ${PATTERN_BLANKS_MAX} blanks`);
  }
  if (c.palette.length > PATTERN_UNITS_MAX) {
    add(['palette'], `the palette has at most ${PATTERN_UNITS_MAX} units`);
  }
  const distinct = shown.filter((t, i) => shown.findIndex((u) => sameToken(u, t)) === i);
  if (shown.some((t) => !('n' in t)) && distinct.length > PATTERN_UNITS_MAX) {
    add(['sequence'], `a pattern shows at most ${PATTERN_UNITS_MAX} different units`);
  }
  if (shown.length === 0) add(['sequence'], 'nothing is shown');
  const families = new Set([...shown, ...c.palette].map(tokenFamily));
  if (families.size > 1) add(['sequence'], 'the pattern mixes pictures, numbers and tiles');
  const family = [...families][0];
  const allowed: Record<Config['kind'], Family[]> = {
    repeat: ['sprite', 'n'],
    grow: ['tiles', 'n'],
    number: ['n'],
    function: ['n'],
  };
  if (family && !allowed[c.kind].includes(family))
    add(['kind'], `${c.kind} patterns are not ${family} tokens`);
  // Every token is drawable, and units differ by shape as well as colour (06 §7: never colour alone).
  const tokenRules = (list: readonly (PatternToken | null)[], path: string) => {
    const bySprite = new Map<string, PatternToken>();
    list.forEach((t, i) => {
      if (!t) return;
      if ('sprite' in t && t.color !== undefined) {
        if (!(PATTERN_COLORS as readonly string[]).includes(t.color)) {
          add([path, i, 'color'], `colour ${t.color} is not one the widget paints`);
        }
        if (!(PATTERN_SHAPES as readonly string[]).includes(t.sprite)) {
          add([path, i, 'sprite'], 'only a shape takes a colour');
        }
      }
      if ('sprite' in t) {
        const seen = bySprite.get(t.sprite);
        if (seen && !sameToken(seen, t)) add([path, i], 'two units differ by colour alone');
        bySprite.set(t.sprite, t);
      }
      if ('tiles' in t && !(t.tiles >= 1 && t.tiles <= MAX_TILES)) {
        add([path, i, 'tiles'], `a tile stack has 1–${MAX_TILES} tiles`);
      }
      if ('n' in t && !isPatternNumber(t.n)) {
        add([path, i, 'n'], `a number is whole, 0–${PATTERN_NUMBER_MAX}`);
      }
    });
  };
  tokenRules([...c.sequence, ...c.palette], 'sequence');
  c.palette.forEach((t, i) => {
    if (c.palette.findIndex((u) => sameToken(u, t)) !== i)
      add(['palette', i], 'the palette repeats a unit');
  });
  if (family === 'n' && c.palette.length > 0) {
    add(['palette'], 'a number pattern is typed: it has no palette');
  }
  const usesPalette = family === 'sprite';
  if (c.mode === 'extend' || c.mode === 'fill') {
    if (blanks.length === 0) add(['sequence'], `${c.mode} needs a blank`);
    if (usesPalette) {
      if (c.palette.length < 2)
        add(['palette'], 'a picture pattern needs two units to choose from');
      shown.forEach((t) => {
        if (!c.palette.some((u) => sameToken(u, t)))
          add(['palette'], 'a shown unit is not in the palette');
      });
    }
  } else if (blanks.length > 0) {
    add(['sequence'], `${c.mode} shows the whole pattern`);
  }
  if (c.mode === 'core' && smallestPeriod(c.sequence) * 2 > c.sequence.length) {
    add(['sequence'], 'core needs the part that repeats shown at least twice');
  }
  if (c.mode === 'rule') {
    if (!(family === 'n' || family === 'tiles')) add(['kind'], 'rule asks a number pattern');
    else {
      const values = shown.map(tokenNumber);
      const step = firstStep(c.sequence);
      const steady = values.every(
        (v, i) => i === 0 || (v as number) - (values[i - 1] as number) === step,
      );
      if (step === null || !steady || !Number.isInteger(step) || step < 1) {
        add(['sequence'], 'rule shows numbers that grow by one whole step of 1 or more');
      }
    }
  }
  if (c.mode === 'translate') {
    const to = c.translateTo ?? [];
    if (family !== 'sprite' || to.some((t) => tokenFamily(t) !== 'sprite')) {
      add(['translateTo'], 'translate rebuilds a picture pattern with picture units');
    }
    if (to.length > PATTERN_UNITS_MAX) {
      add(['translateTo'], `at most ${PATTERN_UNITS_MAX} new units`);
    }
    const units = shown.filter((t, i) => shown.findIndex((u) => sameToken(u, t)) === i).length;
    if (to.length < Math.max(2, units))
      add(['translateTo'], 'too few new units to rebuild the pattern');
    to.forEach((t, i) => {
      if (to.findIndex((u) => sameToken(u, t)) !== i) add(['translateTo', i], 'a new unit repeats');
    });
    tokenRules(to, 'translateTo');
  }
});

export const patternExtend: FormatModel<'pattern-extend', PatternExtendState> = {
  format: 'pattern-extend',
  configSchema,
  answerIssues: patternAnswerIssues,
  features: {
    'core.len': { weight: 0.4, doc: 'core length − 2 (repeating patterns)' },
    'hidden.middle': { weight: 0.4, doc: 'a blank sits inside the pattern, before a shown token' },
    translate: { weight: 0.6, doc: 'rebuild the pattern with new units' },
    grow: { weight: 0.4, doc: 'a growing shape pattern' },
    'step.notOne': { weight: 0.3, doc: 'a number pattern whose step is not 1 (or −1)' },
    minus: { weight: 0.4, doc: 'the numbers go down' },
    'rule.multiply': {
      weight: 0.6,
      doc: 'an input–output rule that multiplies (not out = in + c)',
    },
    inverse: {
      weight: 0.7,
      doc: 'the table asks for inputs (the config shows every input, so 0 here)',
    },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    const step = c.kind === 'repeat' ? null : firstStep(c.sequence);
    const lastShown = c.sequence.reduce((at, t, i) => (t === null ? at : i), -1);
    return {
      'core.len': c.kind === 'repeat' ? Math.max(0, smallestPeriod(c.sequence) - 2) : 0,
      'hidden.middle': blankIndexes(c).some((i) => i < lastShown) ? 1 : 0,
      translate: c.mode === 'translate' ? 1 : 0,
      grow: c.kind === 'grow' ? 1 : 0,
      'step.notOne': step !== null && Math.abs(step) !== 1 ? 1 : 0,
      minus: step !== null && step < 0 ? 1 : 0,
      'rule.multiply': c.mode === 'table' && c.table && !additiveTable(c.table) ? 1 : 0,
      inverse: 0,
    };
  },
  initialState: (config) => ({
    config,
    placed:
      config.mode === 'table'
        ? (config.table?.outputs ?? []).map(() => null)
        : config.sequence.map(() => null),
    selected: [],
    highlighted: null,
    value: null,
  }),
  apply(s, a) {
    const c = s.config;
    const index = argNumber(a, 'index');
    switch (a.op) {
      case 'place-token': {
        if (index === undefined || !Number.isInteger(index)) return s;
        const open =
          c.mode === 'extend' || c.mode === 'fill'
            ? c.sequence[index] === null
            : c.mode === 'translate'
              ? index >= 0 && index < c.sequence.length
              : c.mode === 'table'
                ? c.table?.outputs[index] === null
                : false;
        if (!open) return s;
        const placed = [...s.placed];
        if (a.args?.token === undefined || a.args.token === null) {
          placed[index] = null;
          return { ...s, placed };
        }
        const token = readToken(a.args.token);
        if (!token) return s;
        const units =
          c.mode === 'translate' ? (c.translateTo ?? []) : c.mode === 'table' ? [] : c.palette;
        let use: PatternToken = token;
        if (units.length > 0) {
          const unit = units.find((u) => sameToken(u, token));
          if (!unit) return s;
          use = unit;
        } else {
          const shown = c.sequence.find((t): t is PatternToken => t !== null);
          const want: Family = c.mode === 'table' ? 'n' : shown ? tokenFamily(shown) : 'n';
          if (tokenFamily(token) !== want) return s;
        }
        placed[index] = use;
        return { ...s, placed };
      }
      case 'bracket-core': {
        if (c.mode !== 'core') return s;
        const from = argNumber(a, 'from');
        const to = argNumber(a, 'to');
        if (from === undefined || to === undefined) return s;
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi >= c.sequence.length) {
          return s;
        }
        return { ...s, selected: Array.from({ length: hi - lo + 1 }, (_, k) => lo + k) };
      }
      case 'highlight': {
        const rows = c.mode === 'table' ? (c.table?.inputs.length ?? 0) : c.sequence.length;
        if (index === undefined) return { ...s, highlighted: null };
        return Number.isInteger(index) && index >= 0 && index < rows
          ? { ...s, highlighted: index }
          : s;
      }
      case 'answer': {
        if (c.mode === 'rule') {
          // No value: the typed step is erased (the pad's display is empty again).
          if (a.args?.value === undefined) return s.value === null ? s : { ...s, value: null };
          const v = argNumber(a, 'value');
          return v === undefined ? s : { ...s, value: v };
        }
        const vs = argNumbers(a, 'values');
        if (!vs) return s;
        if (c.mode === 'core') {
          const ok = vs.every((i) => Number.isInteger(i) && i >= 0 && i < c.sequence.length);
          return ok ? { ...s, selected: [...new Set(vs)].sort((x, y) => x - y) } : s;
        }
        const slots =
          c.mode === 'table'
            ? tableBlanks(c)
            : c.mode === 'extend' || c.mode === 'fill'
              ? blankIndexes(c)
              : [];
        const shown = c.sequence.find((t): t is PatternToken => t !== null);
        const numbers = c.mode === 'table' || (shown !== undefined && tokenFamily(shown) === 'n');
        if (!numbers || vs.length !== slots.length) return s;
        const placed = [...s.placed];
        slots.forEach((i, k) => {
          placed[i] = { n: vs[k] as number };
        });
        return { ...s, placed };
      }
      default:
        throw new UnsupportedOpError('pattern-extend', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    switch (c.mode) {
      case 'extend':
      case 'fill': {
        const tokens = blankIndexes(c).map((i) => s.placed[i] ?? null);
        if (tokens.length === 0 || tokens.some((t) => t === null)) return null;
        return { kind: 'state', value: { tokens: tokens.map((t) => ({ ...t })) } };
      }
      case 'translate':
        if (s.placed.some((t) => t === null)) return null;
        return { kind: 'state', value: { tokens: s.placed.map((t) => ({ ...t })) } };
      case 'core':
        return s.selected.length === 0
          ? null
          : { kind: 'state', value: { values: coreValues(c, s.selected) } };
      case 'rule':
        return s.value === null ? null : { kind: 'number', value: s.value };
      case 'table': {
        const values = tableBlanks(c).map((i) => tokenNumber(s.placed[i] ?? null));
        if (values.length === 0 || values.some((v) => v === null)) return null;
        return { kind: 'numbers', values: values as number[] };
      }
    }
  },
};
