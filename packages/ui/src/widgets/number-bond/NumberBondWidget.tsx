import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { BigButton } from '../../primitives/BigButton';
import { ArrowIcon, BackIcon } from '../../primitives/icons';
import { MIN_TARGET_PX, TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  NumberEntry,
  nextPadKey,
  ObjectSprite,
  type PadKey,
  type Size,
  spriteNameKey,
  useAlive,
  useCommitBarrier,
  useDemoPause,
  useFlight,
  useInviteHand,
  useSubmitGuard,
  useWidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  asksNumber,
  blanks,
  capacityOf,
  counterId,
  entryMax,
  fillResponse,
  given,
  homes,
  isSlot,
  missingSlot,
  movesToSplit,
  poolColumns,
  type Slot,
  splitResponse,
} from './bond';
import { BOND_PAD, BOND_W, bondSize, circleFont, FOUND_C, miniC, planBond, poolsBox } from './plan';
import './number-bond.css';

/**
 * `number-bond` (03 §5.5): a whole joined to two parts; the whole is always the sum of the parts.
 *
 * - **Pictorial:** the bond with blanks. Tap a blank (the first empty one is active) and pick its
 *   number on the numeral tray (0 … whole) or type it on the pad.
 * - **Concrete:** counters in three pools. Drag counters from pool to pool (tap-to-place and
 *   keyboard through `useDragToTarget`); tap a moved counter to send it home. For missing-whole the
 *   counters start in the two parts and go up into the whole. Split and new-way answer with the
 *   parts' counts; missing-part and missing-whole ask for the number.
 * - **new-way:** the splits already found are listed as small bonds.
 *
 * Layout follows the measured room (plan.ts): everything at once where it fits, else the bond with
 * Next and then the answer step (Back, Check). A tapped blank goes to the answer step. The active
 * blank has an ink ring and a caret (not the teal invite ring). One invite at a time.
 *
 * Demo ops (03 §5.5): `split-counters {left, right}`, `fill {slot, value}`, `highlight {slot}`,
 * plus `answer`. Responses come from the engine model.
 */

const OPS = ['split-counters', 'fill', 'highlight', 'answer'] as const;

type Config = ConfigFor<'number-bond'>;
type ItemId = `counter-${number}`;
type Step = 'bond' | 'ask';
type Cue = { at: 'cue'; cue: string } | { at: 'card'; value: number } | { at: 'key'; key: PadKey };

const counterIndex = (s: string) => Number(s.slice('counter-'.length));
const SLOTS: readonly Slot[] = ['whole', 'part-0', 'part-1'];

