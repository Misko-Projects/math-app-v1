import { type FormatModel, formatModel, type ShapeSortState } from '@number-island/engine';
import type { ShapeCard, WidgetAction } from '@number-island/shared';
import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  markFor,
  ObjectSprite,
  type ShapeMark,
  ShapeView,
  shapeExtent,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import { useInviteHand } from '../kit/inviteHand';
import { useAvailableSize } from '../kit/useAvailableSize';
import { useFlip } from '../kit/useFlip';
import type { ConfigFor, WidgetProps } from '../types';
import './shape-sort.css';

/**
 * `shape-sort` (03 §5.5): a card sorter for shapes, solids, real objects, numbers, coins and
 * daily events. Cards are `c0`, `c1`, … (K01).
 * - `sort`: drag each card (or tap it, then tap a bin) into the bin it fits; a card that fits no
 *   bin stays in the tray. Check answers `{ bins }` (`sort.byRule`).
 * - `find-all`: tap every card that fits (tap again to let it go). Check answers `{ ids }`.
 * - `odd-one-out`: tap the card that does not belong. Check answers `choice`.
 * The concrete tier draws the cards as raised blocks, the pictorial tier as flat drawings. Every
 * response comes from the engine model (`formatModel('shape-sort')`).
 *
 * Demo ops: `drag-card {id, bin}`, `highlight-attribute {id, prop}` (sides, corners, square
 * corners or equal sides are marked and the count shown), `count-sides {id}` (counted aloud one by
 * one), plus `answer {id}`.
 */

const OPS = ['drag-card', 'highlight-attribute', 'count-sides', 'answer'] as const;
const TRAY = 'tray';

type Config = ConfigFor<'shape-sort'>;
type Card = Config['cards'][number];

const isShape = (c: Card['card']): c is ShapeCard => !('kind' in c);

/** The narration key that names a card (spoken on tap). */
export function cardNameKey(c: Card['card']): string | null {
  if (isShape(c)) return `shape.${c.shape}.one`;
  if (c.kind === 'object') return spriteNameKey(c.sprite);
  if (c.kind === 'coin') return `coin.${c.coin}.one`;
  if (c.kind === 'event') return c.event;
  return null;
}

/** How many of a marked attribute a shape card has (shown as a numeral beside it). */
function markCount(card: Card['card'], mark: ShapeMark): number | null {
  if (!isShape(card) || card.props.solid) return null;
  if (mark === 'sides') return card.props.sides;
  if (mark === 'corners') return card.props.corners;
  if (mark === 'rightAngles') return card.props.rightAngles;
  return null;
}

interface Highlight {
  id: string;
  mark: ShapeMark;
  /** Counting one by one: how far the count has got. */
  upto?: number;
}

