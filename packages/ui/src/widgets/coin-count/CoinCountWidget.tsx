import {
  type CoinCountState,
  type CountPiece,
  formatModel,
  runningTotal,
  shownPieces,
} from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useReducedMotion, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  BillArt,
  CheckButton,
  CoinArt,
  moneyText,
  NumberPadKeys,
  type PadBox,
  PadBoxView,
  type PadKey,
  PickCard,
  useAlive,
  useDemoPause,
  useInviteHand,
  useMoneySpeech,
  usePadEntry,
  useRoomy,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './coin-count.css';

/**
 * `coin-count` (03 §5.5, pictorial): how much money is in the purse? Bills and coins are drawn to
 * scale on a paper board; tapping a piece speaks its name and value ("a dime, ten cents") and
 * marks it, so a child can keep track while counting. `cents` answers on a `_ ¢` box, and
 * `dollars-cents` on a fixed `$ _ . _ _` pad (both cents digits typed, so .05 is never .50);
 * `compareWith` (MON.08) draws two purses and asks which has more, or the same.
 *
 * Every response is built by the engine model (`formatModel('coin-count')`). Demo ops:
 * `sort-coins` (the pieces glide into biggest-first order), `count-up {index, side?}` (the pieces
 * counted so far are ringed and the running total, their exact sum, shows and is spoken),
 * `say-running {value}`, and `answer`.
 */

const OPS = ['sort-coins', 'count-up', 'say-running', 'answer'] as const;
const KEY_MS = 340;

type Config = ConfigFor<'coin-count'>;
type Side = 'left' | 'right';

type Piece = CountPiece;

/** The quarter's size for a purse: big when there are few pieces, never under the tap target. */
function quarterFor(slots: number, compare: boolean) {
  if (slots <= (compare ? 3 : 5)) return 84;
  if (slots <= (compare ? 4 : 8)) return 72;
  return 60;
}

/** The width one row of a small purse may take beside the pad in a roomy area, in px. */
const ROOMY_ROW_PX = 740;
/** The largest a quarter is drawn there (a lone coin does not fill the board). */
const ROOMY_QUARTER_MAX_PX = 150;

const BOXES_CENTS: PadBox[] = [{ id: 'cents', maxDigits: 4 }];
const BOXES_DOLLARS: PadBox[] = [
  { id: 'dollars', maxDigits: 3 },
  { id: 'cents', maxDigits: 2, exactDigits: true },
];

