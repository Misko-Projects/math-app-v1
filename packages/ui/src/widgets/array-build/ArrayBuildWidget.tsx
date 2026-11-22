import { type ArrayBuildState, arrayAnswerMax, formatModel } from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import { type CSSProperties, type ReactNode, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  AskEntry,
  AskStep,
  buildRoom,
  COMPACT_ROOM_H,
  cellAt,
  demoEnterAnswer,
  lineAt,
  nextPadKey,
  ObjectSprite,
  PadArrowIcon,
  type PadButton,
  type PadKey,
  roomBox,
  type Step,
  StepActions,
  type StepCue,
  type SurfacePoint,
  spriteNameKey,
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
import {
  askPlanFor,
  boardCells,
  builds,
  columnX,
  cornerPath,
  padFor,
  picturePlan,
  SPLIT_SPACE,
  splitX,
  spriteBox,
  workPlan,
} from './layout';
import './array-build.css';

/**
 * `array-build` (03 §5.5): a rows × cols array of sprites, every sprite one size in its own cell.
 *
 * The array is a picture: its cells are too small to be targets in the short widget area (06 §1,
 * §4). A child works through the kit's grid work parts: the pad's full-size arrow buttons (also
 * the keyboard path), and the board as ONE surface for a finger.
 *
 * - **Build** (`build-dims`, `build-total`, `new-way`): the board shows every cell the rectangle
 *   may use. A finger on the board drags the rectangle out to the cell under it (a tap makes it
 *   reach that cell); the arrows add or take away one row or one column. Every step is undone by
 *   the opposite arrow or by dragging back; the board can be emptied again. `new-way` lists the
 *   rectangles found before ("2 × 6": 2 rows of 6). Check sends `{ rows, cols }`. The child's own
 *   rectangle is never counted on screen.
 * - **Read**: the array as a picture beside the kit `NumberEntry` and Check (the ask step alone).
 * - **Split** (MUL.07), two steps (kit `twoStep`): the array with a split line that a finger
 *   slides along the board, or the two arrows move, to any gap between two columns; then Next,
 *   and the picture beside the `NumberEntry`, Back and Check. Check sends
 *   `{ rows, cols, split, value }`.
 *
 * Limits are said and shown in the note under the pad: the board's last row or column (ringing
 * the arrow back only where that size cannot be the answer), and Next before the line is placed.
 *
 * Trace targets: `pad-up`, `pad-down`, `pad-left`, `pad-right`; `board` (a drag began);
 * `cell-<r>-<c>` (the rectangle's far cell after a tap or a drop, 0-based); `gap-<col>` (the split
 * line after column col, tapped or dropped); `picture` (a tap on the ask step's picture); `next`,
 * `back`, `opt-<n>` and `key-<k>`.
 *
 * Demo ops: `drag-rect {rows, cols}` (the rectangle grows cell by cell), `add-row`,
 * `split-at {col}`, `count-rows` and `skip-count-rows` (each row lights up in turn, the running
 * count spoken and shown), plus `answer {value}`.
 */

type Config = ConfigFor<'array-build'>;
type State = ArrayBuildState;
type Dir = 'up' | 'down' | 'left' | 'right';

const OPS: readonly string[] = [...FORMAT_SUPPORT['array-build'].ops, 'answer'];

function stateModel() {
  const m = formatModel('array-build');
  if (!m) throw new Error('array-build has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

const STEP_MS = 150;
const COUNT_MS = 850;
const HOLD_MS = 500;

const NOTE = {
  rows: 'ui.widget.ab.note.rows',
  cols: 'ui.widget.ab.note.cols',
  line: 'ui.widget.ab.note.line',
} as const satisfies Record<string, NarrationKey>;
const PAD_LABEL: Record<'build' | 'split', Partial<Record<Dir, NarrationKey>>> = {
  build: {
    up: 'ui.widget.ab.pad.row-less',
    down: 'ui.widget.ab.pad.row-more',
    left: 'ui.widget.ab.pad.col-less',
    right: 'ui.widget.ab.pad.col-more',
  },
  split: { left: 'ui.widget.ab.pad.line-left', right: 'ui.widget.ab.pad.line-right' },
};

interface Note {
  key: NarrationKey;
  /** The one thing ringed: what the child can do next (null: the note alone). */
  cue: string | null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

export function ArrayBuildWidget({
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
  const building = builds(mode);
  const read = mode === 'read';
  const cells = boardCells(config);
  const answerMax = arrayAnswerMax(config);

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
  const [lit, setLit] = useState<{ to: number; count: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = !disabled && !busy;

  /** A child step clears the demo's invite and the last limit note. */
  const childStep = () => {
    setInvite(null);
    setNote(null);
  };
  /** A limit: said aloud and shown, with at most one ring on what the child can do next. */
  const limit = (key: NarrationKey, cue: string | null) => {
    setNote({ key, cue });
    say(key);
  };

  const steps = useTwoStep(rootRef, {
    interactive,
    trace,
    guard: (to) => {
      childStep();
      // The answer needs the split line: Next waits for it, and says so.
      if (to === 'ask' && mode === 'split' && stateRef.current.split === null) {
        limit(NOTE.line, 'board');
        return false;
      }
      return true;
    },
  });
  // A picture to read has nothing to build; a rectangle to build has nothing to type.
  const step: Step = read ? 'ask' : building ? 'build' : steps.step;

  // ---------- layout: the measured room, the action button, the two plans ----------

  const room = useWidgetRoom(rootRef);
  const box = roomBox(room);
  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const ageMode = prefs.ageMode;
  const button = useActionSize(actRef, zoomRef, ageMode);
  const shape = useMemo(
    () => ({
      mode,
      maxRows: config.maxRows,
      maxCols: config.maxCols,
      rows: config.rows,
      cols: config.cols,
    }),
    [mode, config.maxRows, config.maxCols, config.rows, config.cols],
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

  // ---------- child input ----------

  const spriteKey = spriteNameKey(config.sprite);
  const speak = (key: NarrationKey) => {
    if (prefs.speakOnTap) say(key);
  };

  /**
   * Whether a rectangle with every row (or every column) of the board can be what the task asks.
   * Where it cannot, the limit note rings the arrow back; where it may, the note stands alone.
   */
  const fullMayAnswer = (side: 'rows' | 'cols') => {
    const full = side === 'rows' ? config.maxRows : config.maxCols;
    const other = side === 'rows' ? config.maxCols : config.maxRows;
    if (mode === 'build-dims') {
      const own = side === 'rows' ? config.rows : config.cols;
      const turned = side === 'rows' ? config.cols : config.rows;
      return own === full || (!config.orientationMatters && turned === full);
    }
    const total = config.total ?? 0;
    return total % full === 0 && total / full <= other;
  };

  const setRect = (rows: number, cols: number) => act({ op: 'drag-rect', args: { rows, cols } });

  const onPad = (dir: Dir) => {
    if (!interactive) return;
    childStep();
    trace('tap', `pad-${dir}`);
    const s = stateRef.current;
    if (mode === 'split') {
      const at = s.split;
      const next = at === null ? (dir === 'left' ? s.cols - 1 : 1) : at + (dir === 'left' ? -1 : 1);
      act({ op: 'split-at', args: { col: Math.max(1, Math.min(s.cols - 1, next)) } });
      return;
    }
    if (dir === 'down') {
      if (s.rows >= config.maxRows) limit(NOTE.rows, fullMayAnswer('rows') ? null : 'pad-up');
      else setRect(s.rows + 1, Math.max(1, s.cols));
    } else if (dir === 'right') {
      if (s.cols >= config.maxCols) limit(NOTE.cols, fullMayAnswer('cols') ? null : 'pad-left');
      else setRect(Math.max(1, s.rows), s.cols + 1);
    } else if (dir === 'up') {
      setRect(s.rows - 1, s.cols);
    } else {
      setRect(s.rows, s.cols - 1);
    }
  };

  /** Where the cells start inside the board (it is centred when the board is a full target). */
  const origin = {
    x: (plan.board.w - cells.cols * plan.cell - (mode === 'split' ? SPLIT_SPACE : 0)) / 2,
    y: (plan.board.h - cells.rows * plan.cell) / 2,
  };
  /** Puts the rectangle's far corner, or the split line, where the finger is; its trace id. */
  const drawAt = (p: SurfacePoint): string => {
    const s = stateRef.current;
    let x = p.x - origin.x;
    const y = p.y - origin.y;
    if (mode === 'split') {
      // Read the finger against the columns as drawn (the gap a split has opened is no column).
      if (s.split !== null) {
        const gap = s.split * plan.cell;
        x = x > gap + SPLIT_SPACE ? x - SPLIT_SPACE : Math.min(x, gap);
      }
      const col = lineAt(x, plan.cell, s.cols);
      act({ op: 'split-at', args: { col } });
      return `gap-${col}`;
    }
    const r = cellAt(y, plan.cell, config.maxRows);
    const c = cellAt(x, plan.cell, config.maxCols);
    setRect(r + 1, c + 1);
    return `cell-${r}-${c}`;
  };
  const dragging = useRef(false);
  const surface = useSurfacePointer({
    enabled: interactive && step === 'build' && !read,
    drag: !prefs.tapOnly,
    onDown: (p) => {
      childStep();
      dragging.current = false;
      if (!prefs.tapOnly) drawAt(p);
    },
    onMove: (p) => {
      if (!dragging.current) {
        dragging.current = true;
        trace('drag', 'board');
      }
      drawAt(p);
    },
    onUp: (p, _from, moved) => {
      const id = drawAt(p);
      trace(moved ? 'drop' : 'tap', id);
      if (!moved) speak(spriteKey);
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

  /** Shows a step and waits until it is drawn. */
  const showStep = async (s: Step) => {
    if (read || building || steps.step === s) return;
    steps.show(s);
    await committed();
  };

  const runCount = async (skip: boolean) => {
    const { rows, cols } = stateRef.current;
    if (rows === 0) return;
    const at = (r: number) => (skip ? (r + 1) * cols : r + 1);
    for (let r = 0; r < rows; r += 1) {
      setLit({ to: r, count: at(r) });
      sayNumber(at(r));
      await pause(COUNT_MS);
      if (!alive.current) return;
    }
    await pause(HOLD_MS);
    await committed();
    if (alive.current) setLit(null);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setBusy(true);
      setInvite(null);
      setNote(null);
      try {
        switch (action.op) {
          case 'drag-rect': {
            const rows = num(action.args?.rows);
            const cols = num(action.args?.cols);
            if (rows === null || cols === null) break;
            const s = stateRef.current;
            for (const d of cornerPath({ rows: s.rows, cols: s.cols }, { rows, cols })) {
              await applyOp({ op: 'drag-rect', args: { rows: d.rows, cols: d.cols } });
              await pause(STEP_MS);
              if (!alive.current) return;
            }
            break;
          }
          case 'add-row':
            await applyOp(action);
            await pause(STEP_MS);
            break;
          case 'split-at':
            await showStep('build');
            await applyOp(action);
            await pause(HOLD_MS);
            break;
          case 'count-rows':
          case 'skip-count-rows':
            await applyOp(action);
            await runCount(action.op === 'skip-count-rows');
            break;
          case 'answer': {
            const v = Number(action.args?.value);
            if (!building) {
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
    switch (invite.op) {
      case 'drag-rect': {
        if (!building) return null;
        const rows = num(invite.args?.rows) ?? state.rows;
        const cols = num(invite.args?.cols) ?? state.cols;
        if (state.rows < rows) return { cue: 'pad-down' };
        if (state.cols < cols) return { cue: 'pad-right' };
        if (state.rows > rows) return { cue: 'pad-up' };
        if (state.cols > cols) return { cue: 'pad-left' };
        return { cue: 'check' };
      }
      case 'add-row':
        return building ? { cue: 'pad-down' } : null;
      case 'split-at': {
        if (mode !== 'split') return null;
        const col = num(invite.args?.col);
        if (col === null || col < 1 || col >= state.cols) return null;
        if (state.split === col) return onBuild('next');
        const left = state.split === null ? col > state.cols / 2 : col < state.split;
        return onBuild(left ? 'pad-left' : 'pad-right');
      }
      case 'answer': {
        if (building) return { cue: 'check' };
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
  // The demonstration hand hangs on the invited control; a limit note has no hand.
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

  /** The array in words: what a sighted child can count. */
  const countLabel = (rows: number, cols: number) =>
    rows === 0
      ? t('ui.widget.ab.count.none')
      : t(rows === 1 ? 'ui.widget.ab.count.one' : 'ui.widget.ab.count.rows', { rows, cols });
  const boardLabel = [
    t(building ? 'ui.widget.ab.board' : 'ui.widget.picture'),
    countLabel(state.rows, state.cols),
    ...(state.split !== null ? [t('ui.widget.ab.count.line', { n: state.split })] : []),
  ].join('. ');

  const renderBoard = (p: WorkPlan, live: boolean) => {
    const pitch = p.cell;
    const s = spriteBox(pitch);
    const inset = (pitch - s) / 2;
    const space = mode === 'split' ? SPLIT_SPACE : 0;
    const sprites: ReactNode[] = [];
    for (let r = 0; r < state.rows; r += 1) {
      for (let c = 0; c < state.cols; c += 1) {
        sprites.push(
          <span
            key={`${r}-${c}`}
            className="ni-abw__sprite"
            data-ab-sprite={`${r}-${c}`}
            style={{
              left: columnX(c, pitch, state.split) + inset,
              top: r * pitch + inset,
              width: s,
              height: s,
            }}
          >
            <ObjectSprite sprite={config.sprite} />
          </span>,
        );
      }
    }
    const cellsStyle: CSSProperties = {
      width: cells.cols * pitch + space,
      height: cells.rows * pitch,
    };
    const body = (
      <div className="ni-abw__cells" style={cellsStyle}>
        {building && config.gridShown ? (
          <span
            className="ni-abw__grid"
            style={{ backgroundSize: `${pitch}px ${pitch}px` } as CSSProperties}
          />
        ) : null}
        {building && state.rows > 0 ? (
          <span
            className="ni-abw__rect"
            style={{ width: state.cols * pitch, height: state.rows * pitch }}
          />
        ) : null}
        {lit ? (
          <span
            className="ni-abw__lit"
            style={{ width: state.cols * pitch + space, height: (lit.to + 1) * pitch }}
          />
        ) : null}
        {sprites}
        {state.split !== null ? (
          <span
            className="ni-abw__line"
            data-split={state.split}
            style={{ left: splitX(state.split, pitch) }}
          />
        ) : null}
      </div>
    );
    const style = { width: p.board.w, height: p.board.h };
    if (live) {
      return (
        <div
          className={cls('ni-abw__board', ring === 'board' && 'ni-invite')}
          data-cue="board"
          data-live="true"
          role="img"
          aria-label={boardLabel}
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
        className="ni-abw__board ni-abw__picture"
        role="img"
        aria-label={boardLabel}
        style={style}
        onClick={() => {
          if (!interactive) return;
          trace('tap', 'picture');
          speak(spriteKey);
        }}
      >
        {body}
      </div>
    );
  };

  const pad = padFor(mode);
  const arrow = (id: Dir, col: number, row: number): PadButton => ({
    id,
    col,
    row,
    label: PAD_LABEL[mode === 'split' ? 'split' : 'build'][id] as NarrationKey,
    icon: <PadArrowIcon dir={id} />,
    onPress: () => onPad(id),
  });
  const buttons: PadButton[] =
    mode === 'split'
      ? [arrow('left', 0, 0), arrow('right', 1, 0)]
      : [arrow('up', 1, 0), arrow('left', 0, 1), arrow('down', 1, 1), arrow('right', 2, 1)];
  const found = mode === 'new-way' ? (config.found ?? []) : null;
  const head = found ? (
    <p className="ni-abw__found">
      <span className="ni-visually-hidden">
        {[t('ui.widget.ab.found'), ...found.map(([r, c]) => countLabel(r, c))].join('. ')}
      </span>
      {found.map(([r, c]) => (
        <span key={`${r}x${c}`} className="ni-abw__way" aria-hidden="true">
          {r} × {c}
        </span>
      ))}
    </p>
  ) : undefined;

  const actions = (
    <StepActions
      actRef={actRef}
      // A rectangle to build is checked as it stands: its one action is Check.
      step={building ? 'ask' : step}
      back={mode === 'split'}
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
      <span data-cue="entry" className={cls('ni-abw__entry', ring === 'entry' && 'ni-invite')}>
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
      className="ni-abw"
      data-mode={mode}
      data-tier={tier}
      data-step={step}
      data-disabled={disabled ? 'true' : undefined}
      data-fits={(step === 'build' ? plan.fits : askPlan.fits) ? undefined : 'false'}
      style={handRootStyle}
    >
      {step === 'build' ? (
        <div className="ni-abw__build">
          <WorkPanel
            ageMode={ageMode}
            pad={pad}
            buttons={buttons}
            disabled={!interactive}
            ringed={ring?.startsWith('pad-') ? ring.slice(4) : null}
            head={head}
            note={note ? t(note.key) : ''}
            count={lit?.count ?? null}
            label={t('ui.widget.ab.pad')}
          />
          {renderBoard(plan, true)}
          {actions}
        </div>
      ) : (
        <AskStep
          plan={askPlan}
          picture={picture ? renderBoard(picture, false) : null}
          entry={answer}
          actions={actions}
        />
      )}
      {inviteHand}
    </div>
  );
}

export default ArrayBuildWidget;
