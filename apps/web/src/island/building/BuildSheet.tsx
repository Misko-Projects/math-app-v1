// The build sheet (05 §6, 06 §2 "Build"; #22 part 2): recipe cards with countable costs. Each
// card is a building the family may buy, or the next level of one that stands. A recipe line is
// a picture of what it needs: every unit the family already has is drawn in full, every unit
// still missing as a faint outline, so the child counts what is left (05 §6 "reading a recipe is
// itself light math"). Kindergarten sees ten-frames, one per ten; from grade 1 the units stand in
// bundles of ten with the ones loose and the numeral beside them (05 §3).
//
// The sheet pages (two cards a page) and never scrolls. A card that cannot be bought says why:
// what is short, or the picture of what unlocks it. Nothing here writes: the island does.

import type { GameData, NarrationKey } from '@number-island/shared';
import {
  BigButton,
  BuildingArtView,
  buildingArtFor,
  IconButton,
  type ItemArt,
  icons,
  materialArtFor,
  ReplayButton,
  Sheet,
  useNarrationText,
  useSpeech,
  useUiPreferences,
} from '@number-island/ui';
import { useState } from 'react';
import type { PileMode } from '../Storehouse';
import { HammerIcon, StoneChip } from './BuildIcons';
import type { BuildCard, RecipeNeed, RuleHint } from './rules';

export const CARDS_PER_PAGE = 2;
/** The side of a card's building picture, which is also a button (06 §4: at least 64 px). */
const ART_BOX = 96;

type ArtId = Parameters<typeof BuildingArtView>[0]['id'];

