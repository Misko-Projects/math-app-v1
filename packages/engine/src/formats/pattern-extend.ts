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
// - `rule`: answers the typed step (`answer {value}`, a number).
// - `table`: an input–output table; `place-token {index, token: {n}}` fills the missing output in
//   row `index`, or `answer {values}` fills every missing output in order; answers `numbers`
//   (ordered).
// `highlight {index}` marks a position (visual).

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
export const PATTERN_COLORS = ['red', 'blue', 'yellow', 'green', 'orange'] as const;

/** The largest tile stack a growing pattern draws. */
export const MAX_TILES = 30;

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

const configSchema = patternExtendConfigSchema.superRefine((c, ctx) => {
  const add = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const shown = c.sequence.filter((t): t is PatternToken => t !== null);
  const blanks = blankIndexes(c);
  if (c.sequence.length < 2) add(['sequence'], 'a pattern has at least two places');
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
    });
  };
  tokenRules([...c.sequence, ...c.palette], 'sequence');
  c.palette.forEach((t, i) => {
    if (c.palette.findIndex((u) => sameToken(u, t)) !== i)
      add(['palette', i], 'the palette repeats a unit');
  });
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
  if (c.mode === 'rule' && !(family === 'n' || family === 'tiles'))
    add(['kind'], 'rule asks a number pattern');
  if (c.mode === 'table') {
    if (!c.table) add(['table'], 'table needs the table');
    else {
      if (c.table.inputs.length !== c.table.outputs.length || c.table.inputs.length < 2) {
        add(['table'], 'one output per input, two rows or more');
      }
      if (tableBlanks(c).length === 0) add(['table', 'outputs'], 'no missing output');
      if (c.table.outputs.every((o) => o === null)) add(['table', 'outputs'], 'no output is shown');
    }
  }
  if (c.mode === 'translate') {
    const to = c.translateTo ?? [];
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
          : { kind: 'state', value: { values: [...s.selected] } };
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
