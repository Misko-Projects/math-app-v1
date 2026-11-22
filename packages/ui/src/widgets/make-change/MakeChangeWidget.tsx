import {
  changeTrayCapacity,
  formatModel,
  type MakeChangeState,
  trayCents,
  trayOf,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  type BoardItem,
  type BoardTarget,
  CheckButton,
  MoneyBoard,
  type MoneyPiece,
  MoneyTag,
  PIECE_ORDER,
  purseLimits,
  useAlive,
  useDemoPause,
  useInviteHand,
  useMoneySpeech,
  useRoomy,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { CountUpLine } from './CountUpLine';
import './make-change.css';

/**
 * `make-change` (03 §5.5, concrete, MON.07): something costs `price` and the shopper gave `paid`;
 * give the change from the purse by counting up. The price and the amount paid are tagged; the
 * purse and tray are the money board (drag, tap-to-place, keyboard; a tapped coin says its name
 * and value). With `countUpLine` an open line from the price to the amount paid shows one hop per
 * piece given, each as long as the piece is worth, and the count reached so far. "Check" sends the
 * change as the engine model builds it, `{ coins }`, checked by `coins.total { cents: paid − price }`.
 *
 * Demo ops: `drop {coin, to?}` and `count-up {to}` (gives the piece that counts up to `to`, which
 * is spoken), plus `answer`.
 */

const OPS = ['drop', 'count-up', 'answer'] as const;

type Config = ConfigFor<'make-change'>;

const centsOf = (order: readonly MoneyPiece[]) => trayCents(trayOf(order));

export function MakeChangeWidget({
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
  const [roomy, areaRef] = useRoomy();
  const alive = useAlive();
  const pause = useDemoPause();
  const model = formatModel('make-change');
  const [state, setState] = useState<MakeChangeState>(
    () => model?.initialState(config) as MakeChangeState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const [landed, setLanded] = useState<{ piece: MoneyPiece; n: number } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [highlight, setHighlight] = useState<{
    item?: BoardItem;
    zone?: BoardTarget;
    hand?: boolean;
  } | null>(null);
  const [checkInvited, setCheckInvited] = useState(false);
  const interactive = !disabled && !demoBusy;
  const given = state.order as MoneyPiece[];
  const reached = config.price + centsOf(given);

  const apply = (action: WidgetAction) => {
    const prev = stateRef.current;
    if (!model) return prev;
    const next = model.apply(prev, action) as MakeChangeState;
    stateRef.current = next;
    setState(next);
    if (next.order.length > prev.order.length) {
      setLanded({ piece: next.order[next.order.length - 1] as MoneyPiece, n: next.order.length });
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

  const coinOf = (a: WidgetAction): MoneyPiece | null => {
    const c = a.args?.coin;
    return typeof c === 'string' && (PIECE_ORDER as readonly string[]).includes(c)
      ? (c as MoneyPiece)
      : null;
  };

  /** The piece a `count-up {to}` gives (the engine model decides; this only finds it to light it). */
  const countUpPiece = (a: WidgetAction): MoneyPiece | null => {
    if (!model) return null;
    const prev = stateRef.current;
    const next = model.apply(prev, a) as MakeChangeState;
    return next.order.length > prev.order.length
      ? (next.order[next.order.length - 1] as MoneyPiece)
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
        if (action.op === 'drop' || action.op === 'count-up') {
          const back = action.op === 'drop' && action.args?.to === 'purse';
          const piece = action.op === 'drop' ? coinOf(action) : countUpPiece(action);
          if (!piece) return;
          setHighlight({ item: back ? `tray-${piece}` : `purse-${piece}` });
          await pause(500);
          if (!alive.current) return;
          setHighlight(null);
          const next = apply(action);
          if (action.op === 'count-up') {
            money.count(config.price + centsOf(next.order as MoneyPiece[]));
            await pause(900);
          } else {
            await pause(350);
          }
        } else if (action.op === 'answer') {
          apply(action);
          await pause(400);
        }
      } finally {
        if (alive.current) setDemoBusy(false);
      }
    },
    invite: (action) => {
      setCheckInvited(false);
      if (!action) {
        setHighlight(null);
        return;
      }
      const piece =
        action.op === 'drop'
          ? coinOf(action)
          : action.op === 'count-up'
            ? countUpPiece(action)
            : null;
      if (piece) {
        const back = action.op === 'drop' && action.args?.to === 'purse';
        setHighlight({ item: back ? `tray-${piece}` : `purse-${piece}`, hand: true });
      } else if (action.op === 'answer') {
        setHighlight(null);
        setCheckInvited(true);
      } else {
        setHighlight({ zone: 'tray', hand: true });
      }
    },
  });

  // Pip's hand (kit `useInviteHand`): under the invited coin or the tray, or under "check".
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handTarget = highlight?.hand
    ? highlight.item
      ? `item:${highlight.item}`
      : highlight.zone
        ? `zone:${highlight.zone}`
        : ''
    : checkInvited
      ? 'check'
      : '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => {
      if (handTarget === 'check')
        return root.querySelector<HTMLElement>('.ni-mchange__check .ni-btn');
      if (handTarget.startsWith('item:')) {
        const id = handTarget.slice(5);
        return (
          [...root.querySelectorAll<HTMLElement>('.ni-money__top')].find(
            (el) => el.dataset.id === id,
          ) ?? null
        );
      }
      if (handTarget.startsWith('zone:')) {
        return root.querySelector<HTMLElement>(
          `[data-zone="${handTarget.slice(5)}"] > .ni-money__pad`,
        );
      }
      return null;
    },
    handTarget,
  );

  return (
    <div
      className="ni-mchange"
      ref={(el) => {
        rootRef.current = el;
        areaRef.current = el;
      }}
      data-roomy={roomy ? 'true' : undefined}
      style={handRootStyle}
      data-tier={tier}
      data-line={config.countUpLine ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      data-change={centsOf(given)}
      data-reached={reached}
    >
      <div className="ni-mchange__info">
        <div className="ni-mchange__tags">
          <MoneyTag kind="price" label={t('ui.money.price')} cents={config.price} />
          <MoneyTag kind="paid" label={t('ui.money.paid')} cents={config.paid} />
        </div>
        {config.countUpLine ? (
          <CountUpLine
            price={config.price}
            paid={config.paid}
            given={given}
            label={t('ui.money.count-up')}
            scale={roomy ? 1.3 : 1}
          />
        ) : null}
        <span className={checkInvited ? 'ni-mchange__check ni-invite' : 'ni-mchange__check'}>
          <CheckButton onPress={submit} disabled={!interactive || given.length === 0} />
        </span>
      </div>
      <MoneyBoard
        limits={purseLimits(config.purse)}
        tray={given}
        capacity={changeTrayCapacity(config)}
        onMove={onMove}
        onSpeak={(p) => {
          if (speakOnTap) money.piece(p, centsOf([p]));
        }}
        trace={trace}
        disabled={!interactive}
        quarterPx={roomy ? 84 : 64}
        trayLabel={t('ui.money.change-tray')}
        highlight={highlight}
        landed={landed}
      />
      {inviteHand}
    </div>
  );
}

export default MakeChangeWidget;
