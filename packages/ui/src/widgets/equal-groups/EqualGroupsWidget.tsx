import { type EqualGroupsState, formatModel, GROUP_CAPACITY } from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
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
import { IconButton } from '../../primitives/IconButton';
import { HandPointerIcon } from '../../primitives/icons';
import { TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  NumberPadKeys,
  ObjectSprite,
  type PadKey,
  padValue,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  AddIcon,
  AnswerIcon,
  BucketArt,
  ContainerArt,
  type ContainerKind,
  LassoArt,
  RodArt,
  TaskIcon,
} from './art';
import {
  CHROME,
  type Contents,
  contentSize,
  gridLayout,
  looseGrid,
  MIN_THING_PX,
  maxContents,
  pileFiveGap,
  pileGap,
  pileLayout,
  rodCell,
  rodSize,
  STRIP_COL_GAP,
  STRIP_ROW_GAP,
  splitCount,
  spriteGap,
} from './layout';
import './equal-groups.css';

/**
 * `equal-groups` (03 §5.5): containers (rafts, baskets, plates, nests) of sprites.
 *
 * - `build` (concrete): the child fills the containers from the supply by drag, tap-to-place or
 *   keyboard (`fill-group {index, count: current + 1}`), and can take a sprite back (count − 1) or
 *   move it to another container. When the number of groups is the unknown the child adds
 *   containers ("Add a raft", at most `maxGroups`). When the total is known the supply is a pile of
 *   exactly groups × perGroup sprites; when the total is the unknown it is a bottomless bucket (a
 *   finite pile would give the answer away). With `perGroup > 10` (MUL.11) the supply also hands
 *   out ten-rods (+10), and a container shows its tens as rods. The child types the unknown on the
 *   pad; Check sends `{ groups, value }` from the model. No count or total is shown anywhere.
 * - `read` (pictorial): the filled containers are one static picture ("Look at the picture"); the
 *   child types the unknown and Check sends a `number`.
 *
 * Tapping a sprite speaks its name; tapping a container speaks the container's name.
 *
 * Trace targets: `supply` (the pile or bucket, and the drop target for taking back), `supply-ten`
 * (the rod source), `group-<i>`, `sprite-<i>-<j>` (loose sprite j in container i), `rod-<i>-<j>`,
 * `add-group`, `answer` (the blank) and `key-<k>`.
 *
 * Demo ops (03 §5.5): `add-group`, `fill-group {index, count}` (sprites fly in one by one, rods by
 * tens), `skip-count` (each group lights up in turn while the running multiple is spoken),
 * `circle-group {index}` (a hand-drawn lasso), plus `answer {value}` (typed on the pad).
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

/** Digits the answer blank takes: always three, so its width never hints at the answer. */
const MAX_DIGITS = 3;
const GROUP_GAP = 16;
const SPRITE_MAX = { k: 96, 'g1-up': 80 } as const;
const SPRITE_MIN = MIN_THING_PX;

// Motion (03 §6.3): short, transform-only moves.
const FLY_MS = 420;
const FLY_FAST_MS = 200;
const POP_MS = 360;
const COUNT_MS = 850;
const LASSO_MS = 700;
const KEY_MS = 340;
const FLASH_MS = 900;
const EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

const containerKey = (c: ContainerKind): NarrationKey => `ui.widget.eg.container.${c}`;
const addKey = (c: ContainerKind): NarrationKey => `ui.widget.eg.add.${c}`;

const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

type Item = { where: 'supply'; amount: 1 | 10 } | { where: 'group'; group: number; amount: 1 | 10 };

function parseItem(id: string): Item | null {
  if (id === 'supply') return { where: 'supply', amount: 1 };
  if (id === 'supply-ten') return { where: 'supply', amount: 10 };
  const m = /^(sprite|rod)-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  return { where: 'group', group: Number(m[2]), amount: m[1] === 'rod' ? 10 : 1 };
}

