import { type ArrayBuildState, formatModel } from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { BigButton } from '../../primitives/BigButton';
import { CheckIcon, HandPointerIcon } from '../../primitives/icons';
import { TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  applyPadKey,
  CheckButton,
  NumberPadKeys,
  ObjectSprite,
  type PadKey,
  padValue,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { AddRowIcon, CornerIcon, GridIcon, NotchIcon, PerRowIcon, RowsIcon } from './icons';
import {
  columnX,
  cornerPath,
  type Dims,
  fitPitch,
  nearestGap,
  rectFromDrag,
  rectFromKey,
  rectToCell,
  splitFromKey,
  splitX,
  thumbPitch,
} from './layout';
import { useHandleDrag } from './useHandleDrag';
import './array-build.css';

/**
 * `array-build` (03 §5.5): a rows × cols array of sprites.
 *
 * - **Build** (`build-dims`, `build-total`, `new-way`): a board of maxRows × maxCols cells. The
 *   child drags the big corner handle out from the top-left (the rectangle follows the finger,
 *   snapping to cells), taps any cell to make the rectangle reach it, or uses the arrow keys on the
 *   handle (Enter checks). "Add a row" adds one row. The task chip shows what the task gives; the
 *   child's own rectangle is never counted or measured on screen (that would give the answer away
 *   by trial and error). Check sends `{ rows, cols }`.
 * - **Read**: the array as a static picture ("Look at the picture"), an answer blank and the
 *   number pad. Check sends the typed number.
 * - **Split** (MUL.07): the array, a split line (drag the stick, tap a gap marker, or arrow keys on
 *   the stick) and the number pad. Check sends `{ rows, cols, split, value }` once both are done.
 *
 * Every change goes through the engine's state model (`formatModel('array-build')`).
 *
 * Trace targets: `corner` (drag start), `cell-<r>-<c>` (a tapped cell, a drag's drop, an arrow-key
 * move: the rectangle's new far cell), `add-row`, `split` (stick drag start), `gap-<col>` (split
 * placed after column col: tap, drop or key), `sprite-<r>-<c>` (a tapped sprite in read/split) and
 * `key-<k>` (pad keys). Rows and columns are 0-based; gaps count from 1.
 *
 * Demo ops: `drag-rect {rows, cols}` (the corner animates out), `add-row`, `split-at {col}`,
 * `count-rows` (each row lights up in turn, its running count spoken), `skip-count-rows` (the
 * running multiples), plus `answer {value}` (typed into the blank).
 */

type Config = ConfigFor<'array-build'>;
type State = ArrayBuildState;

const OPS: readonly string[] = [...FORMAT_SUPPORT['array-build'].ops, 'answer'];

function stateModel() {
  const m = formatModel('array-build');
  if (!m) throw new Error('array-build has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

/** Answer blanks are sized for three digits whatever the answer, so the width never hints. */
const MAX_DIGITS = 3;
/** The tallest the board may be (px): the widget area is ≈ 720 px tall on a 1280 × 800 tablet. */
const FIELD_MAX_H = 556;
/** The board card's padding plus border, both sides (px). */
const CARD_EDGES = 30;
/** How far a split pulls the two parts apart (px). */
const SPLIT_SPACE = 18;
const STEP_MS = 150;
const HOLD_MS = 500;
const FLASH_MS = 700;
const COUNT_MS = 750;
const KEY_MS = 340;
const REDUCED_HOLD_MS = 300;

const cellId = (r: number, c: number) => `cell-${r}-${c}`;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

interface Lit {
  /** Rows lit, inclusive. */
  from: number;
  to: number;
  /** The running count shown beside them (demo counting only). */
  count: number | null;
}

type Flash = 'corner' | 'split' | null;

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
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const [state, setState] = useState<State>(() => initial(config));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [text, setText] = useState('');
  const textRef = useRef(text);
  textRef.current = text;
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [lit, setLit] = useState<Lit | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [dragging, setDragging] = useState<'corner' | 'split' | null>(null);

  const mode = config.mode;
  const build = mode === 'build-dims' || mode === 'build-total' || mode === 'new-way';
  const split = mode === 'split';
  const read = mode === 'read';
  const interactive = !disabled && !demoBusy;
  const maxDims: Dims = { rows: config.maxRows, cols: config.maxCols };

  const commit = (next: State) => {
    stateRef.current = next;
    setState(next);
  };
  /** A child step clears the demo's marks and invite. */
  const childStep = () => {
    setInvite(null);
    setLit(null);
    setFlash(null);
  };

  // ---------- geometry ----------

  const mainRef = useRef<HTMLDivElement | null>(null);
  const [mainW, setMainW] = useState(760);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setMainW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = prefs.ageMode === 'k';
  const sizes = TARGET_PX[prefs.ageMode];
  const handle = sizes.icon;
  const gutter = handle + 8;
  const notch = sizes.min;
  // The markers' band leaves ≥ 12 px above the stick, even with a chosen marker sunk 3 px.
  const notchBand = notch + 24;
  // The stick waits at the array's right edge (in the split space), its hit area half outside.
  const stickGutter = sizes.min / 2 - SPLIT_SPACE / 2 + 4;
  const sideGutter = read ? 64 : 0;
  const gridRows = build ? config.maxRows : state.rows;
  const gridCols = build ? config.maxCols : state.cols;
  const space = split ? SPLIT_SPACE : 0;
  const extraW = build ? gutter : split ? space + stickGutter : 2 * sideGutter;
  const extraH = build ? gutter : split ? notchBand : 0;
  const pitch = fitPitch({
    width: Math.max(160, mainW - CARD_EDGES) - extraW,
    height: FIELD_MAX_H - extraH,
    rows: gridRows,
    cols: gridCols,
    min: 32,
    max: k ? 150 : 128,
  });
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;
  const gridW = gridCols * pitch + space;
  const gridH = gridRows * pitch;
  const gridLeft = sideGutter;
  const gridTop = split ? notchBand : 0;
  const fieldW = gridCols * pitch + extraW;
  const fieldH = gridH + extraH;
  const splitAt = split ? state.split : null;
  const empty = state.rows === 0 || state.cols === 0;
  const cornerX = empty ? 4 : state.cols * pitch + 4;
  const cornerY = empty ? 4 : state.rows * pitch + 4;
  const stickX = (at: number | null) => splitX(at ?? state.cols, pitch, space);
  const notchX = (c: number) =>
    c === splitAt ? splitX(c, pitch, space) : columnX(c, pitch, splitAt, space);

  // ---------- child input ----------

  const setRect = (next: Dims) => {
    const s = stateRef.current;
    if (next.rows === s.rows && next.cols === s.cols) return;
    commit(applyAction(s, { op: 'drag-rect', args: { rows: next.rows, cols: next.cols } }));
  };
  const setSplit = (col: number) => {
    const s = stateRef.current;
    if (s.split === col) return;
    commit(applyAction(s, { op: 'split-at', args: { col } }));
  };
  const speakSprite = () => {
    if (prefs.speakOnTap) say(spriteNameKey(config.sprite));
  };

  const dragStart = useRef<Dims>({ rows: 0, cols: 0 });
  const cornerDrag = useHandleDrag({
    enabled: interactive && build && !prefs.tapOnly,
    onStart: () => {
      const s = stateRef.current;
      dragStart.current = { rows: s.rows, cols: s.cols };
      childStep();
      setDragging('corner');
      trace('drag', 'corner');
    },
    onMove: (dx, dy) => setRect(rectFromDrag(dragStart.current, dx, dy, pitchRef.current, maxDims)),
    onEnd: () => {
      setDragging(null);
      const s = stateRef.current;
      trace('drop', s.rows > 0 && s.cols > 0 ? cellId(s.rows - 1, s.cols - 1) : 'none');
    },
  });

  const stickStart = useRef(0);
  const stickDrag = useHandleDrag({
    enabled: interactive && split && !prefs.tapOnly,
    onStart: () => {
      stickStart.current = stickX(stateRef.current.split);
      childStep();
      setDragging('split');
      trace('drag', 'split');
    },
    onMove: (dx) =>
      setSplit(nearestGap(stickStart.current + dx, pitchRef.current, stateRef.current.cols, space)),
    onEnd: () => {
      setDragging(null);
      const at = stateRef.current.split;
      trace('drop', at === null ? 'none' : `gap-${at}`);
    },
  });

  /** A tap on the board (build: reach that cell) or on the array (read/split: name the sprite). */
  const onFieldClick = (e: MouseEvent) => {
    if (!interactive || !cornerDrag.consumeClick() || !stickDrag.consumeClick()) return;
    const cell = (e.target as Element).closest<HTMLElement>('[data-cell]');
    if (!cell) return;
    const [r = 0, c = 0] = (cell.dataset.cell ?? '').split('-').map(Number);
    childStep();
    if (build) {
      trace('tap', cellId(r, c));
      if (cell.dataset.filled === 'true') speakSprite();
      setRect(rectToCell(r, c, maxDims));
    } else {
      trace('tap', `sprite-${r}-${c}`);
      speakSprite();
    }
  };

  const onCornerKey = (e: KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    const next = rectFromKey(stateRef.current, e.key, maxDims);
    if (!next) return;
    e.preventDefault();
    childStep();
    setRect(next);
    trace('move', cellId(next.rows - 1, next.cols - 1));
  };

  const onStickKey = (e: KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = splitFromKey(stateRef.current.split, e.key, stateRef.current.cols);
    if (next === null) return;
    childStep();
    setSplit(next);
    trace('move', `gap-${next}`);
  };

  const tapGap = (col: number) => {
    if (!interactive) return;
    childStep();
    trace('tap', `gap-${col}`);
    setSplit(col);
  };

  const addRow = () => {
    if (!interactive) return;
    childStep();
    trace('tap', 'add-row');
    commit(applyAction(stateRef.current, { op: 'add-row' }));
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    childStep();
    trace('tap', `key-${key}`);
    setText((prev) => applyPadKey(prev, key, MAX_DIGITS));
  };

  const typed = padValue(text);
  const complete = build ? !empty : split ? state.split !== null && typed !== null : typed !== null;

  // One debounce for every route to submit (Check, Enter on a handle, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    let s = stateRef.current;
    if (!build) {
      const value = padValue(textRef.current);
      if (value === null) return false;
      s = applyAction(s, { op: 'answer', args: { value } });
    }
    const response = model.toResponse(s);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const playOp = async (action: WidgetAction) => {
    const s0 = stateRef.current;
    switch (action.op) {
      case 'drag-rect': {
        const target = applyAction(s0, action);
        if (target === s0) return;
        setFlash('corner');
        if (!reduced && target.rows > 0 && target.cols > 0) {
          for (const step of cornerPath(s0, target)) {
            commit(applyAction(stateRef.current, { op: 'drag-rect', args: { ...step } }));
            await pause(STEP_MS);
            if (!alive.current) return;
          }
        }
        commit(target);
        await pause(HOLD_MS);
        return;
      }
      case 'add-row': {
        const next = applyAction(s0, action);
        commit(next);
        if (next.rows > 0) setLit({ from: next.rows - 1, to: next.rows - 1, count: null });
        await pause(FLASH_MS);
        return;
      }
      case 'split-at': {
        commit(applyAction(s0, action));
        setFlash('split');
        await pause(FLASH_MS);
        return;
      }
      case 'count-rows':
      case 'skip-count-rows': {
        const next = applyAction(s0, action);
        commit(next);
        const per = action.op === 'skip-count-rows' ? next.cols : 1;
        if (next.rows === 0) return;
        if (reduced) {
          // Instant: every row lit at once with the final count.
          setLit({ from: 0, to: next.rows - 1, count: next.rows * per });
          sayNumber(next.rows * per);
          return;
        }
        for (let r = 0; r < next.rows; r += 1) {
          setLit({ from: r, to: r, count: (r + 1) * per });
          sayNumber((r + 1) * per);
          await pause(COUNT_MS);
          if (!alive.current) return;
        }
        return;
      }
      case 'answer': {
        commit(applyAction(s0, action));
        const value = num(action.args?.value);
        if (build || value === undefined) return;
        let typedText = '';
        textRef.current = '';
        setText('');
        for (const ch of String(value).split('') as PadKey[]) {
          setPressedKey(ch);
          await pause(KEY_MS);
          if (!alive.current) return;
          typedText = applyPadKey(typedText, ch, MAX_DIGITS);
          textRef.current = typedText;
          setText(typedText);
        }
        setPressedKey(null);
        await pause(KEY_MS);
        return;
      }
    }
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      setLit(null);
      setFlash(null);
      try {
        await playOp(action);
        // Reduced motion: the change was instant; the highlight shows briefly (no movement).
        if (reduced && alive.current) await wait(REDUCED_HOLD_MS);
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
        // After a demo step the widget is back to its normal look.
        if (alive.current) {
          setLit(null);
          setFlash(null);
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const invitedGap = (() => {
    if (invite?.op !== 'split-at') return null;
    const col = num(invite.args?.col);
    return col !== undefined && col >= 1 && col < state.cols ? Math.trunc(col) : null;
  })();
  const invited = {
    corner: invite?.op === 'drag-rect' && build,
    addRow: invite?.op === 'add-row' && build,
    stick: invite?.op === 'split-at' && split && invitedGap === null,
    grid: invite?.op === 'count-rows' || invite?.op === 'skip-count-rows',
    blank: invite?.op === 'answer' && !build,
    check: invite?.op === 'answer' && build,
  };
  const hand = (style: CSSProperties, extra = '') => (
    <span className={`ni-hand ${extra}`.trim()} style={style}>
      <HandPointerIcon />
    </span>
  );

  const cells: ReactNode[] = [];
  for (let r = 0; r < gridRows; r += 1) {
    for (let c = 0; c < gridCols; c += 1) {
      const filled = build ? r < state.rows && c < state.cols : true;
      const isLit = filled && lit !== null && r >= lit.from && r <= lit.to;
      cells.push(
        <div
          key={`${r}-${c}`}
          className="ni-abw__cell"
          data-cell={`${r}-${c}`}
          data-filled={filled ? 'true' : undefined}
          data-lit={isLit ? 'true' : undefined}
          style={{ left: columnX(c, pitch, splitAt, space), top: r * pitch }}
        >
          {filled ? (
            <span className="ni-abw__sprite motion-entrance">
              <ObjectSprite sprite={config.sprite} />
            </span>
          ) : null}
        </div>,
      );
    }
  }

  const litBox =
    lit !== null && state.rows > 0 && state.cols > 0 ? (
      <>
        <span
          className="ni-abw__lit"
          aria-hidden="true"
          style={{
            top: lit.from * pitch,
            height: (lit.to - lit.from + 1) * pitch,
            width: build ? state.cols * pitch : gridW,
          }}
        />
        {lit.count !== null ? (
          <span
            className="ni-abw__count"
            aria-hidden="true"
            style={{
              left: (build ? state.cols * pitch : gridW) + 10,
              top: ((lit.from + lit.to + 1) * pitch) / 2,
            }}
          >
            {lit.count}
          </span>
        ) : null}
      </>
    ) : null;

  const gridStyle = {
    left: gridLeft,
    top: gridTop,
    width: gridW,
    height: gridH,
    '--p': `${pitch}px`,
  } as CSSProperties;

  const board = (
    <div
      className={['ni-abw__board', invited.grid ? 'ni-invite' : ''].filter(Boolean).join(' ')}
      data-grid={config.gridShown ? 'on' : 'off'}
    >
      {/* The region's label: a picture icon, plus its name from G1 (the board names itself too). */}
      <div className="ni-abw__caption" aria-hidden="true">
        <span className="ni-abw__caption-icon">
          <GridIcon />
        </span>
        {prefs.textLabels ? (
          <span>{t(build ? 'ui.widget.ab.board' : 'ui.widget.picture')}</span>
        ) : null}
      </div>
      <div
        className="ni-abw__field"
        style={{ width: fieldW, height: fieldH }}
        data-dragging={dragging ?? undefined}
      >
        {build ? (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the corner handle is the keyboard path (arrow keys)
          // biome-ignore lint/a11y/useSemanticElements: a board of cells, not a fieldset; the handle inside is the control
          <div
            className="ni-abw__grid"
            role="group"
            aria-label={t('ui.widget.ab.board')}
            style={gridStyle}
            onClick={onFieldClick}
          >
            {cells}
            {!empty ? (
              <span
                className="ni-abw__rect"
                aria-hidden="true"
                style={{ width: state.cols * pitch, height: state.rows * pitch }}
              />
            ) : null}
            {litBox}
            <button
              type="button"
              className={['ni-abw__corner', invited.corner || flash === 'corner' ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
              style={{ left: cornerX, top: cornerY, width: handle, height: handle }}
              aria-label={t('ui.widget.ab.corner')}
              data-empty={empty ? 'true' : undefined}
              data-dragging={dragging === 'corner' ? 'true' : undefined}
              data-tap-only={prefs.tapOnly ? 'true' : undefined}
              disabled={!interactive}
              onPointerDown={cornerDrag.onPointerDown}
              onKeyDown={onCornerKey}
            >
              <span className="ni-abw__corner-icon">
                <CornerIcon />
              </span>
            </button>
            {invited.corner
              ? hand({ left: cornerX + handle / 2 - 23, top: cornerY + handle - 26 })
              : null}
          </div>
        ) : (
          <>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: tapping a sprite only speaks its name; nothing to operate */}
            <div
              className="ni-abw__grid"
              role="img"
              aria-label={t('ui.widget.picture')}
              style={gridStyle}
              onClick={onFieldClick}
            >
              {cells}
              {litBox}
            </div>
            {invited.grid
              ? hand({ left: gridLeft + pitch / 2 - 23, top: gridTop + pitch / 2 - 8 })
              : null}
          </>
        )}
        {split ? (
          <>
            {Array.from({ length: Math.max(0, state.cols - 1) }, (_, i) => {
              const col = i + 1;
              const x = gridLeft + notchX(col);
              const on = state.split === col;
              return (
                <button
                  key={col}
                  type="button"
                  className={['ni-abw__gap', invitedGap === col ? 'ni-invite' : '']
                    .filter(Boolean)
                    .join(' ')}
                  style={{ left: x - notch / 2, top: 0, width: notch, height: notch }}
                  aria-label={t('ui.widget.ab.gap', { n: col })}
                  aria-pressed={on}
                  data-gap={col}
                  disabled={!interactive}
                  onClick={() => tapGap(col)}
                >
                  <span className="ni-abw__gap-icon">
                    <NotchIcon />
                  </span>
                </button>
              );
            })}
            {invitedGap !== null
              ? hand({ left: gridLeft + notchX(invitedGap) - 23, top: notch - 26 })
              : null}
            <button
              type="button"
              className={['ni-abw__stick', invited.stick || flash === 'split' ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
              style={{
                left: gridLeft + stickX(state.split) - sizes.min / 2,
                top: gridTop - 6,
                width: sizes.min,
                height: gridH + 12,
              }}
              aria-label={t('ui.widget.ab.stick')}
              data-placed={state.split !== null ? 'true' : undefined}
              data-dragging={dragging === 'split' ? 'true' : undefined}
              data-tap-only={prefs.tapOnly ? 'true' : undefined}
              disabled={!interactive}
              onPointerDown={stickDrag.onPointerDown}
              onKeyDown={onStickKey}
            >
              <span className="ni-abw__stick-bar" />
            </button>
            {invited.stick
              ? hand({ left: gridLeft + stickX(state.split) - 23, top: gridTop + gridH / 2 })
              : null}
          </>
        ) : null}
      </div>
    </div>
  );

  const dimsLabel = (r: number, c: number) =>
    r === 1
      ? t('ui.widget.ab.task.dims-one', { cols: c })
      : t('ui.widget.ab.task.dims', { rows: r, cols: c });

  const task = (() => {
    if (mode === 'build-dims') {
      const rows = config.rows ?? 0;
      const cols = config.cols ?? 0;
      const key: NarrationKey =
        rows === 1 ? 'ui.widget.ab.task.dims-one' : 'ui.widget.ab.task.dims';
      return { key, vars: { rows, cols }, label: dimsLabel(rows, cols) };
    }
    const key: NarrationKey =
      mode === 'new-way' ? 'ui.widget.ab.task.new' : 'ui.widget.ab.task.total';
    const vars = { n: config.total ?? 0 };
    return { key, vars, label: t(key, vars) };
  })();

  const taskChip = build ? (
    <button
      type="button"
      className="ni-abw__task"
      data-kind={mode === 'build-dims' ? 'dims' : 'total'}
      onClick={() => say(task.key, task.vars)}
    >
      {/* The name is the spoken line; the picture (numerals and icons) is hidden from it. */}
      <span className="ni-visually-hidden">{task.label}</span>
      {mode === 'build-dims' ? (
        <>
          <span className="ni-abw__task-line" aria-hidden="true">
            <span className="ni-abw__task-icon">
              <RowsIcon />
            </span>
            <span className="ni-abw__num">{config.rows}</span>
          </span>
          <span className="ni-abw__task-line" aria-hidden="true">
            <span className="ni-abw__task-icon">
              <PerRowIcon />
            </span>
            <span className="ni-abw__num">{config.cols}</span>
          </span>
        </>
      ) : (
        <span className="ni-abw__task-line" aria-hidden="true">
          <span className="ni-abw__task-sprite">
            <ObjectSprite sprite={config.sprite} />
          </span>
          <span className="ni-abw__num" data-size="lg">
            {config.total}
          </span>
        </span>
      )}
    </button>
  ) : null;

  const found =
    mode === 'new-way' && (config.found ?? []).length > 0 ? (
      // biome-ignore lint/a11y/useSemanticElements: a captioned set of pictures, not a form fieldset
      <div className="ni-abw__found" role="group" aria-label={t('ui.widget.ab.found')}>
        {prefs.textLabels ? (
          <span className="ni-abw__found-title" aria-hidden="true">
            {t('ui.widget.ab.found')}
          </span>
        ) : null}
        <div className="ni-abw__thumbs">
          {(config.found ?? []).map(([r, c]) => (
            <span
              key={`${r}x${c}`}
              className="ni-abw__thumb"
              role="img"
              aria-label={dimsLabel(r, c)}
            >
              {/* Its shape (a plain silhouette, nothing to count) and its sides as numerals. */}
              <span className="ni-abw__thumb-shape-box">
                <span
                  className="ni-abw__thumb-shape"
                  style={{ width: c * thumbPitch(r, c, 44), height: r * thumbPitch(r, c, 44) }}
                />
              </span>
              <span className="ni-abw__thumb-dims">
                {r} × {c}
              </span>
              <span className="ni-abw__thumb-badge">
                <CheckIcon tone="light" />
              </span>
            </span>
          ))}
        </div>
      </div>
    ) : null;

  const check = (
    <span className="ni-abw__slot ni-abw__check">
      <CheckButton onPress={submit} disabled={!interactive || !complete} invited={invited.check} />
      {invited.check ? hand({}, 'ni-abw__hand') : null}
    </span>
  );

  const side = build ? (
    <div className="ni-abw__side">
      {taskChip}
      {found}
      <div className="ni-abw__actions">
        <span className="ni-abw__slot">
          <BigButton
            label="ui.widget.ab.add-row"
            icon={<AddRowIcon />}
            tone="sea"
            onPress={addRow}
            disabled={!interactive || state.rows >= config.maxRows}
            className={invited.addRow ? 'ni-invite' : undefined}
          />
          {invited.addRow ? hand({}, 'ni-abw__hand') : null}
        </span>
        {check}
      </div>
    </div>
  ) : (
    <div className="ni-abw__side ni-abw__answer" data-k={k ? 'true' : undefined}>
      <span className="ni-abw__slot ni-abw__blank-slot">
        <output
          className={['ni-number', 'ni-abw__blank', invited.blank ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-size="lg"
          data-empty={text === '' ? 'true' : undefined}
          style={{ minWidth: `${MAX_DIGITS * 0.62 + 0.8}em` }}
          aria-label={`${t('ui.widget.answer')}: ${text}`.trim()}
        >
          {text === '' ? <span className="ni-number__slot" /> : <span>{text}</span>}
          {interactive ? <span className="ni-number__caret" /> : null}
        </output>
        {invited.blank ? hand({}, 'ni-abw__hand') : null}
      </span>
      {check}
      <div className="ni-abw__pad">
        <NumberPadKeys
          onKey={onKey}
          onEnter={submit}
          disabled={!interactive}
          highlighted={pressedKey}
        />
      </div>
    </div>
  );

  return (
    <div
      className="ni-abw"
      data-mode={mode}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-abw__main" ref={mainRef}>
        {board}
      </div>
      {side}
    </div>
  );
}

export default ArrayBuildWidget;
