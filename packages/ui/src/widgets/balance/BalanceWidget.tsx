import {
  type BalanceState,
  type BalanceTerm,
  balanceBlanks,
  balanceEntryMax,
  formatModel,
  heavier,
  sideValue,
} from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { IconButton } from '../../primitives/IconButton';
import { useWidgetDemo } from '../demo';
import {
  AskEntry,
  COMPACT_ROOM_H,
  demoEnterAnswer,
  fivesGrid,
  nextPadKey,
  ObjectSprite,
  type PadKey,
  PickCard,
  roomBox,
  StepActions,
  spriteNameKey,
  useActionSize,
  useAlive,
  useDemoPause,
  useInviteHand,
  useModelState,
  useSmallestRoom,
  useSubmitGuard,
  useWidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { ChoiceArt, type ChoiceGlyph, PanButtonIcon, StandArt } from './art';
import {
  fivesCell,
  NUMERAL_PX,
  OP_PX,
  panParts,
  panRoom,
  planBalance,
  type ScaleLayout,
  type Side,
  TILE_H,
  TILT_PX,
  tileWidth,
} from './layout';
import './balance.css';

/**
 * `balance` (03 §5.5): a pan balance with one side of an equation in each pan. "=" means "the
 * same as": the beam is level exactly when the two sides weigh the same.
 *
 * One screen, fitted to the widget's room (06 §1): the balance, the answer and Check.
 *
 * - **judge**: is it level? Two cards, the same (=) and not the same (≠) (`true` | `false`).
 * - **which-heavier**: three cards, the left side, the same, the right side.
 * - **fill-blank**: one side has a box; the kit number entry fills it, and the box shows the
 *   number.
 * - **make-equal**: under each pan, "add one" and "take one off" (the pan's own objects, or unit
 *   blocks beside its number). A pan holds at most twenty; the place for every one it can still
 *   take is there from the start, so adding moves nothing. A button that can do nothing more (a
 *   full pan, nothing added to take off) is drawn dashed; pressing it says why. Any amounts that
 *   make the pans level are right (`balance.equal`); Check is live from the start.
 *
 * The beam shows the comparison only when the item says so (`showTilt`) or a demonstration asks
 * (`tilt`, `level`). Otherwise it rests on two props: a level beam would read as "the same".
 *
 * Objects are drawn at one size in fives, numbers on tiles; no total is shown anywhere.
 *
 * Trace targets: `add-<side>`, `take-<side>`, `pan-<side>` (a touch that names what is on it),
 * `card-<id>`, `opt-<n>` (a numeral card), `key-<k>`, `step-more`, `step-less`.
 *
 * Demo ops (03 §5.5): `place {side, term, count?}` (units go on one by one; on a pan with a box
 * the number goes into the box), `tilt`, `level`, `highlight-side {side}`, plus `answer`.
 */

type Config = ConfigFor<'balance'>;
type State = BalanceState;
const SIDES = ['left', 'right'] as const;

const OPS: readonly string[] = [...FORMAT_SUPPORT.balance.ops, 'answer'];

function stateModel() {
  const m = formatModel('balance');
  if (!m) throw new Error('balance has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

// Motion (03 §6.3): short, transform-only moves.
const PLACE_MS = 280;
const SHOW_MS = 900;
const PICK_MS = 500;

/** The unit block beside a number (the kit's cube drawing, named "Block"). */
const BLOCK_SPRITE = 'cube';
/** The demonstration hand under a control (kit: 56 px, its 8 px bob, less the fingertip). */
const HAND_ROOM = 58;
const BLOCK_NAME: NarrationKey = 'ui.sprite.block';

const NOTE = {
  full: 'ui.widget.bal.note.full',
  none: 'ui.widget.bal.note.none',
} as const satisfies Record<string, NarrationKey>;

const SIDE_NAME: Record<Side, NarrationKey> = {
  left: 'ui.compare.left',
  right: 'ui.compare.right',
};
const OP_NAME: Record<'+' | '-' | '×', NarrationKey> = {
  '+': 'ui.widget.bal.op.plus',
  '-': 'ui.widget.bal.op.minus',
  '×': 'ui.widget.bal.op.times',
};
const OP_SIGN: Record<'+' | '-' | '×', string> = { '+': '+', '-': '−', '×': '×' };

interface Choice {
  id: string;
  label: NarrationKey;
  glyph: ChoiceGlyph;
}
const CHOICES: Record<'judge' | 'which-heavier', readonly Choice[]> = {
  judge: [
    // "=" means "the same as": the answer to "does it balance?" is said in those words.
    { id: 'true', label: 'ui.compare.same', glyph: 'eq' },
    { id: 'false', label: 'ui.compare.not-same', glyph: 'ne' },
  ],
  'which-heavier': [
    { id: 'left', label: 'ui.widget.bal.heavier.left', glyph: 'left' },
    { id: 'same', label: 'ui.widget.bal.heavier.same', glyph: 'same' },
    { id: 'right', label: 'ui.widget.bal.heavier.right', glyph: 'right' },
  ],
};

const isSide = (v: unknown): v is Side => v === 'left' || v === 'right';
const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
const digits = (n: number) => String(Math.abs(Math.trunc(n))).length;

export function BalanceWidget({
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
  const ageMode = prefs.ageMode;

  const mode = config.mode;
  const making = mode === 'make-equal';
  const filling = mode === 'fill-blank';
  const choices = mode === 'judge' || mode === 'which-heavier' ? CHOICES[mode] : null;
  const weights = config.objectWeights ?? {};
  const entryMax = balanceEntryMax(config);
  const blank = balanceBlanks(config)[0];

  const { state, stateRef, act, applyOp, committed } = useModelState<State>(
    () => initial(config),
    applyAction,
  );
  const [value, setValue] = useState<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [busy, setBusy] = useState(false);
  const [entryHighlight, setEntryHighlight] = useState<number | PadKey | null>(null);
  const [cardHighlight, setCardHighlight] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [note, setNote] = useState<NarrationKey | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = !disabled && !busy;

  /** A child step clears the demo's invite and the last limit note. */
  const childStep = () => {
    setInvite(null);
    setNote(null);
  };
  const speak = (key: NarrationKey) => {
    if (prefs.speakOnTap) say(key);
  };

  // ---------- what the pans hold ----------

  /** The sprite of the units a pan takes in `make-equal`: its own objects, else blocks. */
  const unitOf = (side: Side): { sprite: string; name: NarrationKey; term: BalanceTerm } => {
    const own = config[side].terms.find((x) => 'object' in x);
    return own && 'object' in own
      ? {
          sprite: own.object,
          name: spriteNameKey(own.object),
          term: { object: own.object, count: 1 },
        }
      : { sprite: BLOCK_SPRITE, name: BLOCK_NAME, term: { n: 1 } };
  };
  /** In `make-equal` a pan draws the item's terms and, apart, what the child added. */
  const termsOf = (side: Side): readonly BalanceTerm[] =>
    making ? config[side].terms : state[side];
  const roomOn = (side: Side) => panRoom(config, side);

  // ---------- layout: the measured room, the action button, the plan ----------

  // The plan is made for the smallest room the item has had (kit `useSmallestRoom`): a prompt
  // that wraps or a hint line makes the room shorter, and nothing changes places when it grows
  // back.
  const room = useSmallestRoom(useWidgetRoom(rootRef), rootRef);
  const whole = roomBox(room);
  // A demonstration that invites a pan's button hangs its hand under that button, at the very
  // bottom of the picture: while it does, the picture is planned for the room less the hand.
  const handUnder = making && invite?.op === 'place' ? HAND_ROOM : 0;
  const box = { w: whole.w, h: whole.h - handUnder };
  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const button = useActionSize(actRef, zoomRef, ageMode);
  const leftParts = panParts(config, 'left', termsOf('left'));
  const rightParts = panParts(config, 'right', termsOf('right'));
  const partsKey = JSON.stringify([leftParts, rightParts]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the parts are in partsKey
  const planned = useMemo(
    () =>
      planBalance({
        config,
        left: leftParts,
        right: rightParts,
        room: { w: box.w, h: box.h },
        button,
        ageMode,
      }),
    [config, box.w, box.h, button, ageMode, partsKey],
  );
  const plan = planned.ask;
  const layout = planned.scale;

  // ---------- the beam ----------

  const blanks = blank !== undefined ? { [blank]: value } : {};
  const tip = heavier(
    sideValue(state.left, weights, blanks),
    sideValue(state.right, weights, blanks),
  );
  // Shown when the item says so, or once a demonstration asked; else the beam rests on props.
  const released = config.showTilt || state.shown !== null;
  const beam: 'left' | 'right' | 'level' | 'held' =
    released && tip !== undefined ? (tip === 'same' ? 'level' : tip) : 'held';
  const shift = (side: Side) => (beam === side ? TILT_PX : isSide(beam) ? -TILT_PX : 0);
  const beamLength = layout.pan.w + layout.gap;
  const angle =
    (Math.atan2(2 * TILT_PX, beamLength) *
      180 *
      (beam === 'left' ? -1 : beam === 'right' ? 1 : 0)) /
    Math.PI;

  // ---------- child input ----------

  const onAdd = (side: Side) => {
    if (!interactive) return;
    childStep();
    trace('tap', `add-${side}`);
    const unit = unitOf(side);
    if (!act({ op: 'place', args: { side, term: unit.term } })) {
      setNote(NOTE.full);
      say(NOTE.full);
    }
  };
  const onTake = (side: Side) => {
    if (!interactive) return;
    childStep();
    trace('undo', `take-${side}`);
    const unit = unitOf(side);
    if (!act({ op: 'place', args: { side, term: unit.term, remove: true } })) {
      setNote(NOTE.none);
      say(NOTE.none);
    }
  };
  const onChoose = (c: Choice) => {
    if (!interactive) return;
    childStep();
    trace('tap', `card-${c.id}`);
    act({ op: 'answer', args: { id: c.id } });
    speak(c.label);
  };
  /** A touch on a pan names what is under the finger: a number, or the thing. */
  const onPanTap = (side: Side, e: MouseEvent) => {
    if (!interactive) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-say]');
    trace('tap', `pan-${side}`);
    if (!el || !prefs.speakOnTap) return;
    const n = Number(el.dataset.say);
    if (el.dataset.say !== '' && Number.isFinite(n)) sayNumber(n);
    else if (el.dataset.sayKey) say(el.dataset.sayKey as NarrationKey);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    let s = stateRef.current;
    if (filling) {
      const v = valueRef.current;
      if (v === null) return false;
      s = applyAction(s, { op: 'answer', args: { value: v } });
    }
    const response = model.toResponse(s);
    if (!response) return false;
    onResponse(response);
    return true;
  });
  const ready = making || (filling ? value !== null : state.choice !== null);

  // ---------- demo ----------

  const enterAnswer = (v: number) =>
    demoEnterAnswer(v, {
      plan,
      valueRef,
      set: (next) => {
        valueRef.current = next;
        setValue(next);
      },
      highlight: setEntryHighlight,
      pause,
      alive,
    });

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setBusy(true);
      setInvite(null);
      setNote(null);
      try {
        switch (action.op) {
          case 'place': {
            const side = action.args?.side;
            const term = action.args?.term as BalanceTerm | undefined;
            if (!isSide(side) || !term) break;
            if (filling) {
              // On a pan with a box the number goes into the box.
              if ('n' in term && config[side].terms.some((x) => 'blank' in x)) {
                await enterAnswer(term.n);
              }
              break;
            }
            if (making) {
              // The units go on one by one, so each can be seen and counted.
              const copies = Math.max(1, Math.trunc(Number(action.args?.count ?? 1)) || 1);
              for (let k = 0; k < copies && alive.current; k += 1) {
                if (!(await applyOp({ op: 'place', args: { side, term } }))) break;
                await pause(PLACE_MS);
              }
              break;
            }
            await applyOp(action);
            await pause(PLACE_MS);
            break;
          }
          case 'tilt':
          case 'level':
          case 'highlight-side':
            await applyOp(action);
            await pause(SHOW_MS);
            break;
          case 'answer': {
            const id = action.args?.id;
            const v = Number(action.args?.value);
            if (typeof id === 'string') {
              setCardHighlight(id);
              await pause(PICK_MS);
              if (alive.current) await applyOp(action);
            } else if (filling && Number.isFinite(v)) {
              await enterAnswer(v);
            }
            break;
          }
        }
      } finally {
        setEntryHighlight(null);
        setCardHighlight(null);
        if (alive.current) {
          setBusy(false);
          await committed();
        }
      }
    },
    invite: (action) => {
      setNote(null);
      setInvite(action);
    },
  });

  // The one ring: what a demonstration invites the child to touch.
  const inviteCue = ((): { cue: string; value?: number } | null => {
    if (!invite) return null;
    const side = invite.args?.side;
    switch (invite.op) {
      case 'place': {
        if (!isSide(side)) return null;
        if (making) return { cue: `add-${side}` };
        const term = invite.args?.term as BalanceTerm | undefined;
        if (filling) return term && 'n' in term ? { cue: 'entry-value', value: term.n } : null;
        return { cue: `pan-${side}` };
      }
      case 'highlight-side':
        return isSide(side) ? { cue: `pan-${side}` } : null;
      case 'tilt':
      case 'level':
        return { cue: 'stand' };
      case 'answer': {
        const id = invite.args?.id;
        if (typeof id === 'string') return choices ? { cue: `card-${id}` } : null;
        const v = Number(invite.args?.value);
        if (!filling) return null;
        return Number.isFinite(v) ? { cue: 'entry-value', value: v } : { cue: 'entry' };
      }
      default:
        return null;
    }
  })();
  const ringed = (id: string) => inviteCue?.cue === id;
  const invitedEntry: number | PadKey | null =
    inviteCue?.cue === 'entry-value' && inviteCue.value !== undefined
      ? plan.entry?.kind === 'tray' || plan.stepper
        ? inviteCue.value
        : nextPadKey(inviteCue.value, value)
      : null;
  const handKey = inviteCue ? `${inviteCue.cue}:${invitedEntry ?? ''}` : '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) => {
      if (!inviteCue) return null;
      if (inviteCue.cue === 'entry-value') {
        return root.querySelector<HTMLElement>('.ni-bal__entry .ni-invite');
      }
      return root.querySelector<HTMLElement>(`[data-cue="${inviteCue.cue}"]`);
    },
    handKey,
  );

  // ---------- render ----------

  /** A side in words, for a screen reader: every number and count a sighted child can see. */
  const sideWords = (side: Side) => {
    const words = termsOf(side).map((x) => {
      if ('object' in x) return `${x.count} ${t(spriteNameKey(x.object))}`;
      if ('op' in x) return t(OP_NAME[x.op]);
      if ('n' in x) return String(x.n);
      if ('blank' in x) return value === null ? t('ui.widget.bal.box') : String(value);
      return x.letter;
    });
    if (making) {
      words.push(`${t('ui.widget.bal.added')} ${state.added[side]} ${t(unitOf(side).name)}`);
    }
    return `${t(SIDE_NAME[side])}: ${words.join(', ')}`;
  };

  const renderSprites = (
    n: number,
    cap: number,
    sprite: string,
    name: NarrationKey,
    s: number,
    /** Rows fill from the bottom (things piling up on a pan). */
    up = false,
  ) => {
    const grid = fivesGrid(cap, layout.cols, s);
    const items: ReactNode[] = [];
    for (let k = 0; k < n; k += 1) {
      const cell = fivesCell(k, grid.cols, s);
      const p = up ? { x: cell.x, y: grid.h - s - cell.y } : cell;
      items.push(
        <span
          key={k}
          className="ni-bal__item ni-invite-glyph"
          data-sprite={sprite}
          data-say=""
          data-say-key={name}
          style={{ left: p.x, top: p.y, width: s, height: s }}
        >
          <ObjectSprite sprite={sprite} />
        </span>,
      );
    }
    return { grid, items };
  };

  const renderTerm = (x: BalanceTerm, i: number, s: number) => {
    /** A tile of `chars` characters (or a sign, `chars` 0), as large as the plan draws tiles. */
    const tileStyle = (chars: number): CSSProperties => ({
      width: Math.round((chars > 0 ? tileWidth(chars) : OP_PX) * layout.tile),
      height: Math.round((chars > 0 ? TILE_H : OP_PX) * layout.tile),
      fontSize: Math.round(NUMERAL_PX * layout.tile),
    });
    if ('object' in x) {
      const { grid, items } = renderSprites(x.count, x.count, x.object, spriteNameKey(x.object), s);
      return (
        <span key={i} className="ni-bal__group" style={{ width: grid.w, height: grid.h }}>
          {items}
        </span>
      );
    }
    if ('op' in x) {
      return (
        <span
          key={i}
          className="ni-bal__op"
          data-say=""
          data-say-key={OP_NAME[x.op]}
          style={tileStyle(0)}
        >
          {OP_SIGN[x.op]}
        </span>
      );
    }
    if ('n' in x) {
      return (
        <span key={i} className="ni-bal__tile" data-say={x.n} style={tileStyle(digits(x.n))}>
          {x.n}
        </span>
      );
    }
    if ('blank' in x) {
      return (
        <span
          key={i}
          className={cls('ni-bal__tile ni-bal__tile--box', ringed('entry') && 'ni-invite')}
          data-cue="box"
          data-empty={value === null ? 'true' : undefined}
          data-say={value ?? ''}
          style={tileStyle(digits(entryMax))}
        >
          {value ?? ''}
        </span>
      );
    }
    return (
      <span key={i} className="ni-bal__tile ni-bal__tile--letter" style={tileStyle(1)}>
        {x.letter}
      </span>
    );
  };

  const renderPan = (side: Side, l: ScaleLayout) => {
    const unit = unitOf(side);
    const zone = making
      ? renderSprites(state.added[side], roomOn(side), unit.sprite, unit.name, l.s, true)
      : null;
    return (
      <div
        key={side}
        className={cls(
          'ni-bal__pan',
          (state.highlighted === side || ringed(`pan-${side}`)) && 'ni-bal__pan--lit',
        )}
        data-side={side}
        data-cue={`pan-${side}`}
        style={{ width: l.pan.w, transform: `translateY(${shift(side)}px)` }}
      >
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-hear is a pointer extra; the pan is one image to assistive tech */}
        <div
          className="ni-bal__contents"
          role="img"
          aria-label={sideWords(side)}
          style={{ height: l.pan.h }}
          onClick={(e) => onPanTap(side, e)}
        >
          {zone && zone.grid.w > 0 ? (
            <span
              className="ni-bal__group ni-bal__zone"
              data-zone={side}
              style={{ width: zone.grid.w, height: zone.grid.h }}
            >
              {zone.items}
            </span>
          ) : null}
          <div className="ni-bal__terms" data-flow={l.flow[side]}>
            {termsOf(side).map((x, i) => renderTerm(x, i, l.s))}
          </div>
        </div>
        <div className="ni-bal__tray" aria-hidden="true" />
      </div>
    );
  };

  const renderButtons = (side: Side, l: ScaleLayout) => (
    <div key={side} className="ni-bal__buttons" data-side={side} style={{ width: l.pan.w }}>
      <span data-cue={`take-${side}`}>
        <IconButton
          label={`ui.widget.bal.take.${side}`}
          icon={<PanButtonIcon kind="take" />}
          tone="cloud"
          caption={false}
          onPress={() => onTake(side)}
          disabled={!interactive}
          data={{ 'data-limit': state.added[side] === 0 ? 'true' : undefined }}
        />
      </span>
      <span data-cue={`add-${side}`}>
        <IconButton
          label={`ui.widget.bal.add.${side}`}
          icon={<PanButtonIcon kind="add" />}
          tone="cloud"
          caption={false}
          onPress={() => onAdd(side)}
          disabled={!interactive}
          className={ringed(`add-${side}`) ? 'ni-invite' : undefined}
          data={{ 'data-limit': state.added[side] >= roomOn(side) ? 'true' : undefined }}
        />
      </span>
    </div>
  );

  const beamWords =
    beam === 'held'
      ? ''
      : t(
          beam === 'level'
            ? 'ui.widget.bal.beam.level'
            : beam === 'left'
              ? 'ui.widget.bal.beam.left'
              : 'ui.widget.bal.beam.right',
        );

  const scale = (
    // biome-ignore lint/a11y/useSemanticElements: the balance lays out pans, beam and buttons; a fieldset brings its own box model
    <div
      className="ni-bal__scale"
      role="group"
      aria-label={t('ui.widget.bal.scale')}
      data-beam={beam}
      data-reduced={reduced ? 'true' : undefined}
      style={{ width: layout.width, height: layout.height }}
    >
      <div className="ni-bal__pans" style={{ gap: layout.gap, paddingTop: TILT_PX }}>
        {SIDES.map((side) => renderPan(side, layout))}
      </div>
      <div className="ni-bal__base" style={{ height: TILT_PX + layout.base }}>
        <span
          className="ni-bal__beam"
          aria-hidden="true"
          style={{ width: beamLength, transform: `translateX(-50%) rotate(${angle}deg)` }}
        />
        <span
          className={cls('ni-bal__stand', ringed('stand') && 'ni-invite')}
          data-cue="stand"
          aria-hidden="true"
          style={{ width: layout.gap }}
        >
          <StandArt />
        </span>
        {beam === 'held'
          ? SIDES.map((side) => (
              <span
                key={side}
                className="ni-bal__prop"
                data-side={side}
                aria-hidden="true"
                style={{ [side]: layout.pan.w / 2 - 9 } as CSSProperties}
              />
            ))
          : null}
        {making ? SIDES.map((side) => renderButtons(side, layout)) : null}
      </div>
      {/* What a sighted child sees, in words: why a press did nothing, else how the beam sits. */}
      <p className="ni-visually-hidden" role="status">
        {note ? t(note) : beamWords}
      </p>
    </div>
  );

  const actions = (
    <StepActions
      actRef={actRef}
      step="ask"
      back={false}
      dir={plan.act === 'row' ? 'row' : 'column'}
      interactive={interactive}
      ready={ready}
      onStep={() => {}}
      onCheck={submit}
      compact={whole.h < COMPACT_ROOM_H}
    />
  );

  const answer = choices ? (
    // biome-ignore lint/a11y/useSemanticElements: a group of pick buttons; a fieldset brings its own box model
    <div
      className="ni-bal__cards"
      role="group"
      aria-label={t('ui.widget.answer')}
      data-dir={planned.cards}
    >
      {choices.map((c) => (
        <span key={c.id} className="ni-bal__card" data-cue={`card-${c.id}`}>
          <PickCard
            label={t(c.label)}
            selected={state.choice === c.id}
            highlighted={cardHighlight === c.id || ringed(`card-${c.id}`)}
            variant="picture"
            data-id={c.id}
            disabled={!interactive}
            onPress={() => onChoose(c)}
          >
            <span className="ni-bal__glyph">
              <ChoiceArt glyph={c.glyph} />
            </span>
          </PickCard>
        </span>
      ))}
    </div>
  ) : filling ? (
    <span data-cue="entry" className="ni-bal__entry">
      <AskEntry
        plan={plan}
        max={entryMax}
        value={value}
        onChange={(v) => {
          childStep();
          setValue(v);
        }}
        disabled={!interactive}
        highlighted={entryHighlight ?? invitedEntry}
        trace={trace}
        onEnter={submit}
        actions={actions}
      />
    </span>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="ni-bal"
      data-mode={mode}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      data-fits={planned.fits ? undefined : 'false'}
      style={handRootStyle}
    >
      <div className="ni-ask" data-arrangement={plan.arrangement}>
        <div className="ni-ask__picture">{scale}</div>
        <div className="ni-ask__answer">
          {answer}
          {plan.act === 'aside' ? null : actions}
        </div>
      </div>
      {inviteHand}
    </div>
  );
}

export default BalanceWidget;
