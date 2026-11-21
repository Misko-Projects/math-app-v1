import { type FormatState, formatModel } from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import type { ConfigFor } from '../types';

/**
 * Pure board logic for the tenframe-fill widget. The engine model (`formatModel('tenframe-fill')`)
 * owns the cells (0 empty, 1 colour a, 2 colour b, reading order per frame); this module adds what
 * only the widget needs: which counter (`counter-<i>`, engine README) sits in which cell, so a
 * counter keeps its identity while it moves, and the moves a demo op makes, for the flights.
 */

type Config = ConfigFor<'tenframe-fill'>;
type State = FormatState<'tenframe-fill'>;

export const EMPTY = 0;
export const COLOR_A = 1;
export const COLOR_B = 2;

export interface Cell {
  frame: number;
  index: number;
}

export interface Board {
  /** The model's cells: one array per frame. */
  cells: number[][];
  /** The counter index in each cell (null when empty). */
  ids: (number | null)[][];
}

/** One counter moving: from the tray or a cell, to the tray or a cell. */
export interface Move {
  id: number;
  from: Cell | 'tray';
  to: Cell | 'tray';
  color: number;
}

function model() {
  const m = formatModel('tenframe-fill');
  if (!m) throw new Error('tenframe-fill has no format model');
  return m;
}

/** The cells of a model state, read back through `toResponse` (the model's public shape). */
export function cellsOf(state: State): number[][] {
  const r = model().toResponse(state);
  const cells = r?.kind === 'state' ? (r.value.cells as number[][] | undefined) : undefined;
  return (cells ?? []).map((f) => [...f]);
}

/** A model state holding `cells` (the model's own state field, the same as its `cells` output). */
function stateWith(config: Config, cells: number[][]): State {
  const s = { ...model().initialState(config), cells: cells.map((f) => [...f]) };
  return s;
}

export function initialBoard(config: Config): Board {
  const cells = cellsOf(model().initialState(config));
  let next = 0;
  const ids = cells.map((f) => f.map((c) => (c === EMPTY ? null : next++)));
  return { cells, ids };
}

export const total = (cells: number[][]) =>
  cells.reduce((sum, f) => sum + f.filter((c) => c !== EMPTY).length, 0);

/** Counters the item starts with (they are `counter-0 …`, the first addend). */
export const prefilledCount = (config: Config) => total(initialBoard(config).cells);

export const capacity = (config: Config) => config.frames * config.size;

/**
 * The tray's colour: colour b when the frames already hold counters (the second addend, "one more",
 * the missing part), so what the child adds stays distinct from what was given; otherwise colour a.
 */
export const trayColor = (config: Config) => (prefilledCount(config) > 0 ? COLOR_B : COLOR_A);

/** How many counters the tray holds: `b` for `add` (03 §5.5), else every free cell. */
/**
 * Make ten on two frames (ADD.08, CPS.11): both groups are given, and the child moves counters from
 * frame 2 into frame 1 until it is full; the total stays the same (tenframe.makeTen), so there is
 * no tray, and frame 2's counters move between frames (frame 1's given ones stay locked).
 */
export const movesCounters = (config: Config) => config.goal === 'make-ten' && config.frames === 2;

export function supplySize(config: Config): number {
  if (movesCounters(config)) return 0;
  const free = capacity(config) - prefilledCount(config);
  if (config.goal === 'add') return Math.max(0, Math.min(config.b ?? 0, free));
  // Taking away starts with an empty tray: the counters the child takes off land in it.
  if (!prefilledLocked(config)) return 0;
  return Math.max(0, free);
}

/**
 * Prefilled counters are locked (the given addend), except when the goal is to take counters
 * away (`subtract`, `one-less`), where the child removes them.
 */
export const prefilledLocked = (config: Config) =>
  config.goal !== 'subtract' && config.goal !== 'one-less';

/** The first empty cell in the standard fill order (frame 0 top row, left to right, then on). */
export function firstEmpty(cells: number[][]): Cell | null {
  for (let frame = 0; frame < cells.length; frame++) {
    const index = (cells[frame] ?? []).indexOf(EMPTY);
    if (index >= 0) return { frame, index };
  }
  return null;
}

export function idAt(board: Board, cell: Cell): number | null {
  return board.ids[cell.frame]?.[cell.index] ?? null;
}

