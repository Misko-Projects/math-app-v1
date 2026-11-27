import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
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
import { ArrowIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { MIN_TARGET_PX, TARGET_GAP_PX, TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  CheckButton,
  HandArt,
  ObjectSprite,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  BundleBand,
  BundleIcon,
  CONTAINER_PAD,
  CONTAINER_PAD_TIGHT,
  ContainerArt,
  type ContainerKind,
  TenBundle,
} from './containers';
import { HEAP_COLS, HEAP_COLS_K, type HeapCell, heapCells, heapRows } from './heap';
import './make-set.css';
import { besideFrame, pageAfter, shownPage, type TenPage } from './tens';

/**
 * `make-set` (03 §5.5): make a set of exactly `target` in a container (concrete only).
 *
 * - **Containers** (`boat`, `basket`, `jar`, `raft`, `shell`): ten-frame slots drawn inside the
 *   container's art. Objects move between the container and a pile by drag (mouse, touch, pen),
 *   tap-to-select → tap-to-place, or keyboard (`useDragToTarget`). In `make` and `add-more` the
 *   pile is the supply; in `take-away` it is the "take away" pile beside the container, so the two
 *   parts stay visible. Taking an object back out of the container is always allowed (traced as
 *   `undo` outside take-away). The model takes back from the pile before the supply, so the pile
 *   and the supply are one heap in `make`/`add-more`.
 * - **Hands** (`hands`, SUB.05): two hands; tap a hand (or its "finger up" button, or ArrowUp) to
 *   raise a finger, "finger down" (or ArrowDown) to fold one. Parts are `[left, right]`.
 * - `showRunningCount` shows (and speaks) the count; otherwise placing an object only clicks.
 * - `groupsOf: 10` (CNT.19): a "make a ten" button ties every full ten-frame into a bundle.
 * - Layout follows the widget's measured width and, when its host sets one, height (06 §1):
 *   heap, container and actions in a row where they fit (1280 × 800), else the heap above the
 *   container (`stack`, `column`); in a short area the frames' chrome tightens and the heap and
 *   actions go beside the container (`side`), showing fewer supply objects at once if needed.
 *   Targets and gaps never shrink.
 * - Check is enabled whenever input is on: every state, the untouched one included, has a response.
 *
 * Every change goes through the engine model (`formatModel('make-set')`), which also gives the
 * response on "check": `{ count, removed, parts?, bundles? }` (packages/engine/README.md).
 *
 * Demo ops (03 §5.5): `drag {count, hand?}`, `remove {count, hand?}`, `count-aloud`, `bundle`,
 * `close-container`, plus the generic `answer {value}`: the model's answer op gives the end state
 * (the container holds `value`, every full ten bundled with groupsOf 10), and the widget drags or
 * removes one object at a time until it gets there.
 */

const OPS = ['drag', 'remove', 'count-aloud', 'bundle', 'close-container', 'answer'] as const;
const FLY_MS = 480;
const COUNT_MS = 600;
const DEMO_GAP_MS = 220;
/** The supply heap shows at most this many objects; more appear as objects are taken. */
const SUPPLY_VISIBLE = 12;
/** Rendered objects are capped (content stays ≤ 20 + supply); the model still tracks the rest. */
const MAX_OBJECTS = 40;
/** The gap between the heap, the container and the actions (`.ni-mset` gap in make-set.css). */
const LAYOUT_GAP = 32;
/** A pile's padding (22) and border (3) on each side, as in make-set.css. */
const PILE_EDGE = 2 * (22 + 3);
/** Most objects per heap row when the heap has a row of its own (12 visible → two rows). */
const STACK_HEAP_COLS = SUPPLY_VISIBLE / 2;
/** A pile's padding (26) and border (3) top and bottom, as in make-set.css. */
const PILE_EDGE_Y = 2 * (26 + 3);
/** The supply crate's taller top (44 px padding): its tag sits on the floor, under the rim. */
const CRATE_TAG_Y = 44 - 26;
/**
 * Under a drag invite the crate's bottom padding grows from 26 to 80 px: the guide's hand hangs ~52 px
 * below the invited object (with its tap bob), and stays ≥ 12 px above the 11 px rim.
 */
const HAND_ROOM = 80 - 26;
/**
 * A compact pile (short areas, where the normal one shows fewer objects): 6 px padding and the
 * 3 px border on every side (`data-tray="compact"` in make-set.css), so the tray hugs its objects.
 */
const PILE_EDGE_COMPACT = 2 * (6 + 3);
/** The take-away pile's arrow icon (56) and the pile's gap (12) beside or above its heap. */
const AWAY_HEAD = 56 + 12;
/**
 * The root's padding (make-set.css): normally 12 / 16; the tight chrome and `side` use the area's
 * full height, and `side` its full width too (the card around it has its own padding).
 */
const PAD = { x: 16, y: 12 };
const SIDE_PAD_X = 0;
/** The gap between the container and the `side` column, and between the column's parts. */
const SIDE_GAP = 24;
/** The hands are never drawn shorter than this (five fingers stay countable). */
const HAND_MIN_H = 120;
/** A hand card's padding and border, top to bottom, with 4 px to spare (make-set.css). */
const HAND_CARD_Y = 16 + 8 + 2 * 3 + 4;
/** `split`: between its parts (make-set.css). */
const SPLIT_GAP = 16;
/** A height no host grows to unless it grows with its content (the room probe). */
const PROBE_PX = 100_000;
/**
 * One ten-frame at a time: the small frame beside the shown one (the tied ten, or the ones), as in
 * make-set.css `.ni-mset__tens-frame`: 2 × 5 cells of 42 × 38 px (an object drawn 35 × 33 px in
 * each), 2 px between them, 2 px padding and a 3 px border: 96 × 208, as tall as a K ten-frame
 * (208). These are tokens at a smaller scale than the working frame (06 §2, one-frame mode): the
 * waiting ones are drawn ≥ 32 px, the tied ten's objects ≥ 40 px.
 */
const TENS_CELL = { w: 42, h: 38 };
const TENS_W = 2 * TENS_CELL.w + 2 + 2 * (2 + 3);
const TENS_H = 5 * TENS_CELL.h + 4 * 2 + 2 * (2 + 3);
/** The tied ten's "10" tag under it (`.ni-mset__tens-tag`: 34 px numeral, 2 px border) and gap. */
const TENS_TAG = 2 + 34 + 2;
const TENS_TAG_GAP = 2;
/**
 * The tied ten drawn as ONE bundle (containers.tsx `TenBundle`): ten objects drawn ≥ 40 px in two
 * columns of five (rows 32 px apart), the rope down the gap between them and a bow at the middle.
 * 96 × 168 (TENS_W wide).
 */
const BUNDLE_ART_H = 168;
/** The tied ten: the bundle, its "10" tag, and a 10 px strip under the tag for the guide's fingertip. */
const BUNDLE_H = BUNDLE_ART_H + TENS_TAG_GAP + TENS_TAG + 10;
/**
 * Between the shown frame and the token beside it (a token keeps ≥ 16 px from the working
 * frame). The invite rings on both sit inside their own boxes (make-set.css), so they stay
 * ≥ 12 px clear of each other.
 */
const TENS_GAP = 24;
/**
 * With groupsOf 10 the ten's frame can be bundled while the small frame of ones sits beside it:
 * its bow's ink reaches 29 px past the frame's edge (12 px out, the 17 px knot), so the gap holds
 * it and 12 px more (and the 4 px of a bundled frame's thicker border).
 */
const TENS_GAP_BOW = 29 + 12 + 4;
/**
 * One ten-frame at a time, the frames sit 4 px lower in the tight chrome, so an invite ring on
 * them or on the thing beside them (drawn inside their boxes) keeps ≥ 12 px below the boat's top
 * edge (the hull's top is 10 px down; the tight top margin is 18).
 */
const ONE_FRAME_TOP = 4;
/**
 * A bundled frame's bow sits ≥ 12 px outside its right edge and spans 17 px (the knot, 7 px plus
 * its outline): with 12 px to the container's edge, a container with groupsOf 10 needs this much
 * room right of its frames (4 px more: a bundled frame's border is 2 px thicker a side; 8 px more:
 * a drawn wall, the basket's, lies up to 8 px inside the container's box; 12 px more: the basket's
 * wall slants inwards, so at the knot's height it is further in still).
 */
const BOW_ROOM = 12 + 17 + 12 + 4 + 8 + 12;
/** The frame's slide when the ten is tied or untied (make-set.css `.ni-mset__frames`). */
const SLIDE_MS = 320;

type Layout = 'row' | 'stack' | 'column' | 'side' | 'split';
type Chrome = 'normal' | 'tight';
interface Room {
  width: number;
  height: number;
  actionsW: number;
  actionsH: number;
}
interface Box {
  w: number;
  h: number;
  pad: { top: number; right: number; bottom: number; left: number };
  /** Frames' top and gap in the box; one ten-frame at a time, the tops of the tied ten (with
   * its tag) and of the small frame of ones. */
  framesTop: number;
  frameGap: number;
  bundleTop: number;
  onesTop: number;
  /** A shown frame's width with its padding and border. */
  frameOuterW: number;
  /** The frames side by side in a row (two where a container has three or four ten-frames). */
  frameCols: number;
  /** Between two frames side by side (room for a tied ten's bow). */
  frameColGap: number;
}
interface Plan {
  layout: Layout;
  chrome: Chrome;
  /** One ten-frame at a time (capacity 11–20 where two ten-frames don't fit). */
  oneFrame: boolean;
  heapCols: number;
  /** The take-away pile's objects per row (`split` gives it a column of its own). */
  awayCols: number;
  box: Box;
  /** Visible supply rows when fewer than the heap's full size; null shows them all. */
  supplyRows: number | null;
  /**
   * Visible take-away rows when the pile cannot show every object at once (short areas): the
   * latest ones taken away show, and the earlier ones come back into view as objects go back.
   */
  awayRows: number | null;
  /** `split`: where the actions (and the heap) go; see `planSplit`. */
  actUnder: 'box' | 'away' | 'top';
  /** The piles' padding: `compact` where it lets the heap show more objects at once. */
  tray: 'normal' | 'compact';
}
/**
 * Layouts in order of preference; the first that fits the measured width and height wins:
 * the designed layouts, then the tight frame chrome, then the `side` layout, then fewer
 * visible supply rows. `[layout, chrome, may show fewer supply rows]`. Every container keeps
 * all its ten-frames in view where one of these fits; only then (capacity 11–20) the same list
 * runs again with one ten-frame at a time.
 */
const PLANS: readonly [Layout, Chrome, boolean][] = [
  ['row', 'normal', false],
  ['stack', 'normal', false],
  ['column', 'normal', false],
  ['row', 'tight', false],
  ['stack', 'tight', false],
  ['side', 'normal', false],
  ['side', 'tight', false],
  ['column', 'tight', false],
  ['split', 'tight', true],
  ['side', 'normal', true],
  ['column', 'normal', true],
  ['side', 'tight', true],
  ['column', 'tight', true],
];

type Config = ConfigFor<'make-set'>;
type ItemId = `set-${number}`;
type TargetId = 'container' | 'pile';
type Lists = { inside: ItemId[]; away: ItemId[]; supply: ItemId[] };
type View = { count: number; removed: number; parts?: number[]; bundles?: number };

interface Flight {
  sprite: string;
  from: DOMRect;
  to: DOMRect;
  moving: boolean;
}

const ID = (i: number): ItemId => `set-${i}`;

/** The "count" cue on the guide's hand: three counting dots in a row. */
function CountDots() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">
      {[4, 12, 20].map((cx) => (
        <circle key={cx} cx={cx} cy="12" r="3.2" fill="var(--color-sea-deep)" />
      ))}
    </svg>
  );
}

