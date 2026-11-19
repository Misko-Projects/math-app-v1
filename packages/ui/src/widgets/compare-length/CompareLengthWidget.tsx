import {
  type CompareLengthState,
  type FormatModel,
  formatModel,
  startOf,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import { CheckButton, spriteNameKey, useAlive, useDemoPause, useSubmitGuard } from '../kit';
import { useInviteHand } from '../kit/inviteHand';
import { LengthObject, StringPiece } from '../kit/LengthViews';
import { enteredValues, NumberEntry } from '../kit/NumberEntry';
import { useAvailableSize } from '../kit/useAvailableSize';
import type { ConfigFor, WidgetProps } from '../types';
import './compare-length.css';

/**
 * `compare-length` (03 §5.5): two to four objects side by side from a start line, all drawn on
 * one scale (an object `length` units long is exactly `length × unit` px; its left end is
 * `offset` units right of the line until it is lined up).
 * - `longer`, `shorter`: tap the object; Check answers `choice` (`obj-<i>`). On the concrete tier
 *   a misaligned object slides: drag it to the start line (or press ← on it) to line it up.
 * - `order`: drag the numbered badges 1, 2, 3… onto the objects (or tap a badge, then an object);
 *   Check answers the lengths in badge order (`numbers`).
 * - `indirect` (MEA.07): the objects cannot move; drag the string onto each (or tap it, then the
 *   object) to lay a string along it. The strings show side by side from one line, then the child
 *   taps the longer (shorter) object.
 * - `how-much-longer`: type the difference on the pad (`number`).
 * Every response comes from the engine model (`formatModel('compare-length')`).
 *
 * Demo ops: `align {id}`, `lay-string {id}`, `highlight-difference`, plus `answer`.
 */

const OPS = ['align', 'lay-string', 'highlight-difference', 'answer'] as const;
const TRAY = 'tray';
const STRING = 'string';

type Config = ConfigFor<'compare-length'>;
type Obj = Config['objects'][number];

/** Room under an invited lane for Pip's hand (it hangs about 46 px below the object). */
const HAND_ROOM = 40;
/** The largest unit (px): a short object still reads as an object, not a bar across the screen. */
const UNIT_MAX = 120;
/** Indirect: each object's tag (its colour and mark), on its lane and on its string. */
const TAG_PX = 44;
const TAG_TONES = [
  { fill: 'var(--color-coral)', mark: 'circle' },
  { fill: 'var(--color-sea)', mark: 'triangle' },
  { fill: 'var(--color-sunshine)', mark: 'square' },
  { fill: 'var(--color-leaf)', mark: 'diamond' },
] as const;

const badgeId = (slot: number) => `slot-${slot}`;
const slotOf = (id: string) => Number(id.replace('slot-', ''));

export function CompareLengthWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const model = formatModel('compare-length') as
    | FormatModel<'compare-length', CompareLengthState>
    | undefined;
  if (!model) throw new Error('compare-length has no engine model');
  const t = useNarrationText();
  const { say } = useSpeech();
  const { speakOnTap, ageMode, tapOnly } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const root = useRef<HTMLDivElement>(null);
  const avail = useAvailableSize(root);
  const [state, setState] = useState<CompareLengthState>(() => model.initialState(config));
  const [texts, setTexts] = useState<string[]>(['']);
  const [invite, setInvite] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [slide, setSlide] = useState<{ id: string; dx: number } | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const interactive = !disabled && !demoBusy;
  const ask = config.ask;
  const apply = (a: WidgetAction) => setState((s) => model.apply(s, a));

  // ---------- layout: one scale for every object ----------
  const compact = avail !== null && avail.height < 400;
  const minTarget = MIN_TARGET_PX[ageMode];
  const typed = ask === 'how-much-longer';
  // Lanes take the height they have (evidence review: thin ribbons in a mostly empty card), from
  // the target size up to 140 px; indirect keeps room for the strings box under them.
  const nObj = config.objects.length;
  const lanesBudget =
    (avail?.height ?? 560) - 48 - (ask === 'indirect' ? nObj * TAG_PX + (nObj - 1) * 12 + 34 : 0);
  const rowFloor = compact ? minTarget : minTarget + 8;
  const rowH = typed
    ? compact
      ? 56
      : minTarget + 8
    : Math.max(rowFloor, Math.min(140, Math.floor((lanesBudget - (nObj - 1) * 12) / nObj)));
  // The object's drawing: most of the lane (ribbons ≈ 60 % of it). Indirect draws it at the top
  // of the lane and lays the string under it, clear of the pick ring.
  const artH = ask === 'indirect' ? rowH - 34 : typed && compact ? 44 : rowH - 12;
  // The side column's real width (Check is 114 px in K, 180 px with its word; the badge tray is
  // two badges, a 12 px gap and 10 px padding): an estimate off by a few px feeds back through
  // the measured area into the scale.
  const checkW = ageMode === 'k' ? 114 : 180;
  const sideW = Math.max(checkW, ask === 'order' ? 2 * minTarget + 32 : minTarget);
  const width = Math.max(320, (avail?.width ?? 1100) - sideW - 48);
  // Indirect: each lane starts with its object's tag (the same tag marks its string).
  const lineX = ask === 'order' ? minTarget + 16 : ask === 'indirect' ? TAG_PX + 20 : 20;
  const maxEnd = Math.max(...config.objects.map((o) => o.offset + o.length));
  // The objects use the width they have (evidence review: the ribbons used a quarter of it).
  const unit = Math.max(8, Math.min(UNIT_MAX, Math.floor((width - lineX - 16) / maxEnd)));
  const lanesW = Math.min(width, lineX + maxEnd * unit + 24);
  const slidable = tier === 'concrete' && !config.aligned && ask !== 'indirect';

  const nameOf = (o: Obj, i: number) =>
    t('ui.clen.object', { name: t(spriteNameKey(o.sprite)), n: i + 1 });
  const startPx = (o: Obj) => lineX + startOf(state, o.id) * unit;

  // ---------- picking and sliding ----------
  const allStrings = config.objects.every((o) => state.strings.includes(o.id));
  const pick = (o: Obj) => {
    if (!interactive) return;
    trace('tap', o.id);
    if (speakOnTap) say(spriteNameKey(o.sprite));
    setInvite(null);
    // Indirect (03 §5.5): the strings are laid along every object before the child chooses.
    if (ask === 'indirect' && !allStrings) return;
    if (ask === 'longer' || ask === 'shorter' || ask === 'indirect') {
      apply({ op: 'answer', args: { id: o.id } });
    }
  };

  const align = (o: Obj) => {
    setInvite(null);
    apply({ op: 'align', args: { id: o.id } });
  };

  const drag = useRef<{ id: string; x: number; moved: boolean; pointer: number } | null>(null);
  const onObjectDown = (o: Obj, e: ReactPointerEvent) => {
    // Tap-only mode (06 §7) has no drags; ← on the keyboard still lines an object up.
    if (!interactive || tapOnly || !slidable || state.aligned.includes(o.id)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: o.id, x: e.clientX, moved: false, pointer: e.pointerId };
    const offsetPx = startOf(state, o.id) * unit;
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointer) return;
      const dx = Math.max(-offsetPx, Math.min(unit * 2, ev.clientX - d.x));
      if (!d.moved && Math.abs(ev.clientX - d.x) < 8) return;
      if (!d.moved) {
        d.moved = true;
        trace('drag', o.id);
      }
      ev.preventDefault();
      setSlide({ id: o.id, dx });
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      drag.current = null;
      if (!d.moved) return;
      const dx = Math.max(-offsetPx, ev.clientX - d.x);
      setSlide(null);
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      // Close to the start line (within half a unit): it lines up. Otherwise it slides back.
      if (Math.abs(offsetPx + dx) <= unit * 0.6) {
        trace('drop', 'start');
        align(o);
      } else trace('drop', 'none');
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const suppressClick = useRef(false);

  // ---------- badges (order) and the string (indirect): drag or tap onto an object ----------
  const dnd = useDragToTarget<string, string>({
    disabled: !interactive || (ask !== 'order' && ask !== 'indirect'),
    trace,
    canPlace: (item, target) => {
      if (item === STRING) return target !== TRAY && !state.strings.includes(target);
      if (target === TRAY) return badgeHolder(item) !== '';
      return true;
    },
    onSelect: (item) => {
      if (item) setInvite(null);
      if (item && speakOnTap && item.startsWith('slot-')) {
        say('ui.clen.badge', { n: slotOf(item) + 1 });
      }
    },
    onPlace: ({ item, target }) => {
      setInvite(null);
      if (item === STRING) {
        apply({ op: 'lay-string', args: { id: target } });
        return;
      }
      const slot = slotOf(item);
      if (target === TRAY) {
        const holder = state.slots[slot];
        if (holder) apply({ op: 'place', args: { id: holder, slot: -1 } });
        return;
      }
      // A badge on an object: that object takes this place (any badge it had goes back).
      apply({ op: 'place', args: { id: target, slot } });
    },
  });
  /** The object holding a badge ('' when the badge is in the tray). */
  function badgeHolder(item: string): string {
    return state.slots[slotOf(item)] ?? '';
  }

  // ---------- answer ----------
  const values = enteredValues(texts);
  const response = typed
    ? values
      ? model.toResponse(model.apply(state, { op: 'answer', args: { value: values[0] } }))
      : null
    : ask === 'indirect' && !allStrings
      ? null
      : model.toResponse(state);
  const submit = useSubmitGuard(() => {
    if (!interactive || !response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo ----------
  const idOf = (a: WidgetAction | null) => (typeof a?.args?.id === 'string' ? a.args.id : null);
  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setInvite(null);
      setDemoBusy(true);
      try {
        if (action.op === 'answer' && typed && typeof action.args?.value === 'number') {
          const digits = String(action.args.value);
          let text = '';
          for (const d of digits) {
            setPressedKey(d);
            text += d;
            setTexts([text]);
            await pause(320);
            if (!alive.current) return;
          }
          setPressedKey(null);
        }
        apply(action);
        const o = config.objects.find((x) => x.id === idOf(action));
        if (o && action.op !== 'answer') say(spriteNameKey(o.sprite));
        await pause(action.op === 'highlight-difference' ? 1400 : 800);
      } finally {
        if (alive.current) setDemoBusy(false);
      }
    },
    invite: (action) => {
      if (!action) return setInvite(null);
      if (action.op === 'lay-string') return setInvite(STRING);
      if (action.op === 'answer' && Array.isArray(action.args?.values)) return setInvite('slot-0');
      setInvite(idOf(action) ?? (action.op === 'answer' && typed ? 'entry' : null));
    },
  });

  // ---------- drawing ----------
  const sorted = [...config.objects].sort((a, b) => a.length - b.length);
  const shortest = sorted[0] as Obj;
  const longest = sorted[sorted.length - 1] as Obj;
  const endOf = (o: Obj) => startPx(o) + o.length * unit;

  // Pip's hand under the invited object, badge, string or answer box (kit useInviteHand).
  const { hand, rootStyle: handStyle } = useInviteHand(
    root,
    (r) => {
      if (!invite) return null;
      if (invite === STRING) return r.querySelector<HTMLElement>('.ni-clen__spool');
      if (invite === 'entry') return r.querySelector<HTMLElement>('.ni-entry__box');
      if (invite.startsWith('slot-'))
        return r.querySelector<HTMLElement>(`.ni-clen__badge[data-badge="${slotOf(invite)}"]`);
      return r.querySelector<HTMLElement>(`.ni-clen__obj[data-id="${invite}"]`);
    },
    invite ?? '',
  );

  const badge = (slot: number) => {
    const id = badgeId(slot);
    const p = dnd.itemProps(id, { label: t('ui.clen.badge', { n: slot + 1 }) });
    return (
      <span key={id} className="ni-clen__badge-slot">
        <span
          {...p}
          className={[p.className, 'ni-clen__badge', invite === id ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-badge={slot}
        >
          {/* The numeral is a glyph Pip's hand keeps clear of (kit useInviteHand). */}
          <span className="ni-btn__label">{slot + 1}</span>
        </span>
      </span>
    );
  };

  const lane = (o: Obj, i: number) => {
    const picked = state.choice === o.id;
    const slot = state.slots.indexOf(o.id);
    const left = startPx(o) + (slide?.id === o.id ? slide.dx : 0);
    const objW = o.length * unit;
    const isTarget = ask === 'order' || ask === 'indirect';
    const targetP = isTarget ? dnd.targetProps(o.id, { label: nameOf(o, i) }) : null;
    const pickable = ask === 'longer' || ask === 'shorter' || ask === 'indirect';
    return (
      <div
        key={o.id}
        className="ni-clen__lane"
        data-lane={o.id}
        // Invited: room under the lane for Pip's hand, which hangs below the object, so it never
        // reaches the next lane (evidence review).
        style={{ height: rowH, marginBottom: invite === o.id ? HAND_ROOM : undefined }}
      >
        {ask === 'indirect' ? <ObjectTag i={i} id={o.id} /> : null}
        {targetP ? (
          <button
            type="button"
            {...targetP}
            className={[targetP.className, 'ni-clen__pad'].join(' ')}
          />
        ) : null}
        {ask === 'order' && slot >= 0 ? (
          <span className="ni-clen__placed" style={{ width: lineX - 8 }}>
            {badge(slot)}
          </span>
        ) : null}
        {/* Where this lane's badge goes, until one is there (evidence review). */}
        {ask === 'order' && slot < 0 ? (
          <span className="ni-clen__placed" style={{ width: lineX - 8 }} aria-hidden="true">
            <span className="ni-clen__slot" data-slot-for={o.id} />
          </span>
        ) : null}
        <button
          type="button"
          className={[
            'ni-clen__obj',
            picked ? 'ni-clen__obj--picked' : '',
            invite === o.id ? 'ni-invite' : '',
            slidable && !state.aligned.includes(o.id) ? 'ni-clen__obj--slides' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-id={o.id}
          data-start={startOf(state, o.id)}
          data-length={o.length}
          aria-label={nameOf(o, i)}
          aria-pressed={pickable ? picked : undefined}
          aria-disabled={!interactive ? true : undefined}
          style={{
            left,
            width: Math.max(objW, minTarget),
            height: rowH,
            transition:
              slide?.id === o.id || reduced ? 'none' : 'left 600ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          onPointerDown={(e) => onObjectDown(o, e)}
          onClick={() => {
            if (suppressClick.current) return;
            if (isTarget && dnd.selected !== null) {
              // A badge or the string is picked up: the object is where it goes.
              root.current
                ?.querySelector<HTMLElement>(`[data-lane="${o.id}"] > .ni-clen__pad`)
                ?.click();
              return;
            }
            pick(o);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && slidable && !state.aligned.includes(o.id) && interactive) {
              e.preventDefault();
              trace('move', o.id);
              align(o);
            }
          }}
        >
          <span
            className="ni-clen__art"
            style={{
              width: objW,
              ...(ask === 'indirect' ? { alignSelf: 'flex-start', marginTop: 4 } : {}),
            }}
          >
            <LengthObject sprite={o.sprite} width={objW} height={artH} unitPx={unit} />
            {picked ? <span className="ni-clen__ring" aria-hidden="true" /> : null}
          </span>
        </button>
        {state.strings.includes(o.id) ? (
          <span
            className="ni-clen__laid"
            // Under the log, 10 px below its pick ring's edge.
            style={{ left: startPx(o), top: 4 + artH + 10 }}
            data-string={o.id}
          >
            <StringPiece width={objW} />
          </span>
        ) : null}
      </div>
    );
  };

  const difference =
    state.differenceShown && endOf(longest) > endOf(shortest) ? (
      <span
        className="ni-clen__diff"
        data-diff-units={(endOf(longest) - endOf(shortest)) / unit}
        style={{
          left: endOf(shortest),
          width: endOf(longest) - endOf(shortest),
          top: config.objects.indexOf(longest) * (rowH + 12),
          height: rowH,
        }}
        aria-hidden="true"
      />
    ) : null;

  const side = (
    <div className="ni-clen__side">
      {ask === 'order' ? (
        <div className="ni-clen__badges">
          {(() => {
            const p = dnd.targetProps(TRAY, { label: t('ui.clen.badges') });
            return (
              <button type="button" {...p} className={[p.className, 'ni-clen__tray'].join(' ')} />
            );
          })()}
          <div
            className="ni-clen__badge-grid"
            // A badge invited: room under its row for Pip's hand, clear of the badge below.
            style={invite?.startsWith('slot-') ? { rowGap: 12 + HAND_ROOM } : undefined}
          >
            {config.objects.map((_, slot) =>
              state.slots[slot] ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: one spot per badge
                <span key={slot} className="ni-clen__badge-gap" aria-hidden="true">
                  {slot + 1}
                </span>
              ) : (
                badge(slot)
              ),
            )}
          </div>
        </div>
      ) : null}
      {ask === 'indirect' ? (
        <span className="ni-clen__spool-slot">
          {(() => {
            const p = dnd.itemProps(STRING, { label: t('ui.clen.string') });
            return (
              <span
                {...p}
                className={[p.className, 'ni-clen__spool', invite === STRING ? 'ni-invite' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <SpoolIcon />
              </span>
            );
          })()}
        </span>
      ) : null}
      <CheckButton
        onPress={submit}
        disabled={!interactive || !response}
        invited={invite === 'check'}
      />
    </div>
  );

  return (
    <div
      ref={root}
      className="ni-clen"
      data-ask={ask}
      data-tier={tier}
      data-compact={compact ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={{ '--unit': `${unit}px`, ...handStyle } as CSSProperties}
    >
      <div className="ni-clen__main">
        <fieldset
          className="ni-clen__lanes"
          aria-label={t('ui.widget.picture')}
          style={{ width: lanesW }}
          data-unit-px={unit}
        >
          <span className="ni-clen__line" style={{ left: lineX }} aria-hidden="true" />
          {tier === 'pictorial' || typed ? (
            <span
              className="ni-clen__floor"
              style={{ left: lineX, width: maxEnd * unit }}
              aria-hidden="true"
            />
          ) : null}
          {config.objects.map(lane)}
          {difference}
        </fieldset>
        {ask === 'indirect' && state.strings.length > 0 ? (
          <div
            className="ni-clen__strings"
            style={{ width: lanesW }}
            aria-label={t('ui.clen.strings')}
            role="img"
          >
            <span className="ni-clen__line" style={{ left: lineX }} aria-hidden="true" />
            {/* One row per object, in the objects' order, each starting with that object's tag. */}
            {config.objects.map((o, i) => {
              const laid = state.strings.includes(o.id);
              return (
                <span
                  key={o.id}
                  className="ni-clen__string-row"
                  style={{ paddingLeft: lineX, height: TAG_PX }}
                  data-row={o.id}
                  data-string-row={laid ? o.id : undefined}
                >
                  <ObjectTag i={i} id={o.id} />
                  {laid ? <StringPiece width={o.length * unit} /> : null}
                </span>
              );
            })}
          </div>
        ) : null}
        {typed ? (
          <div className="ni-clen__entry">
            <NumberEntry
              texts={texts}
              active={0}
              onActive={() => {}}
              onTexts={(next) => {
                setInvite(null);
                setTexts(next);
              }}
              labels={[t('ui.widget.answer')]}
              disabled={!interactive}
              compact={compact}
              highlightedKey={pressedKey as never}
              invitedBox={invite === 'entry' ? 0 : null}
              onEnter={submit}
              onKeyTrace={(k) => trace('tap', `key-${k}`)}
            />
          </div>
        ) : null}
      </div>
      {side}
      {hand}
    </div>
  );
}

/**
 * An object's tag in `indirect`: its colour and a mark (circle, triangle, square, diamond: never
 * colour alone), at the start of its lane and of its string, so each string says whose it is.
 */
function ObjectTag({ i, id }: { i: number; id: string }) {
  const tone = TAG_TONES[i % TAG_TONES.length] as (typeof TAG_TONES)[number];
  const marks: Record<string, ReactNode> = {
    circle: <circle cx="22" cy="22" r="10" />,
    triangle: <path d="M22 10 34 32H10z" />,
    square: <rect x="12" y="12" width="20" height="20" rx="2" />,
    diamond: <path d="M22 9 35 22 22 35 9 22z" />,
  };
  return (
    <span className="ni-clen__tag" data-tag={id} data-mark={tone.mark} aria-hidden="true">
      <svg viewBox="0 0 44 44" width={TAG_PX} height={TAG_PX} focusable="false" aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="40"
          height="40"
          rx="10"
          fill={tone.fill}
          stroke="var(--color-ink)"
          strokeWidth="3"
        />
        <g fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2.5">
          {marks[tone.mark]}
        </g>
      </svg>
    </span>
  );
}

function SpoolIcon() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false">
      <rect
        x="14"
        y="12"
        width="36"
        height="40"
        rx="6"
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <rect x="10" y="8" width="44" height="8" rx="4" fill="var(--color-wood-deep)" />
      <rect x="10" y="48" width="44" height="8" rx="4" fill="var(--color-wood-deep)" />
      <path
        d="M16 22h32M16 28h32M16 34h32M16 40h32"
        stroke="var(--color-ink-soft)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M48 36c8 2 10 10 4 16"
        fill="none"
        stroke="var(--color-ink-soft)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default CompareLengthWidget;
