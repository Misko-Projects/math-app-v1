import {
  type FormatModel,
  formatModel,
  ruleMatches,
  type ShapeSortState,
  sortCardProps,
} from '@number-island/engine';
import type { ShapeCard, SortRule, WidgetAction } from '@number-island/shared';
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
  shapeBox,
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
  // An event card is named by its picture's name (PR #132 review: the bare id has no clip).
  if (c.kind === 'event') return `ui.sprite.event-${c.event}`;
  return null;
}

/**
 * What a card says on tap (`spoken`) and carries as its accessible name, by rule (never by
 * template). A number or word card reads its face, aloud too. A picture card (shape, object,
 * coin) says its name aloud only when the config marks names as given (`namesGiven`: the ask is
 * a side count, a colour, a weight …). Otherwise its name may be the answer (a kind sort or
 * find), so a tap says nothing, and the accessible name (what a screen reader reads on focus,
 * standing in for the picture) describes what a sighted child sees:
 * - a flat shape among flat shapes: its place and counts, "Shape 3, 6 sides, 6 corners", never
 *   its name, unless another kind in the set has the same counts (a square and a trapezoid);
 * - that card, a solid, any card among solids (a flat-or-solid ask), an object or a coin: its
 *   name, as the picture shows it (no description says "cone" without saying it rolls, or
 *   tells a square from a kite without saying which has equal sides).
 */
export type CardSpeech =
  | { number: number }
  | { key: string; vars?: Record<string, string | number>; spoken: boolean };

export function cardSpeech(config: Config, c: Card): CardSpeech {
  if (!isShape(c.card) && c.card.kind === 'number') return { number: c.card.value };
  if (!isShape(c.card) && c.card.kind === 'event') {
    return { key: `ui.sprite.event-${c.card.event}`, spoken: true };
  }
  const key = cardNameKey(c.card) ?? c.id;
  if (config.namesGiven) return { key, spoken: true };
  const flatAmongFlat =
    isShape(c.card) &&
    config.cards.every((x) => !isShape(x.card) || !x.card.props.solid) &&
    !c.card.props.solid;
  if (isShape(c.card) && flatAmongFlat) {
    const card = c.card;
    const { sides, corners } = card.props;
    // Counts that another kind in the set shares (a square and a trapezoid, a circle and an
    // oval) cannot tell the pictures apart: such a card keeps its name for a screen reader, as a
    // solid does, so no item is impossible to answer by ear (review round 1).
    const ambiguous = config.cards.some(
      (x) =>
        isShape(x.card) &&
        x.card.shape !== card.shape &&
        x.card.props.sides === sides &&
        x.card.props.corners === corners,
    );
    if (!ambiguous) {
      const n = config.cards.findIndex((x) => x.id === c.id) + 1;
      return { key: 'ui.ssort.shape', vars: { n, sides, corners }, spoken: false };
    }
  }
  return { key, spoken: false };
}

/**
 * The card a bin shows as its picture: one it takes, only when the config marks bin pictures as
 * given (`binPicturesGiven`, a data sort into categories the child sees). Otherwise the bin shows
 * its name alone: a card in the picture would show which card goes in it.
 */