export function MakeSetWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber, sfx } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const model = formatModel('make-set');

  const hands = config.container === 'hands';
  const takeAway = config.mode === 'take-away';
  const capacity = Math.max(0, config.capacity);
  const start = Math.min(config.start ?? 0, capacity);
  const sprite = config.source.sprite;

  // ---------- model state (the single source of the response) ----------

  const initial = useMemo(() => model?.initialState(config), [model, config]);
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** What the model says the container holds now (its response shape, engine README). */
  const view = (s: typeof state): View => {
    const r = model && s ? model.toResponse(s) : null;
    return r?.kind === 'state' ? (r.value as unknown as View) : { count: 0, removed: 0 };
  };
  const v = view(state);
  const apply = (action: WidgetAction) => {
    if (!model || !stateRef.current) return view(stateRef.current);
    stateRef.current = model.apply(stateRef.current, action);
    setState(stateRef.current);
    return view(stateRef.current);
  };

  // ---------- objects (containers only): who is where ----------

  const total = Math.min(MAX_OBJECTS, start + Math.max(0, config.source.supply));
  const [lists, setLists] = useState<Lists>(() => {
    const ids = Array.from({ length: hands ? 0 : total }, (_, i) => ID(i));
    return { inside: ids.slice(0, start), away: [], supply: ids.slice(start) };
  });
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const commitLists = (next: Lists) => {
    listsRef.current = next;
    setLists(next);
  };
  /** The heap the child takes from: the pile first (the model's order), then the supply. */
  const outside = takeAway ? lists.supply : [...lists.away, ...lists.supply];
  /** One ten-frame at a time: the page (tens.ts), kept in step with the container's count. */
  const [tenPage, setTenPage] = useState<TenPage>(() => pageAfter(0, 0, start));
  /** The button beside the one shown frame; tying or untying swaps it, so focus follows it. */
  const tensRef = useRef<HTMLButtonElement | null>(null);
  const refocusTens = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the tens button is replaced
  useLayoutEffect(() => {
    if (!refocusTens.current) return;
    refocusTens.current = false;
    tensRef.current?.focus();
  }, [tenPage]);
  const lastInside = useRef(start);
  useLayoutEffect(() => {
    const n = lists.inside.length;
    const before = lastInside.current;
    if (n === before) return;
    lastInside.current = n;
    setTenPage((p) => pageAfter(p, before, n));
  }, [lists.inside.length]);

  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [flyingId, setFlyingId] = useState<ItemId | null>(null);
  const [counting, setCounting] = useState<number | null>(null);
  /**
   * After the guide counts aloud, the count marks stay up to the last object counted, and so does the
   * view counting used (a ten counted one by one stays in its frame, every object loose and
   * marked), until anything changes.
   */
  const [countedTo, setCountedTo] = useState<number | null>(null);
  const markTo = counting ?? countedTo;
  const [closed, setClosed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = tier === 'concrete' && !disabled && !demoBusy;
  /** Between the shown frame and the thing beside it (TENS_GAP, or room for a bow). */
  const tensGap = config.groupsOf === 10 ? TENS_GAP_BOW : TENS_GAP;
  /**
   * A drag invite points at the last object of the supply crate (its bottom row): the guide's hand hangs
   * below it, so the crate keeps room under its objects for the hand while the invite shows
   * (≥ 12 px above the crate's rim; `data-hand-room` in make-set.css, HAND_ROOM in the plans).
   */
  const dragInvite =
    config.container !== 'hands' &&
    interactive &&
    (invite?.op === 'drag' ||
      (invite?.op === 'answer' &&
        Number.isFinite(Number(invite.args?.value)) &&
        Number(invite.args?.value) > view(stateRef.current).count));

  /** Moves one object into the container (from the pile or supply). False when it can't. */
  const moveIn = (id: ItemId): boolean => {
    setCountedTo(null);
    const l = listsRef.current;
    if (l.inside.includes(id) || l.inside.length >= capacity) return false;
    const before = view(stateRef.current).count;
    const after = apply({ op: 'drag', args: { count: 1 } });
    if (after.count === before) return false;
    let away = l.away.filter((x) => x !== id);
    let supply = l.supply.filter((x) => x !== id);
    // The model took this one from the pile when the pile had any: keep the pile's size in step.
    if (!l.away.includes(id) && away.length > after.removed) {
      supply = [...away.slice(0, away.length - after.removed), ...supply];
      away = away.slice(away.length - after.removed);
    }
    commitLists({ inside: [...l.inside, id], away, supply });
    setClosed(false);
    return true;
  };

  /** Takes one object out of the container onto the pile. */
  const moveOut = (id: ItemId): boolean => {
    setCountedTo(null);
    const l = listsRef.current;
    if (!l.inside.includes(id)) return false;
    apply({ op: 'remove', args: { count: 1 } });
    commitLists({ ...l, inside: l.inside.filter((x) => x !== id), away: [...l.away, id] });
    setClosed(false);
    return true;
  };

  const placed = (count: number) => {
    if (config.showRunningCount) sayNumber(count);
    else sfx('build-tap');
  };

  const dnd = useDragToTarget<ItemId, TargetId>({
    disabled: !interactive,
    trace,
    canPlace: (item, target) => {
      const l = listsRef.current;
      return target === 'container'
        ? !l.inside.includes(item) && l.inside.length < capacity
        : l.inside.includes(item);
    },
    onSelect: (item) => {
      if (item && speakOnTap) say(spriteNameKey(sprite));
    },
    onPlace: ({ item, target }) => {
      setInvite(null);
      if (target === 'container') {
        if (moveIn(item)) placed(listsRef.current.inside.length);
      } else if (moveOut(item)) {
        if (!takeAway) trace('undo', item);
        placed(listsRef.current.inside.length);
      }
    },
  });

  // ---------- hands ----------

  const handParts: [number, number] = [v.parts?.[0] ?? 0, v.parts?.[1] ?? 0];
  const canRaise = (h: 0 | 1) => {
    if (!model || !stateRef.current || handParts[h] >= 5) return false;
    const next = model.apply(stateRef.current, { op: 'drag', args: { count: 1, hand: h } });
    return view(next).count > v.count;
  };
  const raise = (h: 0 | 1, via: 'hand' | 'button') => {
    if (!interactive || !canRaise(h)) return;
    trace('tap', via === 'hand' ? `hand-${h}` : `finger-up-${h}`);
    setInvite(null);
    const after = apply({ op: 'drag', args: { count: 1, hand: h } });
    placed(after.count);
  };
  const fold = (h: 0 | 1) => {
    if (!interactive || handParts[h] <= 0) return;
    trace('undo', `hand-${h}`);
    setInvite(null);
    const after = apply({ op: 'remove', args: { count: 1, hand: h } });
    placed(after.count);
  };

  // ---------- bundles and check ----------

  const bundles = v.bundles ?? 0;
  const canBundle = config.groupsOf === 10 && Math.floor(v.count / 10) > bundles;
  const bundle = () => {
    if (!interactive || !canBundle) return;
    trace('tap', 'bundle');
    setInvite(null);
    setCountedTo(null);
    apply({ op: 'bundle' });
    sfx('fuse');
  };

  /**
   * What "check" sends for a state: the model's response once the container is closed. Every
   * state has one, the untouched initial state included (a zero item's empty container is the
   * answer), so Check never waits for a first move. It still sends only on the child's tap, once
   * per submission (useSubmitGuard), and the runner judges it.
   */
  const responseFor = (s: typeof state) =>
    model && s ? model.toResponse(model.apply(s, { op: 'close-container' })) : null;
  const canCheck = interactive && responseFor(state) !== null;
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const response = responseFor(stateRef.current);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const rect = (selector: string) =>
    rootRef.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;

  const fly = async (from: DOMRect | null, to: DOMRect | null) => {
    if (reduced || !from || !to) return;
    setFlight({ sprite, from, to, moving: false });
    await wait(20);
    if (!alive.current) return;
    setFlight({ sprite, from, to, moving: true });
    await wait(FLY_MS);
  };

  const demoDragOne = async (hand: 0 | 1 | null): Promise<boolean> => {
    if (hands) {
      // No hand given: fill the left hand first, as the model does.
      const cur = view(stateRef.current).parts ?? [0, 0];
      const target: 0 | 1 = hand ?? ((cur[0] ?? 0) < 5 ? 0 : 1);
      const before = view(stateRef.current).count;
      const after = apply({ op: 'drag', args: { count: 1, hand: target } });
      if (after.count === before) return false;
      sayNumber(after.count);
      await pause(COUNT_MS);
      return true;
    }
    const l = listsRef.current;
    // The model takes from the pile before the supply.
    const next = [...l.away, ...l.supply][0];
    if (!next || l.inside.length >= capacity) return false;
    trace('drag', next);
    setFlyingId(next);
    await fly(rect(`[data-item="${next}"]`), rect(`[data-slot="${l.inside.length}"]`));
    setFlight(null);
    setFlyingId(null);
    if (!alive.current) return false;
    if (!moveIn(next)) return false;
    trace('drop', 'container');
    sayNumber(listsRef.current.inside.length);
    await pause(DEMO_GAP_MS);
    return true;
  };

  const demoRemoveOne = async (hand: 0 | 1 | null): Promise<boolean> => {
    if (hands) {
      const before = view(stateRef.current).count;
      const after = apply({
        op: 'remove',
        args: hand === null ? { count: 1 } : { count: 1, hand },
      });
      if (after.count === before) return false;
      await pause(COUNT_MS);
      return true;
    }
    const last = listsRef.current.inside.at(-1);
    if (!last) return false;
    setFlyingId(last);
    await fly(rect(`[data-item="${last}"]`), rect('[data-area="pile"]'));
    setFlight(null);
    setFlyingId(null);
    if (!alive.current) return false;
    moveOut(last);
    await pause(DEMO_GAP_MS);
    return true;
  };

  const countArg = (action: WidgetAction) => {
    const n = Number(action.args?.count ?? 1);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  };
  const handArg = (action: WidgetAction): 0 | 1 | null =>
    action.args?.hand === 0 || action.args?.hand === 1 ? action.args.hand : null;

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      setCountedTo(null);
      try {
        switch (action.op) {
          case 'drag':
            for (let i = 0; i < countArg(action); i++) {
              if (!(await demoDragOne(handArg(action))) || !alive.current) break;
            }
            break;
          case 'remove':
            for (let i = 0; i < countArg(action); i++) {
              if (!(await demoRemoveOne(handArg(action))) || !alive.current) break;
            }
            break;
          case 'count-aloud': {
            const now = view(stateRef.current);
            const n = now.count;
            // One ten-frame at a time with the first ten beside the ones. The guide counts it as one
            // ten ("ten", on it; the K teen-number idea) only where it really is a ten: tied in
            // the model (groupsOf 10, bundled), or an item with no bundling, where the tie is just
            // how one frame shows a full ten. A ten still to be bundled (CNT.19 / PV.09: "count
            // out ten ones") is counted one by one: its frame is shown for 1–10, then the ones
            // beside it, and that view stays, every object loose and marked (`countedTo`).
            let from = 0;
            if (!hands && oneFrame && beside === 'bundle' && n >= 10) {
              if (!config.groupsOf || (now.bundles ?? 0) >= 1) {
                setCounting(9);
                sayNumber(10);
                await pause(COUNT_MS);
                if (!alive.current) return;
                from = 10;
              } else {
                setTenPage(0);
                await pause(SLIDE_MS);
                if (!alive.current) return;
              }
            }
            for (let i = from; i < n; i++) {
              setCounting(i);
              sayNumber(i + 1);
              await pause(COUNT_MS);
              if (!alive.current) return;
            }
            if (n > 0) setCountedTo(n - 1);
            break;
          }
          case 'bundle':
            apply({ op: 'bundle' });
            sfx('fuse');
            await pause(COUNT_MS);
            break;
          case 'close-container':
            apply({ op: 'close-container' });
            setClosed(true);
            await pause(COUNT_MS);
            break;
          case 'answer': {
            // The model decides the answer's end state (03 §6.3); the widget animates towards it
            // one object at a time, then bundles the tens the model bundled.
            if (!model || !stateRef.current) break;
            const end = model.apply(stateRef.current, action);
            const want = view(end).count;
            for (let guard = 0; guard < MAX_OBJECTS; guard++) {
              const count = view(stateRef.current).count;
              if (count === want) break;
              const ok = count < want ? await demoDragOne(null) : await demoRemoveOne(null);
              if (!ok || !alive.current) break;
            }
            if (alive.current && (view(end).bundles ?? 0) > (view(stateRef.current).bundles ?? 0)) {
              apply({ op: 'bundle' });
              sfx('fuse');
              await pause(COUNT_MS);
            }
            break;
          }
        }
      } finally {
        if (alive.current) {
          setCounting(null);
          setFlight(null);
          setFlyingId(null);
          setDemoBusy(false);
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- sizes ----------

  const slot = MIN_TARGET_PX[ageMode];
  const gap = TARGET_GAP_PX;
  const frames = Math.max(1, Math.ceil(capacity / 10));
  const frameW = 5 * slot + 4 * gap;
  const frameH = 2 * slot + gap;
  const kind = (hands ? 'basket' : config.container) as ContainerKind;
  const containerName = t(`ui.set.${config.container}`);

  /**
   * The container's size (make-set.css). Frame chrome `normal`: a frame's padding (14) and ink
   * border (4) a side, 18 px between frames, the container's own margins (CONTAINER_PAD); `tight`
   * (short areas): 6 px padding (the slots keep visible room), a 2 px border, 4 px between frames
   * (objects in two frames stay 6 + 2 + 4 + 2 + 6 = 20 px apart) and the tight margins
   * (CONTAINER_PAD_TIGHT), so the frames always sit ≥ 8 px inside the art. `oneFrame`: one
   * ten-frame, with the small frame (TENS_W wide, BUNDLE_H with the tied ten's tag) beside it.
   */
  const boxFor = (chrome: Chrome, oneFrame: boolean): Box => {
    const tight = chrome === 'tight';
    const edge = tight ? 2 * (6 + 2) : 2 * (14 + 4);
    const frameGap = tight ? 4 : 18;
    const shown = oneFrame ? 1 : frames;
    // Three or four ten-frames stand two by two (four in a column are taller than a tablet).
    const frameCols = shown > 2 ? 2 : 1;
    const frameRows = Math.ceil(shown / frameCols);
    const frameColGap =
      frameCols > 1 ? (config.groupsOf === 10 ? Math.max(frameGap, BOW_ROOM) : frameGap) : 0;
    const gridH = frameRows * (frameH + edge) + (frameRows - 1) * frameGap;
    const base = (tight ? CONTAINER_PAD_TIGHT : CONTAINER_PAD)[kind];
    const pad = {
      ...base,
      top: base.top + (oneFrame && tight ? ONE_FRAME_TOP : 0),
      right: config.groupsOf === 10 ? Math.max(base.right, BOW_ROOM) : base.right,
    };
    const innerH = oneFrame ? Math.max(gridH, BUNDLE_H) : gridH;
    const innerW =
      frameCols * (frameW + edge) +
      (frameCols - 1) * frameColGap +
      (oneFrame ? tensGap + TENS_W : 0);
    return {
      w: innerW + pad.left + pad.right,
      h: innerH + pad.top + pad.bottom,
      pad,
      framesTop: pad.top + (innerH - gridH) / 2,
      frameGap,
      bundleTop: pad.top + (innerH - BUNDLE_H) / 2,
      onesTop: pad.top + (innerH - TENS_H) / 2,
      frameOuterW: frameW + edge,
      frameCols,
      frameColGap,
    };
  };

  // ---------- layout: follows the room the widget has (06 §1: container-relative) ----------

  const actionsRef = useRef<HTMLDivElement | null>(null);
  /**
   * Measured, null until mounted: the root's width (border box), the height its host gives it
   * (Infinity when the host grows with its content, as in a plain story) and the actions column.
   */
  const [room, setRoom] = useState<Room | null>(null);
  /** The room in which the actions went icon-only (a new room starts with their words again). */
  const [compactActs, setCompactActs] = useState<{ w: number; h: number } | null>(null);
  const iconActions =
    compactActs !== null &&
    room !== null &&
    compactActs.w === room.width &&
    compactActs.h === room.height;
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const host = el.parentElement;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      // Does the host bound the widget's height? Grow the root for one synchronous layout (no
      // paint): a host sized by its content grows with it; a host with a set height does not.
      let height = Number.POSITIVE_INFINITY;
      if (host) {
        const before = el.style.height;
        el.style.height = `${PROBE_PX}px`;
        const grown = host.clientHeight;
        el.style.height = before;
        if (grown < PROBE_PX) height = host.clientHeight;
      }
      const a = actionsRef.current?.getBoundingClientRect();
      const next: Room = { width, height, actionsW: a?.width ?? 0, actionsH: a?.height ?? 0 };
      setRoom((r) =>
        r &&
        r.width === next.width &&
        r.height === next.height &&
        r.actionsW === next.actionsW &&
        r.actionsH === next.actionsH
          ? r
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (host) ro.observe(host);
    if (actionsRef.current) ro.observe(actionsRef.current);
    return () => ro.disconnect();
  }, []);

  const heapCap = ageMode === 'k' ? HEAP_COLS_K : HEAP_COLS;
  const heapW = (cols: number) => cols * slot + (cols - 1) * gap;
  const rowsH = (rows: number) => rows * slot + (rows - 1) * gap;
  const showSupply = !takeAway || outside.length > 0;
  const piles = (showSupply ? 1 : 0) + (takeAway ? 1 : 0);
  /** The heaps' fullest sizes (each heap box keeps it, so the layout never jumps). */
  const supplyMost = Math.min(SUPPLY_VISIBLE, total);
  const awayMost = Math.min(MAX_OBJECTS, total);

  /**
   * Whether `layout` with `chrome` fits the measured room, and with what heap: the objects per
   * heap row and, when `reduce` allows, fewer visible supply rows (more objects appear as objects
   * are taken, as with SUPPLY_VISIBLE). Targets and gaps never shrink.
   * - `row` (as designed for 1280 × 800): heap, container, (take-away pile,) actions side by side.
   * - `stack`: the heap on its own row above, the container with the actions beside it, the
   *   take-away pile below.
   * - `column`: everything in one column, actions last.
   * - `side` (short areas, e.g. 960 × 600): the container on the right, the heap, the take-away
   *   pile (its arrow beside its heap) and the actions in a column beside it.
   * - `split` (take-away in short areas): the container with the heap and the actions in a row
   *   under it, and the take-away pile in a column of its own beside them, showing as many rows
   *   as the height holds (see `planSplit`).
   */
  const planFor = (
    layout: Layout,
    chrome: Chrome,
    reduce: boolean,
    oneFrame: boolean,
    widthOnly = false,
  ): Plan | null => {
    if (!room) return null;
    if (layout === 'split') return widthOnly ? null : planSplit(chrome, oneFrame);
    const side = layout === 'side';
    const g = side ? SIDE_GAP : LAYOUT_GAP;
    const innerW = room.width - 2 * (side ? SIDE_PAD_X : PAD.x);
    const innerH = widthOnly
      ? Number.POSITIVE_INFINITY
      : room.height - 2 * (side || chrome === 'tight' ? 0 : PAD.y);
    const box = boxFor(chrome, oneFrame);
    const awaySide = side && takeAway ? AWAY_HEAD : 0;
    const stacked = (hs: number[]) => {
      const parts = hs.filter((h) => h > 0);
      return parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * g;
    };
    const aw = room.actionsW;
    const ah = room.actionsH;
    /** The best heap with a tray: as many rows as fit (all, unless `reduce`), or null. */
    const withTray = (tray: Plan['tray']): Plan | null => {
      const edgeX = tray === 'compact' ? PILE_EDGE_COMPACT : PILE_EDGE;
      const edgeY = tray === 'compact' ? PILE_EDGE_COMPACT : PILE_EDGE_Y;
      const fitCols = (w: number) => Math.floor((w - edgeX + gap) / (slot + gap));
      const heapCols =
        layout === 'row'
          ? heapCap
          : Math.min(STACK_HEAP_COLS, fitCols(side ? innerW - box.w - g - awaySide : innerW));
      if (heapCols < (side && !oneFrame ? 2 : 1)) return null;
      const pileW = heapW(heapCols) + edgeX;
      const awayH = takeAway
        ? rowsH(Math.max(1, heapRows(awayMost, heapCols).length)) + edgeY + (side ? 0 : AWAY_HEAD)
        : 0;
      const supplyH = (rows: number) =>
        showSupply
          ? rowsH(rows) +
            edgeY +
            (tray === 'compact' ? 0 : CRATE_TAG_Y + (dragInvite && !takeAway ? HAND_ROOM : 0))
          : 0;
      const fits = (rows: number) => {
        const s = supplyH(rows);
        const [w, h] =
          layout === 'row'
            ? [piles * pileW + box.w + aw + (piles + 1) * g, Math.max(s, box.h, awayH, ah)]
            : layout === 'stack'
              ? [
                  Math.max(box.w + g + aw, piles ? pileW : 0),
                  stacked([s, Math.max(box.h, ah), awayH]),
                ]
              : layout === 'column'
                ? [Math.max(box.w, aw, piles ? pileW : 0), stacked([s, box.h, awayH, ah])]
                : [
                    box.w + g + Math.max(pileW + awaySide, aw),
                    Math.max(box.h, stacked([s, awayH, ah])),
                  ];
        return w <= innerW + 0.5 && h <= innerH + 0.5;
      };
      const full = Math.max(1, heapRows(supplyMost, heapCols).length);
      for (let rows = full; rows >= (reduce && showSupply ? 1 : full); rows--) {
        if (fits(rows)) {
          const supplyRows = rows === full ? null : rows;
          return {
            layout,
            chrome,
            oneFrame,
            heapCols,
            awayCols: heapCols,
            box,
            supplyRows,
            awayRows: null,
            actUnder: 'box',
            tray,
          };
        }
      }
      return null;
    };
    const normal = withTray('normal');
    // The full heap in the normal tray, as designed; else (fewer objects at once) whichever tray
    // shows more objects, so a short area never shows one object in a big empty tray.
    if (!reduce || (normal && normal.supplyRows === null)) return normal;
    const compact = withTray('compact');
    const shown = (q: Plan | null) =>
      q === null ? 0 : q.supplyRows === null ? supplyMost : q.supplyRows * q.heapCols;
    return shown(compact) > shown(normal) ? compact : normal;
  };
  /**
   * `split`: a take-away item where the pile cannot stand in the column beside the container with
   * the heap and the actions (ten K objects are 356 px of rows alone). The pile gets a column of
   * its own beside the container, without its arrow, and shows as many rows as fit: when that is
   * not every object the item has, the latest ones taken show. Compact trays, no padding. Where
   * the heap and the actions go (`actUnder`), whichever shows the most of the pile:
   * - `box`: under the container, the heap first;
   * - `away` (no heap): the actions under the pile;
   * - `top` (with a heap): one heap object at a time and the actions in a row above the pile.
   */
  const planSplit = (chrome: Chrome, oneFrame: boolean): Plan | null => {
    if (!room || !takeAway) return null;
    const g = SPLIT_GAP;
    const box = boxFor(chrome, oneFrame);
    const edge = PILE_EDGE_COMPACT;
    const fitCols = (w: number) => Math.floor((w - edge + gap) / (slot + gap));
    const fitRows = (h: number) => Math.floor((h - edge + gap) / (slot + gap));
    const fitsH = (h: number) => h <= room.height + 0.5;
    const variant = (actUnder: Plan['actUnder']): Plan | null => {
      if ((actUnder === 'away') === showSupply && actUnder !== 'box') return null;
      // Under the container: the heap and the actions (`box`), or nothing.
      const besideAct = actUnder === 'box' ? room.actionsW + g : 0;
      const supplyCols = !showSupply
        ? 0
        : actUnder === 'top'
          ? 1
          : Math.min(STACK_HEAP_COLS, supplyMost, fitCols(box.w - besideAct));
      if (showSupply && supplyCols < 1) return null;
      const supplyW = showSupply ? heapW(supplyCols) + edge : 0;
      const underW = actUnder === 'box' ? supplyW + (showSupply ? g : 0) + room.actionsW : 0;
      const leftW = Math.max(box.w, underW);
      // Above or under the pile: the actions (`away`), or the heap and the actions (`top`).
      const headW = actUnder === 'top' ? supplyW + g + room.actionsW : 0;
      const awayCols = Math.min(
        STACK_HEAP_COLS,
        fitCols(room.width - leftW - g),
        Math.max(2, awayMost),
      );
      const rightW = Math.max(
        heapW(awayCols) + edge,
        headW,
        actUnder === 'away' ? room.actionsW : 0,
      );
      if (awayCols < 2 || leftW + g + rightW > room.width + 0.5) return null;
      const supplyFull = Math.max(1, heapRows(supplyMost, Math.max(1, supplyCols)).length);
      const supplyH = (rows: number) => (showSupply ? rowsH(rows) + edge : 0);
      let supplyRows = actUnder === 'top' ? 1 : supplyFull;
      const leftH = (rows: number) =>
        actUnder === 'box' ? box.h + g + Math.max(supplyH(rows), room.actionsH) : box.h;
      while (supplyRows > 1 && !fitsH(leftH(supplyRows))) supplyRows -= 1;
      if (!fitsH(leftH(supplyRows))) return null;
      const headH =
        actUnder === 'away'
          ? g + room.actionsH
          : actUnder === 'top'
            ? g + Math.max(supplyH(1), room.actionsH)
            : 0;
      const awayFull = Math.max(1, heapRows(awayMost, awayCols).length);
      const awayRows = Math.min(awayFull, fitRows(room.height - headH));
      if (awayRows < 1) return null;
      return {
        layout: 'split',
        chrome,
        oneFrame,
        heapCols: Math.max(1, supplyCols),
        awayCols,
        box,
        supplyRows: supplyRows === supplyFull ? null : supplyRows,
        awayRows: awayRows === awayFull ? null : awayRows,
        actUnder,
        tray: 'compact',
      };
    };
    const shown = (q: Plan | null) =>
      q === null ? 0 : q.awayRows === null ? awayMost : q.awayRows * q.awayCols;
    return (['box', 'away', 'top'] as const)
      .map(variant)
      .reduce<Plan | null>((best, q) => (shown(q) > shown(best) ? q : best), null);
  };
  const firstFit = (oneFrame: boolean) =>
    PLANS.reduce<Plan | null>((found, [l, c, r]) => found ?? planFor(l, c, r, oneFrame), null);
  const fitted: Plan | null = hands
    ? null
    : (firstFit(false) ??
      // Two ten-frames fit nowhere (capacity 11–20): one ten-frame at a time.
      (frames === 2 ? firstFit(true) : null));
  // Nothing fits with the actions' words: the buttons go icon-only (their labels stay their
  // names and are spoken), which gives the container their width, and the plan runs again.
  const stuck = !hands && room !== null && fitted === null;
  useLayoutEffect(() => {
    if (
      stuck &&
      room &&
      !(compactActs && compactActs.w === room.width && compactActs.h === room.height)
    ) {
      setCompactActs({ w: room.width, h: room.height });
    }
  }, [stuck, room, compactActs]);
  const plan: Plan | null = hands
    ? null
    : (fitted ??
      // Nothing fits the height: as wide as fits, and the area scrolls down.
      planFor('row', 'normal', false, false, true) ??
      planFor('stack', 'normal', false, false, true) ??
      planFor('column', 'normal', false, false, true));
  const layout: Layout = plan?.layout ?? 'row';
  const chrome: Chrome = plan?.chrome ?? 'normal';
  const oneFrame = plan?.oneFrame ?? false;
  const box = plan?.box ?? boxFor('normal', false);
  const heapCols = plan?.heapCols ?? heapCap;
  const awayCols = plan?.awayCols ?? heapCols;
  /** Take-away objects shown at once: all of them, unless a short area holds fewer rows. */
  const awayVisible = plan?.awayRows != null ? plan.awayRows * awayCols : MAX_OBJECTS;
  const tray = plan?.tray ?? 'normal';
  /** Supply objects shown at once (fewer when the area is short; more appear as objects go). */
  const supplyVisible =
    plan?.supplyRows != null
      ? Math.min(SUPPLY_VISIBLE, plan.supplyRows * heapCols)
      : SUPPLY_VISIBLE;
  /** The `side` layout's left column, top to bottom. */
  const sideParts = [showSupply && 'supply', takeAway && 'away', 'act'].filter(
    (p): p is string => typeof p === 'string',
  );
  /** In `side`, each part of the left column after the first sits SIDE_GAP below the last. */
  const sideGap = (part: string): CSSProperties | undefined =>
    layout === 'side' && sideParts.indexOf(part) > 0 ? { marginTop: SIDE_GAP } : undefined;
  const areas =
    layout === 'stack'
      ? [showSupply && 'supply supply', 'box act', takeAway && 'away away']
      : layout === 'side'
        ? ['. box', ...sideParts.map((p) => `${p} box`), '. box']
        : layout === 'split'
          ? plan?.actUnder === 'top'
            ? ['box supply act', 'box away away']
            : showSupply
              ? ['box box away', 'supply act away']
              : plan?.actUnder === 'away'
                ? ['box away', 'box act']
                : ['box away', 'act away']
          : [showSupply && 'supply', 'box', takeAway && 'away', 'act'];
  const layoutStyle: CSSProperties =
    layout === 'row'
      ? {}
      : {
          gridTemplateAreas: areas
            .filter(Boolean)
            .map((a) => `"${a}"`)
            .join(' '),
          ...(layout === 'side'
            ? { gridTemplateRows: `1fr ${sideParts.map(() => 'auto').join(' ')} 1fr` }
            : {}),
        };

  // ---------- one ten-frame at a time (presentation only) ----------

  const insideCount = lists.inside.length;
  /** The frame shown: the first ten, or the ones with the ten tied beside them (tens.ts). */
  const page = shownPage(tenPage, insideCount);
  const beside = oneFrame ? besideFrame(tenPage, insideCount) : null;
  /**
   * A ten still to be bundled (groupsOf 10, nothing bundled) is counted one by one, each crab in
   * its own slot (see `count-aloud`). Counting that started with both frames in view can land in
   * one-frame mode on the ones page (the host shrinks while the guide counts): the ten's frame comes back
   * before the next paint, so no number is spoken over the loose sheaf as a whole, and the view
   * stays as when counting starts in one frame.
   */
  const looseTenCounted =
    counting !== null && beside === 'bundle' && Boolean(config.groupsOf) && bundles < 1;
  useLayoutEffect(() => {
    if (looseTenCounted) setTenPage(0);
  }, [looseTenCounted]);
  /** Untie the ten (it shows in the frame again, so objects can come out) or tie it again. */
  const toggleTen = () => {
    if (!interactive || beside === null) return;
    setCountedTo(null);
    // Keyboard (or a focused tap): the replacement button takes the focus.
    refocusTens.current = tensRef.current !== null && document.activeElement === tensRef.current;
    if (beside === 'bundle') {
      setTenPage(0);
      sayNumber(10);
    } else {
      setTenPage(1);
      sfx('fuse');
    }
  };

  // Demo invite (03 §6.3): the ring and the guide's hand sit on the ONE thing the child acts on next.
  // `answer` invites a drag or a remove, whichever moves the count towards the value.
  // The cue shows only while the child can act on it: never on a disabled control, and not while
  // the widget is disabled or the guide is playing (the invite is kept and shows once input is back).
  const cue = interactive;
  const answerWant = invite?.op === 'answer' ? Number(invite.args?.value) : Number.NaN;
  const inviteStep: 'drag' | 'remove' | null =
    invite?.op === 'drag' || (Number.isFinite(answerWant) && answerWant > v.count)
      ? 'drag'
      : invite?.op === 'remove' || (Number.isFinite(answerWant) && answerWant < v.count)
        ? 'remove'
        : null;
  /** The heap the child drags from: in take-away, the "take away" pile goes back first. */
  const shownOutside = outside.slice(0, supplyVisible);
  const dragFrom = takeAway ? (lists.away.length > 0 ? lists.away : shownOutside) : shownOutside;
  /**
   * One ten-frame at a time: the object a remove takes out (the last one in) can be in the frame
   * not shown (exactly ten, tied; or the ones, while the ten is shown). The invite then goes on the
   * button beside the frame, which shows that frame; the object is invited once it is in view.
   */
  const removeHidden =
    oneFrame && insideCount > 0 && (insideCount - 1 < 10 ? 0 : 1) !== page && beside !== null;
  // The last object of its heap: it sits in the bottom row, so the hand below it covers nothing.
  const invitedItem: ItemId | null =
    hands || !cue
      ? null
      : inviteStep === 'drag'
        ? lists.inside.length < capacity
          ? (dragFrom.at(-1) ?? null)
          : null
        : inviteStep === 'remove' && !removeHidden
          ? (lists.inside.at(-1) ?? null)
          : null;
  const invitedTens = !hands && cue && inviteStep === 'remove' && removeHidden;
  /** Hands: the finger button the child presses next (drag → "finger up", remove → "down"). */
  const invitedHand: 0 | 1 | null =
    !hands || !invite || !inviteStep || !cue
      ? null
      : (handArg(invite) ??
        (inviteStep === 'drag' ? (handParts[0] < 5 ? 0 : 1) : handParts[1] > 0 ? 1 : 0));
  /**
   * count-aloud invites the thing counting starts on: the frames, or, with one ten-frame at a time
   * and the ten tied beside the ones, the tied ten (counted first, as "ten").
   */
  const invitedCountTens = cue && invite?.op === 'count-aloud' && oneFrame && beside === 'bundle';
  const invitedCount = cue && invite?.op === 'count-aloud' && !invitedCountTens;
  /** An `answer` invite whose count is reached: what is left is tying full tens, then Check. */
  const answerCounted =
    Number.isFinite(answerWant) && answerWant === v.count && inviteStep === null;
  // The model's `answer` ends with every full ten tied (groupsOf 10), and `set.count` checks the
  // bundles too: with a full ten still loose the invite goes on "Make a ten" first, Check after.
  const invitedBundle = cue && canBundle && (invite?.op === 'bundle' || answerCounted);
  const invitedCheck =
    canCheck && (invite?.op === 'close-container' || (answerCounted && !canBundle));

  // ---------- the heap's layout ----------

  /** The heap keeps the size of its fullest state, so it never jumps as objects leave. */
  const heapBox = (most: number, cols: number) => {
    const rows = Math.max(1, heapRows(most, cols).length);
    return {
      width: heapW(cols),
      minHeight: rows * slot + (rows - 1) * gap,
    };
  };

  // ---------- render ----------

  const thingName = t(spriteNameKey(sprite));

  // The guide's up-pointing hand hangs below the ONE invited thing (kit `useInviteHand`): an object, the
  // frames, a hand card or a button, its fingertip inside the bottom edge and clear of the
  // button's icon.
  const invitedFinger = (h: 0 | 1) =>
    invitedHand !== h
      ? null
      : inviteStep === 'drag' && canRaise(h)
        ? 'up'
        : inviteStep === 'remove' && handParts[h] > 0
          ? 'down'
          : null;
  const handTarget: string | null = invitedItem
    ? `[data-item="${invitedItem}"]`
    : invitedCount
      ? hands
        ? '.ni-mset__handbox:nth-child(1) .ni-mset__hand-btn'
        : '.ni-mset__frames'
      : invitedHand !== null && invitedFinger(invitedHand)
        ? `.ni-mset__handbox:nth-child(${invitedHand + 1}) [data-ctl="${invitedFinger(invitedHand)}"] .ni-btn`
        : invitedTens || invitedCountTens
          ? '.ni-mset__tens'
          : invitedBundle
            ? '.ni-mset__action.ni-invite .ni-btn'
            : invitedCheck
              ? '.ni-mset__action .ni-btn.ni-invite'
              : null;
  /**
   * What the guide's hand asks for, on its wrist (kit `useInviteHand` cue), so a remove invite never
   * looks like a count invite on the same thing: "take one out" (an arrow up, out of the
   * container) or "count" (three counting dots).
   */
  const handCue: 'take' | 'count' | null =
    inviteStep === 'remove' && (invitedItem !== null || invitedTens)
      ? 'take'
      : invitedCount || invitedCountTens
        ? 'count'
        : null;
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => (handTarget ? root.querySelector<HTMLElement>(handTarget) : null),
    handTarget ? `${handTarget}|${handCue ?? ''}` : '',
    // The kit picks the hand's side (below, or beside or above when below would cover a target).
    undefined,
    handCue === null ? undefined : (
      <span className="ni-mset__cue" data-cue={handCue}>
        {handCue === 'take' ? <ArrowIcon className="ni-mset__arrow-up" /> : <CountDots />}
      </span>
    ),
  );

  const renderItem = (
    id: ItemId,
    place: 'inside' | 'outside',
    index: number,
    style?: CSSProperties,
  ) => {
    const label =
      place === 'inside' ? t('ui.set.thing', { thing: thingName, n: index + 1 }) : thingName;
    const props = dnd.itemProps(id, { label });
    const invited = invitedItem === id;
    return (
      <div
        key={id}
        {...props}
        className={[props.className, 'ni-mset__item', invited ? 'ni-invite' : '']
          .filter(Boolean)
          .join(' ')}
        style={style}
        data-item={id}
        data-flying={flyingId === id ? 'true' : undefined}
        data-counting={place === 'inside' && counting === index ? 'true' : undefined}
      >
        <ObjectSprite sprite={sprite} />
        {place === 'inside' && markTo !== null && index <= markTo ? (
          <span className="ni-mset__mark" aria-hidden="true">
            {index + 1}
          </span>
        ) : null}
      </div>
    );
  };

  const pileArea = (which: 'supply' | 'away') => {
    const items = which === 'away' ? lists.away : outside;
    const isTarget = which === 'away' ? takeAway : !takeAway;
    const most = which === 'away' ? awayVisible : supplyVisible;
    const cols = which === 'away' ? awayCols : heapCols;
    // The take-away pile shows the latest objects taken; the heap its first ones.
    const shown = which === 'away' ? items.slice(-most) : items.slice(0, most);
    /** Taken away but not in view (a short area): shown as "+N" on the pile, never dropped. */
    const hidden = which === 'away' ? items.length - shown.length : 0;
    const label = which === 'away' ? t('ui.set.away') : t('ui.set.supply');
    const targetProps = isTarget ? dnd.targetProps('pile', { label }) : null;
    const cells = heapCells(shown.length, cols);
    return (
      <div
        className="ni-mset__pile"
        data-area={isTarget ? 'pile' : 'supply'}
        data-kind={which}
        data-hand-room={which === 'supply' && dragInvite && !takeAway ? 'true' : undefined}
        style={sideGap(which)}
      >
        {targetProps ? (
          <div {...targetProps} className={`${targetProps.className} ni-mset__pad`} />
        ) : null}
        {which === 'away' ? (
          <span className="ni-mset__away-icon" aria-hidden="true">
            <ArrowIcon />
          </span>
        ) : (
          // The supply crate's tag: an arrow towards the container ("from here, into there").
          <span className="ni-mset__supply-icon" aria-hidden="true">
            <ArrowIcon
              className={
                layout === 'stack' || layout === 'column' ? 'ni-mset__arrow-down' : undefined
              }
            />
          </span>
        )}
        {hidden > 0 ? (
          <span className="ni-mset__more" data-more={hidden}>
            +{hidden}
          </span>
        ) : null}
        <div className="ni-mset__heapbox" style={heapBox(Math.min(most, total), cols)}>
          <fieldset
            className="ni-mset__heap"
            aria-label={label}
            style={{ gridTemplateColumns: `repeat(${2 * cols}, var(--heap-half))` }}
          >
            {shown.map((id, i) => {
              const cell = cells[i] as HeapCell;
              return renderItem(id, 'outside', i, {
                gridColumn: `${cell.col + 1} / span 2`,
                gridRow: cell.row + 1,
              });
            })}
          </fieldset>
        </div>
      </div>
    );
  };

  const containerProps = dnd.targetProps('container', {
    label: containerName,
    disabled: lists.inside.length >= capacity,
  });

  /** The ten-frames shown: all of them, or one at a time (the page's). */
  const shownFrames = oneFrame ? [page] : Array.from({ length: frames }, (_, f) => f);
  const onesShown = Math.max(0, insideCount - 10);
  /**
   * Reading order "10, then the ones": the tied ten first (left), the frame of ones after it; with
   * the ten untied, the ten's frame first and the small frame of ones after it (right).
   */
  const bundleFirst = beside === 'bundle';
  const framesLeft = box.pad.left + (bundleFirst ? TENS_W + tensGap : 0);
  /**
   * The ten beside the ones is drawn tied (the rope band and bow) only when it is one: bundled in
   * the model (groupsOf 10), or in an item with no bundling. A ten the child still has to bundle is
   * the same sheaf of ten, untied.
   */
  const tenTied = bundleFirst && (!config.groupsOf || bundles >= 1);
  /**
   * count-aloud with one ten-frame at a time: the objects not in the shown frame are counted on the
   * thing beside it. A tied ten is counted as one ten ("ten", step 9: the whole small frame is
   * highlighted), then the ones in view; with the first ten shown, each one after it is counted on
   * its own cell of the small frame (steps 10 and up), the running number under that frame.
   * Any step on an object the tied ten holds lights the ten, not only step 9: the layout can
   * change while the guide counts (the host shrinks to one frame after "one"), and a spoken number must
   * never be left without its highlight. Only a tied ten is lit as a whole: a ten still to be
   * bundled is counted crab by crab in its own frame (`looseTenCounted` above brings it back).
   */
  const tensCounting = counting !== null && tenTied && counting <= 9;
  /** Counting on the small frame of ones: the last one counted so far (marks stay after). */
  const onesCounting = beside === 'ones' && markTo !== null && markTo >= 10 ? markTo : null;
  const tensBeside =
    beside === null ? null : (
      <button
        key={beside}
        ref={tensRef}
        type="button"
        className={['ni-mset__tens', invitedTens || invitedCountTens ? 'ni-invite' : '']
          .filter(Boolean)
          .join(' ')}
        data-tens={beside}
        data-counting={tensCounting ? 'true' : undefined}
        // Named by the number it shows: the tied ten's tag, the ones it holds, or (while the
        // count-aloud mark is on it) the running count on that mark, so name and text agree.
        aria-label={String(bundleFirst ? 10 : onesCounting !== null ? onesCounting + 1 : onesShown)}
        disabled={!interactive}
        onClick={toggleTen}
        style={{
          left: bundleFirst ? box.pad.left : box.pad.left + box.frameOuterW + tensGap,
          top: bundleFirst ? box.bundleTop : box.onesTop,
          ...(reduced ? { animation: 'none' } : {}),
        }}
      >
        {bundleFirst ? (
          <TenBundle sprite={<ObjectSprite sprite={sprite} />} tied={tenTied} />
        ) : (
          <span className="ni-mset__tens-frame">
            <span className="ni-mset__tens-grid">
              {Array.from({ length: 10 }, (_, k) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: the small frame's cells are positional
                  key={k}
                  className="ni-mset__tens-cell"
                  data-counting={
                    onesCounting !== null && 10 + k <= onesCounting ? 'true' : undefined
                  }
                >
                  {k < onesShown ? <ObjectSprite sprite={sprite} /> : null}
                </span>
              ))}
            </span>
          </span>
        )}
        {bundleFirst ? (
          <span className="ni-mset__tens-tag" aria-hidden="true" data-invite-glyph="">
            10
          </span>
        ) : null}
        {onesCounting !== null ? (
          <span key={onesCounting} className="ni-mset__mark ni-mset__tens-count" aria-hidden="true">
            {onesCounting + 1}
          </span>
        ) : null}
      </button>
    );

  const containerBox = (
    <div
      className="ni-mset__container"
      data-container={config.container}
      data-one-frame={oneFrame ? 'true' : undefined}
      style={{ width: box.w, height: box.h } as CSSProperties}
    >
      <ContainerArt kind={kind} width={box.w} height={box.h} closed={closed} />
      <div {...containerProps} className={`${containerProps.className} ni-mset__pad`} />
      {/* count-aloud invites counting what is in the frames: the ring hugs them, not the art. */}
      <div
        className={['ni-mset__frames', invitedCount ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        style={
          {
            top: box.framesTop,
            left: framesLeft,
            gap: box.frameGap,
            ...(box.frameCols > 1
              ? {
                  display: 'grid',
                  gridTemplateColumns: `repeat(${box.frameCols}, auto)`,
                  columnGap: box.frameColGap,
                }
              : {}),
            ...(reduced ? { transition: 'none' } : {}),
          } as CSSProperties
        }
      >
        {shownFrames.map((f) => (
          <div
            key={f}
            className="ni-mset__frame"
            data-frame={f}
            data-bundled={f < bundles ? 'true' : undefined}
          >
            {Array.from({ length: 10 }, (_, k) => {
              const s = f * 10 + k;
              const id = lists.inside[s];
              return (
                <div
                  key={s}
                  className="ni-mset__slot"
                  data-slot={s}
                  data-off={s >= capacity ? 'true' : undefined}
                >
                  {id ? renderItem(id, 'inside', s) : null}
                </div>
              );
            })}
            {f < bundles ? (
              // The bow just outside the frame's right edge (its padding and border, make-set.css).
              <BundleBand
                width={frameW}
                height={frameH}
                edge={chrome === 'tight' ? 6 + 2 : 14 + 6}
              />
            ) : null}
          </div>
        ))}
      </div>
      {tensBeside}
    </div>
  );

  /**
   * The hands' height: as designed, or what a short area leaves above the finger buttons (the
   * card's padding and border, the 28 px to the buttons, a big button with its ledge).
   */
  const handBase = ageMode === 'k' ? 230 : 210;
  const bigButton = TARGET_PX[ageMode].big + 6;
  /** As designed: the hands, their buttons, 40 px, Check under them, and the widget's padding. */
  const handsDesignH = handBase + HAND_CARD_Y + 28 + bigButton + 40 + bigButton + 2 * PAD.y;
  /** A short area: Check beside the hands, and the hands as tall as the height leaves. */
  const tightHands =
    hands && room !== null && Number.isFinite(room.height) && room.height < handsDesignH;
  const handH = tightHands
    ? Math.max(
        HAND_MIN_H,
        Math.min(handBase, Math.floor(room.height - bigButton - 28 - HAND_CARD_Y)),
      )
    : handBase;
  const handBox = (h: 0 | 1) => {
    const up = handParts[h];
    const name = t(h === 0 ? 'ui.set.hand-left' : 'ui.set.hand-right');
    // Only an enabled button is invited (the same conditions as its `disabled` below).
    const invitedUp = invitedHand === h && inviteStep === 'drag' && canRaise(h);
    const invitedDown = invitedHand === h && inviteStep === 'remove' && up > 0;
    // count-aloud: counting starts on the left hand.
    const invitedCard = invitedCount && h === 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        raise(h, 'hand');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        fold(h);
      }
    };
    return (
      <div className="ni-mset__handbox" key={h}>
        <button
          type="button"
          className={['ni-mset__hand-btn', invitedCard ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          aria-label={`${name}: ${up}`}
          data-hand={h}
          data-up={up}
          disabled={!interactive}
          onClick={() => raise(h, 'hand')}
          onKeyDown={onKeyDown}
        >
          <HandArt up={up} tone={h === 0 ? 'a' : 'b'} height={handH} mirror={h === 1} />
          {counting !== null && h === (counting < handParts[0] ? 0 : 1) ? (
            <span className="ni-mset__mark ni-mset__mark--hand" aria-hidden="true">
              {counting + 1}
            </span>
          ) : null}
        </button>
        <div className="ni-mset__hand-controls">
          <span
            className={['ni-mset__ctl', invitedUp ? 'ni-invite' : ''].filter(Boolean).join(' ')}
            data-ctl="up"
          >
            <BigButton
              label="ui.set.finger-up"
              icon={<ArrowIcon className="ni-mset__arrow-up" />}
              tone="cloud"
              disabled={!interactive || !canRaise(h)}
              onPress={() => raise(h, 'button')}
            />
          </span>
          <span
            className={['ni-mset__ctl', invitedDown ? 'ni-invite' : ''].filter(Boolean).join(' ')}
            data-ctl="down"
          >
            <BigButton
              label="ui.set.finger-down"
              icon={<ArrowIcon className="ni-mset__arrow-down" />}
              tone="cloud"
              disabled={!interactive || up <= 0}
              onPress={() => fold(h)}
            />
          </span>
        </div>
      </div>
    );
  };

  const flightStyle: CSSProperties | undefined = flight
    ? {
        left: flight.moving
          ? flight.to.left + flight.to.width / 2 - flight.from.width / 2
          : flight.from.left,
        top: flight.moving
          ? flight.to.top + flight.to.height / 2 - flight.from.height / 2
          : flight.from.top,
        width: flight.from.width,
        height: flight.from.height,
        transitionDuration: `${FLY_MS}ms`,
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className="ni-mset"
      data-tier={tier}
      data-mode={config.mode}
      data-container={config.container}
      data-disabled={disabled ? 'true' : undefined}
      data-idle={interactive ? undefined : 'true'}
      data-layout={hands ? undefined : layout}
      data-chrome={chrome === 'tight' || tightHands ? 'tight' : undefined}
      data-hands={hands ? (tightHands ? 'tight' : 'normal') : undefined}
      data-one-frame={oneFrame ? 'true' : undefined}
      data-bundling={config.groupsOf === 10 ? 'true' : undefined}
      data-tray={tray === 'compact' ? 'compact' : undefined}
      style={
        {
          '--slot': `${slot}px`,
          '--heap-half': `${(slot - gap) / 2}px`,
          ...layoutStyle,
          ...handRootStyle,
        } as CSSProperties
      }
    >
      {hands ? (
        <fieldset className="ni-mset__hands" aria-label={containerName}>
          {handBox(0)}
          {handBox(1)}
        </fieldset>
      ) : (
        <>
          {showSupply ? pileArea('supply') : null}
          {containerBox}
          {takeAway ? pileArea('away') : null}
        </>
      )}

      <div className="ni-mset__actions" ref={actionsRef} style={sideGap('act')}>
        {config.showRunningCount ? (
          <NumberDisplay value={v.count} size="lg" label="ui.widget.answer" />
        ) : null}
        {config.groupsOf === 10 ? (
          <span className={invitedBundle ? 'ni-mset__action ni-invite' : 'ni-mset__action'}>
            <BigButton
              label="ui.set.bundle"
              icon={<BundleIcon />}
              tone="cloud"
              disabled={!interactive || !canBundle}
              onPress={bundle}
              showLabel={iconActions ? false : undefined}
            />
          </span>
        ) : null}
        <span className="ni-mset__action">
          <CheckButton
            onPress={submit}
            disabled={!canCheck}
            invited={invitedCheck}
            compact={iconActions}
          />
        </span>
      </div>

      {flight ? (
        <div className="ni-mset__flight" style={flightStyle} aria-hidden="true">
          <ObjectSprite sprite={flight.sprite} />
        </div>
      ) : null}
      {inviteHand}
    </div>
  );
}

export default MakeSetWidget;
