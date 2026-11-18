// 03 §5.5 tenframe-fill. State `{ cells: number[][], value?: number }`: one array per frame, one
// entry per cell in reading order (top row left to right, then the bottom row), where 0 is empty,
// 1 a colour-a counter and 2 a colour-b counter. Both colours are always available, so a child can
// show a split (bond.split counts the two colours). `value` is the number entered for `thenAsk`.

import { tenframeFillConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'tenframe-fill'>;

export interface TenframeState extends FormatState<'tenframe-fill'> {
  cells: number[][];
  value: number | null;
  highlighted: string | null;
}

const colorCode = (c: string | undefined): number => (c === 'b' ? 2 : 1);

const configSchema = tenframeFillConfigSchema.superRefine((c, ctx) => {
  const perFrame = new Array<number>(c.frames).fill(0);
  for (const [i, p] of c.prefilled.entries()) {
    if (p.frame >= c.frames) {
      ctx.addIssue({ code: 'custom', path: ['prefilled', i, 'frame'], message: 'no such frame' });
    } else perFrame[p.frame] = (perFrame[p.frame] as number) + p.count;
  }
  if (perFrame.some((n) => n > c.size)) {
    ctx.addIssue({
      code: 'custom',
      path: ['prefilled'],
      message: 'prefilled counters overflow a frame',
    });
  }
  const capacity = c.frames * c.size;
  if (c.goal === 'add' && (c.a === undefined || c.b === undefined || c.a + c.b > capacity)) {
    ctx.addIssue({
      code: 'custom',
      path: ['goal'],
      message: 'add needs a and b that fit the frames',
    });
  }
  if (c.goal === 'show-n' && (c.n === undefined || c.n > capacity)) {
    ctx.addIssue({ code: 'custom', path: ['n'], message: 'show-n needs n that fits the frames' });
  }
  if (c.goal === 'make-ten' && c.size !== 10) {
    ctx.addIssue({ code: 'custom', path: ['size'], message: 'make-ten needs a ten-frame' });
  }
});

function place(cells: number[][], frame: number, count: number, color: number): number[][] {
  const out = cells.map((f) => [...f]);
  const f = out[frame];
  if (!f) return cells;
  let left = count;
  for (let i = 0; i < f.length && left > 0; i += 1) {
    if (f[i] === 0) {
      f[i] = color;
      left -= 1;
    }
  }
  return out;
}

function removeLast(cells: number[][], frame: number, count: number): number[][] {
  const out = cells.map((f) => [...f]);
  const f = out[frame];
  if (!f) return cells;
  let left = count;
  for (let i = f.length - 1; i >= 0 && left > 0; i -= 1) {
    if (f[i] !== 0) {
      f[i] = 0;
      left -= 1;
    }
  }
  return out;
}

export function tenframeTotal(cells: number[][]): number {
  return cells.reduce((sum, f) => sum + f.filter((x) => x !== 0).length, 0);
}

export const tenframeFill: FormatModel<'tenframe-fill', TenframeState> = {
  format: 'tenframe-fill',
  configSchema,
  features: {
    'n.over5': { weight: 0.3, doc: 'max(0, n − 5) / 5, n = the total the child must show' },
    twoFrames: { weight: 0.4, doc: 'two frames' },
    'goal.makeTen': { weight: 0.3, doc: 'make-ten goal' },
    'goal.subtract': { weight: 0.4, doc: 'subtract goal' },
    standardFill: { weight: 0.2, doc: 'the standard fill order is required' },
    thenAsk: { weight: 0.2, doc: 'a number must also be entered' },
  },
  featureValues(c: Config) {
    const n = c.goal === 'add' ? (c.a ?? 0) + (c.b ?? 0) : c.goal === 'make-ten' ? 10 : (c.n ?? 0);
    return {
      'n.over5': Math.max(0, n - 5) / 5,
      twoFrames: c.frames === 2 ? 1 : 0,
      'goal.makeTen': c.goal === 'make-ten' ? 1 : 0,
      'goal.subtract': c.goal === 'subtract' ? 1 : 0,
      standardFill: c.requireStandardFill ? 1 : 0,
      thenAsk: c.thenAsk ? 1 : 0,
    };
  },
  initialState(config) {
    let cells = Array.from({ length: config.frames }, () => new Array<number>(config.size).fill(0));
    for (const p of config.prefilled) cells = place(cells, p.frame, p.count, colorCode(p.color));
    return { config, cells, value: null, highlighted: null };
  },
  apply(s, a) {
    const frame = argNumber(a, 'frame') ?? 0;
    switch (a.op) {
      case 'place': {
        const count = Math.max(0, Math.trunc(argNumber(a, 'count') ?? 1));
        let cells = s.cells;
        let left = count;
        // Overflow continues into the next frame (filling 13 on a double frame).
        for (let f = frame; f < cells.length && left > 0; f += 1) {
          const free = (cells[f] as number[]).filter((x) => x === 0).length;
          const n = Math.min(free, left);
          cells = place(cells, f, n, colorCode(argString(a, 'color')));
          left -= n;
        }
        return { ...s, cells };
      }
      case 'remove':
        return {
          ...s,
          cells: removeLast(s.cells, frame, Math.max(0, Math.trunc(argNumber(a, 'count') ?? 1))),
        };
      case 'move-counters': {
        const from = argNumber(a, 'fromFrame') ?? 0;
        const to = argNumber(a, 'toFrame') ?? 0;
        const want = Math.max(0, Math.trunc(argNumber(a, 'count') ?? 1));
        const free = (s.cells[to] ?? []).filter((x) => x === 0).length;
        const have = (s.cells[from] ?? []).filter((x) => x !== 0).length;
        const n = Math.min(want, free, have);
        if (n <= 0 || from === to) return s;
        const moved = (s.cells[from] ?? []).filter((x) => x !== 0).slice(-n);
        let cells = removeLast(s.cells, from, n);
        for (const color of moved) cells = place(cells, to, 1, color);
        return { ...s, cells };
      }
      case 'show-addends':
      case 'highlight':
        return { ...s, highlighted: argString(a, 'target') ?? a.op };
      case 'count-total':
        return { ...s, value: tenframeTotal(s.cells) };
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('tenframe-fill', a.op);
    }
  },
  toResponse(s) {
    return {
      kind: 'state',
      value: { cells: s.cells.map((f) => [...f]), ...(s.value !== null ? { value: s.value } : {}) },
    };
  },
};
