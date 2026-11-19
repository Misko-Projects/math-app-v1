// 03 §5.5 base-ten-trade. A place-value mat with hundreds, tens and ones columns, starting at
// `start`. The child trades between neighbouring columns (one ten for ten ones and back).
// - `regroup-to`: trade until the mat shows exactly `regroupTarget`.
// - `compute` with `+`: the operand's pieces wait below the mat and `combine {column}` moves them
//   onto it; with `-`: `take {column, count}` takes pieces off the mat. Either way the child trades
//   when a column overflows or runs out. `write-digit` writes the column algorithm
//   (`showAlgorithm`), and `answer {value}` is the typed result (`thenAsk`).
// Response: state `{ hundreds, tens, ones, value? }`, checked by `trade.result`.

import { baseTenTradeConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import { COLUMNS, type Column, column, type Hto, PIECE_VALUE } from './place-value';
import { argNumber, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'base-ten-trade'>;

export interface BaseTenTradeState extends FormatState<'base-ten-trade'> {
  mat: Hto;
  /** `+` only: operand pieces not yet combined onto the mat. */
  pending: Hto;
  /** `-` only: pieces taken off the mat so far, per column. */
  taken: Hto;
  /** Digits written under the algorithm (`showAlgorithm`), per column. */
  written: Record<Column, number | null>;
  value: number | null;
}

export const htoValue = (h: Hto): number =>
  h.hundreds * PIECE_VALUE.hundreds + h.tens * PIECE_VALUE.tens + h.ones;

const zero = (): Hto => ({ hundreds: 0, tens: 0, ones: 0 });

/** The result a `compute` item asks for (start ± operand), or the start value. */
export function computeResult(c: Config): number {
  const start = htoValue(c.start);
  if (!c.operation) return start;
  const operand = htoValue(c.operation.operand);
  return c.operation.op === '+' ? start + operand : start - operand;
}

/**
 * Trades the item needs. `compute`: carries (`+`) or borrows (`-`) in the column algorithm on the
 * mat's own columns. `regroup-to`: the single trades from `start` to `regroupTarget`.
 */
export function regroupCount(c: Config): number {
  if (c.goal === 'regroup-to') {
    const t = c.regroupTarget;
    if (!t) return 0;
    return Math.abs(t.hundreds - c.start.hundreds) + Math.abs(t.ones - c.start.ones) / 10;
  }
  const op = c.operation;
  if (!op) return 0;
  const s = c.start;
  const o = op.operand;
  if (op.op === '+') {
    const c1 = s.ones + o.ones >= 10 ? 1 : 0;
    const c2 = s.tens + o.tens + c1 >= 10 ? 1 : 0;
    return c1 + c2;
  }
  const b1 = s.ones < o.ones ? 1 : 0;
  const b2 = s.tens - b1 < o.tens ? 1 : 0;
  return b1 + b2;
}

/** A subtraction whose ones borrow must cross an empty tens column (304 − 128). */
export function borrowsAcrossZero(c: Config): boolean {
  const op = c.operation;
  if (c.goal !== 'compute' || op?.op !== '-') return false;
  return c.start.ones < op.operand.ones && c.start.tens === 0;
}

const configSchema = baseTenTradeConfigSchema.superRefine((c, ctx) => {
  if (c.goal === 'compute') {
    if (!c.operation) {
      ctx.addIssue({ code: 'custom', path: ['operation'], message: 'compute needs an operation' });
    } else if (computeResult(c) < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['operation'],
        message: 'the result is negative',
      });
    }
  } else {
    if (!c.regroupTarget) {
      ctx.addIssue({
        code: 'custom',
        path: ['regroupTarget'],
        message: 'regroup-to needs a target',
      });
    } else if (htoValue(c.regroupTarget) !== htoValue(c.start)) {
      ctx.addIssue({
        code: 'custom',
        path: ['regroupTarget'],
        message: 'trading never changes the value',
      });
    }
    if (c.thenAsk) {
      ctx.addIssue({
        code: 'custom',
        path: ['thenAsk'],
        message: 'regroup-to asks for no typed value',
      });
    }
  }
});

export const baseTenTrade: FormatModel<'base-ten-trade', BaseTenTradeState> = {
  format: 'base-ten-trade',
  configSchema,
  features: {
    regroups: {
      weight: 0.6,
      doc: 'trades needed (carries or borrows; single trades for regroup-to)',
    },
    acrossZero: { weight: 0.8, doc: 'a subtraction borrows across an empty tens column' },
    threeDigit: { weight: 0.4, doc: 'a three-digit number is involved' },
    subtract: { weight: 0.3, doc: 'subtraction' },
    showAlgorithm: { weight: 0.2, doc: 'the column algorithm is written beside the mat' },
  },
  featureValues(c: Config) {
    const values = [htoValue(c.start), computeResult(c)];
    if (c.operation) values.push(htoValue(c.operation.operand));
    return {
      regroups: regroupCount(c),
      acrossZero: borrowsAcrossZero(c) ? 1 : 0,
      threeDigit: values.some((v) => v >= 100) ? 1 : 0,
      subtract: c.goal === 'compute' && c.operation?.op === '-' ? 1 : 0,
      showAlgorithm: c.showAlgorithm ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    mat: { ...config.start },
    pending:
      config.goal === 'compute' && config.operation?.op === '+'
        ? { ...config.operation.operand }
        : zero(),
    taken: zero(),
    written: { hundreds: null, tens: null, ones: null },
    value: null,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'trade': {
        const from = column(a.args?.from);
        const to = column(a.args?.to);
        if (!from || !to) return s;
        const i = COLUMNS.indexOf(from);
        const j = COLUMNS.indexOf(to);
        const mat = { ...s.mat };
        if (j === i + 1 && mat[from] >= 1) {
          // One piece becomes ten of the next smaller column.
          mat[from] -= 1;
          mat[to] += 10;
        } else if (j === i - 1 && mat[from] >= 10) {
          // Ten pieces become one of the next larger column.
          mat[from] -= 10;
          mat[to] += 1;
        } else {
          return s;
        }
        return { ...s, mat };
      }
      case 'combine': {
        const col = column(a.args?.column);
        const cols = col ? [col] : COLUMNS;
        const mat = { ...s.mat };
        const pending = { ...s.pending };
        for (const k of cols) {
          mat[k] += pending[k];
          pending[k] = 0;
        }
        return { ...s, mat, pending };
      }
      case 'take': {
        const col = column(a.args?.column);
        if (!col) return s;
        const n = Math.min(Math.max(0, Math.trunc(argNumber(a, 'count') ?? 1)), s.mat[col]);
        if (n === 0) return s;
        return {
          ...s,
          mat: { ...s.mat, [col]: s.mat[col] - n },
          taken: { ...s.taken, [col]: s.taken[col] + n },
        };
      }
      case 'write-digit': {
        const col = column(a.args?.column);
        const v = argNumber(a, 'value');
        if (!col || v === undefined) return s;
        return { ...s, written: { ...s.written, [col]: v } };
      }
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('base-ten-trade', a.op);
    }
  },
  toResponse(s) {
    if (s.config.thenAsk && s.value === null) return null;
    return {
      kind: 'state',
      // The typed value is part of the answer only when the item asks for it (thenAsk).
      value: { ...s.mat, ...(s.config.thenAsk && s.value !== null ? { value: s.value } : {}) },
    };
  },
};
