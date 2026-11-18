import { formatModel } from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { IconButton } from '../../primitives/IconButton';
import { HandPointerIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  flyFrom,
  type NumberLineMark,
  NumberLineView,
  NumberPadKeys,
  numberLineViewScale,
  type PadKey,
  padValue,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './number-line-jump.css';

/**
 * `number-line-jump` (03 §5.5, Road Crew W1): a Pebbling hops along the Numbered Road.
 *
 * - Concrete (`path: 'stones'`): a row of numbered stepping stones. Tapping a stone says its
 *   number; tapping the stone one allowed hop away hops there.
 * - Pictorial: `line` (ticks and numbers), `open` (a bare line: the child picks the jump sizes and
 *   each arc shows its size) and `timeline` (arcs labelled, minutes when `unit: 'min'`).
 *
 * The child taps a jump button (one per `allowedJumps`: the arrow points the way, the numeral is
 * the size; never colour alone) to hop, and can take back the last hop. With `thenAsk` they type
 * the landing number or the total jump on the pad. "Check" answers
 * `{ kind: 'state', value: { jumps, value? } }`, built through the format model. Any allowed path
 * to the target is fine (the checker decides; strategy freedom).
 *
 * Trace: `tap` `jump-<by>` for a jump button (e.g. `jump-1`, `jump--10`), `tap` `stone-<n>`,
 * `undo` `jump-<by>` for the hop taken back, `tap` `key-<k>` on the pad.
 *
 * Demo ops: `hop {by}`, `label-landing`, `highlight {at}`, `bridge-to {at}`, plus `answer {value}`.
 */

const OPS = ['hop', 'label-landing', 'highlight', 'bridge-to', 'answer'] as const;
const MODEL = formatModel('number-line-jump');
const HOP_MS = 460;
const KEY_MS = 320;
const LINE_W = 1060;

type Config = ConfigFor<'number-line-jump'>;

const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

// ---------- art (original) ----------

/** The hopper: a round shore Pebbling with a pebble shell (5-grouping) and two stalk eyes. */
function Hopper() {
  return (
    <svg viewBox="-10 0 116 84" width="100%" height="100%" aria-hidden="true" focusable="false">
      <ellipse cx="48" cy="79" rx="30" ry="5" fill="rgb(38 70 83 / 0.2)" />
      {/* Little claws: a shore crab Pebbling. */}
      {[-1, 1].map((side) => (
        <g key={side} transform={side < 0 ? undefined : 'translate(96 0) scale(-1 1)'}>
          <path d="M14 56 4 48" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" />
          <path
            d="M-6 44a9 9 0 1 1 13 9l-4-6-5 4Z"
            fill="var(--color-coral)"
            stroke="var(--color-ink)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>
      ))}
      <path
        d="M26 66c-6 4-10 9-8 12M70 66c6 4 10 9 8 12"
        stroke="var(--color-ink)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M38 24 33 9M58 24l5-15"
        stroke="var(--color-ink)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle
        cx="32"
        cy="9"
        r="7"
        fill="var(--color-cloud)"
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
      <circle
        cx="64"
        cy="9"
        r="7"
        fill="var(--color-cloud)"
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
      <circle cx="33" cy="10" r="3" fill="var(--color-ink)" />
      <circle cx="63" cy="10" r="3" fill="var(--color-ink)" />
      <path
        d="M10 56c0-20 17-34 38-34s38 14 38 34c0 9-8 14-18 14H28c-10 0-18-5-18-14Z"
        fill="var(--color-sea)"
        stroke="var(--color-sea-dark)"
        strokeWidth="3.5"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          cx={24 + i * 12}
          cy={46}
          r={4.6}
          fill="var(--color-sunshine-light)"
          stroke="var(--color-sea-dark)"
          strokeWidth="2"
        />
      ))}
      <path
        d="M30 34c4-4 9-6 15-6.5"
        stroke="#fff"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.6"
        fill="none"
      />
      <path
        d="M40 60q8 6 16 0"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** A hop arrow: the direction is the sign (ink on white, never colour alone). */
