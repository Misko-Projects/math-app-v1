// 03 §5.5 base-ten-build. A mat of base-ten pieces (units, rods, flats, cubes). The child takes
// pieces from a tray, fuses ten of one kind into the next larger piece and splits one piece into
// ten of the next smaller kind.
// - `pieces` says which kinds the tray offers; `limits` caps how many of a kind the tray holds
//   (limits that force a trade are the `limits.tight` feature). Fusing and splitting never use the
//   tray.
// - `prebuilt` pieces start on the mat (the picture a `read` item shows).
// - Values are in ones; with `wholeIs: 'flat'` they are hundredths (flat 1, rod 0.1, unit 0.01).
// Response: `build` and `build-exact` answer with state `{ thousands, hundreds, tens, ones }` (the
// mat), checked by `baseten.value` / `baseten.exact`; `read` answers with the typed number.

import { baseTenBuildConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  canonicalPieces,
  emptyPieces,
  hasInternalZero,
  largerKind,
  PIECE_KINDS,
  PIECE_VALUE,
  type PieceKind,
  type Pieces,
  pieceKind,
  piecesValue,
  smallerKind,
} from './place-value';
import {
  argNumber,
  digitCount,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'base-ten-build'>;

export interface BaseTenBuildState extends FormatState<'base-ten-build'> {
  /** Pieces on the mat. */
  mat: Pieces;
  /** Pieces taken from the tray so far (net), checked against `limits`. */
  taken: Pieces;
  /** The typed number (`read`). */
  value: number | null;
  /** The kind a `count-by` is counting, for the widget's highlight. */
  countingBy: PieceKind | null;
}

/** Pieces of a kind the tray still holds (Infinity without a limit). */
export function traySupply(c: Config, taken: Pieces, k: PieceKind): number {
  if (!c.pieces[k]) return 0;
  const limit = k === 'thousands' ? undefined : c.limits?.[k];
  return limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, limit - taken[k]);
}

/**
 * Whether `target` can be built from the tray: with fusing and splitting every enabled kind can
 * become any smaller enabled kind, so it needs the smallest enabled kind to divide the target and
 * the tray to hold enough value in total.
 */
export function buildable(c: Config, target: number): boolean {
  const kinds = PIECE_KINDS.filter((k) => c.pieces[k]);
  const smallest = kinds[kinds.length - 1];
  if (smallest === undefined) return false;
  const start = piecesValue(c.prebuilt ?? {});
  const need = target - start;
  if (need < 0) return false;
  if (need % PIECE_VALUE[smallest] !== 0) return false;
  const supply = kinds.reduce((a, k) => a + traySupply(c, emptyPieces(), k) * PIECE_VALUE[k], 0);
  return supply >= need;
}

/**
 * Whether some mat with exactly the `exact` counts is worth the target: what the named counts
 * leave over must be a whole number of the smallest enabled kind `exact` leaves free.
 */
export function exactReachable(c: Config): boolean {
  const exact = c.exact ?? {};
  const rest = c.target - piecesValue(exact);
  if (rest < 0) return false;
  if (rest === 0) return true;
  const free = PIECE_KINDS.filter(
    (k) => c.pieces[k] && (k === 'thousands' || exact[k] === undefined),
  );
  const smallest = free[free.length - 1];
  return smallest !== undefined && rest % PIECE_VALUE[smallest] === 0;
}

/** Whether the limits make the canonical pieces of the target impossible (a trade is needed). */
export function limitsForceTrade(c: Config): boolean {
  if (!c.limits || c.mode === 'read') return false;
  const want = canonicalPieces(c.target);
  const have: Partial<Pieces> = c.prebuilt ?? {};
  return (['hundreds', 'tens', 'ones'] as const).some((k) => {
    const limit = c.limits?.[k];
    return limit !== undefined && want[k] - (have[k] ?? 0) > limit;
  });
}

