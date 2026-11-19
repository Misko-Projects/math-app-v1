import {
  type BaseTenBuildState,
  formatModel,
  PIECE_VALUE,
  type PieceKind,
  traySupply,
} from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { IconButton } from '../../primitives/IconButton';
import { HandPointerIcon } from '../../primitives/icons';
import { TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
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
  bundleHalf,
  bundleOffset,
  clampInto,
  cubeDepth,
  KINDS,
  larger,
  matLayout,
  onesGroupGap,
  pieceGap,
  smaller,
} from './layout';
import { PieceArt, PileArt, TradeIcon } from './pieces';
import './base-ten-build.css';

/**
 * `base-ten-build` (03 §5.5): a wooden mat with one column per piece kind (largest on the left),
 * a tray of piles to take pieces from, and "make a ten" / "split a ten" trades under the columns.
 *
 * - `build` / `build-exact` (concrete): the goal numeral sits at the top of the side panel (with
 *   the required piece counts for `build-exact`). Drag, tap-to-place or the keyboard moves a pile's
 *   piece onto the mat (`add-piece {kind}`) or a mat piece back to the tray (`count: -1`). Check
 *   sends the mat, `{ thousands, hundreds, tens, ones }`, through the state model; any pieces worth
 *   the target count (state equivalence). Nothing shows a value, a total or a column count.
 * - `read` (pictorial): the prebuilt pieces are a static picture ("Look at the picture"); the
 *   child types the number on the pad. With `wholeIs: 'flat'` the typed decimal is sent in
 *   hundredths, as every base-ten-build value is.
 *
 * Trace targets: `tray-<kind>`, `mat-<kind>-<i>`, the drop targets `mat` and `tray`,
 * `fuse-<kind>`, `split-<kind>`, `goal`, `exact-<kind>`, `answer` and `key-<k>` (read).
 *
 * Demo ops (03 §5.5): `add-piece {kind, count}` (the piece flies from the tray), `fuse {kind}` and
 * `split {kind}` (the bundle animation), `count-by {kind}` (pieces light up one by one with the
 * running count spoken: the only place a count is spoken), plus `answer`.
 */

type Config = ConfigFor<'base-ten-build'>;
type State = BaseTenBuildState;
type Target = 'mat' | 'tray';

const OPS: readonly string[] = [...FORMAT_SUPPORT['base-ten-build'].ops, 'answer'];

/** Height the pieces may use on the mat (px): the 1280 × 800 widget area minus goal and trades. */
const BOARD_H = 420;
const READ_H = 380;
/** The board's wooden frame plus its inner margin (px), around the columns. */
const BOARD_PAD = 18;
const COL_GAP = 16;
const BTN_GAP = 12;

// Motion (03 §6.3, the fuse/split acceptance criterion): large, simple, transform-only moves.
const GATHER_MS = 380;
const HOLD_MS = 90;
const LAND_MS = 420;
const FLY_MS = 520;
const COUNT_MS = 700;
const KEY_MS = 340;
const FLASH_MS = 900;
const EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';

