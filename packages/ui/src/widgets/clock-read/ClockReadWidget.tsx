import {
  type ClockReadState,
  formatModel,
  hourAngle,
  isDaylight,
  minuteAngle,
  readChoiceIds,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useRef, useState } from 'react';
import { paint } from '../../art/core/paint';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { HandPointerIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  CLOCK,
  ClockFace,
  faceTime,
  NumberPadKeys,
  ObjectSprite,
  type PadBox,
  PadBoxView,
  type PadKey,
  PickCard,
  polarPoint,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useInviteHand,
  usePadEntry,
  useRoomy,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './clock-read.css';

/**
 * `clock-read` (03 §5.5, pictorial): what time does the clock show? The face draws both hands
 * from the item's one time (geared: at 3:30 the short hand is halfway between 3 and 4).
 * `digital-pad` types `_ _ : _ _` on the number pad (both minute digits, so 3:05 is never 3:50)
 * and answers `numbers [h, m]`; `pick` taps one of the options (#84's hour picks: `opt-<h>`,
 * spoken as numbers; time options are spoken as times); `ampm` picks a.m. or p.m. Every response
 * is built by the engine model.
 *
 * Demo ops: `point-hour`, `point-minute` (the guide points at the hand, which lights up),
 * `count-fives {to}` (the long hand's way round is counted by fives, each spoken), and `answer`.
 */

const OPS = ['point-hour', 'point-minute', 'count-fives', 'answer'] as const;
const KEY_MS = 340;
/** The face's diameter: 284 px, and larger where the area is roomy (kit `useRoomy`). */
const FACE_PX = 284;
const FACE_ROOMY_PX = 388;
const HAND_PX = 56;

type Config = ConfigFor<'clock-read'>;
type Option = { id: string; label: string; speak?: string };

const BOXES: PadBox[] = [
  { id: 'hours', maxDigits: 2 },
  { id: 'minutes', maxDigits: 2, exactDigits: true },
];

const isNumber = (s: string) => /^\d+$/.test(s);
const isTimeLabel = (s: string) => /^\d{1,2}:\d{2}$/.test(s);

/**
 * The sky of the a.m. / p.m. clue (TIM.05): the sun over the sea in daylight, the moon and stars
 * in the dark. It stands beside the scene (`ampm.scene`: a daily event such as breakfast or
 * bedtime, drawn and named), which is what tells a child the half of the day; the sky agrees
 * with it. A named picture, with no action.
 */
function SkyClue({ day, label }: { day: boolean; label: string }) {
  return (
    <svg
      className="ni-cread__sky"
      data-sky={day ? 'day' : 'night'}
      role="img"
      aria-label={label}
      viewBox="0 0 160 96"
      width={160}
      height={96}
      focusable="false"
    >
      <rect
        x="1.5"
        y="1.5"
        width="157"
        height="93"
        rx="14"
        fill={paint(day ? 'sky-light' : 'ink')}
        stroke={paint('ink')}
        strokeWidth={3}
      />
      {day ? (
        <g>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: the sun's rays are positional
                key={i}
                x1={80 + Math.cos(a) * 26}
                y1={42 + Math.sin(a) * 26}
                x2={80 + Math.cos(a) * 34}
                y2={42 + Math.sin(a) * 34}
                stroke={paint('sun-deep')}
                strokeWidth={4}
                strokeLinecap="round"
              />
            );
          })}
          <circle
            cx="80"
            cy="42"
            r="19"
            fill={paint('sunshine')}
            stroke={paint('ink')}
            strokeWidth={2.5}
          />
          <path
            d="M3 78Q30 70 56 78T108 78T157 78L157 86Q157 93 150 93L10 93Q3 93 3 86Z"
            fill={paint('sea-deep')}
          />
        </g>
      ) : (
        <g>
          <path
            d="M96 22A24 24 0 1 0 110 62A19 19 0 1 1 96 22Z"
            fill={paint('paper')}
            stroke={paint('paper')}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          {[
            [34, 26, 3.2],
            [52, 58, 2.6],
            [128, 30, 2.8],
            [136, 66, 3.2],
            [28, 72, 2.4],
          ].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={paint('sunshine')} />
          ))}
        </g>
      )}
    </svg>
  );
}