const configSchema = baseTenBuildConfigSchema.superRefine((c, ctx) => {
  if (!Number.isInteger(c.target) || c.target < 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['target'],
      message: 'target is a positive count of ones',
    });
    return;
  }
  if (!PIECE_KINDS.some((k) => c.pieces[k]) && c.mode !== 'read') {
    ctx.addIssue({ code: 'custom', path: ['pieces'], message: 'the tray offers no pieces' });
  }
  if (c.mode === 'read') {
    if (!c.prebuilt || piecesValue(c.prebuilt) !== c.target) {
      ctx.addIssue({
        code: 'custom',
        path: ['prebuilt'],
        message: 'read shows prebuilt pieces worth the target',
      });
    }
    return;
  }
  if (!buildable(c, c.target)) {
    ctx.addIssue({
      code: 'custom',
      path: ['pieces'],
      message: 'the tray cannot build the target',
    });
  }
  if (c.mode === 'build-exact') {
    const exact = c.exact ?? {};
    const fixed = (['hundreds', 'tens', 'ones'] as const).filter((k) => exact[k] !== undefined);
    if (fixed.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['exact'], message: 'build-exact names a piece count' });
    }
    if (!exactReachable(c)) {
      ctx.addIssue({
        code: 'custom',
        path: ['exact'],
        message: 'no mat with these exact counts is worth the target',
      });
    }
    if (fixed.some((k) => !c.pieces[k])) {
      ctx.addIssue({
        code: 'custom',
        path: ['exact'],
        message: 'exact names a kind the tray lacks',
      });
    }
  }
});

function clampAdd(s: BaseTenBuildState, k: PieceKind, count: number): BaseTenBuildState {
  if (count >= 0) {
    const add = Math.min(count, traySupply(s.config, s.taken, k));
    if (add <= 0) return s;
    return {
      ...s,
      mat: { ...s.mat, [k]: s.mat[k] + add },
      taken: { ...s.taken, [k]: s.taken[k] + add },
    };
  }
  // A negative count puts pieces back in the tray.
  const back = Math.min(-count, s.mat[k]);
  if (back <= 0) return s;
  return {
    ...s,
    mat: { ...s.mat, [k]: s.mat[k] - back },
    taken: { ...s.taken, [k]: Math.max(0, s.taken[k] - back) },
  };
}

export const baseTenBuild: FormatModel<'base-ten-build', BaseTenBuildState> = {
  format: 'base-ten-build',
  configSchema,
  features: {
    digits: { weight: 0.5, doc: 'digits of the target − 1' },
    'zero.internal': { weight: 0.6, doc: 'the target has a zero between its first and last digit' },
    exact: { weight: 0.7, doc: 'build-exact mode (a fixed count of some piece)' },
    'mode.read': { weight: -0.2, doc: 'read mode (count a prebuilt picture)' },
    'limits.tight': { weight: 0.5, doc: 'the tray limits force a trade' },
    decimal: { weight: 0.5, doc: 'the flat is the whole (values in hundredths)' },
  },
  featureValues(c: Config) {
    return {
      digits: Math.max(0, digitCount(c.target) - 1),
      'zero.internal': hasInternalZero(c.target) ? 1 : 0,
      exact: c.mode === 'build-exact' ? 1 : 0,
      'mode.read': c.mode === 'read' ? 1 : 0,
      'limits.tight': limitsForceTrade(c) ? 1 : 0,
      decimal: c.wholeIs === 'flat' ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    mat: { ...emptyPieces(), ...(config.prebuilt ?? {}) },
    taken: emptyPieces(),
    value: null,
    countingBy: null,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'add-piece': {
        const k = pieceKind(a.args?.kind);
        if (!k) return s;
        return clampAdd(s, k, Math.trunc(argNumber(a, 'count') ?? 1));
      }
      case 'fuse': {
        const k = pieceKind(a.args?.kind);
        const up = k && largerKind(k);
        if (!k || !up || s.mat[k] < 10) return s;
        return { ...s, mat: { ...s.mat, [k]: s.mat[k] - 10, [up]: s.mat[up] + 1 } };
      }
      case 'split': {
        const k = pieceKind(a.args?.kind);
        const down = k && smallerKind(k);
        if (!k || !down || s.mat[k] < 1) return s;
        return { ...s, mat: { ...s.mat, [k]: s.mat[k] - 1, [down]: s.mat[down] + 10 } };
      }
      case 'count-by':
        return { ...s, countingBy: pieceKind(a.args?.kind) ?? null };
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('base-ten-build', a.op);
    }
  },
  toResponse(s) {
    if (s.config.mode === 'read') {
      return s.value === null ? null : { kind: 'number', value: s.value };
    }
    if (piecesValue(s.mat) === 0) return null;
    return { kind: 'state', value: { ...s.mat } };
  },
};