export function NumberBondWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { speakOnTap, ageMode } = useUiPreferences();
  const { say, sayNumber } = useSpeech();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const committed = useCommitBarrier();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { fly, layer } = useFlight(rootRef);
  const room = useWidgetRoom(rootRef);

  const concrete = tier === 'concrete';
  const asks = asksNumber(config);
  const blankSlots = useMemo(() => blanks(config), [config]);
  const home = useMemo(() => homes(config), [config]);
  const askSlot = missingSlot(config);
  /** Concrete numbers answer only the asked slot; pictorial fills every blank. */
  const entrySlots: Slot[] = concrete ? (asks ? [askSlot] : []) : blankSlots;
  const max = entryMax(config);

  const [values, setValuesState] = useState<Partial<Record<Slot, number | null>>>({});
  const valuesRef = useRef(values);
  const setValues = (v: Partial<Record<Slot, number | null>>) => {
    valuesRef.current = v;
    setValuesState(v);
  };
  const [active, setActive] = useState<Slot | null>(entrySlots[0] ?? null);
  const [where, setWhereState] = useState<Slot[]>(home);
  const whereRef = useRef(where);
  const setWhere = (w: Slot[]) => {
    whereRef.current = w;
    setWhereState(w);
  };
  const [step, setStep] = useState<Step>('bond');
  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [entryHighlight, setEntryHighlight] = useState<number | PadKey | null>(null);
  const [flying, setFlying] = useState<number | null>(null);

  const interactive = !disabled && !demoBusy;
  const counterName = t(spriteNameKey('counter'));
  const slotName = (slot: Slot) =>
    slot === 'whole'
      ? t('ui.widget.bond.whole')
      : t('ui.widget.bond.part', { n: slot === 'part-0' ? 1 : 2 });
  const countIn = (slot: Slot, w: readonly Slot[] = where) => w.filter((s) => s === slot).length;
  const complete = entrySlots.every((s) => values[s] !== null && values[s] !== undefined);
  const entrySlot = active && entrySlots.includes(active) ? active : (entrySlots[0] ?? null);
  const target = MIN_TARGET_PX[ageMode];

  // ---------- layout (plan.ts) ----------

  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const [button, setButton] = useState<Size>(() => ({
    w: TARGET_PX[ageMode].big * 1.5,
    h: TARGET_PX[ageMode].big,
  }));
  useLayoutEffect(() => {
    const btn = actRef.current?.querySelector<HTMLElement>('.ni-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    // Measured as drawn: undo the zoom the parts are drawn at (the plan works in design px).
    const z = zoomRef.current;
    const next = { w: Math.ceil(r.width / z), h: Math.ceil(r.height / z) + 6 };
    setButton((b) => (b.w === next.w && b.h === next.h ? b : next));
  });
  const found = config.mode === 'new-way' ? (config.found ?? []) : [];
  const shown = SLOTS.map((s) => given(config, s) ?? 0);
  const biggest = Math.max(max, ...shown, ...found.flat());
  const input = useMemo(
    () => ({
      ageMode,
      concrete,
      blank: concrete && asks ? askSlot : null,
      caps: [
        capacityOf(config, 'whole'),
        capacityOf(config, 'part-0'),
        capacityOf(config, 'part-1'),
      ] as [number, number, number],
      found: found.length,
      biggest,
      askMax: entrySlots.length > 0 ? max : null,
      button,
    }),
    [
      ageMode,
      concrete,
      asks,
      askSlot,
      config,
      found.length,
      biggest,
      entrySlots.length,
      max,
      button,
    ],
  );
  const plan = useMemo(
    () =>
      planBond(input, {
        w: room?.width ?? Number.POSITIVE_INFINITY,
        h: room?.height ?? Number.POSITIVE_INFINITY,
      }),
    [input, room],
  );
  const steps = plan.steps;
  const shownStep: Step = steps ? step : 'bond';
  const layout = shownStep === 'ask' && plan.ask ? plan.ask.arrangement : plan.arrangement;
  /** Every part drawn this much larger where the area has room (targets only ever grow). */
  const zoom = shownStep === 'ask' ? plan.askZoom : plan.zoom;
  zoomRef.current = zoom;
  const entryLayout = shownStep === 'ask' ? (plan.ask?.entry ?? null) : plan.entry;

  // ---------- input ----------

  const enter = (v: number | null) => {
    if (!entrySlot) return;
    const next = { ...valuesRef.current, [entrySlot]: v };
    setValues(next);
    setInvite(null);
    // A filled blank hands over to the next empty one (split: two blanks).
    // A tray pick is complete at once; on the pad, once it has the digits the answer can have.
    const complete =
      entryLayout?.kind === 'tray' || (v !== null && String(v).length >= String(max).length);
    if (v !== null && entrySlots.length > 1 && complete) {
      const after = entrySlots.find((s) => s !== entrySlot && (next[s] ?? null) === null);
      if (after) setActive(after);
    }
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || !complete) return false;
    const r =
      concrete && !asks
        ? splitResponse(config, whereRef.current)
        : fillResponse(config, valuesRef.current);
    if (!r) return false;
    onResponse(r);
    return true;
  });

  /** 06 §5: a split speaks the part's count; when the number is asked, the counter's name. */
  const speakMove = (to: Slot, w: readonly Slot[]) => {
    if (!speakOnTap) return;
    if (asks) say(spriteNameKey('counter'));
    else sayNumber(countIn(to, w));
  };

  const dnd = useDragToTarget<ItemId, Slot>({
    disabled: !interactive || !concrete,
    trace,
    canPlace: (item, target) => {
      const now = whereRef.current[counterIndex(item)];
      if (now === target) return false;
      // Missing-whole: the parts' counters join in the whole (they never swap parts).
      return config.mode === 'missing-whole' ? target === 'whole' : true;
    },
    onSelect: (item) => {
      if (item && speakOnTap) say(spriteNameKey('counter'));
    },
    onPlace: ({ item, target }) => {
      const next = [...whereRef.current];
      next[counterIndex(item)] = target;
      setInvite(null);
      setWhere(next);
      speakMove(target, next);
    },
  });

  const sendHome = (id: number) => {
    if (!interactive) return;
    trace('undo', counterId(id));
    const next = [...whereRef.current];
    next[id] = home[id] ?? 'whole';
    setInvite(null);
    setWhere(next);
    speakMove(next[id] as Slot, next);
  };

  // ---------- steps: Next/Back (and a tapped blank) hand focus on ----------

  const refocus = useRef<string | null>(null);
  const goTo = (s: Step, via: string) => {
    if (!interactive) return;
    trace('tap', via);
    const focused = document.activeElement?.closest('[data-cue]');
    refocus.current = focused ? (s === 'ask' ? 'back' : (entrySlot ?? 'next')) : null;
    setStep(s);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step's controls swap
  useLayoutEffect(() => {
    const want = refocus.current;
    refocus.current = null;
    if (!want) return;
    const el = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-cue]') ?? [])].find(
      (e) => e.dataset.cue === want || e.dataset.cue === `slot:${want}`,
    );
    (el?.matches('button') ? el : el?.querySelector<HTMLElement>('button'))?.focus();
  }, [shownStep]);

  const tapSlot = (slot: Slot) => {
    if (!interactive) return;
    const known = given(config, slot);
    if (known !== null) {
      trace('tap', slot);
      if (speakOnTap) sayNumber(known);
      return;
    }
    setActive(slot);
    const typed = valuesRef.current[slot] ?? null;
    if (typed !== null && speakOnTap) sayNumber(typed);
    if (steps) goTo('ask', `blank-${slot}`);
    else trace('tap', `blank-${slot}`);
  };

  // ---------- demo mode (03 §6.3) ----------

  const poolRect = (slot: Slot) =>
    [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-pool]') ?? [])]
      .find((e) => e.dataset.pool === slot)
      ?.getBoundingClientRect() ?? null;
  const counterRect = (id: number) =>
    [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-counter]') ?? [])]
      .find((e) => e.dataset.counter === String(id))
      ?.getBoundingClientRect() ?? null;

  const toStep = async (s: Step) => {
    if (steps && step !== s) {
      setStep(s);
      await committed();
    }
  };

  const moveCounters = async (moves: { id: number; to: Slot }[]) => {
    await toStep('bond');
    for (const m of moves) {
      const next = [...whereRef.current];
      next[m.id] = m.to;
      setFlying(m.id);
      await fly(counterRect(m.id), poolRect(m.to), <ObjectSprite sprite="counter" />);
      if (!alive.current) return;
      setFlying(null);
      setWhere(next);
      await pause(120);
    }
  };

  const showValue = async (slot: Slot, v: number) => {
    setActive(slot);
    await toStep('ask');
    const kind = entryLayout?.kind ?? plan.ask?.entry.kind;
    if (kind === 'pad') {
      let typed = valuesRef.current[slot] ?? null;
      for (let guard = 0; guard < 6; guard++) {
        const key = nextPadKey(v, typed);
        if (!key) break;
        setEntryHighlight(key);
        await pause(400);
        if (!alive.current) return;
        const text = typed === null ? '' : String(typed);
        const nextText = key === 'back' ? text.slice(0, -1) : text + key;
        typed = nextText === '' ? null : Number(nextText);
        setValues({ ...valuesRef.current, [slot]: typed });
      }
    } else {
      setEntryHighlight(v);
      await pause(600);
      if (!alive.current) return;
      setValues({ ...valuesRef.current, [slot]: v });
    }
    setEntryHighlight(null);
    await pause(200);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        const slot = isSlot(action.args?.slot) ? action.args.slot : null;
        const value = Number(action.args?.value);
        switch (action.op) {
          case 'split-counters': {
            const left = Number(action.args?.left);
            const right = Number(action.args?.right);
            if (!Number.isFinite(left) || !Number.isFinite(right)) break;
            if (concrete) {
              await moveCounters(
                movesToSplit(whereRef.current, { 'part-0': left, 'part-1': right }),
              );
            } else {
              await showValue('part-0', left);
              if (alive.current) await showValue('part-1', right);
            }
            break;
          }
          case 'fill':
            if (!slot || !Number.isFinite(value)) break;
            if (concrete && !asks && slot !== 'whole') {
              await moveCounters(movesToSplit(whereRef.current, { [slot]: value }));
            } else if (entrySlots.includes(slot)) {
              await showValue(slot, value);
            }
            break;
          case 'highlight':
            await toStep('bond');
            setHighlight(slot ?? 'whole');
            await pause(1200);
            if (alive.current) setHighlight(null);
            break;
          case 'answer':
            if (Number.isFinite(value) && entrySlots.includes(askSlot)) {
              await showValue(askSlot, value);
            }
            break;
        }
      } finally {
        if (alive.current) {
          setFlying(null);
          setEntryHighlight(null);
          setDemoBusy(false);
        }
        await committed();
      }
    },
    invite: (action) => {
      setInvite(action);
      const slot = action?.args?.slot;
      if (isSlot(slot) && entrySlots.includes(slot)) setActive(slot);
      else if (action?.op === 'answer' && entrySlots.includes(askSlot)) setActive(askSlot);
    },
  });

  // ---------- the one invited control ----------

  const cue: Cue | null = (() => {
    if (!invite || !interactive) return null;
    const slotArg = isSlot(invite.args?.slot) ? invite.args.slot : null;
    /** Enter `v` in `slot`: the blank first where it is not the active one or is behind Next. */
    const valueCue = (slot: Slot, v: number): Cue | null => {
      if (!entrySlots.includes(slot)) return null;
      if (values[slot] === v) {
        return complete ? { at: 'cue', cue: 'check' } : null;
      }
      if (shownStep === 'bond' && (steps || entrySlot !== slot)) {
        return { at: 'cue', cue: `slot:${slot}` };
      }
      if (entrySlot !== slot) return null;
      if (entryLayout?.kind === 'pad') {
        const key = nextPadKey(v, values[slot] ?? null);
        return key ? { at: 'key', key } : null;
      }
      return { at: 'card', value: v };
    };
    switch (invite.op) {
      case 'split-counters': {
        if (concrete) {
          if (shownStep === 'ask') return { at: 'cue', cue: 'back' };
          const left = Number(invite.args?.left);
          const right = Number(invite.args?.right);
          const want: Slot | null =
            countIn('part-0') < left ? 'part-0' : countIn('part-1') < right ? 'part-1' : null;
          if (!want) return complete ? { at: 'cue', cue: 'check' } : null;
          // The last counter still in the whole goes next.
          const id = where.reduce<number>((at, s, i) => (s === 'whole' ? i : at), -1);
          return id >= 0 ? { at: 'cue', cue: `counter:${id}` } : null;
        }
        const left = Number(invite.args?.left);
        return Number.isFinite(left) ? valueCue('part-0', left) : null;
      }
      case 'fill': {
        const v = Number(invite.args?.value);
        return slotArg && Number.isFinite(v) ? valueCue(slotArg, v) : null;
      }
      case 'answer': {
        const v = Number(invite.args?.value);
        return Number.isFinite(v) ? valueCue(askSlot, v) : null;
      }
      default:
        return null;
    }
  })();
  const cueOf = (c: string) => (cue?.at === 'cue' && cue.cue === c ? 'ni-invite' : '');
  const cueKey = cue
    ? `${cue.at}:${cue.at === 'cue' ? cue.cue : cue.at === 'card' ? cue.value : cue.key}|${shownStep}|${layout}`
    : '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => {
      if (!cue) return null;
      if (cue.at === 'card') {
        const v = `opt-${cue.value}`;
        return (
          [...root.querySelectorAll<HTMLElement>('.ni-pick')].find((e) => e.dataset.id === v) ??
          null
        );
      }
      if (cue.at === 'key') {
        return (
          [...root.querySelectorAll<HTMLElement>('.ni-pad__key')].find(
            (e) => e.dataset.key === cue.key,
          ) ?? null
        );
      }
      const el = [...root.querySelectorAll<HTMLElement>('[data-cue]')].find(
        (e) => e.dataset.cue === cue.cue,
      );
      return el?.querySelector<HTMLElement>('.ni-btn') ?? el ?? null;
    },
    cueKey,
  );

  // ---------- render: the pictorial bond ----------

  const c = plan.c;
  const renderBond = (cpx: number, interactiveBond: boolean, mini = false, spread = BOND_W) => {
    const box = bondSize(cpx, spread);
    const font = circleFont(cpx, biggest);
    const centre = {
      whole: { x: box.w / 2, y: BOND_PAD + cpx / 2 },
      'part-0': { x: BOND_PAD + cpx / 2, y: box.h - BOND_PAD - cpx / 2 },
      'part-1': { x: box.w - BOND_PAD - cpx / 2, y: box.h - BOND_PAD - cpx / 2 },
    } as const;
    return (
      <div
        className="ni-bondw__bond"
        data-mini={mini ? 'true' : undefined}
        {...(interactiveBond
          ? { role: 'group', 'aria-label': t('ui.widget.picture') }
          : { role: 'img', 'aria-label': t('ui.widget.picture') })}
        style={{ width: box.w, height: box.h, '--bond-font': `${font}px` } as CSSProperties}
      >
        <svg
          className="ni-bondw__legs"
          viewBox={`0 0 ${box.w} ${box.h}`}
          aria-hidden="true"
          focusable="false"
        >
          <line
            x1={centre.whole.x}
            y1={centre.whole.y}
            x2={centre['part-0'].x}
            y2={centre['part-0'].y}
          />
          <line
            x1={centre.whole.x}
            y1={centre.whole.y}
            x2={centre['part-1'].x}
            y2={centre['part-1'].y}
          />
        </svg>
        {SLOTS.map((slot) => {
          const known = given(config, slot);
          const typed = values[slot] ?? null;
          const isBlank = known === null;
          const isActive = isBlank && entrySlot === slot && entrySlots.length > 0 && !disabled;
          const v = isBlank ? typed : known;
          const style = {
            width: cpx,
            height: cpx,
            left: centre[slot].x - cpx / 2,
            top: centre[slot].y - cpx / 2,
          };
          const common = {
            className: [
              'ni-bondw__circle',
              interactiveBond ? cueOf(`slot:${slot}`) : '',
              highlight === slot ? 'ni-bondw__lit' : '',
            ]
              .filter(Boolean)
              .join(' '),
            'data-slot': slot,
            'data-blank': isBlank ? 'true' : undefined,
            'data-empty': isBlank && typed === null ? 'true' : undefined,
            'data-state': isActive ? 'active' : undefined,
            style,
          };
          const face = (
            <span className="ni-bondw__num" aria-hidden="true">
              {v === null ? '' : String(v)}
            </span>
          );
          if (!interactiveBond) {
            return (
              <span key={slot} {...common}>
                {face}
              </span>
            );
          }
          return (
            <button
              key={slot}
              type="button"
              {...common}
              data-cue={`slot:${slot}`}
              aria-current={isActive ? 'true' : undefined}
              aria-label={`${slotName(slot)}: ${v ?? ''}`.trim()}
              disabled={!interactive}
              onClick={() => tapSlot(slot)}
            >
              {face}
              {isActive ? <span className="ni-bondw__caret" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    );
  };

  // ---------- render: the concrete bond (pools of counters) ----------

  const renderPools = () => {
    const box = poolsBox(input);
    const centre = (slot: Slot) => box.pools[slot].x + box.pools[slot].w / 2;
    const badgeOf = (slot: Slot) => {
      const known = given(config, slot);
      return asks
        ? slot === askSlot
          ? (values[slot] ?? null)
          : known
        : slot === 'whole'
          ? known
          : countIn(slot);
    };
    return (
      <fieldset
        className="ni-bondw__cbond"
        aria-label={t('ui.widget.picture')}
        style={{ width: box.size.w, height: box.size.h }}
      >
        <svg
          className="ni-bondw__legs"
          viewBox={`0 0 ${box.size.w} ${box.size.h}`}
          aria-hidden="true"
          focusable="false"
        >
          {(['part-0', 'part-1'] as const).map((p) => (
            <line
              key={p}
              x1={centre('whole')}
              y1={box.pools.whole.h}
              x2={centre(p)}
              y2={box.pools[p].y}
            />
          ))}
        </svg>
        {SLOTS.map((slot) => {
          const ids = where.flatMap((s, i) => (s === slot ? [i] : []));
          const targetProps = dnd.targetProps(slot, { label: slotName(slot) });
          const cap = slot === 'whole' ? input.caps[0] : Math.max(input.caps[1], input.caps[2]);
          const pool = box.pools[slot];
          return (
            <div
              key={slot}
              className={['ni-bondw__pool', highlight === slot ? 'ni-bondw__lit' : '']
                .filter(Boolean)
                .join(' ')}
              data-pool={slot}
              style={
                {
                  left: pool.x,
                  top: pool.y,
                  width: pool.w,
                  height: pool.h,
                  '--pool-cols': poolColumns(cap),
                } as CSSProperties
              }
            >
              <div {...targetProps} className={`${targetProps.className} ni-bondw__pad`} />
              <div className="ni-bondw__counters">
                {ids.map((id) => {
                  const atHome = home[id] === slot;
                  const common = {
                    'data-counter': id,
                    'data-cue': `counter:${id}`,
                    'data-flying': flying === id ? 'true' : undefined,
                  } as const;
                  if (atHome) {
                    const props = dnd.itemProps(counterId(id) as ItemId, {
                      label: `${counterName} ${id + 1}`,
                    });
                    return (
                      <div
                        key={id}
                        {...props}
                        {...common}
                        className={[props.className, 'ni-bondw__counter', cueOf(`counter:${id}`)]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <ObjectSprite sprite="counter" />
                      </div>
                    );
                  }
                  return (
                    <button
                      key={id}
                      type="button"
                      {...common}
                      className={['ni-bondw__counter', 'ni-bondw__moved', cueOf(`counter:${id}`)]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={`${counterName} ${id + 1}`}
                      disabled={!interactive}
                      onClick={() => sendHome(id)}
                    >
                      <ObjectSprite sprite="counter" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {SLOTS.map((slot) => {
          const v = badgeOf(slot);
          const b = box.badges[slot];
          const style = { left: b.x, top: b.y, width: b.w, height: b.h };
          if (asks && slot === askSlot) {
            // The asked number's blank: tapping it opens the answer (as a pictorial blank does).
            const isActive = entrySlot === slot && !disabled;
            return (
              <button
                key={slot}
                type="button"
                className={['ni-bondw__badge', cueOf(`slot:${slot}`)].filter(Boolean).join(' ')}
                data-slot={slot}
                data-blank="true"
                data-empty={v === null ? 'true' : undefined}
                data-state={isActive ? 'active' : undefined}
                data-cue={`slot:${slot}`}
                aria-label={`${slotName(slot)}: ${v ?? ''}`.trim()}
                disabled={!interactive}
                onClick={() => tapSlot(slot)}
                style={style}
              >
                {v === null ? '' : String(v)}
              </button>
            );
          }
          return (
            <span
              key={slot}
              className="ni-bondw__badge"
              data-slot={slot}
              data-empty={v === null ? 'true' : undefined}
              aria-hidden="true"
              style={style}
            >
              {v === null ? '' : String(v)}
            </span>
          );
        })}
      </fieldset>
    );
  };

  const foundBlock =
    found.length > 0 && shownStep === 'bond' ? (
      <section className="ni-bondw__found" aria-label={t('ui.widget.bond.found')}>
        {found.map(([a, b]) => (
          <span
            key={`${a}-${b}`}
            className="ni-bondw__mini-bond"
            role="img"
            aria-label={`${config.whole}: ${a}, ${b}`}
            style={{ '--bond-font': '32px' } as CSSProperties}
          >
            <MiniBond whole={config.whole ?? 0} parts={[a, b]} c={FOUND_C} />
          </span>
        ))}
      </section>
    ) : null;

  const entryBlock =
    entryLayout && entrySlots.length > 0 ? (
      <NumberEntry
        {...entryLayout}
        max={max}
        value={entrySlot ? (values[entrySlot] ?? null) : null}
        onChange={enter}
        disabled={!interactive}
        highlighted={
          entryHighlight ?? (cue?.at === 'card' ? cue.value : cue?.at === 'key' ? cue.key : null)
        }
        trace={trace}
        captureKeyboard={entryLayout.kind === 'pad'}
        onEnter={() => {
          if (!document.activeElement?.closest('[role="button"], button')) submit();
        }}
      />
    ) : null;

  const actions = (
    <div
      className="ni-bondw__act"
      ref={actRef}
      data-dir={shownStep === 'ask' && plan.ask ? plan.ask.act : 'row'}
    >
      {steps && shownStep === 'bond' && !(concrete && asks) ? (
        <span className="ni-bondw__btn" data-cue="next">
          <BigButton
            label="ui.btn.next"
            icon={<ArrowIcon />}
            tone="cloud"
            disabled={!interactive}
            onPress={() => goTo('ask', 'next')}
            className={cueOf('next') || undefined}
          />
        </span>
      ) : null}
      {steps && shownStep === 'ask' ? (
        <span className="ni-bondw__btn" data-cue="back">
          <BigButton
            label="ui.btn.close"
            icon={<BackIcon />}
            tone="cloud"
            disabled={!interactive}
            onPress={() => goTo('bond', 'back')}
            className={cueOf('back') || undefined}
          />
        </span>
      ) : null}
      {!steps || shownStep === 'ask' ? (
        <span className="ni-bondw__btn" data-cue="check">
          <CheckButton
            onPress={submit}
            disabled={!interactive || !complete}
            invited={cueOf('check') !== ''}
          />
        </span>
      ) : null}
    </div>
  );

  const main =
    shownStep === 'ask'
      ? plan.ask?.mini
        ? renderBond(miniC(biggest), false, true)
        : null
      : concrete
        ? renderPools()
        : renderBond(c, true, false, plan.spread);

  return (
    <div
      ref={rootRef}
      className="ni-bondw"
      data-tier={tier}
      data-mode={config.mode}
      data-layout={layout}
      data-step={steps ? shownStep : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={
        { '--bond-cell': `${target}px`, '--bond-zoom': zoom, ...handRootStyle } as CSSProperties
      }
    >
      {main ? <div className="ni-bondw__main">{main}</div> : null}
      <div className="ni-bondw__items">
        {foundBlock}
        {shownStep === 'ask' || !steps ? entryBlock : null}
        {actions}
      </div>
      {layer}
      {inviteHand}
    </div>
  );
}

/** A small static bond (the ways already found). Numerals stay 32 px. */
function MiniBond({ whole, parts, c }: { whole: number; parts: [number, number]; c: number }) {
  const box = bondSize(c);
  const pts = [
    { x: box.w / 2, y: BOND_PAD + c / 2, v: whole },
    { x: BOND_PAD + c / 2, y: box.h - BOND_PAD - c / 2, v: parts[0] },
    { x: box.w - BOND_PAD - c / 2, y: box.h - BOND_PAD - c / 2, v: parts[1] },
  ];
  return (
    <span className="ni-bondw__bond" data-mini="true" style={{ width: box.w, height: box.h }}>
      <svg className="ni-bondw__legs" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
        <line x1={pts[0]?.x} y1={pts[0]?.y} x2={pts[1]?.x} y2={pts[1]?.y} />
        <line x1={pts[0]?.x} y1={pts[0]?.y} x2={pts[2]?.x} y2={pts[2]?.y} />
      </svg>
      {pts.map((p, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: whole, then the two parts
          key={i}
          className="ni-bondw__circle"
          aria-hidden="true"
          style={{ width: c, height: c, left: p.x - c / 2, top: p.y - c / 2 }}
        >
          <span className="ni-bondw__num">{p.v}</span>
        </span>
      ))}
    </span>
  );
}

export default NumberBondWidget;
