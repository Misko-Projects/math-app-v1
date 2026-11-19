// 03 §5.5 compare. Two sides (any `StimulusSpec`) and one question about them. The child picks a
// side (`left` | `right`) or `same` for more / fewer / longer / heavier; `same` | `not-same` for
// same-or-not; places `<` | `=` | `>` between the sides for symbol; and answers `true` | `false`
// for true-false. With `allowMatchLines` (concrete tier, objects on both sides) the child may first
// pair objects across the sides; matches are help, never the answer (they only reach the trace).

import {
  type AnswerSpec,
  type CompareConfig,
  compareConfigSchema,
  type ExpressionToken,
  type StimulusSpec,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  argNumber,
  argString,
  digitCount,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'compare'>;
type Ask = CompareConfig['ask'];
export type CompareSide = 'left' | 'right';
export type CompareSymbol = '<' | '=' | '>';

export interface CompareState extends FormatState<'compare'> {
  /** Object pairs drawn so far, `[left index, right index]`; each object is in at most one pair. */
  matches: [number, number][];
  highlighted: CompareSide | null;
  /** The symbol placed between the sides (symbol asks). */
  symbol: CompareSymbol | null;
  /** The chosen answer id, or null. */
  selected: string | null;
}

/** The answer ids each ask accepts, in the order the widget shows them. */
export function compareChoiceIds(ask: Ask): readonly string[] {
  switch (ask) {
    case 'symbol':
      return ['<', '=', '>'];
    case 'true-false':
      return ['true', 'false'];
    case 'same-or-not':
      return ['same', 'not-same'];
    default:
      return ['left', 'right', 'same'];
  }
}

const SYMBOLS: readonly CompareSymbol[] = ['<', '=', '>'];
const COIN_CENTS = { penny: 1, nickel: 5, dime: 10, quarter: 25 } as const;

/** Evaluates `num op num …` (no parentheses, blanks or relations) with × ÷ before + −. */
function evaluateTokens(tokens: readonly ExpressionToken[]): number | null {
  if (tokens.length === 0 || tokens.length % 2 === 0) return null;
  const nums: number[] = [];
  const ops: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as ExpressionToken;
    if (i % 2 === 0) {
      if (tok.t === 'num') nums.push(tok.v);
      else if (tok.t === 'money' && tokens.length === 1) nums.push(tok.cents);
      else return null;
    } else if (tok.t === 'op') ops.push(tok.v);
    else return null;
  }
  // Multiplication and division first, then addition and subtraction, left to right.
  const terms: number[] = [nums[0] as number];
  const signs: string[] = [];
  ops.forEach((op, i) => {
    const n = nums[i + 1] as number;
    if (op === '×') terms[terms.length - 1] = (terms[terms.length - 1] as number) * n;
    else if (op === '÷') terms[terms.length - 1] = (terms[terms.length - 1] as number) / n;
    else {
      signs.push(op);
      terms.push(n);
    }
  });
  let v = terms[0] as number;
  signs.forEach((op, i) => {
    v = op === '+' ? v + (terms[i + 1] as number) : v - (terms[i + 1] as number);
  });
  return Number.isFinite(v) ? v : null;
}

/**
 * The number a side shows, where it can be read off the stimulus: counts for objects, dots,
 * ten-frames, rekenreks, groups and arrays; the value of base-ten blocks and coins; a number line's
 * single mark; the value of a plain expression. Otherwise null (fractions, shapes, gauges…).
 */
export function compareSideValue(s: StimulusSpec): number | null {
  switch (s.kind) {
    case 'objects':
      return s.set.count;
    case 'dots':
      return s.groups.reduce((a, b) => a + b, 0);
    case 'ten-frame':
      return s.filled.reduce((a, b) => a + b, 0);
    case 'rekenrek':
      return s.rows[0] + s.rows[1];
    case 'groups':
      return s.groups * s.perGroup;
    case 'array':
      return s.rows * s.cols;
    case 'base-ten':
      if (s.wholeIs !== undefined && s.wholeIs !== 'unit') return null;
      return (s.thousands ?? 0) * 1000 + s.hundreds * 100 + s.tens * 10 + s.ones;
    case 'coins':
      return (
        s.coins.reduce((a, c) => a + COIN_CENTS[c], 0) +
        (s.bills ?? []).reduce((a, b) => a + b * 100, 0)
      );
    case 'number-line':
      return s.marks?.length === 1 ? (s.marks[0]?.at ?? null) : null;
    case 'expression':
      return evaluateTokens(s.expr.tokens);
    default:
      return null;
  }
}

/** The `rel` or `blank` tokens of an expression side (a symbol ask places its own relation). */
const hasRelationOrBlank = (s: StimulusSpec) =>
  s.kind === 'expression' && s.expr.tokens.some((t) => t.t === 'rel' || t.t === 'blank');