export function cellOf(board: Board, id: number): Cell | null {
  for (let frame = 0; frame < board.ids.length; frame++) {
    const index = (board.ids[frame] ?? []).indexOf(id);
    if (index >= 0) return { frame, index };
  }
  return null;
}

function setCell(board: Board, cell: Cell, color: number, id: number | null): Board {
  const cells = board.cells.map((f) => [...f]);
  const ids = board.ids.map((f) => [...f]);
  const row = cells[cell.frame];
  const idRow = ids[cell.frame];
  if (!row || !idRow || cell.index < 0 || cell.index >= row.length) return board;
  row[cell.index] = color;
  idRow[cell.index] = id;
  return { cells, ids };
}

/**
 * Puts counter `id` in `cell`. With the standard fill order required, the counter goes to the
 * first empty cell instead, wherever it was dropped (03 §5.5 `requireStandardFill`).
 */
export function placeCounter(
  board: Board,
  cell: Cell,
  id: number,
  color: number,
  standard: boolean,
): Board {
  const at = standard ? firstEmpty(board.cells) : cell;
  if (!at || board.cells[at.frame]?.[at.index] !== EMPTY) return board;
  return setCell(board, at, color, id);
}

/** Takes counter `id` off the frames (back to the tray). */
export function removeCounter(board: Board, id: number): Board {
  const at = cellOf(board, id);
  return at ? setCell(board, at, EMPTY, null) : board;
}

/**
 * Applies a demo op (`place`, `remove`, `move-counters`) through the engine model and works out
 * which counters move where: the model decides the cells, this pairs them with counter ids.
 * Counters leaving cells pair with counters arriving (a move); extra arrivals come from `trayIds`
 * in order (then fresh ids), extra departures go back to the tray.
 */
export function applyOp(
  config: Config,
  board: Board,
  action: WidgetAction,
  trayIds: readonly number[],
): { board: Board; moves: Move[] } {
  const after = cellsOf(model().apply(stateWith(config, board.cells), action));
  const left: Cell[] = [];
  const arrived: Cell[] = [];
  board.cells.forEach((f, frame) => {
    f.forEach((before, index) => {
      const now = after[frame]?.[index] ?? EMPTY;
      if (before !== EMPTY && now !== before) left.push({ frame, index });
      if (now !== EMPTY && now !== before) arrived.push({ frame, index });
    });
  });
  let fresh = Math.max(-1, ...board.ids.flat().map((x) => x ?? -1), ...trayIds) + 1;
  const tray = [...trayIds];
  const moves: Move[] = [];
  const pairs = Math.min(left.length, arrived.length);
  for (let i = 0; i < pairs; i++) {
    const from = left[i] as Cell;
    const to = arrived[i] as Cell;
    moves.push({
      id: idAt(board, from) ?? fresh++,
      from,
      to,
      color: after[to.frame]?.[to.index] ?? 0,
    });
  }
  for (const to of arrived.slice(pairs)) {
    moves.push({
      id: tray.shift() ?? fresh++,
      from: 'tray',
      to,
      color: after[to.frame]?.[to.index] ?? 0,
    });
  }
  for (const from of left.slice(pairs)) {
    moves.push({ id: idAt(board, from) ?? fresh++, from, to: 'tray', color: 0 });
  }
  return { board: applyMoves(board, moves), moves };
}

/** The board after `moves` (all departures first, then arrivals). */
export function applyMoves(board: Board, moves: readonly Move[]): Board {
  let b = board;
  for (const m of moves) if (m.from !== 'tray') b = setCell(b, m.from, EMPTY, null);
  for (const m of moves) if (m.to !== 'tray') b = setCell(b, m.to, m.color, m.id);
  return b;
}

/** The widget's response, through the model: the cells, plus `value` when `thenAsk` is set. */
export function responseFor(
  config: Config,
  cells: number[][],
  value: number | null,
): ResponseValue | null {
  let s = stateWith(config, cells);
  if (value !== null) s = model().apply(s, { op: 'answer', args: { value } });
  return model().toResponse(s);
}

export const cellId = (c: Cell) => `cell-${c.frame}-${c.index}`;
export const counterId = (id: number) => `counter-${id}`;

export function parseCell(target: string): Cell | null {
  const m = /^cell-(\d+)-(\d+)$/.exec(target);
  return m ? { frame: Number(m[1]), index: Number(m[2]) } : null;
}