function HopArrow({ back }: { back: boolean }) {
  return (
    <svg viewBox="0 0 56 40" width="100%" height="100%" aria-hidden="true" focusable="false">
      <g transform={back ? 'translate(56 0) scale(-1 1)' : undefined}>
        <path
          d="M6 32C12 12 34 6 46 22"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M50 12 48 30 33 23Z"
          fill="var(--color-ink)"
          stroke="var(--color-ink)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Take back the last hop: a curling-back arrow (not a left arrow, which means a backward hop). */
function UndoIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M14 20h17a9 9 0 0 1 0 18H22"
        stroke="var(--color-ink)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 11 10 20l10 9"
        stroke="var(--color-ink)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------- the widget ----------

export function NumberLineJumpWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { sayNumber } = useSpeech();
  const { speakOnTap } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const c = config;
  const stones = c.path === 'stones';

  const [hops, setHops] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [flight, setFlight] = useState<DOMRect | null>(null);
  const hopsRef = useRef(hops);
  hopsRef.current = hops;
  const hopperRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<HTMLDivElement | null>(null);

  const interactive = !disabled && !demoBusy;
  const position = c.start + hops.reduce((a, b) => a + b, 0);
  // Backward hops on the left (largest first), forward hops on the right: like the line itself.
  const allowed = [...new Set(c.allowedJumps)].sort((a, b) => a - b);
  const maxDigits = String(Math.max(Math.abs(c.min), Math.abs(c.max), c.max - c.min)).length;
  const canHop = (by: number, from = position) =>
    by !== 0 && from + by >= c.min && from + by <= c.max;

  // ---------- hopping ----------

  const hop = (by: number) => {
    const from = hopperRef.current?.getBoundingClientRect() ?? null;
    const next = [...hopsRef.current, by];
    hopsRef.current = next;
    setHops(next);
    setFlight(reduced ? null : from);
    return c.start + next.reduce((a, b) => a + b, 0);
  };

  const childHop = (by: number, target: string) => {
    if (!interactive || !canHop(by)) return;
    trace('tap', target);
    setInvite(null);
    setHighlight(null);
    const landed = hop(by);
    if (speakOnTap) sayNumber(landed);
  };

  const undo = () => {
    if (!interactive) return;
    const last = hopsRef.current.at(-1);
    if (last === undefined) return;
    trace('undo', `jump-${last}`);
    const from = hopperRef.current?.getBoundingClientRect() ?? null;
    const next = hopsRef.current.slice(0, -1);
    hopsRef.current = next;
    setHops(next);
    setFlight(reduced ? null : from);
  };

  const tapStone = (n: number) => {
    if (!interactive) return;
    const by = n - position;
    if (by !== 0 && c.allowedJumps.includes(by)) {
      childHop(by, `stone-${n}`);
      return;
    }
    trace('tap', `stone-${n}`);
    if (speakOnTap) sayNumber(n);
  };

  // Position the hopper over its stone / tick, then fly it there from where it was drawn.
  useLayoutEffect(() => {
    const el = hopperRef.current;
    if (!el) return;
    if (stones) {
      const box = pathRef.current;
      const stone = box?.querySelector<HTMLElement>(`[data-stone="${position}"]`);
      if (box && stone) {
        // Layout boxes (not the drawn rects): an in-flight hop must not shift the target.
        const left = (stone.parentElement?.offsetLeft ?? 0) + stone.offsetWidth / 2;
        el.style.left = `${left}px`;
      }
    }
    if (flight) {
      setFlight(null);
      void flyFrom(el, flight, { ms: HOP_MS, lift: stones ? 70 : 56 });
    }
  });

  // ---------- typing ----------

  const onKey = (key: PadKey) => {
    if (!interactive) return;
    trace('tap', `key-${key}`);
    setInvite(null);
    setTyped((prev) => applyPadKey(prev, key, maxDigits));
  };
  const typedValue = padValue(typed);

  // ---------- check (through the format model) ----------

  const response = (): ResponseValue | null => {
    if (!MODEL) return null;
    let s = MODEL.initialState(c);
    for (const by of hops) s = MODEL.apply(s, { op: 'hop', args: { by } });
    if (typedValue !== null) s = MODEL.apply(s, { op: 'answer', args: { value: typedValue } });
    return MODEL.toResponse(s);
  };
  const ready = hops.length > 0 && (c.thenAsk === null || typedValue !== null);
  // One debounce for every way to submit (Check button, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive || !ready) return false;
    const r = response();
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const num = (a: WidgetAction, key: string) => {
    const v = a.args?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const typeValue = async (v: number) => {
    const chars = String(Math.abs(v)).split('') as PadKey[];
    let text = '';
    setTyped('');
    for (const ch of chars) {
      setPressedKey(ch);
      await pause(KEY_MS);
      if (!alive.current) return;
      text = applyPadKey(text, ch, maxDigits);
      setTyped(text);
    }
    setPressedKey(null);
    // Let the last digit show before the op resolves.
    await pause(KEY_MS);
  };

  const currentPosition = () => c.start + hopsRef.current.reduce((a, b) => a + b, 0);

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'hop' || action.op === 'bridge-to') {
          const at = num(action, 'at');
          const by =
            action.op === 'hop' ? num(action, 'by') : at === null ? null : at - currentPosition();
          if (by === null || !canHop(by, currentPosition())) return;
          setHighlight(null);
          const landed = hop(by);
          await pause(HOP_MS);
          if (!alive.current) return;
          sayNumber(landed);
          await pause(220);
        } else if (action.op === 'highlight') {
          const at = num(action, 'at');
          if (at === null) return;
          setHighlight(at);
          sayNumber(at);
          await pause(1000);
        } else if (action.op === 'label-landing') {
          const total = hopsRef.current.reduce((a, b) => a + b, 0);
          const value = c.thenAsk === 'total-jump' ? Math.abs(total) : currentPosition();
          await typeValue(value);
          if (alive.current) sayNumber(value);
        } else if (action.op === 'answer') {
          const v = num(action, 'value');
          if (v !== null) await typeValue(v);
        }
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const invitedBy = (() => {
    if (!invite) return null;
    if (invite.op === 'hop') return num(invite, 'by');
    if (invite.op === 'bridge-to') {
      const at = num(invite, 'at');
      return at === null ? null : at - position;
    }
    return null;
  })();
  const invitedButton = invitedBy !== null && allowed.includes(invitedBy) ? invitedBy : null;
  const invitedSpot =
    invite?.op === 'highlight'
      ? num(invite, 'at')
      : invite?.op === 'bridge-to' && invitedButton === null
        ? num(invite, 'at')
        : null;
  const inviteAnswer = invite?.op === 'label-landing' || invite?.op === 'answer';
  const hand = (cls: string) => (
    <span className={`ni-hand ${cls}`}>
      <HandPointerIcon />
    </span>
  );

  let path: ReactNode;
  if (stones) {
    const values: number[] = [];
    for (let v = c.min; v <= c.max && values.length < 40; v++) values.push(v);
    path = (
      // biome-ignore lint/a11y/useSemanticElements: a flex row of stone buttons with an overlay, not a form group
      <div ref={pathRef} className="ni-nlj__stones" role="group" aria-label={t('ui.nlj.path')}>
        {values.map((v) => (
          <span key={v} className="ni-nlj__stoneslot">
            <button
              type="button"
              className={['ni-nlj__stone', invitedSpot === v ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
              data-stone={v}
              data-start={v === c.start ? 'true' : undefined}
              data-here={v === position ? 'true' : undefined}
              data-highlight={highlight === v ? 'true' : undefined}
              aria-label={v === position ? t('ui.nlj.hopper', { n: v }) : String(v)}
              aria-current={v === position ? 'true' : undefined}
              disabled={!interactive}
              onClick={() => tapStone(v)}
            >
              <span className="ni-nlj__stonenum" aria-hidden="true">
                {v}
              </span>
            </button>
            {invitedSpot === v ? hand('ni-nlj__stonehand') : null}
          </span>
        ))}
        <div ref={hopperRef} className="ni-nlj__hopper" data-path="stones" aria-hidden="true">
          <Hopper />
        </div>
      </div>
    );
  } else {
    const open = c.path === 'open';
    const labelArcs = open || c.path === 'timeline';
    const headroom = labelArcs ? 132 : 104;
    const jumps: { from: number; to: number }[] = [];
    let p = c.start;
    for (const by of hops) {
      jumps.push({ from: p, to: p + by });
      p += by;
    }
    // An open line has no scale to keep: it shows just the stretch the hops need (start, target
    // and every landing, with room around them), so small hops stay big enough to see.
    let viewMin = c.min;
    let viewMax = c.max;
    if (open) {
      const seen = [c.start, c.target ?? c.start, ...jumps.map((j) => j.to)];
      const lo = Math.min(...seen);
      const hi = Math.max(...seen);
      const room = Math.max(2, Math.ceil((hi - lo) * 0.15));
      viewMin = Math.max(c.min, lo - room);
      viewMax = Math.min(c.max, hi + room);
    }
    const scale = numberLineViewScale({ min: viewMin, max: viewMax, width: LINE_W, headroom });
    const marks: NumberLineMark[] = [{ at: c.start }];
    if (highlight !== null) marks.push({ at: highlight, arrow: true });
    const unit = c.unit === 'min' ? ' min' : '';
    path = (
      <div ref={pathRef} className="ni-nlj__line" style={{ width: LINE_W, height: headroom + 64 }}>
        <NumberLineView
          min={viewMin}
          max={viewMax}
          ticksEvery={open ? null : c.ticksEvery}
          labelsEvery={open ? null : c.labelsEvery}
          marks={marks}
          jumps={jumps}
          width={LINE_W}
          headroom={headroom}
          label={t('ui.nlj.path')}
        >
          {(s) => (
            <>
              {open ? (
                <text
                  className="ni-numberline__numeral"
                  x={s.x(c.start)}
                  y={s.lineY + 18 + 32 * 0.9}
                  fontSize={32}
                  textAnchor="middle"
                >
                  {c.start}
                </text>
              ) : null}
              {labelArcs
                ? jumps.map((j, i) => {
                    const dx = Math.abs(s.x(j.to) - s.x(j.from));
                    const h = Math.min(70, 18 + dx * 0.35);
                    const text = `${signed(j.to - j.from)}${unit}`;
                    // Numerals stay 32 px: an arc too narrow for its label goes unlabelled
                    // rather than overprinting its neighbours.
                    if (dx < text.length * 19 + 10) return null;
                    return (
                      <text
                        // biome-ignore lint/suspicious/noArrayIndexKey: hops are positional
                        key={i}
                        className="ni-nlj__arclabel"
                        x={(s.x(j.from) + s.x(j.to)) / 2}
                        y={s.lineY - 14 - h}
                        fontSize={32}
                        textAnchor="middle"
                      >
                        {text}
                      </text>
                    );
                  })
                : null}
              {invitedSpot !== null ? (
                <circle className="ni-nlj__spot" cx={s.x(invitedSpot)} cy={s.lineY} r={26} />
              ) : null}
            </>
          )}
        </NumberLineView>
        <div
          ref={hopperRef}
          className="ni-nlj__hopper"
          data-path="line"
          aria-hidden="true"
          style={{ left: scale.x(position), top: scale.lineY }}
        >
          <Hopper />
        </div>
      </div>
    );
  }

  const jumpButtons = (
    <div className="ni-nlj__jumps">
      <fieldset className="ni-nlj__jumpset" aria-label={t('ui.nlj.jumps')} disabled={!interactive}>
        {allowed.map((by) => {
          const back = by < 0;
          const label = back
            ? t('ui.nlj.hop-back', { n: Math.abs(by) })
            : t('ui.nlj.hop', { n: by });
          return (
            <span key={by} className="ni-nlj__jumpslot">
              <button
                type="button"
                className={['ni-nlj__jump', invitedButton === by ? 'ni-invite' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-by={by}
                data-blocked={canHop(by) ? undefined : 'true'}
                aria-label={label}
                disabled={!canHop(by)}
                onClick={() => childHop(by, `jump-${by}`)}
              >
                <span className="ni-nlj__jumparrow" data-back={back ? 'true' : undefined}>
                  <HopArrow back={back} />
                </span>
                <span className="ni-nlj__jumpnum" aria-hidden="true">
                  {Math.abs(by)}
                </span>
              </button>
              {invitedButton === by ? hand('ni-nlj__jumphand') : null}
            </span>
          );
        })}
      </fieldset>
      <IconButton
        label="ui.nlj.undo"
        icon={<UndoIcon />}
        disabled={!interactive || hops.length === 0}
        onPress={undo}
        className="ni-nlj__undo"
      />
    </div>
  );

  const check = <CheckButton onPress={submit} disabled={!interactive || !ready} />;

  return (
    <div
      className="ni-nlj"
      data-tier={tier}
      data-path={c.path}
      data-ask={c.thenAsk ?? 'none'}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-nlj__path">{path}</div>
      <div className="ni-nlj__controls">
        {jumpButtons}
        {c.thenAsk !== null ? (
          <>
            <NumberPadKeys
              onKey={onKey}
              onEnter={submit}
              disabled={!interactive}
              highlighted={pressedKey}
            />
            <div
              className={['ni-nlj__readout', inviteAnswer ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <NumberDisplay
                value={typed === '' ? null : typed}
                digits={Math.min(2, maxDigits)}
                size="lg"
                state={interactive && hops.length > 0 ? 'active' : 'idle'}
                label="ui.widget.answer"
                speakOnTap={false}
              />
              {check}
              {inviteAnswer ? hand('ni-nlj__answerhand') : null}
            </div>
          </>
        ) : (
          check
        )}
      </div>
    </div>
  );
}

export default NumberLineJumpWidget;