export function CoinCountWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const money = useMoneySpeech();
  const { speakOnTap } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const [roomy, areaRef] = useRoomy();
  const alive = useAlive();
  const pause = useDemoPause();
  const model = formatModel('coin-count');
  const compare = config.compareWith !== undefined;
  const dollarsCents = !compare && config.answerUnit === 'dollars-cents';
  const boxes = dollarsCents ? BOXES_DOLLARS : BOXES_CENTS;
  const pad = usePadEntry(boxes);

  const [sorted, setSorted] = useState(false);
  const [counted, setCounted] = useState<Record<Side, number>>({ left: -1, right: -1 });
  const [running, setRunning] = useState<{ side: Side; cents: number } | null>(null);
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());
  const [choice, setChoice] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [glow, setGlow] = useState<Side | null>(null);
  const interactive = !disabled && !demoBusy;

  const sides: Side[] = compare ? ['left', 'right'] : ['left'];
  // The pieces in the order shown: the engine model's order (bills first, biggest first once sorted).
  const shown = useMemo(
    (): Record<Side, Piece[]> => ({
      left: shownPieces(config, 'left', sorted),
      right: shownPieces(config, 'right', sorted),
    }),
    [config, sorted],
  );

  // ---------- FLIP: pieces glide to their sorted places (instant with reduced motion) ----------
  const rootRef = useRef<HTMLDivElement | null>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const snapshot = () => {
    const map = new Map<string, DOMRect>();
    for (const el of rootRef.current?.querySelectorAll<HTMLElement>('[data-piece]') ?? []) {
      map.set(el.dataset.piece as string, el.getBoundingClientRect());
    }
    before.current = map;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the order changes
  useLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    if (!prev || reduced) return;
    for (const el of rootRef.current?.querySelectorAll<HTMLElement>('[data-piece]') ?? []) {
      const was = prev.get(el.dataset.piece as string);
      if (!was) continue;
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (dx === 0 && dy === 0) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 520,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
  }, [sorted]);

  // ---------- child input ----------

  const speakPiece = (p: Piece) => {
    money.piece(p.kind === 'bill' ? 'dollar' : p.coin, p.cents);
  };

  const tapPiece = (p: Piece) => {
    if (!interactive) return;
    trace('tap', p.id);
    if (speakOnTap) speakPiece(p);
    setInvite(null);
    setMarked((m) => {
      const next = new Set(m);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    pad.type(key);
  };

  const pick = (id: string) => {
    if (!interactive) return;
    trace('tap', id);
    setInvite(null);
    setChoice(id);
  };

  const responseFor = (action: WidgetAction): ResponseValue | null => {
    if (!model) return null;
    return model.toResponse(model.apply(model.initialState(config), action));
  };

  const answerAction = (): WidgetAction | null => {
    if (compare) return choice ? { op: 'answer', args: { id: choice } } : null;
    if (!pad.complete) return null;
    return dollarsCents
      ? { op: 'answer', args: { values: pad.values as number[] } }
      : { op: 'answer', args: { value: pad.values[0] as number } };
  };

  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const action = answerAction();
    const r = action ? responseFor(action) : null;
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const sideOf = (a: WidgetAction): Side =>
    a.args?.side === 'right' && compare ? 'right' : 'left';

  const typeValues = async (list: [number, string][]) => {
    for (const [i, text] of list) {
      pad.setActive(i);
      let typed = '';
      for (const ch of text.split('') as PadKey[]) {
        setPressedKey(ch);
        await pause(KEY_MS);
        if (!alive.current) return;
        typed += ch;
        const next = [...pad.textsRef.current];
        next[i] = typed;
        pad.setTexts(next);
      }
      setPressedKey(null);
      await pause(KEY_MS);
      if (!alive.current) return;
    }
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      if (!model) return;
      setDemoBusy(true);
      setInvite(null);
      try {
        // The engine model decides what the op does; the widget animates the result.
        const s0 = { ...model.initialState(config), sorted, counted };
        const s = model.apply(s0, action) as CoinCountState;
        switch (action.op) {
          case 'sort-coins':
            snapshot();
            setSorted(true);
            setCounted(s.counted);
            setRunning(null);
            await pause(700);
            break;
          case 'count-up': {
            const side = sideOf(action);
            const index = s.counted[side];
            if (index < 0 || index === counted[side]) break;
            setCounted(s.counted);
            // The running total is exactly the sum of the pieces counted so far (engine).
            const cents = runningTotal(shownPieces(config, side, s.sorted), index);
            setRunning({ side, cents });
            money.count(cents);
            await pause(900);
            break;
          }
          case 'say-running': {
            if (s.said === null) break;
            setRunning({ side: 'left', cents: s.said });
            money.total(s.said);
            await pause(1100);
            break;
          }
          case 'answer': {
            if (compare) {
              if (s.choice) {
                setGlow(s.choice === 'same' ? null : (s.choice as Side));
                await pause(500);
                if (!alive.current) return;
                setChoice(s.choice);
                setGlow(null);
                await pause(300);
              }
              break;
            }
            const r = model.toResponse(s);
            if (!r) break;
            pad.setTexts(boxes.map(() => ''));
            if (r.kind === 'numbers') {
              const [d, c] = r.values as [number, number];
              await typeValues([
                [0, String(d)],
                [1, String(c).padStart(2, '0')],
              ]);
            } else if (r.kind === 'number') {
              await typeValues([[0, String(r.value)]]);
            }
            break;
          }
        }
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const invitedPiece =
    invite?.op === 'count-up' && typeof invite.args?.index === 'number'
      ? (shown[sideOf(invite)][invite.args.index]?.id ?? null)
      : null;
  const invitedBoard = invite?.op === 'sort-coins' || invite?.op === 'say-running';
  const invitedBox = invite?.op === 'answer' && !compare ? pad.active : -1;
  const invitedChoice =
    invite?.op === 'answer' && compare && typeof invite.args?.id === 'string'
      ? invite.args.id
      : null;
  // Pip's hand (kit `useInviteHand`) hangs below the invited coin, choice or box.
  const invitedTarget =
    invitedPiece !== null
      ? { sel: '.ni-ccount__piece', id: invitedPiece, attr: 'id' }
      : invitedChoice !== null
        ? { sel: '.ni-pick', id: invitedChoice, attr: 'id' }
        : invitedBox >= 0
          ? { sel: '.ni-padbox', id: boxes[invitedBox]?.id ?? '', attr: 'box' }
          : null;
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      invitedTarget === null
        ? null
        : ([...root.querySelectorAll<HTMLElement>(invitedTarget.sel)].find(
            (el) => el.dataset[invitedTarget.attr] === invitedTarget.id,
          ) ?? null),
    invitedTarget === null ? '' : `${invitedTarget.sel}:${invitedTarget.id}`,
  );

  // One coin scale for the whole item: both purses of a comparison draw a quarter the same size.
  const slotsOf = (src: { coins: readonly unknown[]; bills: readonly unknown[] } | undefined) =>
    (src?.coins.length ?? 0) + 3 * (src?.bills.length ?? 0);
  // A roomy area draws the same purse a third larger (kit `useRoomy`). A small purse (up to 8
  // slots, one purse) is drawn larger still, as large as lets all of it stand in ONE row beside
  // the pad (`ROOMY_ROW_PX`), so a few coins fill the space and never wrap into rows too tall for
  // the area.
  const slots = Math.max(slotsOf(config), slotsOf(config.compareWith));
  const base = quarterFor(slots, compare);
  const quarterPx = Math.round(
    !roomy
      ? base
      : compare || slots > 8
        ? base * 1.3
        : Math.max(base, Math.min(ROOMY_QUARTER_MAX_PX, ROOMY_ROW_PX / slots - 28)),
  );

  const purse = (side: Side) => {
    const pieces = shown[side];
    const billH = roomy ? 96 : 74;
    const label = t('ui.widget.picture');
    return (
      <fieldset
        className={['ni-ccount__purse', invitedBoard ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        data-side={side}
        data-sorted={sorted ? 'true' : undefined}
        data-running={running && running.side === side ? 'true' : undefined}
        data-quarter={quarterPx}
        aria-label={label}
        style={{ '--ni-coin-q': `${quarterPx}px` } as CSSProperties}
      >
        {running && running.side === side ? (
          <output className="ni-ccount__running" data-cents={running.cents}>
            {moneyText(running.cents)}
          </output>
        ) : null}
        {pieces.map((p, i) => {
          const name =
            p.kind === 'bill'
              ? t('ui.money.bill', { cents: p.cents })
              : t(`ui.money.${p.coin}`, { cents: p.cents });
          const isCounted = i <= counted[side];
          return (
            <span key={p.id} className="ni-ccount__slot" data-piece={p.id}>
              <button
                type="button"
                className={['ni-ccount__piece', invitedPiece === p.id ? 'ni-invite' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-id={p.id}
                data-kind={p.kind === 'bill' ? 'bill' : p.coin}
                data-cents={p.cents}
                data-counted={isCounted ? 'true' : undefined}
                data-marked={marked.has(p.id) ? 'true' : undefined}
                aria-label={name}
                aria-pressed={marked.has(p.id)}
                disabled={!interactive}
                onClick={() => tapPiece(p)}
              >
                {p.kind === 'bill' ? (
                  <BillArt dollars={p.dollars} height={billH} />
                ) : (
                  <CoinArt kind={p.coin} quarterPx={quarterPx} />
                )}
              </button>
            </span>
          );
        })}
      </fieldset>
    );
  };

  if (compare) {
    // The two side cards read the same ("This one"); their accessible names say which purse
    // (PR #132 review).
    const choiceCard = (id: string, labelKey: string, area: string, nameKey = labelKey) => (
      <span className="ni-ccount__choice" style={{ gridArea: area }}>
        <PickCard
          label={t(nameKey)}
          selected={choice === id}
          highlighted={invitedChoice === id || glow === id}
          variant="word"
          data-id={id}
          disabled={!interactive}
          onPress={() => pick(id)}
        >
          <span>{t(labelKey)}</span>
        </PickCard>
      </span>
    );
    return (
      <div
        className="ni-ccount"
        data-mode="compare"
        data-tier={tier}
        data-disabled={disabled ? 'true' : undefined}
        ref={(el) => {
          rootRef.current = el;
          areaRef.current = el;
        }}
        data-roomy={roomy ? 'true' : undefined}
        style={handRootStyle}
      >
        {sides.map((side) => (
          <div key={side} className="ni-ccount__side" style={{ gridArea: side }}>
            {purse(side)}
          </div>
        ))}
        {choiceCard('same', 'ui.money.same', 'same')}
        {choiceCard('left', 'ui.money.this-one', 'left-pick', 'ui.money.this-one-left')}
        {choiceCard('right', 'ui.money.this-one', 'right-pick', 'ui.money.this-one-right')}
        <span className="ni-ccount__check" style={{ gridArea: 'check' }}>
          <CheckButton onPress={submit} disabled={!interactive || choice === null} />
        </span>
        {inviteHand}
      </div>
    );
  }

  const box = (i: number) => {
    const b = boxes[i] as PadBox;
    const label = b.id === 'dollars' ? t('ui.money.dollars-box') : t('ui.money.cents-box');
    return (
      <PadBoxView
        box={b}
        text={pad.texts[i] ?? ''}
        label={label}
        active={pad.active === i}
        invited={invitedBox === i}
        disabled={!interactive}
        onPress={() => {
          trace('tap', `box-${b.id}`);
          pad.setActive(i);
        }}
      />
    );
  };

  return (
    <div
      className="ni-ccount"
      data-mode={config.answerUnit}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      ref={(el) => {
        rootRef.current = el;
        areaRef.current = el;
      }}
      data-roomy={roomy ? 'true' : undefined}
      style={handRootStyle}
    >
      <div className="ni-ccount__board">{purse('left')}</div>
      <div className="ni-ccount__answer">
        {dollarsCents ? (
          <>
            <span className="ni-padbox__sep" aria-hidden="true">
              $
            </span>
            {box(0)}
            <span className="ni-padbox__sep" aria-hidden="true">
              .
            </span>
            {box(1)}
          </>
        ) : (
          <>
            {box(0)}
            <span className="ni-padbox__sep" aria-hidden="true">
              ¢
            </span>
          </>
        )}
        <span className="ni-ccount__check">
          <CheckButton onPress={submit} disabled={!interactive || !pad.complete} />
        </span>
      </div>
      <div className="ni-padarea ni-padarea--compact ni-ccount__pad">
        <NumberPadKeys
          onKey={onKey}
          onEnter={submit}
          disabled={!interactive}
          highlighted={pressedKey}
        />
      </div>
      {inviteHand}
    </div>
  );
}

export default CoinCountWidget;