export function binPictureCard(config: Config, bin: { rule: SortRule }): Card | null {
  if (!config.binPicturesGiven) return null;
  return config.cards.find((x) => ruleMatches(bin.rule, sortCardProps(x.card))) ?? null;
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
  // Find-all and odd-one-out have no tray or bins to keep room for: the cards use the area, in
  // the rows that make them biggest (evidence review: six small cards sat in an empty panel).
  const pick = pickLayout({
    width: avail?.width ?? 1100,
    height: avail?.height ?? 640,
    cards: config.cards.length,
    kMode: ageMode === 'k',
    minT,
  });
  const pickSize = pick.size;
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

  /** A card's accessible name (`cardSpeech`: never its name where the name is the answer). */
  const name = (c: Card) => {
    const s = cardSpeech(config, c);
    return 'number' in s ? String(s.number) : t(s.key, s.vars);
  };
  /** A child's tap: the card says what `cardSpeech` allows, and nothing when its name is held. */
  const speak = (c: Card) => {
    const s = cardSpeech(config, c);
    if ('number' in s) sayNumber(s.number);
    else if (s.spoken) say(s.key, s.vars);
  };
  /** A demo (a worked example the child watches) names the card it moves. */
  const speakName = (c: Card) => {
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
            else speakName(card);
          }
          await pause(1300);
          if (!alive.current) return;
          setHighlight(null);
          return;
        }
        // drag-card and answer: point at the card, then move or pick it.
        setHighlight({ id: card.id, mark: 'shape' });
        speakName(card);
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
      default: {
        // A coin or an event card's face is its word.
        const key = cardNameKey(c.card);
        return <span className="ni-ssort__word">{key ? t(key) : c.id}</span>;
      }
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

  // The guide's hand under the invited card (kit useInviteHand); the bin it goes in pulses too.
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
          style={{ width: pick.width, gap: PICK_GAP }}
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
  // A tray card invited: room under the tray's cards for the guide's hand (it hangs about 46 px below
  // the card), 8+ px clear of the tray's border; only while invited.
  const trayInvited = invite?.id ? binOf(invite.id) === TRAY : false;
  const L = sortLayout(compact);
  const sizes = sortSizes({
    width: avail?.width ?? 1100,
    height: avail?.height ?? 640,
    compact,
    kMode: ageMode === 'k',
    minT,
    tray: trayCards.length,
    bins: bins.map((b) => (state.bins[b.id] ?? []).length),
    handRoom: trayInvited ? TRAY_HAND_ROOM : 0,
  });
  const outer = sizes.full;
  /**
   * A bin's picture (05: K content must not rely on reading), where the config gives it
   * (`binPictureCard`); otherwise the bin shows its name, and says it when tapped.
   */
  const binIcon = (b: (typeof bins)[number]) => {
    const c = binPictureCard(config, b);
    if (!c) return null;
    if (isShape(c.card)) {
      // Its own tight box (not the cards' shared scale), upright, about 40 px across.
      const card = { ...c.card, rotationDeg: 0, scale: 1 };
      const box = shapeBox(card);
      return <ShapeView card={card} unitPx={BIN_ICON_PX / Math.max(box.width, box.height)} />;
    }
    return face(c, BIN_ICON_PX);
  };
  const binIcons = bins.map(binIcon);
  /**
   * A card `outer` px across. Smaller than full size (a crowded tray or bin in the short area) it
   * keeps its shape, drawn smaller, and is picked up from a cell round it: the target's height,
   * and as wide as the card and half the gap to each neighbour, so the nearer card always wins.
   */
  const cardButton = (c: Card, cardOuter: number, gap: number) => {
    const p = dnd.itemProps(c.id, { label: name(c) });
    const small = cardOuter < outer;
    const size = small ? cardOuter - SMALL_CARD_FRAME : cardOuter - 16;
    const reach = Math.max(0, (minT - cardOuter) / 2);
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
          data-small={small ? 'true' : undefined}
          style={{ '--size': `${size}px` } as CSSProperties}
        >
          {small ? (
            <span
              className="ni-ssort__hit"
              style={{ inset: `${-reach - 3}px ${-gap / 2 - 3}px` }}
              aria-hidden="true"
            />
          ) : null}
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
          // An empty tray keeps one row of room; its cards sit centred in it.
          style={{ minHeight: outer + 2 * L.cardsPad }}
        >
          {pad(TRAY, t('ui.ssort.tray'))}
          <div
            className="ni-ssort__tray-cards"
            style={
              trayInvited
                ? {
                    paddingTop: L.cardsPad + TRAY_HAND_ROOM,
                    paddingBottom: L.cardsPad + TRAY_HAND_ROOM,
                  }
                : undefined
            }
          >
            {trayCards.map((c) => cardButton(c, sizes.tray, 12))}
          </div>
        </div>
        <div className="ni-ssort__check">
          <CheckButton onPress={submit} disabled={!interactive || !response} />
        </div>
      </div>
      <div className="ni-ssort__bins">
        {bins.map((b, bi) => (
          <div
            key={b.id}
            className="ni-ssort__bin"
            data-bin={b.id}
            data-fixed="true"
            // Bins widen with their cards; each bin's width is set outright (sortSizes), so its
            // cards stay in one row.
            style={
              {
                flex: `0 0 ${sizes.binWidths[bi]}px`,
                // An empty bin keeps a row of room: its header, padding, one card, its lip.
                minHeight: L.head + L.cardsPad + outer + L.binBottom,
                '--bin-head': `${L.head}px`,
              } as CSSProperties
            }
          >
            {pad(b.id, t(b.label))}
            {/* The bin's picture and its name, ABOVE its frame: rings inside the frame never
                touch the name (evidence review). */}
            <span className="ni-ssort__bin-head" aria-hidden="true">
              {binIcons[bi] ? (
                <span className="ni-ssort__bin-icon" data-bin-icon={b.id}>
                  {binIcons[bi]}
                </span>
              ) : null}
              {/* A bin squeezed narrower than its name keeps its picture (the name is still the
                  bin's accessible name, and is said when the bin is tapped). A bin with no
                  picture always shows its name. */}
              {binIcons[bi] && (sizes.binWidths[bi] as number) < binHeadWidth(t(b.label)) ? null : (
                <span className="ni-ssort__label" data-alone={binIcons[bi] ? undefined : 'true'}>
                  {t(b.label)}
                </span>
              )}
            </span>
            <div
              className="ni-ssort__bin-cards"
              data-small={sizes.bin < outer ? 'true' : undefined}
              style={sizes.bin < outer ? { gap: SMALL_BIN_GAP, flexWrap: 'nowrap' } : undefined}
            >
              {(state.bins[b.id] ?? []).map((id) => {
                const c = cardById.get(id);
                return c ? cardButton(c, sizes.bin, sizes.bin < outer ? SMALL_BIN_GAP : 12) : null;
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
 * Room for the guide's hand under an invited tray card (8+ px clear of the tray's border), added above
 * the cards too, so they stay centred in the tray (evidence review: top-packed, 14 vs 53 px).
 */
const TRAY_HAND_ROOM = 42;
/** A bin's picture: the face of a card it takes, at least 40 px (8 px clear of the frame). */
const BIN_ICON_PX = 46;

/**
 * The sort layout's measures (px), mirrored by shape-sort.css: root padding, gaps (the Check
 * column 20/24 px from the tray, room for its 8 px focus ring), the cards' padding, the bin's
 * header above its frame (picture and name), and under a bin's cards: 12 px of free space above
 * its lip, the lip (6/10), the border (4) and a card's 6 px base.
 */
export function sortLayout(compact: boolean) {
  return compact
    ? {
        padX: 8,
        padY: 8,
        gapY: 12,
        topGap: 20,
        binsGap: 12,
        cardsPad: 16,
        head: 58,
        lip: 6,
        binBottom: 28,
      }
    : {
        padX: 24,
        padY: 16,
        gapY: 16,
        topGap: 24,
        binsGap: 20,
        cardsPad: 16,
        head: 64,
        lip: 10,
        binBottom: 32,
      };
}

/**
 * The sort layout's card size (outer CSS px): the largest from 120 down to `minT + 4` at which the
 * tray's cards and each bin's cards, wrapped into rows, fit the area's height. Bins share the
 * width in proportion to their cards (`binWeight`). `handRoom` is extra room under the tray's cards
 * while one of them is invited.
 */
export interface SortArea {
  width: number;
  height: number;
  compact: boolean;
  kMode: boolean;
  minT: number;
  tray: number;
  bins: readonly number[];
  handRoom?: number;
}

export function sortCardSize(area: SortArea): number {
  // The widget is never wider than its own cap, however wide the area (review round 2).
  const a = { ...area, width: Math.min(area.width, SORT_MAX_WIDTH) };
  const gap = 12;
  const L = sortLayout(a.compact);
  const css = { ...L, label: L.head };
  const trayBottom = L.cardsPad + (a.handRoom ?? 0);
  const binBottom = L.binBottom;
  const checkW = a.kMode ? 120 : 210;
  const trayW = a.width - css.padX - css.topGap - checkW;
  const binsW = a.width - css.padX - Math.max(0, a.bins.length - 1) * css.binsGap;
  const weights = a.bins.map(binWeight);
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const perRow = (w: number, c: number) =>
    Math.max(1, Math.floor((w - 2 * css.cardsPad + gap) / (c + gap)));
  const block = (n: number, per: number, c: number, bottom: number) => {
    const rows = Math.max(1, Math.ceil(n / per));
    return rows * c + (rows - 1) * gap + css.cardsPad + bottom;
  };
  const min = a.minT + 4;
  const fitsAt = (c: number) => {
    // The hand room goes above the cards as well as below them (they stay centred).
    const tray = block(a.tray, perRow(trayW, c), c, trayBottom) + (a.handRoom ?? 0);
    const bin = Math.max(
      0,
      ...a.bins.map(
        (n, i) =>
          css.label + block(n, perRow((binsW * (weights[i] ?? 1)) / total, c), c, binBottom) + 6,
      ),
    );
    return css.padY + tray + css.gapY + bin <= a.height;
  };
  for (let c = 120; c > min; c -= 4) if (fitsAt(c)) return c;
  return min;
}

/** The widget's widest (shape-sort.css `.ni-ssort { max-width }`). */
export const SORT_MAX_WIDTH = 1180;
/** The gap between find-all and odd-one-out cards (two target gaps). */
const PICK_GAP = 24;
/** The largest a find-all or odd-one-out card's picture is drawn. */
const PICK_SIZE_MAX = 184;

/**
 * Find-all and odd-one-out: the picture size (a card is 16 px larger) and the card block's width
 * for the number of rows (one to three) that makes the cards biggest in the area, beside the
 * Check button. Never under a touch target.
 */
export function pickLayout(a: {
  width: number;
  height: number;
  cards: number;
  kMode: boolean;
  minT: number;
}): { size: number; perRow: number; width: number } {
  const checkW = a.kMode ? 120 : 210;
  // The widget is never wider than its own cap, however wide the area (review round 2).
  const width = Math.min(a.width, SORT_MAX_WIDTH);
  // Root padding (24), the 40 px between cards and Check, the block's own padding (16).
  const roomW = width - 24 - 40 - checkW - 16;
  const roomH = a.height - 16 - 32;
  let best = { outer: 0, perRow: Math.max(1, a.cards) };
  for (let rows = 1; rows <= Math.min(3, Math.max(1, a.cards)); rows += 1) {
    const perRow = Math.ceil(a.cards / rows);
    const outer = Math.floor(
      Math.min(
        (roomW + PICK_GAP) / perRow - PICK_GAP,
        (roomH + PICK_GAP) / rows - PICK_GAP,
        PICK_SIZE_MAX + 16,
      ),
    );
    if (outer > best.outer) best = { outer, perRow };
  }
  const outer = Math.max(a.minT, best.outer);
  return {
    size: outer - 16,
    perRow: best.perRow,
    width: best.perRow * outer + (best.perRow - 1) * PICK_GAP + 16,
  };
}

/**
 * The room a bin's header needs for its picture and its name (32 px bold: at most about 20 px a
 * letter), with the header's padding.
 */
export const binHeadWidth = (label: string) => BIN_ICON_PX + 8 + 20 * label.length + 16;

/** A small card's frame: its 3 px border and 3 px padding on each side. */
const SMALL_CARD_FRAME = 12;
/** The gap between small cards in a crowded bin. */
const SMALL_BIN_GAP = 6;
/** The narrowest a bin is drawn in the short area: its picture and name, or one small card. */
export const COMPACT_BIN_MIN_W = 112;
/** The smallest a card is ever drawn (px across): its shape and marks stay readable. */
export const SMALL_CARD_MIN = 48;

/**
 * Card sizes for the sort layout (outer px). `full` is `sortCardSize`. The tray and each bin
 * keep one row: a second row never fits the short area, and a bin that grew a row would push the
 * layout past any area's height. A crowded tray or bin draws its cards smaller instead: `tray`
 * and `bin` (one size for every bin, so the shrink is uniform) are `full` wherever one row holds
 * the cards at that size, which is everywhere the area has room. `binWidths` are the bins'
 * widths: each has `COMPACT_BIN_MIN_W` and shares the rest in proportion to its cards.
 */
export function sortSizes(area: SortArea): {
  full: number;
  tray: number;
  bin: number;
  binWidths: number[];
} {
  const full = sortCardSize(area);
  const a = { ...area, width: Math.min(area.width, SORT_MAX_WIDTH) };
  const L = sortLayout(a.compact);
  const checkW = a.kMode ? 120 : 210;
  const trayW = a.width - L.padX - L.topGap - checkW;
  const binsW = a.width - L.padX - Math.max(0, a.bins.length - 1) * L.binsGap;
  const cards = a.bins.reduce((s, n) => s + n, 0);
  const spare = Math.max(0, binsW - a.bins.length * COMPACT_BIN_MIN_W);
  const binWidths = a.bins.map((n) =>
    Math.floor(COMPACT_BIN_MIN_W + (cards > 0 ? (spare * n) / cards : spare / a.bins.length)),
  );
  /** The largest card of which `n` fit one row `w` wide, `gap` apart. */
  const oneRow = (w: number, n: number, gap: number) =>
    n === 0 ? full : Math.floor((w - 2 * L.cardsPad + gap) / n) - gap;
  const fit = (size: number) => Math.max(SMALL_CARD_MIN, Math.min(full, size));
  const tray = fit(oneRow(trayW, a.tray, 12));
  const binFull = Math.min(...a.bins.map((n, i) => oneRow(binWidths[i] as number, n, 12)), full);
  const bin =
    binFull >= full
      ? full
      : fit(Math.min(...a.bins.map((n, i) => oneRow(binWidths[i] as number, n, SMALL_BIN_GAP))));
  return { full, tray, bin, binWidths };
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
