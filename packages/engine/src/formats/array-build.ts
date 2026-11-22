// 03 §5.5 array-build. A rows × cols array of sprites on an optional grid, at most maxRows ×
// maxCols.
// - `build-dims`, `build-total`, `new-way`: the child drags out a rectangle (`drag-rect`) or adds
//   rows (`add-row`); answers state `{ rows, cols }` (`array.dims` / `array.area`).
// - `read`: the array is shown; answers the typed number.
// - `split` (MUL.07): the array is shown; the child places a split line after column 1 … cols − 1
//   (`split-at {col}`; `split-at {remove: true}` takes it out again) and types the total; answers state `{ rows, cols, split, value }`
//   (`array.dims` with `requireSplit`).
// `count-rows` and `skip-count-rows` are visual (row highlights).

import {
  type AnswerSpec,
  arrayBuildConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { argNumber, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'array-build'>;

export interface ArrayBuildState extends FormatState<'array-build'> {
  rows: number;
  cols: number;
  /** `split`: the split line sits after this column (1 … cols − 1). */
  split: number | null;
  value: number | null;
  /** Row highlight from `count-rows` / `skip-count-rows`. */
  counting: 'rows' | 'skip' | null;
}

const shown = (c: Config): boolean => c.mode === 'read' || c.mode === 'split';

/**
 * The supported domain (U04 #13). Fixed numbers, the same in every widget area and age mode: a
 * board of ARRAY_SIDE_MAX rows and columns draws every sprite at least 22 px wide in the smallest
 * widget area (906 × 373).
 */
export const ARRAY_SIDE_MAX = 10;
/** `new-way` lists at most this many rectangles already found (one line of numerals). */
export const ARRAY_FOUND_MAX = 2;

/**
 * The largest number the answer control offers (`read`, `split`): from the board's size, never
 * from the answer. 0 to 20 for a board of at most 20 cells, otherwise 0 to 100.
 */
export function arrayAnswerMax(c: Pick<Config, 'maxRows' | 'maxCols'>): number {
  return c.maxRows * c.maxCols <= 20 ? 20 : ARRAY_SIDE_MAX * ARRAY_SIDE_MAX;
}

const sameSpec = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Why an item's answer is not the one this config asks for (FormatModel.answerIssues): `read`
 * answers rows × cols as a number; `split` and `build-dims` are checked by `array.dims` with this
 * config's rows, cols and orientation rule; `build-total` and `new-way` by `array.area` with this
 * config's total and found list.
 */
export function arrayAnswerIssues(c: Config, answer: AnswerSpec): string[] {
  const rows = c.rows ?? 0;
  const cols = c.cols ?? 0;
  if (c.mode === 'read') {
    if (answer.kind !== 'number') return ['read answers a number'];
    return answer.value === rows * cols
      ? []
      : [`the picture shows ${rows * cols}, the answer is ${answer.value}`];
  }
  const out: string[] = [];
  if (c.mode === 'split' || c.mode === 'build-dims') {
    if (answer.kind !== 'state' || answer.checker !== 'array.dims') {
      return [`${c.mode} answers array.dims`];
    }
    const t = answer.target;
    if (t.rows !== rows || t.cols !== cols) {
      out.push(`the target is ${String(t.rows)} × ${String(t.cols)}, the widget ${rows} × ${cols}`);
    }
    if ((t.requireSplit === true) !== (c.mode === 'split')) {
      out.push('requireSplit is set exactly for split');
    }
    if (c.mode === 'build-dims' && (t.orientationMatters === true) !== c.orientationMatters) {
      out.push('the target and the widget disagree on whether orientation matters');
    }
    return out;
  }
  if (answer.kind !== 'state' || answer.checker !== 'array.area') {
    return [`${c.mode} answers array.area`];
  }
  const t = answer.target;
  if (t.total !== c.total) {
    out.push(`the target total is ${String(t.total)}, the widget ${String(c.total)}`);
  }
  if (c.mode === 'new-way' ? !sameSpec(t.found, c.found) : t.found !== undefined) {
    out.push('the target lists other found rectangles than the widget');
  }
  return out;
}

/** Every rectangle (rows ≤ maxRows, cols ≤ maxCols) of area `total`, as [rows, cols]. */
export function rectanglesOf(c: Config, total: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 1; r <= c.maxRows; r += 1) {
    if (total % r === 0 && total / r <= c.maxCols) out.push([r, total / r]);
  }
  return out;
}

/** Whether [r, c] (either way round) is among the rectangles already found. */
export function alreadyFound(found: readonly [number, number][] | undefined, r: number, c: number) {
  return (found ?? []).some(([a, b]) => (a === r && b === c) || (a === c && b === r));
}

const configSchema = arrayBuildConfigSchema.superRefine((c, ctx) => {
  for (const side of ['maxRows', 'maxCols'] as const) {
    if (c[side] > ARRAY_SIDE_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: [side],
        message: `the board has at most ${ARRAY_SIDE_MAX} rows and columns (${side} is ${c[side]})`,
      });
    }
  }
  if (c.found && c.found.length > ARRAY_FOUND_MAX) {
    ctx.addIssue({
      code: 'custom',
      path: ['found'],
      message: `at most ${ARRAY_FOUND_MAX} found rectangles are listed (${c.found.length} given)`,
    });
  }
  const needDims = c.mode !== 'build-total' && c.mode !== 'new-way';
  if (needDims) {
    // A shown array must fit as drawn; a built one may fit turned when orientation is free.
    const fits = (r: number, k: number) => r <= c.maxRows && k <= c.maxCols;
    const rows = c.rows ?? 0;
    const cols = c.cols ?? 0;
    const turnable = c.mode === 'build-dims' && !c.orientationMatters;
    if (!rows || !cols || !(fits(rows, cols) || (turnable && fits(cols, rows)))) {
      ctx.addIssue({
        code: 'custom',
        path: ['rows'],
        message: 'rows and cols must be set and fit within maxRows × maxCols',
      });
    }
    if (c.mode === 'split' && (c.cols ?? 0) < 2) {
      ctx.addIssue({ code: 'custom', path: ['cols'], message: 'a split needs at least 2 columns' });
    }
    return;
  }
  if (!c.total || rectanglesOf(c, c.total).length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['total'],
      message: 'no rectangle of that total fits the grid',
    });
    return;
  }
  if (c.mode === 'new-way') {
    const total = c.total;
    const found = c.found ?? [];
    const fitsGrid = (r: number, k: number) =>
      (r <= c.maxRows && k <= c.maxCols) || (k <= c.maxRows && r <= c.maxCols);
    if (found.some(([r, k]) => r < 1 || k < 1 || r * k !== total || !fitsGrid(r, k))) {
      ctx.addIssue({
        code: 'custom',
        path: ['found'],
        message: `every found rectangle has ${total} in all and fits the board`,
      });
    }
    if (found.some(([r, k], i) => alreadyFound(found.slice(0, i), r, k))) {
      ctx.addIssue({
        code: 'custom',
        path: ['found'],
        message: 'a found rectangle is listed once (3 × 4 and 4 × 3 are the same)',
      });
    }
    if (!c.found) {
      ctx.addIssue({ code: 'custom', path: ['found'], message: 'new-way lists the arrays found' });
    } else if (rectanglesOf(c, c.total).every(([r, k]) => alreadyFound(c.found, r, k))) {
      ctx.addIssue({ code: 'custom', path: ['found'], message: 'no new rectangle is left' });
    }
  }
});

