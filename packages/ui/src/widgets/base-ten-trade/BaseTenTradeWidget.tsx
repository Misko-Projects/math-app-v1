import {
  type BaseTenTradeState,
  COLUMNS,
  type Column,
  type FormatModel,
  formatModel,
  type Hto,
  htoValue,
} from '@number-island/engine';
import type { ExpressionSpec, NarrationKey, WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  ExpressionView,
  NumberPadKeys,
  type PadKey,
  padValue,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { breakGhosts, bundleGhosts, EASE, type Ghost, moveGhosts } from './fx';
import {
  ageSizes,
  type Box,
  COL_PAD,
  extent,
  GROUP_PAD,
  growCaps,
  MAT_BORDER,
  naturalLayout,
  nestInner,
  placePieces,
  placeTaken,
  planCaps,
  planMat,
  ROW_GAP,
  stripWidth,
} from './layout';
import './base-ten-trade.css';

/**
 * `base-ten-trade` (03 §5.5): a hundreds | tens | ones place-value mat. The child trades between
 * neighbouring columns (split one piece into ten of the next smaller kind, or group ten into one of
 * the next larger), and for `compute` adds the operand's waiting pieces onto the mat (`+`) or takes
 * pieces away into the seagull's nest (`-`). `showAlgorithm` writes the column algorithm beside the
 * mat as the child trades; `thenAsk` adds a number pad for the result. "Check" sends the model's
 * state response `{ hundreds, tens, ones, value? }`; any mat the checker accepts is fine.
 *
 * No stimulus reveals the answer: the mat shows pieces, never counts or a total; the algorithm's
 * result boxes stay empty unless a demo writes into them.
 *
 * Trace targets: `pending-<column>` (a waiting group), `mat-<column>-<i>` (the piece taken from a
 * column), `col-<column>` (a column), `take` (the nest), `trade-<from>-<to>`, `key-<k>`.
 * Demo ops (03 §5.5): `trade {from, to}`, `combine {column}`, `take {column, count}`,
 * `write-digit {column, value}`, plus `answer {value}`.
 */

const OPS = ['trade', 'combine', 'take', 'write-digit', 'answer'] as const;
const KEY_MS = 340;
const FLASH_MS = 900;
const POP_MS = 320;
/** The widget's design height at 1280 × 800 (06 §2 widget area), padding included. */
const BUDGET = 660;
const ROOT_PAD_Y = 12;
/** The algorithm card's height (see .ni-btt__work in the stylesheet). */
const WORK_H = 200;
const SIDE_GAP = 12;

type Config = ConfigFor<'base-ten-trade'>;
type State = BaseTenTradeState;
type Via = 'drag' | 'tap' | 'demo';

const MODEL = formatModel('base-ten-trade') as FormatModel<'base-ten-trade', State> | undefined;

const COL_KEY: Record<Column, NarrationKey> = {
  hundreds: 'ui.widget.btt.col.hundreds',
  tens: 'ui.widget.btt.col.tens',
  ones: 'ui.widget.btt.col.ones',
};
const PIECE_KEY: Record<Column, NarrationKey> = {
  hundreds: 'ui.widget.btt.piece.hundreds',
  tens: 'ui.widget.btt.piece.tens',
  ones: 'ui.widget.btt.piece.ones',
};
const PENDING_KEY: Record<Column, NarrationKey> = {
  hundreds: 'ui.widget.btt.pending.hundreds',
  tens: 'ui.widget.btt.pending.tens',
  ones: 'ui.widget.btt.pending.ones',
};
/** Split one piece of the larger column (keyed by it). */
const SPLIT_KEY: Partial<Record<Column, NarrationKey>> = {
  hundreds: 'ui.widget.btt.split.hundreds',
  tens: 'ui.widget.btt.split.tens',
};
/** Group ten pieces of the smaller column (keyed by it). */
const GROUP_KEY: Partial<Record<Column, NarrationKey>> = {
  tens: 'ui.widget.btt.group.tens',
  ones: 'ui.widget.btt.group.ones',
};

const ALIASES: Record<string, Column> = {
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
/** The column an op argument names (the model's aliases: `tens`, `ten`, `rod`). */
const columnArg = (v: unknown): Column | undefined =>
  typeof v === 'string' ? ALIASES[v] : undefined;

const smallerOf = (c: Column): Column | undefined => COLUMNS[COLUMNS.indexOf(c) + 1];
const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
const EMPTY: ReadonlySet<string> = new Set();

const digitsOf = (h: Hto) => {
  const v = htoValue(h);
  const s = String(v);
  return COLUMNS.map((_, i) => {
    const d = s[s.length - 3 + i];
    return d === undefined ? '' : d;
  });
};

// ---------- pictures ----------

/** One base-ten piece, drawn at `box` (px). Hidden while its animation ghost is on the way. */
function Piece({
  kind,
  box,
  u,
  id,
  hidden,
  dx = 0,
  dy = 0,
}: {
  kind: Column;
  box: Box;
  u: number;
  id: string;
  hidden?: boolean;
  dx?: number;
  dy?: number;
}) {
  return (
    <span
      className={`ni-btt__piece ni-btt__piece--${kind}`}
      data-piece={id}
      data-arriving={hidden ? 'true' : undefined}
      style={
        {
          left: box.x + dx,
          top: box.y + dy,
          width: box.w,
          height: box.h,
          '--u': `${u}px`,
        } as CSSProperties
      }
    />
  );
}

/** A small picture of a piece (column headers and goal chips). */
function PieceIcon({ kind }: { kind: Column }) {
  if (kind === 'hundreds') {
    const lines = range(1, 10).map((i) => 4 + i * 3.2);
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" className="ni-btt__icon">
        <rect x="4" y="4" width="32" height="32" rx="2" className="ni-btt__icon-fill" />
        {lines.map((p) => (
          <path key={p} d={`M${p} 4V36M4 ${p}H36`} className="ni-btt__icon-grid" />
        ))}
        <rect x="4" y="4" width="32" height="32" rx="2" className="ni-btt__icon-edge" />
      </svg>
    );
  }
  if (kind === 'tens') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" className="ni-btt__icon">
        <rect x="16" y="2" width="8" height="36" rx="1.5" className="ni-btt__icon-fill" />
        {range(1, 10).map((i) => (
          <path key={i} d={`M16 ${2 + i * 3.6}H24`} className="ni-btt__icon-grid" />
        ))}
        <rect x="16" y="2" width="8" height="36" rx="1.5" className="ni-btt__icon-edge" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false" className="ni-btt__icon">
      <rect x="13" y="13" width="14" height="14" rx="2" className="ni-btt__icon-fill" />
      <rect x="13" y="13" width="14" height="14" rx="2" className="ni-btt__icon-edge" />
    </svg>
  );
}