export function ClockReadWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap } = useUiPreferences();
  const trace = useInteractionTrace(onInteract);
  const [roomy, areaRef] = useRoomy();
  const facePx = roomy ? FACE_ROOMY_PX : FACE_PX;
  const alive = useAlive();
  const pause = useDemoPause();
  const model = formatModel('clock-read');
  const pad = usePadEntry(BOXES);
  const [state, setState] = useState<ClockReadState>(
    () => model?.initialState(config) as ClockReadState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const [choice, setChoice] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const interactive = !disabled && !demoBusy;
  const time = faceTime(config.time.h, config.time.m);

  const options: Option[] = config.ampm
    ? [
        { id: 'am', label: t('ui.clock.am') },
        { id: 'pm', label: t('ui.clock.pm') },
      ]
    : (config.options ?? []);
  const isPick = config.input === 'pick';

  const speakOption = (o: Option) => {
    if (o.speak) say(o.speak);
    else if (config.ampm) say(o.id === 'am' ? 'ui.clock.am' : 'ui.clock.pm');
    else if (isNumber(o.label)) sayNumber(Number(o.label));
    else if (isTimeLabel(o.label)) say('ui.clock.time', { time: o.label });
  };

  const pick = (o: Option) => {
    if (!interactive) return;
    trace('tap', o.id);
    if (speakOnTap) speakOption(o);
    setInvite(null);
    setChoice(o.id);
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    pad.type(key);
  };

  const apply = (action: WidgetAction) => {
    const prev = stateRef.current;
    if (!model) return prev;
    const next = model.apply(prev, action) as ClockReadState;
    stateRef.current = next;
    setState(next);
    return next;
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || !model) return false;
    const action: WidgetAction | null = isPick
      ? choice
        ? { op: 'answer', args: { id: choice } }
        : null
      : pad.complete
        ? { op: 'answer', args: { values: pad.values as number[] } }
        : null;
    if (!action) return false;
    const r = model.toResponse(model.apply(model.initialState(config), action));
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      if (!model) return;
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'point-hour' || action.op === 'point-minute') {
          apply(action);
          await pause(1300);
        } else if (action.op === 'count-fives') {
          const next = model.apply(stateRef.current, action) as ClockReadState;
          const to = next.fives;
          if (to === null) return;
          for (let k = 5; k <= to; k += 5) {
            apply({ op: 'count-fives', args: { to: k } });
            sayNumber(k);
            await pause(450);
            if (!alive.current) return;
          }
          await pause(400);
        } else if (action.op === 'answer') {
          const next = apply(action);
          const r = model.toResponse(next);
          if (r?.kind === 'choice') {
            setChoice(r.id);
            await pause(500);
          } else if (r?.kind === 'numbers') {
            pad.setTexts(BOXES.map(() => ''));
            const [h, m] = r.values as [number, number];
            const list: [number, string][] = [
              [0, String(h)],
              [1, String(m).padStart(2, '0')],
            ];
            for (const [i, text] of list) {
              pad.setActive(i);
              let typed = '';
              for (const ch of text.split('') as PadKey[]) {
                setPressedKey(ch);
                await pause(KEY_MS);
                if (!alive.current) return;
                typed += ch;
                const texts = [...pad.textsRef.current];
                texts[i] = typed;
                pad.setTexts(texts);
              }
              setPressedKey(null);
            }
            await pause(KEY_MS);
          }
        }
      } finally {
        if (alive.current) {
          setPressedKey(null);
          setDemoBusy(false);
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const pointed =
    invite?.op === 'point-hour' ? 'hour' : invite?.op === 'point-minute' ? 'minute' : state.pointed;
  // The guide's hand rests on the middle of the hand being pointed at.
  const handAt = (() => {
    if (!pointed) return null;
    const deg = pointed === 'hour' ? hourAngle(time) : minuteAngle(time);
    const len = pointed === 'hour' ? CLOCK.hourLen : CLOCK.minuteLen;
    const p = polarPoint(len * 0.62, deg);
    const k = facePx / 200;
    return { left: facePx / 2 + p.x * k - HAND_PX * 0.42, top: facePx / 2 + p.y * k - 8 };
  })();
  const invitedId =
    invite?.op === 'answer' && typeof invite.args?.id === 'string' ? invite.args.id : null;
  const invitedBox = invite?.op === 'answer' && !isPick ? pad.active : -1;
  // The guide's hand for a child step (kit `useInviteHand`): under the invited choice or typed box. The
  // demo's point-hour / point-minute hand above is different: it rests ON a hand of the clock.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const invitedBoxId = invitedBox >= 0 ? (BOXES[invitedBox]?.id ?? '') : '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      invitedId !== null
        ? ([...root.querySelectorAll<HTMLElement>('.ni-cread__options .ni-pick')].find(
            (el) => el.dataset.id === invitedId,
          ) ?? null)
        : invitedBoxId !== ''
          ? root.querySelector<HTMLElement>(`.ni-padbox[data-box="${invitedBoxId}"]`)
          : null,
    invitedId !== null ? `option:${invitedId}` : invitedBoxId !== '' ? `box:${invitedBoxId}` : '',
  );
  const label = t('ui.widget.picture');
  const fives = state.fives !== null && state.fives > 0 ? { from: 0, to: state.fives } : null;

  const face = (
    <div className="ni-cread__face" style={{ width: facePx } as CSSProperties}>
      <ClockFace
        t={time}
        numerals={config.numerals}
        size={facePx}
        highlight={pointed}
        fives={fives}
        label={label}
      />
      {handAt ? (
        <span
          className="ni-hand ni-cread__hand"
          style={handAt}
          data-pointing={pointed ?? undefined}
        >
          <HandPointerIcon />
        </span>
      ) : null}
    </div>
  );

  if (isPick) {
    const ids = readChoiceIds(config);
    return (
      <div
        className="ni-cread"
        data-input="pick"
        data-tier={tier}
        data-disabled={disabled ? 'true' : undefined}
        ref={(el) => {
          rootRef.current = el;
          areaRef.current = el;
        }}
        data-roomy={roomy ? 'true' : undefined}
        style={handRootStyle}
      >
        {face}
        <div className="ni-cread__answer">
          {config.ampm ? (
            <div className="ni-cread__clue">
              <span
                className="ni-cread__scene"
                data-scene={config.ampm.scene}
                role="img"
                aria-label={t(spriteNameKey(`event-${config.ampm.scene}`))}
              >
                <ObjectSprite sprite={`event-${config.ampm.scene}`} />
              </span>
              <SkyClue
                day={isDaylight(config.time.h)}
                label={t(isDaylight(config.time.h) ? 'ui.clock.sky-day' : 'ui.clock.sky-night')}
              />
            </div>
          ) : null}
          <fieldset
            className="ni-cread__options"
            aria-label={t('ui.widget.choices')}
            disabled={!interactive}
            style={{ '--cols': Math.min(options.length, 2) } as CSSProperties}
          >
            {options
              .filter((o) => ids.includes(o.id))
              .map((o) => (
                <span key={o.id} className="ni-cread__slot">
                  <PickCard
                    label={o.label}
                    selected={choice === o.id}
                    highlighted={invitedId === o.id}
                    variant={isNumber(o.label) || isTimeLabel(o.label) ? 'numeral' : 'word'}
                    data-id={o.id}
                    onPress={() => pick(o)}
                  >
                    {isNumber(o.label) || isTimeLabel(o.label) ? (
                      <span className="ni-pick__numeral">{o.label}</span>
                    ) : (
                      <span>{o.label}</span>
                    )}
                  </PickCard>
                </span>
              ))}
          </fieldset>
          <CheckButton onPress={submit} disabled={!interactive || choice === null} />
        </div>
        {inviteHand}
      </div>
    );
  }

  const box = (i: number) => {
    const b = BOXES[i] as PadBox;
    return (
      <PadBoxView
        box={b}
        text={pad.texts[i] ?? ''}
        label={t(b.id === 'hours' ? 'ui.clock.hours' : 'ui.clock.minutes')}
        active={pad.active === i}
        invited={invitedBox === i}
        disabled={!interactive}
        onPress={() => {
          trace('tap', `box-${b.id}`);
          pad.setActive(i);
        }}
      />
    );
  };

  return (
    <div
      className="ni-cread"
      data-input="digital-pad"
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      ref={(el) => {
        rootRef.current = el;
        areaRef.current = el;
      }}
      data-roomy={roomy ? 'true' : undefined}
      style={handRootStyle}
    >
      {face}
      <div className="ni-cread__answer">
        <div className="ni-cread__boxes">
          {box(0)}
          <span className="ni-padbox__sep" aria-hidden="true">
            :
          </span>
          {box(1)}
        </div>
        <CheckButton onPress={submit} disabled={!interactive || !pad.complete} />
      </div>
      <div className="ni-padarea ni-padarea--compact">
        <NumberPadKeys
          onKey={onKey}
          onEnter={submit}
          disabled={!interactive}
          highlighted={pressedKey}
        />
      </div>
      {inviteHand}
    </div>
  );
}

export default ClockReadWidget;
