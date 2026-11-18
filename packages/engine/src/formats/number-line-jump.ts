// 03 §5.5 number-line-jump. Response: state `{ jumps: number[], value?: number }`. Any sequence of
// allowed signed jumps from `start` that lands on `target` is correct (strategy freedom).

import { numberLineJumpConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  argNumber,
  digitCount,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'number-line-jump'>;

export interface NumberLineJumpState extends FormatState<'number-line-jump'> {
  position: number;
  jumps: number[];
  value: number | null;
  highlighted: number | null;
}

/** Fewest allowed jumps from start to target (BFS over the line's range), or null. */
export function fewestJumps(c: Config): number | null {
  if (c.target === undefined) return null;
  const seen = new Set<number>([c.start]);
  let frontier = [c.start];
  for (let depth = 0; depth <= 200 && frontier.length > 0; depth += 1) {
    if (frontier.includes(c.target)) return depth;
    const next: number[] = [];
    for (const p of frontier) {
      for (const j of c.allowedJumps) {
        const q = p + j;
        if (q >= c.min && q <= c.max && !seen.has(q)) {
          seen.add(q);
          next.push(q);
        }
      }
    }
    frontier = next;
  }
  return null;
}

const configSchema = numberLineJumpConfigSchema.superRefine((c, ctx) => {
  if (c.min >= c.max)
    ctx.addIssue({ code: 'custom', path: ['max'], message: 'max must exceed min' });
  if (c.start < c.min || c.start > c.max) {
    ctx.addIssue({ code: 'custom', path: ['start'], message: 'start is off the line' });
  }
  if (c.allowedJumps.length === 0 || c.allowedJumps.some((j) => j === 0)) {
    ctx.addIssue({ code: 'custom', path: ['allowedJumps'], message: 'jumps must be non-zero' });
  }
  if (c.target === undefined) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: 'a jump item needs a target' });
  } else if (c.target < c.min || c.target > c.max) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: 'target is off the line' });
  } else if (fewestJumps(c) === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['allowedJumps'],
      message: 'the target cannot be reached',
    });
  }
});

export const numberLineJump: FormatModel<'number-line-jump', NumberLineJumpState> = {
  format: 'number-line-jump',
  configSchema,
  features: {
    'jumps.min': { weight: 0.2, doc: 'fewest jumps needed − 1' },
    crossDecade: { weight: 0.4, doc: 'the path crosses a multiple of 10' },
    backward: { weight: 0.5, doc: 'the target is behind the start' },
    'path.open': { weight: 0.5, doc: 'open number line (no ticks)' },
    magnitude: { weight: 0.3, doc: 'digits of the largest number − 1' },
    mixedJumps: { weight: 0.3, doc: 'both tens and ones jumps are allowed' },
  },
  featureValues(c: Config) {
    const target = c.target ?? c.start;
    const lo = Math.min(c.start, target);
    const hi = Math.max(c.start, target);
    const abs = c.allowedJumps.map(Math.abs);
    return {
      'jumps.min': Math.max(0, (fewestJumps(c) ?? 1) - 1),
      crossDecade: Math.floor(lo / 10) !== Math.floor(hi / 10) && hi % 10 !== 0 ? 1 : 0,
      backward: target < c.start ? 1 : 0,
      'path.open': c.path === 'open' ? 1 : 0,
      magnitude: Math.max(0, digitCount(Math.max(Math.abs(c.start), Math.abs(target))) - 1),
      mixedJumps: abs.some((j) => j >= 10) && abs.some((j) => j < 10) ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    position: config.start,
    jumps: [],
    value: null,
    highlighted: null,
  }),
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'hop': {
        const by = argNumber(a, 'by');
        if (by === undefined || by === 0) return s;
        const to = s.position + by;
        if (to < c.min || to > c.max) return s;
        return { ...s, position: to, jumps: [...s.jumps, by] };
      }
      case 'bridge-to': {
        const at = argNumber(a, 'at');
        if (at === undefined || at === s.position) return s;
        return numberLineJump.apply(s, { op: 'hop', args: { by: at - s.position } });
      }
      case 'label-landing': {
        const total = s.jumps.reduce((x, y) => x + y, 0);
        return { ...s, value: c.thenAsk === 'total-jump' ? Math.abs(total) : s.position };
      }
      case 'highlight':
        return { ...s, highlighted: argNumber(a, 'at') ?? null };
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('number-line-jump', a.op);
    }
  },
  toResponse(s) {
    if (s.jumps.length === 0) return null;
    return {
      kind: 'state',
      value: { jumps: [...s.jumps], ...(s.value !== null ? { value: s.value } : {}) },
    };
  },
};