/** The product an item is about: rows × cols, or the total. */
const productOf = (c: Config): number => c.total ?? (c.rows ?? 0) * (c.cols ?? 0);

export const arrayBuild: FormatModel<'array-build', ArrayBuildState> = {
  format: 'array-build',
  configSchema,
  answerIssues: arrayAnswerIssues,
  features: {
    product: { weight: 0.3, doc: '(product − 1) / 10' },
    'factor.over5': { weight: 0.4, doc: 'a side is longer than 5' },
    'mode.buildTotal': { weight: 0.4, doc: 'build-total or new-way: find a rectangle of a total' },
    split: { weight: 0.3, doc: 'split mode (MUL.07)' },
    'grid.off': { weight: 0.4, doc: 'no grid under the array' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      product: Math.max(0, productOf(c) - 1) / 10,
      'factor.over5': Math.max(c.rows ?? 0, c.cols ?? 0) > 5 ? 1 : 0,
      'mode.buildTotal': c.mode === 'build-total' || c.mode === 'new-way' ? 1 : 0,
      split: c.mode === 'split' ? 1 : 0,
      'grid.off': c.gridShown ? 0 : 1,
    };
  },
  initialState: (config) => ({
    config,
    rows: shown(config) ? (config.rows ?? 0) : 0,
    cols: shown(config) ? (config.cols ?? 0) : 0,
    split: null,
    value: null,
    counting: null,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'drag-rect': {
        if (shown(c)) return s;
        const r = Math.trunc(argNumber(a, 'rows') ?? 0);
        const k = Math.trunc(argNumber(a, 'cols') ?? 0);
        const rows = Math.max(0, Math.min(c.maxRows, r));
        const cols = Math.max(0, Math.min(c.maxCols, k));
        // An empty board has neither rows nor columns.
        if (rows === 0 || cols === 0) return { ...s, rows: 0, cols: 0 };
        return { ...s, rows, cols };
      }
      case 'add-row': {
        if (shown(c)) return s;
        // The first row takes the item's width when it has one, else a single sprite.
        const cols = s.cols > 0 ? s.cols : Math.min(c.maxCols, c.cols ?? 1);
        return { ...s, rows: Math.min(c.maxRows, s.rows + 1), cols };
      }
      case 'split-at': {
        if (c.mode !== 'split') return s;
        // `remove` takes the line out again (the array as it was given).
        if (a.args?.remove === true) return s.split === null ? s : { ...s, split: null };
        const at = Math.trunc(argNumber(a, 'col') ?? 0);
        if (at < 1 || at >= s.cols) return s;
        return { ...s, split: at };
      }
      case 'count-rows':
        return { ...s, counting: 'rows' };
      case 'skip-count-rows':
        return { ...s, counting: 'skip' };
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('array-build', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    if (c.mode === 'read') return s.value === null ? null : { kind: 'number', value: s.value };
    if (c.mode === 'split') {
      if (s.split === null || s.value === null) return null;
      return {
        kind: 'state',
        value: { rows: s.rows, cols: s.cols, split: s.split, value: s.value },
      };
    }
    if (s.rows === 0 || s.cols === 0) return null;
    return { kind: 'state', value: { rows: s.rows, cols: s.cols } };
  },
};