/**
 * A trade button's icon: the larger piece on the left, ten smaller ones on the right (the mat's
 * own order), and an arrow saying which way the trade goes.
 */
function TradeIcon({ larger, dir }: { larger: Column; dir: 'split' | 'group' }) {
  const arrow = dir === 'split' ? 'M17 22H35M29 15l7 7-7 7' : 'M35 22H17M23 15l-7 7 7 7';
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true" focusable="false" width="100%" height="100%">
      {larger === 'hundreds' ? (
        <>
          <rect x="1.5" y="10" width="13" height="24" rx="1.5" className="ni-btt__icon-fill" />
          <path
            d="M1.5 14.8H14.5M1.5 19.6H14.5M1.5 24.4H14.5M1.5 29.2H14.5M6 10V34M10 10V34"
            className="ni-btt__icon-grid"
          />
          <rect x="1.5" y="10" width="13" height="24" rx="1.5" className="ni-btt__icon-edge" />
          {range(0, 10).map((i) => (
            <rect
              key={i}
              x={41 + (i % 5) * 4.6}
              y={i < 5 ? 2 : 23}
              width="3.2"
              height="19"
              rx="1"
              className="ni-btt__icon-piece"
            />
          ))}
        </>
      ) : (
        <>
          <rect x="5" y="2" width="7" height="40" rx="1.5" className="ni-btt__icon-fill" />
          {range(1, 10).map((i) => (
            <path key={i} d={`M5 ${2 + i * 4}H12`} className="ni-btt__icon-grid" />
          ))}
          <rect x="5" y="2" width="7" height="40" rx="1.5" className="ni-btt__icon-edge" />
          {range(0, 10).map((i) => (
            <rect
              key={i}
              x={i < 5 ? 42 : 52}
              y={2 + (i % 5) * 8.2}
              width="7"
              height="7"
              rx="1"
              className="ni-btt__icon-piece"
            />
          ))}
        </>
      )}
      <path d={arrow} className="ni-btt__icon-arrow" />
    </svg>
  );
}

/** Twigs woven across the nest's front rim (x, y, length, tilt), in its 400 × 40 box. */
const TWIGS: readonly [number, number, number, number][] = [
  [14, 14, 46, -12],
  [52, 22, 58, 8],
  [96, 12, 52, -6],
  [140, 24, 64, 10],
  [190, 14, 56, -9],
  [236, 25, 60, 7],
  [282, 13, 54, -10],
  [324, 23, 58, 9],
  [356, 12, 36, -14],
];

/**
 * The seagull's nest (take away): a shallow woven hollow the pieces rest in, a twiggy front rim
 * below them, and the gull perched on the right end. The pieces are never covered.
 */
