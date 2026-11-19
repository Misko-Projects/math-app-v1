import { type AreaTilesState, formatModel, regionPieces } from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { HandPointerIcon } from '../../primitives/icons';
import { TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  applyPadKey,
  CheckButton,
  NumberPadKeys,
  type PadKey,
  padValue,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  FillRowIcon,
  LineAcrossIcon,
  LineDownIcon,
  PlotIcon,
  SplitIcon,
  TilesIcon,
  WholeIcon,
} from './icons';
import {
  boxGridSegments,
  fitBoard,
  innerGridSegments,
  inRegion,
  nextEmptyCell,
  outlineSegments,
  regionCells,
  rowsWithCells,
  type Segment,
  sideOf,
  splitSegments,
} from './layout';
import './area-tiles.css';

/**
 * `area-tiles` (03 §5.5): a region of grid cells (`mask`, rectilinear shapes allowed) drawn as a
 * garden plot on a paper board.
 *
 * - **tile** (concrete): a tile stack waits in the tray. The child drags a tile onto a cell, taps a
 *   cell to lay one there (or taps the stack, then a cell), or presses Enter on a focused cell. A
 *   laid tile goes back by dragging it to the tray, or tapping it and then the tray. "Fill this
 *   row" at each row's end lays the whole row. The child types the area on the number pad; Check
 *   sends `{ tiles, value }`. Nothing on screen counts the tiles.
 * - **count** (pictorial): the region already tiled, as a picture. Type the area → number.
 * - **multiply**: a plain rectangle with its side lengths (≥ 32 px numerals, plus the length unit).
 *   Type the area → number.
 * - **decompose** (MEA.13, MUL.19): tap a gap marker below (column lines) or right of (row lines)
 *   the region to draw or erase a full-length split line; each piece gets its own soft pattern.
 *   Type the total → `{ splits, value }`.
 * - **partition** (GEO.04): the same gap markers, no number pad. Check → `{ rows, cols }`.
 *
 * Every change goes through the engine's state model (`formatModel('area-tiles')`).
 *
 * Trace targets: `tray` (the tile stack, dragged or tapped; also the tray as a drop target),
 * `cell-<r>-<c>` (an empty cell, tapped or dropped on), `tile-<r>-<c>` (a laid tile, or a tile of
 * the count picture), `row-<r>` ("fill this row"), `gap-v-<at>` / `gap-h-<at>` (a gap marker: the
 * line after column or row `at`), `side-top` / `side-left` (a side-length label) and `key-<k>`.
 *
 * Demo ops: `place-tile {r, c, remove?}` (a tile flies in from the tray, or back to it),
 * `fill-row {r}` (the row fills cell by cell), `draw-split {at, dir}`, `label-side {side}` (the
 * side length lights up and is spoken), plus `answer {value}` (typed into the blank).
 */

type Config = ConfigFor<'area-tiles'>;
type State = AreaTilesState;
type Unit = Config['unit'];
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

/** Answer blanks are sized for three digits whatever the answer, so the width never hints. */
const MAX_DIGITS = 3;
/** The tallest the field may be (px): the widget area is ≈ 720 px tall on a 1280 × 800 tablet. */
const FIELD_MAX_H = 556;
/** The board card's padding plus border, both sides (px). */
const CARD_EDGES = 30;
const FLY_MS = 520;
const STEP_MS = 170;
const HOLD_MS = 450;
const FLASH_MS = 700;
const KEY_MS = 340;
const REDUCED_HOLD_MS = 300;
/** Soft piece patterns for decompose (layout order); see area-tiles.css for the look. */
const PATTERNS = 6;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const cellId = (r: number, c: number) => `cell-${r}-${c}`;
const tileId = (r: number, c: number) => `tile-${r}-${c}`;
const parseRc = (id: string) => {
  const [, r = '0', c = '0'] = id.split('-');
  return [Number(r), Number(c)] as const;
};
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const UNIT_KEY: Record<Unit, NarrationKey> = {
  'sq-units': 'ui.widget.at.unit.sq-units',
  'sq-cm': 'ui.widget.at.unit.sq-cm',
  'sq-m': 'ui.widget.at.unit.sq-m',
  'sq-in': 'ui.widget.at.unit.sq-in',
  'sq-ft': 'ui.widget.at.unit.sq-ft',
};
/** What a tapped tile says: "Tile", or the unit square's name. */
const TILE_KEY: Record<Unit, NarrationKey> = {
  'sq-units': 'ui.widget.at.tile',
  'sq-cm': 'ui.widget.at.name.sq-cm',
  'sq-m': 'ui.widget.at.name.sq-m',
  'sq-in': 'ui.widget.at.name.sq-in',
  'sq-ft': 'ui.widget.at.name.sq-ft',
};
/** The length unit beside a side numeral (none for plain square units). */
const LEN_KEY: Record<Unit, NarrationKey | null> = {
  'sq-units': null,
  'sq-cm': 'ui.widget.at.len.sq-cm',
  'sq-m': 'ui.widget.at.len.sq-m',
  'sq-in': 'ui.widget.at.len.sq-in',
  'sq-ft': 'ui.widget.at.len.sq-ft',
};

