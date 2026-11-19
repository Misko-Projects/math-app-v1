import { type EqualShareState, formatModel, shareChoices } from '@number-island/engine';
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
import { HandPointerIcon } from '../../primitives/icons';
import { useWidgetDemo, wait } from '../demo';
import {
  applyPadKey,
  CheckButton,
  NumberPadKeys,
  ObjectSprite,
  type PadKey,
  PickCard,
  padValue,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  AskEachIcon,
  AskEvenOddIcon,
  AskFairIcon,
  BasketIcon,
  DealRoundIcon,
  EvenIcon,
  FairIcon,
  GiveSeagullIcon,
  GoRoundIcon,
  NotFairIcon,
  OddIcon,
  PebblingArt,
  PebblingIcon,
  PlateIcon,
  SeagullArt,
  SeagullIcon,
  UnequalIcon,
} from './art';
import {
  CARD_GAP,
  chromeFor,
  fivesCell,
  LEGEND_H,
  REASON_PX,
  ROW_GAP,
  shareLayout,
  zoneCapacity,
  zoneCell,
} from './layout';
import './equal-share.css';

/**
 * `equal-share` (03 §5.5, concrete tier): share a basket of items fairly between pebblings or
 * plates; what cannot be shared goes to the seagull (05 §4, W7 Bakery).
 *
 * - `each`, `leftover`: the pile waits in a basket. The child moves one item at a time to a
 *   recipient by drag, tap-to-place or keyboard (`deal {to}`), deals a round with "Give one to
 *   each" (`deal-round`), and can move an item back to the basket (`deal {to, count: -1}`) or on to
 *   another recipient. The seagull's button (`set-aside-leftover`) is on only when the model would
 *   act (equal shares and 0 < pile < recipients); while it is off, an icon beside it (and from G1
 *   its caption) says why, and tapping the seagull says it aloud. The child types the answer (each
 *   share, or the leftover) on the number pad; Check sends the model's state response. Nothing is
 *   counted on screen.
 * - `fair-or-not`: the pre-dealt shares as a picture; "Fair" (`yes`) or "Not fair" (`no`); Check
 *   sends the choice.
 * - `even-odd` (MUL.01): share between two as above, then "Even" or "Odd"; Check sends the choice.
 *
 * Every item is drawn at one size, in fives, never overlapping (layout.ts picks the biggest size
 * that fits). Tapping an item speaks its name; tapping a recipient speaks its kind.
 *
 * Trace targets: `pile` (any item in the basket, and the basket as the drop target for giving
 * back), `recipient-<i>`, `item-<i>-<j>` (item j at recipient i), `deal-round`, `seagull` (the
 * bird or its button), `opt-<id>` and `key-<k>`.
 *
 * Demo ops: `deal {to, count?}` (items fly from the basket, or back to it), `deal-round` (one flies
 * to each in turn), `set-aside-leftover` (the items hop to the seagull) and `answer` (`value`
 * typed on the pad, or `id` picked).
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

/** Answer blanks are sized for three digits whatever the answer, so the width never hints. */
const MAX_DIGITS = 3;
/** The height the main area may use (px): the widget area is ≈ 720 px tall on a 1280 × 800 tablet. */
const MAIN_H = 616;
const ITEM_MAX = { k: 104, 'g1-up': 84 } as const;

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
const REASON_ICON: Record<Reason, () => ReactNode> = {
  unequal: () => <UnequalIcon />,
  round: () => <GoRoundIcon />,
  empty: () => <BasketIcon empty />,
};

const OPTION: Record<string, { key: NarrationKey; icon: () => ReactNode }> = {
  yes: { key: 'ui.widget.es.opt.yes', icon: () => <FairIcon /> },
  no: { key: 'ui.widget.es.opt.no', icon: () => <NotFairIcon /> },
  even: { key: 'ui.widget.es.opt.even', icon: () => <EvenIcon /> },
  odd: { key: 'ui.widget.es.opt.odd', icon: () => <OddIcon /> },
};

