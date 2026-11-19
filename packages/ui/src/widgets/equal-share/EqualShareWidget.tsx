import {
  type EqualShareState,
  formatModel,
  shareCapacity,
  shareChoices,
  sharesEqual,
} from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type TraceRecorder, useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { IconButton } from '../../primitives/IconButton';
import { TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  AskEntry,
  AskStep,
  buildRoom,
  COMPACT_ROOM_H,
  nextPadKey,
  ObjectSprite,
  type PadKey,
  PickCard,
  planAsk,
  roomBox,
  type Size,
  type Step,
  StepActions,
  type StepCue,
  spriteNameKey,
  useActionSize,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
  useTwoStep,
  useWidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  DealRoundIcon,
  EvenIcon,
  FairIcon,
  NotFairIcon,
  OddIcon,
  PebblingArt,
  SeagullArt,
} from './art';
import {
  CARD_GAP,
  chromeFor,
  fivesCell,
  type Layout,
  MIN_ITEM_PX,
  PICTURE_BIRD,
  ROW_GAP,
  shareLayout,
  zoneCell,
} from './layout';
import './equal-share.css';

/**
 * `equal-share` (03 §5.5, concrete tier): share a basket of items fairly between pebblings or
 * plates; what cannot be shared goes to the seagull (05 §4, W7 Bakery).
 *
 * Two steps (kit `twoStep`), each fitted to the widget's room (06 §1):
 *
 * - **build** (`each`, `leftover`, `even-odd`): the basket, the recipients and the seagull in one
 *   row, and Next. The child moves one item at a time from the basket's take-one spot to a
 *   recipient by drag, tap-to-place or keyboard (`deal {to}`), or deals a round with "Give one to
 *   each" (`deal-round`). Touching a recipient's last item picks it up again: put it
 *   in the basket (`deal {to, count: -1}`) or on another recipient. Touching the seagull gives it
 *   what is left (`set-aside-leftover`), when the model would act; touching the items it holds
 *   takes them back (`set-aside-leftover {back: true}`).
 * - **ask**: a static picture of the shares with the kit `NumberEntry` (`each`, `leftover`) or two
 *   choice cards (`fair-or-not`: a pre-dealt share, this step only; `even-odd`), Back and Check.
 *   Check sends the model's response.
 *
 * Every item is drawn at one size, in fives, never overlapping (layout.ts picks the biggest size
 * that fits). Items are pictures: every thing a child touches is a full target (06 §4). Nothing is
 * counted on screen. A recipient holds the engine's `shareCapacity` at most.
 *
 * Limits are said and shown (a status line above the row, with one ring on what the child can do
 * next): a full recipient, an empty basket, and why the seagull will not take anything yet.
 *
 * Trace targets: `pile` (the take-one spot, and the basket as the drop target for giving back),
 * `recipient-<i>`, `item-<i>-<j>` (recipient i's last item j, picked up), `deal-round`, `seagull`,
 * `seagull-items`, `next`, `back`, `opt-<id>` (a choice, or a numeral card) and `key-<k>`.
 *
 * Demo ops: `deal {to, count?}` (items fly from the basket, or back to it), `deal-round` (one flies
 * to each in turn), `set-aside-leftover` (the items hop to the seagull) and `answer` (`value`
 * entered on the answer control, or `id` picked).
 */

type Config = ConfigFor<'equal-share'>;
type State = EqualShareState;

const OPS: readonly string[] = [...FORMAT_SUPPORT['equal-share'].ops, 'answer'];

