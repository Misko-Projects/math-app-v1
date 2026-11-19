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
import { HandPointerIcon } from '../../primitives/icons';
import { usePress } from '../../primitives/usePress';
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
  rodHit,
  smaller,
  unitCandidates,
} from './layout';
import { PieceArt, PileArt, PlaceIcon, TradeIcon } from './pieces';
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

/*
 * The mat takes the widget's full height. In the 1280 × 800 widget area (about 1146 × 666 px):
 * 2 px root padding, a 5 px wooden frame, the header row (40 px; 58 px in K for 40 px icons),
 * 8 px above and below the pieces, and the rest for the pieces (596 px; 578 px in K).
 */
const WIDGET_H = 666;
const ROOT_PAD_Y = 2;
const BODY_PAD = 8;
const HEAD_H = { k: 58, 'g1-up': 40 } as const;
const FRAME = 5;
/** Room between the wooden frame and the outer columns (px), so pieces stay off the frame. */
const INSET = 4;
const COL_PAD = 4;
/** Each side of the trade buttons in a gutter between two columns (px). */
const GUTTER_PAD = 3;
/** Read mode: the columns sit side by side with this gap (no trades). */
const COL_GAP = 12;
/** Between the mat and the side panel (px). */
const SIDE_GAP = 12;

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
/** A column header's word: the place's name (Hundreds…; with decimals Ones, Tenths…). */
const colKey = (k: PieceKind, decimal: boolean): NarrationKey =>
  `ui.widget.btb.${dec(decimal)}col.${k}`;
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

/** A small crate holding pieces: marks a pile's stock tag (how many the tray has left). */
function StockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <rect
        x="6"
        y="3"
        width="4"
        height="11"
        rx="1"
        fill="var(--color-shallows)"
        stroke="var(--color-cloud)"
        strokeWidth="1.4"
      />
      <rect
        x="12"
        y="5"
        width="4"
        height="9"
        rx="1"
        fill="var(--color-shallows)"
        stroke="var(--color-cloud)"
        strokeWidth="1.4"
      />
      <path
        d="M3 11h18l-2 9H5z"
        fill="var(--color-wood)"
        stroke="var(--color-cloud)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A trade button in a gutter: icon (the larger piece on the left, ten smaller on the right, an
 * arrow showing which way), a short caption in text mode ("Make" / "Split"), and the full spoken
 * label as its name ("Make a ten"). In K mode it is icon-only and speaks its label (06 §5).
 */