/** A building's art id, when the kit draws it. */
export function artIdOf(art: string): ArtId | null {
  return buildingArtFor(art) ? (art.replace(/^building\//, '') as ArtId) : null;
}

export const buildingName = (id: string) => `game.building.${id}` as NarrationKey;

function LockIcon({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M15 22v-7a9 9 0 0 1 18 0v7" fill="none" stroke="#243b53" strokeWidth={5} />
      <rect
        x={9}
        y={21}
        width={30}
        height={22}
        rx={6}
        fill="#f4c152"
        stroke="#243b53"
        strokeWidth={3}
      />
      <circle cx={24} cy={32} r={4} fill="#243b53" />
    </svg>
  );
}

/** One unit of a recipe: in the Storehouse (drawn in full) or still missing (a faint outline). */
function Unit({ Icon, have, size }: { Icon: ItemArt; have: boolean; size: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-[4px]"
      style={{
        width: size,
        height: size,
        ...(have ? {} : { outline: '2px dashed rgb(36 59 83 / 0.55)', outlineOffset: -2 }),
      }}
      data-unit={have ? 'have' : 'missing'}
    >
      <Icon size={size - 4} style={have ? undefined : { opacity: 0.25 }} />
    </span>
  );
}

function TenFrames({ need, Icon, cell }: { need: RecipeNeed; Icon: ItemArt; cell: number }) {
  const frames = Math.ceil(need.need / 10);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {Array.from({ length: frames }, (_, f) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: frames in order
          key={f}
          className="grid grid-cols-5 gap-[2px] rounded-[6px] bg-ink/70 p-[3px]"
          data-pile="ten-frame"
        >
          {Array.from({ length: 10 }, (_, c) => {
            const i = f * 10 + c;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: ten fixed cells
                key={c}
                className="flex items-center justify-center rounded-[3px] bg-paper"
                style={{ width: cell, height: cell }}
              >
                {i < need.need ? <Unit Icon={Icon} have={i < need.have} size={cell} /> : null}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}

function BaseTen({ need, Icon }: { need: RecipeNeed; Icon: ItemArt }) {
  const tens = Math.floor(need.need / 10);
  const ones = need.need % 10;
  return (
    <span className="flex items-end gap-2">
      {Array.from({ length: tens }, (_, t) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: bundles in order
          key={t}
          className="flex flex-col-reverse gap-px rounded-[6px] bg-sand-deep/60 p-[2px] ring-2 ring-ink/60"
          data-pile="ten"
        >
          {Array.from({ length: 10 }, (_, u) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ten fixed units
            <span key={u} className="flex h-[7px] items-center overflow-hidden">
              <Unit Icon={Icon} have={t * 10 + u < need.have} size={20} />
            </span>
          ))}
        </span>
      ))}
      {ones > 0 ? (
        <span className="grid grid-cols-5 gap-[2px]" data-pile="ones">
          {Array.from({ length: ones }, (_, u) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: loose units in order
            <Unit key={u} Icon={Icon} have={tens * 10 + u < need.have} size={26} />
          ))}
        </span>
      ) : null}
      <span className="font-display text-[2rem] font-bold leading-none text-ink">{need.need}</span>
    </span>
  );
}

function RecipeLine({
  need,
  gameData,
  mode,
  cell,
}: {
  need: RecipeNeed;
  gameData: Pick<GameData, 'materials'>;
  mode: PileMode;
  cell: number;
}) {
  const text = useNarrationText();
  const material = gameData.materials.find((m) => m.id === need.materialId);
  const Icon = material ? materialArtFor(material.art) : undefined;
  if (!material || !Icon) throw new Error(`BuildSheet: no art for material ${need.materialId}`);
  return (
    <li
      className="flex items-center gap-2"
      role="img"
      aria-label={`${text(material.name)}: ${need.have} / ${need.need}`}
      data-material={need.materialId}
      data-need={need.need}
      data-missing={need.missing}
    >
      <Icon size={40} />
      {mode === 'ten-frames' ? (
        <TenFrames need={need} Icon={Icon} cell={cell} />
      ) : (
        <BaseTen need={need} Icon={Icon} />
      )}
      {need.missing === 0 ? <icons.CheckIcon width={28} height={28} /> : null}
    </li>
  );
}

const HINT_LINE: Record<RuleHint['kind'], NarrationKey> = {
  building: 'ui.build.locked.building',
  road: 'ui.build.locked.road',
  residents: 'ui.build.locked.residents',
  practice: 'ui.build.locked.practice',
};

function Hint({ hint, gameData }: { hint: RuleHint; gameData: Pick<GameData, 'buildings'> }) {
  if (hint.kind === 'building') {
    const def = gameData.buildings.find((b) => b.id === hint.buildingId);
    const id = def ? artIdOf(def.art) : null;
    return id ? (
      <BuildingArtView id={id} stage={hint.level} style={{ width: 64, height: 64 }} />
    ) : null;
  }
  if (hint.kind === 'road') return <StoneChip n={hint.length} />;
  return <icons.StarIcon width={56} height={56} />;
}

function Card({
  card,
  gameData,
  mode,
  onBuy,
}: {
  card: BuildCard;
  gameData: Pick<GameData, 'materials' | 'buildings'>;
  mode: PileMode;
  onBuy: (card: BuildCard) => void;
}) {
  const text = useNarrationText();
  const { say } = useSpeech();
  const { textLabels } = useUiPreferences();
  const { building } = card;
  const id = artIdOf(building.art);
  const name = buildingName(building.id);
  const cell = card.needs.every((n) => n.need <= 10) ? 28 : 16;
  const hint = card.hints[0];
  const why: NarrationKey | null =
    card.state === 'short'
      ? 'ui.build.short'
      : card.state === 'no-room'
        ? 'ui.build.noroom'
        : hint
          ? HINT_LINE[hint.kind]
          : null;
  return (
    <li
      className="flex min-w-0 flex-1 flex-col gap-3 rounded-[24px] bg-paper p-3 ring-4 ring-sand-deep"
      data-card={building.id}
      data-state={card.state}
      data-level={card.level}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-[16px] bg-sand/60 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
          style={{ width: ART_BOX, height: ART_BOX }}
          aria-label={text(name)}
          onClick={() => say(name)}
        >
          {/* Every building in the same box, whatever its shape: the drawing scales to fit. */}
          {id ? (
            <BuildingArtView
              id={id}
              stage={card.level}
              style={{ width: ART_BOX - 8, height: ART_BOX - 8 }}
            />
          ) : null}
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          {textLabels ? (
            <span className="max-w-full truncate font-body text-[1.5rem] font-bold leading-tight text-ink">
              {text(name)}
            </span>
          ) : null}
          {/* The level this card buys: one star per level. A locked card keeps the room for
              what unlocks it. */}
          {card.state === 'locked' ? null : (
            <span className="flex gap-1" role="img" aria-label={`${card.level} / 3`}>
              {[1, 2, 3].map((l) => (
                <icons.StarIcon
                  key={l}
                  width={24}
                  height={24}
                  style={{ opacity: l <= card.level ? 1 : 0.25 }}
                />
              ))}
            </span>
          )}
        </div>
        {card.state === 'ready' ? (
          <BigButton
            label={card.instanceId === null ? 'ui.build.build' : 'ui.build.upgrade'}
            icon={<HammerIcon size={40} />}
            tone="leaf"
            onPress={() => onBuy(card)}
          />
        ) : (
          <span className="flex items-center gap-2" data-testid="card-why">
            {card.state === 'locked' ? (
              <>
                <LockIcon />
                {card.hints.map((h) => (
                  <Hint key={JSON.stringify(h)} hint={h} gameData={gameData} />
                ))}
              </>
            ) : null}
            {why ? <ReplayButton caption={false} onPress={() => say(why)} /> : null}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {card.needs.map((need) => (
          <RecipeLine
            key={need.materialId}
            need={need}
            gameData={gameData}
            mode={mode}
            cell={cell}
          />
        ))}
      </ul>
    </li>
  );
}

export default function BuildSheet({
  open,
  onClose,
  cards,
  gameData,
  mode,
  onBuy,
}: {
  open: boolean;
  onClose: () => void;
  cards: readonly BuildCard[];
  gameData: Pick<GameData, 'materials' | 'buildings'>;
  mode: PileMode;
  /** The child chose a card that can be bought now. */
  onBuy: (card: BuildCard) => void;
}) {
  const [page, setPage] = useState(0);
  // Every opening starts on the first page: what can be bought now.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setPage(0);
  }
  const pages = Math.max(1, Math.ceil(cards.length / CARDS_PER_PAGE));
  const at = Math.min(page, pages - 1);
  const shown = cards.slice(at * CARDS_PER_PAGE, (at + 1) * CARDS_PER_PAGE);
  // The pager sits in the sheet's header row, beside its close button, so the cards keep the
  // sheet's whole height.
  const pager =
    pages > 1 ? (
      <div className="flex items-center gap-4">
        <IconButton
          label="ui.build.prev"
          icon={<icons.BackIcon />}
          disabled={at === 0}
          onPress={() => setPage(at - 1)}
          data={{ 'data-testid': 'build-prev' }}
        />
        <span className="flex gap-[6px]" role="img" aria-label={`${at + 1} / ${pages}`}>
          {Array.from({ length: pages }, (_, p) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: pages in order
              key={p}
              className="rounded-full bg-ink"
              style={{ width: 12, height: 12, opacity: p === at ? 1 : 0.25 }}
            />
          ))}
        </span>
        <IconButton
          label="ui.btn.next"
          icon={<icons.ArrowIcon />}
          disabled={at === pages - 1}
          onPress={() => setPage(at + 1)}
          data={{ 'data-testid': 'build-next' }}
        />
      </div>
    ) : undefined;
  return (
    <Sheet open={open} onClose={onClose} label="ui.build.open" placement="center" header={pager}>
      {open ? (
        <ul
          className="flex items-start gap-4"
          data-testid="build-sheet"
          data-page={at}
          data-pages={pages}
        >
          {shown.map((card) => (
            <Card
              key={card.building.id}
              card={card}
              gameData={gameData}
              mode={mode}
              onBuy={onBuy}
            />
          ))}
        </ul>
      ) : null}
    </Sheet>
  );
}
