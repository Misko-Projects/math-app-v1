import { type CoinKind, type InteractionEvent, TRAY_PIECES_MAX } from '@number-island/shared';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import type { PlaceVia } from '../../interaction/useTapToPlace';
import { useNarrationText, useReducedMotion, useUiPreferences } from '../../preferences/UiProvider';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { BillArt, COIN_CENTS, CoinArt, coinRadius, type MoneyPiece, moneyText } from './CoinArt';
import { type PileSpec, pileSteps } from './moneyLayout';
import './money.css';

/**
 * The concrete money board (U05 #14) shared by coin-pay and make-change: the purse on top (one
 * stack per kind the purse has, biggest value first, showing exactly how many are left when the
 * purse counts them, a heap of three when it has plenty) and the tray below (one pile per kind,
 * every piece in it drawn). A piece moves by drag, by tap-to-select then tap-to-place, or by
 * keyboard (Enter on a piece, then Enter on the tray or purse): `useDragToTarget` with items
 * `purse-<kind>` (the top piece of a stack) and `tray-<kind>` (the top piece of a pile) and
 * targets `tray` and `purse`. The board keeps no state: the widget applies each move through its
 * engine model and passes the tray back in.
 */

export type BoardItem = `purse-${MoneyPiece}` | `tray-${MoneyPiece}`;
export type BoardTarget = 'tray' | 'purse';

/** Biggest value first: how the purse is laid out and the tray is counted. */
export const PIECE_ORDER: readonly MoneyPiece[] = ['dollar', 'quarter', 'dime', 'nickel', 'penny'];

export const pieceCents = (p: MoneyPiece): number => (p === 'dollar' ? 100 : COIN_CENTS[p]);

/** A config purse as board limits: 'unlimited' is Infinity, a missing kind 0. */
export function purseLimits(
  purse: Partial<Record<MoneyPiece, number | 'unlimited'>>,
): Partial<Record<MoneyPiece, number>> {
  const out: Partial<Record<MoneyPiece, number>> = {};
  for (const k of PIECE_ORDER) {
    const v = purse[k];
    out[k] = v === 'unlimited' ? Number.POSITIVE_INFINITY : typeof v === 'number' ? v : 0;
  }
  return out;
}

/** A labelled amount (a price, what was paid, the running total): numerals ≥ 32 px. */
export function MoneyTag({
  kind,
  label,
  cents,
}: {
  kind: 'price' | 'paid' | 'total';
  label: string;
  cents: number;
}) {
  return (
    <output
      className="ni-money__tag"
      data-kind={kind}
      data-cents={cents}
      aria-label={`${label} ${moneyText(cents)}`}
    >
      <span className="ni-money__tag-label" aria-hidden="true">
        {label}
      </span>
      <span className="ni-money__amount" aria-hidden="true">
        {moneyText(cents)}
      </span>
    </output>
  );
}

export interface MoneyBoardProps {
  /** How many of each piece the purse holds (Infinity for 'unlimited'; 0 or missing: none). */
  limits: Partial<Record<MoneyPiece, number>>;
  /** The pieces in the tray, in the order they went in. */
  tray: readonly MoneyPiece[];
  onMove: (piece: MoneyPiece, to: BoardTarget, via: PlaceVia) => void;
  /** Speak a piece's name (tap to select, or a drag that lands). */
  onSpeak: (piece: MoneyPiece) => void;
  trace: (t: InteractionEvent['t'], target: string) => void;
  disabled: boolean;
  /** The quarter's diameter: one scale for every coin on the board. */
  quarterPx: number;
  /** Accessible name of the tray ("Put the money here"). */
  trayLabel: string;
  /**
   * A piece or zone the demo highlights (`.ni-invite`). Pip's hand is the widget's, placed with the
   * kit's `useInviteHand` on `[data-id="<item>"]` or the zone's pad.
   */
  highlight?: { item?: BoardItem; zone?: BoardTarget } | null;
  /** The piece that just landed in the tray (a short pop; none with reduced motion). */
  landed?: { piece: MoneyPiece; n: number } | null;
  /** Beside the purse (a price tag, ways found) and beside the tray (running total, check). */
  purseAside?: ReactNode;
  trayAside?: ReactNode;
}

/** A bill's height beside coins at `quarterPx`: 74 px up to a 68 px quarter, then in step. */
const billHeight = (quarterPx: number) => Math.max(74, Math.round((74 * quarterPx) / 68));
const billWidth = (quarterPx: number) => (billHeight(quarterPx) * 235) / 104;