function stateModel() {
  const m = formatModel('base-ten-build');
  if (!m) throw new Error('base-ten-build has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

const ALIASES: Record<string, PieceKind> = {
  thousands: 'thousands',
  thousand: 'thousands',
  cube: 'thousands',
  hundreds: 'hundreds',
  hundred: 'hundreds',
  flat: 'hundreds',
  tens: 'tens',
  ten: 'tens',
  rod: 'tens',
  ones: 'ones',
  one: 'ones',
  unit: 'ones',
};
const kindOf = (v: unknown): PieceKind | null =>
  typeof v === 'string' ? (ALIASES[v] ?? null) : null;

const dec = (decimal: boolean) => (decimal ? 'dec.' : '');
const pieceKey = (k: PieceKind, decimal: boolean): NarrationKey =>
  `ui.widget.btb.${dec(decimal)}piece.${k}`;
const fuseKey = (k: PieceKind, decimal: boolean): NarrationKey =>
  `ui.widget.btb.${dec(decimal)}fuse.${k}`;
const splitKey = (k: PieceKind, decimal: boolean): NarrationKey =>
  `ui.widget.btb.${dec(decimal)}split.${k}`;
const exactKey = (k: PieceKind, n: number, decimal: boolean): NarrationKey =>
  `ui.widget.btb.${dec(decimal)}exact.${k}${n === 1 ? '-one' : ''}`;

/** A value as the child sees and hears it: hundredths become a decimal when the flat is 1. */
const shown = (v: number, decimal: boolean) => (decimal ? Number((v / 100).toFixed(2)) : v);

/** The mat's columns: every kind from the largest to the smallest the item uses. */
function columnKinds(config: Config, mat: Record<PieceKind, number>): PieceKind[] {
  const used = KINDS.filter(
    (k) => config.pieces[k] || (config.prebuilt?.[k] ?? 0) > 0 || mat[k] > 0,
  );
  const first = used[0];
  const last = used[used.length - 1];
  if (!first || !last) return ['ones'];
  return KINDS.slice(KINDS.indexOf(first), KINDS.indexOf(last) + 1);
}

function parseItem(id: string): { where: 'tray' | 'mat'; kind: PieceKind } | null {
  const [where, kind] = id.split('-');
  const k = kindOf(kind);
  if (!k || (where !== 'tray' && where !== 'mat')) return null;
  return { where, kind: k };
}

const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

const settle = (anims: Animation[]) =>
  Promise.all(anims.map((a) => a.finished.catch(() => undefined)));

function move(el: HTMLElement, frames: Keyframe[], ms: number): Animation {
  return el.animate(frames, { duration: ms, easing: EASE, fill: 'forwards' });
}

function ReturnIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M8 26v10a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V26"
        stroke="var(--color-wood-deep)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M24 6v20m-8-8 8 8 8-8"
        stroke="var(--color-ink)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BaseTenBuildWidget({
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

  const read = config.mode === 'read';
  const decimal = config.wholeIs === 'flat';

  const [state, setState] = useState<State>(() => initial(config));
  const stateRef = useRef(state);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set());
  const [counted, setCounted] = useState<{ kind: PieceKind; upTo: number } | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [text, setText] = useState('');
  const textRef = useRef(text);
  textRef.current = text;
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(820);
  const interactive = !disabled && !busy;

  // ---------- state through the model, with a hook for "after the DOM shows it" ----------

  const commitWaiters = useRef<(() => void)[]>([]);
  useLayoutEffect(() => {
    if (commitWaiters.current.length === 0) return;
    const waiters = commitWaiters.current;
    commitWaiters.current = [];
    for (const w of waiters) w();
  });

  /** Applies an op; resolves (true) once the new state is in the DOM, or false if nothing changed. */
  const applyOp = (action: WidgetAction): Promise<boolean> => {
    const prev = stateRef.current;
    const next = applyAction(prev, action);
    if (next === prev) return Promise.resolve(false);
    return new Promise((resolve) => {
      commitWaiters.current.push(() => resolve(true));
      stateRef.current = next;
      setState(next);
    });
  };

  // ---------- layout: the unit size that fits every column ----------

  useLayoutEffect(() => {
    const el = leftRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setAvail(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const kinds = columnKinds(config, state.mat);
  const iconPx = TARGET_PX[prefs.ageMode].icon;
  // A trade button with its caption (G1+ text mode) is as wide as `.ni-caption` allows.
  const buttonPx = prefs.textLabels ? iconPx + 40 : iconPx;
  const tradesOf = (k: PieceKind): ('fuse' | 'split')[] => {
    if (read) return [];
    const up = larger(k);
    const down = smaller(k);
    return [
      ...(up && kinds.includes(up) ? (['fuse'] as const) : []),
      ...(down && kinds.includes(down) ? (['split'] as const) : []),
    ];
  };
  const boardH = read ? READ_H : BOARD_H;
  const layout = matLayout({
    kinds,
    counts: state.mat,
    // clientWidth rounds; one px of slack keeps the minimum widths inside the board.
    width: avail - 2 * BOARD_PAD - 1,
    height: boardH,
    columnGap: COL_GAP,
    controlsWidth: (k) => {
      const n = tradesOf(k).length;
      return n === 0 ? 0 : n * buttonPx + (n - 1) * BTN_GAP;
    },
  });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const u = layout.u;

  // ---------- DOM helpers for the animations ----------

  const pieceEls = (kind: PieceKind) => [
    ...(rootRef.current?.querySelectorAll<HTMLElement>(`.ni-btb__piece[data-kind="${kind}"]`) ??
      []),
  ];
  const pileEl = (kind: PieceKind) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-place-item="tray-${kind}"]`) ?? null;

  const flashPieces = (keys: string[]) => {
    setFlash(new Set(keys));
    setTimeout(() => {
      if (alive.current) setFlash(new Set());
    }, FLASH_MS);
  };

  // ---------- fuse and split (child buttons and demo) ----------

  /** Ten pieces slide together into a bundle, which becomes one larger piece in the next column. */
  const runFuse = async (kind: PieceKind) => {
    const up = larger(kind);
    const s = stateRef.current;
    if (!up || s.mat[kind] < 10) return;
    const newKey = `${up}-${s.mat[up]}`;
    if (reduced) {
      if (await applyOp({ op: 'fuse', args: { kind } })) flashPieces([newKey]);
      return;
    }
    // The first ten (for ones, the first full frame) gather; the rest slide up afterwards.
    const all = pieceEls(kind);
    const before = all.map((e) => e.getBoundingClientRect());
    const els = all.slice(0, 10);
    const centers = before.slice(0, 10).map(centerOf);
    const unit = layoutRef.current.u;
    const boardBox = rootRef.current?.querySelector('.ni-btb__board')?.getBoundingClientRect();
    const mid = {
      x: centers.reduce((a, p) => a + p.x, 0) / Math.max(1, centers.length),
      y: centers.reduce((a, p) => a + p.y, 0) / Math.max(1, centers.length),
    };
    // The bundle stays on the board (inside its wooden frame).
    const c = boardBox
      ? clampInto(mid, bundleHalf(kind, unit), {
          left: boardBox.left + 12,
          top: boardBox.top + 12,
          right: boardBox.right - 12,
          bottom: boardBox.bottom - 12,
        })
      : mid;
    const gather = els.map((el, j) => {
      const from = centers[j] as { x: number; y: number };
      const off = bundleOffset(kind, j, unit);
      el.style.zIndex = '3';
      return move(
        el,
        [
          { transform: 'translate(0px, 0px)' },
          { transform: `translate(${c.x + off.x - from.x}px, ${c.y + off.y - from.y}px)` },
        ],
        GATHER_MS,
      );
    });
    await settle(gather);
    if (!alive.current) return;
    await pause(HOLD_MS);
    if (!alive.current) return;
    const changed = await applyOp({ op: 'fuse', args: { kind } });
    // Elements that stay mounted now show the pieces that were left over: drop the gather move.
    for (const a of gather) a.cancel();
    for (const el of els) el.style.zIndex = '';
    if (!changed) return;
    const moves: Animation[] = [];
    // The left-over pieces slide from where they were into their new places (FLIP).
    pieceEls(kind).forEach((el, k) => {
      const old = before[k + 10];
      if (!old) return;
      const r = el.getBoundingClientRect();
      const dx = old.left - r.left;
      const dy = old.top - r.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      moves.push(
        move(
          el,
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
          LAND_MS,
        ),
      );
    });
    // The bundle becomes one larger piece, which moves into its column.
    const el = pieceEls(up).at(-1);
    if (el) {
      const p = centerOf(el.getBoundingClientRect());
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      el.style.zIndex = '3';
      moves.push(
        move(
          el,
          [
            { transform: `translate(${dx}px, ${dy}px) scale(1)` },
            { transform: `translate(${dx * 0.45}px, ${dy * 0.45}px) scale(1.08)`, offset: 0.55 },
            { transform: 'translate(0px, 0px) scale(1)' },
          ],
          LAND_MS,
        ),
      );
    }
    await settle(moves);
    for (const a of moves) a.cancel();
    if (el) el.style.zIndex = '';
  };

  /** One piece moves into the next smaller column and opens into ten pieces that spread out. */
  const runSplit = async (kind: PieceKind) => {
    const down = smaller(kind);
    const s = stateRef.current;
    if (!down || s.mat[kind] < 1) return;
    const first = s.mat[down];
    const newKeys = Array.from({ length: 10 }, (_, j) => `${down}-${first + j}`);
    if (reduced) {
      if (await applyOp({ op: 'split', args: { kind } })) flashPieces(newKeys);
      return;
    }
    const el = pieceEls(kind).at(-1);
    const col = rootRef.current?.querySelector<HTMLElement>(`.ni-btb__col[data-col="${down}"]`);
    let dest: { x: number; y: number } | null = null;
    let carry: Animation | null = null;
    if (el && col) {
      const from = centerOf(el.getBoundingClientRect());
      dest = centerOf(col.getBoundingClientRect());
      el.style.zIndex = '3';
      carry = move(
        el,
        [
          { transform: 'translate(0px, 0px)' },
          { transform: `translate(${dest.x - from.x}px, ${dest.y - from.y}px)` },
        ],
        GATHER_MS,
      );
      await settle([carry]);
      if (!alive.current) return;
      await pause(HOLD_MS);
      if (!alive.current) return;
    }
    const changed = await applyOp({ op: 'split', args: { kind } });
    if (!changed) {
      carry?.cancel();
      if (el) el.style.zIndex = '';
      return;
    }
    if (!dest) return;
    const at = dest;
    const unit = layoutRef.current.u;
    const news = pieceEls(down).slice(first, first + 10);
    const spread = news.map((n, j) => {
      const p = centerOf(n.getBoundingClientRect());
      const off = bundleOffset(down, j, unit);
      n.style.zIndex = '3';
      return move(
        n,
        [
          { transform: `translate(${at.x + off.x - p.x}px, ${at.y + off.y - p.y}px)` },
          { transform: 'translate(0px, 0px)' },
        ],
        LAND_MS,
      );
    });
    await settle(spread);
    for (const a of spread) a.cancel();
    for (const n of news) n.style.zIndex = '';
  };

  const onTrade = async (op: 'fuse' | 'split', kind: PieceKind) => {
    if (!interactive) return;
    trace('tap', `${op}-${kind}`);
    setInvite(null);
    setBusy(true);
    try {
      await (op === 'fuse' ? runFuse(kind) : runSplit(kind));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  // ---------- demo: add-piece flies from the tray, count-by counts aloud ----------

  const runAdd = async (kind: PieceKind, count: number) => {
    const n = Math.trunc(count);
    const ms = Math.abs(n) > 5 ? FLY_MS / 2 : FLY_MS;
    for (let i = 0; i < Math.abs(n); i++) {
      if (!alive.current) return;
      const pile = pileEl(kind);
      const pileAt = pile ? centerOf(pile.getBoundingClientRect()) : null;
      if (n > 0) {
        const index = stateRef.current.mat[kind];
        if (!(await applyOp({ op: 'add-piece', args: { kind } }))) return;
        if (reduced) {
          flashPieces([`${kind}-${index}`]);
          continue;
        }
        const el = pieceEls(kind)[index];
        if (!el || !pileAt) continue;
        const p = centerOf(el.getBoundingClientRect());
        el.style.zIndex = '3';
        const fly = move(
          el,
          [
            { transform: `translate(${pileAt.x - p.x}px, ${pileAt.y - p.y}px) scale(0.7)` },
            { transform: 'translate(0px, 0px) scale(1)' },
          ],
          ms,
        );
        await settle([fly]);
        fly.cancel();
        el.style.zIndex = '';
      } else {
        const el = pieceEls(kind).at(-1);
        if (!reduced && el && pileAt) {
          const p = centerOf(el.getBoundingClientRect());
          el.style.zIndex = '3';
          await settle([
            move(
              el,
              [
                { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
                {
                  transform: `translate(${pileAt.x - p.x}px, ${pileAt.y - p.y}px) scale(0.7)`,
                  opacity: 0.4,
                },
              ],
              ms,
            ),
          ]);
        }
        if (!(await applyOp({ op: 'add-piece', args: { kind, count: -1 } }))) return;
      }
    }
  };

  const runCountBy = async (kind: PieceKind) => {
    await applyOp({ op: 'count-by', args: { kind } });
    const n = stateRef.current.mat[kind];
    const step = PIECE_VALUE[kind];
    if (n === 0) return;
    if (reduced) {
      setCounted({ kind, upTo: n - 1 });
      sayNumber(shown(n * step, decimal));
      setTimeout(() => {
        if (alive.current) setCounted(null);
      }, FLASH_MS);
      return;
    }
    for (let i = 0; i < n; i++) {
      setCounted({ kind, upTo: i });
      sayNumber(shown((i + 1) * step, decimal));
      await pause(COUNT_MS);
      if (!alive.current) return;
    }
    await pause(300);
    if (alive.current) setCounted(null);
  };

  /** Read mode: Pip types the number on the pad, key by key (like number-pad's demo). */
  const typeAnswer = async (value: number) => {
    const chars = String(shown(value, decimal)).split('') as PadKey[];
    let typed = '';
    setText('');
    for (const ch of chars) {
      setPressedKey(ch);
      await pause(KEY_MS);
      if (!alive.current) return;
      typed += ch;
      setText(typed);
    }
    setPressedKey(null);
    await pause(KEY_MS);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setBusy(true);
      setInvite(null);
      try {
        const kind = kindOf(action.args?.kind);
        switch (action.op) {
          case 'add-piece': {
            const count = Number(action.args?.count ?? 1);
            if (kind && Number.isFinite(count)) await runAdd(kind, count);
            break;
          }
          case 'fuse':
            if (kind) await runFuse(kind);
            break;
          case 'split':
            if (kind) await runSplit(kind);
            break;
          case 'count-by':
            if (kind) await runCountBy(kind);
            break;
          case 'answer': {
            const v = Number(action.args?.value);
            if (read && Number.isFinite(v)) await typeAnswer(v);
            await applyOp(action);
            break;
          }
        }
      } finally {
        setPressedKey(null);
        if (alive.current) setBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  const inviteTarget = ((): string | null => {
    if (!invite) return null;
    const k = kindOf(invite.args?.kind);
    switch (invite.op) {
      case 'add-piece':
        if (Number(invite.args?.count ?? 1) < 0) return 'tray';
        return k ? `tray-${k}` : null;
      case 'fuse':
      case 'split':
        return k ? `${invite.op}-${k}` : null;
      case 'answer':
        return read ? 'answer' : 'check';
      default:
        return null;
    }
  })();

  // ---------- child input ----------

  const dnd = useDragToTarget<string, Target>({
    disabled: !interactive || read,
    trace,
    canPlace: (item, target) => (item.startsWith('tray-') ? target === 'mat' : target === 'tray'),
    onSelect: (item) => {
      const p = item ? parseItem(item) : null;
      if (p && prefs.speakOnTap) say(pieceKey(p.kind, decimal));
    },
    onPlace: ({ item, target }) => {
      const p = parseItem(item);
      if (!p) return;
      setInvite(null);
      if (p.where === 'tray' && target === 'mat') {
        void applyOp({ op: 'add-piece', args: { kind: p.kind } });
      } else if (p.where === 'mat' && target === 'tray') {
        void applyOp({ op: 'add-piece', args: { kind: p.kind, count: -1 } });
      }
    },
  });

  const maxDigits = decimal ? 4 : Math.max(4, String(config.target).length);
  const onKey = (key: PadKey) => {
    if (!interactive) return;
    if (key === '.' && !decimal) return;
    trace('tap', `key-${key}`);
    setInvite(null);
    setText((prev) => applyPadKey(prev, key, maxDigits));
  };

  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    let s = stateRef.current;
    if (read) {
      const v = padValue(textRef.current);
      if (v === null) return false;
      s = applyAction(s, { op: 'answer', args: { value: decimal ? Math.round(v * 100) : v } });
    }
    const response = model.toResponse(s);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- render ----------

  const hand = (
    <span className="ni-hand ni-btb__hand">
      <HandPointerIcon />
    </span>
  );

  const renderPiece = (kind: PieceKind, i: number): ReactNode => {
    const key = `${kind}-${i}`;
    const marks = {
      'data-kind': kind,
      'data-flash': flash.has(key) ? 'true' : undefined,
      'data-counted': counted?.kind === kind && i <= counted.upTo ? 'true' : undefined,
    };
    const cls = `ni-btb__piece ni-btb__piece--${kind}`;
    if (read) {
      return (
        <span key={key} className={cls} {...marks}>
          <PieceArt kind={kind} />
        </span>
      );
    }
    const props = dnd.itemProps(`mat-${kind}-${i}`, { label: t(pieceKey(kind, decimal)) });
    return (
      <span key={key} {...props} className={`${props.className} ${cls}`} {...marks}>
        <PieceArt kind={kind} />
      </span>
    );
  };

  const renderColumn = (kind: PieceKind) => {
    const n = state.mat[kind];
    const pieces = Array.from({ length: n }, (_, i) => renderPiece(kind, i));
    if (kind !== 'ones') return pieces;
    // Ones sit in frames of ten (two rows of five), so they can be counted by fives and tens.
    const frames: ReactNode[] = [];
    for (let f = 0; f * 10 < n; f++) {
      // Frames are positional: frame f holds ones 10f to 10f + 9.
      frames.push(
        <span key={`frame-${f}`} className="ni-btb__frame">
          {pieces.slice(f * 10, f * 10 + 10)}
        </span>,
      );
    }
    return frames;
  };

  const tradeButton = (op: 'fuse' | 'split', kind: PieceKind) => {
    const id = `${op}-${kind}`;
    const to = (op === 'fuse' ? larger(kind) : smaller(kind)) as PieceKind;
    const can = op === 'fuse' ? state.mat[kind] >= 10 : state.mat[kind] >= 1;
    return (
      <span key={id} className="ni-btb__slot">
        <IconButton
          label={op === 'fuse' ? fuseKey(kind, decimal) : splitKey(kind, decimal)}
          icon={<TradeIcon from={kind} to={to} fuse={op === 'fuse'} />}
          disabled={!interactive || !can}
          onPress={() => void onTrade(op, kind)}
          className={['ni-btb__trade', inviteTarget === id ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data={{ 'data-trade': id }}
        />
        {inviteTarget === id ? hand : null}
      </span>
    );
  };

  const workStyle = {
    gridTemplateColumns: layout.columns.map((c) => `minmax(${c.width}px, 1fr)`).join(' '),
    '--u': `${u}px`,
    '--d': `${cubeDepth(u)}px`,
    '--gap-ones': `${pieceGap('ones', u)}px`,
    '--gap-tens': `${pieceGap('tens', u)}px`,
    '--gap-big': `${pieceGap('hundreds', u)}px`,
    '--gap-frames': `${onesGroupGap(u)}px`,
    '--board-h': `${boardH}px`,
    '--board-pad': `${BOARD_PAD}px`,
    '--col-gap': `${COL_GAP}px`,
  } as CSSProperties;

  const board = read ? (
    <div className="ni-btb__board" aria-hidden="true" />
  ) : (
    (() => {
      const props = dnd.targetProps('mat', { label: t('ui.widget.btb.mat') });
      return <div {...props} className={`${props.className} ni-btb__board`} />;
    })()
  );

  const work = (
    <div className="ni-btb__work" style={workStyle} data-fits={layout.fits ? undefined : 'false'}>
      {board}
      {kinds.map((k, i) => (
        <div key={k} className="ni-btb__col" data-col={k} style={{ gridColumn: i + 1 }}>
          {renderColumn(k)}
        </div>
      ))}
      {read
        ? null
        : kinds.map((k, i) => (
            <div key={`trades-${k}`} className="ni-btb__trades" style={{ gridColumn: i + 1 }}>
              {tradesOf(k).map((op) => tradeButton(op, k))}
            </div>
          ))}
    </div>
  );

  if (read) {
    const name = t('ui.widget.answer');
    return (
      <div
        ref={rootRef}
        className="ni-btb"
        data-mode="read"
        data-tier={tier}
        data-disabled={disabled ? 'true' : undefined}
      >
        <div className="ni-btb__left" ref={leftRef}>
          <div className="ni-btb__picture" role="img" aria-label={t('ui.widget.picture')}>
            {work}
          </div>
          <span className="ni-btb__slot">
            <button
              type="button"
              className={[
                'ni-number',
                'ni-btb__blank',
                inviteTarget === 'answer' ? 'ni-invite' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-size="lg"
              style={{ minWidth: `${maxDigits * 0.62 + 0.8}em` }}
              data-state={disabled ? 'idle' : 'active'}
              data-empty={text === '' ? 'true' : undefined}
              aria-label={`${name}: ${text}`.trim()}
              disabled={!interactive}
              onClick={() => trace('tap', 'answer')}
            >
              {text === '' ? <span className="ni-number__slot" /> : <span>{text}</span>}
              {!disabled ? <span className="ni-number__caret" /> : null}
            </button>
            {inviteTarget === 'answer' ? hand : null}
          </span>
        </div>
        <div className="ni-btb__side ni-btb__side--pad">
          <NumberPadKeys
            onKey={onKey}
            onEnter={submit}
            allowDecimal={decimal}
            disabled={!interactive}
            highlighted={pressedKey}
          />
          <CheckButton onPress={submit} disabled={!interactive || padValue(text) === null} />
        </div>
      </div>
    );
  }

  const goalValue = shown(config.target, decimal);
  const exactKinds =
    config.mode === 'build-exact'
      ? (['hundreds', 'tens', 'ones'] as const).filter((k) => config.exact?.[k] !== undefined)
      : [];
  const trayKinds = KINDS.filter((k) => config.pieces[k]);
  const ready = model.toResponse(state) !== null;

  return (
    <div
      ref={rootRef}
      className="ni-btb"
      data-mode={config.mode}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-btb__left" ref={leftRef}>
        {work}
      </div>
      <div className="ni-btb__side">
        <div className="ni-btb__ask">
          <button
            type="button"
            className="ni-number ni-btb__goal"
            data-size="lg"
            aria-label={t('ui.widget.btb.goal', { n: goalValue })}
            disabled={!interactive}
            onClick={() => {
              trace('tap', 'goal');
              if (prefs.speakOnTap) sayNumber(goalValue);
            }}
          >
            {goalValue}
          </button>
          {exactKinds.map((k) => {
            const n = config.exact?.[k] ?? 0;
            const line = exactKey(k, n, decimal);
            return (
              <button
                key={k}
                type="button"
                className="ni-btb__exact"
                aria-label={t(line, { n })}
                disabled={!interactive}
                onClick={() => {
                  trace('tap', `exact-${k}`);
                  if (prefs.speakOnTap) say(line, { n });
                }}
              >
                <span className="ni-btb__exactnum" aria-hidden="true">
                  {n}
                </span>
                <span className="ni-btb__times" aria-hidden="true">
                  ×
                </span>
                <span className="ni-btb__exactart" data-kind={k}>
                  <PieceArt kind={k} u={k === 'ones' ? 26 : 6.5} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="ni-btb__tray">
          {(() => {
            const props = dnd.targetProps('tray', { label: t('ui.widget.btb.tray') });
            return (
              <div
                {...props}
                className={[
                  props.className,
                  'ni-btb__traypad',
                  inviteTarget === 'tray' ? 'ni-invite' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="ni-btb__return">
                  <ReturnIcon />
                  {inviteTarget === 'tray' ? hand : null}
                </span>
              </div>
            );
          })()}
          <div className="ni-btb__piles" data-count={trayKinds.length}>
            {trayKinds.map((k) => {
              const id = `tray-${k}`;
              const supply = traySupply(config, state.taken, k);
              const limited = Number.isFinite(supply);
              const empty = supply <= 0;
              // The name includes the badge's numeral (axe label-content-name-mismatch).
              const left = limited ? t('ui.widget.btb.left', { n: Math.max(0, supply) }) : null;
              const label = left ? `${t(pieceKey(k, decimal))}, ${left}` : t(pieceKey(k, decimal));
              const props = dnd.itemProps(id, { label, disabled: empty });
              return (
                <span key={id} className="ni-btb__slot ni-btb__pileslot">
                  <span
                    {...props}
                    className={[
                      props.className,
                      'ni-btb__pile',
                      inviteTarget === id ? 'ni-invite' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-kind={k}
                    data-empty={empty ? 'true' : undefined}
                  >
                    <PileArt kind={k} />
                    {limited ? (
                      <span className="ni-btb__badge" aria-hidden="true">
                        {supply}
                      </span>
                    ) : null}
                  </span>
                  {inviteTarget === id ? hand : null}
                </span>
              );
            })}
          </div>
        </div>
        <span className="ni-btb__slot ni-btb__checkslot">
          <CheckButton
            onPress={submit}
            disabled={!interactive || !ready}
            invited={inviteTarget === 'check'}
          />
          {inviteTarget === 'check' ? hand : null}
        </span>
      </div>
    </div>
  );
}

export default BaseTenBuildWidget;
