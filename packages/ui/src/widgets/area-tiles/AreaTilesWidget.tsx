import { type AreaTilesState, areaAnswerMax, formatModel } from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  AskEntry,
  AskStep,
  buildRoom,
  COMPACT_ROOM_H,
  demoEnterAnswer,
  nextPadKey,
  PadArrowIcon,
  type PadButton,
  type PadKey,
  roomBox,
  type Step,
  StepActions,
  type StepCue,
  type SurfacePoint,
  useActionSize,
  useAlive,
  useDemoPause,
  useInviteHand,
  useModelState,
  useSubmitGuard,
  useSurfacePointer,
  useTwoStep,
  useWidgetRoom,
  WorkPanel,
  type WorkPlan,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { FillRowIcon, LineAcrossIcon, LineDownIcon, TilesIcon } from './icons';
import {
  arrowToward,
  askPlanFor,
  boxGridSegments,
  cellsBetween,
  type Dir,
  firstLine,
  innerGridSegments,
  inRegion,
  LABEL,
  type Line,
  labelled,
  lineFromStroke,
  lineNear,
  nextCell,
  nextLine,
  outlineSegments,
  picturePlan,
  regionCells,
  rowCounts,
  type Segment,
  splitSegments,
  worked,
  workPlan,
} from './layout';
import './area-tiles.css';

/**
 * `area-tiles` (03 §5.5): a region of unit squares (`mask`, rectilinear shapes allowed), every
 * square one size, drawn true to the grid: tiles cover their squares exactly.
 *
 * The region is a picture: its squares are too small to be targets in the short widget area
 * (06 §1, §4). A child works through the kit's grid work parts: the pad's full-size buttons
 * (also the keyboard path), and the region as ONE surface for a finger.
 *
 * - **tile** (two steps, kit `twoStep`): a cursor marks one square. The arrows move it; "Tile
 *   here" lays a tile there or takes it back; "Fill this row" lays the cursor's whole row. A
 *   finger dragged over the region lays a tile on every square it crosses; a tap lays one, and a
 *   tap on a tile takes it back. Squares without a tile stay bare. Then Next, and the picture
 *   beside the kit `NumberEntry`, Back and Check: `{ tiles, value }`.
 * - **count**, **multiply**: the region as a picture (its grid, or its side lengths in 32 px
 *   numerals) beside the `NumberEntry` and Check (the ask step alone).
 * - **decompose** (MEA.13, two steps) and **partition** (GEO.04, Check on the same step): a
 *   cursor marks one grid line. Left and right step through the up-and-down lines, up and down
 *   through the lines across; "Line here" draws the line or erases it. A finger's stroke along
 *   the region draws (or erases) the nearest line of its direction; a tap moves the cursor.
 *   `{ splits, value }`, or `{ rows, cols }`.
 *
 * Trace targets: `pad-up`, `pad-down`, `pad-left`, `pad-right`, `pad-tile`, `pad-row`,
 * `pad-cut`; `surface` (a drag began); `cell-<r>-<c>` (a tile laid by a tap, or where a drag
 * ended), `tile-<r>-<c>` (a tile taken back by a tap); `line-<v|h>-<at>` (a line drawn or erased
 * by a stroke, or the cursor moved by a tap); `picture` (a tap on the ask step's picture);
 * `next`, `back`, `opt-<n>` and `key-<k>`.
 *
 * Demo ops: `place-tile {r, c, remove?}`, `fill-row {r}` (the row fills square by square),
 * `draw-split {at, dir}`, `label-side {side}` (the side length lights up and is spoken), plus
 * `answer {value}`.
 */

type Config = ConfigFor<'area-tiles'>;
type State = AreaTilesState;
type Side = 'top' | 'left';

const OPS: readonly string[] = [...FORMAT_SUPPORT['area-tiles'].ops, 'answer'];