type Flash =
  | { kind: 'cell'; r: number; c: number }
  | { kind: 'row'; r: number }
  | { kind: 'gap'; dir: 'v' | 'h'; at: number }
  | { kind: 'side'; side: Side }
  | null;

/**
 * Enter or Space on one of the widget's own buttons (cells, tiles, the tray) acts on that button
 * only: it never also reaches the number pad's desktop Enter, which checks.
 */
const keepEnter = (onKeyDown: (e: KeyboardEvent) => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  onKeyDown(e);
};

const segPath = (segs: Segment[]) => segs.map((s) => `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`).join('');

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
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const uid = useId().replace(/:/g, '');

  const [state, setState] = useState<State>(() => initial(config));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [text, setText] = useState('');
  const textRef = useRef(text);
  textRef.current = text;
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  const mode = config.mode;
  const region = config.region;
  const { w, h } = region;
  const tileMode = mode === 'tile';
  const count = mode === 'count';
  const decompose = mode === 'decompose';
  const partition = mode === 'partition';
  const markers = decompose || partition;
  const hasPad = !partition;
  const labelsShown = config.sideLabels || mode === 'multiply';
  const interactive = !disabled && !demoBusy;
  const k = prefs.ageMode === 'k';
  const sizes = TARGET_PX[prefs.ageMode];
  const gap = TARGET_GAP_PX;
  const lenKey = LEN_KEY[config.unit];
  const tileName = t(TILE_KEY[config.unit]);

  const commit = (next: State) => {
    stateRef.current = next;
    setState(next);
  };
  /** A child step clears the demo's marks and invite. */
  const childStep = () => {
    setInvite(null);
    setFlash(null);
  };
  const speakTile = () => {
    if (prefs.speakOnTap) say(TILE_KEY[config.unit]);
  };

  // ---------- geometry ----------

  const rootRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const sideRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLElement | null>(null);
  /**
   * The room for the board: the widget's width less the answer column (or the full width when the
   * answer column wraps below). The board and the answer column are then centred together, so a
   * small board never leaves Check stranded across a gap.
   */
  const [mainW, setMainW] = useState(760);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const side = sideRef.current;
    if (!root || !side || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const cs = getComputedStyle(root);
      const inner =
        root.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
      const stacked = cs.gridTemplateColumns.trim().split(/\s+/).length < 2;
      const width = stacked ? inner : inner - side.offsetWidth - Number.parseFloat(cs.columnGap);
      if (width > 0) setMainW(Math.floor(width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(side);
    return () => ro.disconnect();
  }, []);

  // The left label holds a two-digit numeral, plus the length unit when there is one.
  const labelW = Math.max(sizes.min, lenKey ? 108 : 76);
  const lay = fitBoard({
    width: Math.max(200, mainW - CARD_EDGES),
    height: FIELD_MAX_H,
    w,
    h,
    min: tileMode ? 28 : 20,
    max: k ? 200 : 150,
    target: sizes.min,
    gap,
    tray: tileMode,
    rowButtons: tileMode,
    markers,
    labels: labelsShown,
    labelW,
  });
  const p = lay.pitch;
  const gridW = w * p;
  const gridH = h * p;
  const cellX = (c: number) => lay.gridLeft + c * p;
  const cellY = (r: number) => lay.gridTop + r * p;
  const filled = (r: number, c: number) => state.tiles[r * w + c] === true;

  // ---------- child input: tiles ----------

  const placeTile = (r: number, c: number, via: 'tap' | 'drag' | 'keyboard') => {
    const s = stateRef.current;
    if (!inRegion(region, r, c) || s.tiles[r * w + c]) return;
    const next = applyAction(s, { op: 'place-tile', args: { r, c } });
    commit(next);
    if (via === 'keyboard') {
      const after = nextEmptyCell(region, next.tiles, r, c);
      pendingFocus.current = after ? cellId(after[0], after[1]) : null;
    }
  };
  const removeTile = (r: number, c: number) => {
    const s = stateRef.current;
    if (!s.tiles[r * w + c]) return;
    commit(applyAction(s, { op: 'place-tile', args: { r, c, remove: true } }));
  };

  const pendingFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    rootRef.current?.querySelector<HTMLElement>(`[data-place-target="${id}"]`)?.focus();
  });

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive || !tileMode,
    trace,
    canPlace: (item, target) =>
      item === 'tray' ? target.startsWith('cell-') : item.startsWith('tile-') && target === 'tray',
    onSelect: (item) => {
      if (item) {
        childStep();
        speakTile();
      }
    },
    onPlace: ({ item, target, via }) => {
      childStep();
      if (item === 'tray' && target.startsWith('cell-')) {
        const [r, c] = parseRc(target);
        placeTile(r, c, via);
      } else if (item.startsWith('tile-') && target === 'tray') {
        const [r, c] = parseRc(item);
        removeTile(r, c);
      }
    },
  });

  /** Tapping (or Enter on) an empty cell lays a tile there, whatever was picked up before. */
  const tapCell = (r: number, c: number, via: 'tap' | 'keyboard') => {
    if (!interactive) return;
    childStep();
    dnd.select(null);
    trace('tap', cellId(r, c));
    placeTile(r, c, via);
  };

  const fillRow = (r: number) => {
    if (!interactive) return;
    childStep();
    dnd.select(null);
    trace('tap', `row-${r}`);
    if (k) say('ui.widget.at.row');
    commit(applyAction(stateRef.current, { op: 'fill-row', args: { r } }));
  };

  // ---------- child input: lines, labels, pad ----------

  const tapGap = (dir: 'v' | 'h', at: number) => {
    if (!interactive) return;
    childStep();
    trace('tap', `gap-${dir}-${at}`);
    if (k) say(dir === 'v' ? 'ui.widget.at.gap.v' : 'ui.widget.at.gap.h');
    commit(applyAction(stateRef.current, { op: 'draw-split', args: { at, dir } }));
  };

  const tapSide = (side: Side) => {
    if (!interactive) return;
    childStep();
    trace('tap', `side-${side}`);
    if (prefs.speakOnTap) sayNumber(side === 'top' ? w : h);
  };

  /** A tap on the count picture names the tile under the finger. */
  const onPictureClick = (e: MouseEvent) => {
    if (!interactive) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-tile]');
    if (!el) return;
    childStep();
    const [r = 0, c = 0] = (el.dataset.tile ?? '').split('-').map(Number);
    trace('tap', tileId(r, c));
    speakTile();
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    childStep();
    trace('tap', `key-${key}`);
    setText((prev) => applyPadKey(prev, key, MAX_DIGITS));
  };

  const typed = padValue(text);
  const ready = (s: State, value: number | null) => {
    switch (mode) {
      case 'tile':
        return value !== null && s.tiles.some(Boolean);
      case 'decompose':
        return value !== null && s.splits.length > 0;
      case 'partition':
        return s.splits.length > 0;
      default:
        return value !== null;
    }
  };
  const complete = ready(state, typed);

  // One debounce for every route to submit (Check, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    let s = stateRef.current;
    const value = padValue(textRef.current);
    if (!ready(s, value)) return false;
    if (hasPad && value !== null) s = applyAction(s, { op: 'answer', args: { value } });
    const response = model.toResponse(s);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  /** Flies `el` between where the stack is drawn and where `el` is drawn (Web Animations). */
  const fly = async (el: HTMLElement, toStack: boolean) => {
    const stack = stackRef.current;
    if (!stack) return;
    const a = stack.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const away = { transform: `translate(${dx}px, ${dy}px) scale(1.08)` };
    const home = { transform: 'translate(0px, 0px) scale(1)' };
    const anim = el.animate(toStack ? [home, away] : [away, home], {
      duration: FLY_MS,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: toStack ? 'forwards' : 'none',
    });
    await anim.finished.catch(() => undefined);
  };
  const tileEl = (r: number, c: number) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-tile="${r}-${c}"]`) ?? null;

  const playOp = async (action: WidgetAction) => {
    const s0 = stateRef.current;
    switch (action.op) {
      case 'place-tile': {
        const r = num(action.args?.r) ?? -1;
        const c = num(action.args?.c) ?? -1;
        const next = applyAction(s0, action);
        if (!inRegion(region, r, c)) return;
        const was = s0.tiles[r * w + c] === true;
        const now = next.tiles[r * w + c] === true;
        if (was === now) {
          commit(next);
          return;
        }
        if (now) {
          // A tile flies in from the tray.
          flushSync(() => commit(next));
          const el = tileEl(r, c);
          if (!reduced && tileMode && el) await fly(el, false);
          if (!alive.current) return;
          setFlash({ kind: 'cell', r, c });
        } else {
          // Back to the tray.
          const el = tileEl(r, c);
          if (!reduced && tileMode && el) await fly(el, true);
          if (!alive.current) return;
          commit(next);
        }
        await pause(HOLD_MS);
        return;
      }
      case 'fill-row': {
        const r = num(action.args?.r) ?? -1;
        setFlash({ kind: 'row', r });
        if (!reduced) {
          for (const [cr, cc] of regionCells(region)) {
            if (cr !== r || stateRef.current.tiles[cr * w + cc]) continue;
            commit(applyAction(stateRef.current, { op: 'place-tile', args: { r: cr, c: cc } }));
            await pause(STEP_MS);
            if (!alive.current) return;
          }
        }
        commit(applyAction(stateRef.current, action));
        await pause(HOLD_MS);
        return;
      }
      case 'draw-split': {
        const next = applyAction(s0, action);
        commit(next);
        const at = num(action.args?.at);
        const dir = action.args?.dir === 'h' ? 'h' : 'v';
        if (next !== s0 && at !== undefined) setFlash({ kind: 'gap', dir, at });
        await pause(FLASH_MS);
        return;
      }
      case 'label-side': {
        commit(applyAction(s0, action));
        const side = sideOf(action.args?.side);
        if (side) {
          setFlash({ kind: 'side', side });
          sayNumber(side === 'top' ? w : h);
        }
        await pause(FLASH_MS);
        return;
      }
      case 'answer': {
        commit(applyAction(s0, action));
        const value = num(action.args?.value);
        if (!hasPad || value === undefined) return;
        let typedText = '';
        textRef.current = '';
        setText('');
        for (const ch of String(Math.trunc(Math.abs(value))).split('') as PadKey[]) {
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
      setFlash(null);
      try {
        await playOp(action);
        // Reduced motion: the change was instant; the highlight shows briefly (no movement).
        if (reduced && alive.current) await wait(REDUCED_HOLD_MS);
        await nextFrame();
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
        // After a demo step the widget is back to its normal look.
        if (alive.current) setFlash(null);
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const inviteTarget: string | null = (() => {
    if (!invite) return null;
    const a = invite.args ?? {};
    switch (invite.op) {
      case 'place-tile': {
        const r = num(a.r) ?? -1;
        const c = num(a.c) ?? -1;
        if (!tileMode) return null;
        if (a.remove === true) return inRegion(region, r, c) && filled(r, c) ? tileId(r, c) : null;
        return inRegion(region, r, c) && !filled(r, c) ? cellId(r, c) : 'tray';
      }
      case 'fill-row': {
        const r = num(a.r) ?? -1;
        return tileMode && rowsWithCells(region).includes(r) ? `row-${r}` : null;
      }
      case 'draw-split': {
        const at = num(a.at) ?? 0;
        const dir = a.dir === 'h' ? 'h' : 'v';
        const limit = dir === 'v' ? w : h;
        return markers && Number.isInteger(at) && at >= 1 && at < limit ? `gap-${dir}-${at}` : null;
      }
      case 'label-side': {
        const side = sideOf(a.side);
        return labelsShown && side ? `side-${side}` : null;
      }
      case 'answer':
        return hasPad ? 'blank' : 'check';
      default:
        return null;
    }
  })();
  const isInvited = (id: string) => inviteTarget === id;
  /** Pip's hand with its fingertip (≈ 42 % across, 8 px down) on the point (x, y). */
  const handAt = (x: number, y: number) => (
    <span className="ni-hand" style={{ left: x - 23, top: y - 8 }}>
      <HandPointerIcon />
    </span>
  );
  const slotHand = <span className="ni-hand ni-atw__hand">{<HandPointerIcon />}</span>;
  const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

  // ----- the plot (SVG, decorative): fills, grid, outline, split lines -----

  const pieces = decompose ? regionPieces(w, h, region.mask, state.splits) : [];
  const pieceOf = new Map<number, number>();
  if (pieces.length > 1) {
    pieces.forEach((cells, i) => {
      for (const [r, c] of cells) pieceOf.set(r * w + c, i % PATTERNS);
    });
  }
  const cellFills: ReactNode[] = [];
  for (const [r, c] of regionCells(region)) {
    const piece = pieceOf.get(r * w + c);
    cellFills.push(
      <rect
        key={`${r}-${c}`}
        x={c * p}
        y={r * p}
        width={p}
        height={p}
        className="ni-atw__soil"
        fill={piece === undefined ? `url(#${uid}-soil)` : `url(#${uid}-pat${piece})`}
        data-piece={piece}
      />,
    );
  }
  const gridSegs = config.gridShown ? innerGridSegments(region, p) : [];
  const flashGap = flash?.kind === 'gap' ? flash : null;
  const plot = (
    <svg
      className="ni-atw__plot"
      width={gridW}
      height={gridH}
      viewBox={`0 0 ${gridW} ${gridH}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`${uid}-soil`} width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" className="ni-atw__soil-bg" />
          <circle cx="4" cy="5" r="1.4" className="ni-atw__soil-dot" />
          <circle cx="13" cy="13" r="1.4" className="ni-atw__soil-dot" />
        </pattern>
        {/* Decompose: each piece a soft pattern AND a tone, so pieces never differ by colour alone. */}
        <pattern id={`${uid}-pat0`} width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" className="ni-atw__pat ni-atw__pat--0" />
          <path d="M-4 4l8-8M0 16L16 0M12 20l8-8" className="ni-atw__pat-ink" />
        </pattern>
        <pattern id={`${uid}-pat1`} width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" className="ni-atw__pat ni-atw__pat--1" />
          <circle cx="7" cy="7" r="2.6" className="ni-atw__pat-dot" />
        </pattern>
        <pattern id={`${uid}-pat2`} width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" className="ni-atw__pat ni-atw__pat--2" />
          <path d="M8 0v16M0 8h16" className="ni-atw__pat-ink" />
        </pattern>
        <pattern id={`${uid}-pat3`} width="16" height="12" patternUnits="userSpaceOnUse">
          <rect width="16" height="12" className="ni-atw__pat ni-atw__pat--3" />
          <path d="M0 6q4-4 8 0t8 0" className="ni-atw__pat-ink" />
        </pattern>
        <pattern id={`${uid}-pat4`} width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" className="ni-atw__pat ni-atw__pat--4" />
          <path d="M16 4l-8 8-8-8M16 20l-8-8-8 8" className="ni-atw__pat-ink" />
        </pattern>
        <pattern id={`${uid}-pat5`} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" className="ni-atw__pat ni-atw__pat--5" />
          <path d="M6 0v12" className="ni-atw__pat-ink" />
        </pattern>
      </defs>
      {config.decimalGrid ? <rect width={gridW} height={gridH} className="ni-atw__whole" /> : null}
      {cellFills}
      {config.decimalGrid ? (
        <path d={segPath(boxGridSegments(w, h, p))} className="ni-atw__hundredths" />
      ) : null}
      {gridSegs.length > 0 ? <path d={segPath(gridSegs)} className="ni-atw__gridline" /> : null}
      {config.decimalGrid ? (
        <rect width={gridW} height={gridH} className="ni-atw__whole-edge" />
      ) : null}
      <path d={segPath(outlineSegments(region, p))} className="ni-atw__outline" />
      {state.splits.map((sp) => {
        const d = segPath(splitSegments(region, sp.dir, sp.at, p));
        const on = flashGap?.dir === sp.dir && flashGap.at === sp.at;
        return (
          <g
            key={`${sp.dir}${sp.at}`}
            className="ni-atw__split"
            data-split={`${sp.dir}-${sp.at}`}
            data-flash={on ? 'true' : undefined}
          >
            <path d={d} className="ni-atw__split-halo" pathLength={1} />
            <path d={d} className="ni-atw__split-line" pathLength={1} />
          </g>
        );
      })}
    </svg>
  );

  // ----- the region's HTML layer: cells and tiles -----

  const tileArt = <span className="ni-atw__tile-art" />;
  const layer: ReactNode[] = [];
  if (tileMode) {
    for (const [r, c] of regionCells(region)) {
      const style = { left: c * p, top: r * p, width: p, height: p };
      if (filled(r, c)) {
        const id = tileId(r, c);
        const item = dnd.itemProps(id, { label: tileName });
        const props = { ...item, onKeyDown: keepEnter(item.onKeyDown) };
        layer.push(
          <span
            key={id}
            {...props}
            className={cls(props.className, 'ni-atw__tile', isInvited(id) && 'ni-invite')}
            data-tile={`${r}-${c}`}
            data-flash={
              flash?.kind === 'cell' && flash.r === r && flash.c === c ? 'true' : undefined
            }
            style={style}
          >
            {tileArt}
          </span>,
        );
      } else {
        const id = cellId(r, c);
        const base = dnd.targetProps(id, { label: t('ui.widget.at.cell') });
        const props = {
          ...base,
          // Tapping a cell always works (it lays a tile), so it is never shown as unavailable.
          'aria-disabled': interactive ? undefined : (true as const),
          onClick: (e: MouseEvent) => {
            if (dnd.selected === 'tray') base.onClick(e);
            else tapCell(r, c, 'tap');
          },
          onKeyDown: keepEnter((e: KeyboardEvent) => {
            if ((e.key === 'Enter' || e.key === ' ') && dnd.selected !== 'tray') {
              e.preventDefault();
              if (!e.repeat) tapCell(r, c, 'keyboard');
              return;
            }
            base.onKeyDown(e);
          }),
        };
        layer.push(
          <span
            key={id}
            {...props}
            className={cls(props.className, 'ni-atw__cell', isInvited(id) && 'ni-invite')}
            style={style}
          />,
        );
      }
    }
  } else if (count) {
    for (const [r, c] of regionCells(region)) {
      layer.push(
        <span
          key={`${r}-${c}`}
          className="ni-atw__tile ni-atw__tile--static"
          data-tile={`${r}-${c}`}
          style={{ left: c * p, top: r * p, width: p, height: p }}
        >
          {tileArt}
        </span>,
      );
    }
  }

  const litRow = flash?.kind === 'row' ? flash.r : null;
  const litBox = (() => {
    if (litRow === null) return null;
    const cols = regionCells(region)
      .filter(([r]) => r === litRow)
      .map(([, c]) => c);
    if (cols.length === 0) return null;
    const c0 = Math.min(...cols);
    const c1 = Math.max(...cols);
    return (
      <span
        className="ni-atw__lit"
        aria-hidden="true"
        style={{ left: c0 * p, top: litRow * p, width: (c1 - c0 + 1) * p, height: p }}
      />
    );
  })();

  const gridStyle = {
    left: lay.gridLeft,
    top: lay.gridTop,
    width: gridW,
    height: gridH,
    '--p': `${p}px`,
  } as CSSProperties;
  const picture = !tileMode;
  const grid = picture ? (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tapping a tile only speaks its name; nothing to operate
    <div
      className="ni-atw__grid"
      role="img"
      aria-label={t('ui.widget.picture')}
      style={gridStyle}
      onClick={count ? onPictureClick : undefined}
    >
      {plot}
      {layer}
      {litBox}
    </div>
  ) : (
    <div className="ni-atw__grid" style={gridStyle}>
      {plot}
      {layer}
      {litBox}
    </div>
  );

  // ----- around the region: side labels, row buttons, gap markers -----

  const around: ReactNode[] = [];
  const hands: ReactNode[] = [];
  const addHand = (id: string, x: number, y: number) => {
    if (isInvited(id)) hands.push(<span key={`hand-${id}`}>{handAt(x, y)}</span>);
  };
  if (tileMode) {
    for (const [r, c] of regionCells(region)) {
      addHand(filled(r, c) ? tileId(r, c) : cellId(r, c), cellX(c) + p / 2, cellY(r) + p / 2);
    }
  }

  if (labelsShown) {
    const unit = lenKey ? t(lenKey) : null;
    const label = (side: Side, style: CSSProperties) => {
      const id = `side-${side}`;
      const n = side === 'top' ? w : h;
      const on = flash?.kind === 'side' && flash.side === side;
      return (
        <button
          key={id}
          type="button"
          className={cls('ni-atw__side', isInvited(id) && 'ni-invite')}
          data-side={side}
          data-flash={on ? 'true' : undefined}
          style={style}
          disabled={!interactive}
          onClick={() => tapSide(side)}
        >
          <span className="ni-atw__side-num">{n}</span>
          {unit ? (
            <>
              {' '}
              <span className="ni-atw__side-unit">{unit}</span>
            </>
          ) : null}
        </button>
      );
    };
    // Dimension lines: a bracket along each labelled side, the numeral sitting on its middle.
    const half = sizes.min / 2;
    around.push(
      <svg
        key="dims"
        className="ni-atw__dims"
        width={lay.fieldW}
        height={lay.fieldH}
        aria-hidden="true"
        focusable="false"
      >
        <path
          d={`M${lay.gridLeft} ${half - 12}v24M${lay.gridLeft} ${half}h${gridW}M${lay.gridLeft + gridW} ${half - 12}v24`}
        />
        <path
          d={`M${labelW / 2 - 12} ${lay.gridTop}h24M${labelW / 2} ${lay.gridTop}v${gridH}M${labelW / 2 - 12} ${lay.gridTop + gridH}h24`}
        />
      </svg>,
    );
    around.push(
      label('top', { left: lay.gridLeft + gridW / 2, top: 0, height: sizes.min }),
      label('left', {
        left: labelW / 2,
        top: lay.gridTop + gridH / 2 - sizes.min / 2,
        height: sizes.min,
        maxWidth: labelW,
      }),
    );
    addHand('side-top', lay.gridLeft + gridW / 2, half);
    addHand('side-left', labelW / 2, lay.gridTop + gridH / 2);
  }

  if (tileMode) {
    for (const r of rowsWithCells(region)) {
      const id = `row-${r}`;
      const lane = r % lay.rowLanes;
      const x = lay.gridLeft + gridW + gap + lane * (sizes.min + gap);
      const y = cellY(r) + p / 2 - sizes.min / 2;
      around.push(
        <button
          key={id}
          type="button"
          className={cls('ni-atw__row', isInvited(id) && 'ni-invite')}
          data-row={r}
          style={{ left: x, top: y, width: sizes.min, height: sizes.min }}
          aria-label={t('ui.widget.at.row')}
          disabled={!interactive}
          onClick={() => fillRow(r)}
        >
          <span className="ni-atw__row-icon">
            <FillRowIcon />
          </span>
        </button>,
      );
      addHand(id, x + sizes.min / 2, y + sizes.min / 2);
    }
  }

  if (markers) {
    const marker = (dir: 'v' | 'h', at: number) => {
      const id = `gap-${dir}-${at}`;
      const lane = (at - 1) % (dir === 'v' ? lay.vLanes : lay.hLanes);
      const x =
        dir === 'v'
          ? cellX(at) - sizes.min / 2
          : lay.gridLeft + gridW + gap + lane * (sizes.min + gap);
      const y =
        dir === 'v'
          ? lay.gridTop + gridH + gap + lane * (sizes.min + gap)
          : cellY(at) - sizes.min / 2;
      const on = state.splits.some((s) => s.dir === dir && s.at === at);
      const flashing = flashGap?.dir === dir && flashGap.at === at;
      around.push(
        <button
          key={id}
          type="button"
          className={cls('ni-atw__gap', (isInvited(id) || flashing) && 'ni-invite')}
          data-gap={`${dir}-${at}`}
          data-dir={dir}
          style={{ left: x, top: y, width: sizes.min, height: sizes.min }}
          aria-label={t(dir === 'v' ? 'ui.widget.at.gap.v' : 'ui.widget.at.gap.h')}
          aria-pressed={on}
          disabled={!interactive}
          onClick={() => tapGap(dir, at)}
        >
          <span className="ni-atw__gap-icon">
            {dir === 'v' ? <LineDownIcon /> : <LineAcrossIcon />}
          </span>
        </button>,
      );
      addHand(id, x + sizes.min / 2, y + sizes.min / 2);
    };
    for (let at = 1; at < w; at += 1) marker('v', at);
    for (let at = 1; at < h; at += 1) marker('h', at);
  }

  // ----- the board card -----

  const caption = (() => {
    if (tileMode) return { icon: <TilesIcon />, key: 'ui.widget.at.board.tile' };
    if (decompose) return { icon: <SplitIcon />, key: 'ui.widget.at.board.decompose' };
    if (partition) return { icon: <SplitIcon />, key: 'ui.widget.at.board.partition' };
    if (config.decimalGrid) return { icon: <WholeIcon />, key: 'ui.widget.at.whole' };
    return { icon: <PlotIcon />, key: 'ui.widget.picture' };
  })();

  const tray = tileMode
    ? (() => {
        const padBase = dnd.targetProps('tray', { label: t('ui.widget.at.tray') });
        const pad = { ...padBase, onKeyDown: keepEnter(padBase.onKeyDown) };
        const stackBase = dnd.itemProps('tray', { label: t('ui.widget.at.stack') });
        const pickedTile = dnd.selected?.startsWith('tile-') === true;
        const stack = {
          ...stackBase,
          ref: (el: HTMLElement | SVGElement | null) => {
            stackBase.ref(el);
            stackRef.current = el instanceof HTMLElement ? el : null;
          },
          onClick: (e: MouseEvent) => {
            // A laid tile is picked up: tapping the tray (the stack is in it) puts it back.
            if (pickedTile && interactive) {
              const item = dnd.selected as string;
              childStep();
              dnd.select(null);
              trace('tap', 'tray');
              const [r, c] = parseRc(item);
              removeTile(r, c);
              return;
            }
            stackBase.onClick(e);
          },
          onKeyDown: keepEnter(stackBase.onKeyDown),
        };
        const box = (
          <div className="ni-atw__tray">
            <div {...pad} className={cls(pad.className, 'ni-atw__traypad')} />
            <span className="ni-atw__stack-slot">
              <span
                {...stack}
                className={cls(stack.className, 'ni-atw__stack', isInvited('tray') && 'ni-invite')}
                style={{ width: lay.stack, height: lay.stack, '--p': `${p}px` } as CSSProperties}
              >
                <span className="ni-atw__stack-under" data-layer="2" />
                <span className="ni-atw__stack-under" data-layer="1" />
                {tileArt}
              </span>
              {isInvited('tray') ? slotHand : null}
            </span>
          </div>
        );
        return (
          <div className="ni-atw__traycol" style={{ width: lay.trayW }}>
            {/* The tray's label: the stack is its picture; the words from G1. */}
            {prefs.textLabels ? (
              <span className="ni-atw__traylabel" aria-hidden="true">
                {t('ui.widget.at.tray')}
              </span>
            ) : null}
            {box}
          </div>
        );
      })()
    : null;

  const board = (
    <div className="ni-atw__board" data-grid={config.gridShown ? 'on' : 'off'}>
      {/* The region's label: a picture icon, plus its words from G1. */}
      <div className="ni-atw__caption" aria-hidden="true">
        <span className="ni-atw__caption-icon">{caption.icon}</span>
        {prefs.textLabels ? <span>{t(caption.key)}</span> : null}
      </div>
      <div className="ni-atw__body">
        {tray}
        {tileMode || markers ? (
          // biome-ignore lint/a11y/useSemanticElements: a board of cells and markers, not a form fieldset
          <div
            className="ni-atw__field"
            role="group"
            aria-label={t(caption.key)}
            style={{ width: lay.fieldW, height: lay.fieldH }}
          >
            {grid}
            {around}
            {hands}
          </div>
        ) : (
          <div className="ni-atw__field" style={{ width: lay.fieldW, height: lay.fieldH }}>
            {grid}
            {around}
            {hands}
          </div>
        )}
      </div>
    </div>
  );

  // ----- the answer side -----

  const unitShown = hasPad && !(k && config.unit === 'sq-units');
  const check = (
    <span className="ni-atw__slot ni-atw__check">
      <CheckButton
        onPress={submit}
        disabled={!interactive || !complete}
        invited={isInvited('check')}
      />
      {isInvited('check') ? slotHand : null}
    </span>
  );
  const side = (
    <div
      ref={sideRef}
      className={cls('ni-atw__panel', hasPad && 'ni-atw__answer')}
      data-k={k ? 'true' : undefined}
    >
      {hasPad ? (
        <span className="ni-atw__slot ni-atw__blank-slot">
          <span className="ni-atw__slot">
            <output
              className={cls('ni-number', 'ni-atw__blank', isInvited('blank') && 'ni-invite')}
              data-size="lg"
              data-empty={text === '' ? 'true' : undefined}
              style={{ minWidth: `${MAX_DIGITS * 0.62 + 0.8}em` }}
              aria-label={`${t('ui.widget.answer')}: ${text}`.trim()}
            >
              {text === '' ? <span className="ni-number__slot" /> : <span>{text}</span>}
              {interactive ? <span className="ni-number__caret" /> : null}
            </output>
            {isInvited('blank') ? slotHand : null}
          </span>
          {unitShown ? <span className="ni-atw__unit">{t(UNIT_KEY[config.unit])}</span> : null}
        </span>
      ) : null}
      {check}
      {hasPad ? (
        <div className="ni-atw__pad">
          <NumberPadKeys
            onKey={onKey}
            onEnter={submit}
            disabled={!interactive}
            highlighted={pressedKey}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="ni-atw"
      data-mode={mode}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-atw__main" ref={mainRef}>
        {board}
      </div>
      {side}
    </div>
  );
}

export default AreaTilesWidget;
