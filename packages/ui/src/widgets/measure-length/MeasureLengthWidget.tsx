import {
  type FormatModel,
  formatModel,
  type LengthUnit,
  lengthIn,
  type MeasureLengthState,
  objectUnits,
  UNIT_SIZE,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
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
import { useInviteHand } from '../kit/inviteHand';
import {
  LengthObject,
  RULER_PAD,
  Ruler,
  rulerWidth,
  UnitPiece,
  unitHeight,
} from '../kit/LengthViews';
import { enteredValues, NumberEntry } from '../kit/NumberEntry';
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
 * - `estimate`: pick an option.
 * Every response comes from the engine model (`formatModel('measure-length')`).
 *
 * Demo ops: `lay-unit {index, unit?}`, `slide-ruler {to}`, `align-zero`, `count-units`,
 * `read-end`, plus `answer`.
 */

const OPS = ['lay-unit', 'slide-ruler', 'align-zero', 'count-units', 'read-end', 'answer'] as const;
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

  const laying = config.mode === 'iterate' || config.mode === 'two-units';
  const picking = config.mode === 'estimate' || config.input === 'pick';
  const drawnUnits = laying && tier === 'pictorial';
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
  const sideW = piles > 0 ? (piles + 1) * (MIN_TARGET_PX[ageMode] + 12) + 12 : 0;
  const trackW = Math.max(240, Math.min(1000, (avail?.width ?? 1100) - sideW - 24));
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
  const rulerMax = Math.ceil(config.startOffset + whole) + 1;
  // Standard units print their symbol on the ruler, in its own slot after the end numeral.
  const unitLabel = ['in', 'cm', 'ft', 'm'].includes(config.unit) ? config.unit : undefined;
  // The ruler fills the track: its width is `rulerMax × unit` plus its fixed ends (padding, the
  // end numeral's half and the unit symbol's slot), so a long ruler (30 cm) still fits.
  const rulerUnit = laying
    ? 0
    : Math.max(
        12,
        Math.min(90, Math.floor((trackW - rulerWidth(rulerMax, 0, unitLabel)) / rulerMax)),
      );
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

  /** "Take one back": lifts the unit laid last (of either kind). */
  const takeBack = () => {
    const last = state.units[state.units.length - 1];
    if (!last || !interactive) return;
    trace('undo', last.id);
    apply({
      op: 'lay-unit',
      args: { index: Number(last.id.split('-').pop()), unit: last.unit, remove: true },
    });
  };

  // ---------- the ruler: slides on the concrete tier; tap-tick marks the end ----------
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
      apply({ op: 'slide-ruler', args: { to: Math.max(0, r3(to)) } });
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

  // Pip's hand under the invited pile, ruler, options or answer box (kit useInviteHand).
  const { hand, rootStyle: handStyle } = useInviteHand(
    root,
    (r) => {
      if (!invite) return null;
      if (invite.startsWith('pile-'))
        return r.querySelector<HTMLElement>(`.ni-mlen__pile[data-pile="${invite.slice(5)}"]`);
      if (invite === 'ruler') return r.querySelector<HTMLElement>('.ni-mlen__ruler');
      if (invite === 'options') return r.querySelector<HTMLElement>('.ni-mlen__options .ni-pick');
      return r.querySelector<HTMLElement>(`.ni-entry__box[data-box="${activeBox}"]`);
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
        tapX.current = e.clientX;
        trackP.onClick(e);
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
      <LengthObject sprite={config.object.sprite} width={objectPx} height={44} />
    </div>
  );

  const pile = (u: LengthUnit) => {
    const p = dnd.itemProps(pileId(u), { label: t('ui.mlen.pile', { unit: unitName(u) }) });
    // Two units stacked inside the pile's box (border 3, padding 4 each side), to scale between
    // kinds where they fit: a 64 px cube stack was 130 px tall in an 80 px pile.
    const inner = MIN_TARGET_PX[ageMode] - 14;
    let px = Math.min(unitPxOf(u), inner);
    while (px > 8 && 2 * unitHeight(u, px) + 2 > inner) px -= 1;
    return (
      <span key={u} className="ni-mlen__pile-slot">
        <span
          {...p}
          className={[p.className, 'ni-mlen__pile', invite === pileId(u) ? 'ni-invite' : '']
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
          <span className="ni-mlen__pile-units" aria-hidden="true">
            <UnitPiece unit={u} width={px} />
            <UnitPiece unit={u} width={px} />
          </span>
        </span>
      </span>
    );
  };

  const name = t(spriteNameKey(config.object.sprite));
  let picture: React.ReactNode;
  if (laying) {
    picture = (
      <fieldset className="ni-mlen__stage" aria-label={name}>
        {!drawnUnits ? <div className="ni-mlen__piles">{units.map(pile)}</div> : null}
        <div
          className="ni-mlen__measure"
          style={{ width: objectPx + Math.max(...units.map(unitPxOf)) }}
        >
          {track}
          {unitRow(units[0] as LengthUnit)}
          <div className="ni-mlen__object-line">
            <span className="ni-mlen__start" aria-hidden="true" />
            {objectRow}
          </div>
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
  } else {
    const shown = rulerDrag ?? state.rulerStart;
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
          <div className="ni-mlen__object" style={{ marginLeft: objectLeft, width: objectPx }}>
            <LengthObject sprite={config.object.sprite} width={objectPx} height={44} />
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
          {/* The ruler is a slider: tap-tick moves the end mark along it; on the concrete tier
              the ruler itself slides (drag, or ←/→). */}
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            className={['ni-mlen__ruler', invite === 'ruler' ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
            aria-label={t('ui.mlen.ruler')}
            aria-valuemin={0}
            aria-valuemax={rulerMax}
            aria-valuenow={config.input === 'tap-tick' ? (tapMark ?? 0) : shown}
            aria-disabled={disabled ? true : undefined}
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
                const to = r3(Math.max(0, state.rulerStart - step));
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
    <NumberEntry
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
      labels={units.map((u) => (laying ? unitName(u) : t('ui.widget.answer')))}
      adornments={
        laying
          ? units.map((u) => <UnitPiece key={u} unit={u} width={u === 'stick' ? 40 : 30} />)
          : []
      }
      maxDigits={laying ? 2 : readDigits}
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