export function ShapeSortWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const model = formatModel('shape-sort') as FormatModel<'shape-sort', ShapeSortState> | undefined;
  if (!model) throw new Error('shape-sort has no engine model');
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const root = useRef<HTMLDivElement>(null);
  const flip = useFlip(root);
  // The smallest landscape area (≈ 906 × 373) gets the compact spacing so nothing scrolls.
  const avail = useAvailableSize(root);
  const compact = avail !== null && avail.height < 400;
  const minT = MIN_TARGET_PX[ageMode];
  const pickSize = compact ? minT - 8 : 112;
  const [state, setState] = useState<ShapeSortState>(() => model.initialState(config));
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [invite, setInvite] = useState<{ id: string | null; bin: string | null } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const interactive = !disabled && !demoBusy;

  const apply = (action: WidgetAction, glide = false) => {
    if (glide) flip();
    setState((s) => model.apply(s, action));
  };

  const cardById = useMemo(() => new Map(config.cards.map((c) => [c.id, c])), [config.cards]);
  // One scale for every shape card, so a card at scale 1.5 really is half as big again.
  const extent = Math.max(
    1,
    ...config.cards.map((c) => (isShape(c.card) ? shapeExtent(c.card) : 0)),
  );

  const name = (c: Card) => {
    if (!isShape(c.card) && c.card.kind === 'number') return String(c.card.value);
    const key = cardNameKey(c.card);
    return key ? t(key) : c.id;
  };
  const speak = (c: Card) => {
    if (!isShape(c.card) && c.card.kind === 'number') sayNumber(c.card.value);
    else {
      const key = cardNameKey(c.card);
      if (key) say(key);
    }
  };

  const binOf = (id: string): string =>
    Object.entries(state.bins).find(([, ids]) => ids.includes(id))?.[0] ?? TRAY;

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive || config.mode !== 'sort',
    trace,
    canPlace: (item, target) => binOf(item) !== target,
    onSelect: (id) => {
      const c = id ? cardById.get(id) : undefined;
      if (c && speakOnTap) speak(c);
      if (id) setInvite(null);
    },
    onPlace: ({ item, target, via }) => {
      setInvite(null);
      apply({ op: 'drag-card', args: { id: item, bin: target } }, via !== 'drag');
    },
  });

  const tapCard = (c: Card) => {
    if (!interactive) return;
    trace('tap', c.id);
    if (speakOnTap) speak(c);
    setInvite(null);
    if (config.mode === 'find-all') {
      const picked = state.picked.includes(c.id);
      apply({ op: 'drag-card', args: picked ? { id: c.id, remove: true } : { id: c.id } });
    } else {
      apply({ op: 'answer', args: { id: c.id } });
    }
  };

  const response = model.toResponse(state);
  const submit = useSubmitGuard(() => {
    if (!interactive || !response) return false;
    onResponse(response);
    return true;
  });

  const idOf = (a: WidgetAction | null) => (typeof a?.args?.id === 'string' ? a.args.id : null);

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      const id = idOf(action);
      const card = id ? cardById.get(id) : undefined;
      setInvite(null);
      if (!card) {
        if (action.op === 'answer' || action.op === 'drag-card') apply(action);
        return;
      }
      setDemoBusy(true);
      try {
        if (action.op === 'count-sides' || action.op === 'highlight-attribute') {
          const prop = action.op === 'count-sides' ? 'sides' : String(action.args?.prop ?? 'shape');
          const mark = markFor(prop);
          const total = markCount(card.card, mark);
          apply(action);
          if (action.op === 'count-sides' && total !== null) {
            for (let i = 1; i <= total; i += 1) {
              setHighlight({ id: card.id, mark, upto: i });
              sayNumber(i);
              await pause(650);
              if (!alive.current) return;
            }
          } else {
            setHighlight({ id: card.id, mark });
            if (total !== null) sayNumber(total);
            else speak(card);
          }
          await pause(1300);
          if (!alive.current) return;
          setHighlight(null);
          return;
        }
        // drag-card and answer: point at the card, then move or pick it.
        setHighlight({ id: card.id, mark: 'shape' });
        speak(card);
        await pause(500);
        if (!alive.current) return;
        setHighlight(null);
        apply(action, true);
        await pause(500);
      } finally {
        if (alive.current) setDemoBusy(false);
      }
    },
    invite: (action) => {
      const id = idOf(action);
      setInvite(
        id ? { id, bin: typeof action?.args?.bin === 'string' ? action.args.bin : null } : null,
      );
    },
  });

  const face = (c: Card, size: number) => {
    const h = highlight?.id === c.id ? highlight : null;
    if (isShape(c.card)) {
      return (
        <ShapeView
          card={c.card}
          extent={extent}
          size={size}
          mark={h?.mark ?? null}
          upto={h?.upto}
        />
      );
    }
    switch (c.card.kind) {
      case 'object':
        return (
          <span className="ni-ssort__sprite" style={{ width: size * 0.92, height: size * 0.92 }}>
            <ObjectSprite sprite={c.card.sprite} />
          </span>
        );
      case 'number':
        return <span className="ni-ssort__numeral">{c.card.value}</span>;
      default:
        return <span className="ni-ssort__word">{name(c)}</span>;
    }
  };

  const countBadge = (c: Card) => {
    const h = highlight?.id === c.id ? highlight : null;
    if (!h) return null;
    const total = markCount(c.card, h.mark);
    const n = h.upto ?? total;
    return n === null || n === undefined ? null : (
      <span className="ni-ssort__count" data-count={n} aria-hidden="true">
        {n}
      </span>
    );
  };

  // Pip's hand under the invited card (kit useInviteHand); the bin it goes in pulses too.
  const { hand, rootStyle: handStyle } = useInviteHand(
    root,
    (r) =>
      invite?.id ? r.querySelector<HTMLElement>(`.ni-ssort__card[data-id="${invite.id}"]`) : null,
    invite?.id ? `${invite.id}:${invite.bin ?? ''}` : '',
  );

  // ---------- find-all and odd-one-out: tap cards ----------
  if (config.mode !== 'sort') {
    const picked = (id: string) =>
      config.mode === 'find-all' ? state.picked.includes(id) : state.choice === id;
    return (
      <div
        ref={root}
        className="ni-ssort"
        data-mode={config.mode}
        data-tier={tier}
        data-compact={compact ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        style={
          { '--n': config.cards.length, '--size': `${pickSize}px`, ...handStyle } as CSSProperties
        }
      >
        <fieldset
          className="ni-ssort__cards"
          aria-label={t(config.mode === 'find-all' ? 'ui.ssort.find' : 'ui.widget.choices')}
          disabled={!interactive}
        >
          {config.cards.map((c) => (
            <span key={c.id} className="ni-ssort__slot">
              <button
                type="button"
                className={[
                  'ni-ssort__card',
                  invite?.id === c.id ? 'ni-invite' : '',
                  highlight?.id === c.id ? 'ni-ssort__card--lit' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-id={c.id}
                data-flip={c.id}
                aria-label={name(c)}
                aria-pressed={picked(c.id)}
                onClick={() => tapCard(c)}
              >
                {face(c, pickSize)}
                {picked(c.id) ? (
                  <span className="ni-ssort__tick" aria-hidden="true">
                    <TickIcon />
                  </span>
                ) : null}
              </button>
              {countBadge(c)}
            </span>
          ))}
        </fieldset>
        <div className="ni-ssort__check">
          <CheckButton onPress={submit} disabled={!interactive || !response} />
        </div>
        {hand}
      </div>
    );
  }

  // ---------- sort: tray and bins ----------
  const bins = config.bins ?? [];
  const trayCards = config.cards.filter((c) => binOf(c.id) === TRAY);
  // One card size (outer px) for the tray and the bins: as large as the area allows for where the
  // cards are now, never under the target size plus 4 (cards in bins are tapped and dragged too).
  const outer = sortCardSize({
    width: avail?.width ?? 1100,
    height: avail?.height ?? 640,
    compact,
    kMode: ageMode === 'k',
    minT,
    tray: trayCards.length,
    bins: bins.map((b) => (state.bins[b.id] ?? []).length),
  });
  const traySize = outer - 16;
  const binSize = outer - 16;
  const cardButton = (c: Card, size: number) => {
    const p = dnd.itemProps(c.id, { label: name(c) });
    return (
      <span key={c.id} className="ni-ssort__slot" data-flip={c.id}>
        <span
          {...p}
          className={[
            p.className,
            'ni-ssort__card',
            invite?.id === c.id ? 'ni-invite' : '',
            highlight?.id === c.id ? 'ni-ssort__card--lit' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-id={c.id}
          style={{ '--size': `${size}px` } as CSSProperties}
        >
          {face(c, size)}
        </span>
        {countBadge(c)}
      </span>
    );
  };
  const pad = (id: string, label: string) => {
    const p = dnd.targetProps(id, { label });
    return (
      <button
        type="button"
        {...p}
        // One invited control (the card): the bin shows its drop highlight once the card is picked.
        className={[p.className, 'ni-ssort__pad'].join(' ')}
        onClick={(e) => {
          // With nothing picked up, tapping a bin says its name.
          if (dnd.selected === null && id !== TRAY) say(bins.find((b) => b.id === id)?.label ?? '');
          p.onClick(e);
        }}
      />
    );
  };
  return (
    <div
      ref={root}
      className="ni-ssort"
      data-mode="sort"
      data-tier={tier}
      data-bins={bins.length}
      data-compact={compact ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={{ '--n': config.cards.length, '--bins': bins.length, ...handStyle } as CSSProperties}
    >
      <div className="ni-ssort__top">
        <div
          className="ni-ssort__tray"
          data-bin={TRAY}
          // An empty tray keeps one row of room (the cards' padding is 12 or 14 px).
          style={{ minHeight: outer + (compact ? 24 : 28) }}
        >
          {pad(TRAY, t('ui.ssort.tray'))}
          <div className="ni-ssort__tray-cards">
            {trayCards.map((c) => cardButton(c, traySize))}
          </div>
        </div>
        <div className="ni-ssort__check">
          <CheckButton onPress={submit} disabled={!interactive || !response} />
        </div>
      </div>
      <div className="ni-ssort__bins">
        {bins.map((b) => (
          <div
            key={b.id}
            className="ni-ssort__bin"
            data-bin={b.id}
            // Bins widen with their cards, so a full bin keeps one row where it can.
            style={{ flexGrow: binWeight((state.bins[b.id] ?? []).length) }}
          >
            {pad(b.id, t(b.label))}
            <span className="ni-ssort__label" aria-hidden="true">
              {t(b.label)}
            </span>
            <div className="ni-ssort__bin-cards">
              {(state.bins[b.id] ?? []).map((id) => {
                const c = cardById.get(id);
                return c ? cardButton(c, binSize) : null;
              })}
            </div>
          </div>
        ))}
      </div>
      {hand}
    </div>
  );
}

/**
 * The sort layout's card size (outer CSS px): the largest from 120 down to `minT + 4` at which the
 * tray's cards and each bin's cards, wrapped into rows, fit the area's height. Bins share the
 * width in proportion to their cards (`binWeight`). The numbers mirror shape-sort.css (paddings,
 * gaps, the bin label, the concrete ledge) and the Check column.
 */
export function sortCardSize(a: {
  width: number;
  height: number;
  compact: boolean;
  kMode: boolean;
  minT: number;
  tray: number;
  bins: readonly number[];
}): number {
  const gap = 12;
  const css = a.compact
    ? { padX: 8, padY: 8, gapY: 12, topGap: 12, binsGap: 12, cardsPad: 12, label: 36 }
    : { padX: 24, padY: 44, gapY: 16, topGap: 20, binsGap: 20, cardsPad: 14, label: 45 };
  const checkW = a.kMode ? 120 : 210;
  const trayW = a.width - css.padX - css.topGap - checkW;
  const binsW = a.width - css.padX - Math.max(0, a.bins.length - 1) * css.binsGap;
  const weights = a.bins.map(binWeight);
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const perRow = (w: number, c: number) =>
    Math.max(1, Math.floor((w - 2 * css.cardsPad + gap) / (c + gap)));
  const block = (n: number, per: number, c: number) => {
    const rows = Math.max(1, Math.ceil(n / per));
    return rows * c + (rows - 1) * gap + 2 * css.cardsPad;
  };
  const min = a.minT + 4;
  for (let c = 120; c > min; c -= 4) {
    const tray = block(a.tray, perRow(trayW, c), c);
    const bin = Math.max(
      0,
      ...a.bins.map(
        (n, i) => css.label + block(n, perRow((binsW * (weights[i] ?? 1)) / total, c), c) + 6,
      ),
    );
    if (css.padY + tray + css.gapY + bin <= a.height) return c;
  }
  return min;
}

/** A bin's share of the row: its cards (at least one card's room, so an empty bin has a place). */
export const binWeight = (cards: number) => Math.max(1, cards);

function TickIcon() {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14" fill="var(--color-ink)" />
      <path
        d="M9 16.5l4.5 4.5L23 11"
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default ShapeSortWidget;