function NestArt() {
  return (
    <>
      <svg
        className="ni-btt__nest-art"
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* The opening, seen from a little above: a soft sandy hollow inside a twig ring. */}
        <ellipse
          cx="200"
          cy="44"
          rx="194"
          ry="38"
          fill="var(--color-sand-shadow)"
          stroke="var(--color-wood-deep)"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M40 30C120 16 280 16 360 30"
          fill="none"
          stroke="var(--color-wood)"
          strokeWidth="4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* The woven front wall. */}
        <path
          d="M6 46C6 84 96 98 200 98S394 84 394 46C360 66 290 76 200 76S40 66 6 46Z"
          fill="var(--color-wood)"
          stroke="var(--color-wood-deep)"
          strokeWidth="3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <svg
        className="ni-btt__nest-twigs"
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {TWIGS.map(([x, y, len, tilt]) => (
          <path
            key={x}
            d={`M${x} ${y}l${len} ${tilt * 0.4}`}
            stroke="var(--color-wood-deep)"
            strokeWidth="3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <svg className="ni-btt__gull" viewBox="0 0 88 80" aria-hidden="true" focusable="false">
        <path
          d="M30 50C30 34 44 26 60 30c14 3 24 14 24 26 0 10-10 16-26 16-18 0-28-8-28-22Z"
          fill="var(--color-cloud)"
          stroke="var(--color-ink)"
          strokeWidth="3"
        />
        <path
          d="M46 44c10-2 22 2 30 12-10 4-22 2-30-4Z"
          fill="var(--color-pebble)"
          stroke="var(--color-ink)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle
          cx="34"
          cy="26"
          r="15"
          fill="var(--color-cloud)"
          stroke="var(--color-ink)"
          strokeWidth="3"
        />
        <path
          d="M19 25 5 30l14 5Z"
          fill="var(--color-sunshine)"
          stroke="var(--color-sun-deep)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="31" r="1.8" fill="var(--color-coral)" />
        <path
          d="M72 52c5 2 9 5 11 9"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="29" cy="22" r="3" fill="var(--color-ink)" />
        <path
          d="M24 16c3-3 7-4 10-3"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </>
  );
}

function Hand() {
  return (
    <span className="ni-hand ni-btt__hand">
      <HandPointerIcon />
    </span>
  );
}

// ---------- trade button ----------

function TradeButton({
  from,
  to,
  larger,
  dir,
  enabled,
  interactive,
  invited,
  highlighted,
  onTrade,
}: {
  from: Column;
  to: Column;
  larger: Column;
  dir: 'split' | 'group';
  enabled: boolean;
  interactive: boolean;
  invited: boolean;
  highlighted: boolean;
  onTrade: (from: Column, to: Column) => void;
}) {
  const t = useNarrationText();
  const { textLabels } = useUiPreferences();
  // Split keys name the larger column; group keys the smaller one (`from` when grouping).
  const label = (dir === 'split' ? SPLIT_KEY[larger] : GROUP_KEY[from]) as NarrationKey;
  const press = usePress({ label, onPress: () => onTrade(from, to) });
  const id = `trade-${from}-${to}`;
  return (
    <span className="ni-btt__tradewrap">
      <button
        type="button"
        className={[
          'ni-btn',
          'ni-tone-cloud',
          'ni-btt__trade',
          invited ? 'ni-invite' : '',
          highlighted ? 'ni-btt__hi' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-trade={id}
        data-dir={dir}
        aria-label={t(label)}
        disabled={!interactive || !enabled}
        onClick={press}
      >
        <span className="ni-btt__tradeicon">
          <TradeIcon larger={larger} dir={dir} />
        </span>
        {textLabels ? (
          <span className="ni-btt__tradecap" aria-hidden="true">
            {t(dir === 'split' ? 'ui.widget.btt.split' : 'ui.widget.btt.group')}
          </span>
        ) : null}
      </button>
      {invited ? <Hand /> : null}
    </span>
  );
}

// ---------- the column algorithm ----------

function WorkCard({
  config,
  state,
  highlighted,
  invited,
}: {
  config: Config;
  state: State;
  highlighted: Column | null;
  invited: Column | null;
}) {
  const t = useNarrationText();
  const op = config.operation;
  if (!op) return null;
  const start = digitsOf(config.start);
  const operand = digitsOf(op.operand);
  // Net change from trades only (not from adding or taking): what a child writes as regrouping.
  const delta = (c: Column) => {
    const combined = op.op === '+' ? op.operand[c] - state.pending[c] : 0;
    return state.mat[c] - config.start[c] - combined + state.taken[c];
  };
  return (
    <fieldset className="ni-btt__work" aria-label={t('ui.widget.btt.work')}>
      {COLUMNS.map((c, i) => {
        const d = delta(c);
        // `-`: the new count above, the old digit crossed out. `+`: the number carried in above
        // (a column that took one carry and passed one on is 1 − 10 = −9: still a carried 1).
        const carried = ((d % 10) + 10) % 10;
        const note =
          op.op === '-' ? (d !== 0 ? config.start[c] + d : null) : carried > 0 ? carried : null;
        return (
          <span key={`n-${c}`} className="ni-btt__note" style={{ gridColumn: i + 2 }}>
            {note === null ? '' : note}
          </span>
        );
      })}
      {COLUMNS.map((c, i) => {
        const crossed = op.op === '-' && delta(c) !== 0 && start[i] !== '';
        return (
          <span
            key={`s-${c}`}
            className="ni-btt__digit"
            data-crossed={crossed ? 'true' : undefined}
            style={{ gridColumn: i + 2, gridRow: 2 }}
          >
            {start[i]}
          </span>
        );
      })}
      <span className="ni-btt__digit ni-btt__opsign" style={{ gridColumn: 1, gridRow: 3 }}>
        {op.op === '+' ? '+' : '−'}
      </span>
      {COLUMNS.map((c, i) => (
        <span key={`o-${c}`} className="ni-btt__digit" style={{ gridColumn: i + 2, gridRow: 3 }}>
          {operand[i]}
        </span>
      ))}
      <span className="ni-btt__rule" />
      {COLUMNS.map((c, i) => {
        const v = state.written[c];
        return (
          <span
            key={`r-${c}`}
            className={[
              'ni-btt__box',
              highlighted === c ? 'ni-btt__hi' : '',
              invited === c ? 'ni-invite' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-digit={c}
            data-empty={v === null ? 'true' : undefined}
            style={{ gridColumn: i + 2, gridRow: 5 }}
          >
            {v === null ? '' : v}
            {invited === c ? <Hand /> : null}
          </span>
        );
      })}
    </fieldset>
  );
}

// ---------- the widget ----------

export function BaseTenTradeWidget(props: WidgetProps<Config>) {
  if (!MODEL) return null;
  return <TradeMat {...props} model={MODEL} />;
}

function TradeMat({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
  model,
}: WidgetProps<Config> & { model: FormatModel<'base-ten-trade', State> }) {
  const t = useNarrationText();
  const { say } = useSpeech();
  const { speakOnTap, ageMode, textLabels } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const [state, setState] = useState<State>(() => model.initialState(config));
  const stateRef = useRef(state);
  const [touched, setTouched] = useState(false);
  const [text, setText] = useState('');
  const textRef = useRef(text);
  textRef.current = text;
  const [arriving, setArriving] = useState<ReadonlySet<string>>(EMPTY);
  const [flash, setFlash] = useState<ReadonlySet<string>>(EMPTY);
  const [grab, setGrab] = useState<Partial<Record<Column, number>>>({});
  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [demoHi, setDemoHi] = useState<string | null>(null);
  const [mainW, setMainW] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<HTMLDivElement | null>(null);
  const bodyRefs = useRef<Partial<Record<Column, HTMLDivElement | null>>>({});

  const interactive = !disabled && !demoBusy;
  const op = config.goal === 'compute' ? config.operation : undefined;
  const isPlus = op?.op === '+';
  const isMinus = op?.op === '-';
  const showWork = config.showAlgorithm && Boolean(op);
  // The algorithm and the pad together fill the side panel: "check" then sits after the problem.
  const checkInProblem = showWork && config.thenAsk;
  const age = ageMode === 'k' ? 'k' : 'g1-up';
  const sizes = ageSizes(age);
  const pictorial = tier !== 'concrete';

  const commit = useCallback((next: State) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // ---------- layout ----------

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const measure = () => setMainW(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseCaps = useMemo(() => planCaps(config), [config]);
  // Room for what the child has made, too: off the expected path the unit shrinks rather than
  // letting pieces overlap.
  // Once everything is added the tray goes, and the mat grows into its room.
  const trayEmpty = !COLUMNS.some((c) => state.pending[c] > 0);
  const caps = useMemo(() => {
    const grown = growCaps(baseCaps, state.mat, state.taken);
    return trayEmpty && grown.tray ? { ...grown, tray: null } : grown;
  }, [baseCaps, state.mat, state.taken, trayEmpty]);
  const bigTarget = age === 'k' ? 96 : 76;
  const problemH = config.thenAsk ? bigTarget + 26 : config.goal === 'regroup-to' ? 92 : 84;
  const plan = useMemo(
    () =>
      planMat({
        caps,
        age,
        width: mainW > 0 ? mainW : 900,
        height: BUDGET - 2 * ROOT_PAD_Y - problemH - ROW_GAP,
      }),
    [caps, age, mainW, problemH],
  );
  // The side panel lines up with the mat when its contents fit beside it; otherwise it starts at
  // the top, level with the problem.
  const sideParts = [
    showWork ? WORK_H : 0,
    config.thenAsk ? 4 * bigTarget + 3 * 12 : 0,
    checkInProblem ? 0 : bigTarget + 6,
  ].filter((h) => h > 0);
  const sideH = sideParts.reduce((a, h) => a + h, 0) + SIDE_GAP * (sideParts.length - 1);
  const besideMat = BUDGET - 2 * ROOT_PAD_Y - problemH - ROW_GAP;
  const sideTop = sideH <= besideMat ? problemH + ROW_GAP : 0;
  const u = plan.u;
  const strip = stripWidth(age);
  const columns = caps.columns;
  const gridColumns = columns
    .flatMap((c, i) => (i === 0 ? [`${plan.colW[c]}px`] : [`${strip}px`, `${plan.colW[c]}px`]))
    .join(' ');
  const matBoxes = useMemo(() => {
    const out = {} as Record<Column, Box[]>;
    for (const c of columns) {
      out[c] = placePieces(
        c,
        state.mat[c],
        u,
        { w: plan.colW[c] - 2 * COL_PAD, h: plan.bodyH - 2 * COL_PAD },
        caps.mat[c],
        c === 'hundreds' ? plan.flatsPerRow : plan.rodsPerRow,
      );
    }
    return out;
  }, [columns, state.mat, u, plan, caps]);

  // ---------- animation (03 §5.5: transform and opacity only; instant with reduced motion) ----------

  const fxRun = useRef(0);
  const running = useRef<Animation[]>([]);
  const commitWaiters = useRef<(() => void)[]>([]);
  useLayoutEffect(() => {
    if (commitWaiters.current.length === 0) return;
    const ready = commitWaiters.current;
    commitWaiters.current = [];
    for (const r of ready) r();
  });
  useLayoutEffect(
    () => () => {
      const ready = commitWaiters.current;
      commitWaiters.current = [];
      for (const r of ready) r();
    },
    [],
  );
  const afterCommit = () =>
    new Promise<void>((resolve) => {
      commitWaiters.current.push(resolve);
    });

  const rel = (r: DOMRect): Box => {
    const o = rootRef.current?.getBoundingClientRect();
    return { x: r.left - (o?.left ?? 0), y: r.top - (o?.top ?? 0), w: r.width, h: r.height };
  };
  const rectOf = (pieceId: string): Box | null => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-piece="${pieceId}"]`);
    return el ? rel(el.getBoundingClientRect()) : null;
  };
  const rootBounds = (): Box => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: 0, y: 0, w: r?.width ?? 0, h: r?.height ?? 0 };
  };

  /** Ends any animation in flight at its last frame (a new op starts from a settled mat). */
  const stopFx = () => {
    fxRun.current++;
    const anims = running.current;
    running.current = [];
    for (const a of anims) a.finish();
    fxRef.current?.replaceChildren();
    setArriving(EMPTY);
  };

  const playGhosts = (ghosts: readonly Ghost[]) => {
    const layer = fxRef.current;
    if (!layer || ghosts.length === 0) return Promise.resolve();
    const anims = ghosts.map((g) => {
      const el = document.createElement('span');
      el.className = `ni-btt__piece ni-btt__piece--${g.kind} ni-btt__ghost`;
      el.style.left = `${g.rect.x}px`;
      el.style.top = `${g.rect.y}px`;
      el.style.width = `${g.rect.w}px`;
      el.style.height = `${g.rect.h}px`;
      el.style.setProperty('--u', `${g.kind === 'hundreds' ? g.rect.w / 10 : g.rect.w}px`);
      layer.append(el);
      return el.animate(
        g.keyframes.map((k) => ({ easing: EASE, ...k })),
        { duration: g.duration, delay: g.delay, easing: 'linear', fill: 'both' },
      );
    });
    running.current.push(...anims);
    return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => undefined);
  };

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashIds = (ids: string[]) => {
    setFlash(new Set(ids));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      if (alive.current) setFlash(EMPTY);
    }, FLASH_MS);
  };
  useLayoutEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const popIn = (ids: string[]) => {
    ids.forEach((id, k) => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-piece="${id}"]`);
      el?.animate(
        [
          { transform: 'scale(0.4)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: POP_MS, delay: k * 30, easing: EASE, fill: 'backwards' },
      );
    });
  };

  /**
   * Applies one op through the model and animates it: `sources` are measured before the change,
   * `arrivingIds` (the pieces it creates) after it; `ghosts` builds the animation from both.
   */
  const animateChange = async (
    next: State,
    sources: (Box | null)[],
    arrivingIds: string[],
    ghosts: ((sources: Box[], dests: Box[]) => Ghost[]) | null,
    flashOn: string[],
  ) => {
    setTouched(true);
    setGrab({});
    if (reduced || !ghosts || sources.some((b) => b === null)) {
      commit(next);
      if (reduced) flashIds(flashOn);
      else if (!ghosts) {
        await afterCommit();
        popIn(arrivingIds);
      }
      return;
    }
    const run = fxRun.current;
    setArriving(new Set(arrivingIds));
    commit(next);
    await afterCommit();
    if (!alive.current || run !== fxRun.current) return;
    const dests = arrivingIds.map(rectOf);
    if (dests.some((d) => d === null)) {
      setArriving(EMPTY);
      return;
    }
    await playGhosts(ghosts(sources as Box[], dests as Box[]));
    if (!alive.current || run !== fxRun.current) return;
    running.current = [];
    fxRef.current?.replaceChildren();
    setArriving(EMPTY);
  };

  const runTrade = async (from: Column, to: Column) => {
    const s = stateRef.current;
    const next = model.apply(s, { op: 'trade', args: { from, to } });
    if (next === s) return;
    stopFx();
    const isBreak = COLUMNS.indexOf(to) === COLUMNS.indexOf(from) + 1;
    const n = s.mat[from];
    const sources = isBreak
      ? [rectOf(`${from}-${n - 1}`)]
      : range(n - 10, n).map((i) => rectOf(`${from}-${i}`));
    const arrivingIds = isBreak
      ? range(s.mat[to], s.mat[to] + 10).map((i) => `${to}-${i}`)
      : [`${to}-${s.mat[to]}`];
    await animateChange(
      next,
      sources,
      arrivingIds,
      (src, dests) =>
        isBreak
          ? breakGhosts(from, to, src[0] as Box, dests)
          : bundleGhosts(from, to, src, dests[0] as Box, rootBounds()),
      [`col-${from}`, `col-${to}`],
    );
  };

  const runCombine = async (col: Column, via: Via) => {
    const s = stateRef.current;
    const n = s.pending[col];
    if (n <= 0) return;
    const next = model.apply(s, { op: 'combine', args: { column: col } });
    stopFx();
    // A drag already brought the group to its column: the pieces settle in place instead.
    const fly = via !== 'drag';
    const sources = fly ? range(0, n).map((k) => rectOf(`pending-${col}-${k}`)) : [];
    const arrivingIds = range(s.mat[col], s.mat[col] + n).map((i) => `${col}-${i}`);
    await animateChange(
      next,
      sources,
      arrivingIds,
      fly ? (src, dests) => moveGhosts(col, src, dests) : null,
      [`col-${col}`],
    );
  };

  const runTakeOne = async (col: Column, via: Via, slot?: number) => {
    const s = stateRef.current;
    const n = s.mat[col];
    if (n <= 0) return;
    const next = model.apply(s, { op: 'take', args: { column: col, count: 1 } });
    if (next === s) return;
    stopFx();
    const from = slot !== undefined && slot < n ? slot : n - 1;
    const fly = via !== 'drag';
    const sources = fly ? [rectOf(`${col}-${from}`)] : [];
    const arrivingIds = [`taken-${col}-${s.taken[col]}`];
    await animateChange(
      next,
      sources,
      arrivingIds,
      fly ? (src, dests) => moveGhosts(col, src, dests) : null,
      [`col-${col}`, 'take'],
    );
  };

  // ---------- child input ----------

  const colOf = (id: string): Column | undefined => columnArg(id.split('-')[1]);

  const speakPiece = (c: Column) => {
    if (speakOnTap) say(PIECE_KEY[c]);
  };

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive,
    trace,
    canPlace: (item, target) => {
      const c = colOf(item);
      if (!c) return false;
      if (item.startsWith('pending-')) return target === `col-${c}`;
      return target === 'take';
    },
    onSelect: (item) => {
      const c = item ? colOf(item) : undefined;
      if (c) speakPiece(c);
    },
    onPlace: ({ item, target, via }) => {
      setInvite(null);
      const c = colOf(item);
      if (!c) return;
      const how: Via = via === 'drag' ? 'drag' : 'tap';
      if (item.startsWith('pending-')) void runCombine(c, how);
      else if (target === 'take') void runTakeOne(c, how, grab[c]);
    },
  });

  const onTrade = (from: Column, to: Column) => {
    if (!interactive) return;
    trace('tap', `trade-${from}-${to}`);
    setInvite(null);
    void runTrade(from, to);
  };

  const onColumnTap = (c: Column) => {
    if (!interactive) return;
    trace('tap', `col-${c}`);
    speakPiece(c);
  };

  /** A press on a column's pile picks up the piece under the finger (all pieces are alike). */
  const grabNearest = (c: Column, e: ReactPointerEvent) => {
    const body = bodyRefs.current[c];
    const boxes = matBoxes[c];
    if (!body || boxes.length === 0) return;
    const r = body.getBoundingClientRect();
    const px = e.clientX - r.left - COL_PAD;
    const py = e.clientY - r.top - COL_PAD;
    let best = boxes.length - 1;
    let bestD = Number.POSITIVE_INFINITY;
    boxes.forEach((b, i) => {
      const d = Math.hypot(b.x + b.w / 2 - px, b.y + b.h / 2 - py);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setGrab((g) => (g[c] === best ? g : { ...g, [c]: best }));
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    setText((prev) => applyPadKey(prev, key, 3));
  };

  const typed = padValue(text);
  const canSubmit = config.thenAsk ? typed !== null : touched;

  // One debounce for every way to submit (Check, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    let s = stateRef.current;
    if (config.thenAsk) {
      const v = padValue(textRef.current);
      if (v === null) return false;
      s = model.apply(s, { op: 'answer', args: { value: v } });
    } else if (!touched) {
      return false;
    }
    const response = model.toResponse(s);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'trade') {
          const from = columnArg(action.args?.from);
          const to = columnArg(action.args?.to);
          if (!from || !to) return;
          setDemoHi(`trade-${from}-${to}`);
          await pause(360);
          if (!alive.current) return;
          await runTrade(from, to);
          if (!alive.current) return;
          setDemoHi(null);
          await pause(240);
        } else if (action.op === 'combine') {
          const one = columnArg(action.args?.column);
          for (const c of one ? [one] : COLUMNS) {
            if (stateRef.current.pending[c] <= 0) continue;
            setDemoHi(`pending-${c}`);
            await pause(360);
            if (!alive.current) return;
            setDemoHi(null);
            await runCombine(c, 'demo');
            if (!alive.current) return;
            await pause(240);
          }
        } else if (action.op === 'take') {
          const c = columnArg(action.args?.column);
          if (!c) return;
          const raw = Number(action.args?.count ?? 1);
          const count = Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 1;
          for (let i = 0; i < count && stateRef.current.mat[c] > 0; i++) {
            await runTakeOne(c, 'demo');
            if (!alive.current) return;
            await pause(200);
          }
        } else if (action.op === 'write-digit') {
          const c = columnArg(action.args?.column);
          const next = model.apply(stateRef.current, action);
          if (next === stateRef.current || !c) return;
          commit(next);
          setDemoHi(`digit-${c}`);
          await pause(700);
          if (alive.current) setDemoHi(null);
        } else if (action.op === 'answer') {
          const v = Number(action.args?.value);
          if (!Number.isFinite(v)) return;
          if (!config.thenAsk) {
            commit(model.apply(stateRef.current, action));
            setTouched(true);
            return;
          }
          setText('');
          let typedText = '';
          for (const ch of String(Math.max(0, Math.trunc(v))).split('') as PadKey[]) {
            setPressedKey(ch);
            await pause(KEY_MS);
            if (!alive.current) return;
            typedText = applyPadKey(typedText, ch, 3);
            setText(typedText);
          }
          setPressedKey(null);
          await pause(KEY_MS);
        }
      } finally {
        setPressedKey(null);
        setDemoHi(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  const invited = (() => {
    if (!invite) return null;
    const a = invite.args ?? {};
    switch (invite.op) {
      case 'trade': {
        const from = columnArg(a.from);
        const to = columnArg(a.to);
        return from && to ? `trade-${from}-${to}` : null;
      }
      case 'combine': {
        const c = columnArg(a.column) ?? COLUMNS.find((k) => state.pending[k] > 0);
        return c ? `pending-${c}` : null;
      }
      case 'take': {
        const c = columnArg(a.column);
        return c ? `mat-${c}` : null;
      }
      case 'write-digit': {
        const c = columnArg(a.column);
        return c ? `digit-${c}` : null;
      }
      case 'answer':
        return 'answer';
      default:
        return null;
    }
  })();

  // ---------- render ----------

  const problem = (() => {
    if (config.goal === 'regroup-to') {
      const goal = config.regroupTarget ?? config.start;
      return (
        <fieldset
          className="ni-btt__problem ni-btt__goal"
          aria-label={t('ui.widget.btt.goal')}
          style={{ height: problemH }}
        >
          {columns.map((c) => (
            <span key={c} className="ni-btt__chip">
              <span className="ni-btt__chipnum">{goal[c]}</span>
              <span className="ni-btt__chipicon" role="img" aria-label={t(COL_KEY[c])}>
                <PieceIcon kind={c} />
              </span>
            </span>
          ))}
        </fieldset>
      );
    }
    if (!op) return null;
    const expr: ExpressionSpec = {
      tokens: [
        { t: 'num', v: htoValue(config.start) },
        { t: 'op', v: op.op },
        { t: 'num', v: htoValue(op.operand) },
        ...(config.thenAsk
          ? ([
              { t: 'rel', v: '=' },
              { t: 'blank', id: 'answer' },
            ] as const)
          : []),
      ],
    };
    return (
      <div className="ni-btt__problem" style={{ height: problemH }}>
        <ExpressionView
          expr={expr}
          renderBlank={() => (
            <span className="ni-btt__answerwrap">
              <output
                className={['ni-number', 'ni-btt__answer', invited === 'answer' ? 'ni-invite' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-empty={text === '' ? 'true' : undefined}
                aria-label={`${t('ui.widget.answer')}: ${text}`.trim()}
              >
                {text === '' ? <span className="ni-number__slot" /> : text}
              </output>
              {invited === 'answer' ? <Hand /> : null}
            </span>
          )}
        />
      </div>
    );
  })();

  const work = showWork ? (
    <WorkCard
      config={config}
      state={state}
      highlighted={demoHi?.startsWith('digit-') ? (columnArg(demoHi.slice(6)) ?? null) : null}
      invited={invited?.startsWith('digit-') ? (columnArg(invited.slice(6)) ?? null) : null}
    />
  ) : null;

  const column = (c: Column) => {
    const n = state.mat[c];
    const boxes = matBoxes[c];
    const slot =
      isMinus && n > 0
        ? grab[c] !== undefined && (grab[c] as number) < n
          ? (grab[c] as number)
          : n - 1
        : -1;
    const head = (
      <div className="ni-btt__head" aria-hidden="true" style={{ height: sizes.header }}>
        <PieceIcon kind={c} />
        {textLabels ? <span className="ni-btt__headword">{t(COL_KEY[c])}</span> : null}
      </div>
    );
    let pad: ReactNode = null;
    if (isPlus) {
      const p = dnd.targetProps(`col-${c}`, { label: t(COL_KEY[c]) });
      pad = (
        // biome-ignore lint/a11y/noStaticElementInteractions: targetProps gives it role="button" and its key handling
        // biome-ignore lint/a11y/useKeyWithClickEvents: targetProps handles Enter and Space (onKeyDown)
        <div
          {...p}
          className={`${p.className} ni-btt__pad`}
          onClick={(e) => {
            const had = dnd.selected;
            p.onClick(e);
            if (had === null) onColumnTap(c);
          }}
        />
      );
    } else if (!isMinus) {
      pad = (
        <button
          type="button"
          className="ni-btt__pad ni-btt__speak"
          aria-label={t(COL_KEY[c])}
          disabled={!interactive}
          onClick={() => onColumnTap(c)}
        />
      );
    }
    const itemId = `mat-${c}-${n - 1}`;
    const item =
      isMinus && n > 0
        ? (() => {
            const p = dnd.itemProps(itemId, { label: t(PIECE_KEY[c]) });
            const b = boxes[slot] as Box;
            return (
              <div
                {...p}
                className={`${p.className} ni-btt__grab`}
                data-item={itemId}
                onPointerDown={(e) => {
                  if (interactive) grabNearest(c, e);
                  p.onPointerDown(e);
                }}
              >
                <Piece
                  kind={c}
                  box={b}
                  u={u}
                  id={`${c}-${slot}`}
                  hidden={arriving.has(`${c}-${slot}`)}
                  dx={COL_PAD}
                  dy={COL_PAD}
                />
              </div>
            );
          })()
        : null;
    const bodyInvited = invited === `mat-${c}`;
    return (
      <div
        key={c}
        className="ni-btt__col"
        data-col={c}
        data-flash={flash.has(`col-${c}`) ? 'true' : undefined}
      >
        {pad}
        {head}
        <div
          ref={(el) => {
            bodyRefs.current[c] = el;
          }}
          className={['ni-btt__body', bodyInvited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
          style={{ height: plan.bodyH }}
        >
          <div className="ni-btt__pile" aria-hidden="true">
            {boxes.map((b, i) =>
              i === slot ? null : (
                <Piece
                  // biome-ignore lint/suspicious/noArrayIndexKey: pieces of a column are positional
                  key={i}
                  kind={c}
                  box={b}
                  u={u}
                  id={`${c}-${i}`}
                  hidden={arriving.has(`${c}-${i}`)}
                />
              ),
            )}
          </div>
          {item}
          {bodyInvited ? <Hand /> : null}
        </div>
      </div>
    );
  };

  const strips = (larger: Column) => {
    const smaller = smallerOf(larger) as Column;
    return (
      <div key={`strip-${larger}`} className="ni-btt__strip">
        {(
          [
            { from: larger, to: smaller, dir: 'split' as const, enabled: state.mat[larger] >= 1 },
            { from: smaller, to: larger, dir: 'group' as const, enabled: state.mat[smaller] >= 10 },
          ] as const
        ).map((b) => {
          const id = `trade-${b.from}-${b.to}`;
          return (
            <TradeButton
              key={id}
              from={b.from}
              to={b.to}
              larger={larger}
              dir={b.dir}
              enabled={b.enabled}
              interactive={interactive}
              invited={invited === id}
              highlighted={demoHi === id}
              onTrade={onTrade}
            />
          );
        })}
      </div>
    );
  };

  // The adding tray, under the mat with its cells under the columns, while anything waits. Its
  // pieces are drawn a little smaller (they grow as they move onto the mat).
  const tray =
    isPlus && !trayEmpty ? (
      <fieldset
        className="ni-btt__tray"
        aria-label={t('ui.widget.btt.adding')}
        style={{
          gridTemplateColumns: gridColumns,
          width: plan.matW,
          height: plan.trayH,
          // Its 3 px border plus this padding line the cells up with the mat's columns.
          paddingInline: MAT_BORDER - 3,
        }}
      >
        <span className="ni-btt__plus" aria-hidden="true">
          +
        </span>
        {columns.map((c, i) => {
          const n = state.pending[c];
          const boxes = naturalLayout(c, n, plan.ut, 10);
          const ext = extent(boxes);
          const w = Math.max(sizes.target, ext.w + 2 * GROUP_PAD);
          const h = Math.max(sizes.target, ext.h + 2 * GROUP_PAD);
          const id = `pending-${c}`;
          const isInvited = invited === id;
          return (
            <div key={c} className="ni-btt__traycell" style={{ gridColumn: i * 2 + 1 }}>
              {n > 0
                ? (() => {
                    const p = dnd.itemProps(id, { label: t(PENDING_KEY[c]) });
                    return (
                      <div
                        {...p}
                        className={[
                          p.className,
                          'ni-btt__pending',
                          isInvited ? 'ni-invite' : '',
                          demoHi === id ? 'ni-btt__hi' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        data-item={id}
                        style={{ width: w, height: h }}
                      >
                        {boxes.map((b, k) => (
                          <Piece
                            // biome-ignore lint/suspicious/noArrayIndexKey: pieces of a group are positional
                            key={k}
                            kind={c}
                            box={b}
                            u={plan.ut}
                            id={`pending-${c}-${k}`}
                            dx={(w - ext.w) / 2}
                            dy={(h - ext.h) / 2}
                          />
                        ))}
                      </div>
                    );
                  })()
                : null}
              {isInvited ? <Hand /> : null}
            </div>
          );
        })}
      </fieldset>
    ) : null;

  const nest = isMinus
    ? (() => {
        const p = dnd.targetProps('take', { label: t('ui.widget.btt.nest') });
        const inner = nestInner(plan.matW, plan.nestH);
        const taken = placeTaken(state.taken, plan.ub, inner);
        return (
          <div
            className="ni-btt__nest"
            data-flash={flash.has('take') ? 'true' : undefined}
            style={{ width: plan.matW, height: plan.nestH }}
          >
            <NestArt />
            <div {...p} className={`${p.className} ni-btt__pad ni-btt__nestpad`} />
            <div
              className="ni-btt__taken"
              aria-hidden="true"
              style={{ left: inner.x, top: inner.y, width: inner.w, height: inner.h }}
            >
              {COLUMNS.flatMap((c) =>
                taken[c].map((b, k) => (
                  <Piece
                    key={`${c}-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: taken pieces are positional
                      k
                    }`}
                    kind={c}
                    box={b}
                    u={plan.ub}
                    id={`taken-${c}-${k}`}
                    hidden={arriving.has(`taken-${c}-${k}`)}
                  />
                )),
              )}
            </div>
          </div>
        );
      })()
    : null;

  return (
    <div
      ref={rootRef}
      className="ni-btt"
      data-tier={pictorial ? 'pictorial' : 'concrete'}
      data-disabled={disabled ? 'true' : undefined}
      data-goal={config.goal}
      data-op={op?.op}
    >
      <div ref={mainRef} className="ni-btt__main">
        {/* The problem centred over the mat; "check" after it when the side panel is full. */}
        <div className="ni-btt__problemrow" style={{ height: problemH }}>
          <span />
          {problem}
          <span className="ni-btt__problemcheck">
            {checkInProblem ? (
              <CheckButton onPress={submit} disabled={!interactive || !canSubmit} />
            ) : null}
          </span>
        </div>
        <fieldset
          className="ni-btt__mat"
          aria-label={t('ui.widget.btt.mat')}
          style={
            {
              width: plan.matW,
              gridTemplateColumns: gridColumns,
              gridTemplateRows: `${sizes.header + plan.bodyH}px`,
              borderWidth: MAT_BORDER,
              '--btt-trade-h': `${sizes.tradeH}px`,
            } as CSSProperties
          }
        >
          {columns.flatMap((c, i) => {
            const prev = columns[i - 1];
            return prev ? [strips(prev), column(c)] : [column(c)];
          })}
        </fieldset>
        {tray}
        {nest}
      </div>
      <div className="ni-btt__side" style={{ paddingTop: sideTop, gap: SIDE_GAP }}>
        {work}
        {config.thenAsk ? (
          <NumberPadKeys
            onKey={onKey}
            onEnter={submit}
            disabled={!interactive}
            highlighted={pressedKey}
          />
        ) : null}
        {checkInProblem ? null : (
          <CheckButton onPress={submit} disabled={!interactive || !canSubmit} />
        )}
      </div>
      <div ref={fxRef} className="ni-btt__fx" aria-hidden="true" />
    </div>
  );
}

export default BaseTenTradeWidget;
