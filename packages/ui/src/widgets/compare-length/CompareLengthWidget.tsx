import {
  type CompareLengthState,
  type FormatModel,
  formatModel,
  startOf,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
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
  const rowH = typed && compact ? 56 : minTarget + 8;
  const sideW = ask === 'order' ? 2 * minTarget + 12 : minTarget + 8;
  const width = Math.max(320, (avail?.width ?? 1100) - sideW - 48);
  const lineX = ask === 'order' ? minTarget + 16 : 20;
  const maxEnd = Math.max(...config.objects.map((o) => o.offset + o.length));
  const unit = Math.max(8, Math.min(64, Math.floor((width - lineX - 16) / maxEnd)));
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
          {slot + 1}
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
      <div key={o.id} className="ni-clen__lane" data-lane={o.id} style={{ height: rowH }}>
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
          <span className="ni-clen__art" style={{ width: objW }}>
            <LengthObject sprite={o.sprite} width={objW} height={Math.min(44, rowH - 16)} />
            {picked ? <span className="ni-clen__ring" aria-hidden="true" /> : null}
          </span>
        </button>
        {state.strings.includes(o.id) ? (
          <span
            className="ni-clen__laid"
            style={{ left: startPx(o), top: rowH - 16 }}
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
          <div className="ni-clen__badge-grid">
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
            {state.strings.map((id) => {
              const o = config.objects.find((x) => x.id === id) as Obj;
              return (
                <span
                  key={id}
                  className="ni-clen__string-row"
                  style={{ paddingLeft: lineX }}
                  data-string-row={id}
                >
                  <StringPiece width={o.length * unit} />
                  <span className="ni-clen__string-tag" style={{ width: 30, height: 30 }}>
                    <LengthObject sprite={o.sprite} width={30} height={20} />
                  </span>
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