function TradeButton({
  id,
  label,
  caption,
  icon,
  disabled,
  invited,
  onPress,
}: {
  id: string;
  label: NarrationKey;
  caption: NarrationKey;
  icon: ReactNode;
  disabled: boolean;
  invited: boolean;
  onPress: () => void;
}) {
  const t = useNarrationText();
  const { textLabels } = useUiPreferences();
  const press = usePress({ label, onPress });
  return (
    <button
      type="button"
      className={['ni-btn', 'ni-tone-cloud', 'ni-btb__trade', invited ? 'ni-invite' : '']
        .filter(Boolean)
        .join(' ')}
      data-trade={id}
      aria-label={t(label)}
      disabled={disabled}
      onClick={press}
    >
      <span className="ni-btb__tradeicon">{icon}</span>
      {textLabels ? <span className="ni-btb__tradecap">{t(caption)}</span> : null}
    </button>
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
  const [avail, setAvail] = useState(1140);
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
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      // The content width, fractional and untransformed (clientWidth rounds).
      const s = getComputedStyle(el);
      const px = (v: string) => Number.parseFloat(v) || 0;
      const w = px(s.width) - px(s.paddingLeft) - px(s.paddingRight);
      if (w > 0) setAvail(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const kinds = columnKinds(config, state.mat);
  const kMode = prefs.ageMode === 'k';
  const targetMin = TARGET_PX[prefs.ageMode].min;
  const gutter = read ? COL_GAP : targetMin + 2 * GUTTER_PAD;
  // The kit pad: three keys of --target-big with 12 px gaps.
  const padSide = 3 * TARGET_PX[prefs.ageMode].big + 2 * 12;
  const headH = HEAD_H[prefs.ageMode];
  const bodyH = WIDGET_H - 2 * ROOT_PAD_Y - 2 * FRAME - headH - 2 * BODY_PAD;
  const layout = matLayout({
    kinds,
    counts: state.mat,
    units: unitCandidates(kMode),
    // Half a px of slack: computed widths are fractional.
    width: avail - 0.5,
    height: bodyH,
    gutter,
    columnPad: COL_PAD,
    frame: FRAME + INSET,
    gap: SIDE_GAP,
    sideMin: read ? padSide : kMode ? 150 : 156,
    sideMax: read ? padSide : 260,
    headerWidth: (kind) =>
      prefs.textLabels ? 44 + 11 * t(colKey(kind, decimal)).length : kMode ? 56 : 44,
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

  /** Splits `items` into consecutive groups of `size` (positional: group g holds g·size…). */
  const chunks = (items: ReactNode[], size: number) => {
    const out: ReactNode[][] = [];
    for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + size));
    return out;
  };

  /** A column's pieces, laid out exactly as layout.ts planned them (no reflow surprises). */
  const renderColumn = (kind: PieceKind) => {
    const n = state.mat[kind];
    const plan = layout.columns.find((c) => c.kind === kind)?.plan ?? { cols: 1, rows: 1 };
    const pieces = Array.from({ length: n }, (_, i) => renderPiece(kind, i));
    if (kind !== 'ones') {
      // Rows of pieces: rods lie side by side like a bundle of sticks, flats in a grid.
      return chunks(pieces, plan.cols).map((row, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
        <span key={r} className="ni-btb__row">
          {row}
        </span>
      ));
    }
    // Ones sit in frames of ten (rows or columns of five), stacked top to bottom in reading order.
    const frames = chunks(pieces, 10).map((group, f) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: frame f holds ones 10f to 10f + 9
      <span key={f} className="ni-btb__frame" data-orient={layout.orient}>
        {group}
      </span>
    ));
    return (
      <span className="ni-btb__stacks">
        {chunks(frames, plan.rows).map((stack, s) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stacks are positional
          <span key={s} className="ni-btb__stack">
            {stack}
          </span>
        ))}
      </span>
    );
  };

  /** One trade in the gutter between `big`'s column and the next smaller one. */
  const tradeButton = (op: 'fuse' | 'split', big: PieceKind, small: PieceKind) => {
    const kind = op === 'fuse' ? small : big;
    const id = `${op}-${kind}`;
    const can = op === 'fuse' ? state.mat[small] >= 10 : state.mat[big] >= 1;
    return (
      <span key={id} className="ni-btb__slot">
        <TradeButton
          id={id}
          label={op === 'fuse' ? fuseKey(small, decimal) : splitKey(big, decimal)}
          caption={op === 'fuse' ? 'ui.widget.btb.cap.make' : 'ui.widget.btb.cap.split'}
          icon={<TradeIcon big={big} small={small} fuse={op === 'fuse'} />}
          disabled={!interactive || !can}
          invited={inviteTarget === id}
          onPress={() => void onTrade(op, kind)}
        />
        {inviteTarget === id ? hand : null}
      </span>
    );
  };

  // Columns and gutters alternate: column, gutter (its trades), column, …
  const template = layout.columns
    .map((c, i) => `${i > 0 ? `${gutter}px ` : ''}minmax(${c.width}px, 1fr)`)
    .join(' ');
  const workStyle = {
    gridTemplateColumns: template,
    gridTemplateRows: `${headH}px ${bodyH + 2 * BODY_PAD}px`,
    '--u': `${u}px`,
    '--d': `${cubeDepth(u)}px`,
    '--rod-hit': `${rodHit(u)}px`,
    '--gap-ones': `${pieceGap('ones', u)}px`,
    '--gap-tens': `${pieceGap('tens', u)}px`,
    '--gap-big': `${pieceGap('hundreds', u)}px`,
    '--gap-frames': `${onesGroupGap(u)}px`,
    '--frame': `${FRAME}px`,
    '--inset': `${INSET}px`,
    '--body-pad': `${BODY_PAD}px`,
    '--col-pad': `${COL_PAD}px`,
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
      {kinds.map((kind, i) => (
        <div
          key={`head-${kind}`}
          className="ni-btb__head"
          style={{ gridColumn: 2 * i + 1 }}
          aria-hidden="true"
        >
          <span className="ni-btb__headicon" data-kind={kind}>
            <PlaceIcon kind={kind} big={kMode} />
          </span>
          {prefs.textLabels ? (
            <span className="ni-btb__headword">{t(colKey(kind, decimal))}</span>
          ) : null}
        </div>
      ))}
      {kinds.map((kind, i) => (
        <div key={kind} className="ni-btb__col" data-col={kind} style={{ gridColumn: 2 * i + 1 }}>
          {renderColumn(kind)}
        </div>
      ))}
      {kinds.slice(1).map((small, i) => {
        const big = kinds[i] as PieceKind;
        return (
          <div
            key={`gutter-${big}`}
            className="ni-btb__gutter"
            data-read={read ? 'true' : undefined}
            style={{ gridColumn: 2 * i + 2 }}
          >
            {read ? null : (
              <>
                {tradeButton('fuse', big, small)}
                {tradeButton('split', big, small)}
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  const rootStyle = {
    gridTemplateColumns: `minmax(0, 1fr) ${layout.sideWidth}px`,
    columnGap: `${SIDE_GAP}px`,
  } as CSSProperties;

  if (read) {
    const name = t('ui.widget.answer');
    return (
      <div
        ref={rootRef}
        className="ni-btb"
        data-mode="read"
        data-tier={tier}
        data-disabled={disabled ? 'true' : undefined}
        style={rootStyle}
      >
        <div className="ni-btb__picture" role="img" aria-label={t('ui.widget.picture')}>
          {work}
        </div>
        <div className="ni-btb__side ni-btb__side--pad">
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
  const limitedAny = trayKinds.some((k) => Number.isFinite(traySupply(config, state.taken, k)));
  // Balanced pile rows: all in one row if they fit, else 2 × 2 for four, else one column (never a
  // lone pile on a row of its own).
  // Piles in a tray with limits are wider (their stock tag sits inside them).
  const pileW = limitedAny ? Math.max(targetMin * 1.25, 104) : targetMin * 1.25;
  const pileFits = (c: number) => c * pileW + (c - 1) * 12 <= layout.sideWidth - 20;
  const pileCols =
    [trayKinds.length, trayKinds.length === 4 ? 2 : 0, 1].find((c) => c > 0 && pileFits(c)) ?? 1;
  const ready = model.toResponse(state) !== null;

  return (
    <div
      ref={rootRef}
      className="ni-btb"
      data-mode={config.mode}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      style={rootStyle}
    >
      {work}
      <div className="ni-btb__side">
        <div className="ni-btb__ask">
          <button
            type="button"
            className="ni-number ni-btb__goal"
            // 72 px when the side panel has room for it, else 48 px (both ≥ 48 px).
            data-size={String(goalValue).length * 44 + 70 <= layout.sideWidth ? 'lg' : undefined}
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
          <div
            className="ni-btb__piles"
            data-limited={limitedAny ? 'true' : undefined}
            style={{
              gridTemplateColumns: `repeat(${pileCols}, ${limitedAny ? 'var(--pile-w)' : 'var(--pile)'})`,
            }}
          >
            {trayKinds.map((k) => {
              const id = `tray-${k}`;
              const supply = traySupply(config, state.taken, k);
              const limited = Number.isFinite(supply);
              const empty = supply <= 0;
              const n = Math.max(0, supply);
              // The name includes the stock tag's text (axe label-content-name-mismatch).
              const left = limited ? t('ui.widget.btb.left', { n }) : null;
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
                      // The tray's stock of this piece: a crate icon and "2 left" (K: the pieces
                      // left, drawn small; a numeral at 0 or above 5).
                      <span className="ni-btb__stock" data-empty={empty ? 'true' : undefined}>
                        <span className="ni-btb__stockicon" aria-hidden="true">
                          <StockIcon />
                        </span>
                        {prefs.textLabels ? (
                          <span className="ni-btb__stocktext">{left}</span>
                        ) : n > 0 && n <= 5 ? (
                          <span className="ni-btb__stockmini" aria-hidden="true">
                            {Array.from({ length: n }, (_, i) => (
                              // biome-ignore lint/suspicious/noArrayIndexKey: identical marks
                              <span key={i} className="ni-btb__stockpiece" data-kind={k} />
                            ))}
                          </span>
                        ) : (
                          <span className="ni-btb__stocktext">{n}</span>
                        )}
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