const ASK: Record<Config['ask'], { key: NarrationKey; icon: () => ReactNode }> = {
  each: { key: 'ui.widget.es.ask.each', icon: () => <AskEachIcon /> },
  leftover: { key: 'ui.widget.es.ask.leftover', icon: () => <SeagullIcon /> },
  'fair-or-not': { key: 'ui.widget.es.ask.fair', icon: () => <AskFairIcon /> },
  'even-odd': { key: 'ui.widget.es.ask.even-odd', icon: () => <AskEvenOddIcon /> },
};

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Why the seagull's button is off, or null when the model would act (03 §5.5). */
function seagullReason(s: State): Reason | null {
  const equal = s.shares.every((x) => x === s.shares[0]);
  if (s.pile > 0 && s.pile < s.shares.length && equal) return null;
  if (s.pile >= s.shares.length) return 'round';
  if (!equal) return 'unequal';
  return 'empty';
}

type Source = { from: 'pile' } | { from: 'recipient'; index: number };
function parseItem(id: string): Source | null {
  if (/^pile-\d+$/.test(id)) return { from: 'pile' };
  const m = /^item-(\d+)-(\d+)$/.exec(id);
  return m ? { from: 'recipient', index: Number(m[1]) } : null;
}
const recipientOf = (target: string): number | null => {
  const m = /^recipient-(\d+)$/.exec(target);
  return m ? Number(m[1]) : null;
};

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
  const [text, setText] = useState('');
  const textRef = useRef(text);
  textRef.current = text;
  const [busy, setBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [pickedByDemo, setPickedByDemo] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const interactive = !disabled && !busy;

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
  /** A child step clears the demo's invite and marks. */
  const childStep = () => {
    setInvite(null);
    setFlash(new Set());
  };

  // ---------- layout ----------

  const [mainW, setMainW] = useState(820);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setMainW((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ageMode = prefs.ageMode;
  const chrome = chromeFor(ageMode);
  const predealt = config.predealt;
  const cap = useMemo(() => {
    const base = zoneCapacity(config.items, R, ask === 'fair-or-not' ? predealt : undefined);
    return Math.max(base, ...(predealt ?? []));
  }, [config.items, R, ask, predealt]);
  const pileMax = dealing ? config.items : Math.max(0, config.items - sum(predealt ?? []));
  const layout = useMemo(
    () =>
      shareLayout({
        recipients: R,
        kind,
        cap,
        pileMax,
        dealing,
        seagull: dealing,
        seagullMax: R - 1,
        width: mainW,
        height: MAIN_H,
        maxItem: ITEM_MAX[ageMode],
        chrome,
      }),
    [R, kind, cap, pileMax, dealing, mainW, ageMode, chrome],
  );
  const s = layout.s;

  // ---------- child input ----------

  const spriteKey = spriteNameKey(config.sprite);
  const spriteName = t(spriteKey);
  const kindKey: NarrationKey = `ui.widget.es.kind.${kind}`;
  const speak = (key: NarrationKey) => {
    if (prefs.speakOnTap) say(key);
  };
  const fits = (i: number) => (stateRef.current.shares[i] ?? cap) < cap;

  /** Every item in the basket is traced as `pile` (they are all the same pile). */
  const dndTrace: TraceRecorder = (kindOf, target) =>
    trace(kindOf, /^pile-\d+$/.test(target) ? 'pile' : target);

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive || !dealing,
    trace: dndTrace,
    canPlace: (itemId, target) => {
      const item = parseItem(itemId);
      if (!item) return false;
      const to = recipientOf(target);
      if (item.from === 'pile') return to !== null && fits(to);
      if (target === 'pile') return true;
      return to !== null && to !== item.index && fits(to);
    },
    onSelect: (itemId) => {
      if (itemId) speak(spriteKey);
    },
    onPlace: ({ item: itemId, target }) => {
      const item = parseItem(itemId);
      if (!item) return;
      childStep();
      const to = recipientOf(target);
      let next = stateRef.current;
      if (item.from === 'recipient') {
        next = applyAction(next, { op: 'deal', args: { to: item.index, count: -1 } });
      }
      if (to !== null) next = applyAction(next, { op: 'deal', args: { to } });
      commit(next);
    },
  });

  const onDealRound = () => {
    if (!interactive) return;
    childStep();
    trace('tap', 'deal-round');
    commit(applyAction(stateRef.current, { op: 'deal-round' }));
  };

  const onGive = () => {
    if (!interactive) return;
    childStep();
    trace('tap', 'seagull');
    commit(applyAction(stateRef.current, { op: 'set-aside-leftover' }));
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    childStep();
    trace('tap', `key-${key}`);
    setText((prev) => applyPadKey(prev, key, MAX_DIGITS));
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
    if (!interactive) return false;
    let next = stateRef.current;
    if (typed) {
      const value = padValue(textRef.current);
      if (value === null) return false;
      next = applyAction(next, { op: 'answer', args: { value } });
    }
    const response = model.toResponse(next);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // Desktop Enter checks, except while an item or a drop target has focus (Enter moves it there).
  const onEnter = () => {
    const el = document.activeElement;
    if (el?.closest('[data-place-item], [data-place-target]')) return;
    submit();
  };

  // ---------- demo mode (03 §6.3) ----------

  const q = (sel: string) => rootRef.current?.querySelector<HTMLElement>(sel) ?? null;
  const itemEl = (i: number, j: number) => q(`[data-place-item="item-${i}-${j}"]`);
  const spotEl = () => q('[data-place-item="pile-0"]') ?? q('.ni-esw__spot');

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
    // One flies to each recipient in turn; the end state is the model's own deal-round.
    for (let i = 0; i < R; i += 1) {
      if (!alive.current || stateRef.current.pile === 0) break;
      await dealOne(i, FLY_MS);
    }
    if (alive.current) commit(target);
  };

  const runSetAside = async () => {
    const s0 = stateRef.current;
    const next = applyAction(s0, { op: 'set-aside-leftover' });
    if (next === s0) {
      // The model does nothing yet (03 §5.5): the reason by the button shows it.
      setFlash(new Set(['reason']));
      await committed();
      await pause(HOLD_MS * 2);
      return;
    }
    const moved = s0.pile;
    const fromRects = Array.from(
      { length: moved },
      (_, k) => q(`[data-place-item="pile-${k}"]`)?.getBoundingClientRect() ?? null,
    );
    const ids = Array.from({ length: moved }, (_, k) => `gull-${s0.seagull + k}`);
    // Reduced motion: the items appear by the seagull at once, highlighted in the same frame.
    if (reduced) setFlash(new Set([...ids, 'gull']));
    await applyOp({ op: 'set-aside-leftover' });
    const hops: Promise<void>[] = [];
    for (let k = 0; k < moved; k += 1) {
      const el = q(`[data-gull-item="${ids[k]}"]`);
      const from = fromRects[k];
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

  const typeAnswer = async (value: number) => {
    let typedText = '';
    textRef.current = '';
    setText('');
    for (const ch of String(Math.max(0, Math.trunc(value))).split('') as PadKey[]) {
      setPressedKey(ch);
      await pause(KEY_MS);
      if (!alive.current) return;
      typedText = applyPadKey(typedText, ch, MAX_DIGITS);
      textRef.current = typedText;
      setText(typedText);
    }
    setPressedKey(null);
    await pause(KEY_MS);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setBusy(true);
      setInvite(null);
      setFlash(new Set());
      try {
        switch (action.op) {
          case 'deal':
            await runDeal(action);
            break;
          case 'deal-round':
            await runDealRound();
            break;
          case 'set-aside-leftover':
            await runSetAside();
            break;
          case 'answer': {
            const id = typeof action.args?.id === 'string' ? action.args.id : undefined;
            const value = num(action.args?.value);
            if (id !== undefined && choices.includes(id)) {
              setPickedByDemo(id);
              await pause(PICK_MS);
              if (alive.current) commit(applyAction(stateRef.current, action));
            } else if (value !== undefined && typed) {
              await typeAnswer(value);
              if (alive.current) commit(applyAction(stateRef.current, action));
            }
            break;
          }
        }
        // Reduced motion: the change was instant; the highlight shows briefly (no movement).
        if (reduced && alive.current) await wait(HOLD_MS);
      } finally {
        setPressedKey(null);
        if (alive.current) {
          // After a demo step the widget is back to its normal, interactive look when play resolves.
          setPickedByDemo(null);
          setFlash(new Set());
          setBusy(false);
          await committed();
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  // What the invite points at: `hand` gets the pointer; `ring` the pulsing outline.
  const invited = ((): { hand: string; ring: string[] } | null => {
    if (!invite) return null;
    switch (invite.op) {
      case 'deal': {
        const to = Math.trunc(num(invite.args?.to) ?? -1);
        if (to < 0 || to >= R) return null;
        const back = (num(invite.args?.count) ?? 1) < 0;
        return back
          ? { hand: `recipient-${to}`, ring: [`recipient-${to}`, 'pile'] }
          : { hand: 'spot', ring: ['spot', `recipient-${to}`] };
      }
      case 'deal-round':
        return dealing ? { hand: 'deal-round', ring: ['deal-round'] } : null;
      case 'set-aside-leftover':
        return dealing ? { hand: 'seagull', ring: ['seagull'] } : null;
      case 'answer': {
        if (typed) return { hand: 'answer', ring: ['answer'] };
        const id = typeof invite.args?.id === 'string' ? invite.args.id : choices[0];
        return id && choices.includes(id) ? { hand: `opt-${id}`, ring: [`opt-${id}`] } : null;
      }
      default:
        return null;
    }
  })();
  const ringed = (id: string) => invited?.ring.includes(id) ?? false;
  const hand = (id: string) =>
    invited?.hand === id ? (
      <span className="ni-hand ni-esw__hand">
        <HandPointerIcon />
      </span>
    ) : null;
  const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

  // ---------- render ----------

  /** A region's label: a picture icon, plus the word in G1+ (the region carries the name). */
  const legend = (icon: ReactNode, label: NarrationKey) => (
    <span className="ni-esw__legend" aria-hidden="true">
      <span className="ni-esw__legend-icon">{icon}</span>
      {prefs.textLabels ? <span className="ni-esw__legend-text">{t(label)}</span> : null}
    </span>
  );

  /** Taps on pictures (pre-dealt shares, the seagull's items): name what is under the finger. */
  const onPictureTap = (e: MouseEvent) => {
    if (!interactive) return;
    const id = (e.target as Element).closest<HTMLElement>('[data-es-tap]')?.dataset.esTap;
    if (!id) return;
    trace('tap', id);
    speak(id.startsWith('recipient-') ? kindKey : spriteKey);
  };

  const itemStyle = (x: number, y: number): CSSProperties => ({
    left: x,
    top: y,
    width: s,
    height: s,
  });

  const renderRecipient = (i: number) => {
    const n = state.shares[i] ?? 0;
    const id = `recipient-${i}`;
    const { zone, card } = layout;
    const items: ReactNode[] = [];
    for (let j = 0; j < n; j += 1) {
      const itemId = `item-${i}-${j}`;
      const p = zoneCell(j, s, zone.upright);
      const sprite = <ObjectSprite sprite={config.sprite} />;
      if (!dealing) {
        items.push(
          <span
            key={itemId}
            className="ni-esw__item"
            data-es-tap={itemId}
            style={itemStyle(p.x, p.y)}
          >
            {sprite}
          </span>,
        );
        continue;
      }
      const props = dnd.itemProps(itemId, { label: spriteName });
      items.push(
        <span
          key={itemId}
          {...props}
          tabIndex={props.tabIndex === 0 && j === 0 ? 0 : -1}
          className={cls(props.className, 'ni-esw__item')}
          data-flash={flash.has(itemId) ? 'true' : undefined}
          style={itemStyle(p.x, p.y)}
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
      <div className="ni-esw__zone" data-kind={kind} style={zoneStyle}>
        <div
          className="ni-esw__zone-items"
          style={{ left: zone.pad, top: zone.pad, width: zone.w - 2 * zone.pad }}
        >
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
    if (dealing) {
      const props = dnd.targetProps(id, { label: t(kindKey) });
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
        className={cls('ni-esw__rec', ringed(id) && 'ni-invite')}
        data-flash={flash.has(id) ? 'true' : undefined}
        style={{ width: card.w, height: card.h }}
      >
        {pad}
        {figure}
        {inner}
        {hand(id)}
      </div>
    );
  };

  let next = 0;
  const recipientRows = layout.rows.map((count, r) => {
    const cards: ReactNode[] = [];
    for (let k = 0; k < count; k += 1) cards.push(renderRecipient(next++));
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
      <div key={r} className="ni-esw__row" style={{ gap: CARD_GAP }}>
        {cards}
      </div>
    );
  });

  const regionKey: NarrationKey = `ui.widget.es.region.${kind}`;
  const recipientsInner = (
    <>
      {legend(kind === 'plate' ? <PlateIcon /> : <PebblingIcon />, regionKey)}
      <div className="ni-esw__rows" style={{ gap: CARD_GAP }}>
        {recipientRows}
      </div>
    </>
  );
  const recipients = dealing ? (
    // biome-ignore lint/a11y/useSemanticElements: a labelled region laying its drop targets out behind their items
    <div className="ni-esw__recipients" role="group" aria-label={t(regionKey)}>
      {recipientsInner}
    </div>
  ) : (
    // A pre-dealt share is one picture ("Look at the picture"); a tap names what is under it.
    // biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-hear is a pointer extra; the picture is one image to assistive tech
    <div
      className="ni-esw__recipients"
      role="img"
      aria-label={t('ui.widget.picture')}
      onClick={onPictureTap}
    >
      {recipientsInner}
    </div>
  );

  // The basket: the take-one spot (pile-0) and the rest of the pile in fives.
  const pileItems: ReactNode[] = [];
  const loose = dealing ? Math.max(0, state.pile - 1) : state.pile;
  for (let k = 0; k < loose; k += 1) {
    const j = dealing ? k + 1 : k;
    const p = fivesCell(k, Math.max(1, layout.pile.cols), s);
    const sprite = <ObjectSprite sprite={config.sprite} />;
    if (!dealing) {
      pileItems.push(
        <span key={j} className="ni-esw__item" data-es-tap="pile" style={itemStyle(p.x, p.y)}>
          {sprite}
        </span>,
      );
      continue;
    }
    const props = dnd.itemProps(`pile-${j}`, { label: spriteName });
    pileItems.push(
      <span
        key={j}
        {...props}
        tabIndex={-1}
        className={cls(props.className, 'ni-esw__item')}
        style={itemStyle(p.x, p.y)}
      >
        {sprite}
      </span>,
    );
  }

  const spot = dealing ? (
    <span
      className={cls('ni-esw__spot', ringed('spot') && 'ni-invite')}
      data-empty={state.pile === 0 ? 'true' : undefined}
      style={{ width: layout.spot, height: layout.spot }}
    >
      {state.pile > 0
        ? (() => {
            const props = dnd.itemProps('pile-0', { label: spriteName });
            return (
              <span
                {...props}
                className={cls(props.className, 'ni-esw__take')}
                style={{ '--s': `${s}px` } as CSSProperties}
              >
                <span className="ni-esw__take-sprite">
                  <ObjectSprite sprite={config.sprite} />
                </span>
              </span>
            );
          })()
        : null}
      {hand('spot')}
    </span>
  ) : null;

  const captionBeside = (label: NarrationKey) =>
    prefs.textLabels ? (
      <span className="ni-esw__caption" aria-hidden="true">
        {t(label)}
      </span>
    ) : null;

  const dealButton = dealing ? (
    <span className="ni-esw__action" style={{ width: chrome.dealW, height: chrome.dealH }}>
      <span className="ni-esw__slot">
        <IconButton
          label="ui.widget.es.deal-round"
          icon={<DealRoundIcon />}
          tone="sea"
          caption={false}
          onPress={onDealRound}
          disabled={!interactive || state.pile === 0}
          className={ringed('deal-round') ? 'ni-invite' : undefined}
          data={{ 'data-action': 'deal-round' }}
        />
        {hand('deal-round')}
      </span>
      {captionBeside('ui.widget.es.deal-round')}
    </span>
  ) : null;

  const pileStyle = {
    width: Math.max(layout.pile.w, dealing ? 0 : s),
    height: Math.max(layout.pile.h, s),
  };
  const pileBox = dealing ? (
    <div className="ni-esw__pile" style={pileStyle}>
      {pileItems}
    </div>
  ) : (
    // What is left of a pre-dealt pile: a picture; a tap names the items.
    // biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-hear is a pointer extra; the pile is one image to assistive tech
    <div
      className="ni-esw__pile"
      role="img"
      aria-label={spriteName}
      onClick={onPictureTap}
      style={pileStyle}
    >
      {pileItems}
    </div>
  );

  const basket =
    layout.basket.w > 0 ? (
      // biome-ignore lint/a11y/useSemanticElements: a labelled region laying its drop target out behind its items
      <div className="ni-esw__region" role="group" aria-label={t('ui.widget.es.region.basket')}>
        {legend(<BasketIcon />, 'ui.widget.es.region.basket')}
        <div
          className={cls('ni-esw__basket', ringed('pile') && 'ni-invite')}
          data-shape={layout.basket.shape}
          data-flash={flash.has('pile') ? 'true' : undefined}
          style={{ width: layout.basket.w, height: layout.basket.h }}
        >
          {dealing
            ? (() => {
                const props = dnd.targetProps('pile', { label: t('ui.widget.es.basket') });
                const hadSelection = dnd.selected !== null;
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: targetProps gives role="button", tabIndex and the key handler
                  // biome-ignore lint/a11y/useKeyWithClickEvents: targetProps' onKeyDown is spread above
                  <div
                    {...props}
                    className={cls(props.className, 'ni-esw__pad')}
                    onClick={(e: MouseEvent) => {
                      props.onClick(e);
                      if (hadSelection || !interactive) return;
                      trace('tap', 'pile');
                      speak('ui.widget.es.region.basket');
                    }}
                  />
                );
              })()
            : null}
          {layout.basket.shape === 'side' ? (
            <>
              {dealing ? (
                <span className="ni-esw__controls" data-shape="side">
                  {spot}
                  {dealButton}
                </span>
              ) : null}
              {pileBox}
            </>
          ) : (
            <>
              {pileBox}
              {dealing ? (
                <span className="ni-esw__controls" data-shape="under">
                  {spot}
                  {dealButton}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
    ) : null;

  const reason = seagullReason(state);
  const gullItems: ReactNode[] = [];
  for (let k = 0; k < state.seagull; k += 1) {
    const p = fivesCell(k, Math.max(1, layout.bird.cols), s);
    gullItems.push(
      <span
        key={k}
        className="ni-esw__item ni-esw__gull-item"
        data-gull-item={`gull-${k}`}
        data-es-tap="seagull"
        data-flash={flash.has(`gull-${k}`) ? 'true' : undefined}
        style={itemStyle(p.x, p.y)}
      >
        <ObjectSprite sprite={config.sprite} />
      </span>,
    );
  }

  const nest = dealing ? (
    // biome-ignore lint/a11y/useSemanticElements: a labelled region round the seagull and its button
    <div className="ni-esw__region" role="group" aria-label={t('ui.widget.es.seagull')}>
      {legend(<SeagullIcon />, 'ui.widget.es.seagull')}
      <div
        className="ni-esw__nest"
        data-shape={layout.nest.shape}
        data-flash={flash.has('gull') ? 'true' : undefined}
        style={
          {
            width: layout.nest.w,
            height: layout.nest.h,
            '--sand-h': `${layout.bird.h + 20}px`,
          } as CSSProperties
        }
      >
        <span className="ni-esw__nest-top" data-shape={layout.nest.shape}>
          <button
            type="button"
            className="ni-esw__bird"
            style={{ width: chrome.birdW, height: chrome.birdH }}
            aria-label={t('ui.widget.es.seagull')}
            disabled={!interactive}
            onClick={() => {
              trace('tap', 'seagull');
              speak(reason ? REASON_KEY[reason] : 'ui.widget.es.seagull');
            }}
          >
            <SeagullArt />
          </button>
          <span className="ni-esw__action" style={{ width: chrome.giveW, height: chrome.giveH }}>
            <span className="ni-esw__slot">
              <IconButton
                label="ui.widget.es.give-rest"
                icon={<GiveSeagullIcon />}
                tone="leaf"
                caption={false}
                onPress={onGive}
                disabled={!interactive || reason !== null}
                className={ringed('seagull') ? 'ni-invite' : undefined}
                data={{ 'data-action': 'seagull' }}
              />
              {hand('seagull')}
            </span>
            {reason ? (
              <span
                className="ni-esw__reason"
                role="img"
                aria-label={t(REASON_KEY[reason])}
                data-reason={reason}
                data-flash={flash.has('reason') ? 'true' : undefined}
                style={{ width: REASON_PX[ageMode], height: REASON_PX[ageMode] }}
              >
                {REASON_ICON[reason]()}
              </span>
            ) : null}
            {captionBeside(reason ? REASON_KEY[reason] : 'ui.widget.es.give-rest')}
          </span>
        </span>
        {layout.bird.h > 0 ? (
          // What the seagull was given: a picture of its items; a tap names them.
          // biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-hear is a pointer extra; the items are one image to assistive tech
          <span
            className="ni-esw__gull-items"
            role="img"
            aria-label={spriteName}
            onClick={onPictureTap}
            style={{ width: layout.bird.w, height: layout.bird.h }}
          >
            {gullItems}
          </span>
        ) : null}
      </div>
    </div>
  ) : null;

  const bottom =
    basket || nest ? (
      <div className="ni-esw__bottom" style={{ gap: ROW_GAP }}>
        {basket}
        {nest}
      </div>
    ) : null;

  const askInfo = ASK[ask];
  const askLegend = legend(askInfo.icon(), askInfo.key);

  const check = (
    <span className="ni-esw__slot ni-esw__check">
      <CheckButton
        onPress={submit}
        disabled={!interactive || (typed ? padValue(text) === null : state.choice === null)}
      />
    </span>
  );

  const side = typed ? (
    // biome-ignore lint/a11y/useSemanticElements: a labelled region round the answer controls
    <div
      className="ni-esw__side ni-esw__answer"
      role="group"
      aria-label={t(askInfo.key)}
      data-k={ageMode === 'k' ? 'true' : undefined}
    >
      {askLegend}
      <span className="ni-esw__slot ni-esw__blankslot">
        <output
          className={cls('ni-number', 'ni-esw__blank', ringed('answer') && 'ni-invite')}
          data-size="lg"
          data-empty={text === '' ? 'true' : undefined}
          style={{ minWidth: `${MAX_DIGITS * 0.62 + 0.8}em` }}
          aria-label={`${t('ui.widget.answer')}: ${text}`.trim()}
        >
          {text === '' ? <span className="ni-number__slot" /> : <span>{text}</span>}
          {interactive ? <span className="ni-number__caret" /> : null}
        </output>
        {hand('answer')}
      </span>
      {check}
      <NumberPadKeys
        onKey={onKey}
        onEnter={onEnter}
        disabled={!interactive}
        highlighted={pressedKey}
      />
    </div>
  ) : (
    // biome-ignore lint/a11y/useSemanticElements: a labelled region round the two choices
    <div className="ni-esw__side ni-esw__choices" role="group" aria-label={t(askInfo.key)}>
      {askLegend}
      <div className="ni-esw__options">
        {choices.map((id) => {
          const opt = OPTION[id];
          if (!opt) return null;
          const optId = `opt-${id}`;
          return (
            <span key={id} className="ni-esw__slot">
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
                {prefs.textLabels ? (
                  <span className="ni-esw__option-word">{t(opt.key)}</span>
                ) : null}
              </PickCard>
              {hand(optId)}
            </span>
          );
        })}
      </div>
      {check}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="ni-esw"
      data-ask={ask}
      data-tier={tier}
      data-kind={kind}
      data-disabled={disabled ? 'true' : undefined}
      data-fits={layout.fits ? undefined : 'false'}
      style={
        {
          '--s': `${s}px`,
          '--legend-h': `${LEGEND_H}px`,
          '--row-gap': `${ROW_GAP}px`,
        } as CSSProperties
      }
    >
      <div className="ni-esw__main" ref={mainRef} style={{ gap: ROW_GAP }}>
        {recipients}
        {bottom}
      </div>
      {side}
    </div>
  );
}

export default EqualShareWidget;
