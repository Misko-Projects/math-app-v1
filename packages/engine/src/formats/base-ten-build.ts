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
  DISK_COLUMN_MAX,
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
 * Whether `target` can be built: splitting turns any piece into smaller ones and any piece can go
 * back to the tray, so every value up to what the prebuilt pieces and the tray hold together is
 * reachable.
 */
export function buildable(c: Config, target: number): boolean {
  const kinds = PIECE_KINDS.filter((k) => c.pieces[k]);
  const supply = kinds.reduce((a, k) => a + traySupply(c, emptyPieces(), k) * PIECE_VALUE[k], 0);
  return piecesValue(c.prebuilt ?? {}) + supply >= target;
}

/**
 * Whether some mat with exactly the `exact` counts is worth the target. Fusing and splitting make
 * every kind, so what the named counts leave over must be a whole number of the smallest kind
 * `exact` leaves free (always, when ones are free).
 */
export function exactReachable(c: Config): boolean {
  const exact = c.exact ?? {};
  const rest = c.target - piecesValue(exact);
  if (rest < 0) return false;
  if (rest === 0) return true;
  const free = PIECE_KINDS.filter((k) => k === 'thousands' || exact[k] === undefined);
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

/**
 * The most pieces of a kind an item may need on the mat: what the widget's mat fits at 1280 × 800
 * with all four columns full at once (the base-ten-build widget's layout test proves it). Well
 * above every generator: they show at most 9 thousands (n ≤ 9999), 10 hundreds, 19 tens and 99
 * ones (pv.number, pv.regroup, pv.tenmore, mda.addsub, bond.parts). Ten thousands cubes would be a
 * place the mat does not have.
 */
export const MAT_MAX: Readonly<Pieces> = { thousands: 9, hundreds: 19, tens: 29, ones: 199 };
/**
 * The decimal mat (`wholeIs: 'flat'`) has wider column names (Tenths, Hundredths), so it holds fewer
 * flats beside the fullest side panel. Still above pv.number, the only decimal generator: at most
 * 9 thousands, 10 hundreds, 10 tens and 19 ones (one unit moved down a place).
 */
export const MAT_MAX_FLAT: Readonly<Pieces> = { thousands: 9, hundreds: 14, tens: 29, ones: 199 };

/**
 * Whether the mat draws place-value disks (place-value.ts): hundreds are in play, that is the tray
 * offers flats or cubes, some start on the mat, or the item asks for some (`exact`). The decimal mat (`wholeIs: 'flat'`) keeps its
 * proportional pieces: there the flat is one whole and its size is the meaning.
 */
export function buildShowsDisks(
  c: Pick<Config, 'wholeIs' | 'pieces' | 'prebuilt' | 'exact'>,
): boolean {
  if (c.wholeIs === 'flat') return false;
  return (
    c.pieces.hundreds ||
    c.pieces.thousands ||
    (c.prebuilt?.hundreds ?? 0) > 0 ||
    (c.prebuilt?.thousands ?? 0) > 0 ||
    // Ten tens to be joined into a hundred that the tray never offers (pv.regroup).
    (c.exact?.hundreds ?? 0) > 0
  );
}

/** A mat of disks: at most DISK_COLUMN_MAX in a column (and nine thousands, as on any mat). */
export const MAT_MAX_DISKS: Readonly<Pieces> = {
  thousands: 9,
  hundreds: DISK_COLUMN_MAX,
  tens: DISK_COLUMN_MAX,
  ones: DISK_COLUMN_MAX,
};

/** The cap for an item's mat. */
export const matMax = (
  c: Pick<Config, 'wholeIs' | 'pieces' | 'prebuilt' | 'exact'>,
): Readonly<Pieces> =>
  c.wholeIs === 'flat' ? MAT_MAX_FLAT : buildShowsDisks(c) ? MAT_MAX_DISKS : MAT_MAX;

/**
 * The pieces of `value` taking as many of each `kinds` piece as fit, largest first (what a mat
 * needs at least when only those kinds may hold it).
 */
function greedyPieces(value: number, kinds: readonly PieceKind[]): Pieces {
  const out = emptyPieces();
  let rest = value;
  for (const k of kinds) {
    out[k] = Math.floor(rest / PIECE_VALUE[k]);
    rest -= out[k] * PIECE_VALUE[k];
  }
  return out;
}

/**
 * Where an item needs more pieces of a kind on the mat than its cap (matMax): the prebuilt pieces
 * plus what a limited tray can add, the `exact` counts and the fewest pieces the rest needs, and the
 * target's own pieces. (An unlimited tray is bounded by the widget, which never lets a move
 * overfill the mat.)
 */
export function overfullKinds(c: Config): { kind: PieceKind; path: string[]; need: number }[] {
  const out: { kind: PieceKind; path: string[]; need: number }[] = [];
  const cap = matMax(c);
  const over = (kind: PieceKind, need: number, path: string[]) => {
    if (need > cap[kind]) out.push({ kind, path, need });
  };
  const pre: Partial<Pieces> = c.prebuilt ?? {};
  for (const k of PIECE_KINDS) {
    const supply = traySupply(c, emptyPieces(), k);
    const limited = c.mode !== 'read' && Number.isFinite(supply) ? supply : 0;
    over(k, (pre[k] ?? 0) + limited, limited > 0 ? ['limits', k] : ['prebuilt', k]);
  }
  // A read draws its prebuilt pieces (already checked worth the target): only builds need the
  // target's own pieces to fit.
  if (c.mode !== 'read') {
    const target = canonicalPieces(c.target);
    for (const k of PIECE_KINDS) over(k, target[k], ['target']);
  }
  if (c.mode === 'build-exact') {
    const exact = c.exact ?? {};
    const named = (['hundreds', 'tens', 'ones'] as const).filter((k) => exact[k] !== undefined);
    for (const k of named) over(k, exact[k] ?? 0, ['exact', k]);
    const free = PIECE_KINDS.filter((k) => k === 'thousands' || exact[k] === undefined);
    const rest = greedyPieces(Math.max(0, c.target - piecesValue(exact)), free);
    for (const k of free) over(k, rest[k], ['exact']);
  }
  return out;
}

/** The largest target of an item: what a mat full to its cap (matMax) is worth, in ones. */
export const targetMax = (c: Pick<Config, 'wholeIs' | 'pieces' | 'prebuilt' | 'exact'>): number =>
  piecesValue(matMax(c));

/**
 * The supported domain (PR #74): every number of a config has a bound, whatever the mode reads.
 * `target` is at most a full mat (targetMax; a build's own pieces cap it at 9999 below), and each
 * `limits` and `exact` count is at most its kind's cap (matMax), also in a mode that ignores it.
 * `prebuilt` counts are capped by overfullKinds in every mode.
 */
export function domainIssues(c: Config): { path: string[]; message: string }[] {
  const out: { path: string[]; message: string }[] = [];
  const cap = matMax(c);
  if (c.target > targetMax(c)) {
    out.push({
      path: ['target'],
      message: `target is at most ${targetMax(c)} (a full mat); got ${c.target}`,
    });
  }
  for (const field of ['limits', 'exact'] as const) {
    const counts: Partial<Pieces> = c[field] ?? {};
    for (const k of PIECE_KINDS) {
      const n = counts[k];
      if (n !== undefined && n > cap[k]) {
        out.push({
          path: [field, k],
          message: `${field}.${k} is at most ${cap[k]} (what the mat fits); got ${n}`,
        });
      }
    }
  }
  return out;
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
  const domain = domainIssues(c);
  for (const d of domain) ctx.addIssue({ code: 'custom', ...d });
  if (domain.length > 0) return;
  for (const o of overfullKinds(c)) {
    ctx.addIssue({
      code: 'custom',
      path: o.path,
      message: `the mat would need ${o.need} ${o.kind}; it fits at most ${matMax(c)[o.kind]}`,
    });
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
