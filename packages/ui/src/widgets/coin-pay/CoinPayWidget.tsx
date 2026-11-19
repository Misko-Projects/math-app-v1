import {
  type CoinPayState,
  formatModel,
  parseTrayKey,
  trayCents,
  trayOf,
} from '@number-island/engine';
import type { CoinKind, WidgetAction } from '@number-island/shared';
import { useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  BillArt,
  type BoardItem,
  type BoardTarget,
  CheckButton,
  CoinArt,
  MoneyBoard,
  type MoneyPiece,
  MoneyTag,
  PIECE_ORDER,
  purseLimits,
  useAlive,
  useDemoPause,
  useMoneySpeech,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './coin-pay.css';

/**
 * `coin-pay` (03 §5.5, concrete): pay `target` cents by moving coins (and dollar bills) from the
 * purse into the tray: drag, tap a coin then the tray, or Enter on each. A coin goes back the same
 * way. Tapping a coin says its name and value. The running total under the tray, when shown, is
 * always the exact sum of the tray. `new-way` (PUZ.09) lists the ways already found beside the
 * purse. "Check" sends the tray as built by the engine model: `{ coins: { penny, nickel, dime,
 * quarter, dollar? } }`, checked by `coins.total` or `coins.fewest`.
 *
 * Demo ops: `drop {coin, to?}`, `count-up {coin?}` (drops the coin and counts on: the running total
 * shows and is spoken; with no coin, counts the tray biggest first), `say-total`, and `answer`.
 */

const OPS = ['drop', 'count-up', 'say-total', 'answer'] as const;

type Config = ConfigFor<'coin-pay'>;

const centsOf = (order: readonly MoneyPiece[]) => trayCents(trayOf(order));

export function CoinPayWidget({
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
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const model = formatModel('coin-pay');
  const [state, setState] = useState<CoinPayState>(
    () => model?.initialState(config) as CoinPayState,
  );
  const [landed, setLanded] = useState<{ piece: MoneyPiece; n: number } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [highlight, setHighlight] = useState<{
    item?: BoardItem;
    zone?: BoardTarget;
    hand?: boolean;
  } | null>(null);
  const [demoTotal, setDemoTotal] = useState<number | null>(null);
  const [checkInvited, setCheckInvited] = useState(false);
  const interactive = !disabled && !demoBusy;
  // Demo ops run back to back: each applies to the newest state, not a render's snapshot.
  const stateRef = useRef(state);
  stateRef.current = state;
  const tray = state.order as MoneyPiece[];
  const total = centsOf(tray);

  const apply = (action: WidgetAction) => {
    const prev = stateRef.current;
    if (!model) return prev;
    const next = model.apply(prev, action) as CoinPayState;
    stateRef.current = next;
    setState(next);
    if (next.order.length > prev.order.length) {
      const piece = next.order[next.order.length - 1] as MoneyPiece;
      setLanded({ piece, n: next.order.length });
    }
    return next;
  };

  const onMove = (piece: MoneyPiece, to: BoardTarget) => {
    setHighlight(null);
    setCheckInvited(false);
    apply({ op: 'drop', args: to === 'purse' ? { coin: piece, to: 'purse' } : { coin: piece } });
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || !model) return false;
    const r = model.toResponse(state);
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const coinOf = (a: WidgetAction): MoneyPiece | null => {
    const c = a.args?.coin;
    return typeof c === 'string' && (PIECE_ORDER as readonly string[]).includes(c)
      ? (c as MoneyPiece)
      : null;
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      if (!model) return;
      setDemoBusy(true);
      setHighlight(null);
      setCheckInvited(false);
      try {
        const coin = coinOf(action);
        switch (action.op) {
          case 'drop':
          case 'count-up': {
            if (coin) {
              const back = action.op === 'drop' && action.args?.to === 'purse';
              setHighlight({ item: back ? `tray-${coin}` : `purse-${coin}` });
              await pause(500);
              if (!alive.current) return;
              setHighlight(null);
              const next = apply(action);
              if (action.op === 'count-up') {
                const cents = centsOf(next.order as MoneyPiece[]);
                setDemoTotal(cents);
                money.count(cents);
                await pause(900);
              } else {
                await pause(350);
              }
            } else if (action.op === 'count-up') {
              // Count the tray biggest first: each running total is the sum of the coins so far.
              const order = [...tray].sort(
                (a, b) => PIECE_ORDER.indexOf(a) - PIECE_ORDER.indexOf(b),
              );
              let cents = 0;
              for (const p of order) {
                cents += centsOf([p]);
                setDemoTotal(cents);
                money.count(cents);
                await pause(700);
                if (!alive.current) return;
              }
              apply(action);
            }
            break;
          }
          case 'say-total':
            apply(action);
            setDemoTotal(total);
            money.total(total);
            await pause(1200);
            break;
          case 'answer':
            apply(action);
            await pause(400);
            break;
        }
      } finally {
        if (alive.current) {
          setDemoTotal(null);
          setDemoBusy(false);
        }
      }
    },
    invite: (action) => {
      setCheckInvited(false);
      if (!action) {
        setHighlight(null);
        return;
      }
      const coin = coinOf(action);
      if ((action.op === 'drop' || action.op === 'count-up') && coin) {
        const back = action.op === 'drop' && action.args?.to === 'purse';
        setHighlight({ item: back ? `tray-${coin}` : `purse-${coin}`, hand: true });
      } else if (action.op === 'answer') {
        setHighlight(null);
        setCheckInvited(true);
      } else {
        setHighlight({ zone: 'tray', hand: true });
      }
    },
  });

  // ---------- render ----------

  const shownTotal = demoTotal ?? (config.showRunningTotal ? total : null);
  const found = (config.found ?? []).flatMap((k) => {
    const tr = parseTrayKey(k);
    return tr ? [{ key: k, tray: tr }] : [];
  });

  const purseAside = (
    <div className="ni-cpay__aside">
      <MoneyTag kind="price" label={t('ui.money.price')} cents={config.target} />
      {config.mode === 'new-way' ? (
        <div className="ni-cpay__found" role="img" aria-label={t('ui.money.found')}>
          <span className="ni-money__tag-label" aria-hidden="true">
            {t('ui.money.found')}
          </span>
          <ul className="ni-cpay__ways">
            {found.map(({ key, tray: way }) => (
              <li key={key} className="ni-cpay__way" data-way={key}>
                {PIECE_ORDER.flatMap((p) => Array.from({ length: way[p] ?? 0 }, () => p)).map(
                  (p, i) =>
                    p === 'dollar' ? (
                      // biome-ignore lint/suspicious/noArrayIndexKey: a way's pieces are positional
                      <BillArt key={i} dollars={1} height={22} plain />
                    ) : (
                      // biome-ignore lint/suspicious/noArrayIndexKey: a way's pieces are positional
                      <CoinArt key={i} kind={p as CoinKind} quarterPx={26} />
                    ),
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const trayAside = (
    <div className="ni-cpay__aside">
      {shownTotal !== null ? (
        <MoneyTag kind="total" label={t('ui.money.running')} cents={shownTotal} />
      ) : null}
      <span className={checkInvited ? 'ni-cpay__check ni-invite' : 'ni-cpay__check'}>
        <CheckButton onPress={submit} disabled={!interactive || tray.length === 0} />
      </span>
    </div>
  );

  return (
    <div
      className="ni-cpay"
      data-tier={tier}
      data-mode={config.mode}
      data-disabled={disabled ? 'true' : undefined}
      data-total={total}
    >
      <MoneyBoard
        limits={purseLimits(config.purse)}
        tray={tray}
        onMove={onMove}
        onSpeak={(p) => {
          if (speakOnTap) money.piece(p, centsOf([p]));
        }}
        trace={trace}
        disabled={!interactive}
        quarterPx={68}
        trayLabel={t('ui.money.tray')}
        highlight={highlight}
        landed={landed}
        purseAside={purseAside}
        trayAside={trayAside}
      />
    </div>
  );
}

export default CoinPayWidget;
