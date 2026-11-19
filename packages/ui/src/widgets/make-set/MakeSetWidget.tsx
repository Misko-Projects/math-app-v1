import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { BigButton } from '../../primitives/BigButton';
import { ArrowIcon, HandPointerIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  CheckButton,
  HandArt,
  ObjectSprite,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  BundleBand,
  BundleIcon,
  CONTAINER_PAD,
  ContainerArt,
  type ContainerKind,
} from './containers';
import { HEAP_COLS, HEAP_COLS_K, type HeapCell, heapCells, heapRows } from './heap';
import './make-set.css';

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
 *
 * Every change goes through the engine model (`formatModel('make-set')`), which also gives the
 * response on "check": `{ count, removed, parts?, bundles? }` (packages/engine/README.md).
 *
 * Demo ops (03 §5.5): `drag {count, hand?}`, `remove {count, hand?}`, `count-aloud`, `bundle`,
 * `close-container`, plus `answer {value}`, which drags or removes until the container holds
 * `value` (the model has no answer op for make-set; check is the answer control).
 */

const OPS = ['drag', 'remove', 'count-aloud', 'bundle', 'close-container', 'answer'] as const;
const FLY_MS = 480;
const COUNT_MS = 600;
const DEMO_GAP_MS = 220;
/** The supply heap shows at most this many objects; more appear as objects are taken. */
const SUPPLY_VISIBLE = 12;
/** Rendered objects are capped (content stays ≤ 20 + supply); the model still tracks the rest. */
const MAX_OBJECTS = 40;

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
  const [moves, setMoves] = useState(0);
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
    setMoves((m) => m + 1);
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

  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [flyingId, setFlyingId] = useState<ItemId | null>(null);
  const [counting, setCounting] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = tier === 'concrete' && !disabled && !demoBusy;

  /** Moves one object into the container (from the pile or supply). False when it can't. */
  const moveIn = (id: ItemId): boolean => {
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
    apply({ op: 'bundle' });
    sfx('fuse');
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || moves === 0 || !model || !stateRef.current) return false;
    const response = model.toResponse(model.apply(stateRef.current, { op: 'close-container' }));
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
            const n = view(stateRef.current).count;
            for (let i = 0; i < n; i++) {
              setCounting(i);
              sayNumber(i + 1);
              await pause(COUNT_MS);
              if (!alive.current) return;
            }
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
            const want = Number(action.args?.value);
            if (!Number.isFinite(want)) break;
            for (let guard = 0; guard < MAX_OBJECTS; guard++) {
              const count = view(stateRef.current).count;
              if (count === want) break;
              const ok = count < want ? await demoDragOne(null) : await demoRemoveOne(null);
              if (!ok || !alive.current) break;
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
  const FRAME_GAP = 18;
  /** A frame's padding (14) and ink border (4) on each side, as in make-set.css. */
  const FRAME_EDGE = 2 * (14 + 4);
  const gridH = frames * (frameH + FRAME_EDGE) + (frames - 1) * FRAME_GAP;
  const kind = (hands ? 'basket' : config.container) as ContainerKind;
  const pad = CONTAINER_PAD[kind];
  const boxW = frameW + FRAME_EDGE + pad.left + pad.right;
  const boxH = gridH + pad.top + pad.bottom;
  const containerName = t(`ui.set.${config.container}`);

  // Demo invite (03 §6.3): the ring and Pip's hand sit on the ONE thing the child acts on next.
  // `answer` invites a drag or a remove, whichever moves the count towards the value.
  // The cue shows only while the child can act on it: never on a disabled control, and not while
  // the widget is disabled or Pip is playing (the invite is kept and shows once input is back).
  const cue = interactive;
  const answerWant = invite?.op === 'answer' ? Number(invite.args?.value) : Number.NaN;
  const inviteStep: 'drag' | 'remove' | null =
    invite?.op === 'drag' || (Number.isFinite(answerWant) && answerWant > v.count)
      ? 'drag'
      : invite?.op === 'remove' || (Number.isFinite(answerWant) && answerWant < v.count)
        ? 'remove'
        : null;
  /** The heap the child drags from: in take-away, the "take away" pile goes back first. */
  const shownOutside = outside.slice(0, SUPPLY_VISIBLE);
  const dragFrom = takeAway ? (lists.away.length > 0 ? lists.away : shownOutside) : shownOutside;
  // The last object of its heap: it sits in the bottom row, so the hand below it covers nothing.
  const invitedItem: ItemId | null =
    hands || !cue
      ? null
      : inviteStep === 'drag'
        ? lists.inside.length < capacity
          ? (dragFrom.at(-1) ?? null)
          : null
        : inviteStep === 'remove'
          ? (lists.inside.at(-1) ?? null)
          : null;
  /** Hands: the finger button the child presses next (drag → "finger up", remove → "down"). */
  const invitedHand: 0 | 1 | null =
    !hands || !invite || !inviteStep || !cue
      ? null
      : (handArg(invite) ??
        (inviteStep === 'drag' ? (handParts[0] < 5 ? 0 : 1) : handParts[1] > 0 ? 1 : 0));
  const invitedCount = cue && invite?.op === 'count-aloud';
  const invitedCheck =
    cue &&
    moves > 0 &&
    (invite?.op === 'close-container' ||
      (Number.isFinite(answerWant) && answerWant === v.count && inviteStep === null));
  const invitedBundle = cue && canBundle && invite?.op === 'bundle';

  // ---------- the heap's layout ----------

  const heapCap = ageMode === 'k' ? HEAP_COLS_K : HEAP_COLS;
  /** The heap keeps the size of its fullest state, so it never jumps as objects leave. */
  const heapBox = (most: number) => {
    const rows = Math.max(1, heapRows(most, heapCap).length);
    return {
      width: heapCap * slot + (heapCap - 1) * gap,
      minHeight: rows * slot + (rows - 1) * gap,
    };
  };

  // ---------- render ----------

  const thingName = t(spriteNameKey(sprite));

  const pointer = (
    <span className="ni-hand ni-mset__hand">
      <HandPointerIcon />
    </span>
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
        {place === 'inside' && counting !== null && index <= counting ? (
          <span className="ni-mset__mark" aria-hidden="true">
            {index + 1}
          </span>
        ) : null}
        {invited ? pointer : null}
      </div>
    );
  };

  const pileArea = (which: 'supply' | 'away') => {
    const items = which === 'away' ? lists.away : outside;
    const isTarget = which === 'away' ? takeAway : !takeAway;
    const most = which === 'away' ? MAX_OBJECTS : SUPPLY_VISIBLE;
    const shown = items.slice(0, most);
    const label = which === 'away' ? t('ui.set.away') : t('ui.set.supply');
    const targetProps = isTarget ? dnd.targetProps('pile', { label }) : null;
    const cells = heapCells(shown.length, heapCap);
    return (
      <div className="ni-mset__pile" data-area={isTarget ? 'pile' : 'supply'} data-kind={which}>
        {targetProps ? (
          <div {...targetProps} className={`${targetProps.className} ni-mset__pad`} />
        ) : null}
        {which === 'away' ? (
          <span className="ni-mset__away-icon" aria-hidden="true">
            <ArrowIcon />
          </span>
        ) : null}
        <div className="ni-mset__heapbox" style={heapBox(Math.min(most, total))}>
          <fieldset
            className="ni-mset__heap"
            aria-label={label}
            style={{ gridTemplateColumns: `repeat(${2 * heapCap}, var(--heap-half))` }}
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

  const containerBox = (
    <div
      className="ni-mset__container"
      data-container={config.container}
      style={{ width: boxW, height: boxH } as CSSProperties}
    >
      <ContainerArt kind={kind} width={boxW} height={boxH} closed={closed} />
      <div {...containerProps} className={`${containerProps.className} ni-mset__pad`} />
      {/* count-aloud invites counting what is in the frames: the ring hugs them, not the art. */}
      <div
        className={['ni-mset__frames', invitedCount ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        style={{ top: pad.top, left: pad.left, gap: FRAME_GAP } as CSSProperties}
      >
        {Array.from({ length: frames }, (_, f) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: ten-frames are positional
          <div key={f} className="ni-mset__frame" data-bundled={f < bundles ? 'true' : undefined}>
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
            {f < bundles ? <BundleBand width={frameW} height={frameH} /> : null}
          </div>
        ))}
        {invitedCount ? pointer : null}
      </div>
    </div>
  );

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
          <HandArt
            up={up}
            tone={h === 0 ? 'a' : 'b'}
            height={ageMode === 'k' ? 230 : 210}
            mirror={h === 1}
          />
          {counting !== null && h === (counting < handParts[0] ? 0 : 1) ? (
            <span className="ni-mset__mark ni-mset__mark--hand" aria-hidden="true">
              {counting + 1}
            </span>
          ) : null}
          {invitedCard ? (
            <span className="ni-hand ni-mset__hand ni-mset__hand--card">
              <HandPointerIcon />
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
            {invitedUp ? pointer : null}
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
            {invitedDown ? pointer : null}
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
      style={{ '--slot': `${slot}px`, '--heap-half': `${(slot - gap) / 2}px` } as CSSProperties}
    >
      {hands ? (
        <fieldset className="ni-mset__hands" aria-label={containerName}>
          {handBox(0)}
          {handBox(1)}
        </fieldset>
      ) : (
        <>
          {!takeAway || outside.length > 0 ? pileArea('supply') : null}
          {containerBox}
          {takeAway ? pileArea('away') : null}
        </>
      )}

      <div className="ni-mset__actions">
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
            />
            {invitedBundle ? pointer : null}
          </span>
        ) : null}
        <span className="ni-mset__action">
          <CheckButton
            onPress={submit}
            disabled={!interactive || moves === 0}
            invited={invitedCheck}
          />
          {invitedCheck ? pointer : null}
        </span>
      </div>

      {flight ? (
        <div className="ni-mset__flight" style={flightStyle} aria-hidden="true">
          <ObjectSprite sprite={flight.sprite} />
        </div>
      ) : null}
    </div>
  );
}

export default MakeSetWidget;