function stateModel() {
  const m = formatModel('equal-share');
  if (!m) throw new Error('equal-share has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

const ITEM_MAX = { k: 104, 'g1-up': 84 } as const;
/** The ask step's picture is legible from this item size up. */
const PICTURE_MIN_ITEM = MIN_ITEM_PX;

// Motion (03 §6.3): short, transform-only moves.
const FLY_MS = 420;
const FLY_FAST_MS = 240;
const HOP_MS = 560;
const HOP_STAGGER_MS = 110;
const KEY_MS = 340;
const PICK_MS = 500;
const HOLD_MS = 300;
const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

type Reason = 'unequal' | 'round' | 'empty';
const REASON_KEY: Record<Reason, NarrationKey> = {
  unequal: 'ui.widget.es.why.unequal',
  round: 'ui.widget.es.why.round',
  empty: 'ui.widget.es.why.empty',
};
const FULL_KEY: NarrationKey = 'ui.widget.es.note.full';

const OPTION: Record<string, { key: NarrationKey; icon: () => ReactNode }> = {
  yes: { key: 'ui.widget.es.opt.yes', icon: () => <FairIcon /> },
  no: { key: 'ui.widget.es.opt.no', icon: () => <NotFairIcon /> },
  even: { key: 'ui.widget.es.opt.even', icon: () => <EvenIcon /> },
  odd: { key: 'ui.widget.es.opt.odd', icon: () => <OddIcon /> },
};

const ASK_KEY: Record<Config['ask'], NarrationKey> = {
  each: 'ui.widget.es.ask.each',
  leftover: 'ui.widget.es.ask.leftover',
  'fair-or-not': 'ui.widget.es.ask.fair',
  'even-odd': 'ui.widget.es.ask.even-odd',
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Why the seagull takes nothing, or null when the model would act (03 §5.5). */
function seagullReason(s: State): Reason | null {
  const equal = sharesEqual(s.shares);
  // The seagull takes the rest only from equal shares: unequal ones are said first.
  if (!equal) return 'unequal';
  if (s.pile > 0 && s.pile < s.shares.length) return null;
  return s.pile >= s.shares.length ? 'round' : 'empty';
}

/** The recipient that holds the most (the first of them). */
const fullest = (shares: readonly number[]) => shares.indexOf(Math.max(...shares));

type Source = { from: 'pile' } | { from: 'recipient'; index: number };
function parseItem(id: string): Source | null {
  if (id === 'pile-0') return { from: 'pile' };
  const m = /^item-(\d+)-(\d+)$/.exec(id);
  return m ? { from: 'recipient', index: Number(m[1]) } : null;
}
const recipientOf = (target: string): number | null => {
  const m = /^recipient-(\d+)$/.exec(target);
  return m ? Number(m[1]) : null;
};

/** The two choice cards side by side (equal-share.css `.ni-esw__options`). */
function choicesSize(ageMode: 'k' | 'g1-up'): Size {
  const card = Math.round(TARGET_PX[ageMode].icon * 1.75);
  return { w: 2 * card + 24 + 32, h: card + 16 + 6 };
}

interface Note {
  key: NarrationKey;
  /** The one thing ringed: what the child can do next. */
  cue: string | null;
}

export function EqualShareWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say } = useSpeech();
  const prefs = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const ask = config.ask;
  const typed = ask === 'each' || ask === 'leftover';
  const dealing = ask !== 'fair-or-not';
  const choices = shareChoices(config);
  const kind = config.recipientsKind;
  const R = config.recipients;

  const [state, setState] = useState<State>(() => initial(config));
  const stateRef = useRef(state);
  const [value, setValue] = useState<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [busy, setBusy] = useState(false);
  const [entryHighlight, setEntryHighlight] = useState<number | PadKey | null>(null);
  const [pickedByDemo, setPickedByDemo] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = !disabled && !busy;

  const steps = useTwoStep(rootRef, { interactive, trace });
  // A pre-dealt share to judge has nothing to build: the ask step alone.
  const step: Step = dealing ? steps.step : 'ask';

  // ---------- state through the model; resolves once the DOM shows it ----------

  const commitWaiters = useRef<(() => void)[]>([]);
  useLayoutEffect(() => {
    if (commitWaiters.current.length === 0) return;
    const waiters = commitWaiters.current;
    commitWaiters.current = [];
    for (const w of waiters) w();
  });
  const commit = (next: State) => {
    stateRef.current = next;
    setState(next);
  };
  const applyOp = (action: WidgetAction): Promise<boolean> => {
    const prev = stateRef.current;
    const next = applyAction(prev, action);
    if (next === prev) return Promise.resolve(false);
    return new Promise((resolve) => {
      commitWaiters.current.push(() => resolve(true));
      commit(next);
    });
  };
  const [, setTick] = useState(0);
  const committed = () =>
    new Promise<void>((resolve) => {
      commitWaiters.current.push(resolve);
      setTick((n) => n + 1);
    });
  /** A child step clears the demo's invite and marks, and the last limit note. */
  const childStep = () => {
    setInvite(null);
    setFlash(new Set());
    setNote(null);
  };
  /** A limit: said aloud and shown, with one ring on what the child can do next. */
  const limit = (key: NarrationKey, cue: string | null) => {
    setNote({ key, cue });
    say(key);
  };
  const emptyCue = (s: State) => (sharesEqual(s.shares) ? 'next' : `take-${fullest(s.shares)}`);

  // ---------- layout: the measured room, the action button, the two plans ----------

  const room = useWidgetRoom(rootRef);
  const box = roomBox(room);
  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const ageMode = prefs.ageMode;
  const button = useActionSize(actRef, zoomRef, ageMode);
  const chrome = chromeFor(ageMode);
  const cap = shareCapacity(config);

  const buildLayout = useMemo(() => {
    const r = buildRoom({ w: box.w, h: box.h }, button);
    return shareLayout({
      recipients: R,
      kind,
      cap,
      pileMax: config.items,
      mode: 'deal',
      seagullMax: R - 1,
      width: r.w,
      height: r.h,
      maxItem: ITEM_MAX[ageMode],
      chrome,
    });
  }, [box.w, box.h, button, R, kind, cap, config.items, ageMode, chrome]);

  const pictureInput = (size: Size) => ({
    recipients: R,
    kind,
    cap,
    pileMax: state.pile,
    mode: 'picture' as const,
    seagullMax: state.seagull,
    width: size.w,
    height: size.h,
    maxItem: ITEM_MAX[ageMode],
    chrome,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: pictureInput reads these
  const askPlan = useMemo(
    () =>
      planAsk({
        ageMode,
        max: config.items,
        control: typed ? undefined : choicesSize(ageMode),
        button,
        actions: dealing ? 2 : 1,
        room: { w: box.w, h: box.h },
        pictureScore: (size) => {
          const l = shareLayout(pictureInput(size));
          return l.fits && l.s >= PICTURE_MIN_ITEM ? l.s : 0;
        },
      }),
    [box.w, box.h, button, ageMode, config.items, typed, dealing, state.pile, state.seagull, cap],
  );
  const pictureLayout = askPlan.picture ? shareLayout(pictureInput(askPlan.picture)) : null;

  // ---------- child input ----------

  const spriteKey = spriteNameKey(config.sprite);
  const spriteName = t(spriteKey);
  const kindKey: NarrationKey = `ui.widget.es.kind.${kind}`;
  const speak = (key: NarrationKey) => {
    if (prefs.speakOnTap) say(key);
  };

  /** The take-one spot is traced as `pile` (it stands for the whole pile). */
  const dndTrace: TraceRecorder = (kindOf, target) =>
    trace(kindOf, target === 'pile-0' ? 'pile' : target);

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive || !dealing || step !== 'build',
    trace: dndTrace,
    canPlace: (itemId, target) => {
      const item = parseItem(itemId);
      if (!item) return false;
      const to = recipientOf(target);
      if (item.from === 'pile') return to !== null;
      if (target === 'pile') return true;
      return to !== null && to !== item.index;
    },
    onSelect: (itemId) => {
      if (!itemId) return;
      // Picking something up is the child's step: the invite and the last note are done.
      childStep();
      speak(spriteKey);
    },
    onPlace: ({ item: itemId, target }) => {
      const item = parseItem(itemId);
      if (!item) return;
      childStep();
      const to = recipientOf(target);
      const prev = stateRef.current;
      // A full recipient takes no more: nothing moves, and the note says why.
      if (to !== null && (prev.shares[to] ?? 0) >= cap) {
        limit(FULL_KEY, `take-${to}`);
        return;
      }
      let next = prev;
      if (item.from === 'recipient') {
        next = applyAction(next, { op: 'deal', args: { to: item.index, count: -1 } });
      }
      if (to !== null) next = applyAction(next, { op: 'deal', args: { to } });
      commit(next);
      if (prev.pile > 0 && next.pile === 0) limit(REASON_KEY.empty, emptyCue(next));
    },
  });

  const onDealRound = () => {
    if (!interactive) return;
    childStep();
    trace('tap', 'deal-round');
    const prev = stateRef.current;
    const next = applyAction(prev, { op: 'deal-round' });
    commit(next);
    if (prev.pile > 0 && next.pile === 0) limit(REASON_KEY.empty, emptyCue(next));
  };

  /** Touching the seagull gives it what is left, or says why it takes nothing yet. */
  const onSeagull = () => {
    if (!interactive) return;
    childStep();
    trace('tap', 'seagull');
    const prev = stateRef.current;
    const reason = seagullReason(prev);
    if (reason === null) {
      const next = applyAction(prev, { op: 'set-aside-leftover' });
      commit(next);
      limit(REASON_KEY.empty, emptyCue(next));
      return;
    }
    // What to ring: an action that is open. Equal shares with enough to go round: the round
    // button (no one is full then). Unequal shares: give to the ones with fewer while the basket
    // has some and no one is full, else take one back from the one that holds the most (it
    // surely holds more than a fair share).
    const blocked = prev.pile === 0 || prev.shares.some((x) => x >= cap);
    const cue =
      reason === 'round'
        ? 'deal-round'
        : reason === 'unequal'
          ? blocked
            ? `take-${fullest(prev.shares)}`
            : 'spot'
          : emptyCue(prev);
    limit(REASON_KEY[reason], cue);
  };

  /** Touching what the seagull holds takes it back to the basket. */
  const onSeagullItems = () => {
    if (!interactive) return;
    childStep();
    trace('tap', 'seagull-items');
    speak(spriteKey);
    commit(applyAction(stateRef.current, { op: 'set-aside-leftover', args: { back: true } }));
  };

  /** Touching the basket names it; an empty one says so. */
  const onBasketTap = () => {
    trace('tap', 'pile');
    const s = stateRef.current;
    if (s.pile === 0) limit(REASON_KEY.empty, emptyCue(s));
    else speak('ui.widget.es.region.basket');
  };

  const onPick = (id: string) => {
    if (!interactive) return;
    childStep();
    trace('tap', `opt-${id}`);
    const opt = OPTION[id];
    if (opt) speak(opt.key);
    commit(applyAction(stateRef.current, { op: 'answer', args: { id } }));
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || step !== 'ask') return false;
    let next = stateRef.current;
    if (typed) {
      const v = valueRef.current;
      if (v === null) return false;
      next = applyAction(next, { op: 'answer', args: { value: v } });
    }
    const response = model.toResponse(next);
    if (!response) return false;
    onResponse(response);
    return true;
  });
  const ready = typed ? value !== null : state.choice !== null;

  // ---------- demo mode (03 §6.3) ----------

  const q = (sel: string) => rootRef.current?.querySelector<HTMLElement>(sel) ?? null;
  const itemEl = (i: number, j: number) => q(`[data-item="item-${i}-${j}"]`);
  const spotEl = () => q('.ni-esw__spot');

  const animate = (el: HTMLElement, frames: Keyframe[], ms: number, delay = 0) => {
    el.style.zIndex = '6';
    const a = el.animate(frames, { duration: ms, delay, easing: EASE, fill: 'backwards' });
    return a.finished
      .catch(() => undefined)
      .then(() => {
        el.style.zIndex = '';
      });
  };
  const offset = (from: DOMRect, el: HTMLElement) => {
    const a = centerOf(from);
    const b = centerOf(el.getBoundingClientRect());
    return { x: a.x - b.x, y: a.y - b.y };
  };

  /** One item from the basket to recipient `to`: it flies from the take-one spot. */
  const dealOne = async (to: number, ms: number) => {
    const from = spotEl()?.getBoundingClientRect() ?? null;
    const before = stateRef.current.shares[to] ?? 0;
    // Reduced motion: the item appears at once, highlighted in the same frame.
    if (reduced) setFlash((f) => new Set([...f, `item-${to}-${before}`, `recipient-${to}`]));
    if (!(await applyOp({ op: 'deal', args: { to } }))) return false;
    const n = stateRef.current.shares[to] ?? 0;
    const el = itemEl(to, n - 1);
    if (!el || reduced || !from) return true;
    const d = offset(from, el);
    await animate(
      el,
      [
        { transform: `translate(${d.x}px, ${d.y}px) scale(0.9)` },
        { transform: 'translate(0px, 0px) scale(1)' },
      ],
      ms,
    );
    return true;
  };

  /** One item from recipient `to` back to the basket. */
  const takeBack = async (to: number, ms: number) => {
    const n = stateRef.current.shares[to] ?? 0;
    if (n === 0) return false;
    const el = itemEl(to, n - 1);
    const spot = spotEl();
    if (!reduced && el && spot) {
      const d = offset(spot.getBoundingClientRect(), el);
      await animate(
        el,
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
          { transform: `translate(${d.x}px, ${d.y}px) scale(0.9)`, opacity: 0.4 },
        ],
        ms,
      );
    }
    if (!(await applyOp({ op: 'deal', args: { to, count: -1 } }))) return false;
    if (reduced) {
      setFlash((f) => new Set([...f, 'pile', `recipient-${to}`]));
      await committed();
    }
    return true;
  };

  const runDeal = async (action: WidgetAction) => {
    const to = Math.trunc(num(action.args?.to) ?? -1);
    const count = Math.trunc(num(action.args?.count) ?? 1);
    if (to < 0 || to >= R) return;
    const ms = Math.abs(count) > 3 ? FLY_FAST_MS : FLY_MS;
    for (let k = 0; k < Math.abs(count); k += 1) {
      if (!alive.current) return;
      const ok = count > 0 ? await dealOne(to, ms) : await takeBack(to, ms);
      if (!ok) return;
    }
  };

  const runDealRound = async () => {
    const s0 = stateRef.current;
    const target = applyAction(s0, { op: 'deal-round' });
    if (target === s0) return;
    // One flies to each recipient in turn; the end state is the model's own deal-round.
    for (let i = 0; i < R; i += 1) {
      if (!alive.current || stateRef.current.pile === 0) break;
      await dealOne(i, FLY_MS);
    }
    if (alive.current) commit(target);
  };

  const runSetAside = async (action: WidgetAction) => {
    const s0 = stateRef.current;
    const next = applyAction(s0, action);
    if (next === s0) {
      // The model does nothing yet (03 §5.5): the note says why.
      const reason = seagullReason(s0);
      if (reason) setNote({ key: REASON_KEY[reason], cue: null });
      await committed();
      await pause(HOLD_MS * 2);
      return;
    }
    if (next.seagull < s0.seagull) {
      commit(next);
      await committed();
      return;
    }
    const moved = s0.pile;
    const from = spotEl()?.getBoundingClientRect() ?? null;
    const ids = Array.from({ length: moved }, (_, k) => `gull-${s0.seagull + k}`);
    // Reduced motion: the items appear by the seagull at once, highlighted in the same frame.
    if (reduced) setFlash(new Set([...ids, 'gull']));
    await applyOp(action);
    const hops: Promise<void>[] = [];
    for (let k = 0; k < moved; k += 1) {
      const el = q(`[data-gull-item="${ids[k]}"]`);
      if (reduced || !el || !from) continue;
      const d = offset(from, el);
      hops.push(
        animate(
          el,
          [
            { transform: `translate(${d.x}px, ${d.y}px)` },
            { transform: `translate(${d.x / 2}px, ${d.y / 2 - 70}px)`, offset: 0.5 },
            { transform: 'translate(0px, 0px)' },
          ],
          HOP_MS,
          k * HOP_STAGGER_MS,
        ),
      );
    }
    await Promise.all(hops);
  };

  /** Shows a step and waits until it is drawn. */
  const showStep = async (s: Step) => {
    if (!dealing || steps.step === s) return;
    steps.show(s);
    await committed();
  };

  /** Enters `v` the way the answer control does: the numeral card, or the pad keys one by one. */
  const enterAnswer = async (v: number) => {
    const want = Math.max(0, Math.trunc(v));
    if (askPlan.stepper || askPlan.entry?.kind === 'tray') {
      setEntryHighlight(want);
      await pause(PICK_MS);
      if (!alive.current) return;
      valueRef.current = want;
      setValue(want);
      return;
    }
    valueRef.current = null;
    setValue(null);
    for (let guard = 0; guard < 8; guard += 1) {
      const key = nextPadKey(want, valueRef.current);
      if (key === null || key === 'back' || key === '.') break;
      setEntryHighlight(key);
      await pause(KEY_MS);
      if (!alive.current) return;
      const typedSoFar: number = Number(`${valueRef.current ?? ''}${key}`);
      valueRef.current = typedSoFar;
      setValue(typedSoFar);
    }
    setEntryHighlight(null);
    await pause(KEY_MS);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setBusy(true);
      setInvite(null);
      setNote(null);
      setFlash(new Set());
      try {
        switch (action.op) {
          case 'deal':
            await showStep('build');
            await runDeal(action);
            break;
          case 'deal-round':
            await showStep('build');
            await runDealRound();
            break;
          case 'set-aside-leftover':
            await showStep('build');
            await runSetAside(action);
            break;
          case 'answer': {
            const id = typeof action.args?.id === 'string' ? action.args.id : undefined;
            const v = num(action.args?.value);
            if (id !== undefined && choices.includes(id)) {
              await showStep('ask');
              setPickedByDemo(id);
              await pause(PICK_MS);
              if (alive.current) commit(applyAction(stateRef.current, action));
            } else if (v !== undefined && typed) {
              await showStep('ask');
              await enterAnswer(v);
              if (alive.current) commit(applyAction(stateRef.current, action));
            }
            break;
          }
        }
        // Reduced motion: the change was instant; the highlight shows briefly (no movement).
        if (reduced && alive.current) await wait(HOLD_MS);
      } finally {
        setEntryHighlight(null);
        if (alive.current) {
          // After a demo step the widget is back to its normal, interactive look when play resolves.
          setPickedByDemo(null);
          setFlash(new Set());
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
      case 'deal': {
        const to = Math.trunc(num(invite.args?.to) ?? -1);
        if (!dealing || to < 0 || to >= R) return null;
        return onBuild((num(invite.args?.count) ?? 1) < 0 ? `take-${to}` : 'spot');
      }
      case 'deal-round':
        return dealing ? onBuild('deal-round') : null;
      case 'set-aside-leftover':
        return dealing ? onBuild('seagull') : null;
      case 'answer': {
        if (step === 'build') return { cue: 'next' };
        if (typed) {
          const v = num(invite.args?.value);
          return v === undefined ? { cue: 'entry' } : { cue: 'entry-value', value: v };
        }
        const id = typeof invite.args?.id === 'string' ? invite.args.id : choices[0];
        return id && choices.includes(id) ? { cue: `opt-${id}` } : null;
      }
      default:
        return null;
    }
  })();
  const ring = inviteCue?.cue ?? (step === 'build' ? (note?.cue ?? null) : null);
  const ringed = (id: string) => ring === id;
  const stepCue = (['next', 'back', 'check'] as const).find((c) => ring === c) ?? null;
  const invitedEntry: number | PadKey | null =
    inviteCue?.cue === 'entry-value' && inviteCue.value !== undefined
      ? askPlan.entry?.kind === 'tray'
        ? inviteCue.value
        : nextPadKey(inviteCue.value, value)
      : null;
  // The demonstration hand hangs on the invited control (kit `useInviteHand`); a limit note has no hand.
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
  const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

  // ---------- render ----------

  /** Taps on pictures (the ask step, the seagull's items): name what is under the finger. */
  const onPictureTap = (e: MouseEvent) => {
    if (!interactive) return;
    const id = (e.target as Element).closest<HTMLElement>('[data-es-tap]')?.dataset.esTap;
    if (!id) return;
    trace('tap', id);
    speak(id.startsWith('recipient-') ? kindKey : spriteKey);
  };

  /** What a screen reader hears for a recipient: its kind, its place and how many it holds. */
  const shareLabel = (i: number) =>
    t('ui.widget.es.count.share', { name: t(kindKey), i: i + 1, n: state.shares[i] ?? 0 });
  /** The picture in words: every count a sighted child can see. */
  const pictureLabel = [
    t('ui.widget.picture'),
    ...state.shares.map((_, i) => shareLabel(i)),
    ...(state.pile > 0 ? [t('ui.widget.es.count.basket', { n: state.pile })] : []),
    ...(state.seagull > 0 ? [t('ui.widget.es.count.seagull', { n: state.seagull })] : []),
  ].join('. ');

  const renderRecipient = (i: number, layout: Layout, live: boolean) => {
    const s = layout.s;
    const n = state.shares[i] ?? 0;
    const id = `recipient-${i}`;
    const { zone, card } = layout;
    const itemStyle = (k: number): CSSProperties => {
      const p = zoneCell(k, s, zone.upright);
      return { left: p.x, top: p.y, width: s, height: s };
    };
    /**
     * The handle's hit area: a full target centred on the last item, kept inside the mat. It is
     * no wider than a target, so a drag that starts at its edge still carries the item to within
     * the snap radius of where the finger lets go.
     */
    const hitStyle = (p: { x: number; y: number }): CSSProperties => {
      const side = chrome.target;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const left = clamp(p.x + s / 2 - side / 2, -zone.padX, zone.w - zone.padX - side);
      const top = clamp(p.y + s / 2 - side / 2, -zone.padY, zone.h - zone.padY - side);
      return { left: left - p.x, top: top - p.y, width: side, height: side };
    };
    const items: ReactNode[] = [];
    // The last item is the one that is picked up, through a full target round it. While another
    // item is held the handle is out of the way: the card takes the tap.
    const lastId = `item-${i}-${n - 1}`;
    const handleOn = live && n > 0 && (dnd.selected === null || dnd.selected === lastId);
    for (let j = 0; j < n; j += 1) {
      const itemId = `item-${i}-${j}`;
      const sprite = <ObjectSprite sprite={config.sprite} />;
      if (j === n - 1 && handleOn) {
        const props = dnd.itemProps(itemId, { label: spriteName });
        const p = zoneCell(j, s, zone.upright);
        items.push(
          <span
            key={itemId}
            {...props}
            className={cls(props.className, 'ni-esw__item')}
            data-item={itemId}
            data-cue={`take-${i}`}
            data-flash={flash.has(itemId) ? 'true' : undefined}
            style={itemStyle(j)}
          >
            <span className="ni-esw__hit" style={hitStyle(p)} />
            {sprite}
          </span>,
        );
        continue;
      }
      items.push(
        <span
          key={itemId}
          className="ni-esw__item"
          data-item={itemId}
          data-es-tap={live ? undefined : itemId}
          data-flash={flash.has(itemId) ? 'true' : undefined}
          style={itemStyle(j)}
        >
          {sprite}
        </span>,
      );
    }
    const zoneStyle: CSSProperties = {
      width: zone.w,
      height: zone.h,
      borderRadius: kind === 'plate' ? Math.round(Math.min(zone.w, zone.h) * 0.35) : undefined,
    };
    const inner = (
      <div
        className={cls('ni-esw__zone', live && ringed(`take-${i}`) && 'ni-invite')}
        data-kind={kind}
        data-full={n >= cap ? 'true' : undefined}
        style={zoneStyle}
      >
        <div className="ni-esw__zone-items" style={{ left: zone.padX, top: zone.padY }}>
          {items}
        </div>
      </div>
    );
    const figure =
      kind === 'pebbling' ? (
        <span className="ni-esw__figure" style={{ width: card.figure, height: card.figure }}>
          <PebblingArt variant={i} />
        </span>
      ) : null;
    let pad: ReactNode;
    if (live) {
      const props = dnd.targetProps(id, { label: shareLabel(i) });
      const hadSelection = dnd.selected !== null;
      pad = (
        // biome-ignore lint/a11y/noStaticElementInteractions: targetProps gives role="button", tabIndex and the key handler
        // biome-ignore lint/a11y/useKeyWithClickEvents: targetProps' onKeyDown (Enter/Space, arrows) is spread above
        <div
          {...props}
          className={cls(props.className, 'ni-esw__pad')}
          onClick={(e: MouseEvent) => {
            props.onClick(e);
            if (hadSelection || !interactive) return;
            trace('tap', id);
            speak(kindKey);
          }}
        />
      );
    } else {
      pad = <div className="ni-esw__pad" data-es-tap={id} />;
    }
    return (
      <div
        key={id}
        className="ni-esw__rec"
        data-recipient={i}
        data-flash={flash.has(id) ? 'true' : undefined}
        style={{ width: card.w, height: card.h }}
      >
        {pad}
        {figure}
        {inner}
      </div>
    );
  };

  const renderRecipients = (layout: Layout, live: boolean) => {
    let next = 0;
    const rows = layout.rows.map((count, r) => {
      const cards: ReactNode[] = [];
      for (let k = 0; k < count; k += 1) cards.push(renderRecipient(next++, layout, live));
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
        <div key={r} className="ni-esw__row" style={{ gap: CARD_GAP }}>
          {cards}
        </div>
      );
    });
    return (
      <div className="ni-esw__rows" style={{ gap: CARD_GAP }}>
        {rows}
      </div>
    );
  };

  const renderPile = (layout: Layout, count: number) => {
    const s = layout.s;
    const items: ReactNode[] = [];
    for (let k = 0; k < count; k += 1) {
      const p = fivesCell(k, Math.max(1, layout.pile.cols), s);
      items.push(
        <span
          key={k}
          // A countable picture: the demonstration hand never covers it (kit glyph rule).
          className="ni-esw__item ni-invite-glyph"
          data-es-tap="pile"
          style={{ left: p.x, top: p.y, width: s, height: s }}
        >
          <ObjectSprite sprite={config.sprite} />
        </span>,
      );
    }
    return (
      <div className="ni-esw__pile" style={{ width: layout.pile.w, height: layout.pile.h }}>
        {items}
      </div>
    );
  };

  const renderGullItems = (layout: Layout) => {
    const s = layout.s;
    const items: ReactNode[] = [];
    for (let k = 0; k < state.seagull; k += 1) {
      const p = fivesCell(k, Math.max(1, layout.gull.cols), s);
      items.push(
        <span
          key={k}
          className="ni-esw__item"
          data-gull-item={`gull-${k}`}
          data-es-tap="seagull"
          data-flash={flash.has(`gull-${k}`) ? 'true' : undefined}
          style={{ left: p.x, top: p.y, width: s, height: s }}
        >
          <ObjectSprite sprite={config.sprite} />
        </span>,
      );
    }
    return (
      <span className="ni-esw__gull-grid" style={{ width: layout.gull.w, height: layout.gull.h }}>
        {items}
      </span>
    );
  };

  /** The build step: basket, recipients and seagull, every control live. */
  const renderBuild = (layout: Layout) => {
    const spotProps = state.pile > 0 ? dnd.itemProps('pile-0', { label: spriteName }) : null;
    const spot = (
      <span
        className={cls('ni-esw__spot', ringed('spot') && 'ni-invite')}
        data-cue="spot"
        data-empty={state.pile === 0 ? 'true' : undefined}
        style={{ width: layout.spot, height: layout.spot }}
      >
        {spotProps ? (
          <span
            {...spotProps}
            className={cls(spotProps.className, 'ni-esw__take')}
            style={{ '--s': `${layout.s}px` } as CSSProperties}
          >
            <span className="ni-esw__take-sprite">
              <ObjectSprite sprite={config.sprite} />
            </span>
          </span>
        ) : null}
      </span>
    );
    const full = state.shares.some((x) => x >= cap);
    const dealButton = (
      <span className="ni-esw__slot" data-cue="deal-round">
        <IconButton
          label="ui.widget.es.deal-round"
          icon={<DealRoundIcon />}
          tone="sea"
          caption={false}
          onPress={onDealRound}
          disabled={!interactive || state.pile === 0 || full}
          className={ringed('deal-round') ? 'ni-invite' : undefined}
          data={{ 'data-action': 'deal-round' }}
        />
      </span>
    );
    const basketProps = dnd.targetProps('pile', { label: t('ui.widget.es.basket') });
    const hadSelection = dnd.selected !== null;
    const basket = (
      <div
        className="ni-esw__basket"
        data-shape={layout.basket.shape}
        data-flash={flash.has('pile') ? 'true' : undefined}
        style={{ width: layout.basket.w, height: layout.basket.h }}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: targetProps gives role="button", tabIndex and the key handler */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: targetProps' onKeyDown is spread above */}
        <div
          {...basketProps}
          className={cls(basketProps.className, 'ni-esw__pad')}
          onClick={(e: MouseEvent) => {
            basketProps.onClick(e);
            if (hadSelection || !interactive) return;
            childStep();
            onBasketTap();
          }}
        />
        <span className="ni-esw__controls" data-shape={layout.basket.shape}>
          {spot}
          {dealButton}
        </span>
        {layout.pile.w > 0 ? renderPile(layout, Math.max(0, state.pile - 1)) : null}
      </div>
    );
    const nest = (
      <div
        className="ni-esw__nest"
        data-flash={flash.has('gull') ? 'true' : undefined}
        style={{ width: layout.nest.w, height: layout.nest.h }}
      >
        <button
          type="button"
          className={cls('ni-esw__bird', ringed('seagull') && 'ni-invite')}
          data-cue="seagull"
          style={{ width: chrome.birdW, height: chrome.birdH }}
          aria-label={t('ui.widget.es.give-rest')}
          disabled={!interactive}
          onClick={onSeagull}
        >
          <SeagullArt />
        </button>
        {state.seagull > 0 ? (
          <button
            type="button"
            className="ni-esw__gull-items"
            data-cue="seagull-items"
            style={{ width: layout.gull.boxW, height: layout.gull.boxH }}
            aria-label={t('ui.widget.es.basket')}
            disabled={!interactive}
            onClick={onSeagullItems}
          >
            {renderGullItems(layout)}
          </button>
        ) : (
          <span
            className="ni-esw__gull-items"
            style={{ width: layout.gull.boxW, height: layout.gull.boxH }}
          />
        )}
      </div>
    );
    const regionKey: NarrationKey = `ui.widget.es.region.${kind}`;
    return (
      <div
        className="ni-esw__main"
        data-flow={layout.flow}
        style={{ '--s': `${layout.s}px` } as CSSProperties}
      >
        <p className="ni-esw__note" role="status" style={{ height: layout.note }}>
          {note ? t(note.key) : ''}
        </p>
        <div className="ni-esw__parts" style={{ gap: ROW_GAP }}>
          {layout.flow === 'row' ? basket : null}
          {/* biome-ignore lint/a11y/useSemanticElements: a labelled region laying its drop targets out behind their items */}
          <div className="ni-esw__recipients" role="group" aria-label={t(regionKey)}>
            {renderRecipients(layout, true)}
          </div>
          {layout.flow === 'row' ? nest : null}
          {layout.flow === 'stack' ? (
            <div className="ni-esw__bottom" style={{ gap: ROW_GAP }}>
              {basket}
              {nest}
            </div>
          ) : null}
        </div>
        {/* The demonstration hand's room: as tall as the note line, so the row stays centred. */}
        <div className="ni-esw__handstrip" aria-hidden="true" style={{ height: layout.note }} />
      </div>
    );
  };

  /** The ask step's picture: the shares as they are, and what was left. Nothing to operate. */
  const renderPicture = (layout: Layout) => (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-hear is a pointer extra; the picture is one image to assistive tech
    <div
      className="ni-esw__main ni-esw__picture"
      data-flow={layout.flow}
      role="img"
      aria-label={pictureLabel}
      onClick={onPictureTap}
      style={{ '--s': `${layout.s}px` } as CSSProperties}
    >
      <div className="ni-esw__parts" style={{ gap: ROW_GAP }}>
        {layout.flow === 'row' && layout.basket.w > 0 ? renderBasketPicture(layout) : null}
        <div className="ni-esw__recipients">{renderRecipients(layout, false)}</div>
        {layout.flow === 'row' && layout.nest.w > 0 ? renderNestPicture(layout) : null}
        {layout.flow === 'stack' && (layout.basket.w > 0 || layout.nest.w > 0) ? (
          <div className="ni-esw__bottom" style={{ gap: ROW_GAP }}>
            {layout.basket.w > 0 ? renderBasketPicture(layout) : null}
            {layout.nest.w > 0 ? renderNestPicture(layout) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
  const renderBasketPicture = (layout: Layout) => (
    <div className="ni-esw__basket" style={{ width: layout.basket.w, height: layout.basket.h }}>
      {renderPile(layout, state.pile)}
    </div>
  );
  const renderNestPicture = (layout: Layout) => (
    <div className="ni-esw__nest" style={{ width: layout.nest.w, height: layout.nest.h }}>
      <span
        className="ni-esw__bird"
        data-es-tap="seagull"
        style={{ width: PICTURE_BIRD.w, height: PICTURE_BIRD.h }}
      >
        <SeagullArt />
      </span>
      <span
        className="ni-esw__gull-items"
        style={{ width: layout.gull.boxW, height: layout.gull.boxH }}
      >
        {renderGullItems(layout)}
      </span>
    </div>
  );

  const actions = (
    <StepActions
      actRef={actRef}
      step={step}
      back={dealing}
      dir={step === 'ask' && askPlan.act === 'row' ? 'row' : 'column'}
      interactive={interactive}
      ready={ready}
      onStep={(s) => {
        childStep();
        steps.goTo(s);
      }}
      onCheck={submit}
      invited={stepCue as StepCue | null}
      compact={box.h < COMPACT_ROOM_H}
    />
  );

  const answer = typed ? (
    askPlan.entry || askPlan.stepper ? (
      <span data-cue="entry" className={cls('ni-esw__entry', ringed('entry') && 'ni-invite')}>
        <AskEntry
          plan={askPlan}
          max={config.items}
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
    ) : null
  ) : (
    // biome-ignore lint/a11y/useSemanticElements: a labelled region round the two choices
    <div className="ni-esw__options" role="group" aria-label={t(ASK_KEY[ask])}>
      {choices.map((id) => {
        const opt = OPTION[id];
        if (!opt) return null;
        const optId = `opt-${id}`;
        return (
          <span key={id} className="ni-esw__slot" data-cue={optId}>
            <PickCard
              label={t(opt.key)}
              selected={state.choice === id || pickedByDemo === id}
              highlighted={ringed(optId)}
              variant="picture"
              data-id={optId}
              disabled={!interactive}
              onPress={() => onPick(id)}
              className="ni-esw__option"
            >
              <span className="ni-esw__option-icon">{opt.icon()}</span>
              {prefs.textLabels ? <span className="ni-esw__option-word">{t(opt.key)}</span> : null}
            </PickCard>
          </span>
        );
      })}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="ni-esw"
      data-ask={ask}
      data-tier={tier}
      data-kind={kind}
      data-step={step}
      data-disabled={disabled ? 'true' : undefined}
      data-fits={(step === 'build' ? buildLayout.fits : askPlan.fits) ? undefined : 'false'}
      style={handRootStyle}
    >
      {step === 'build' ? (
        <div className="ni-esw__build">
          {renderBuild(buildLayout)}
          {actions}
        </div>
      ) : (
        <AskStep
          plan={askPlan}
          picture={pictureLayout ? renderPicture(pictureLayout) : null}
          entry={answer}
          actions={actions}
        />
      )}
      {inviteHand}
    </div>
  );
}

export default EqualShareWidget;
