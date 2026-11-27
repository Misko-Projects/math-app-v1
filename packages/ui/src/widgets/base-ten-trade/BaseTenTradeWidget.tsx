import {
  type BaseTenTradeState,
  COLUMNS,
  type Column,
  DISK_COLUMN_MAX,
  type FormatModel,
  formatModel,
  htoValue,
  TRADE_TAKE_COUNT_MAX,
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
import { BigButton } from '../../primitives/BigButton';
import { ArrowIcon, BackIcon } from '../../primitives/icons';
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
  useInviteHand,
  useSmallestRoom,
  useSubmitGuard,
  useWidgetRoom,
  type WidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { breakGhosts, bundleGhosts, EASE, type Ghost, moveGhosts } from './fx';
import {
  ageSizes,
  answerPlaces,
  BOX_PAD,
  type Box,
  BUDGET,
  COL_PAD,
  chooseSide,
  colInsets,
  digitsValue,
  extent,
  GAP,
  GROUP_PAD,
  growCaps,
  holderMargins,
  holderWidth,
  itemFit,
  itemUnit,
  MAT_BORDER,
  naturalLayout,
  nestInner,
  nestSlots,
  padRowHeight,
  pathStates,
  placeDigits,
  placePieces,
  placeTaken,
  planCaps,
  planMat,
  planSteps,
  READ_PAD,
  ROOT_PAD_Y,
  ROW_GAP,
  SIDE_GAP,
  type StepsPlan,
  standingGroups,
  stateCaps,
  stepsCaps,
  stepsHold,
  stripWidth,
  underGroups,
  unitRange,
  workCardSize,
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
 * column), `col-<column>` (a column), `take` (the nest), `back-<column>` (a taken kind in the nest,
 * tapped to put one piece back), `trade-<from>-<to>`, `key-<k>`.
 * Demo ops (03 §5.5): `trade {from, to}`, `combine {column}`, `take {column, count}`,
 * `write-digit {column, value}`, plus `answer {value}`.
 */

const OPS = ['trade', 'combine', 'take', 'write-digit', 'answer'] as const;
const budgetIn = (room: WidgetRoom | null) =>
  room && Number.isFinite(room.height) ? Math.min(BUDGET, room.height) : BUDGET;

/** The demo ops played on the answer step of a short room (the rest are on the pieces step). */
const answerOp = (op: string) => op === 'answer' || op === 'write-digit';

/** How far the guide's hand may hang below the widget in a short room's steps (the card's padding). */
const STEPS_HAND_OVERHANG = 30;

const KEY_MS = 340;
const FLASH_MS = 900;
const POP_MS = 320;

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
/** The algorithm's result boxes (the answer place with `thenAsk`). */
const BOX_KEY: Record<Column, NarrationKey> = {
  hundreds: 'ui.widget.btt.box.hundreds',
  tens: 'ui.widget.btt.box.tens',
  ones: 'ui.widget.btt.box.ones',
};
/** Put one taken piece back on the mat (the nest's control for that kind). */
const BACK_KEY: Record<Column, NarrationKey> = {
  hundreds: 'ui.widget.btt.back.hundreds',
  tens: 'ui.widget.btt.back.tens',
  ones: 'ui.widget.btt.back.ones',
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

/**
 * The algorithm's places, 0 = ones. The first three are the mat's columns; a thousands place (or
 * more) shows only when the operands need it (layout.ts answerPlaces).
 */
const PLACE_COLUMNS: readonly Column[] = ['ones', 'tens', 'hundreds'];
const placeColumn = (p: number): Column | undefined => PLACE_COLUMNS[p];
/** A place's id in `data-digit`, trace targets (`digit-<id>`) and `write-digit {column}`. */
const placeId = (p: number) => placeColumn(p) ?? (p === 3 ? 'thousands' : `place-${p}`);
/** The place a `write-digit` column argument names (a column alias, or `thousands`). */
const placeArg = (v: unknown): number | undefined => {
  const c = columnArg(v);
  if (c) return PLACE_COLUMNS.indexOf(c);
  if (v === 'thousands' || v === 'thousand') return 3;
  const m = typeof v === 'string' ? /^place-(\d+)$/.exec(v) : null;
  return m ? Number(m[1]) : undefined;
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
  placedByCss = false,
}: {
  kind: Column;
  box: Box;
  u: number;
  id: string;
  hidden?: boolean;
  dx?: number;
  dy?: number;
  /** Its position comes from the stylesheet (the take-away grab item), not from `box`. */
  placedByCss?: boolean;
}) {
  return (
    <span
      className={`ni-btt__piece ni-btt__piece--${kind}`}
      data-piece={id}
      data-arriving={hidden ? 'true' : undefined}
      data-lying={kind === 'tens' && box.w > box.h ? 'true' : undefined}
      style={
        {
          left: placedByCss ? undefined : box.x + dx,
          top: placedByCss ? undefined : box.y + dy,
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
      {/* The opening: a long sandy hollow with a straight twig rim and rounded ends (a stadium,
          so even a tall flat stands inside it). */}
      <span className="ni-btt__hollow" aria-hidden="true" />
      {/* The woven front wall: a band of fixed height at the nest's foot, below the pieces. */}
      <svg
        className="ni-btt__nest-wall"
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M3 3H397C394 26 330 38 200 38S6 26 3 3Z"
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
        <span className="ni-btn__icon ni-btt__tradeicon">
          <TradeIcon larger={larger} dir={dir} />
        </span>
        {textLabels ? (
          <span className="ni-btn__label ni-btt__tradecap" aria-hidden="true">
            {t(dir === 'split' ? 'ui.widget.btt.split' : 'ui.widget.btt.group')}
          </span>
        ) : null}
      </button>
    </span>
  );
}

// ---------- the column algorithm ----------

function WorkCard({
  config,
  state,
  row,
  highlighted,
  invited,
  answer,
}: {
  config: Config;
  state: State;
  /**
   * The result row's digits (written by the child or a demo), highest place first. Its length is
   * the card's number of places (answerPlaces: from the operands, never the result).
   */
  row: readonly (number | null)[];
  /** Places (0 = ones) of the highlighted and invited result boxes. */
  highlighted: number | null;
  invited: number | null;
  /**
   * With `thenAsk`, the result row is where the child answers: each box is a button (tap it, type
   * on the pad); `active` is the place being typed into.
   */
  answer: {
    active: number | null;
    disabled: boolean;
    onTap: (place: number) => void;
  } | null;
}) {
  const t = useNarrationText();
  const op = config.operation;
  if (!op) return null;
  const places = row.length;
  const start = placeDigits(htoValue(config.start), places);
  const operand = placeDigits(htoValue(op.operand), places);
  // Net change from trades only (not from adding or taking): what a child writes as regrouping.
  const delta = (c: Column) => {
    const combined = op.op === '+' ? op.operand[c] - state.pending[c] : 0;
    return state.mat[c] - config.start[c] - combined + state.taken[c];
  };
  // Left to right: place `places − 1` down to 0 (ones), each in grid column i + 2.
  const cells = range(0, places).map((i) => ({
    i,
    p: places - 1 - i,
    c: placeColumn(places - 1 - i),
  }));
  const boxName = (p: number) =>
    p < 3
      ? t(BOX_KEY[placeColumn(p) as Column])
      : p === 3
        ? t('ui.widget.btb.col.thousands')
        : t('ui.widget.blank', { n: places - p });
  return (
    <fieldset
      className="ni-btt__work"
      aria-label={t('ui.widget.btt.work')}
      style={{ gridTemplateColumns: `24px repeat(${places}, var(--target-min))` }}
    >
      {cells.map(({ i, p, c }) => {
        let note: number | null = null;
        if (c) {
          const d = delta(c);
          // `-`: the new count above, the old digit crossed out. `+`: the number carried in above
          // (a column that took one carry and passed one on is 1 − 10 = −9: still a carried 1).
          const carried = ((d % 10) + 10) % 10;
          note =
            op.op === '-' ? (d !== 0 ? config.start[c] + d : null) : carried > 0 ? carried : null;
        }
        return (
          <span key={`n-${p}`} className="ni-btt__note" style={{ gridColumn: i + 2 }}>
            {note === null ? '' : note}
          </span>
        );
      })}
      {cells.map(({ i, p, c }) => {
        // The mat has no thousands: its hundreds stand for the hundreds digit and every place
        // above it (twelve hundreds is 1 | 2), so a hundred split crosses them all out.
        const changed = op.op === '-' && delta(c ?? 'hundreds') !== 0;
        const crossed = changed && start[i] !== '';
        return (
          <span
            key={`s-${p}`}
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
      {cells.map(({ i, p }) => (
        <span key={`o-${p}`} className="ni-btt__digit" style={{ gridColumn: i + 2, gridRow: 3 }}>
          {operand[i]}
        </span>
      ))}
      <span className="ni-btt__rule" />
      {cells.map(({ i, p }) => {
        const v = row[i] ?? null;
        const id = placeId(p);
        const cls = [
          'ni-btt__box',
          highlighted === p ? 'ni-btt__hi' : '',
          invited === p ? 'ni-invite' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const style = { gridColumn: i + 2, gridRow: 5 };
        if (answer) {
          const active = answer.active === p && !answer.disabled;
          return (
            <span key={`r-${p}`} className="ni-btt__boxwrap" style={style}>
              <button
                type="button"
                className={cls}
                data-digit={id}
                data-empty={v === null ? 'true' : undefined}
                data-state={active ? 'active' : 'idle'}
                aria-label={v === null ? boxName(p) : `${boxName(p)}: ${v}`}
                aria-current={active ? 'true' : undefined}
                disabled={answer.disabled}
                onClick={() => answer.onTap(p)}
              >
                {v === null ? '' : v}
                {active ? <span className="ni-number__caret" /> : null}
              </button>
            </span>
          );
        }
        return (
          <span
            key={`r-${p}`}
            className={cls}
            data-digit={id}
            data-empty={v === null ? 'true' : undefined}
            style={style}
          >
            {v === null ? '' : v}
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
  /** Measured widths (px): the mat's area, the side panel and its parts (pad, "check", card). */
  const [box, setBox] = useState({
    main: 0,
    side: 0,
    pad: 0,
    check: 0,
    card: 0,
    problemW: 0,
    problemH: 0,
    checkIcon: 0,
    bareW: 0,
    bareH: 0,
    widestW: 0,
    widestH: 0,
  });
  /** The short room's step (layout.ts planSteps): the pieces, then the answer. */
  const [step, setStep] = useState<'pieces' | 'answer'>('pieces');
  /** What the live region says after the child's Next or Back (once per change). */
  const [stepSaid, setStepSaid] = useState('');
  const stepFocus = useRef<'answer' | 'mat' | null>(null);
  /** With the algorithm, its card ("Your work") is named on the first Next only. */
  const saidWritten = useRef(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const fxRef = useRef<HTMLDivElement | null>(null);
  const bodyRefs = useRef<Partial<Record<Column, HTMLDivElement | null>>>({});

  const interactive = !disabled && !demoBusy;
  const op = config.goal === 'compute' ? config.operation : undefined;
  const isPlus = op?.op === '+';
  const isMinus = op?.op === '-';
  const showWork = config.showAlgorithm && Boolean(op);
  // With the algorithm, its result row is the answer place (one box a column, typed on the pad);
  // without it, the `=` blank after the expression is.
  const answerInWork = showWork && config.thenAsk;
  // How many places the answer has (the algorithm's columns, the pad's length): from the
  // operands, never from the result, so the entry's size doesn't give the answer away.
  const places = useMemo(() => answerPlaces(config), [config]);
  // The result row, highest place first (index i is place `places − 1 − i`).
  const [digits, setDigits] = useState<(number | null)[]>(() =>
    range(0, places).map((i) => {
      const c = placeColumn(places - 1 - i);
      return c ? state.written[c] : null;
    }),
  );
  /** The place being typed into (0 = ones). */
  const [activeBox, setActiveBox] = useState(0);
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
    const root = rootRef.current;
    if (!el || !root) return;
    const width = (sel: string) => root.querySelector(sel)?.getBoundingClientRect().width ?? 0;
    const measure = () => {
      const inSide = root
        .querySelector('.ni-btt__measure .ni-btt__problem:not([data-variant])')
        ?.getBoundingClientRect();
      const bare = root
        .querySelector('.ni-btt__measure .ni-btt__problem[data-variant="bare"]')
        ?.getBoundingClientRect();
      const widest = root
        .querySelector('.ni-btt__measure .ni-btt__problem[data-variant="widest"]')
        ?.getBoundingClientRect();
      const next = {
        main: el.getBoundingClientRect().width,
        side: width('.ni-btt__side'),
        pad: width('.ni-btt__side .ni-pad'),
        check: width('.ni-btt__checkwrap'),
        card: width('.ni-btt__work'),
        problemW: Math.ceil(inSide?.width ?? 0),
        problemH: Math.ceil(inSide?.height ?? 0),
        checkIcon: Math.ceil(width('.ni-btt__measure .ni-btt__checkcopy')),
        bareW: Math.ceil(bare?.width ?? 0),
        bareH: Math.ceil(bare?.height ?? 0),
        widestW: Math.ceil(widest?.width ?? 0),
        widestH: Math.ceil(widest?.height ?? 0),
      };
      setBox((prev) =>
        prev.bareW === next.bareW &&
        prev.bareH === next.bareH &&
        prev.widestW === next.widestW &&
        prev.widestH === next.widestH &&
        prev.main === next.main &&
        prev.side === next.side &&
        prev.pad === next.pad &&
        prev.check === next.check &&
        prev.card === next.card &&
        prev.problemW === next.problemW &&
        prev.problemH === next.problemH &&
        prev.checkIcon === next.checkIcon
          ? prev
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const baseCaps = useMemo(() => planCaps(config), [config]);
  // Hundreds in play: every piece is a place-value disk (03 §5.5, K02).
  const disks = baseCaps.disks === true;
  // A regroup of disks has no side panel: "check" ends the problem row and the mat is as wide as
  // the widget, so three columns of five disks are as large as they can be.
  const checkInRow = disks && config.goal === 'regroup-to' && !showWork && !config.thenAsk;
  // Once everything is added the tray goes, and the mat grows into its room.
  const trayEmpty = !COLUMNS.some((c) => state.pending[c] > 0);
  // What the layout makes room for, most stable first: the whole item's plan (grown for anything
  // the child made off the expected path), else exactly what is on the mat now. Either way the
  // unit stays at its one size whenever it can; pieces never overlap.
  const capsOptions = useMemo(() => {
    const grown = growCaps(baseCaps, state.mat, state.taken);
    const planned = trayEmpty && grown.tray ? { ...grown, tray: null } : grown;
    const now = stateCaps(
      baseCaps,
      state.mat,
      trayEmpty || !isPlus ? null : state.pending,
      isMinus ? state.taken : null,
    );
    return [planned, now];
  }, [baseCaps, state.mat, state.taken, state.pending, trayEmpty, isPlus, isMinus]);
  const path = useMemo(() => pathStates(config), [config]);
  // The widget is as tall as its room (06 §1). Where the problem card goes (over the mat, or in
  // the side panel of a short room) is chosen for the smallest room the item has had
  // (`useSmallestRoom`), with the parts as mounted: a room that grows re-sizes the layout it has,
  // one that shrinks is chosen for again. `tall`: the item fits that room neither way with pieces
  // a child can count (U_FLOOR), so it keeps its design height and its host scrolls; that is no
  // arrangement to keep, so it is chosen again in whatever room comes next.
  const room = useWidgetRoom(rootRef);
  // `steps`: a compute item with a typed answer that fits neither way is played in two steps
  // (layout.ts planSteps) when they fit at the floor; else `tall`.
  const arranged = useRef<'usual' | 'in-side' | 'steps' | 'tall' | null>(null);
  // Three columns of disks may step with the algorithm too: it is the answer step's card (#35).
  const canStep =
    config.goal === 'compute' && Boolean(op) && config.thenAsk === true && (!showWork || disks);
  const stepsFor = (budgetH: number, contentW: number): StepsPlan | null =>
    canStep && box.bareW > 0 && (showWork || box.widestW > 0) && box.checkIcon > 0 && contentW > 0
      ? planSteps({
          age,
          width: contentW,
          height: budgetH - 2 * ROOT_PAD_Y,
          base: baseCaps,
          path,
          parts: {
            bare: { w: box.bareW, h: box.bareH },
            // The answer step's card with its longest answer typed (answerPlaces digits), or the
            // algorithm with its result row.
            card: showWork ? workCardSize(places, age) : { w: box.widestW, h: box.widestH },
            button: box.checkIcon,
          },
        })
      : null;
  const planRoom = useSmallestRoom(room, rootRef, arranged.current === 'tall');
  const arrangedFor = useRef(planRoom);
  if (arrangedFor.current !== planRoom) arranged.current = null;
  const budget = arranged.current === 'tall' ? BUDGET : budgetIn(room);
  // Where the algorithm, the pad and "check" go, and the height left for the mat (layout.ts):
  // when K's side can't stack them, the arrangement at which every step of the item fits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stepsFor reads box, baseCaps, path and age
  const { side } = useMemo(() => {
    const measured = planRoom !== null && box.main > 0;
    const chosen = chooseSide({
      checkInRow,
      age,
      goal: config.goal,
      showWork,
      thenAsk: config.thenAsk,
      answerInWork,
      places,
      budget: arranged.current ? budget : budgetIn(planRoom),
      arrange:
        arranged.current === 'tall' || arranged.current === 'steps'
          ? 'usual'
          : (arranged.current ?? undefined),
      // The mat's area and the side panel together, with the grid gap between them (without a
      // side panel, the mat's area alone).
      contentW: box.main <= 0 ? 0 : checkInRow ? box.main : box.main + GAP + box.side,
      parts: {
        ...box,
        problem: box.problemW > 0 ? { w: box.problemW, h: box.problemH } : undefined,
        checkIcon: box.checkIcon > 0 ? box.checkIcon : undefined,
      },
      base: baseCaps,
      path,
    });
    if (!measured || arranged.current) return chosen;
    const fit = itemFit({
      age,
      width: chosen.width,
      height: chosen.side.spaceH,
      base: baseCaps,
      path,
    });
    const fitsRoom =
      fit.fits &&
      fit.unit >= unitRange(baseCaps.disks).floor &&
      chosen.side.sideH <= budgetIn(planRoom) - 2 * ROOT_PAD_Y;
    arrangedFor.current = planRoom;
    const steps = !fitsRoom ? stepsFor(budgetIn(planRoom), box.main + GAP + box.side) : null;
    // The steps are planned for the item; only a mat that has already outgrown them (splits made
    // in a larger room before it shrank, review round 2) keeps the scrolling layout instead.
    const now = stateRef.current;
    const all = { hundreds: 0, tens: 0, ones: 0 };
    for (const c of COLUMNS) all[c] = now.mat[c] + now.taken[c] + now.pending[c];
    if (steps?.fits && stepsHold({ age, plan: steps, base: baseCaps, all })) {
      arranged.current = 'steps';
      return chosen;
    }
    arranged.current = !fitsRoom ? 'tall' : chosen.side.problemInSide ? 'in-side' : 'usual';
    if (fitsRoom) return chosen;
    return chooseSide({
      checkInRow,
      age,
      goal: config.goal,
      showWork,
      thenAsk: config.thenAsk,
      answerInWork,
      places,
      arrange: 'usual',
      contentW: checkInRow ? box.main : box.main + GAP + box.side,
      parts: box,
      base: baseCaps,
      path,
    });
  }, [
    age,
    config,
    showWork,
    answerInWork,
    places,
    box,
    baseCaps,
    path,
    budget,
    planRoom,
    checkInRow,
  ]);
  const { problemInSide, padWide } = side;
  // A change of arrangement moves the pad and "check" to another place in the side panel, which
  // mounts them anew. Whichever of them had the keyboard focus keeps it: noted here, before the
  // change is committed, and given back to its replacement after.
  const sideRef = useRef<HTMLDivElement | null>(null);
  const focusedControl = () => {
    const el = document.activeElement;
    if (!el || !sideRef.current?.contains(el)) return null;
    const key = el.closest<HTMLElement>('.ni-pad__key')?.dataset.key;
    if (key !== undefined) return `.ni-pad__key[data-key="${key}"]`;
    return el.closest('.ni-btt__checkwrap') ? '.ni-btt__checkwrap .ni-btn' : null;
  };
  const hadFocus = useRef<string | null>(null);
  hadFocus.current = focusedControl();
  useLayoutEffect(() => {
    const sel = hadFocus.current;
    if (sel === null || focusedControl() !== null) return;
    sideRef.current?.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  });
  const { workInSide, checkBeside, showProblemRow, problemH, cardH, sideH } = side;
  // The two steps of a short room: planned for the item, the same mat in both steps.
  const steps = arranged.current === 'steps';
  // biome-ignore lint/correctness/useExhaustiveDependencies: stepsFor reads box, baseCaps, path and age
  const stepsPlan = useMemo(
    () => (steps ? stepsFor(budget, box.side > 0 ? box.main + GAP + box.side : box.main) : null),
    [steps, budget, box, baseCaps, path, age],
  );
  // The child's Next hands the focus to the answer box, Back to the mat (06 §6).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step changes
  useLayoutEffect(() => {
    const want = stepFocus.current;
    stepFocus.current = null;
    if (!want) return;
    rootRef.current
      ?.querySelector<HTMLElement>(
        want === 'answer'
          ? showWork
            ? '.ni-btt__stepside .ni-btt__box[aria-current="true"]'
            : '.ni-btt__stepside .ni-btt__answer'
          : '.ni-btt__mat',
      )
      ?.focus({ preventScroll: true });
  }, [step]);
  const spaceW = stepsPlan ? stepsPlan.matW : box.main > 0 ? box.main : 900;
  const spaceH = stepsPlan ? stepsPlan.matH : side.spaceH;
  // One scale for the whole item, chosen so every step on the expected path fits.
  const unit = useMemo(
    () =>
      stepsPlan
        ? stepsPlan.unit
        : itemUnit({ age, width: spaceW, height: spaceH, base: baseCaps, path }),
    [stepsPlan, baseCaps, path, age, spaceW, spaceH],
  );
  const planCapsOptions = useMemo(() => {
    if (!stepsPlan) return capsOptions;
    const { columns: cols } = stepsCaps(baseCaps);
    return capsOptions.map((c) => ({ ...c, columns: cols, tray: null, taken: null }));
  }, [stepsPlan, capsOptions, baseCaps]);
  const plan = useMemo(
    () => planMat({ age, width: spaceW, height: spaceH, caps: planCapsOptions, unit }),
    [planCapsOptions, unit, age, spaceW, spaceH],
  );
  const caps = plan.caps;
  // The side panel lines up with the mat when its contents fit beside it; otherwise it starts at
  // the top, level with the problem.
  const sideTop = showProblemRow && sideH <= spaceH ? problemH + ROW_GAP : 0;
  const u = plan.u;
  const strip = stripWidth(age);
  const columns = caps.columns;
  const gridColumns = columns
    .flatMap((c, i) => (i === 0 ? [`${plan.colW[c]}px`] : [`${strip}px`, `${plan.colW[c]}px`]))
    .join(' ');
  const matBoxes = useMemo(() => {
    const out = {} as Record<Column, Box[]>;
    // On a board taller than its pieces, the planned block sits in the middle (the same offset in
    // every column, so their rows line up), not at the top above an empty half.
    const room = plan.bodyH - 2 * COL_PAD;
    const oy = Math.max(0, Math.round((room - plan.piecesH) / 2));
    for (const c of columns) {
      out[c] = placePieces(
        c,
        state.mat[c],
        u,
        { w: plan.colW[c] - 2 * COL_PAD, h: room - oy },
        caps.mat[c],
        c === 'hundreds' ? plan.flatsPerRow : plan.rodsPerRow,
        disks,
      ).map((b) => ({ ...b, y: b.y + oy }));
    }
    return out;
  }, [columns, state.mat, u, plan, caps, disks]);

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
  // Unmounting mid-op (the host moved on during a demo): settle everything an op may be waiting on,
  // so `demo.play` resolves at once rather than hanging on a commit or a detached animation.
  useLayoutEffect(
    () => () => {
      const ready = commitWaiters.current;
      commitWaiters.current = [];
      for (const r of ready) r();
      fxRun.current++;
      const anims = running.current;
      running.current = [];
      for (const a of anims) a.finish();
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
      const lying = g.kind === 'tens' && g.rect.w > g.rect.h;
      // A disk's unit is its own width, whatever its place (its label is sized from it).
      const unitPx = disks
        ? g.rect.w
        : g.kind === 'hundreds'
          ? g.rect.w / 10
          : lying
            ? g.rect.h
            : g.rect.w;
      el.style.setProperty('--u', `${unitPx}px`);
      if (lying) el.dataset.lying = 'true';
      if (g.origin) el.style.transformOrigin = g.origin;
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
          ? breakGhosts(from, to, src[0] as Box, dests, undefined, disks)
          : bundleGhosts(from, to, src, dests[0] as Box, rootBounds(), undefined, disks),
      [`col-${from}`, `col-${to}`],
    );
  };

  /**
   * A column of disks holds at most DISK_COLUMN_MAX (03 §5.5): like a split, putting the tray's
   * group in or a taken piece back is refused when it would pass that; the child groups first.
   */
  const roomFor = (s: typeof state, col: Column, n: number) =>
    !disks || s.mat[col] + n <= DISK_COLUMN_MAX;

  const runCombine = async (col: Column, via: Via) => {
    const s = stateRef.current;
    const n = s.pending[col];
    if (n <= 0 || !roomFor(s, col, n)) return;
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

  /** One taken piece flies back from the nest to its column (the undo of a take). */
  const runPutBack = async (col: Column) => {
    const s = stateRef.current;
    if (!roomFor(s, col, 1)) return;
    const next = model.apply(s, { op: 'take', args: { column: col, count: -1 } });
    if (next === s) return;
    stopFx();
    await animateChange(
      next,
      [rectOf(`taken-${col}-${s.taken[col] - 1}`)],
      [`${col}-${s.mat[col]}`],
      (src, dests) => moveGhosts(col, src, dests),
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
      if (item.startsWith('pending-'))
        return target === `col-${c}` && roomFor(stateRef.current, c, stateRef.current.pending[c]);
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

  /**
   * A tap on a taken kind in the nest. With a mat piece picked up (tap-to-place) the nest is where
   * it goes, as a tap anywhere else on the nest; otherwise one piece of that kind goes back.
   */
  const onBack = (c: Column) => {
    if (!interactive) return;
    setInvite(null);
    const held = dnd.selected;
    const heldCol = held ? colOf(held) : undefined;
    if (held && heldCol && !held.startsWith('pending-')) {
      trace('tap', 'take');
      dnd.select(null);
      void runTakeOne(heldCol, 'tap', grab[heldCol]);
      return;
    }
    if (!roomFor(stateRef.current, c, 1)) return;
    trace('tap', `back-${c}`);
    if (speakOnTap) say(BACK_KEY[c]);
    void runPutBack(c);
  };

  /**
   * A put-back control is offered while its piece has room on the mat (DISK_COLUMN_MAX), or while
   * a mat piece is picked up, when a tap on it drops that piece in the nest instead.
   */
  const canPutBack = (c: Column) => dnd.selected !== null || roomFor(state, c, 1);

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

  const digitsRef = useRef(digits);
  digitsRef.current = digits;

  /**
   * Writes one digit into a result box, by place (the child's typing and the demo's
   * `write-digit`). The model keeps the mat's three columns' digits; a thousands digit lives only
   * in the row (the typed answer, sent as `answer {value}`, carries it).
   */
  const writeDigit = (p: number, value: number | null) => {
    const i = places - 1 - p;
    if (i < 0 || i >= places) return;
    const next = digitsRef.current.slice();
    next[i] = value;
    digitsRef.current = next;
    setDigits(next);
    const c = placeColumn(p);
    if (c && value !== null) {
      commit(model.apply(stateRef.current, { op: 'write-digit', args: { column: c, value } }));
    }
  };
  const digitAt = (p: number) => digitsRef.current[places - 1 - p] ?? null;

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    if (!answerInWork) {
      setText((prev) => applyPadKey(prev, key, places));
      return;
    }
    // The result row, as children write it: ones first, then leftwards.
    if (key === 'back') {
      if (digitAt(activeBox) !== null) writeDigit(activeBox, null);
      else if (activeBox > 0) {
        writeDigit(activeBox - 1, null);
        setActiveBox(activeBox - 1);
      }
      return;
    }
    writeDigit(activeBox, Number(key));
    if (activeBox < places - 1) setActiveBox(activeBox + 1);
  };

  const onBoxTap = (p: number) => {
    if (!interactive) return;
    trace('tap', `digit-${placeId(p)}`);
    setInvite(null);
    setActiveBox(p);
  };

  const typed = answerInWork ? digitsValue(digits) : padValue(text);
  // A mat-only answer is ready once the child has worked on the mat, or at once when the item
  // leaves nothing to do (n + 0, n − 0: the starting mat is the answer; PR #74 review round 1).
  const nothingToDo = op !== undefined && htoValue(op.operand) === 0;
  const worked = touched || nothingToDo;
  const canSubmit = config.thenAsk ? typed !== null : worked;

  // One debounce for every way to submit (Check, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    let s = stateRef.current;
    if (config.thenAsk) {
      const v = answerInWork ? digitsValue(digitsRef.current) : padValue(textRef.current);
      if (v === null) return false;
      s = model.apply(s, { op: 'answer', args: { value: v } });
    } else if (!worked) {
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
      // In a short room the demo shows the step its action is on (nothing traced or focused).
      if (arranged.current === 'steps') setStep(answerOp(action.op) ? 'answer' : 'pieces');
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
          // As the model: no count is one piece; a count that is not a whole number within the
          // bound does nothing (review round 2: the demo must not play what the engine ignores).
          const raw = action.args?.count;
          const count = raw === undefined ? 1 : raw;
          if (typeof count !== 'number' || !Number.isInteger(count)) return;
          if (Math.abs(count) > TRADE_TAKE_COUNT_MAX) return;
          for (let i = 0; i < count && stateRef.current.mat[c] > 0; i++) {
            await runTakeOne(c, 'demo');
            if (!alive.current) return;
            await pause(200);
          }
          // A negative count puts taken pieces back, one at a time.
          for (let i = 0; i < -count && stateRef.current.taken[c] > 0; i++) {
            await runPutBack(c);
            if (!alive.current) return;
            await pause(200);
          }
        } else if (action.op === 'write-digit') {
          const p = placeArg(action.args?.column);
          const v = Number(action.args?.value);
          if (p === undefined || p >= places || !Number.isFinite(v)) return;
          writeDigit(p, Math.trunc(v));
          setDemoHi(`digit-${placeId(p)}`);
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
          if (answerInWork) {
            // Type it into the result row, ones first, as a child writes it.
            for (let p = 0; p < places; p++) writeDigit(p, null);
            const chars = String(Math.max(0, Math.trunc(v)))
              .split('')
              .reverse();
            for (let p = 0; p < chars.length && p < places; p++) {
              const ch = chars[p] as PadKey;
              setActiveBox(p);
              setPressedKey(ch);
              await pause(KEY_MS);
              if (!alive.current) return;
              writeDigit(p, Number(ch));
            }
            setPressedKey(null);
            await pause(KEY_MS);
            return;
          }
          setText('');
          let typedText = '';
          for (const ch of String(Math.max(0, Math.trunc(v))).split('') as PadKey[]) {
            setPressedKey(ch);
            await pause(KEY_MS);
            if (!alive.current) return;
            typedText = applyPadKey(typedText, ch, places);
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
    invite: (action) => {
      // An invited control is on screen: its step is shown.
      if (action && arranged.current === 'steps') {
        setStep(answerOp(action.op) ? 'answer' : 'pieces');
      }
      setInvite(action);
    },
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
        if (c && Number(a.count) < 0) return state.taken[c] > 0 ? `back-${c}` : null;
        return c ? `mat-${c}` : null;
      }
      case 'write-digit': {
        const p = placeArg(a.column);
        return p !== undefined && p < places ? `digit-${placeId(p)}` : null;
      }
      case 'answer':
        // The answer place: the result box being typed into, or the `=` blank.
        return answerInWork ? `digit-${placeId(activeBox)}` : 'answer';
      default:
        return null;
    }
  })();

  // The guide's up-pointing hand hangs below the ONE invited control (kit `useInviteHand`), its
  // fingertip inside the control's bottom edge and clear of its glyph (a trade button's word).
  // Taking away points at the column's grab item (the control the child drags from).
  const handTarget = (() => {
    if (!invited) return null;
    if (invited === 'answer') return '.ni-btt__answer';
    if (invited.startsWith('digit-')) return `[data-digit="${invited.slice(6)}"]`;
    if (invited.startsWith('trade-')) return `[data-trade="${invited}"]`;
    if (invited.startsWith('pending-')) return `[data-item="${invited}"]`;
    if (invited.startsWith('mat-')) return `[data-col="${invited.slice(4)}"] .ni-btt__body`;
    if (invited.startsWith('back-')) return `[data-back="${invited.slice(5)}"]`;
    return null;
  })();
  const grabTarget = invited?.startsWith('mat-')
    ? `[data-col="${invited.slice(4)}"] [data-place-item]`
    : null;
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      (grabTarget ? root.querySelector<HTMLElement>(grabTarget) : null) ??
      (handTarget ? root.querySelector<HTMLElement>(handTarget) : null),
    handTarget ?? '',
    undefined,
    undefined,
    // A short room's steps fill the room to its foot: under a tall waiting group the guide's hand may
    // hang into the workshop card's padding below the widget, where it covers nothing (as
    // number-line-jump's SHORT_OVERHANG).
    stepsPlan ? STEPS_HAND_OVERHANG : 0,
  );

  // ---------- render ----------

  // `inSide`: the card as the side panel of a short room holds it (its own height, smaller type,
  // the goal chips in a column). `copy`: the hidden one that is measured to plan that layout.
  // `variant`: `bare` without its answer box (the pieces step of a short room); `widest` (a hidden
  // copy) with its longest answer typed, as planSteps plans the answer step.
  const problemCard = (inSide: boolean, copy = false, variant?: 'bare' | 'widest') => {
    const bare = variant === 'bare';
    const shown = variant === 'widest' ? '8'.repeat(places) : text;
    const cardStyle = inSide ? undefined : { height: cardH };
    if (config.goal === 'regroup-to') {
      const goal = config.regroupTarget ?? config.start;
      return (
        <fieldset
          className="ni-btt__problem ni-btt__goal"
          aria-label={copy ? undefined : t('ui.widget.btt.goal')}
          data-in-side={inSide ? 'true' : undefined}
          style={cardStyle}
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
        // The `=` blank is the answer place only without the algorithm (whose result row is).
        ...(config.thenAsk && !answerInWork && !bare
          ? ([
              { t: 'rel', v: '=' },
              { t: 'blank', id: 'answer' },
            ] as const)
          : []),
      ],
    };
    return (
      <div
        className="ni-btt__problem"
        data-in-side={inSide ? 'true' : undefined}
        data-variant={variant}
        style={cardStyle}
      >
        <ExpressionView
          expr={expr}
          renderBlank={() => (
            <span className="ni-btt__answerwrap">
              <output
                className={['ni-number', 'ni-btt__answer', invited === 'answer' ? 'ni-invite' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-empty={shown === '' ? 'true' : undefined}
                // The answer step's Next hands the focus here (only on the shown card).
                tabIndex={steps && !copy ? -1 : undefined}
                aria-label={`${t('ui.widget.answer')}: ${text}`.trim()}
              >
                {shown === '' ? <span className="ni-number__slot" /> : shown}
              </output>
            </span>
          )}
        />
      </div>
    );
  };
  const problem = problemCard(false);

  const work = showWork ? (
    <WorkCard
      config={config}
      state={state}
      row={digits}
      highlighted={demoHi?.startsWith('digit-') ? (placeArg(demoHi.slice(6)) ?? null) : null}
      invited={invited?.startsWith('digit-') ? (placeArg(invited.slice(6)) ?? null) : null}
      answer={answerInWork ? { active: activeBox, disabled: !interactive, onTap: onBoxTap } : null}
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
            // The grabbed piece's box in the column body. At rest the item is the whole column (its
            // hit pad, inset by GAP from a side with a trade strip) with the piece inside it; while dragged
            // (`data-dragging`, set by useDragToTarget) the item shrinks to the piece's own box, so
            // the drop test measures where the piece is drawn (base-ten-trade.css: .ni-btt__grab).
            const at = {
              '--btt-px': `${b.x + COL_PAD}px`,
              '--btt-py': `${b.y + COL_PAD}px`,
              '--btt-pw': `${b.w}px`,
              '--btt-ph': `${b.h}px`,
            } as CSSProperties;
            return (
              <div
                {...p}
                className={`${p.className} ni-btt__grab`}
                data-item={itemId}
                style={at}
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
                  placedByCss
                />
              </div>
            );
          })()
        : null;
    const bodyInvited = invited === `mat-${c}`;
    // The column's hit pad (drop target, tap pad or grab item) keeps GAP clear of a trade strip's
    // buttons beside it; on an outer side it runs closer to the mat frame when the column is narrow
    // (layout.ts colInsets): a target wide however narrow the column (measurePlan).
    const inset = colInsets(columns.indexOf(c), columns.length, plan.colW[c], age);
    return (
      <div
        key={c}
        className="ni-btt__col"
        data-col={c}
        data-flash={flash.has(`col-${c}`) ? 'true' : undefined}
        style={
          {
            '--btt-inset-l': `${inset.left}px`,
            '--btt-inset-r': `${inset.right}px`,
          } as CSSProperties
        }
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
        </div>
      </div>
    );
  };

  // Every piece of the item after splitting one `larger` into ten `smaller` (layout.ts stepsHold).
  const splitHolds = (larger: Column, smaller: Column) => {
    if (!stepsPlan) return true;
    const all = { hundreds: 0, tens: 0, ones: 0 };
    for (const c of COLUMNS) all[c] = state.mat[c] + state.taken[c] + state.pending[c];
    all[larger] -= 1;
    all[smaller] += 10;
    return stepsHold({ age, plan: stepsPlan, base: baseCaps, all });
  };

  const strips = (larger: Column) => {
    const smaller = smallerOf(larger) as Column;
    return (
      <div key={`strip-${larger}`} className="ni-btt__strip">
        {(
          [
            {
              from: larger,
              to: smaller,
              dir: 'split' as const,
              // A column of disks holds two tens (DISK_COLUMN_MAX): no split past that.
              enabled:
                state.mat[larger] >= 1 &&
                (!disks || state.mat[smaller] + 10 <= DISK_COLUMN_MAX) &&
                // A short room's steps: only while every piece still fits its fixed room.
                (!stepsPlan || splitHolds(larger, smaller)),
            },
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

  // One waiting group in its holder (`w` px wide, `m` its margins): dragged or tapped onto the mat.
  const pendingGroup = (c: Column, w: number, m: { left: number; right: number }) => {
    const n = state.pending[c];
    const boxes = naturalLayout(c, n, u, 10, disks);
    const ext = extent(boxes);
    const h = Math.max(sizes.target, ext.h + 2 * GROUP_PAD);
    const id = `pending-${c}`;
    const p = dnd.itemProps(id, { label: t(PENDING_KEY[c]) });
    return (
      <div
        {...p}
        key={c}
        className={[
          p.className,
          'ni-btt__pending',
          invited === id ? 'ni-invite' : '',
          demoHi === id ? 'ni-btt__hi' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-item={id}
        style={{
          width: w,
          height: h,
          marginLeft: m.left || undefined,
          marginRight: m.right || undefined,
        }}
      >
        {boxes.map((b, k) => (
          <Piece
            // biome-ignore lint/suspicious/noArrayIndexKey: pieces of a group are positional
            key={k}
            kind={c}
            box={b}
            u={u}
            id={`pending-${c}-${k}`}
            // Centred in the box; absolute positions start inside its 3 px border.
            dx={(w - ext.w) / 2 - 3}
            dy={(h - ext.h) / 2 - 3}
          />
        ))}
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
          const w = holderWidth(c, n, u, age, disks);
          // In a narrow outer cell the holder keeps clear of the tray's border (layout.ts).
          const m = holderMargins(i, columns.length, plan.colW[c], w);
          return (
            // The tray is a fieldset (its content box has no definite height), so each cell is as
            // tall as the inside of the tray: the waiting group centres TRAY_PAD clear of its border.
            <div
              key={c}
              className="ni-btt__traycell"
              style={{ gridColumn: i * 2 + 1, height: plan.trayH - 2 * 3 }}
            >
              {n > 0 ? pendingGroup(c, w, m) : null}
            </div>
          );
        })}
      </fieldset>
    ) : null;

  const nest = isMinus
    ? (() => {
        const p = dnd.targetProps('take', { label: t('ui.widget.btt.nest') });
        const inner = nestInner(plan.matW, plan.nestH);
        const taken = placeTaken(state.taken, u, inner, sizes.target, disks);
        const slots = nestSlots(state.taken, u, inner, sizes.target, disks);
        return (
          <div
            className="ni-btt__nest"
            data-flash={flash.has('take') ? 'true' : undefined}
            style={{ width: plan.matW, height: plan.nestH }}
          >
            <NestArt />
            <div {...p} className={`${p.className} ni-btt__pad ni-btt__nestpad`} />
            {COLUMNS.map((c) => {
              const slot = slots[c];
              if (!slot || state.taken[c] <= 0) return null;
              // The kind's put-back control: over its own pieces, a target wide at least, the
              // nest's whole height, 12 px or more from the next kind's (layout.ts: nestSlots).
              return (
                <button
                  key={c}
                  type="button"
                  className={['ni-btt__back', invited === `back-${c}` ? 'ni-invite' : '']
                    .filter(Boolean)
                    .join(' ')}
                  data-back={c}
                  aria-label={t(BACK_KEY[c])}
                  disabled={!interactive || !canPutBack(c)}
                  style={{ left: inner.x + slot.x, width: slot.w }}
                  onClick={() => onBack(c)}
                />
              );
            })}
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
                    u={u}
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

  const padKeys = (
    <NumberPadKeys
      onKey={onKey}
      onEnter={submit}
      disabled={!interactive}
      highlighted={pressedKey}
      shape={padWide ? '4x3' : '3x4'}
    />
  );
  // Wrapped so its width can be measured (chooseSide); the wrapper is exactly the button's box.
  const check = (
    <span className="ni-btt__checkwrap">
      <CheckButton
        onPress={submit}
        disabled={!interactive || !canSubmit}
        compact={problemInSide === true || steps}
      />
    </span>
  );

  // Without a Hundreds column (a short room, 03 §5.5) the mat is named by the columns it has.
  const matLabel = columns.includes('hundreds')
    ? t('ui.widget.btt.mat')
    : columns.map((c) => t(COL_KEY[c])).join(', ');
  const matEl = (
    <fieldset
      className="ni-btt__mat"
      aria-label={matLabel}
      // Back hands the focus here (a short room's steps).
      tabIndex={stepsPlan ? -1 : undefined}
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
  );

  const measureCopies =
    showWork && !canStep ? null : (
      // The problem card as the side panel would hold it: hidden, inert, measured (chooseSide); in
      // a short room also without its answer box (planSteps).
      <div className="ni-btt__measure" aria-hidden="true" inert>
        {problemCard(true, true)}
        {canStep ? problemCard(true, true, 'bare') : null}
        {canStep && !showWork ? problemCard(true, true, 'widest') : null}
        <span className="ni-btt__checkcopy">
          <CheckButton onPress={() => undefined} disabled compact />
        </span>
      </div>
    );

  // Next and Back: no trace and nothing recorded; the live region says the step once.
  const stepTo = (to: 'pieces' | 'answer') => {
    if (!interactive || to === step) return;
    stepFocus.current = to === 'answer' ? 'answer' : 'mat';
    const written = to === 'answer' && showWork && !saidWritten.current;
    if (written) saidWritten.current = true;
    setStepSaid(
      to === 'answer'
        ? written
          ? `${t('ui.widget.answer')}. ${t('ui.widget.btt.work')}`
          : t('ui.widget.answer')
        : matLabel,
    );
    setInvite(null);
    setStep(to);
  };

  if (stepsPlan) {
    const answering = step === 'answer';
    const stepButton = (to: 'pieces' | 'answer') => (
      <span className="ni-btt__stepbtn" data-cue={to === 'answer' ? 'next' : 'back'}>
        <BigButton
          label={to === 'answer' ? 'ui.btn.next' : 'ui.btn.close'}
          icon={to === 'answer' ? <ArrowIcon /> : <BackIcon />}
          // Next has the look "check" has where "check" will be: the one thing to press.
          tone={to === 'answer' ? 'sun' : 'cloud'}
          disabled={!interactive}
          onPress={() => stepTo(to)}
          showLabel={false}
          className="ni-check--compact"
        />
      </span>
    );
    // The pieces step: the tray's waiting groups side by side, or the take-away box.
    const stepsTray =
      isPlus && !trayEmpty ? (
        <fieldset
          className="ni-btt__tray ni-btt__tray--steps"
          aria-label={t('ui.widget.btt.adding')}
        >
          {columns.map((c) => {
            const n = state.pending[c];
            if (n <= 0) return null;
            return pendingGroup(c, holderWidth(c, n, u, age, disks), { left: 0, right: 0 });
          })}
        </fieldset>
      ) : null;
    const stepsTake = isMinus
      ? (() => {
          const p = dnd.targetProps('take', { label: t('ui.widget.btt.nest') });
          const w = stepsPlan.under ? stepsPlan.under.boxW : stepsPlan.sideW;
          const h = stepsPlan.boxH;
          const inner = { w: w - 2 * BOX_PAD, h: h - 2 * BOX_PAD };
          const a = stepsPlan.under
            ? underGroups(state.taken, u, sizes.target)
            : standingGroups(state.taken, u, sizes.target, disks);
          // Positions start inside the box's 3 px border; the pieces keep GUTTER clear of it.
          const edge = BOX_PAD - 3;
          const ox = edge + Math.max(0, Math.floor((inner.w - a.w) / 2));
          const oy = edge + Math.max(0, Math.floor((inner.h - a.h) / 2));
          return (
            <div
              className="ni-btt__nest ni-btt__takebox"
              data-flash={flash.has('take') ? 'true' : undefined}
              style={{ width: w, height: h }}
            >
              <div {...p} className={`${p.className} ni-btt__pad ni-btt__nestpad`} />
              {COLUMNS.map((c) => {
                const slot = a.slots[c];
                if (!slot || state.taken[c] <= 0) return null;
                return (
                  <button
                    key={c}
                    type="button"
                    className={['ni-btt__back', invited === `back-${c}` ? 'ni-invite' : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-back={c}
                    aria-label={t(BACK_KEY[c])}
                    disabled={!interactive || !canPutBack(c)}
                    style={{
                      left: ox + slot.x,
                      width: slot.w,
                      top: edge,
                      bottom: edge,
                      // A piece picked up to take: a tap anywhere in the box drops it there.
                      pointerEvents: dnd.selected !== null ? 'none' : undefined,
                    }}
                    onClick={() => onBack(c)}
                  />
                );
              })}
              <div
                className="ni-btt__taken"
                aria-hidden="true"
                style={{ left: ox, top: oy, width: a.w, height: a.h }}
              >
                {COLUMNS.flatMap((c) =>
                  a.groups[c].map((b, k) => (
                    <Piece
                      key={`${c}-${
                        // biome-ignore lint/suspicious/noArrayIndexKey: taken pieces are positional
                        k
                      }`}
                      kind={c}
                      box={b}
                      u={u}
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
    if (stepsPlan.under) {
      // Three columns of disks (layout.ts UnderPlan): the tray or the take-away box under the
      // mat; the answer step's columns read-only beside the problem or the algorithm.
      const under = stepsPlan.under;
      const readMat = (
        <fieldset
          className="ni-btt__readmat"
          aria-label={matLabel}
          style={{
            width: under.matW,
            height: under.matH,
            gridTemplateColumns: columns.map((c) => `${under.colW[c]}px`).join(' '),
            borderWidth: MAT_BORDER,
          }}
        >
          {columns.map((c) => {
            const boxes = placePieces(
              c,
              state.mat[c],
              u,
              { w: under.colW[c] - 2 * READ_PAD, h: under.bodyH - 2 * READ_PAD },
              Math.max(caps.mat[c], state.mat[c]),
              plan.rodsPerRow,
              disks,
            );
            return (
              <div key={c} className="ni-btt__readcol" data-col={c}>
                {/* The places are named here (the headers are not drawn): "Tens: 17". */}
                <span className="ni-visually-hidden">{`${t(COL_KEY[c])}: ${state.mat[c]}`}</span>
                <div className="ni-btt__pile" aria-hidden="true">
                  {boxes.map((b, i) => (
                    <Piece
                      // biome-ignore lint/suspicious/noArrayIndexKey: pieces of a column are positional
                      key={i}
                      kind={c}
                      box={b}
                      u={u}
                      id={`read-${c}-${i}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>
      );
      return (
        <div
          ref={rootRef}
          className="ni-btt"
          data-pieces="disks"
          data-tier={pictorial ? 'pictorial' : 'concrete'}
          data-disabled={disabled ? 'true' : undefined}
          data-goal={config.goal}
          data-op={op?.op}
          data-arrange="steps"
          data-under="true"
          data-step={step}
          style={handRootStyle}
        >
          {answering ? (
            <div
              ref={mainRef}
              className="ni-btt__main ni-btt__steps"
              style={{
                gridTemplateColumns: `${under.matW}px ${under.sideW}px`,
                gridTemplateRows: `${under.matH}px ${under.roomH - under.matH - ROW_GAP}px ${padRowHeight(age)}px`,
              }}
            >
              <div className="ni-btt__stepsmat">{readMat}</div>
              <div className="ni-btt__stepside ni-btt__stepside--tall" data-step="answer">
                {showWork ? work : problemCard(true)}
              </div>
              <div className="ni-btt__steprow ni-btt__underbtns">
                {check}
                {stepButton('pieces')}
              </div>
              <div className="ni-btt__padline ni-btt__padline--under">
                <NumberPadKeys
                  onKey={onKey}
                  onEnter={submit}
                  disabled={!interactive}
                  highlighted={pressedKey}
                  shape="row"
                  compact
                />
              </div>
            </div>
          ) : (
            <div
              ref={mainRef}
              className="ni-btt__main ni-btt__steps"
              style={{
                gridTemplateColumns: `${stepsPlan.matW}px ${stepsPlan.sideW}px`,
                gridTemplateRows: `${stepsPlan.matH}px ${stepsPlan.boxH}px`,
              }}
            >
              <div className="ni-btt__stepsmat">{matEl}</div>
              <div className="ni-btt__stepside" data-step="pieces">
                {problemCard(true, false, 'bare')}
                <div className="ni-btt__steprow ni-btt__steprow--end">{stepButton('answer')}</div>
              </div>
              <div className="ni-btt__underbox">
                {stepsTray}
                {stepsTake}
              </div>
            </div>
          )}
          <p className="ni-visually-hidden" role="status">
            {stepSaid}
          </p>
          <div ref={fxRef} className="ni-btt__fx" aria-hidden="true" />
          {inviteHand}
          {measureCopies}
        </div>
      );
    }
    return (
      <div
        ref={rootRef}
        className="ni-btt"
        data-pieces={disks ? 'disks' : undefined}
        data-tier={pictorial ? 'pictorial' : 'concrete'}
        data-disabled={disabled ? 'true' : undefined}
        data-goal={config.goal}
        data-op={op?.op}
        data-arrange="steps"
        data-step={step}
        style={handRootStyle}
      >
        <div
          ref={mainRef}
          className="ni-btt__main ni-btt__steps"
          style={{
            gridTemplateColumns: `${stepsPlan.matW}px ${stepsPlan.sideW}px`,
            // The pad row's height in both steps: the widget keeps one height, so nothing moves.
            gridTemplateRows: `${stepsPlan.matH}px ${padRowHeight(age)}px`,
          }}
        >
          <div className="ni-btt__stepsmat">{matEl}</div>
          {answering ? (
            <>
              <div className="ni-btt__stepside" data-step="answer">
                <div className="ni-btt__steprow" style={{ height: stepsPlan.rowH }}>
                  {problemCard(true)}
                  {check}
                </div>
                <div className="ni-btt__steprow ni-btt__steprow--end">{stepButton('pieces')}</div>
              </div>
              <div className="ni-btt__padline">
                <NumberPadKeys
                  onKey={onKey}
                  onEnter={submit}
                  disabled={!interactive}
                  highlighted={pressedKey}
                  shape="row"
                  compact
                />
              </div>
            </>
          ) : (
            <div className="ni-btt__stepside ni-btt__stepside--tall" data-step="pieces">
              <div className="ni-btt__steprow" style={{ height: stepsPlan.rowH }}>
                {problemCard(true, false, 'bare')}
                {stepButton('answer')}
              </div>
              {stepsTray}
              {stepsTake}
            </div>
          )}
        </div>
        <p className="ni-visually-hidden" role="status">
          {stepSaid}
        </p>
        <div ref={fxRef} className="ni-btt__fx" aria-hidden="true" />
        {inviteHand}
        {measureCopies}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="ni-btt"
      data-pieces={disks ? 'disks' : undefined}
      data-tier={pictorial ? 'pictorial' : 'concrete'}
      data-disabled={disabled ? 'true' : undefined}
      data-goal={config.goal}
      data-op={op?.op}
      data-arrange={arranged.current ?? undefined}
      data-side={checkInRow ? 'none' : undefined}
      style={handRootStyle}
    >
      <div ref={mainRef} className="ni-btt__main">
        {/* The problem centred over the mat. */}
        {/* An algorithm above the mat is the problem row on its own, centred: it writes the
            problem in columns (as it does in the side). Beside an expression it could be wider
            than the row's side cell and run into the side panel. */}
        {showProblemRow && showWork ? (
          <div className="ni-btt__problemrow ni-btt__problemrow--work" style={{ height: problemH }}>
            {work}
          </div>
        ) : showProblemRow ? (
          <div
            className="ni-btt__problemrow"
            data-check={checkInRow ? 'true' : undefined}
            style={{ height: problemH }}
          >
            <span />
            {problem}
            {checkInRow ? <span className="ni-btt__rowcheck">{check}</span> : <span />}
          </div>
        ) : null}
        {matEl}
        {tray}
        {nest}
      </div>
      <div
        ref={sideRef}
        className="ni-btt__side"
        data-problem={problemInSide ? 'true' : undefined}
        hidden={checkInRow}
        style={{ paddingTop: sideTop, gap: SIDE_GAP }}
      >
        {checkInRow ? null : workInSide ? work : null}
        {problemInSide && padWide ? (
          // A short room: the problem and "check" side by side, the 4 × 3 pad under them.
          <>
            <div className="ni-btt__padrow ni-btt__padrow--problem" style={{ gap: SIDE_GAP }}>
              {problemCard(true)}
              {check}
            </div>
            {padKeys}
          </>
        ) : problemInSide ? (
          <>
            {problemCard(true)}
            {config.thenAsk ? padKeys : null}
            {check}
          </>
        ) : checkBeside ? (
          // K with the algorithm above: "check" stands beside the pad's foot, so the algorithm,
          // the pad and "check" all fit beside the mat and the mat keeps the widget's height.
          <div className="ni-btt__padrow" style={{ gap: SIDE_GAP }}>
            {padKeys}
            {check}
          </div>
        ) : checkInRow ? null : (
          <>
            {config.thenAsk ? padKeys : null}
            {/* "check" right by the pad (06 §4), or at the mat's foot without one. */}
            {check}
          </>
        )}
      </div>
      <div ref={fxRef} className="ni-btt__fx" aria-hidden="true" />
      {inviteHand}
      {measureCopies}
    </div>
  );
}

export default BaseTenTradeWidget;
