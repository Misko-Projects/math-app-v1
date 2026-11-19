import { formatModel } from '@number-island/engine';
import type { StimulusSpec, WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useLayoutEffect,
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
import { CheckIcon, CloseIcon, HandPointerIcon } from '../../primitives/icons';
import { MIN_TARGET_PX, TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  CheckButton,
  cellToFit,
  countLayout,
  FitPicture,
  minObjectStep,
  naturalPictureSize,
  type ObjectLayout,
  ObjectSetView,
  ObjectSprite,
  objectSetLayout,
  PickCard,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSharedScale,
  useSubmitGuard,
  useWidgetRoom,
  type WidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './compare.css';

/**
 * `compare` (03 §5.5): two sides, each any `StimulusSpec` (objects, dots, ten-frames, numerals,
 * number lines…), framed side by side, and one question:
 *
 * - **more / fewer / longer / heavier**: tap the side (`left` | `right`) or "the same" (`same`);
 * - **same-or-not**: "the same" (=) or "not the same" (≠) (`same` | `not-same`);
 * - **symbol**: tap `<`, `=` or `>` (or drag it into the gap between the sides; keyboard works);
 *   the chosen symbol shows between the sides;
 * - **true-false**: yes (check) or no (cross) (`true` | `false`); a plain statement with no
 *   relation of its own reads "left = right"; a whole statement may sit on the left alone.
 *
 * With `allowMatchLines` on the concrete tier (objects on both sides) the two sets show as rows
 * and the child may pair objects: tap one in the top row, then one in the bottom row, and a line
 * joins them (trace `tap` `left-obj-<i>` / `right-obj-<i>`, then `move` `match-<l>-<r>`). Matches
 * are help, never the answer. "Check" sends `{ kind: 'choice', id }` through the format model.
 * Selection is an ink ring plus a check badge, never colour alone (06 §7).
 *
 * Layout (06 §1, container-relative): the widget measures its room (`useWidgetRoom`). Match rows
 * are used only when both rows fit at full target size with the answer controls; otherwise the
 * sides are drawn side by side (see `planLayout`). Side pictures are sized from the room; the
 * answer row goes below the sides, or in a column beside them when that gives bigger pictures.
 *
 * Demo ops (03 §5.5): `match {left, right}`, `highlight {side}`, `place-symbol {symbol}`, plus
 * `answer {id}`. An invite rings ONE enabled control and Pip's hand points at it (kit
 * `useInviteHand`), only while the child can act.
 */

const OPS = ['match', 'highlight', 'place-symbol', 'answer'] as const;
const FLY_MS = 520;

type Config = ConfigFor<'compare'>;
type Side = 'left' | 'right';
type Symbol = '<' | '=' | '>';
type Match = [number, number];

const SIDE_ASKS = new Set<Config['ask']>(['more', 'fewer', 'longer', 'heavier']);
const SYMBOLS: readonly Symbol[] = ['<', '=', '>'];
const SYMBOL_KEY: Record<Symbol, string> = {
  '<': 'ui.compare.less',
  '=': 'ui.compare.equal',
  '>': 'ui.compare.greater',
};

type GlyphKind = 'eq' | 'ne' | 'lt' | 'gt' | 'yes' | 'no';
const SYMBOL_GLYPH: Record<Symbol, GlyphKind> = { '<': 'lt', '=': 'eq', '>': 'gt' };

/** A pick control below the sides: its answer id, narration key and glyph. */
interface Choice {
  id: string;
  label: string;
  glyph: GlyphKind;
}

function choicesFor(ask: Config['ask']): Choice[] {
  switch (ask) {
    case 'same-or-not':
      return [
        { id: 'same', label: 'ui.compare.same', glyph: 'eq' },
        { id: 'not-same', label: 'ui.compare.not-same', glyph: 'ne' },
      ];
    case 'true-false':
      return [
        { id: 'true', label: 'ui.compare.yes', glyph: 'yes' },
        { id: 'false', label: 'ui.compare.no', glyph: 'no' },
      ];
    case 'symbol':
      return [];
    default:
      return [{ id: 'same', label: 'ui.compare.same', glyph: 'eq' }];
  }
}

/** Chunky relation glyphs (ink strokes on light cards, ≥ 3:1). */
function Glyph({ kind }: { kind: GlyphKind }) {
  if (kind === 'yes') return <CheckIcon />;
  if (kind === 'no') return <CloseIcon />;
  const ink = 'var(--color-ink)';
  const paths: Record<Exclude<GlyphKind, 'yes' | 'no'>, ReactNode> = {
    eq: <path d="M10 18h28M10 30h28" stroke={ink} strokeWidth="6" />,
    ne: (
      <>
        <path d="M10 18h28M10 30h28" stroke={ink} strokeWidth="6" />
        <path d="M31 8 17 40" stroke={ink} strokeWidth="5" />
      </>
    ),
    lt: <path d="M36 10 12 24l24 14" stroke={ink} strokeWidth="6" />,
    gt: <path d="m12 10 24 14-24 14" stroke={ink} strokeWidth="6" />,
  };
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="ni-cmp__glyph-svg"
      data-glyph={kind}
    >
      {paths[kind]}
    </svg>
  );
}

/**
 * "This one" at the start of a match row: Pip's pointing hand, turned to point along its row, so
 * a pre-reader sees which row the card picks (a bare triangle read as "play").
 */
function RowPointer() {
  return (
    <span className="ni-cmp__rowhand" data-glyph="row-pointer">
      <HandPointerIcon direction="up" />
    </span>
  );
}

/** The single number a side shows as a numeral (spoken on tap), or null. */
function sideNumeral(s: StimulusSpec): number | null {
  if (s.kind !== 'expression') return null;
  const [tok, ...rest] = s.expr.tokens;
  return tok?.t === 'num' && rest.length === 0 ? tok.v : null;
}

const hasRelation = (s: StimulusSpec) =>
  s.kind === 'expression' && s.expr.tokens.some((tok) => tok.t === 'rel');

// ---------- layout ----------

const ROOT_PAD = { x: 8, y: 6 };
/** Between the sides (and the gap or relation between them), and between sides and answers. */
const SIDE_GAP = 24;
const ANSWER_GAP = 24;
/** A framed side: its border and padding around the picture. */
const SIDE_PAD = 19;
/** The answer row: the choices' gap (room for a picked card's badge and ring) and padding. */
const CHOICE_GAP = 36;
const CHOICES_PAD = 8;
const CHECK_GAP = 40;
/** Match rows: the room between the rows for the lines, and a row's frame and padding. */
const ROW_GAP = 40;
const ROW_PAD = { x: 17, y: 13 };
const ROW_PICK_GAP = 20;
/**
 * Between two object targets: the 12 px target gap plus the invite ring's reach (4 px wide, 1 px
 * out: 5 px), so a ringed object stays ≥ 12 px clear of its neighbours (06 §4).
 */
const OBJ_GAP = 18;
/** Pictures never grow past this (an unbounded story stage, or a huge tablet). */
const MAX_SIDE_H = 300;

type Arrange = 'match' | 'row' | 'beside' | 'stack';

interface Box {
  w: number;
  h: number;
}

interface AnswerSize {
  items: Box[];
  check: Box;
}

const answerRow = (a: AnswerSize): Box => {
  const items = a.items;
  const w = items.reduce((s, b) => s + b.w, 0) + Math.max(0, items.length - 1) * CHOICE_GAP;
  return {
    w: (items.length ? w + 2 * CHOICES_PAD + CHECK_GAP : 0) + a.check.w,
    h: Math.max(a.check.h, ...items.map((b) => b.h + 2 * CHOICES_PAD)),
  };
};
const answerColumn = (a: AnswerSize): Box => {
  const items = a.items;
  const h = items.reduce((s, b) => s + b.h, 0) + Math.max(0, items.length - 1) * CHOICE_GAP;
  return {
    w: Math.max(a.check.w, ...items.map((b) => b.w + 2 * CHOICES_PAD)),
    h: (items.length ? h + 2 * CHOICES_PAD + ANSWER_GAP : 0) + a.check.h,
  };
};

/** How well a picture fits a box: its scale against its natural size (capped, so huge boxes tie). */
function fitScore(spec: StimulusSpec, box: Box): number {
  if (spec.kind === 'none') return Number.POSITIVE_INFINITY;
  if (box.w <= 0 || box.h <= 0) return 0;
  const nat = naturalPictureSize(spec, false);
  const natW = nat.flexWidth ? 360 : nat.w;
  return Math.min(1.5, box.w / natW, box.h / nat.h);
}

interface MatchGeometry {
  cell: number;
  button: number;
  overhang: number;
  rowW: number;
  rowH: number;
}

/** Both rows at full target size: one cell for both, objects ≥ the target and 18 px apart. */
function matchGeometry(
  layouts: [ObjectLayout, ObjectLayout],
  target: number,
  withPick: boolean,
): MatchGeometry {
  const step = Math.min(...layouts.map((l) => Math.min(1.12, minObjectStep(l))));
  const cell = Math.ceil((target + OBJ_GAP) / step);
  const button = Math.max(target, Math.floor(step * cell - OBJ_GAP));
  const overhang = Math.max(0, Math.ceil((button - cell) / 2));
  const objW = Math.max(...layouts.map((l) => l.width * cell)) + 2 * overhang;
  const objH = Math.max(...layouts.map((l) => l.height * cell)) + 2 * overhang;
  return {
    cell,
    button,
    overhang,
    rowW: objW + 2 * ROW_PAD.x + (withPick ? target + ROW_PICK_GAP : 0),
    rowH: objH + 2 * ROW_PAD.y,
  };
}

interface Plan {
  arrange: Arrange;
  /** The picture box of each side (sides layouts). */
  side: Box;
  /** The answer controls in a column (beside) or a row. */
  answers: 'row' | 'column';
  match: MatchGeometry | null;
}

function planLayout(opts: {
  room: WidgetRoom | null;
  specs: StimulusSpec[];
  mid: Box;
  answer: AnswerSize;
  match: MatchGeometry | null;
  sidePick: boolean;
}): Plan {
  const { room, specs, mid, answer, match } = opts;
  const W = (room?.width ?? 1180) - 2 * ROOT_PAD.x;
  const H = (room?.height ?? Number.POSITIVE_INFINITY) - 2 * ROOT_PAD.y;
  const row = answerRow(answer);
  const col = answerColumn(answer);
  // Match rows only when both rows fit at full target size with the answer controls.
  if (match) {
    const rowsH = 2 * match.rowH + ROW_GAP;
    if (match.rowW <= W && rowsH + ANSWER_GAP + row.h <= H && row.w <= W) {
      return { arrange: 'match', side: { w: 0, h: 0 }, answers: 'row', match };
    }
    if (match.rowW + ANSWER_GAP + col.w <= W && Math.max(rowsH, col.h) <= H) {
      return { arrange: 'match', side: { w: 0, h: 0 }, answers: 'column', match };
    }
  }
  const n = specs.length;
  const midW = mid.w > 0 ? mid.w + SIDE_GAP : 0;
  const capH = (h: number) => Math.min(MAX_SIDE_H, h);
  // A side the child picks keeps a target-sized card (and its ledge) around the picture.
  const pad = 2 * SIDE_PAD + (opts.sidePick ? 6 : 0);
  const boxes: Record<Exclude<Arrange, 'match'>, Box> = {
    row: {
      w: (W - midW - (n - 1) * SIDE_GAP) / n - 2 * SIDE_PAD,
      h: capH(H - ANSWER_GAP - row.h) - pad,
    },
    beside: {
      w: (W - col.w - ANSWER_GAP - midW - (n - 1) * SIDE_GAP) / n - 2 * SIDE_PAD,
      h: capH(H) - pad,
    },
    stack: {
      w: Math.min(W, 760) - 2 * SIDE_PAD,
      h:
        capH(
          (H - ANSWER_GAP - row.h - (mid.h > 0 ? mid.h + SIDE_GAP : 0) - (n - 1) * SIDE_GAP) / n,
        ) - pad,
    },
  };
  const score = (a: Exclude<Arrange, 'match'>) =>
    Math.min(...specs.map((s) => fitScore(s, boxes[a])));
  // Side by side with the answers below, unless another arrangement draws the pictures clearly
  // bigger (short rooms: answers beside; narrow ones: the sides stacked).
  let best: Exclude<Arrange, 'match'> = 'row';
  for (const a of ['beside', 'stack'] as const) {
    if (score(a) > score(best) * 1.15) best = a;
  }
  return {
    arrange: best,
    side: { w: Math.max(1, boxes[best].w), h: Math.max(1, boxes[best].h) },
    answers: best === 'beside' ? 'column' : 'row',
    match: null,
  };
}

interface Line {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Flight {
  symbol: Symbol;
  from: DOMRect;
  to: DOMRect;
  moving: boolean;
}

/** Where a demo invite points: a pick or choice (`data-id`), a symbol tile, or an object. */
type Cue = { kind: 'id'; id: string } | { kind: 'symbol'; s: Symbol } | { kind: 'obj'; id: string };

export function CompareWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, textLabels, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pending, setPending] = useState<{ side: Side; index: number } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);
  const room = useWidgetRoom(rootRef);
  // Drawn-to-size pictures (blocks, lines, numbers) share one scale: size is never a false cue.
  const shared = useSharedScale();

  const interactive = !disabled && !demoBusy;
  const ask = config.ask;
  const sidePick = SIDE_ASKS.has(ask);
  const target = MIN_TARGET_PX[ageMode];
  const leftSet = config.left.kind === 'objects' ? config.left.set : null;
  const rightSet = config.right.kind === 'objects' ? config.right.set : null;
  const leftLayout = leftSet ? objectSetLayout(leftSet) : null;
  const rightLayout = rightSet ? objectSetLayout(rightSet) : null;
  const matchable =
    tier === 'concrete' && config.allowMatchLines && leftLayout !== null && rightLayout !== null;
  const choices = choicesFor(ask);
  const validIds: string[] =
    ask === 'symbol'
      ? [...SYMBOLS]
      : [...(sidePick ? ['left', 'right'] : []), ...choices.map((c) => c.id)];
  const symbol = ask === 'symbol' && selected !== null ? (selected as Symbol) : null;

  // ---------- layout ----------

  // The answer controls' own sizes (they don't depend on the layout), measured once laid out.
  const [answerSize, setAnswerSize] = useState<AnswerSize | null>(null);
  useLayoutEffect(() => {
    const el = answerRef.current;
    if (!el) return;
    const measure = () => {
      const box = (e: Element | null, ledge = 0): Box => {
        const r = e?.getBoundingClientRect();
        return { w: Math.ceil(r?.width ?? 0), h: Math.ceil((r?.height ?? 0) + ledge) };
      };
      const next: AnswerSize = {
        // Each pick's ledge (6 px margin) sits below its box.
        items: [...el.querySelectorAll('.ni-cmp__choice')].map((c) => box(c, 6)),
        check: box(el.querySelector('.ni-cmp__check'), 6),
      };
      setAnswerSize((cur) => (cur && JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.querySelectorAll('.ni-cmp__choice, .ni-cmp__check')) ro.observe(c);
    return () => ro.disconnect();
  }, []);
  const pickPx = Math.round(target * 1.15);
  const fallbackAnswer: AnswerSize = {
    items: Array.from({ length: ask === 'symbol' ? 3 : choices.length }, () => ({
      w: pickPx,
      h: pickPx + 6,
    })),
    check: { w: TARGET_PX[ageMode].big + 8, h: TARGET_PX[ageMode].big + 6 },
  };
  const specs = config.right.kind === 'none' ? [config.left] : [config.left, config.right];
  const symbolGap = ask === 'symbol';
  const relation =
    ask === 'true-false' && config.right.kind !== 'none' && !hasRelation(config.left);
  const mid: Box = symbolGap
    ? { w: Math.round(target * 1.6), h: Math.round(target * 1.6) }
    : relation
      ? { w: Math.round(target * 0.9), h: Math.round(target * 0.9) }
      : { w: 0, h: 0 };
  const plan = planLayout({
    room,
    specs,
    mid,
    answer: answerSize ?? fallbackAnswer,
    match:
      matchable && leftLayout && rightLayout
        ? matchGeometry([leftLayout, rightLayout], target, sidePick)
        : null,
    sidePick,
  });
  /**
   * Match mode (concrete tier with match lines): the sets as rows of object targets. When the rows
   * don't fit the room at full target size, the widget falls back to the side-by-side pictures:
   * the sides become the pick targets and there are no object targets, so matching (optional
   * help, never the answer) is simply not offered.
   */
  const matchMode = plan.arrange === 'match';

  const speakKey = (key: string) => {
    if (speakOnTap) say(key);
  };

  const choose = (id: string, speak?: () => void) => {
    if (!interactive || !validIds.includes(id)) return;
    trace('tap', id);
    speak?.();
    setInvite(null);
    setSelected(id);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || selected === null) return false;
    const model = formatModel('compare');
    if (!model) return false;
    const state = model.apply(model.initialState(config), {
      op: 'answer',
      args: { id: selected },
    });
    const response = model.toResponse(state);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- symbol: tap or drag into the gap ----------

  const placeSymbol = (s: Symbol) => {
    speakKey(SYMBOL_KEY[s]);
    setInvite(null);
    setSelected(s);
  };
  const dndRef = useRef<{ select: (item: Symbol | null) => void } | null>(null);
  const dnd = useDragToTarget<Symbol, 'gap'>({
    disabled: !interactive || ask !== 'symbol',
    trace,
    // A tap on a symbol places it straight away (one tap for pre-readers); a drag drops it.
    onSelect: (item) => {
      if (item === null) return;
      placeSymbol(item);
      dndRef.current?.select(null);
    },
    onPlace: ({ item }) => placeSymbol(item),
  });
  dndRef.current = dnd;

  // ---------- match lines ----------

  const addMatch = (l: number, r: number) => {
    setMatches((prev) => [...prev.filter(([x, y]) => x !== l && y !== r), [l, r]]);
  };

  const tapObject = (side: Side, index: number, sprite: string) => {
    if (!interactive) return;
    trace('tap', `${side}-obj-${index}`);
    if (speakOnTap) say(spriteNameKey(sprite));
    if (pending && pending.side !== side) {
      const l = side === 'left' ? index : pending.index;
      const r = side === 'right' ? index : pending.index;
      trace('move', `match-${l}-${r}`);
      addMatch(l, r);
      setPending(null);
    } else if (pending && pending.index === index) {
      setPending(null);
    } else {
      setPending({ side, index });
    }
  };

  // Measure each matched pair's objects and draw a line between them (top row → bottom row).
  const measureLines = useCallback(() => {
    const rows = rowsRef.current;
    if (!rows) return;
    const box = rows.getBoundingClientRect();
    const objAt = (id: string) =>
      [...rows.querySelectorAll<HTMLElement>('[data-obj]')]
        .find((el) => el.dataset.obj === id)
        ?.getBoundingClientRect();
    const next: Line[] = [];
    for (const [l, r] of matches) {
      const a = objAt(`left-obj-${l}`);
      const b = objAt(`right-obj-${r}`);
      if (!a || !b) continue;
      next.push({
        key: `${l}-${r}`,
        x1: a.left + a.width / 2 - box.left,
        y1: a.bottom - box.top - 6,
        x2: b.left + b.width / 2 - box.left,
        y2: b.top - box.top + 6,
      });
    }
    setLines(next);
  }, [matches]);

  useLayoutEffect(() => {
    if (!matchMode) return;
    measureLines();
    const rows = rowsRef.current;
    if (!rows || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureLines());
    ro.observe(rows);
    return () => ro.disconnect();
  }, [matchMode, measureLines]);

  // ---------- demo mode (03 §6.3) ----------

  const flyRect = (find: (root: HTMLElement) => Element | undefined | null) => {
    const root = rootRef.current;
    return root ? (find(root)?.getBoundingClientRect() ?? null) : null;
  };
  const symbolTile = (root: HTMLElement, s: string) =>
    [...root.querySelectorAll<HTMLElement>('[data-symbol]')].find((el) => el.dataset.symbol === s);

  const flySymbol = async (s: Symbol) => {
    const from = flyRect((r) => symbolTile(r, s));
    const to = flyRect((r) => r.querySelector('.ni-cmp__pad'));
    if (reduced || !from || !to) return;
    setFlight({ symbol: s, from, to, moving: false });
    await wait(20);
    if (!alive.current) return;
    setFlight({ symbol: s, from, to, moving: true });
    await wait(FLY_MS);
    if (alive.current) setFlight(null);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'highlight') {
          const side = action.args?.side;
          if (side !== 'left' && side !== 'right') return;
          setHighlight(side);
          await pause(1200);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'match') {
          const l = Number(action.args?.left);
          const r = Number(action.args?.right);
          const ok =
            config.allowMatchLines &&
            Number.isInteger(l) &&
            Number.isInteger(r) &&
            l >= 0 &&
            r >= 0 &&
            l < (leftSet?.count ?? 0) &&
            r < (rightSet?.count ?? 0);
          if (!ok) return;
          if (!matchMode) {
            // The pictures have no tappable objects: point at each side in turn.
            setHighlight('left');
            await pause(500);
            if (!alive.current) return;
            setHighlight('right');
            await pause(500);
            if (alive.current) setHighlight(null);
            return;
          }
          setHighlight(`left-obj-${l}`);
          if (leftSet) say(spriteNameKey(leftSet.sprite));
          await pause(500);
          if (!alive.current) return;
          setHighlight(`right-obj-${r}`);
          addMatch(l, r);
          await pause(600);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'place-symbol' || action.op === 'answer') {
          const id = String(action.op === 'place-symbol' ? action.args?.symbol : action.args?.id);
          if (!validIds.includes(id)) return;
          if (ask === 'symbol') {
            setHighlight(`symbol-${id}`);
            say(SYMBOL_KEY[id as Symbol]);
            await pause(400);
            if (!alive.current) return;
            await flySymbol(id as Symbol);
            if (!alive.current) return;
          } else {
            setHighlight(id);
            await pause(600);
            if (!alive.current) return;
          }
          setSelected(id);
          setHighlight(null);
          await pause(300);
        }
      } finally {
        setDemoBusy(false);
        setFlight(null);
      }
    },
    invite: (action) => setInvite(action),
  });

  /** The one control the invite rings, only while the child can act (03 §6.3). */
  const cue: Cue | null = (() => {
    if (!invite || !interactive) return null;
    const a = invite.args ?? {};
    // A side is a target only for the side questions (its card, or its row's "this one").
    const sideCue = (side: unknown): Cue | null =>
      sidePick && (side === 'left' || side === 'right') ? { kind: 'id', id: side } : null;
    switch (invite.op) {
      case 'highlight':
        return sideCue(a.side);
      case 'match': {
        // The fallback layout has no object targets: no cue.
        if (!matchMode) return null;
        const l = Number(a.left);
        const r = Number(a.right);
        if (!Number.isInteger(l) || !Number.isInteger(r)) return null;
        if (l < 0 || r < 0 || l >= (leftSet?.count ?? 0) || r >= (rightSet?.count ?? 0)) {
          return null;
        }
        if (matches.some(([x, y]) => x === l && y === r)) return null;
        return pending?.side === 'left' && pending.index === l
          ? { kind: 'obj', id: `right-obj-${r}` }
          : { kind: 'obj', id: `left-obj-${l}` };
      }
      case 'place-symbol':
        return ask === 'symbol' && SYMBOLS.includes(a.symbol as Symbol)
          ? { kind: 'symbol', s: a.symbol as Symbol }
          : null;
      case 'answer': {
        const id = String(a.id);
        if (!validIds.includes(id)) return null;
        if (ask === 'symbol') return { kind: 'symbol', s: id as Symbol };
        return id === 'left' || id === 'right' ? sideCue(id) : { kind: 'id', id };
      }
      default:
        return null;
    }
  })();
  const cueKey =
    cue === null
      ? ''
      : cue.kind === 'id'
        ? `id:${cue.id}`
        : cue.kind === 'symbol'
          ? `sym:${cue.s}`
          : `obj:${cue.id}`;
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => {
      if (cue === null) return null;
      if (cue.kind === 'symbol') return symbolTile(root, cue.s) ?? null;
      const key = cue.kind === 'obj' ? 'obj' : 'id';
      return (
        [...root.querySelectorAll<HTMLElement>(`[data-${key}]`)].find(
          (el) => el.dataset[key] === cue.id,
        ) ?? null
      );
    },
    cueKey,
  );
  /** Ringed: the demo's highlight while it plays, or the invite's one control. */
  const lit = (id: string) =>
    highlight === id ||
    (cue !== null &&
      ((cue.kind === 'id' && cue.id === id) ||
        (cue.kind === 'obj' && cue.id === id) ||
        (cue.kind === 'symbol' && `symbol-${cue.s}` === id)));

  // ---------- render ----------

  const sideLabel = (side: Side) => t(side === 'left' ? 'ui.compare.left' : 'ui.compare.right');

  // Two counted pictures share one object size, so size is never a cue the numbers don't give
  // (a line of 6 must not look smaller than a scatter of 6). A double ten-frame stacks when that
  // draws it bigger.
  const sharedCount = (stack: boolean) => {
    const ls = specs.map((s) => countLayout(s, stack));
    if (specs.length < 2 || ls.some((l) => l === null)) return null;
    return Math.min(...ls.map((l) => cellToFit(l as ObjectLayout, plan.side.w, plan.side.h)));
  };
  const flatCell = sharedCount(false);
  const stackedCell = specs.some((s) => s.kind === 'ten-frame' && s.frames === 2)
    ? sharedCount(true)
    : null;
  const stackFrames = stackedCell !== null && flatCell !== null && stackedCell > flatCell;
  const sharedCell = stackFrames ? stackedCell : flatCell;

  const renderSide = (side: Side) => {
    const spec = config[side];
    if (spec.kind === 'none') return null;
    const name = sidePick ? undefined : sideLabel(side);
    const picture = (
      <FitPicture
        spec={spec}
        maxWidth={plan.side.w}
        maxHeight={plan.side.h}
        cell={sharedCell ?? undefined}
        stackFrames={stackFrames}
        maxScale={spec.kind === 'base-ten' ? 1.5 : 1}
        scale={shared.scale}
        onFit={shared.report(side)}
        label={name}
      />
    );
    const n = sideNumeral(spec);
    return (
      <div className="ni-cmp__side" data-side={side} data-pick={sidePick ? 'true' : undefined}>
        {sidePick ? (
          <PickCard
            className="ni-cmp__tray"
            variant="picture"
            label={n === null ? sideLabel(side) : `${sideLabel(side)}: ${n}`}
            selected={selected === side}
            highlighted={lit(side)}
            data-id={side}
            disabled={!interactive}
            onPress={() =>
              choose(side, () => {
                if (n !== null && speakOnTap) sayNumber(n);
              })
            }
          >
            <span className="ni-cmp__trayspace" />
          </PickCard>
        ) : (
          <div className="ni-cmp__tray ni-cmp__tray--static">{picture}</div>
        )}
        {/* A pickable side draws its picture over the card (the card is named by its side), so
            the button holds no text of its own (axe label-content-name-mismatch). */}
        {sidePick ? (
          <div className="ni-cmp__trayface" aria-hidden="true">
            {picture}
          </div>
        ) : null}
      </div>
    );
  };

  const gapLabel = t('ui.compare.gap');
  const renderMiddle = () => {
    if (symbolGap) {
      const pad = dnd.targetProps('gap', { label: gapLabel });
      return (
        <div className="ni-cmp__gap" data-filled={symbol ? 'true' : undefined}>
          <div {...pad} className={`${pad.className} ni-cmp__pad`} />
          {symbol ? (
            <span className="ni-cmp__placed" aria-hidden="true">
              <Glyph kind={SYMBOL_GLYPH[symbol]} />
            </span>
          ) : null}
        </div>
      );
    }
    if (relation) {
      return (
        <div className="ni-cmp__relation" aria-hidden="true">
          <Glyph kind="eq" />
        </div>
      );
    }
    return null;
  };

  const renderRow = (side: Side) => {
    const set = side === 'left' ? leftSet : rightSet;
    const layout = side === 'left' ? leftLayout : rightLayout;
    const geo = plan.match;
    if (!set || !layout || !geo) return null;
    const { cell, button, overhang } = geo;
    return (
      <div className="ni-cmp__row" data-side={side}>
        {sidePick ? (
          <PickCard
            className="ni-cmp__this"
            variant="picture"
            label={`${t('ui.compare.this-one')}: ${sideLabel(side)}`}
            selected={selected === side}
            highlighted={lit(side)}
            data-id={side}
            disabled={!interactive}
            onPress={() => choose(side)}
          >
            <RowPointer />
          </PickCard>
        ) : null}
        <div
          className={[
            'ni-cmp__tray',
            'ni-cmp__tray--objects',
            lit(side) && !sidePick ? 'ni-invite' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ padding: `${ROW_PAD.y - 3 + overhang}px ${ROW_PAD.x - 3 + overhang}px` }}
        >
          <ObjectSetView
            layout={layout}
            cell={cell}
            label={sideLabel(side)}
            renderObject={(o, style) => {
              if (o.kind === 'distractor') {
                return (
                  <span
                    key={`d-${o.index}`}
                    className="ni-objects__item"
                    style={style}
                    aria-hidden="true"
                  >
                    <ObjectSprite sprite={o.sprite} tone={o.tone} />
                  </span>
                );
              }
              const id = `${side}-obj-${o.index}`;
              const matched = matches.some(([l, r]) => (side === 'left' ? l : r) === o.index);
              const isPending = pending?.side === side && pending.index === o.index;
              // The button is target-sized and centred on the object's place; the sprite keeps
              // the size the picture gives it (a "big looking" set stays big looking).
              const cx = Number(style.left) + Number(style.width) / 2;
              const cy = Number(style.top) + Number(style.height) / 2;
              const sprite = Math.min(button - 8, Number(style.width));
              const objStyle: CSSProperties = {
                left: cx - button / 2,
                top: cy - button / 2,
                width: button,
                height: button,
                padding: (button - sprite) / 2,
              };
              return (
                <button
                  key={id}
                  type="button"
                  className={['ni-cmp__obj', lit(id) ? 'ni-invite' : ''].filter(Boolean).join(' ')}
                  style={objStyle}
                  data-obj={id}
                  data-matched={matched ? 'true' : undefined}
                  aria-pressed={isPending}
                  aria-label={`${t(spriteNameKey(o.sprite))} ${o.index + 1}`}
                  disabled={!interactive}
                  onClick={() => tapObject(side, o.index, o.sprite)}
                >
                  <ObjectSprite sprite={o.sprite} tone={o.tone} />
                </button>
              );
            }}
          />
        </div>
      </div>
    );
  };

  const renderChoice = (c: Choice) => (
    <span key={c.id} className="ni-cmp__choice">
      <PickCard
        label={t(c.label)}
        selected={selected === c.id}
        highlighted={lit(c.id)}
        variant="word"
        data-id={c.id}
        disabled={!interactive}
        onPress={() => choose(c.id, () => speakKey(c.label))}
      >
        <span className="ni-cmp__glyph">
          <Glyph kind={c.glyph} />
        </span>
        {textLabels ? <span className="ni-cmp__caption">{t(c.label)}</span> : null}
      </PickCard>
    </span>
  );

  const renderSymbol = (s: Symbol) => {
    const props = dnd.itemProps(s, { label: t(SYMBOL_KEY[s]) });
    const id = `symbol-${s}`;
    return (
      <span key={s} className="ni-cmp__choice">
        <div
          {...props}
          className={[props.className, 'ni-pick', 'ni-cmp__sym', lit(id) ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-symbol={s}
          data-chosen={symbol === s ? 'true' : undefined}
        >
          <span className="ni-cmp__glyph">
            <Glyph kind={SYMBOL_GLYPH[s]} />
          </span>
          {symbol === s ? (
            <span className="ni-pick__badge" aria-hidden="true">
              <CheckIcon tone="light" />
            </span>
          ) : null}
        </div>
      </span>
    );
  };

  const flightStyle: CSSProperties | undefined = flight
    ? {
        left: flight.moving ? flight.to.left : flight.from.left,
        top: flight.moving ? flight.to.top : flight.from.top,
        width: flight.moving ? flight.to.width : flight.from.width,
        height: flight.moving ? flight.to.height : flight.from.height,
        transitionDuration: `${FLY_MS}ms`,
      }
    : undefined;

  const vars = {
    '--cmp-pad': `${ROOT_PAD.y}px ${ROOT_PAD.x}px`,
    '--cmp-gap': `${ANSWER_GAP}px`,
    '--cmp-side-gap': `${SIDE_GAP}px`,
    '--cmp-row-gap': `${ROW_GAP}px`,
    '--cmp-choice-gap': `${CHOICE_GAP}px`,
    '--cmp-check-gap': `${CHECK_GAP}px`,
    '--cmp-mid': `${mid.w}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className="ni-cmp"
      data-tier={tier}
      data-ask={ask}
      data-mode={matchMode ? 'match' : 'sides'}
      data-arrange={plan.arrange}
      data-answers={plan.answers}
      data-disabled={disabled ? 'true' : undefined}
      style={{ ...vars, ...handRootStyle }}
    >
      {matchMode ? (
        <div className="ni-cmp__rows" ref={rowsRef}>
          {renderRow('left')}
          {renderRow('right')}
          <svg className="ni-cmp__lines" aria-hidden="true" focusable="false">
            {lines.map((l) => (
              <g key={l.key} className="ni-cmp__line">
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
                <circle cx={l.x1} cy={l.y1} r="7" />
                <circle cx={l.x2} cy={l.y2} r="7" />
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <div className="ni-cmp__stage" data-sides={specs.length}>
          {renderSide('left')}
          {renderMiddle()}
          {renderSide('right')}
        </div>
      )}

      <div className="ni-cmp__answer" ref={answerRef}>
        <fieldset
          className="ni-cmp__choices"
          aria-label={t('ui.widget.choices')}
          disabled={!interactive}
        >
          {ask === 'symbol' ? SYMBOLS.map(renderSymbol) : choices.map(renderChoice)}
        </fieldset>
        <span className="ni-cmp__check">
          <CheckButton onPress={submit} disabled={!interactive || selected === null} />
        </span>
      </div>

      {flight ? (
        <div className="ni-cmp__flight" style={flightStyle} aria-hidden="true">
          <Glyph kind={SYMBOL_GLYPH[flight.symbol]} />
        </div>
      ) : null}
      {inviteHand}
    </div>
  );
}

export default CompareWidget;
