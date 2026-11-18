import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, type ReactNode, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { HandPointerIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  NumberBondView,
  NumberEntry,
  ObjectSprite,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useFlight,
  useSubmitGuard,
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
import './number-bond.css';

/**
 * `number-bond` (03 §5.5): a whole joined to two parts.
 *
 * - **Pictorial:** the bond diagram with blanks. The child taps a blank (the first empty one is
 *   active) and picks its number on the numeral tray (0 … whole) or types it on the pad.
 * - **Concrete:** counters split across the bond. Drag counters from the whole into the parts
 *   (tap-to-place and keyboard through `useDragToTarget`); tap a moved counter to send it back.
 *   For missing-whole the counters start in the two parts and go up into the whole. Split and
 *   new-way answer with the parts' counts; missing-part and missing-whole ask for the number.
 * - **new-way:** the splits already found are listed as small bonds.
 *
 * Demo ops (03 §5.5): `split-counters {left, right}`, `fill {slot, value}`, `highlight {slot}`,
 * plus `answer`. Responses come from the engine model.
 */

const OPS = ['split-counters', 'fill', 'highlight', 'answer'] as const;

type Config = ConfigFor<'number-bond'>;
type ItemId = `counter-${number}`;

const counterIndex = (s: string) => Number(s.slice('counter-'.length));

export function NumberBondWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { speakOnTap } = useUiPreferences();
  const { say, sayNumber } = useSpeech();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { fly, layer } = useFlight(rootRef);

  const concrete = tier === 'concrete';
  const asks = asksNumber(config);
  const blankSlots = useMemo(() => blanks(config), [config]);
  const home = useMemo(() => homes(config), [config]);
  const askSlot = missingSlot(config);

  // Pictorial: typed values per blank. Concrete: where each counter is, and the asked number.
  const [values, setValuesState] = useState<Partial<Record<Slot, number | null>>>({});
  const valuesRef = useRef(values);
  const setValues = (v: Partial<Record<Slot, number | null>>) => {
    valuesRef.current = v;
    setValuesState(v);
  };
  const [active, setActive] = useState<Slot | null>(blankSlots[0] ?? null);
  const [where, setWhereState] = useState<Slot[]>(home);
  const whereRef = useRef(where);
  const setWhere = (w: Slot[]) => {
    whereRef.current = w;
    setWhereState(w);
  };
  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [entryHighlight, setEntryHighlight] = useState<number | null>(null);
  const [flying, setFlying] = useState<number | null>(null);

  const interactive = !disabled && !demoBusy;
  const counterName = t(spriteNameKey('counter'));
  const slotName = (slot: Slot) =>
    slot === 'whole'
      ? t('ui.widget.bond.whole')
      : t('ui.widget.bond.part', { n: slot === 'part-0' ? 1 : 2 });
  const countIn = (slot: Slot, w: readonly Slot[] = where) => w.filter((s) => s === slot).length;

  /** Concrete numbers answer only the asked slot; pictorial fills every blank. */
  const entrySlots: Slot[] = concrete ? (asks ? [askSlot] : []) : blankSlots;
  const complete = entrySlots.every((s) => values[s] !== null && values[s] !== undefined);
  const entrySlot = active && entrySlots.includes(active) ? active : (entrySlots[0] ?? null);

  const enter = (v: number | null) => {
    if (!entrySlot) return;
    const next = { ...valuesRef.current, [entrySlot]: v };
    setValues(next);
    setInvite(null);
    // A filled blank hands over to the next empty one (split: two blanks).
    if (
      v !== null &&
      entrySlots.length > 1 &&
      String(v).length >= String(entryMax(config)).length
    ) {
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
      const id = counterIndex(item);
      const now = whereRef.current[id];
      if (now === target) return false;
      // Missing-whole: the parts' counters join in the whole (they never swap parts).
      return config.mode === 'missing-whole' ? target === 'whole' : true;
    },
    onSelect: (item) => {
      if (item && speakOnTap) say(spriteNameKey('counter'));
    },
    onPlace: ({ item, target }) => {
      const id = counterIndex(item);
      const next = [...whereRef.current];
      next[id] = target;
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
    setWhere(next);
    speakMove(next[id] as Slot, next);
  };

  // ---------- demo mode (03 §6.3) ----------

  const rect = (selector: string) =>
    rootRef.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;

  const moveCounters = async (moves: { id: number; to: Slot }[]) => {
    for (const m of moves) {
      const from = rect(`[data-counter="${m.id}"]`);
      const next = [...whereRef.current];
      next[m.id] = m.to;
      const to = rect(`[data-pool="${m.to}"] .ni-bondw__pad`);
      setFlying(m.id);
      await fly(from, to, <ObjectSprite sprite="counter" />);
      if (!alive.current) return;
      setFlying(null);
      setWhere(next);
      await pause(120);
    }
  };

  const showValue = async (slot: Slot, v: number) => {
    setActive(slot);
    setEntryHighlight(v);
    await pause(600);
    if (!alive.current) return;
    setValues({ ...valuesRef.current, [slot]: v });
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
            setHighlight(slot ?? 'whole');
            await pause(1200);
            if (alive.current) setHighlight(null);
            break;
          case 'answer':
            if (Number.isFinite(value)) await showValue(askSlot, value);
            break;
        }
      } finally {
        setFlying(null);
        setEntryHighlight(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => {
      setInvite(action);
      const slot = action?.args?.slot;
      if (isSlot(slot) && entrySlots.includes(slot)) setActive(slot);
    },
  });

  const inviteTarget: string | null = (() => {
    if (!invite) return null;
    const slot = isSlot(invite.args?.slot) ? invite.args.slot : null;
    switch (invite.op) {
      case 'split-counters':
        return concrete ? (config.mode === 'missing-whole' ? 'part-0' : 'whole') : 'part-0';
      case 'fill':
      case 'highlight':
        return slot ?? 'whole';
      case 'answer':
        return 'entry';
      default:
        return 'whole';
    }
  })();
  const hand = (at: string) =>
    inviteTarget === at ? (
      <span className="ni-hand ni-bondw__hand" aria-hidden="true">
        <HandPointerIcon />
      </span>
    ) : null;
  const marked = (at: string) => inviteTarget === at || highlight === at;

  // ---------- pictorial: the bond diagram with blanks ----------

  const speakSlot = (slot: Slot, v: number) => {
    trace('tap', slot);
    if (speakOnTap) sayNumber(v);
  };

  const renderSlot = (id: string): ReactNode => {
    if (!isSlot(id)) return null;
    const known = given(config, id);
    const typed = values[id] ?? null;
    const isBlank = known === null;
    const isActive = isBlank && entrySlot === id && !disabled;
    const shown = isBlank ? typed : known;
    return (
      <span className="ni-bondw__slot">
        <button
          type="button"
          className={['ni-bond__circle', 'ni-bondw__circle', marked(id) ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-slot={id}
          data-empty={isBlank && typed === null ? 'true' : undefined}
          data-blank={isBlank ? 'true' : undefined}
          data-state={isActive ? 'active' : undefined}
          aria-current={isActive ? 'true' : undefined}
          aria-label={`${slotName(id)}: ${shown ?? ''}`.trim()}
          disabled={!interactive}
          onClick={() => {
            if (isBlank) {
              trace('tap', `blank-${id}`);
              setActive(id);
              if (typed !== null && speakOnTap) sayNumber(typed);
            } else if (known !== null) speakSlot(id, known);
          }}
        >
          {shown === null ? '' : String(shown)}
          {isActive ? <span className="ni-number__caret" /> : null}
        </button>
        {hand(id)}
      </span>
    );
  };

  // ---------- concrete: counters in three pools ----------

  const renderPool = (slot: Slot) => {
    // Both parts get the same size, so the bond stays balanced and its legs meet the pools.
    const cap = Math.max(
      1,
      slot === 'whole'
        ? capacityOf(config, 'whole')
        : Math.max(capacityOf(config, 'part-0'), capacityOf(config, 'part-1')),
    );
    const cols = poolColumns(cap);
    const rows = Math.ceil(cap / cols);
    const ids = where.flatMap((s, i) => (s === slot ? [i] : []));
    const known = given(config, slot);
    // The pool's numeral: the given number, the live count of a split, or the asked blank.
    const badge = asks
      ? slot === askSlot
        ? (values[slot] ?? null)
        : known
      : slot === 'whole'
        ? known
        : countIn(slot);
    const badgeBlank = asks && slot === askSlot;
    const target = dnd.targetProps(slot, { label: slotName(slot) });
    return (
      <div
        className={['ni-bondw__pool', marked(slot) ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        data-pool={slot}
        style={{ '--pool-cols': cols, '--pool-rows': rows } as CSSProperties}
      >
        <div {...target} className={`${target.className} ni-bondw__pad`} />
        <div className="ni-bondw__counters">
          {ids.map((id) => {
            const atHome = home[id] === slot;
            const common = {
              'data-counter': id,
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
                  className={`${props.className} ni-bondw__counter`}
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
                className="ni-bondw__counter ni-bondw__moved"
                aria-label={`${counterName} ${id + 1}`}
                disabled={!interactive}
                onClick={() => sendHome(id)}
              >
                <ObjectSprite sprite="counter" />
              </button>
            );
          })}
        </div>
        <span
          className="ni-bondw__badge"
          data-blank={badgeBlank ? 'true' : undefined}
          data-empty={badge === null ? 'true' : undefined}
          aria-hidden="true"
        >
          {badge === null ? '' : String(badge)}
        </span>
        {hand(slot)}
      </div>
    );
  };

  const found = config.mode === 'new-way' ? (config.found ?? []) : [];
  const whole = config.whole ?? 0;

  return (
    <div
      ref={rootRef}
      className="ni-bondw"
      data-tier={tier}
      data-mode={config.mode}
      data-disabled={disabled ? 'true' : undefined}
    >
      {found.length > 0 ? (
        <section className="ni-bondw__found" aria-label={t('ui.widget.bond.found')}>
          {found.map(([a, b]) => (
            <NumberBondView
              key={`${a}-${b}`}
              whole={whole}
              parts={[a, b]}
              label={`${whole}: ${a}, ${b}`}
            />
          ))}
        </section>
      ) : null}

      {concrete ? (
        <fieldset className="ni-bondw__cbond" aria-label={t('ui.widget.picture')}>
          <svg
            className="ni-bondw__legs"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <line x1="50" y1="30" x2="25" y2="72" />
            <line x1="50" y1="30" x2="75" y2="72" />
          </svg>
          <div className="ni-bondw__top">{renderPool('whole')}</div>
          <div className="ni-bondw__bottom">
            {renderPool('part-0')}
            {renderPool('part-1')}
          </div>
        </fieldset>
      ) : (
        <div className="ni-bondw__pbond">
          <NumberBondView
            whole={config.whole}
            parts={config.parts}
            label={t('ui.widget.picture')}
            renderSlot={renderSlot}
          />
        </div>
      )}

      <div className="ni-bondw__controls">
        {entrySlots.length > 0 ? (
          <div
            className={['ni-bondw__entry', marked('entry') ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <NumberEntry
              max={entryMax(config)}
              value={entrySlot ? (values[entrySlot] ?? null) : null}
              onChange={enter}
              disabled={!interactive}
              highlighted={entryHighlight}
              trace={trace}
              columns={entryMax(config) <= 5 ? 3 : 4}
              onEnter={() => {
                if (!document.activeElement?.closest('[role="button"]')) submit();
              }}
              check={<CheckButton onPress={submit} disabled={!interactive || !complete} />}
            />
            {hand('entry')}
          </div>
        ) : (
          <CheckButton onPress={submit} disabled={!interactive || !complete} />
        )}
      </div>
      {layer}
    </div>
  );
}

export default NumberBondWidget;