const groupOf = (target: string): number | null => {
  const m = /^group-(\d+)$/.exec(target);
  return m ? Number(m[1]) : null;
};

/** The element's content box, kept in step with layout (ResizeObserver). */
function useBox(ref: RefObject<HTMLElement | null>, fallback: { w: number; h: number }) {
  const [box, setBox] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/** What one container has to be able to show, before the child's own counts. */
function baseCapacity(config: Config, rodsOffered: boolean): Contents {
  if (config.mode === 'read' || config.unknown !== 'size') {
    const c = splitCount(config.perGroup, rodsOffered);
    return c.rods === 0 && c.loose === 0 ? { rods: 0, loose: 1 } : c;
  }
  // The size is the unknown: the containers' shape must not give it away, so it comes from the
  // total (which the item states), never from perGroup.
  const total = config.groups * config.perGroup;
  return rodsOffered ? { rods: 5, loose: 9 } : { rods: 0, loose: Math.min(10, total) };
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
  const rodsOffered = config.perGroup > 10;
  const bucket = !read && config.unknown === 'total';
  const addable = !read && config.unknown === 'groups';
  const total = config.groups * config.perGroup;

  const [state, setState] = useState<State>(() => initial(config));
  const stateRef = useRef(state);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set());
  const [skip, setSkip] = useState<{ upTo: number; sums: number[] } | null>(null);
  const [text, setText] = useState('');
  const textRef = useRef(text);
  textRef.current = text;
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const pileRef = useRef<HTMLSpanElement | null>(null);
  const interactive = !disabled && !busy;

  // ---------- state through the model; resolve once the DOM shows it ----------

  const commitWaiters = useRef<(() => void)[]>([]);
  useLayoutEffect(() => {
    if (commitWaiters.current.length === 0) return;
    const waiters = commitWaiters.current;
    commitWaiters.current = [];
    for (const w of waiters) w();
  });

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

  /** Resolves once a render has committed (after a plain setState in a demo step). */
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

  // ---------- layout ----------

  const ageMode = prefs.ageMode;
  const px = TARGET_PX[ageMode];
  const area = useBox(areaRef, { w: 780, h: 440 });
  const pileBox = useBox(pileRef, { w: 300, h: 80 });

  const groups = state.groups;
  const slots = addable ? config.maxGroups : read ? config.groups : groups.length;
  const cap = groups.reduce(
    (c, n) => maxContents(c, splitCount(n, rodsOffered)),
    baseCapacity(config, rodsOffered),
  );
  const minBox = addable
    ? { w: px.icon + 48, h: px.icon + (prefs.textLabels ? 44 : 0) + 32 }
    : undefined;
  const grid = gridLayout({
    slots,
    cap,
    width: area.w,
    height: area.h,
    gap: GROUP_GAP,
    maxSprite: SPRITE_MAX[ageMode],
    minSprite: SPRITE_MIN,
    minBox,
  });
  const s = grid.s;
  const g = spriteGap(s);
  const m = rodCell(s);
  const rod = rodSize(m);
  const looseCols = looseGrid(cap.loose).cols;
  const capSize = contentSize(cap, s);
  const rodsW = cap.rods > 0 ? cap.rods * rod.w + (cap.rods - 1) * g : 0;

  const remaining = bucket ? Number.POSITIVE_INFINITY : Math.max(0, total - sum(groups));
  const spot = Math.round(px.min * 1.25);
  // The rod source lies down: ten countable cells (≥ 20 px) in a frame, with a margin.
  const rodSourceCell = Math.max(MIN_THING_PX, Math.floor((spot * 1.8 - 16 - rodSize(0).h) / 10));
  const rodSourceW = rodSize(rodSourceCell).h + 16;

  // The supply pile, at the containers' scale when it has room (never under 20 px).
  const pileFit = read || bucket ? null : pileLayout(remaining, pileBox.w, spot, s);
  const bottomH = Math.max(spot, pileFit?.h ?? 0) + 28;

  // What the child is told (03 §5.5), unless it is the answer: the total when the size is
  // asked; the size when the groups or the total are asked. Read pictures show it all.
  const task: { key: NarrationKey; word: NarrationKey; n: number } | null = read
    ? null
    : config.unknown === 'size'
      ? { key: 'ui.widget.eg.task.total', word: 'ui.widget.eg.word.total', n: total }
      : {
          key: `ui.widget.eg.task.each.${kind}`,
          word: `ui.widget.eg.word.each.${kind}`,
          n: config.perGroup,
        };

  // ---------- child input ----------

  const spriteName = t(spriteNameKey(config.sprite));
  const rodName = t('ui.widget.eg.rod');

  const fits = (group: number, amount: number) =>
    (stateRef.current.groups[group] ?? GROUP_CAPACITY) + amount <= GROUP_CAPACITY;

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive || read,
    trace,
    canPlace: (itemId, target) => {
      const item = parseItem(itemId);
      if (!item) return false;
      const to = groupOf(target);
      if (item.where === 'supply') return to !== null && fits(to, item.amount);
      if (target === 'supply') return true;
      return to !== null && to !== item.group && fits(to, item.amount);
    },
    onSelect: (itemId) => {
      const item = itemId ? parseItem(itemId) : null;
      if (!item || !prefs.speakOnTap) return;
      say(item.amount === 10 ? 'ui.widget.eg.rod' : spriteNameKey(config.sprite));
    },
    onPlace: ({ item: itemId, target }) => {
      const item = parseItem(itemId);
      if (!item) return;
      setInvite(null);
      const now = stateRef.current.groups;
      const to = groupOf(target);
      if (item.where === 'supply' && to !== null) {
        void applyOp({
          op: 'fill-group',
          args: { index: to, count: (now[to] ?? 0) + item.amount },
        });
      } else if (item.where === 'group') {
        const from = item.group;
        const left = Math.max(0, (now[from] ?? 0) - item.amount);
        const next = applyAction(stateRef.current, {
          op: 'fill-group',
          args: { index: from, count: left },
        });
        if (to === null) {
          stateRef.current = next;
          setState(next);
        } else {
          const moved = applyAction(next, {
            op: 'fill-group',
            args: { index: to, count: (next.groups[to] ?? 0) + item.amount },
          });
          stateRef.current = moved;
          setState(moved);
        }
      }
    },
  });

  const onAdd = () => {
    if (!interactive) return;
    trace('tap', 'add-group');
    setInvite(null);
    void applyOp({ op: 'add-group' });
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    setText((prev) => applyPadKey(prev, key, MAX_DIGITS));
  };

  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const v = padValue(textRef.current);
    if (v === null) return false;
    const response = model.toResponse(
      applyAction(stateRef.current, { op: 'answer', args: { value: v } }),
    );
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // Desktop Enter submits, except while a sprite or container has focus (Enter moves it there).
  const onEnter = () => {
    const el = document.activeElement;
    if (el?.closest('[data-place-item], [data-place-target]')) return;
    submit();
  };

  // ---------- demo ----------

  const q = (sel: string) => rootRef.current?.querySelector<HTMLElement>(sel) ?? null;
  const sourceEl = (amount: number) =>
    q(`[data-place-item="${amount === 10 ? 'supply-ten' : 'supply'}"]`) ??
    q('[data-place-item="supply"]') ??
    q('.ni-egw__supply');

  /** The element that shows container i's last unit (its last loose sprite, else its last rod). */
  const lastEl = (i: number, n: number) => {
    const c = splitCount(n, rodsOffered);
    if (c.loose > 0) return q(`[data-place-item="sprite-${i}-${c.loose - 1}"]`);
    if (c.rods > 0) return q(`[data-place-item="rod-${i}-${c.rods - 1}"]`);
    return null;
  };

  const animate = (el: HTMLElement, frames: Keyframe[], ms: number) => {
    el.style.zIndex = '3';
    const a = el.animate(frames, { duration: ms, easing: EASE });
    return a.finished
      .catch(() => undefined)
      .then(() => {
        el.style.zIndex = '';
      });
  };

  const runFill = async (index: number, target: number) => {
    const goal = Math.max(0, Math.min(GROUP_CAPACITY, Math.trunc(target)));
    const steps = Math.abs(goal - (stateRef.current.groups[index] ?? goal));
    const ms = steps > 6 ? FLY_FAST_MS : FLY_MS;
    for (let guard = 0; guard < 200; guard++) {
      if (!alive.current) return;
      const cur = stateRef.current.groups[index];
      if (cur === undefined || cur === goal) return;
      const amount = rodsOffered && Math.abs(goal - cur) >= 10 ? 10 : 1;
      const next = goal > cur ? cur + amount : cur - amount;
      const from = sourceEl(amount);
      const at = from ? centerOf(from.getBoundingClientRect()) : null;
      if (next < cur) {
        const el = lastEl(index, cur);
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
      const el = lastEl(index, next);
      if (reduced || !el || !at) {
        if (el?.dataset.placeItem) {
          flashOn([el.dataset.placeItem]);
          await committed();
        }
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

  const runAddGroup = async () => {
    const before = stateRef.current.groups.length;
    if (!(await applyOp({ op: 'add-group' }))) return;
    const el = q(`[data-place-target="group-${before}"]`)?.parentElement;
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

  const typeAnswer = async (value: number) => {
    const chars = String(value).split('') as PadKey[];
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
        switch (action.op) {
          case 'add-group':
            await runAddGroup();
            break;
          case 'fill-group': {
            const index = Number(action.args?.index);
            const count = Number(action.args?.count);
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
            if (Number.isFinite(v)) await typeAnswer(v);
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
    const i = Number(invite.args?.index);
    const group = Number.isInteger(i) && i >= 0 && i < groups.length ? `group-${i}` : null;
    switch (invite.op) {
      case 'add-group':
        return addable ? 'add-group' : null;
      case 'fill-group':
      case 'circle-group':
        return group;
      case 'skip-count':
        return groups.length > 0 ? 'group-0' : null;
      case 'answer':
        return 'answer';
      default:
        return null;
    }
  })();

  // ---------- render ----------

  const hand = (cls = '') => (
    <span className={`ni-hand ni-egw__hand ${cls}`.trim()}>
      <HandPointerIcon />
    </span>
  );

  /** Read mode: a tap on the picture speaks the sprite or container under the finger. */
  const onPictureTap = (e: MouseEvent) => {
    if (!interactive) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-eg-tap]');
    const id = el?.dataset.egTap;
    if (!id) return;
    trace('tap', id);
    if (!prefs.speakOnTap) return;
    if (id.startsWith('rod-')) say('ui.widget.eg.rod');
    else if (id.startsWith('sprite-')) say(spriteNameKey(config.sprite));
    else say(containerKey(kind));
  };

  const renderContents = (i: number, n: number) => {
    const c = splitCount(n, rodsOffered);
    const rods: ReactNode[] = [];
    for (let j = 0; j < c.rods; j++) {
      const id = `rod-${i}-${j}`;
      const art = <RodArt sprite={config.sprite} m={m} />;
      if (read) {
        rods.push(
          <span key={id} className="ni-egw__rod" data-eg-tap={id}>
            {art}
          </span>,
        );
      } else {
        const props = dnd.itemProps(id, { label: rodName });
        rods.push(
          <span
            key={id}
            {...props}
            className={`${props.className} ni-egw__rod`}
            data-flash={flash.has(id) ? 'true' : undefined}
          >
            {art}
          </span>,
        );
      }
    }
    const loose: ReactNode[] = [];
    for (let j = 0; j < c.loose; j++) {
      const id = `sprite-${i}-${j}`;
      const sprite = <ObjectSprite sprite={config.sprite} />;
      if (read) {
        loose.push(
          <span key={id} className="ni-egw__sprite" data-eg-tap={id}>
            {sprite}
          </span>,
        );
      } else {
        const props = dnd.itemProps(id, { label: spriteName });
        loose.push(
          <span
            key={id}
            {...props}
            className={`${props.className} ni-egw__sprite`}
            data-flash={flash.has(id) ? 'true' : undefined}
          >
            {sprite}
          </span>,
        );
      }
    }
    return (
      <div className="ni-egw__contents">
        <div className="ni-egw__packed" style={{ width: capSize.w, height: capSize.h }}>
          {cap.rods > 0 ? (
            <span className="ni-egw__rods" style={{ width: rodsW }}>
              {rods}
            </span>
          ) : null}
          {cap.loose > 0 ? (
            <span
              className="ni-egw__loose"
              style={{ gridTemplateColumns: `repeat(${looseCols}, ${s}px)` }}
            >
              {loose}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const renderGroup = (i: number) => {
    const n = groups[i] ?? 0;
    const id = `group-${i}`;
    const invited = inviteTarget === id;
    const counted = skip !== null && i <= skip.upTo && (groups[i] ?? 0) > 0;
    const art = <ContainerArt kind={kind} w={grid.box.w} h={grid.box.h} />;
    let pad: ReactNode;
    if (read) {
      pad = (
        <div className="ni-egw__pad" data-eg-tap={id}>
          {art}
        </div>
      );
    } else {
      const props = dnd.targetProps(id, { label: t(containerKey(kind)) });
      const hadSelection = dnd.selected !== null;
      pad = (
        // biome-ignore lint/a11y/noStaticElementInteractions: targetProps gives role="button", tabIndex and the key handler
        // biome-ignore lint/a11y/useKeyWithClickEvents: targetProps' onKeyDown (Enter/Space, arrows) is spread above
        <div
          {...props}
          className={`${props.className} ni-egw__pad`}
          onClick={(e) => {
            props.onClick(e);
            if (hadSelection || !interactive) return;
            trace('tap', id);
            if (prefs.speakOnTap) say(containerKey(kind));
          }}
        >
          {art}
        </div>
      );
    }
    return (
      <div
        key={id}
        className={[
          'ni-egw__group',
          invited ? 'ni-invite' : '',
          flash.has(id) ? 'ni-egw__group--flash' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ width: grid.box.w, height: grid.box.h }}
        data-counted={counted ? 'true' : undefined}
      >
        {pad}
        {renderContents(i, n)}
        {state.circled === i ? <LassoArt w={grid.box.w} h={grid.box.h} /> : null}
        {counted && skip ? (
          <span className="ni-number ni-egw__skip" aria-hidden="true">
            {skip.sums[i]}
          </span>
        ) : null}
        {invited ? hand() : null}
      </div>
    );
  };

  const renderSlot = (slot: number) => {
    if (slot < groups.length) return renderGroup(slot);
    const style = { width: grid.box.w, height: grid.box.h };
    if (addable && slot === groups.length) {
      const invited = inviteTarget === 'add-group';
      return (
        <div key={`slot-${slot}`} className="ni-egw__group ni-egw__ghost" style={style}>
          <ContainerArt kind={kind} w={grid.box.w} h={grid.box.h} ghost />
          <span className="ni-egw__addslot">
            <IconButton
              label={addKey(kind)}
              icon={<AddIcon kind={kind} />}
              tone="cloud"
              onPress={onAdd}
              disabled={!interactive}
              className={['ni-egw__add', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
              data={{ 'data-add': 'true' }}
            />
            {invited ? hand('ni-egw__hand--add') : null}
          </span>
        </div>
      );
    }
    return <div key={`slot-${slot}`} className="ni-egw__group ni-egw__empty" style={style} />;
  };

  let slot = 0;
  const rows = grid.rows.map((count, r) => {
    const cells: ReactNode[] = [];
    for (let k = 0; k < count; k++) cells.push(renderSlot(slot++));
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
      <div key={r} className="ni-egw__row">
        {cells}
      </div>
    );
  });

  const blank = (
    <span className="ni-egw__slot ni-egw__blankslot">
      <button
        type="button"
        className={['ni-number', 'ni-egw__blank', inviteTarget === 'answer' ? 'ni-invite' : '']
          .filter(Boolean)
          .join(' ')}
        data-size="lg"
        data-state={disabled ? 'idle' : 'active'}
        data-empty={text === '' ? 'true' : undefined}
        aria-label={`${t('ui.widget.answer')}: ${text}`.trim()}
        disabled={!interactive}
        onClick={() => trace('tap', 'answer')}
      >
        {text === '' ? <span className="ni-number__slot" /> : <span>{text}</span>}
        {!disabled ? <span className="ni-number__caret" /> : null}
      </button>
      {inviteTarget === 'answer' ? hand() : null}
    </span>
  );

  /** A region's label: a picture icon, plus the word in G1+ (the region carries the name). */
  const legend = (icon: ReactNode, label: NarrationKey) => (
    <span className="ni-egw__legend" aria-hidden="true">
      <span className="ni-egw__legendicon">{icon}</span>
      {prefs.textLabels ? <span className="ni-egw__legendtext">{t(label)}</span> : null}
    </span>
  );

  const answer = (
    // biome-ignore lint/a11y/useSemanticElements: a labelled region round one control; a fieldset would bring its own box model
    <div className="ni-egw__answer" role="group" aria-label={t('ui.widget.answer')}>
      {legend(<AnswerIcon />, 'ui.widget.answer')}
      {blank}
    </div>
  );

  const taskChip = task ? (
    <div className="ni-egw__taskrow">
      <button
        type="button"
        className="ni-egw__task"
        aria-label={t(task.key, { n: task.n })}
        disabled={!interactive}
        onClick={() => {
          trace('tap', 'task');
          if (prefs.speakOnTap) say(task.key, { n: task.n });
        }}
      >
        <span className="ni-egw__tasknum">{task.n}</span>
        <span className="ni-egw__taskicon" aria-hidden="true">
          {config.unknown === 'size' ? (
            <ObjectSprite sprite={config.sprite} />
          ) : (
            <TaskIcon kind={kind} sprite={config.sprite} />
          )}
        </span>
        {prefs.textLabels ? (
          <>
            {/* The visible text reads as the name does ("12 in all"). */}{' '}
            <span className="ni-egw__taskword">{t(task.word)}</span>
          </>
        ) : null}
      </button>
    </div>
  ) : null;

  const pile = (() => {
    if (!pileFit) return null;
    const p = pileFit;
    const columns: number[][] = [];
    p.strips.forEach((n, k) => {
      const col = Math.floor(k / p.perColumn);
      if (!columns[col]) columns[col] = [];
      columns[col].push(n);
    });
    return (
      <span className="ni-egw__pile" ref={pileRef} aria-hidden="true">
        <span className="ni-egw__pilecols" style={{ gap: STRIP_COL_GAP }}>
          {columns.map((col, ci) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
            <span key={ci} className="ni-egw__pilecol" style={{ gap: STRIP_ROW_GAP }}>
              {col.map((n, si) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: strips are positional
                  key={si}
                  className="ni-egw__strip"
                  data-rod={rodsOffered && n === 10 ? 'true' : undefined}
                  style={
                    {
                      gap: pileGap(p.s),
                      '--five-gap': `${pileFiveGap(p.s) - pileGap(p.s)}px`,
                    } as CSSProperties
                  }
                >
                  {Array.from({ length: n }, (_, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: pile sprites are positional
                    <span key={j} className="ni-egw__pilecell" style={{ width: p.s, height: p.s }}>
                      <ObjectSprite sprite={config.sprite} />
                    </span>
                  ))}
                </span>
              ))}
            </span>
          ))}
        </span>
      </span>
    );
  })();

  const source = (id: 'supply' | 'supply-ten') => {
    const ten = id === 'supply-ten';
    const empty = remaining < (ten ? 10 : 1);
    const props = dnd.itemProps(id, { label: ten ? rodName : spriteName, disabled: empty });
    const invited = inviteTarget === id;
    return (
      <span
        key={id}
        className="ni-egw__source"
        data-kind={ten ? 'rod' : bucket ? 'bucket' : 'pile'}
        style={{ width: ten ? rodSourceW : bucket ? Math.round(spot * 1.2) : spot, height: spot }}
      >
        <span className="ni-egw__spot" data-empty={empty ? 'true' : undefined}>
          {bucket && !ten ? <BucketArt /> : null}
        </span>
        <span
          {...props}
          className={[props.className, 'ni-egw__grab', invited ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-empty={empty ? 'true' : undefined}
        >
          {ten ? (
            <RodArt sprite={config.sprite} m={rodSourceCell} horizontal />
          ) : (
            <ObjectSprite sprite={config.sprite} />
          )}
        </span>
        {invited ? hand() : null}
      </span>
    );
  };

  const rootStyle = {
    '--s': `${s}px`,
    '--g': `${g}px`,
    '--m': `${m}px`,
    '--spot': `${spot}px`,
    '--bottom-h': `${bottomH}px`,
    '--chrome-x': `${CHROME.x}px`,
    '--chrome-top': `${CHROME.top}px`,
    '--chrome-bottom': `${CHROME.bottom}px`,
    '--group-gap': `${GROUP_GAP}px`,
  } as CSSProperties;

  const side = (
    <div className="ni-egw__side">
      <NumberPadKeys
        onKey={onKey}
        onEnter={onEnter}
        disabled={!interactive}
        highlighted={pressedKey}
      />
      <CheckButton onPress={submit} disabled={!interactive || padValue(text) === null} />
    </div>
  );

  if (read) {
    return (
      <div
        ref={rootRef}
        className="ni-egw"
        data-mode="read"
        data-tier={tier}
        data-disabled={disabled ? 'true' : undefined}
        style={rootStyle}
      >
        <div className="ni-egw__scene">
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-hear is a pointer extra; the picture is one image to assistive tech */}
          <div
            ref={areaRef}
            className="ni-egw__area ni-egw__picture"
            role="img"
            aria-label={t('ui.widget.picture')}
            data-fits={grid.fits ? undefined : 'false'}
            onClick={onPictureTap}
          >
            {rows}
          </div>
          <div className="ni-egw__answerrow">{answer}</div>
        </div>
        {side}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="ni-egw"
      data-mode="build"
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      style={rootStyle}
    >
      <div className="ni-egw__scene">
        {taskChip}
        <div ref={areaRef} className="ni-egw__area" data-fits={grid.fits ? undefined : 'false'}>
          {rows}
        </div>
        <div className="ni-egw__bottom">
          {/* biome-ignore lint/a11y/useSemanticElements: the region lays out its drop target behind its items; a fieldset brings its own box model */}
          <div
            className="ni-egw__supply"
            data-kind={bucket ? 'bucket' : 'pile'}
            role="group"
            aria-label={t('ui.widget.eg.region.supply')}
          >
            {(() => {
              const props = dnd.targetProps('supply', { label: t('ui.widget.eg.supply') });
              return <div {...props} className={`${props.className} ni-egw__supplypad`} />;
            })()}
            {legend(<ObjectSprite sprite={config.sprite} />, 'ui.widget.eg.region.supply')}
            {source('supply')}
            {rodsOffered ? source('supply-ten') : null}
            {pile}
          </div>
          {answer}
        </div>
      </div>
      {side}
    </div>
  );
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export default EqualGroupsWidget;