function stateModel() {
  const m = formatModel('area-tiles');
  if (!m) throw new Error('area-tiles has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

const STEP_MS = 160;
const HOLD_MS = 500;

const NOTE = { row: 'ui.widget.at.note.row' } as const satisfies Record<string, NarrationKey>;
const ARROW_LABEL: Record<Dir, NarrationKey> = {
  up: 'ui.widget.at.pad.up',
  down: 'ui.widget.at.pad.down',
  left: 'ui.widget.at.pad.left',
  right: 'ui.widget.at.pad.right',
};
const LEN_KEY: Partial<Record<Config['unit'], NarrationKey>> = {
  'sq-cm': 'ui.widget.at.len.sq-cm',
  'sq-m': 'ui.widget.at.len.sq-m',
  'sq-in': 'ui.widget.at.len.sq-in',
  'sq-ft': 'ui.widget.at.len.sq-ft',
};

interface Note {
  key: NarrationKey;
  cue: string | null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);
const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
const sideOf = (side: unknown): Side | null =>
  side === 'top' || side === 'w' ? 'top' : side === 'left' || side === 'h' ? 'left' : null;
const lineId = (l: Line) => `line-${l.dir}-${l.at}`;

export function AreaTilesWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const prefs = useUiPreferences();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const mode = config.mode;
  const region = config.region;
  const working = worked(mode);
  const tiling = mode === 'tile';
  const lining = mode === 'decompose' || mode === 'partition';
  const answerMax = areaAnswerMax(config);
  const cells = useMemo(() => regionCells(region), [region]);

  const { state, stateRef, act, applyOp, committed } = useModelState<State>(
    () => initial(config),
    applyAction,
  );
  const [value, setValueState] = useState<number | null>(null);
  const valueRef = useRef<number | null>(null);
  const setValue = (v: number | null) => {
    valueRef.current = v;
    setValueState(v);
  };
  const [busy, setBusy] = useState(false);
  const [entryHighlight, setEntryHighlight] = useState<number | PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [lit, setLit] = useState<Side | null>(null);
  // The cursors the arrows move: one square (tile), or one grid line (decompose, partition).
  const [cell, setCellState] = useState<[number, number]>(() => cells[0] ?? [0, 0]);
  const cellRef = useRef(cell);
  const setCell = (c: [number, number]) => {
    cellRef.current = c;
    setCellState(c);
  };
  const [line, setLineState] = useState<Line | null>(() => firstLine(region));
  const lineRef = useRef(line);
  const lastAt = useRef<{ v: number | null; h: number | null }>({ v: null, h: null });
  const setLine = (l: Line) => {
    lineRef.current = l;
    lastAt.current = { ...lastAt.current, [l.dir]: l.at };
    setLineState(l);
  };
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = !disabled && !busy;

  /** A child step clears the demo's invite and the last limit note. */
  const childStep = () => {
    setInvite(null);
    setNote(null);
  };
  const limit = (key: NarrationKey, cue: string | null) => {
    setNote({ key, cue });
    say(key);
  };

  const steps = useTwoStep(rootRef, {
    interactive,
    trace,
    guard: () => {
      childStep();
      return true;
    },
  });
  // A picture to read has nothing to work on; a partition has nothing to type.
  const step: Step = !working ? 'ask' : mode === 'partition' ? 'build' : steps.step;

  // ---------- layout: the measured room, the action button, the two plans ----------

  const room = useWidgetRoom(rootRef);
  const box = roomBox(room);
  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const ageMode = prefs.ageMode;
  const button = useActionSize(actRef, zoomRef, ageMode);
  const shape = useMemo(
    () => ({ mode, region, sideLabels: config.sideLabels }),
    [mode, region, config.sideLabels],
  );
  const plan = useMemo(
    () => workPlan(shape, buildRoom({ w: box.w, h: box.h }, button), ageMode),
    [shape, box.w, box.h, button, ageMode],
  );
  const askPlan = useMemo(
    () => askPlanFor(shape, answerMax, { w: box.w, h: box.h }, button, ageMode),
    [shape, answerMax, box.w, box.h, button, ageMode],
  );
  const picture = askPlan.picture ? picturePlan(shape, askPlan.picture, ageMode) : null;
  const labelRoom = labelled(shape) ? LABEL : { top: 0, left: 0 };

  // ---------- child input ----------

  const speak = (key: NarrationKey) => {
    if (prefs.speakOnTap) say(key);
  };
  const tiled = (s: State, r: number, c: number) => s.tiles[r * region.w + c] === true;

  const hasLine = (s: State, l: Line) => s.splits.some((x) => x.dir === l.dir && x.at === l.at);
  /** Lays a tile on (r, c), or takes it back. */
  const setTile = (r: number, c: number, on: boolean) =>
    act({ op: 'place-tile', args: on ? { r, c } : { r, c, remove: true } });
  /** Draws the line, or erases it (the model's `draw-split` toggles). */
  const toggleLine = (l: Line) => {
    setLine(l);
    act({ op: 'draw-split', args: { at: l.at, dir: l.dir } });
  };

  const onArrow = (dir: Dir) => {
    if (tiling) {
      const next = nextCell(region, cellRef.current[0], cellRef.current[1], dir);
      if (next) setCell(next);
      return;
    }
    const cur = lineRef.current;
    const next = cur ? nextLine(region, cur, dir, lastAt.current) : null;
    if (next) setLine(next);
  };
  const onPad = (id: string) => {
    if (!interactive) return;
    childStep();
    trace('tap', `pad-${id}`);
    const s = stateRef.current;
    const [r, c] = cellRef.current;
    switch (id) {
      case 'tile':
        setTile(r, c, !tiled(s, r, c));
        break;
      case 'row': {
        const full = cells.every(([rr, cc]) => rr !== r || tiled(s, rr, cc));
        // A full row may be part of the answer: the note stands alone.
        if (full) limit(NOTE.row, null);
        else act({ op: 'fill-row', args: { r } });
        break;
      }
      case 'cut':
        if (lineRef.current) toggleLine(lineRef.current);
        break;
      default:
        onArrow(id as Dir);
    }
  };

  /** Where the squares start inside the surface. */
  const origin = {
    x: (plan.board.w - region.w * plan.cell - labelRoom.left) / 2 + labelRoom.left,
    y: (plan.board.h - region.h * plan.cell - labelRoom.top) / 2 + labelRoom.top,
  };
  const local = (p: SurfacePoint) => ({ x: p.x - origin.x, y: p.y - origin.y });
  /** The region square under a point of the surface (null: outside the region). */
  const cellUnder = (p: SurfacePoint): [number, number] | null => {
    const { x, y } = local(p);
    const r = Math.floor(y / plan.cell);
    const c = Math.floor(x / plan.cell);
    return inRegion(region, r, c) ? [r, c] : null;
  };
  /**
   * A dragging finger lays a tile on every square it crossed since its last sample (a fast
   * stroke skips none), and on the one under it; that square, if it is in the region.
   */
  const lastPoint = useRef<SurfacePoint | null>(null);
  const paint = (p: SurfacePoint): [number, number] | null => {
    const from = lastPoint.current ?? p;
    lastPoint.current = p;
    for (const [r, c] of cellsBetween(region, local(from), local(p), plan.cell)) {
      setTile(r, c, true);
    }
    const at = cellUnder(p);
    if (at) setCell(at);
    return at;
  };
  const dragging = useRef(false);
  const startDrag = () => {
    if (dragging.current) return;
    dragging.current = true;
    trace('drag', 'surface');
  };
  const surface = useSurfacePointer({
    enabled: interactive && step === 'build' && working,
    drag: !prefs.tapOnly,
    onDown: (p) => {
      childStep();
      dragging.current = false;
      lastPoint.current = p;
    },
    onMove: (p, from) => {
      startDrag();
      if (tiling) {
        paint(p);
        return;
      }
      const l = lineFromStroke(region, local(from), local(p), plan.cell);
      if (l) setLine(l);
    },
    onUp: (p, from, moved) => {
      if (tiling) {
        if (moved) {
          startDrag();
          const at = paint(p);
          trace('drop', at ? `cell-${at[0]}-${at[1]}` : 'surface');
          return;
        }
        const at = cellUnder(p);
        if (!at) return;
        const on = !tiled(stateRef.current, at[0], at[1]);
        setCell(at);
        setTile(at[0], at[1], on);
        trace('tap', `${on ? 'cell' : 'tile'}-${at[0]}-${at[1]}`);
        if (on) speak('ui.widget.at.tile');
        return;
      }
      if (moved) {
        startDrag();
        const l = lineFromStroke(region, local(from), local(p), plan.cell);
        if (l) toggleLine(l);
        trace('drop', l ? lineId(l) : 'surface');
        return;
      }
      const l = lineNear(region, local(p), plan.cell);
      if (!l) return;
      setLine(l);
      trace('tap', lineId(l));
    },
  });

  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    let s = stateRef.current;
    if (step === 'ask') {
      const v = valueRef.current;
      if (v === null) return false;
      s = applyAction(s, { op: 'answer', args: { value: v } });
    }
    const response = model.toResponse(s);
    if (!response) return false;
    onResponse(response);
    return true;
  });
  const ready = step === 'ask' ? value !== null : model.toResponse(state) !== null;

  // ---------- demo ----------

  const showStep = async (s: Step) => {
    if (!working || mode === 'partition' || steps.step === s) return;
    steps.show(s);
    await committed();
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setBusy(true);
      setInvite(null);
      setNote(null);
      try {
        switch (action.op) {
          case 'place-tile': {
            await showStep('build');
            const r = num(action.args?.r);
            const c = num(action.args?.c);
            if (r !== null && c !== null && inRegion(region, r, c)) setCell([r, c]);
            await applyOp(action);
            await pause(STEP_MS);
            break;
          }
          case 'fill-row': {
            await showStep('build');
            const r = num(action.args?.r);
            for (const [rr, cc] of cells) {
              if (rr !== r || tiled(stateRef.current, rr, cc)) continue;
              setCell([rr, cc]);
              await applyOp({ op: 'place-tile', args: { r: rr, c: cc } });
              await pause(STEP_MS);
              if (!alive.current) return;
            }
            await applyOp(action);
            break;
          }
          case 'draw-split': {
            await showStep('build');
            const at = num(action.args?.at);
            const dir = action.args?.dir === 'h' ? 'h' : 'v';
            if (at !== null && at >= 1 && at < (dir === 'v' ? region.w : region.h)) {
              setLine({ dir, at });
            }
            await applyOp(action);
            await pause(HOLD_MS);
            break;
          }
          case 'label-side': {
            const side = sideOf(action.args?.side);
            await applyOp(action);
            if (side) {
              setLit(side);
              sayNumber(side === 'top' ? region.w : region.h);
              await pause(HOLD_MS);
              await committed();
              if (alive.current) setLit(null);
            }
            break;
          }
          case 'answer': {
            const v = Number(action.args?.value);
            if (mode !== 'partition') {
              await showStep('ask');
              if (Number.isFinite(v)) {
                await demoEnterAnswer(v, {
                  plan: askPlan,
                  valueRef,
                  set: setValue,
                  highlight: setEntryHighlight,
                  pause,
                  alive,
                });
              }
            }
            if (alive.current) await applyOp(action);
            break;
          }
        }
      } finally {
        setEntryHighlight(null);
        if (alive.current) {
          setBusy(false);
          await committed();
        }
      }
    },
    invite: (action) => {
      setNote(null);
      setInvite(action);
    },
  });

  // The one ring: a demo invite's control, else the control a limit note points at. A control on
  // the other step is reached through Next or Back.
  const inviteCue = ((): { cue: string; value?: number } | null => {
    if (!invite) return null;
    const onBuild = (cue: string) => (step === 'build' ? { cue } : { cue: 'back' });
    /**
     * The arrow that moves the square cursor toward (r, c), or `at` when it is there. Every
     * arrow given moves the cursor (a route round a notch starts sideways). A row is reached at
     * its nearest square.
     */
    const toward = (r: number, c: number | null, at: string) => {
      if (cell[0] === r && (c === null || cell[1] === c)) return onBuild(at);
      const goals = c === null ? cells.filter(([rr]) => rr === r) : [[r, c] as [number, number]];
      const goal = goals.sort((a, b) => Math.abs(a[1] - cell[1]) - Math.abs(b[1] - cell[1]))[0];
      const dir = goal ? arrowToward(region, cell, goal) : null;
      return dir ? onBuild(`pad-${dir}`) : null;
    };
    switch (invite.op) {
      case 'place-tile': {
        const r = num(invite.args?.r);
        const c = num(invite.args?.c);
        if (!tiling || r === null || c === null || !inRegion(region, r, c)) return null;
        return toward(r, c, 'pad-tile');
      }
      case 'fill-row': {
        const r = num(invite.args?.r);
        if (!tiling || r === null || r < 0 || r >= region.h) return null;
        return toward(r, null, 'pad-row');
      }
      case 'draw-split': {
        const at = num(invite.args?.at);
        const dir = invite.args?.dir === 'h' ? 'h' : 'v';
        if (!lining || at === null || !line) return null;
        if (line.dir !== dir) return onBuild(dir === 'v' ? 'pad-right' : 'pad-down');
        if (line.at === at) return onBuild('pad-cut');
        const back = at < line.at;
        return onBuild(
          dir === 'v' ? (back ? 'pad-left' : 'pad-right') : back ? 'pad-up' : 'pad-down',
        );
      }
      case 'answer': {
        if (mode === 'partition') return { cue: 'check' };
        if (step === 'build') return { cue: 'next' };
        const v = Number(invite.args?.value);
        return Number.isFinite(v) ? { cue: 'entry-value', value: v } : { cue: 'entry' };
      }
      default:
        return null;
    }
  })();
  const ring = inviteCue?.cue ?? (step === 'build' ? (note?.cue ?? null) : null);
  const stepCue = (['next', 'back', 'check'] as const).find((c) => ring === c) ?? null;
  const invitedEntry: number | PadKey | null =
    inviteCue?.cue === 'entry-value' && inviteCue.value !== undefined
      ? askPlan.entry?.kind === 'tray'
        ? inviteCue.value
        : nextPadKey(inviteCue.value, value)
      : null;
  const handKey = inviteCue ? `${step}:${inviteCue.cue}:${invitedEntry ?? ''}` : '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => {
      if (!inviteCue) return null;
      if (inviteCue.cue === 'entry-value') {
        return root.querySelector<HTMLElement>('.ni-entry .ni-invite');
      }
      return root.querySelector<HTMLElement>(`[data-cue="${inviteCue.cue}"]`);
    },
    handKey,
  );

  // ---------- render ----------

  const tileCount = state.tiles.filter(Boolean).length;
  const squareWords = (r: number, c: number) =>
    t('ui.widget.at.where.square', { r: r + 1, c: c + 1 });
  const lineWords = (l: Line) =>
    t(l.dir === 'v' ? 'ui.widget.at.where.line-v' : 'ui.widget.at.where.line-h', { n: l.at });
  /** The region in words: what a sighted child can count. */
  const regionLabel = [
    t(working && step === 'build' ? `ui.widget.at.board.${mode}` : 'ui.widget.picture'),
    ...(config.decimalGrid ? [t('ui.widget.at.whole')] : []),
    ...rowCounts(region).map((n, i) => t('ui.widget.at.count.row', { i: i + 1, n })),
    ...(tiling
      ? [
          t(tileCount === 1 ? 'ui.widget.at.count.tile' : 'ui.widget.at.count.tiles', {
            n: tileCount,
          }),
        ]
      : []),
    ...(lining
      ? [
          t(state.splits.length === 1 ? 'ui.widget.at.count.line' : 'ui.widget.at.count.lines', {
            n: state.splits.length,
          }),
          ...state.splits.map((s) => lineWords(s)),
        ]
      : []),
    ...(tiling && tileCount > 0
      ? cells.filter(([r, c]) => tiled(state, r, c)).map(([r, c]) => squareWords(r, c))
      : []),
  ].join('. ');
  /**
   * Where the cursor is and what is there, for assistive tech: said when it moves or changes
   * (a polite live region), so the pad can be used without seeing the region.
   */
  const cursorWords = !working
    ? ''
    : tiling
      ? t(
          tiled(state, cell[0], cell[1]) ? 'ui.widget.at.cursor.tile' : 'ui.widget.at.cursor.bare',
          { where: squareWords(cell[0], cell[1]) },
        )
      : line
        ? t(hasLine(state, line) ? 'ui.widget.at.cursor.drawn' : 'ui.widget.at.cursor.open', {
            where: lineWords(line),
          })
        : '';

  const lines = (segs: Segment[], className: string, key: string, data?: string) =>
    segs.map((s, i) => (
      <line
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
        key={`${key}-${i}`}
        className={className}
        data-line={data}
        x1={s.x1}
        y1={s.y1}
        x2={s.x2}
        y2={s.y2}
      />
    ));

  const renderRegion = (p: WorkPlan, live: boolean) => {
    const u = p.cell;
    const W = region.w * u;
    const H = region.h * u;
    const lenKey = LEN_KEY[config.unit];
    const sideLabel = (side: Side, n: number) => (
      <span
        className="ni-atw__side"
        data-side={side}
        data-lit={lit === side || state.labelled.includes(side) ? 'true' : undefined}
        aria-hidden="true"
        style={
          side === 'top'
            ? { left: labelRoom.left, top: 0, width: W, height: labelRoom.top }
            : { left: 0, top: labelRoom.top, width: labelRoom.left, height: H }
        }
      >
        <span className="ni-atw__len">{n}</span>
        {lenKey ? <span className="ni-atw__unit">{t(lenKey)}</span> : null}
      </span>
    );
    const marks: ReactNode[] = [];
    for (const [r, c] of cells) {
      const on = tiled(state, r, c);
      marks.push(
        <rect
          key={`${r}-${c}`}
          className={on ? 'ni-atw__tile' : 'ni-atw__cell'}
          data-cell={`${r}-${c}`}
          x={c * u}
          y={r * u}
          width={u}
          height={u}
        />,
      );
      if (on) {
        // The tile's face, inside its square: neighbours meet edge to edge with no gap.
        marks.push(
          <rect
            key={`face-${r}-${c}`}
            className="ni-atw__face"
            x={c * u + 4}
            y={r * u + 4}
            width={u - 8}
            height={u - 8}
            rx={Math.min(6, u / 6)}
          />,
        );
      }
    }
    const grid = config.decimalGrid
      ? boxGridSegments(region.w, region.h, u)
      : config.gridShown
        ? innerGridSegments(region, u)
        : [];
    const body = (
      <div
        className="ni-atw__inner"
        style={{ width: W + labelRoom.left, height: H + labelRoom.top }}
      >
        {labelled(shape) ? sideLabel('top', region.w) : null}
        {labelled(shape) ? sideLabel('left', region.h) : null}
        <svg
          className="ni-atw__svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ left: labelRoom.left, top: labelRoom.top }}
          aria-hidden="true"
          focusable="false"
        >
          {config.decimalGrid ? (
            <rect className="ni-atw__whole" x={0} y={0} width={W} height={H} />
          ) : null}
          {marks}
          {lines(grid, 'ni-atw__gridline', 'g')}
          {config.decimalGrid ? (
            <rect className="ni-atw__wholeline" x={0} y={0} width={W} height={H} />
          ) : (
            lines(outlineSegments(region, u), 'ni-atw__outline', 'o')
          )}
          {live && lining && line
            ? lines(
                splitSegments(region, line.dir, line.at, u),
                'ni-atw__cursorline',
                'c',
                `cursor-${line.dir}-${line.at}`,
              )
            : null}
          {state.splits.flatMap((s) =>
            lines(
              splitSegments(region, s.dir, s.at, u),
              'ni-atw__split',
              `s-${s.dir}-${s.at}`,
              `${s.dir}-${s.at}`,
            ),
          )}
          {live && tiling ? (
            <rect
              className="ni-atw__cursor"
              data-cursor={`${cell[0]}-${cell[1]}`}
              x={cell[1] * u + 3}
              y={cell[0] * u + 3}
              width={u - 6}
              height={u - 6}
              rx={4}
            />
          ) : null}
          {live && lining && line && !hasLine(state, line)
            ? lines(splitSegments(region, line.dir, line.at, u), 'ni-atw__cursordash', 'd')
            : null}
        </svg>
      </div>
    );
    const style = { width: p.board.w, height: p.board.h };
    if (live) {
      return (
        <div
          className={cls('ni-atw__board', ring === 'surface' && 'ni-invite')}
          data-cue="surface"
          data-live="true"
          role="img"
          aria-label={regionLabel}
          style={style}
          onPointerDown={surface.onPointerDown}
        >
          {body}
        </div>
      );
    }
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-hear is a pointer extra; the picture is one image to assistive tech
      <div
        className="ni-atw__board ni-atw__picture"
        role="img"
        aria-label={regionLabel}
        style={style}
        onClick={() => {
          if (!interactive) return;
          trace('tap', 'picture');
          speak('ui.widget.at.square');
        }}
      >
        {body}
      </div>
    );
  };

  const arrow = (id: Dir, col: number, row: number): PadButton => ({
    id,
    col,
    row,
    label: ARROW_LABEL[id],
    icon: <PadArrowIcon dir={id} />,
    onPress: () => onPad(id),
  });
  const arrows = [
    arrow('up', 1, 0),
    arrow('left', 0, 1),
    arrow('down', 1, 1),
    arrow('right', 2, 1),
  ];
  const buttons: PadButton[] = tiling
    ? [
        {
          id: 'tile',
          col: 0,
          row: 0,
          label: 'ui.widget.at.pad.tile',
          icon: <TilesIcon />,
          onPress: () => onPad('tile'),
        },
        ...arrows,
        {
          id: 'row',
          col: 2,
          row: 0,
          label: 'ui.widget.at.pad.row',
          icon: <FillRowIcon />,
          onPress: () => onPad('row'),
        },
      ]
    : [
        {
          id: 'cut',
          col: 0,
          row: 0,
          label: 'ui.widget.at.pad.cut',
          icon: line?.dir === 'h' ? <LineAcrossIcon /> : <LineDownIcon />,
          onPress: () => onPad('cut'),
        },
        ...arrows,
      ];

  const actions = (
    <StepActions
      actRef={actRef}
      // A partition is checked as it stands: its one action is Check.
      step={mode === 'partition' ? 'ask' : step}
      back={mode === 'tile' || mode === 'decompose'}
      dir={step === 'ask' && askPlan.act === 'row' ? 'row' : 'column'}
      interactive={interactive}
      ready={ready}
      onStep={steps.goTo}
      onCheck={submit}
      invited={stepCue as StepCue | null}
      compact={box.h < COMPACT_ROOM_H}
    />
  );

  const answer =
    askPlan.entry || askPlan.stepper ? (
      <span data-cue="entry" className={cls('ni-atw__entry', ring === 'entry' && 'ni-invite')}>
        <AskEntry
          plan={askPlan}
          max={answerMax}
          value={value}
          onChange={(v) => {
            childStep();
            setValue(v);
          }}
          disabled={!interactive}
          highlighted={entryHighlight ?? invitedEntry}
          trace={trace}
          onEnter={submit}
          actions={actions}
        />
      </span>
    ) : null;

  return (
    <div
      ref={rootRef}
      className="ni-atw"
      data-mode={mode}
      data-tier={tier}
      data-step={step}
      data-disabled={disabled ? 'true' : undefined}
      data-fits={(step === 'build' ? plan.fits : askPlan.fits) ? undefined : 'false'}
      style={handRootStyle}
    >
      {step === 'build' ? (
        <div className="ni-atw__build">
          <WorkPanel
            ageMode={ageMode}
            pad={{ cols: 3, rows: 2 }}
            buttons={buttons}
            disabled={!interactive}
            ringed={ring?.startsWith('pad-') ? ring.slice(4) : null}
            note={note ? t(note.key) : ''}
            label={t('ui.widget.at.pad')}
          />
          {renderRegion(plan, true)}
          {actions}
          <span className="ni-visually-hidden" aria-live="polite" data-cursor-words="true">
            {cursorWords}
          </span>
        </div>
      ) : (
        <AskStep
          plan={askPlan}
          picture={picture ? renderRegion(picture, false) : null}
          entry={answer}
          actions={actions}
        />
      )}
      {inviteHand}
    </div>
  );
}

export default AreaTilesWidget;