const configSchema = compareConfigSchema.superRefine((c, ctx) => {
  if (c.left.kind === 'none') {
    ctx.addIssue({ code: 'custom', path: ['left'], message: 'compare needs a left side' });
  }
  // A true-false statement may sit entirely on the left (e.g. 3 + 4 = 7); every other ask
  // compares two sides.
  if (c.right.kind === 'none' && c.ask !== 'true-false') {
    ctx.addIssue({ code: 'custom', path: ['right'], message: 'compare needs a right side' });
  }
  if (c.allowMatchLines && (c.left.kind !== 'objects' || c.right.kind !== 'objects')) {
    ctx.addIssue({
      code: 'custom',
      path: ['allowMatchLines'],
      message: 'match lines pair objects: both sides must be objects stimuli',
    });
  }
  if (c.ask === 'symbol') {
    for (const side of ['left', 'right'] as const) {
      if (hasRelationOrBlank(c[side])) {
        ctx.addIssue({
          code: 'custom',
          path: [side],
          message: 'a symbol ask places the relation itself: no rel or blank tokens',
        });
      }
    }
  }
});

function objectCount(s: StimulusSpec): number {
  return s.kind === 'objects' ? Math.max(0, Math.floor(s.set.count)) : 0;
}

export const compare: FormatModel<'compare', CompareState> = {
  format: 'compare',
  configSchema,
  features: {
    closeness: { weight: 1.0, doc: 'min ÷ max of the two values (0–1)' },
    conflict: {
      weight: 0.8,
      doc: 'the perceptual cue contradicts the number (reported by the generator)',
    },
    'ask.fewer': { weight: 0.3, doc: 'asks which has fewer' },
    'ask.symbol': { weight: 0.4, doc: 'place <, = or >' },
    equal: { weight: 0.4, doc: 'the two sides are equal' },
    magnitude: { weight: 0.3, doc: 'digits of the larger value − 1' },
  },
  featureValues(c: Config, answer: AnswerSpec) {
    const a = compareSideValue(c.left);
    const b = compareSideValue(c.right);
    const both = a !== null && b !== null;
    const hi = both ? Math.max(Math.abs(a), Math.abs(b)) : 0;
    const lo = both ? Math.min(Math.abs(a), Math.abs(b)) : 0;
    const answerId = answer.kind === 'choice' ? answer.id : null;
    // A known answer decides `equal` (the sides may picture different things that read as the
    // same count: one feather against one pumpkin answers "right", never "same"); a true-false
    // answer says nothing about the sides being equal; otherwise the read-off values do.
    const answered =
      answerId !== null && c.ask !== 'true-false' && compareChoiceIds(c.ask).includes(answerId);
    const equalByAnswer = answerId === 'same' || answerId === '=';
    return {
      // 0 when either value cannot be read off the stimulus.
      closeness: both && hi > 0 ? lo / hi : 0,
      // Spread-out versus bunched sets (CMP.05) need the layout; the generator reports it.
      conflict: 0,
      'ask.fewer': c.ask === 'fewer' ? 1 : 0,
      'ask.symbol': c.ask === 'symbol' ? 1 : 0,
      equal: answered
        ? equalByAnswer
          ? 1
          : 0
        : c.ask !== 'true-false' && both && a === b
          ? 1
          : 0,
      magnitude: both ? Math.max(0, digitCount(hi) - 1) : 0,
    };
  },
  initialState: (config) => ({
    config,
    matches: [],
    highlighted: null,
    symbol: null,
    selected: null,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'match': {
        if (!s.config.allowMatchLines) return s;
        const l = argNumber(a, 'left');
        const r = argNumber(a, 'right');
        const inRange = (v: number | undefined, n: number): v is number =>
          v !== undefined && Number.isInteger(v) && v >= 0 && v < n;
        if (!inRange(l, objectCount(s.config.left)) || !inRange(r, objectCount(s.config.right))) {
          return s;
        }
        // A new pair replaces any pair either object was already in.
        const matches = s.matches.filter(([x, y]) => x !== l && y !== r);
        return { ...s, matches: [...matches, [l, r]] };
      }
      case 'highlight': {
        const side = argString(a, 'side');
        return side === 'left' || side === 'right' ? { ...s, highlighted: side } : s;
      }
      case 'place-symbol': {
        const symbol = argString(a, 'symbol');
        if (s.config.ask !== 'symbol' || !SYMBOLS.includes(symbol as CompareSymbol)) return s;
        return { ...s, symbol: symbol as CompareSymbol, selected: symbol as CompareSymbol };
      }
      case 'answer': {
        const id = argString(a, 'id');
        if (id === undefined || !compareChoiceIds(s.config.ask).includes(id)) return s;
        const symbol = s.config.ask === 'symbol' ? (id as CompareSymbol) : s.symbol;
        return { ...s, selected: id, symbol };
      }
      default:
        throw new UnsupportedOpError('compare', a.op);
    }
  },
  toResponse: (s) => (s.selected === null ? null : { kind: 'choice', id: s.selected }),
};
