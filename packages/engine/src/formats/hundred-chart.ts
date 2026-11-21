// 03 §5.5 hundred-chart. Ten columns; cells run from `first` for `rows` rows. `find`, `next` and
// `move` answer with the tapped number; `fill` answers with the hidden cells' values in reading
// order; `pattern` answers with state `{ values }` (select.exactSet).

import {
  type AnswerSpec,
  hundredChartConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'hundred-chart'>;

export interface HundredChartState extends FormatState<'hundred-chart'> {
  tapped: number | null;
  selected: number[];
  /**
   * The blanks' values in READING order (ascending cell number, 03 §5.5 "hidden cells in reading
   * order"), whatever order `config.hidden` lists them in: `filled[i]` is the i-th blank read
   * left to right, top to bottom. `answer {values}` gives them in that order too.
   */
  filled: (number | null)[];
  highlighted: string | null;
}

export const chartLast = (c: Config): number => c.first + c.rows * 10 - 1;

/**
 * The supported domain of a chart: it starts at 901 at the latest, so its numbers have at most
 * three digits (and 1,000, the last cell of a 901–1000 chart). Shipped charts are 1–100, 1–120
 * and 101–200; the cells are sized for numbers of that length.
 */
export const CHART_FIRST_MAX = 901;

const configSchema = hundredChartConfigSchema.superRefine((c, ctx) => {
  if (c.first > CHART_FIRST_MAX) {
    ctx.addIssue({
      code: 'custom',
      path: ['first'],
      message: `first is at most ${CHART_FIRST_MAX} (charts up to 1,000 are supported)`,
    });
  }
  if (!(c.first === 0 || c.first === 1 || (c.first > 100 && c.first % 100 === 1))) {
    ctx.addIssue({ code: 'custom', path: ['first'], message: 'first is 0, 1, 101, 201, …' });
  }
  if (c.rows !== 10 && c.rows !== 12) {
    ctx.addIssue({
      code: 'custom',
      path: ['rows'],
      message: 'rows is 10, or 12 for a 1–120 chart',
    });
  }
  const last = chartLast(c);
  if (c.hidden.some((h) => h < c.first || h > last)) {
    ctx.addIssue({
      code: 'custom',
      path: ['hidden'],
      message: 'hidden cells must be on the chart',
    });
  }
  if (new Set(c.hidden).size !== c.hidden.length) {
    ctx.addIssue({ code: 'custom', path: ['hidden'], message: 'hidden cells must be distinct' });
  }
  if ((c.mode === 'next' || c.mode === 'move') && c.from === undefined) {
    ctx.addIssue({ code: 'custom', path: ['from'], message: `${c.mode} needs from` });
  }
  if (c.mode === 'move' && !(c.moves && c.moves.length > 0)) {
    ctx.addIssue({ code: 'custom', path: ['moves'], message: 'move needs at least one move' });
  }
});

export const hundredChart: FormatModel<'hundred-chart', HundredChartState> = {
  format: 'hundred-chart',
  configSchema,
  features: {
    hidden: { weight: 0.15, doc: 'each hidden cell' },
    'first.over100': { weight: 0.4, doc: 'the chart starts above 100' },
    moves: { weight: 0.25, doc: 'each move' },
    'pattern.step': { weight: 0.4, doc: 'pattern step not in {2, 5, 10}' },
    crossCentury: { weight: 0.5, doc: 'the answer crosses a hundred' },
  },
  featureValues(c: Config, answer: AnswerSpec) {
    // The answer crosses a hundred when it is in another hundred than the starting cell.
    const answers =
      answer.kind === 'number' ? [answer.value] : answer.kind === 'numbers' ? answer.values : [];
    const from = c.from ?? c.first;
    const crosses = answers.some((v) => Math.floor(v / 100) !== Math.floor(from / 100));
    return {
      hidden: c.hidden.length,
      'first.over100': c.first > 100 ? 1 : 0,
      moves: c.moves?.length ?? 0,
      'pattern.step':
        c.mode === 'pattern' && c.patternStep !== undefined && ![2, 5, 10].includes(c.patternStep)
          ? 1
          : 0,
      crossCentury: crosses ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    tapped: null,
    selected: [],
    filled: config.hidden.map(() => null),
    highlighted: null,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'tap': {
        const n = argNumber(a, 'n');
        if (n === undefined || n < c.first || n > chartLast(c)) return s;
        if (c.mode === 'pattern') {
          const selected = s.selected.includes(n)
            ? s.selected.filter((x) => x !== n)
            : [...s.selected, n];
          return { ...s, selected };
        }
        return { ...s, tapped: n };
      }
      case 'highlight-row':
      case 'highlight-col':
        return { ...s, highlighted: `${a.op}:${argNumber(a, 'n') ?? ''}` };
      case 'slide':
        return { ...s, highlighted: `slide:${argString(a, 'dir') ?? ''}` };
      case 'answer': {
        const values = argNumbers(a, 'values');
        if (values) {
          if (c.mode === 'pattern') return { ...s, selected: [...values] };
          return { ...s, filled: c.hidden.map((_, i) => values[i] ?? null) };
        }
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, tapped: v };
      }
      default:
        throw new UnsupportedOpError('hundred-chart', a.op);
    }
  },
  toResponse(s) {
    const c = s.config;
    if (c.mode === 'fill') {
      return s.filled.some((x) => x === null)
        ? null
        : { kind: 'numbers', values: s.filled as number[] };
    }
    if (c.mode === 'pattern') {
      return { kind: 'state', value: { values: [...s.selected].sort((x, y) => x - y) } };
    }
    return s.tapped === null ? null : { kind: 'number', value: s.tapped };
  },
};
