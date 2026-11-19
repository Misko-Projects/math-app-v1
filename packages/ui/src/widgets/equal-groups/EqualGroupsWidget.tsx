import {
  type EqualGroupsState,
  formatModel,
  GROUP_CAPACITY,
  groupsAnswerMax,
  groupsSupply,
} from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
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
import { IconButton } from '../../primitives/IconButton';
import { useWidgetDemo } from '../demo';
import {
  AskEntry,
  AskStep,
  buildRoom,
  COMPACT_ROOM_H,
  nextPadKey,
  ObjectSprite,
  type PadKey,
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
  useGrabUnderFinger,
  useInviteHand,
  useSubmitGuard,
  useTwoStep,
  useWidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { AddIcon, BucketArt, ContainerArt, type ContainerKind, LassoArt, TaskIcon } from './art';
import {
  fivesCell,
  GROUP_GAP,
  groupsLayout,
  type Layout,
  MIN_ITEM_PX,
  partsFor,
  ROW_GAP,
  zoneCell,
} from './layout';
import './equal-groups.css';

/**
 * `equal-groups` (03 §5.5): containers (rafts, baskets, plates, nests) of sprites.
 *
 * Two steps (kit `twoStep`), each fitted to the widget's room (06 §1):
 *
 * - **build** (`build`, concrete): the supply, the containers and Next. The child moves one sprite
 *   at a time from the supply's take-one spot into a container by drag, tap-to-place or keyboard
 *   (`fill-group {index, count: current + 1}`). Touching a container's last sprite picks it
 *   up again: put it back in the supply (count − 1) or into another container. When the number of
 *   groups is the unknown the child adds containers ("Add a raft", at most `maxGroups`); touching
 *   an empty one takes it away again (`add-group {remove}`). When the total is given the supply is
 *   a pile of exactly that many sprites; when the total is the unknown it is a bottomless bucket
 *   (a finite pile would give the answer away). A line above shows what the task gives.
 * - **ask**: a static picture of the containers with the kit `NumberEntry`, Back and Check
 *   (`read`: this step only, with Check). Check sends the model's response.
 *
 * Every sprite is drawn at one size, in fives, never overlapping; every container is drawn for a
 * full ten, so its size never shows the answer. No count or total is shown anywhere.
 *
 * Limits are said and shown (a status line, with one ring on what the child can do next): a full
 * container, an empty supply, and the last container added. A ring never points away from a
 * state that may be the answer (a container of ten where ten may be asked has the note alone).
 *
 * Trace targets: `supply` (the take-one spot, and the supply as the drop target for taking back),
 * `group-<i>`, `sprite-<i>-<j>` (container i's last sprite j, picked up), `add-group`,
 * `remove-group-<i>`, `next`, `back`, `opt-<n>` (a numeral card) and `key-<k>`.
 *
 * Demo ops (03 §5.5): `add-group`, `fill-group {index, count}` (sprites fly in one by one),
 * `skip-count` (each group lights up in turn while the running multiple is spoken),
 * `circle-group {index}` (a hand-drawn lasso), plus `answer {value}`.
 */

type Config = ConfigFor<'equal-groups'>;
type State = EqualGroupsState;

const OPS: readonly string[] = [...FORMAT_SUPPORT['equal-groups'].ops, 'answer'];

function stateModel() {
  const m = formatModel('equal-groups');
  if (!m) throw new Error('equal-groups has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

const SPRITE_MAX = { k: 96, 'g1-up': 80 } as const;
/** The ask step's picture is legible from this sprite size up. */
const PICTURE_MIN_ITEM = MIN_ITEM_PX;

// Motion (03 §6.3): short, transform-only moves.
const FLY_MS = 420;
const FLY_FAST_MS = 200;
const POP_MS = 360;
const COUNT_MS = 850;
const LASSO_MS = 700;
const KEY_MS = 340;
const PICK_MS = 500;
const FLASH_MS = 900;
const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

const containerKey = (c: ContainerKind): NarrationKey => `ui.widget.eg.container.${c}`;
const addKey = (c: ContainerKind): NarrationKey => `ui.widget.eg.add.${c}`;
const NOTE = {
  full: 'ui.widget.eg.note.full',
  empty: 'ui.widget.eg.note.empty',
  most: 'ui.widget.eg.note.most',
} as const satisfies Record<string, NarrationKey>;

const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

type Item = { where: 'supply' } | { where: 'group'; group: number };
function parseItem(id: string): Item | null {
  if (id === 'supply') return { where: 'supply' };
  const m = /^sprite-(\d+)-(\d+)$/.exec(id);
  return m ? { where: 'group', group: Number(m[1]) } : null;
}
const groupOf = (target: string): number | null => {
  const m = /^group-(\d+)$/.exec(target);
  return m ? Number(m[1]) : null;
};

/** The container that holds the most (the first of them). */
const fullest = (groups: readonly number[]) => groups.indexOf(Math.max(...groups));

interface Note {
  key: NarrationKey;
  /** The one thing ringed: what the child can do next. */
  cue: string | null;
}

export function EqualGroupsWidget({
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
  const kind = config.container as ContainerKind;
  const supplyTotal = groupsSupply(config);
  const bucket = !read && supplyTotal === null;
  const addable = !read && config.unknown === 'groups';
  const answerMax = groupsAnswerMax(config);

  const [state, setState] = useState<State>(() => initial(config));
  const stateRef = useRef(state);
  const [value, setValue] = useState<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [busy, setBusy] = useState(false);
  const [entryHighlight, setEntryHighlight] = useState<number | PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set());
  const [skip, setSkip] = useState<{ upTo: number; sums: number[] } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = !disabled && !busy;

  const steps = useTwoStep(rootRef, {
    interactive,
    trace,
    // A press of Next or Back is the child's step (once for each press).
    guard: () => {
      childStep();
      return true;
    },
  });
  const grab = useGrabUnderFinger();
  // A picture to read has nothing to build: the ask step alone.
  const step: Step = read ? 'ask' : steps.step;

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
  const flashOn = (keys: string[]) => {
    setFlash(new Set(keys));
    setTimeout(() => {
      if (alive.current) setFlash(new Set());
    }, FLASH_MS);
  };
  /** A child step clears the demo's invite and marks, and the last limit note. */
  const childStep = () => {
    setInvite(null);
    setNote(null);
  };
  /** A limit: said aloud and shown, with one ring on what the child can do next. */
  const limit = (key: NarrationKey, cue: string | null) => {
    setNote({ key, cue });
    say(key);
  };
  const left = (s: State) =>
    supplyTotal === null ? Number.POSITIVE_INFINITY : Math.max(0, supplyTotal - sum(s.groups));
  /**
   * What to ring when the supply has run out: Next when the groups are as the task asks, else a
   * container that surely holds a wrong count (take one back). The size asked: every container
   * given must hold the same, and the fullest holds too many. The size given: a filled container
   * with more than that, else the one with the fewest.
   */
  const emptyCue = (s: State) => {
    const g = s.groups;
    if (config.unknown === 'size') {
      return g.every((n) => n === g[0]) ? 'next' : `take-${fullest(g)}`;
    }
    const filled = g.map((n, i) => ({ n, i })).filter((x) => x.n > 0);
    const over = filled.filter((x) => x.n > config.perGroup).sort((a, b) => b.n - a.n)[0];
    if (over) return `take-${over.i}`;
    const under = filled.filter((x) => x.n < config.perGroup).sort((a, b) => a.n - b.n)[0];
    return under ? `take-${under.i}` : 'next';
  };
  /**
   * What to ring at a full container: its take-back handle where ten is surely too many (the
   * size is given and smaller). Where ten may be the answer the note stands alone: a ring would
   * steer away from it, or give it away.
   */
  const fullCue = (i: number) =>
    config.unknown !== 'size' && config.perGroup < GROUP_CAPACITY ? `take-${i}` : null;

  // ---------- layout: the measured room, the action button, the two plans ----------

  const room = useWidgetRoom(rootRef);
  const box = roomBox(room);
  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const ageMode = prefs.ageMode;
  const button = useActionSize(actRef, zoomRef, ageMode);
  const parts = partsFor(ageMode);
  const groups = state.groups;
  const addSlot = addable && groups.length < config.maxGroups;
  // Every container a build can ever show has its place from the start (a dashed outline until
  // it is added), so adding one moves and resizes nothing.
  const buildSlots = addable ? config.maxGroups : groups.length;

  const buildLayout = useMemo(() => {
    const r = buildRoom({ w: box.w, h: box.h }, button);
    return groupsLayout({
      slots: buildSlots,
      addSlot: addable,
      cap: GROUP_CAPACITY,
      mode: 'build',
      source: bucket ? 'bucket' : 'pile',
      pileMax: supplyTotal ?? 0,
      width: r.w,
      height: r.h,
      maxItem: SPRITE_MAX[ageMode],
      parts,
    });
  }, [box.w, box.h, button, buildSlots, addable, bucket, supplyTotal, ageMode, parts]);

  const pictureInput = (size: Size) => ({
    slots: Math.max(1, groups.length),
    addSlot: false,
    cap: GROUP_CAPACITY,
    mode: 'picture' as const,
    source: null,
    pileMax: 0,
    width: size.w,
    height: size.h,
    maxItem: SPRITE_MAX[ageMode],
    parts,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: pictureInput reads these
  const askPlan = useMemo(
    () =>
      planAsk({
        ageMode,
        max: answerMax,
        button,
        actions: read ? 1 : 2,
        room: { w: box.w, h: box.h },
        pictureScore: (size) => {
          const l = groupsLayout(pictureInput(size));
          return l.fits && l.s >= PICTURE_MIN_ITEM ? l.s : 0;
        },
      }),
    [box.w, box.h, button, ageMode, answerMax, read, groups.length],
  );
  const pictureLayout = askPlan.picture ? groupsLayout(pictureInput(askPlan.picture)) : null;

  // What the child is told (03 §5.5), unless it is the answer: the total when the size is
  // asked; the size when the groups or the total are asked. A picture to read shows it all.
  const task: { key: NarrationKey; word: NarrationKey; n: number } | null = read
    ? null
    : config.unknown === 'size'
      ? {
          key: 'ui.widget.eg.task.total',
          word: 'ui.widget.eg.word.total',
          n: config.groups * config.perGroup,
        }
      : {
          key: `ui.widget.eg.task.each.${kind}`,
          word: `ui.widget.eg.word.each.${kind}`,
          n: config.perGroup,
        };

  // ---------- child input ----------

  const spriteKey = spriteNameKey(config.sprite);
  const spriteName = t(spriteKey);
  const speak = (key: NarrationKey) => {
    if (prefs.speakOnTap) say(key);
  };

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive || read || step !== 'build',
    trace,
    canPlace: (itemId, target) => {
      const item = parseItem(itemId);
      if (!item) return false;
      const to = groupOf(target);
      if (item.where === 'supply') return to !== null;
      if (target === 'supply') return true;
      return to !== null && to !== item.group;
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
      const prev = stateRef.current;
      const to = groupOf(target);
      // A full container takes no more: nothing moves, and the note says why.
      if (to !== null && (prev.groups[to] ?? 0) >= GROUP_CAPACITY) {
        limit(NOTE.full, fullCue(to));
        return;
      }
      let next = prev;
      if (item.where === 'group') {
        const from = item.group;
        next = applyAction(next, {
          op: 'fill-group',
          args: { index: from, count: Math.max(0, (next.groups[from] ?? 0) - 1) },
        });
      }
      if (to !== null) {
        next = applyAction(next, {
          op: 'fill-group',
          args: { index: to, count: (next.groups[to] ?? 0) + 1 },
        });
      }
      commit(next);
      if (left(prev) > 0 && left(next) === 0) limit(NOTE.empty, emptyCue(next));
    },
  });

  const onAdd = () => {
    if (!interactive) return;
    childStep();
    trace('tap', 'add-group');
    const next = applyAction(stateRef.current, { op: 'add-group' });
    commit(next);
    // The last container: the add button is gone, and the note says why.
    if (next.groups.length >= config.maxGroups) {
      limit(NOTE.most, left(next) > 0 ? 'spot' : emptyCue(next));
    }
  };

  /** Touching an empty container: where containers are added, it is taken away again. */
  const onEmptyGroup = (i: number) => {
    if (!addable || (stateRef.current.groups[i] ?? 0) > 0) {
      trace('tap', `group-${i}`);
      speak(containerKey(kind));
      return;
    }
    trace('tap', `remove-group-${i}`);
    speak(containerKey(kind));
    commit(applyAction(stateRef.current, { op: 'add-group', args: { remove: i } }));
  };

  /** Touching the supply names what is in it; an empty one says so. */
  const onSupplyTap = () => {
    trace('tap', 'supply');
    const s = stateRef.current;
    if (left(s) === 0) limit(NOTE.empty, emptyCue(s));
    else speak(spriteKey);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || step !== 'ask') return false;
    const v = valueRef.current;
    if (v === null) return false;
    const response = model.toResponse(
      applyAction(stateRef.current, { op: 'answer', args: { value: v } }),
    );
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo ----------

  const q = (sel: string) => rootRef.current?.querySelector<HTMLElement>(sel) ?? null;
  const spotEl = () => q('.ni-egw__spot');
  const spriteEl = (i: number, j: number) => q(`[data-eg-sprite="sprite-${i}-${j}"]`);

  const animate = (el: HTMLElement, frames: Keyframe[], ms: number) => {
    el.style.zIndex = '3';
    const a = el.animate(frames, { duration: ms, easing: EASE });
    return a.finished
      .catch(() => undefined)
      .then(() => {
        el.style.zIndex = '';
      });
  };

  /** Shows a step and waits until it is drawn. */
  const showStep = async (s: Step) => {
    if (read || steps.step === s) return;
    steps.show(s);
    await committed();
  };

  const runFill = async (index: number, target: number) => {
    const goal = Math.max(0, Math.min(GROUP_CAPACITY, Math.trunc(target)));
    const count = Math.abs(goal - (stateRef.current.groups[index] ?? goal));
    const ms = count > 6 ? FLY_FAST_MS : FLY_MS;
    for (let guard = 0; guard < 2 * GROUP_CAPACITY; guard++) {
      if (!alive.current) return;
      const cur = stateRef.current.groups[index];
      if (cur === undefined || cur === goal) return;
      const next = goal > cur ? cur + 1 : cur - 1;
      const from = spotEl();
      const at = from ? centerOf(from.getBoundingClientRect()) : null;
      if (next < cur) {
        const el = spriteEl(index, cur - 1);
        if (!reduced && el && at) {
          const p = centerOf(el.getBoundingClientRect());
          await animate(
            el,
            [
              { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
              { transform: `translate(${at.x - p.x}px, ${at.y - p.y}px) scale(0.8)`, opacity: 0.3 },
            ],
            ms,
          );
        }
        if (!(await applyOp({ op: 'fill-group', args: { index, count: next } }))) return;
        continue;
      }
      if (!(await applyOp({ op: 'fill-group', args: { index, count: next } }))) return;
      const el = spriteEl(index, next - 1);
      if (reduced || !el || !at) {
        flashOn([`sprite-${index}-${next - 1}`]);
        await committed();
        continue;
      }
      const p = centerOf(el.getBoundingClientRect());
      await animate(
        el,
        [
          { transform: `translate(${at.x - p.x}px, ${at.y - p.y}px) scale(0.8)` },
          { transform: 'translate(0px, 0px) scale(1)' },
        ],
        ms,
      );
    }
  };

  const runAddGroup = async (action: WidgetAction) => {
    const before = stateRef.current.groups.length;
    if (!(await applyOp(action))) return;
    if (stateRef.current.groups.length < before) return;
    const el = q(`[data-group="${before}"]`);
    if (reduced || !el) {
      flashOn([`group-${before}`]);
      await committed();
      return;
    }
    await animate(
      el,
      [
        { transform: 'scale(0.6)', opacity: 0 },
        { transform: 'scale(1.04)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      POP_MS,
    );
  };

  const runSkipCount = async () => {
    await applyOp({ op: 'skip-count' });
    const counts = stateRef.current.groups;
    const sums: number[] = [];
    let run = 0;
    for (const n of counts) {
      run += n;
      sums.push(n > 0 ? run : 0);
    }
    const order = counts.flatMap((n, i) => (n > 0 ? [i] : []));
    if (order.length === 0) return;
    if (reduced) {
      setSkip({ upTo: counts.length - 1, sums });
      sayNumber(run);
      setTimeout(() => {
        if (alive.current) setSkip(null);
      }, FLASH_MS);
      await committed();
      return;
    }
    for (const i of order) {
      setSkip({ upTo: i, sums });
      sayNumber(sums[i] ?? 0);
      await pause(COUNT_MS);
      if (!alive.current) return;
    }
    await pause(400);
    if (alive.current) setSkip(null);
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
      try {
        switch (action.op) {
          case 'add-group':
            await showStep('build');
            await runAddGroup(action);
            break;
          case 'fill-group': {
            const index = Number(action.args?.index);
            const count = Number(action.args?.count);
            await showStep('build');
            if (Number.isInteger(index) && Number.isFinite(count)) await runFill(index, count);
            break;
          }
          case 'skip-count':
            await runSkipCount();
            break;
          case 'circle-group':
            await applyOp(action);
            await pause(LASSO_MS);
            break;
          case 'answer': {
            const v = Number(action.args?.value);
            await showStep('ask');
            if (Number.isFinite(v)) await enterAnswer(v);
            if (alive.current) await applyOp(action);
            break;
          }
        }
      } finally {
        setEntryHighlight(null);
        if (alive.current) {
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
    const i = Number(invite.args?.index);
    const valid = Number.isInteger(i) && i >= 0 && i < groups.length;
    switch (invite.op) {
      case 'add-group':
        return addSlot ? onBuild('add-group') : null;
      case 'fill-group': {
        if (read || !valid) return null;
        const count = Number(invite.args?.count);
        return onBuild(count < (groups[i] ?? 0) ? `take-${i}` : 'spot');
      }
      case 'circle-group':
        return valid ? { cue: `group-${i}` } : null;
      case 'skip-count':
        return groups.length > 0 ? { cue: 'group-0' } : null;
      case 'answer': {
        if (step === 'build') return { cue: 'next' };
        const v = Number(invite.args?.value);
        return Number.isFinite(v) ? { cue: 'entry-value', value: v } : { cue: 'entry' };
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

  /** The picture: a tap speaks the sprite or the container under the finger. */
  const onPictureTap = (e: MouseEvent) => {
    if (!interactive) return;
    const id = (e.target as Element).closest<HTMLElement>('[data-eg-tap]')?.dataset.egTap;
    if (!id) return;
    trace('tap', id);
    speak(id.startsWith('sprite-') ? spriteKey : containerKey(kind));
  };

  /** What a screen reader hears for a container: its kind, its place and how many it holds. */
  const groupLabel = (i: number) =>
    t('ui.widget.eg.count.group', { name: t(containerKey(kind)), i: i + 1, n: groups[i] ?? 0 });
  /** The picture in words: every count a sighted child can see. */
  const pictureLabel = [t('ui.widget.picture'), ...groups.map((_, i) => groupLabel(i))].join('. ');

  const renderGroup = (i: number, layout: Layout, live: boolean) => {
    const s = layout.s;
    const n = groups[i] ?? 0;
    const id = `group-${i}`;
    const { zone, chrome } = layout;
    const zoneX = (layout.box.w - zone.w) / 2;
    const zoneY = chrome.top + (layout.box.h - chrome.top - chrome.bottom - zone.h) / 2;
    const counted = skip !== null && i <= skip.upTo && n > 0;
    /**
     * The handle's hit area: a full target centred on the last sprite, kept inside the container.
     * It is no wider than a target, so a drag that starts at its edge still carries the sprite to
     * within the snap radius of where the finger lets go.
     */
    const hitStyle = (
      p: { x: number; y: number },
      held: { dx: number; dy: number },
    ): CSSProperties => {
      const side = parts.target;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const left = clamp(p.x + s / 2 - side / 2, -zoneX, layout.box.w - zoneX - side);
      const top = clamp(p.y + s / 2 - side / 2, -zoneY, layout.box.h - zoneY - side);
      // The area stays where it is while the pressed sprite is drawn under the finger.
      return { left: left - p.x - held.dx, top: top - p.y - held.dy, width: side, height: side };
    };
    // The last sprite is the one that is picked up, through a full target round it. While
    // another sprite is held the handle is out of the way: the container takes the tap.
    const lastId = `sprite-${i}-${n - 1}`;
    const handleOn = live && n > 0 && (dnd.selected === null || dnd.selected === lastId);
    const sprites: ReactNode[] = [];
    for (let j = 0; j < n; j += 1) {
      const spriteId = `sprite-${i}-${j}`;
      const p = zoneCell(j, s, zone.upright);
      const style: CSSProperties = { left: p.x, top: p.y, width: s, height: s };
      const art = <ObjectSprite sprite={config.sprite} />;
      if (j === n - 1 && handleOn) {
        const props = dnd.itemProps(spriteId, { label: spriteName });
        // While it is pressed the sprite is drawn under the finger (kit useGrabUnderFinger).
        const held = grab.offsetOf(spriteId);
        sprites.push(
          <span
            key={spriteId}
            {...props}
            className={cls(props.className, 'ni-egw__sprite')}
            data-eg-sprite={spriteId}
            data-cue={`take-${i}`}
            data-flash={flash.has(spriteId) ? 'true' : undefined}
            style={{ ...style, left: p.x + held.dx, top: p.y + held.dy }}
            onPointerDown={(e) => {
              if (interactive && !prefs.tapOnly) grab.start(spriteId, e);
              props.onPointerDown(e);
            }}
          >
            <span className="ni-egw__hit" style={hitStyle(p, held)} />
            {art}
          </span>,
        );
        continue;
      }
      sprites.push(
        <span
          key={spriteId}
          className="ni-egw__sprite"
          data-eg-sprite={spriteId}
          data-eg-tap={live ? undefined : spriteId}
          data-flash={flash.has(spriteId) ? 'true' : undefined}
          style={style}
        >
          {art}
        </span>,
      );
    }
    const art = <ContainerArt kind={kind} w={layout.box.w} h={layout.box.h} chrome={chrome} />;
    let pad: ReactNode;
    if (live) {
      const props = dnd.targetProps(id, { label: groupLabel(i) });
      const hadSelection = dnd.selected !== null;
      // An empty added container is taken away by touching it, with Enter or Space too: with
      // nothing held it is an enabled, focusable control.
      const removable = addable && n === 0 && !hadSelection && interactive;
      pad = (
        // biome-ignore lint/a11y/noStaticElementInteractions: targetProps gives role="button", tabIndex and the key handler
        <div
          {...props}
          {...(removable ? { tabIndex: 0, 'aria-disabled': undefined } : {})}
          className={cls(props.className, 'ni-egw__pad')}
          onClick={(e: MouseEvent) => {
            props.onClick(e);
            if (hadSelection || !interactive) return;
            childStep();
            onEmptyGroup(i);
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (removable && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              // One container for each press: a held key does not clear the row.
              if (e.repeat) return;
              childStep();
              onEmptyGroup(i);
              return;
            }
            props.onKeyDown(e);
          }}
        >
          {art}
        </div>
      );
    } else {
      pad = (
        <div className="ni-egw__pad" data-eg-tap={id}>
          {art}
        </div>
      );
    }
    return (
      <div
        key={id}
        className={cls(
          'ni-egw__group',
          (ringed(id) || (live && ringed(`take-${i}`))) && 'ni-invite',
          flash.has(id) && 'ni-egw__group--flash',
        )}
        style={{ width: layout.box.w, height: layout.box.h }}
        data-group={i}
        data-cue={id}
        data-counted={counted ? 'true' : undefined}
      >
        {pad}
        <div
          className="ni-egw__contents"
          style={{ left: zoneX, top: zoneY, width: zone.w, height: zone.h }}
        >
          {sprites}
        </div>
        {state.circled === i ? <LassoArt w={layout.box.w} h={layout.box.h} /> : null}
        {counted && skip ? (
          <span className="ni-number ni-egw__skip" aria-hidden="true">
            {skip.sums[i]}
          </span>
        ) : null}
      </div>
    );
  };

  const renderSlot = (slot: number, layout: Layout, live: boolean) => {
    if (slot < groups.length) return renderGroup(slot, layout, live);
    const style = { width: layout.box.w, height: layout.box.h };
    if (live && addSlot && slot === groups.length) {
      return (
        <div key={`slot-${slot}`} className="ni-egw__group ni-egw__ghost" style={style}>
          <ContainerArt kind={kind} w={layout.box.w} h={layout.box.h} ghost />
          <span className="ni-egw__addslot" data-cue="add-group">
            <IconButton
              label={addKey(kind)}
              icon={<AddIcon kind={kind} />}
              tone="cloud"
              caption={false}
              onPress={onAdd}
              disabled={!interactive}
              className={cls('ni-egw__add', ringed('add-group') && 'ni-invite')}
              data={{ 'data-add': 'true' }}
            />
          </span>
        </div>
      );
    }
    // A place a container can still be added to: a dashed outline, so the row shows its room.
    return (
      <div key={`slot-${slot}`} className="ni-egw__group ni-egw__ghost" style={style}>
        <ContainerArt kind={kind} w={layout.box.w} h={layout.box.h} ghost />
      </div>
    );
  };

  const renderGroups = (layout: Layout, live: boolean) => {
    let slot = 0;
    return (
      <div className="ni-egw__rows" style={{ gap: GROUP_GAP }}>
        {layout.rows.map((count, r) => {
          const cells: ReactNode[] = [];
          for (let k = 0; k < count; k += 1) cells.push(renderSlot(slot++, layout, live));
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            <div key={r} className="ni-egw__row" style={{ gap: GROUP_GAP }}>
              {cells}
            </div>
          );
        })}
      </div>
    );
  };

  /** The build step: the task line, the supply and the containers, every control live. */
  const renderBuild = (layout: Layout) => {
    const s = layout.s;
    const remaining = left(state);
    const spotProps = remaining > 0 ? dnd.itemProps('supply', { label: spriteName }) : null;
    const pileCount = bucket ? 0 : Math.max(0, remaining - 1);
    const pileItems: ReactNode[] = [];
    for (let k = 0; k < pileCount; k += 1) {
      const p = fivesCell(k, Math.max(1, layout.pile.cols), s);
      pileItems.push(
        <span
          key={k}
          // A countable picture: the demonstration hand never covers it (kit glyph rule).
          className="ni-egw__sprite ni-invite-glyph"
          style={{ left: p.x, top: p.y, width: s, height: s }}
        >
          <ObjectSprite sprite={config.sprite} />
        </span>,
      );
    }
    const supplyProps = dnd.targetProps('supply', { label: t('ui.widget.eg.supply') });
    const hadSelection = dnd.selected !== null;
    const supply = (
      // biome-ignore lint/a11y/useSemanticElements: the region lays out its drop target behind its items; a fieldset brings its own box model
      <div
        className="ni-egw__supply"
        data-kind={bucket ? 'bucket' : 'pile'}
        data-shape={layout.supply.shape}
        role="group"
        aria-label={t('ui.widget.eg.region.supply')}
        style={{ width: layout.supply.w, height: layout.supply.h }}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: targetProps gives role="button", tabIndex and the key handler */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: targetProps' onKeyDown is spread above */}
        <div
          {...supplyProps}
          className={cls(supplyProps.className, 'ni-egw__supplypad')}
          onClick={(e: MouseEvent) => {
            supplyProps.onClick(e);
            if (hadSelection || !interactive) return;
            childStep();
            onSupplyTap();
          }}
        />
        <span
          className={cls('ni-egw__spot', ringed('spot') && 'ni-invite')}
          data-cue="spot"
          data-kind={bucket ? 'bucket' : 'pile'}
          data-empty={remaining === 0 ? 'true' : undefined}
          style={{ width: layout.spot.w, height: layout.spot.h }}
        >
          {bucket ? <BucketArt /> : null}
          {spotProps ? (
            <span
              {...spotProps}
              className={cls(spotProps.className, 'ni-egw__grab')}
              style={{ '--s': `${s}px` } as CSSProperties}
            >
              <span className="ni-egw__grab-sprite">
                <ObjectSprite sprite={config.sprite} />
              </span>
            </span>
          ) : null}
        </span>
        {layout.pile.w > 0 ? (
          <span
            className="ni-egw__pile"
            aria-hidden="true"
            style={{ width: layout.pile.w, height: layout.pile.h }}
          >
            {pileItems}
          </span>
        ) : null}
      </div>
    );
    return (
      <div className="ni-egw__main" data-flow={layout.flow}>
        <div className="ni-egw__top" style={{ height: layout.top }}>
          {task ? (
            <p className="ni-egw__task">
              {/* The line reads as one sentence; its picture parts are hidden from it. */}
              <span className="ni-visually-hidden">{t(task.key, { n: task.n })}</span>
              <span className="ni-egw__tasknum" aria-hidden="true">
                {task.n}
              </span>
              <span className="ni-egw__taskicon" aria-hidden="true">
                {config.unknown === 'size' ? (
                  <ObjectSprite sprite={config.sprite} />
                ) : (
                  <TaskIcon kind={kind} sprite={config.sprite} />
                )}
              </span>
              {prefs.textLabels ? (
                <span className="ni-egw__taskword" aria-hidden="true">
                  {t(task.word)}
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="ni-egw__note" role="status">
            {note ? t(note.key) : ''}
          </p>
        </div>
        <div className="ni-egw__parts" style={{ gap: ROW_GAP }}>
          {layout.flow === 'row' ? supply : null}
          {renderGroups(layout, true)}
          {layout.flow === 'stack' ? supply : null}
        </div>
        {/* The demonstration hand's room: as tall as the top line, so the row stays centred. */}
        <div className="ni-egw__handstrip" aria-hidden="true" style={{ height: layout.top }} />
      </div>
    );
  };

  /** The ask step's picture: the containers as they are. Nothing to operate. */
  const renderPicture = (layout: Layout) => (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-hear is a pointer extra; the picture is one image to assistive tech
    <div
      className="ni-egw__main ni-egw__picture"
      role="img"
      aria-label={pictureLabel}
      onClick={onPictureTap}
    >
      {renderGroups(layout, false)}
    </div>
  );

  const actions = (
    <StepActions
      actRef={actRef}
      step={step}
      back={!read}
      dir={step === 'ask' && askPlan.act === 'row' ? 'row' : 'column'}
      interactive={interactive}
      ready={value !== null}
      onStep={steps.goTo}
      onCheck={submit}
      invited={stepCue as StepCue | null}
      compact={box.h < COMPACT_ROOM_H}
    />
  );

  const answer =
    askPlan.entry || askPlan.stepper ? (
      <span data-cue="entry" className={cls('ni-egw__entry', ringed('entry') && 'ni-invite')}>
        <AskEntry
          plan={askPlan}
          max={answerMax}
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
    ) : null;

  return (
    <div
      ref={rootRef}
      className="ni-egw"
      data-mode={config.mode}
      data-tier={tier}
      data-step={step}
      data-disabled={disabled ? 'true' : undefined}
      data-fits={(step === 'build' ? buildLayout.fits : askPlan.fits) ? undefined : 'false'}
      style={handRootStyle}
    >
      {step === 'build' ? (
        <div className="ni-egw__build">
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

export default EqualGroupsWidget;