/** A piece's drawn size in px (CoinArt's box: 2 units of rim, 7 of shadow below). */
function artSize(p: MoneyPiece, quarterPx: number): { w: number; h: number } {
  if (p === 'dollar') return { w: billWidth(quarterPx), h: billHeight(quarterPx) };
  const unit = quarterPx / 88;
  const r = coinRadius(p as CoinKind);
  return { w: (2 * r + 4) * unit, h: (2 * r + 9) * unit };
}

function PieceArt({ piece, quarterPx }: { piece: MoneyPiece; quarterPx: number }) {
  return piece === 'dollar' ? (
    <BillArt dollars={1} height={billHeight(quarterPx)} />
  ) : (
    <CoinArt kind={piece as CoinKind} quarterPx={quarterPx} />
  );
}

export function MoneyBoard({
  limits,
  tray,
  onMove,
  onSpeak,
  trace,
  disabled,
  quarterPx,
  trayLabel,
  highlight,
  landed,
  purseAside,
  trayAside,
}: MoneyBoardProps) {
  const t = useNarrationText();
  const reduced = useReducedMotion();
  const { ageMode } = useUiPreferences();
  const minPx = MIN_TARGET_PX[ageMode];
  const kinds = PIECE_ORDER.filter((k) => (limits[k] ?? 0) > 0);
  const inTray = (k: MoneyPiece) => tray.filter((x) => x === k).length;
  const left = (k: MoneyPiece) => (limits[k] ?? 0) - inTray(k);
  const name = (k: MoneyPiece) =>
    k === 'dollar'
      ? t('ui.money.bill', { cents: 100 })
      : t(`ui.money.${k}`, { cents: pieceCents(k) });
  // Every piece sits in a box at least the age mode's tap target, its art centred.
  const box = (k: MoneyPiece) => {
    const a = artSize(k, quarterPx);
    return { w: Math.max(a.w, minPx), h: Math.max(a.h, minPx) };
  };

  const drag = useDragToTarget<BoardItem, BoardTarget>({
    disabled,
    trace,
    canPlace: (item, target) =>
      item.startsWith('purse-') ? target === 'tray' : target === 'purse',
    onSelect: (item) => {
      if (item) onSpeak(item.replace(/^(purse|tray)-/, '') as MoneyPiece);
    },
    onPlace: ({ item, target, via }) => {
      const piece = item.replace(/^(purse|tray)-/, '') as MoneyPiece;
      if (via === 'drag') onSpeak(piece);
      onMove(piece, target, via);
    },
  });

  // The piece that just landed pops in (never with reduced motion).
  const trayRef = useRef<HTMLDivElement | null>(null);
  // The room the piles have, so a crowded tray squeezes them into two rows (moneyLayout.ts).
  const [trayWidth, setTrayWidth] = useState(0);
  useLayoutEffect(() => {
    const el = trayRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const pad =
        (Number.parseFloat(cs.paddingLeft) || 0) + (Number.parseFloat(cs.paddingRight) || 0);
      setTrayWidth(Math.max(0, el.clientWidth - pad));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!landed || reduced) return;
    const el = trayRef.current?.querySelector<HTMLElement>(
      `[data-pile="${landed.piece}"] .ni-money__top`,
    );
    el?.animate(
      [
        { transform: 'translateY(-16px) scale(1.08)', opacity: 0.5 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [landed, reduced]);

  // A chosen piece arms the other zone, and the whole of that zone then takes the tap that places
  // it: the pieces already lying there (each one the target that takes it back) step aside, so a
  // tap meant to place a coin never picks up another one instead, however full the zone is.
  const armedFor: BoardTarget | null = drag.selected
    ? drag.selected.startsWith('purse-')
      ? 'tray'
      : 'purse'
    : null;
  // The tray holds `TRAY_PIECES_MAX` pieces (every one is drawn); a full tray takes no more.
  const full = tray.length >= TRAY_PIECES_MAX;

  const isHi = (item: BoardItem) => highlight?.item === item;
  const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

  const purseStack = (k: MoneyPiece) => {
    const n = left(k);
    const counted = Number.isFinite(limits[k] ?? 0);
    const shown = counted ? Math.max(0, n) : 3;
    const step = shown <= 1 ? 0 : Math.min(k === 'dollar' ? 5 : 4, 28 / (shown - 1));
    const b = box(k);
    const id: BoardItem = `purse-${k}`;
    const props = drag.itemProps(id, { label: name(k), disabled: n <= 0 || full });
    const lift = Math.max(0, shown - 1) * step;
    return (
      <div
        key={k}
        className="ni-money__stack"
        data-stack={k}
        data-left={counted ? n : 'many'}
        style={{ width: b.w + lift, height: b.h + lift }}
      >
        {Array.from({ length: Math.max(0, shown - 1) }, (_, i) => {
          const d = (shown - 1 - i) * step;
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: stacked pieces are positional
              key={i}
              className="ni-money__under"
              aria-hidden="true"
              data-piece={k}
              style={{ width: b.w, height: b.h, left: lift - d, top: d }}
            >
              <PieceArt piece={k} quarterPx={quarterPx} />
            </span>
          );
        })}
        {n > 0 ? (
          <span
            {...props}
            className={cls(
              props.className,
              'ni-money__piece ni-money__top',
              isHi(id) && 'ni-invite',
            )}
            style={{ width: b.w, height: b.h, left: lift, top: 0 }}
            data-piece={k}
            data-id={id}
          >
            <PieceArt piece={k} quarterPx={quarterPx} />
          </span>
        ) : (
          <span
            className="ni-money__empty"
            aria-hidden="true"
            data-piece={k}
            style={{ width: b.w, height: b.h, left: lift, top: 0 }}
          />
        )}
      </div>
    );
  };

  // Every piece in a pile is drawn; they overlap more as the tray fills, each one still showing
  // at least `MIN_PILE_STEP_PX` of itself, and the piles take at most two rows (moneyLayout.ts).
  const trayKinds = PIECE_ORDER.filter((k) => inTray(k) > 0);
  const steps = pileSteps(
    trayKinds.map((k): PileSpec => ({ n: inTray(k), w: box(k).w, bill: k === 'dollar' })),
    trayWidth,
  );

  const trayPile = (k: MoneyPiece, at: number) => {
    const n = inTray(k);
    const b = box(k);
    const off = steps[at] ?? 0;
    const id: BoardItem = `tray-${k}`;
    const props = drag.itemProps(id, { label: name(k) });
    return (
      <div
        key={k}
        className="ni-money__pile"
        data-pile={k}
        data-count={n}
        style={{ width: b.w + off * (n - 1), height: b.h }}
      >
        {Array.from({ length: n - 1 }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: piled pieces are positional
            key={i}
            className="ni-money__under ni-money__in"
            aria-hidden="true"
            data-piece={k}
            style={{ width: b.w, height: b.h, left: i * off, top: 0 }}
          >
            <PieceArt piece={k} quarterPx={quarterPx} />
          </span>
        ))}
        <span
          {...props}
          className={cls(
            props.className,
            'ni-money__piece ni-money__top ni-money__in',
            isHi(id) && 'ni-invite',
          )}
          style={{ width: b.w, height: b.h, left: (n - 1) * off, top: 0 }}
          data-piece={k}
          data-id={id}
        >
          <PieceArt piece={k} quarterPx={quarterPx} />
        </span>
      </div>
    );
  };

  const trayPad = drag.targetProps('tray', { label: trayLabel });
  const pursePad = drag.targetProps('purse', { label: t('ui.money.purse') });
  return (
    <div
      className="ni-money"
      data-disabled={disabled ? 'true' : undefined}
      data-armed-for={armedFor ?? undefined}
      data-full={full ? 'true' : undefined}
    >
      <div className="ni-money__row">
        <div className="ni-money__zone" data-zone="purse">
          <div
            {...pursePad}
            className={cls(
              pursePad.className,
              'ni-money__pad',
              highlight?.zone === 'purse' && 'ni-invite',
            )}
          />
          <div className="ni-money__stacks">{kinds.map(purseStack)}</div>
        </div>
        {purseAside}
      </div>
      <div className="ni-money__row">
        <div className="ni-money__zone" data-zone="tray" ref={trayRef}>
          <div
            {...trayPad}
            className={cls(
              trayPad.className,
              'ni-money__pad',
              highlight?.zone === 'tray' && 'ni-invite',
            )}
            data-count={tray.length}
          />
          <div className="ni-money__piles">{trayKinds.map(trayPile)}</div>
        </div>
        {trayAside}
      </div>
    </div>
  );
}
