import {
  CM_PER_INCH,
  type FormatModel,
  formatModel,
  isTwoRuler,
  type LaidUnit,
  type LengthUnit,
  lengthIn,
  type MeasureLengthState,
  objectUnits,
  TWO_RULER_CM,
  UNIT_SIZE,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  type PadKey,
  PickCard,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import { BoxEntry, enteredValues } from '../kit/BoxEntry';
import { useInviteHand } from '../kit/inviteHand';
import {
  LengthObject,
  RULER_PAD,
  Ruler,
  rulerLabels,
  rulerLabelsEach,
  rulerWidth,
  UnitPiece,
  unitHeight,
} from '../kit/LengthViews';
import { useAvailableSize } from '../kit/useAvailableSize';
import type { ConfigFor, WidgetProps } from '../types';
import './measure-length.css';

/**
 * `measure-length` (03 §5.5): measure an object by laying units along it, or by reading a ruler.
 * Everything is drawn to scale: the object is exactly `length` units long, every unit is its own
 * size (cube 1, shell 2, stick 4), and the ruler's numbers sit exactly on its marks.
 * - `iterate` (MEA.02): drag units from the pile onto the object (or tap the pile, then a spot
 *   along the object; on the keyboard Enter lays the next one end to end). A unit dropped close to
 *   the end of another (a quarter unit) snaps to it; further away it stays where it is, so a gap
 *   shows and the checker sees it. "Take one back" lifts the last unit. Type how many fit; Check
 *   answers `{ units, value }` (`units.iterate`).
 * - `two-units` (MEA.22): the same with both units (two piles, a row each), then both counts
 *   (`numbers`). The pictorial tier draws the units already laid; the child counts and types.
 * - `read`: the object lies on a ruler from mark `startOffset`; type the length (`pad`), tap the
 *   end mark (`tap-tick`, a placement) or pick it (`pick`). On the concrete tier the ruler slides.
 * - `two-units` on rulers (MEA.09): the object lies on a centimeter ruler with an inch ruler above
 *   it, both from 0 on one px scale and both to 10 cm (every centimeter keeps its numeral at
 *   960 × 600); the child types the centimeters and the inches (each box says its unit). Pictorial
 *   only: both rulers are a fixed picture from 0.
 * - `estimate` (MEA.08): the object and one unit at the same scale (a tile for inches and
 *   centimeters, a bar for feet and meters), no ruler; pick an option.
 * Every response comes from the engine model (`formatModel('measure-length')`).
 *
 * Demo ops: `lay-unit {index, unit?}`, `slide-ruler {to}`, `align-zero`, `count-units`,
 * `read-end`, plus `answer`.
 */

const OPS = ['lay-unit', 'slide-ruler', 'align-zero', 'count-units', 'read-end', 'answer'] as const;
/** Room under the stage while a pile is invited: the hand hangs about 57 px below the pile. */
const PILE_HAND_ROOM = 44;
/**
 * The drop zone's inner padding (evidence review): 12 px inside its 2 px border round the rows,
 * 16 on the left, so the start line (4 px, centred on the object's start) stays 12+ px inside it.
 */
const ZONE_PAD = 14;
const ZONE_PAD_LEFT = 18;
/**
 * The pile's invite ring (evidence review: the guide's hand crossed the ring on the pile's edge): a 5 px
 * ring round the pile's units, 2 px clear of them, inside the pile; 3 px round the ring is the
 * pile's glyph, so the hand starts under it (kit useInviteHand) and never touches the stroke.
 */
const PILE_RING = 5;
const PILE_RING_PAD = 2;
const PILE_ZONE = 3;
const PILE_TOP = 2;
/** Under the glyph: the hand's finger above its tip (about 8 px) and the tip's 1 px inside. */
const PILE_FINGER = 9;
/** A drop within this many unit lengths of another unit's end (or the start) snaps to it. */
export const SNAP_UNITS = 0.25;

type Config = ConfigFor<'measure-length'>;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Where a unit dropped at `start` lands: snapped to a neighbour's end (or the start) when close. */
export function snapStart(start: number, laid: readonly number[]): number {
  const candidates = [0, ...laid.map((a) => a + 1), ...laid.map((a) => a - 1)];
  let best = start;
  let dist = SNAP_UNITS + 1e-9;
  for (const c of candidates) {
    if (Math.abs(c - start) <= dist && !laid.some((a) => Math.abs(a - c) < 1e-6)) {
      best = c;
      dist = Math.abs(c - start);
    }
  }
  return r3(best);
}

/** The next start end to end: right after the furthest unit (0 when none). */
export const nextStart = (laid: readonly number[]): number =>
  laid.length === 0 ? 0 : r3(Math.max(...laid) + 1);

export function MeasureLengthWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const model = formatModel('measure-length') as
    | FormatModel<'measure-length', MeasureLengthState>
    | undefined;
  if (!model) throw new Error('measure-length has no engine model');
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, ageMode, tapOnly } = useUiPreferences();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const root = useRef<HTMLDivElement>(null);
  const avail = useAvailableSize(root);

  /** MEA.09: centimeters on a ruler under the object, inches on a ruler above it. */
  const twoRuler = isTwoRuler(config);
  const laying = config.mode === 'iterate' || (config.mode === 'two-units' && !twoRuler);
  const picking = config.mode === 'estimate' || config.input === 'pick';
  const drawnUnits = laying && tier === 'pictorial';
  /** The ruler moves (a tap-tick mark, or the concrete ruler sliding); otherwise it is a picture. */
  const rulerAdjustable = config.input === 'tap-tick' || tier === 'concrete';
  const units: LengthUnit[] =
    config.mode === 'two-units' && config.altUnit ? [config.unit, config.altUnit] : [config.unit];
  /** How many of each unit fit (for drawn units and the scale). */
  const fits = (u: LengthUnit) =>
    u === config.unit ? objectUnits(config) : (lengthIn(config, u) ?? 0);

  const [state, setState] = useState<MeasureLengthState>(() => {
    let s = model.initialState(config);
    // Pictorial: the units are drawn laid end to end (the picture to count).
    if (drawnUnits) {
      for (const u of units) {
        for (let i = 0; i < fits(u); i += 1) {
          s = model.apply(s, { op: 'lay-unit', args: { index: i, unit: u } });
        }
      }
    }
    return s;
  });
  const [texts, setTexts] = useState<string[]>(() => units.map(() => ''));
  const [activeBox, setActiveBox] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [counting, setCounting] = useState<{ unit: LengthUnit; upto: number } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [tapMark, setTapMark] = useState<number | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [rulerDrag, setRulerDrag] = useState<number | null>(null);
  const interactive = !disabled && !demoBusy;
  const apply = (a: WidgetAction) => setState((s) => model.apply(s, a));

  // ---------- scale ----------
  const compact = avail !== null && avail.height < 460;
  // Beside the measure: the piles and "take one back" (target-sized, with their gaps).
  const piles = laying && !drawnUnits ? units.length : 0;
  const sideW = piles > 0 ? (piles + 1) * (MIN_TARGET_PX[ageMode] + 16) + 16 : 0;
  // The measure's own width (its padding is outside it).
  const trackW = Math.max(
    240,
    Math.min(
      1000,
      (avail?.width ?? 1100) - sideW - 24 - (laying ? ZONE_PAD + ZONE_PAD_LEFT - 12 : 0),
    ),
  );
  const whole = objectUnits(config);
  const cubes = whole * UNIT_SIZE[config.unit];
  // How tall a unit may be drawn: a cube is as tall as it is long, a shell half its length.
  const rowBudget = compact ? (config.mode === 'two-units' ? 28 : 84) : 120;
  // One px scale: iterate measures in its own unit, two-units in cubes (both units to scale). A
  // row leaves room for one unit past the object's end (a unit laid one too far still shows).
  const basePx =
    config.mode === 'two-units'
      ? Math.max(
          4,
          Math.min(
            rowBudget,
            Math.floor(trackW / (cubes + Math.max(...units.map((u) => UNIT_SIZE[u])))),
          ),
        )
      : laying
        ? Math.max(
            16,
            Math.min(
              96,
              config.unit === 'cube' ? rowBudget : config.unit === 'shell' ? 2 * rowBudget : 96,
              Math.floor(trackW / (whole + 1)),
            ),
          )
        : 0;
  const unitPxOf = (u: LengthUnit) =>
    config.mode === 'two-units' ? basePx * UNIT_SIZE[u] : basePx;
  // Standard units print their symbol on the ruler, in its own slot after the end numeral.
  const unitLabel = ['in', 'cm', 'ft', 'm'].includes(config.unit) ? config.unit : undefined;
  // The ruler fills the track: its width is `rulerMax × unit` plus its fixed ends (padding, the
  // end numeral's half and the unit symbol's slot), so a long ruler (30 cm) still fits.
  const fitUnit = (max: number) =>
    Math.max(12, Math.min(90, Math.floor((trackW - rulerWidth(max, 0, unitLabel)) / max)));
  // The ruler runs one unit past the object's end, and ends on a numeral: with numerals every
  // fifth mark it stops at the last one the object reaches (evidence review: a 30 cm ruler's
  // ticks ran on to 31 past its last numeral).
  const rulerMax = (() => {
    if (twoRuler) return TWO_RULER_CM;
    const end = Math.ceil(config.startOffset + whole);
    let max = end + 1;
    if (laying) return max;
    for (let k = 0; k < 2; k += 1) {
      const labels = rulerLabels(max, fitUnit(max));
      const stride = labels.length > 1 ? (labels[1] as number) - (labels[0] as number) : 1;
      if (max % stride === 0) break;
      const down = Math.floor(max / stride) * stride;
      max = down >= end ? down : Math.ceil(max / stride) * stride;
    }
    return max;
  })();
  const rulerUnit = laying ? 0 : fitUnit(rulerMax);
  // The pad holds the longest reading the ruler shows: its whole-number digits plus a digit for
  // halves or two for quarters (10.25 is four digits; applyPadKey counts digits on both sides).
  const readDigits =
    String(Math.floor(rulerMax)).length +
    (config.precision === 0.25 ? 2 : config.precision === 0.5 ? 1 : 0);
  const objectPx = laying ? whole * unitPxOf(config.unit) : whole * rulerUnit;

  const laidOf = (u: LengthUnit) => state.units.filter((x) => x.unit === u);
  const unitName = (u: LengthUnit, many = true) => t(`unit.${u}.${many ? 'many' : 'one'}`);

  // ---------- laying units: drag from a pile, or tap the pile then the track ----------
  const pileId = (u: LengthUnit) => `pile-${u}`;
  /** One target: the whole measure (the object and its unit rows); the pile says which row. */
  const TRACK = 'track';
  const dragStart = useRef<{ x: number; centre: number } | null>(null);
  const lastPointer = useRef(0);
  const tapX = useRef<number | null>(null);
  /** The object's start in page px: every row starts there too. */
  const trackLeft = () =>
    root.current?.querySelector<HTMLElement>('.ni-mlen__object')?.getBoundingClientRect().left ?? 0;

  const lay = (u: LengthUnit, at: number) => {
    const laid = laidOf(u).map((x) => x.at);
    let index = 0;
    while (laid.length > 0 && state.units.some((x) => x.id === `${u}-${index}`)) index += 1;
    const start = snapStart(at, laid);
    apply({ op: 'lay-unit', args: { index, unit: u, at: start } });
  };

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive || !laying || drawnUnits,
    trace,
    canPlace: (_item, target) => target === TRACK,
    onSelect: (item) => {
      if (!item) return;
      setInvite(null);
      if (speakOnTap) say(`unit.${item.replace('pile-', '')}.one`);
    },
    onPlace: ({ item, via }) => {
      setInvite(null);
      const u = item.replace('pile-', '') as LengthUnit;
      const px = unitPxOf(u);
      const left = trackLeft();
      if (via === 'drag' && dragStart.current) {
        // The unit lands centred where the dragged tile's centre was let go.
        const centre = dragStart.current.centre + (lastPointer.current - dragStart.current.x);
        lay(u, (centre - left) / px - 0.5);
      } else if (via === 'tap' && tapX.current !== null) {
        lay(u, (tapX.current - left) / px - 0.5);
      } else {
        lay(u, nextStart(laidOf(u).map((x) => x.at)));
      }
      dragStart.current = null;
      tapX.current = null;
    },
  });

  /** A laid unit is lifted: traced, and named aloud like the pile it came from. */
  const lift = (x: LaidUnit) => {
    // Ids are reused (the next unit laid takes the first free one): the keyboard marker goes
    // with whatever is lifted, so a later unit never inherits it.
    setMarked(null);
    trace('undo', x.id);
    setInvite(null);
    if (speakOnTap) say(`unit.${x.unit}.one`);
    apply({
      op: 'lay-unit',
      args: { index: Number(x.id.split('-').pop()), unit: x.unit, remove: true },
    });
  };

  /**
   * Keyboard: ← and → on the measure walk a marker over the laid units (row by row, left to
   * right), naming each; Backspace or Delete lifts the marked unit, or the last one laid when
   * none is marked. So a keyboard user can lift any unit, as a finger can.
   */
  const [marked, setMarked] = useState<string | null>(null);
  const liftOrder = () => units.flatMap((u) => [...laidOf(u)].sort((x, y) => x.at - y.at));
  const moveMark = (step: 1 | -1) => {
    const order = liftOrder();
    if (order.length === 0) return;
    const i = order.findIndex((x) => x.id === marked);
    const next =
      order[i < 0 ? (step > 0 ? 0 : order.length - 1) : (i + step + order.length) % order.length];
    if (!next) return;
    trace('move', next.id);
    if (speakOnTap) say(`unit.${next.unit}.one`);
    setMarked(next.id);
  };
  const liftMarked = () => {
    const target = state.units.find((x) => x.id === marked);
    setMarked(null);
    if (target && interactive) lift(target);
    else takeBack();
  };

  /** "Take one back": lifts the unit laid last (of either kind). */
  const takeBack = () => {
    const last = state.units[state.units.length - 1];
    if (!last || !interactive) return;
    lift(last);
  };

  /**
   * Touching a laid unit where it sits (with no pile in hand) lifts that unit. A unit smaller
   * than a touch target is lifted from a target-sized box round it, so a 16 px cube is as easy to
   * lift as a 96 px one; where those boxes overlap, the nearest unit goes. A tap on bare track
   * lifts nothing.
   */
  const unitAt = (clientX: number, clientY: number): LaidUnit | null => {
    const minT = MIN_TARGET_PX[ageMode];
    let best: { unit: LaidUnit; d: number } | null = null;
    for (const el of root.current?.querySelectorAll<HTMLElement>('.ni-mlen__laid') ?? []) {
      const b = el.getBoundingClientRect();
      const dx = Math.abs(clientX - (b.left + b.width / 2));
      const dy = Math.abs(clientY - (b.top + b.height / 2));
      if (dx > Math.max(b.width, minT) / 2 || dy > Math.max(b.height, minT) / 2) continue;
      const unit = state.units.find((x) => x.id === el.dataset.unitId);
      if (unit && (best === null || dx + dy < best.d)) best = { unit, d: dx + dy };
    }
    return best?.unit ?? null;
  };

  // ---------- the ruler: slides on the concrete tier; tap-tick marks the end ----------
  /**
   * How far the ruler slides: from its 0 under the object's start to its last mark under the
   * object's end, so the object always lies on the ruler and the ruler never leaves the stage.
   */
  const slideMax = Math.max(0, r3(rulerMax - whole));
  const clampSlide = (to: number) => r3(Math.min(slideMax, Math.max(0, to)));
  const onRulerDown = (e: ReactPointerEvent) => {
    // Tap-only mode (06 §7) has no drags; ←/→ on the ruler still slide it.
    if (!interactive || tapOnly || tier !== 'concrete' || config.mode !== 'read') return;
    const x0 = e.clientX;
    const from = state.rulerStart;
    const pointer = e.pointerId;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      if (!moved && Math.abs(ev.clientX - x0) < 8) return;
      if (!moved) trace('drag', 'ruler');
      moved = true;
      // Dragging the ruler right puts a smaller mark under the object's start.
      setRulerDrag(from - (ev.clientX - x0) / rulerUnit);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setRulerDrag(null);
      if (!moved) return;
      const to =
        Math.round((from - (ev.clientX - x0) / rulerUnit) / config.precision) * config.precision;
      trace('drop', 'ruler');
      apply({ op: 'slide-ruler', args: { to: clampSlide(to) } });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const markAt = (clientX: number) => {
    const ruler = root.current?.querySelector<SVGElement>('.ni-ruler')?.getBoundingClientRect();
    if (!ruler) return null;
    const v = (clientX - ruler.left - RULER_PAD) / rulerUnit;
    return r3(Math.min(rulerMax, Math.max(0, Math.round(v / config.precision) * config.precision)));
  };

  // ---------- answer ----------
  const values = enteredValues(texts);
  const answerAction: WidgetAction | null = picking
    ? choice
      ? { op: 'answer', args: { id: choice } }
      : null
    : config.input === 'tap-tick'
      ? tapMark !== null
        ? { op: 'answer', args: { value: tapMark } }
        : null
      : values
        ? config.mode === 'two-units'
          ? { op: 'answer', args: { values } }
          : { op: 'answer', args: { value: values[0] } }
        : null;
  const response = answerAction ? model.toResponse(model.apply(state, answerAction)) : null;
  const submit = useSubmitGuard(() => {
    if (!interactive || !response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo ----------
  const typeInto = async (box: number, value: number) => {
    let text = '';
    setActiveBox(box);
    for (const d of String(value)) {
      setPressedKey(d as PadKey);
      text += d;
      const typed = text;
      setTexts((ts) => ts.map((x, i) => (i === box ? typed : x)));
      await pause(320);
      if (!alive.current) return;
    }
    setPressedKey(null);
  };
  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setInvite(null);
      setDemoBusy(true);
      try {
        const a = action.args ?? {};
        switch (action.op) {
          case 'lay-unit': {
            const u = (typeof a.unit === 'string' ? a.unit : config.unit) as LengthUnit;
            const index = typeof a.index === 'number' ? a.index : 0;
            if (drawnUnits) {
              setCounting({ unit: u, upto: index + 1 });
              sayNumber(index + 1);
              await pause(450);
              return;
            }
            apply(action);
            await pause(380);
            return;
          }
          case 'count-units': {
            const u = (
              typeof a.unit === 'string'
                ? a.unit
                : (state.units[state.units.length - 1]?.unit ?? config.unit)
            ) as LengthUnit;
            const n = laidOf(u).length;
            for (let i = 1; i <= n; i += 1) {
              setCounting({ unit: u, upto: i });
              sayNumber(i);
              await pause(450);
              if (!alive.current) return;
            }
            apply(action);
            await pause(500);
            return;
          }
          case 'answer': {
            if (Array.isArray(a.values)) {
              for (let i = 0; i < a.values.length; i += 1) await typeInto(i, Number(a.values[i]));
            } else if (typeof a.value === 'number') {
              if (config.input === 'tap-tick') setTapMark(a.value);
              else await typeInto(0, a.value);
            } else if (typeof a.id === 'string') setChoice(a.id);
            await pause(400);
            return;
          }
          default:
            apply(action);
            await pause(action.op === 'slide-ruler' ? 700 : 900);
        }
      } finally {
        if (alive.current) setDemoBusy(false);
      }
    },
    invite: (action) => {
      if (!action) return setInvite(null);
      if (action.op === 'lay-unit') {
        const u = typeof action.args?.unit === 'string' ? action.args.unit : config.unit;
        return setInvite(pileId(u as LengthUnit));
      }
      if (action.op === 'answer') return setInvite(picking ? 'options' : 'entry');
      if (action.op === 'read-end' || action.op === 'align-zero') return setInvite('ruler');
      setInvite(null);
    },
  });

  // The guide's hand under the invited pile, ruler, options or answer box (kit useInviteHand).
  const { hand, rootStyle: handStyle } = useInviteHand(
    root,
    (r) => {
      if (!invite) return null;
      if (invite.startsWith('pile-'))
        return r.querySelector<HTMLElement>(`.ni-mlen__pile[data-pile="${invite.slice(5)}"]`);
      if (invite === 'ruler') return r.querySelector<HTMLElement>('.ni-mlen__ruler');
      if (invite === 'options') return r.querySelector<HTMLElement>('.ni-mlen__options .ni-pick');
      return r.querySelector<HTMLElement>(`.ni-boxentry__box[data-box="${activeBox}"]`);
    },
    invite ?? '',
  );

  // ---------- drawing ----------
  const trackP =
    laying && !drawnUnits ? dnd.targetProps(TRACK, { label: t('ui.mlen.track') }) : null;
  const track = trackP ? (
    <button
      type="button"
      {...trackP}
      className={[trackP.className, 'ni-mlen__pad'].join(' ')}
      onClick={(e: ReactMouseEvent) => {
        // A pointer tap with no pile in hand (a key press has no position: detail 0).
        if (interactive && dnd.selected === null && e.detail > 0) {
          const hit = unitAt(e.clientX, e.clientY);
          if (hit) lift(hit);
          return;
        }
        tapX.current = e.clientX;
        trackP.onClick(e);
      }}
      onKeyDown={(e: ReactKeyboardEvent) => {
        // Keyboard: Backspace or Delete on the measure takes the last unit back.
        if (dnd.selected === null && interactive) {
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            liftMarked();
            return;
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            moveMark(e.key === 'ArrowRight' ? 1 : -1);
            return;
          }
        }
        trackP.onKeyDown(e);
      }}
    />
  ) : null;
  const unitRow = (u: LengthUnit) => {
    const px = unitPxOf(u);
    const laid = laidOf(u);
    const counted =
      counting?.unit === u ? counting.upto : state.counted.includes(u) ? laid.length : 0;
    const order = [...laid].sort((x, y) => x.at - y.at);
    const rowH = Math.max(unitHeight(u, px), 30);
    return (
      <div className="ni-mlen__row" data-track={u} style={{ width: objectPx + px, height: rowH }}>
        {order.map((x, i) => (
          <span
            key={x.id}
            className="ni-mlen__laid"
            data-unit-id={x.id}
            data-marked={marked === x.id ? 'true' : undefined}
            data-at={x.at}
            style={{ left: x.at * px, width: px, top: (rowH - unitHeight(u, px)) / 2 }}
          >
            <UnitPiece unit={u} width={px} />
            {i < counted && px >= 30 ? (
              <span className="ni-mlen__count-dot" aria-hidden="true" />
            ) : null}
          </span>
        ))}
        {counted > 0 ? (
          <span
            className="ni-mlen__count"
            data-count={counted}
            style={{
              left: ((order[counted - 1]?.at ?? 0) + 0.5) * px - 23,
            }}
            aria-hidden="true"
          >
            {counted}
          </span>
        ) : null}
      </div>
    );
  };

  const objectRow = (
    <div className="ni-mlen__object" style={{ width: objectPx }} data-object-px={objectPx}>
      <LengthObject
        sprite={config.object.sprite}
        width={objectPx}
        height={compact ? (config.mode === 'two-units' ? 28 : 36) : 44}
      />
    </div>
  );

  const pile = (u: LengthUnit) => {
    const p = dnd.itemProps(pileId(u), { label: t('ui.mlen.pile', { unit: unitName(u) }) });
    // Two units stacked inside the pile's box (border 3, padding 4 each side), to scale between
    // kinds where they fit: a 64 px cube stack was 130 px tall in an 80 px pile.
    // Inside the pile with room under the stack for the hand's fingertip (the hand points under
    // the cubes, inside the pile, when the pile is invited).
    const ring = PILE_ZONE + PILE_RING + PILE_RING_PAD;
    const inner = MIN_TARGET_PX[ageMode] - 6 - PILE_TOP - 2 * ring - PILE_FINGER;
    const innerW = MIN_TARGET_PX[ageMode] - 6 - 2 * ring;
    let px = Math.min(unitPxOf(u), innerW);
    while (px > 8 && 2 * unitHeight(u, px) + 2 > inner) px -= 1;
    const invited = invite === pileId(u);
    return (
      <span key={u} className="ni-mlen__pile-slot">
        <span
          {...p}
          className={[p.className, 'ni-mlen__pile', invited ? 'ni-mlen__pile--invited' : '']
            .filter(Boolean)
            .join(' ')}
          data-pile={u}
          onPointerDown={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            dragStart.current = { x: e.clientX, centre: r.left + r.width / 2 };
            lastPointer.current = e.clientX;
            const track = (ev: PointerEvent) => {
              lastPointer.current = ev.clientX;
            };
            const done = () => {
              window.removeEventListener('pointermove', track);
              window.removeEventListener('pointerup', done);
            };
            window.addEventListener('pointermove', track);
            window.addEventListener('pointerup', done);
            p.onPointerDown(e);
          }}
        >
          {/* The units are the pile's picture, in their ring's place: a glyph the guide's hand keeps
              clear of (it points under them and under the invite ring; evidence review). */}
          <span
            className="ni-mlen__pile-units ni-btn__label"
            style={{ padding: PILE_ZONE, marginTop: PILE_TOP }}
            aria-hidden="true"
          >
            <span
              className={['ni-mlen__pile-stack', invited ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
              style={{ padding: PILE_RING + PILE_RING_PAD }}
            >
              <UnitPiece unit={u} width={px} />
              <UnitPiece unit={u} width={px} />
            </span>
          </span>
        </span>
      </span>
    );
  };

  const name = t(spriteNameKey(config.object.sprite));
  let picture: React.ReactNode;
  if (laying) {
    picture = (
      <fieldset
        className="ni-mlen__stage"
        aria-label={name}
        // A pile invited: room under the stage for the guide's hand, clear of the keypad and boxes.
        style={invite?.startsWith('pile-') ? { marginBottom: PILE_HAND_ROOM } : undefined}
      >
        {!drawnUnits ? <div className="ni-mlen__piles">{units.map(pile)}</div> : null}
        <div
          className="ni-mlen__measure"
          style={{
            // The rows (the object and one unit past its end), in a zone up to twice as long
            // where there is room (evidence review: a short object's zone was a small target).
            width: Math.max(
              objectPx + Math.max(...units.map(unitPxOf)),
              Math.min(trackW, 2.5 * (objectPx + Math.max(...units.map(unitPxOf)))),
            ),
            // The width is the rows'; the padding is round them.
            boxSizing: 'content-box',
            flex: 'none',
            padding: `${ZONE_PAD}px ${ZONE_PAD}px ${ZONE_PAD}px ${ZONE_PAD_LEFT}px`,
          }}
        >
          {track}
          {/* The start line, across every row, inside the zone (evidence review). */}
          <span className="ni-mlen__start" style={{ left: ZONE_PAD_LEFT - 2 }} aria-hidden="true" />
          {unitRow(units[0] as LengthUnit)}
          <div className="ni-mlen__object-line">{objectRow}</div>
          {units[1] ? unitRow(units[1]) : null}
        </div>
        {!drawnUnits ? (
          <button
            type="button"
            className="ni-mlen__undo"
            aria-label={t('ui.mlen.undo')}
            disabled={!interactive || state.units.length === 0}
            onClick={takeBack}
          >
            <UndoIcon />
          </button>
        ) : null}
      </fieldset>
    );
  } else if (config.mode === 'estimate') {
    // MEA.08: the object and one unit drawn to the same scale, no ruler and nothing to count: a
    // tile (inches, centimeters) or a bar (feet, meters) under the object's start.
    const estPx = Math.max(8, Math.min(96, Math.floor((trackW - 8) / whole)));
    const refUnit = config.unit === 'ft' || config.unit === 'm' ? 'stick' : 'cube';
    picture = (
      <div
        className="ni-mlen__stage ni-mlen__stage--estimate"
        role="img"
        aria-label={t('ui.mlen.estimate-picture', {
          thing: name.toLowerCase(),
          unit: unitName(config.unit, false),
        })}
        data-unit-px={estPx}
      >
        <div className="ni-mlen__object" style={{ width: whole * estPx }}>
          <LengthObject sprite={config.object.sprite} width={whole * estPx} height={44} />
        </div>
        <div className="ni-mlen__reference">
          <UnitPiece unit={refUnit} width={estPx} />
          <span className="ni-mlen__reference-label" aria-hidden="true">
            {t('ui.mlen.one-unit', { unit: unitName(config.unit, false) })}
          </span>
        </div>
      </div>
    );
  } else {
    const shown = Math.min(slideMax, Math.max(0, rulerDrag ?? state.rulerStart));
    const shift = (shown - config.startOffset) * rulerUnit;
    const objectLeft = RULER_PAD + config.startOffset * rulerUnit;
    const rulerMarks = [
      ...(state.startShown ? [shown] : []),
      ...(state.endShown ? [shown + whole] : []),
      ...(tapMark !== null ? [tapMark] : []),
    ];
    picture = (
      <fieldset className="ni-mlen__stage ni-mlen__stage--ruler" aria-label={name}>
        <div
          className="ni-mlen__on-ruler"
          style={{ width: rulerWidth(rulerMax, rulerUnit, unitLabel) }}
        >
          {twoRuler ? (
            // MEA.09: the inch ruler above the object, its 0 over the centimeter ruler's 0 on the
            // same px scale; the two rulers are one picture (named on the centimeter ruler).
            <div
              className="ni-mlen__inch-ruler"
              aria-hidden="true"
              style={{ transform: `translateX(${-shift}px)` }}
            >
              <Ruler
                max={4}
                unitPx={rulerUnit * CM_PER_INCH}
                unitLabel="in"
                flip
                width={rulerWidth(rulerMax, rulerUnit, unitLabel)}
                labels={rulerLabelsEach(4, rulerUnit * CM_PER_INCH)}
                dense={compact}
              />
            </div>
          ) : null}
          <div className="ni-mlen__object" style={{ marginLeft: objectLeft, width: objectPx }}>
            <LengthObject
              sprite={config.object.sprite}
              width={objectPx}
              height={twoRuler && compact ? 26 : 44}
            />
          </div>
          {/* Where the object starts, when that is not 0: a bold line from its end down onto the
              ruler and an arrow on the mark (evidence review). It stays with the object. */}
          {config.startOffset > 0 ? (
            <span
              className="ni-mlen__start-mark"
              data-start-mark={config.startOffset}
              style={{ left: objectLeft }}
              aria-hidden="true"
            />
          ) : null}
          {/* The ruler is a slider when it moves: tap-tick moves the end mark along it; on the
              concrete tier the ruler itself slides (drag, or ←/→). Otherwise (a pictorial ruler
              read on the pad) it is a fixed picture: no slider role, no tab stop. */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the role is slider whenever a handler acts (each returns early on a fixed ruler); Biome cannot read the conditional role */}
          {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label names both roles, slider and img; Biome cannot read the conditional role */}
          <div
            role={rulerAdjustable ? 'slider' : 'img'}
            {...(rulerAdjustable
              ? {
                  tabIndex: disabled ? -1 : 0,
                  'aria-valuemin': 0,
                  'aria-valuemax': config.input === 'tap-tick' ? rulerMax : slideMax,
                  'aria-valuenow': config.input === 'tap-tick' ? (tapMark ?? 0) : shown,
                  'aria-disabled': disabled ? true : undefined,
                }
              : {})}
            className={['ni-mlen__ruler', invite === 'ruler' ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
            aria-label={
              rulerAdjustable
                ? t('ui.mlen.ruler')
                : twoRuler
                  ? t('ui.mlen.two-ruler-picture', { thing: name.toLowerCase() })
                  : t('ui.mlen.ruler-picture', {
                      unit: unitName(config.unit),
                      thing: name.toLowerCase(),
                    })
            }
            data-ruler-start={shown}
            style={{ transform: `translateX(${-shift}px)` }}
            onPointerDown={onRulerDown}
            onClick={(e) => {
              if (config.input !== 'tap-tick' || !interactive) return;
              const m = markAt(e.clientX);
              if (m === null) return;
              trace('tap', `mark-${m}`);
              setTapMark(m);
            }}
            onKeyDown={(e) => {
              if (!interactive || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
              const step = e.key === 'ArrowRight' ? config.precision : -config.precision;
              if (config.input === 'tap-tick') {
                e.preventDefault();
                const m = r3(Math.min(rulerMax, Math.max(0, (tapMark ?? 0) + step)));
                trace('move', `mark-${m}`);
                setTapMark(m);
              } else if (tier === 'concrete') {
                e.preventDefault();
                // → slides the ruler right, so a smaller mark comes under the object's start.
                const to = clampSlide(state.rulerStart - step);
                trace('move', 'ruler');
                apply({ op: 'slide-ruler', args: { to } });
              }
            }}
          >
            <Ruler
              max={rulerMax}
              unitPx={rulerUnit}
              precision={config.precision}
              unitLabel={unitLabel}
              marks={rulerMarks}
              {...(twoRuler
                ? { labels: rulerLabelsEach(rulerMax, rulerUnit), dense: compact }
                : {})}
            />
          </div>
        </div>
      </fieldset>
    );
  }

  const entry = picking ? (
    <fieldset
      className={['ni-mlen__options', invite === 'options' ? 'ni-invite' : '']
        .filter(Boolean)
        .join(' ')}
      aria-label={t('ui.widget.choices')}
      disabled={!interactive}
    >
      {(config.options ?? []).map((n) => {
        const id = `opt-${n}`;
        return (
          <PickCard
            key={id}
            label={String(n)}
            selected={choice === id}
            variant="numeral"
            data-id={id}
            onPress={() => {
              trace('tap', id);
              if (speakOnTap) sayNumber(n);
              setChoice(id);
            }}
          >
            <span className="ni-pick__numeral">{n}</span>
          </PickCard>
        );
      })}
    </fieldset>
  ) : config.input === 'tap-tick' ? null : (
    <BoxEntry
      texts={texts}
      active={activeBox}
      onActive={(i) => {
        trace('tap', `box-${i}`);
        setActiveBox(i);
      }}
      onTexts={(next) => {
        setInvite(null);
        setTexts(next);
      }}
      labels={units.map((u) =>
        // Two rulers: the name holds the symbol the box prints ("centimeters (cm)").
        twoRuler ? `${unitName(u)} (${u})` : laying ? unitName(u) : t('ui.widget.answer'),
      )}
      adornments={
        twoRuler
          ? units.map((u) => (
              // Each box prints its unit as the rulers do (drawn by CSS from data-unit-word, so the
              // box's name, "centimeters (cm): 8", stays its whole accessible text).
              <span key={u} className="ni-mlen__unit-word" data-unit-word={u} aria-hidden="true" />
            ))
          : laying
            ? units.map((u) => (
                // The whole unit picture, centred in a square beside the number (evidence review: a
                // shell sat at the top of its slot and read as a clipped dome).
                <span key={u} className="ni-mlen__unit-icon" data-unit-icon={u}>
                  <UnitPiece unit={u} width={u === 'cube' ? 30 : 38} />
                </span>
              ))
            : []
      }
      maxDigits={laying || twoRuler ? 2 : readDigits}
      allowDecimal={!laying && config.precision < 1}
      disabled={!interactive}
      compact
      highlightedKey={pressedKey}
      invitedBox={invite === 'entry' ? activeBox : null}
      onEnter={submit}
      onKeyTrace={(k) => trace('tap', `key-${k}`)}
    />
  );

  return (
    <div
      ref={root}
      className="ni-mlen"
      data-mode={config.mode}
      data-two-ruler={twoRuler ? 'true' : undefined}
      data-tier={tier}
      data-compact={compact ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={
        {
          '--unit': `${laying ? unitPxOf(config.unit) : rulerUnit}px`,
          ...handStyle,
        } as CSSProperties
      }
    >
      {picture}
      <div className="ni-mlen__answer">
        {entry}
        <CheckButton onPress={submit} disabled={!interactive || !response} />
      </div>
      {hand}
    </div>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true" focusable="false">
      <path
        d="M14 18h16a10 10 0 0 1 0 20H18"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M20 8 8 18l12 10z" fill="var(--color-ink)" />
    </svg>
  );
}

export default MeasureLengthWidget;
