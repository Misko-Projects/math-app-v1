// 03 §5.5 area-tiles. A region of grid cells (`mask`, row-major '1'/'0', w × h).
// - `tile`: the child covers the region with unit squares (`place-tile {r, c, remove?}`,
//   `fill-row {r}`) and types the area; answers state `{ tiles, value }` (`tiles.cover`), where
//   `tiles` is a row-major '1'/'0' string like the mask. A cell holds one tile at most.
// - `count`, `multiply`: answer the typed number.
// - `decompose` (MEA.13, MUL.19): the child draws full-length split lines (`draw-split {at, dir}`,
//   `dir` 'v' after column `at` or 'h' after row `at`; drawing a line again erases it) and types
//   the total; answers state `{ splits, value }` (`tiles.cover` with `decompose`): every piece is a
//   rectangle.
// - `partition` (GEO.04): the child draws row and column lines; answers state `{ rows, cols }`
//   (`array.dims`): the strips the lines make.
// `label-side {side}` marks a side length as labelled (visual).

import { type AnswerSpec, areaTilesConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import {
  argNumber,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'area-tiles'>;

export interface Split {
  dir: 'v' | 'h';
  at: number;
}

export interface AreaTilesState extends FormatState<'area-tiles'> {
  /** Row-major tile flags, one per cell. */
  tiles: boolean[];
  /** Split lines, in the order drawn. */
  splits: Split[];
  labelled: string[];
  value: number | null;
}

/** The area of a mask: its '1' cells. */
export const maskArea = (mask: string): number => mask.split('').filter((x) => x === '1').length;

/** Whether the mask fills its whole w × h box. */
export const isRectangle = (mask: string): boolean => !mask.includes('0');

/**
 * The pieces full-length split lines cut a region into: connected groups of region cells that
 * no line separates, each as its list of [r, c] cells.
 */
export function regionPieces(
  w: number,
  h: number,
  mask: string,
  splits: readonly Split[],
): [number, number][][] {
  const inRegion = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < h && c < w && mask[r * w + c] === '1';
  const vLines = new Set(splits.filter((s) => s.dir === 'v').map((s) => s.at));
  const hLines = new Set(splits.filter((s) => s.dir === 'h').map((s) => s.at));
  const seen = new Set<number>();
  const pieces: [number, number][][] = [];
  for (let r0 = 0; r0 < h; r0 += 1) {
    for (let c0 = 0; c0 < w; c0 += 1) {
      if (!inRegion(r0, c0) || seen.has(r0 * w + c0)) continue;
      const piece: [number, number][] = [];
      const stack: [number, number][] = [[r0, c0]];
      seen.add(r0 * w + c0);
      while (stack.length > 0) {
        const [r, c] = stack.pop() as [number, number];
        piece.push([r, c]);
        const next: [number, number, boolean][] = [
          [r, c + 1, !vLines.has(c + 1)],
          [r, c - 1, !vLines.has(c)],
          [r + 1, c, !hLines.has(r + 1)],
          [r - 1, c, !hLines.has(r)],
        ];
        for (const [nr, nc, open] of next) {
          if (open && inRegion(nr, nc) && !seen.has(nr * w + nc)) {
            seen.add(nr * w + nc);
            stack.push([nr, nc]);
          }
        }
      }
      pieces.push(piece);
    }
  }
  return pieces;
}

/** Whether a piece's cells fill their bounding box (the piece is a rectangle). */
export function isRectPiece(cells: readonly [number, number][]): boolean {
  const rs = cells.map(([r]) => r);
  const cs = cells.map(([, c]) => c);
  const box = (Math.max(...rs) - Math.min(...rs) + 1) * (Math.max(...cs) - Math.min(...cs) + 1);
  return box === cells.length;
}

const configSchema = areaTilesConfigSchema.superRefine((c, ctx) => {
  if (maskArea(c.region.mask) === 0) {
    ctx.addIssue({ code: 'custom', path: ['region', 'mask'], message: 'the region is empty' });
  }
  if ((c.mode === 'multiply' || c.mode === 'partition') && !isRectangle(c.region.mask)) {
    ctx.addIssue({
      code: 'custom',
      path: ['region', 'mask'],
      message: `${c.mode} needs a rectangle`,
    });
  }
  if ((c.mode === 'decompose' || c.mode === 'partition') && maskArea(c.region.mask) < 2) {
    ctx.addIssue({ code: 'custom', path: ['region'], message: 'a 1 × 1 region cannot be split' });
  }
  if (c.decimalGrid && (c.region.w !== 10 || c.region.h !== 10)) {
    ctx.addIssue({
      code: 'custom',
      path: ['decimalGrid'],
      message: 'the decimal grid is 10 × 10',
    });
  }
});

export const areaTiles: FormatModel<'area-tiles', AreaTilesState> = {
  format: 'area-tiles',
  configSchema,
  features: {
    area: { weight: 0.25, doc: '(area − 1) / 10' },
    'grid.off': { weight: 0.5, doc: 'no grid lines inside the region' },
    rectilinear: { weight: 0.7, doc: 'the region is not a rectangle' },
    'mode.multiply': { weight: 0.5, doc: 'multiply mode (side lengths, no tiles)' },
    'side.over5': { weight: 0.3, doc: 'a side is longer than 5' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      area: Math.max(0, maskArea(c.region.mask) - 1) / 10,
      'grid.off': c.gridShown ? 0 : 1,
      rectilinear: isRectangle(c.region.mask) ? 0 : 1,
      'mode.multiply': c.mode === 'multiply' ? 1 : 0,
      'side.over5': Math.max(c.region.w, c.region.h) > 5 ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    tiles: new Array<boolean>(config.region.w * config.region.h).fill(false),
    splits: [],
    labelled: [],
    value: null,
  }),
  apply(s, a) {
    const { w, h, mask } = s.config.region;
    const inRegion = (r: number, c: number) =>
      Number.isInteger(r) &&
      Number.isInteger(c) &&
      r >= 0 &&
      c >= 0 &&
      r < h &&
      c < w &&
      mask[r * w + c] === '1';
    switch (a.op) {
      case 'place-tile': {
        const r = argNumber(a, 'r') ?? -1;
        const c = argNumber(a, 'c') ?? -1;
        if (!inRegion(r, c)) return s;
        const tiles = [...s.tiles];
        tiles[r * w + c] = a.args?.remove !== true;
        return { ...s, tiles };
      }
      case 'fill-row': {
        const r = argNumber(a, 'r') ?? -1;
        if (!Number.isInteger(r) || r < 0 || r >= h) return s;
        const tiles = [...s.tiles];
        for (let c = 0; c < w; c += 1) if (inRegion(r, c)) tiles[r * w + c] = true;
        return { ...s, tiles };
      }
      case 'draw-split': {
        const at = argNumber(a, 'at') ?? 0;
        const dir = argString(a, 'dir') === 'h' ? 'h' : 'v';
        const limit = dir === 'v' ? w : h;
        if (!Number.isInteger(at) || at < 1 || at >= limit) return s;
        const has = s.splits.some((x) => x.dir === dir && x.at === at);
        const splits = has
          ? s.splits.filter((x) => !(x.dir === dir && x.at === at))
          : [...s.splits, { dir, at } as Split];
        return { ...s, splits };
      }
      case 'label-side': {
        const side = argString(a, 'side') ?? String(argNumber(a, 'side') ?? '');
        if (side === '' || s.labelled.includes(side)) return s;
        return { ...s, labelled: [...s.labelled, side] };
      }
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('area-tiles', a.op);
    }
  },
  toResponse(s) {
    switch (s.config.mode) {
      case 'count':
      case 'multiply':
        return s.value === null ? null : { kind: 'number', value: s.value };
      case 'tile':
        if (s.value === null) return null;
        return {
          kind: 'state',
          value: { tiles: s.tiles.map((t) => (t ? '1' : '0')).join(''), value: s.value },
        };
      case 'decompose':
        if (s.value === null) return null;
        return {
          kind: 'state',
          value: { splits: s.splits.map((x) => ({ ...x })), value: s.value },
        };
      case 'partition': {
        if (s.splits.length === 0) return null;
        const rows = 1 + s.splits.filter((x) => x.dir === 'h').length;
        const cols = 1 + s.splits.filter((x) => x.dir === 'v').length;
        return { kind: 'state', value: { rows, cols } };
      }
    }
  },
};
