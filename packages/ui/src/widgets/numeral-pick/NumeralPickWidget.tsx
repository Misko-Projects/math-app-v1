import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  PickCard,
  StimulusView,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './numeral-pick.css';

/**
 * `numeral-pick` (03 §5.5): a picture (or only the spoken question) and 3–5 choices: numerals,
 * number words, or small pictures. Tapping a choice speaks it (06 §5) and picks it; "check" sends
 * the pick as `{ kind: 'choice', id }`. The widget never shows which choice is right.
 *
 * Demo ops: `highlight {id}`, `tap {id}`, plus `answer {id}`.
 */

const OPS = ['highlight', 'tap', 'answer'] as const;

type Config = ConfigFor<'numeral-pick'>;
type Option = Config['options'][number];

const isNumeral = (label: string | undefined) => label !== undefined && /^-?\d+$/.test(label);

export function NumeralPickWidget({
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
  const alive = useAlive();
  const pause = useDemoPause();
  const [selected, setSelected] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Pip's up-pointing hand hangs below the invited card (kit `useInviteHand`), its fingertip inside
  // the card's bottom edge and clear of its numeral, word or picture.
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    // Matched by value, not a selector: an option ID may hold any character (a quote included).
    (root) =>
      invite === null
        ? null
        : ([...root.querySelectorAll<HTMLElement>('.ni-pick[data-id]')].find(
            (el) => el.dataset.id === invite,
          ) ?? null),
    // Prefixed: an empty ID is valid, and an empty key would hide the hand.
    invite === null ? '' : `opt:${invite}`,
  );
  const [demoBusy, setDemoBusy] = useState(false);
  const interactive = !disabled && !demoBusy;

  const speakOption = (o: Option) => {
    if (o.speak) say(o.speak, o.vars);
    else if (isNumeral(o.label)) sayNumber(Number(o.label));
  };

  const pick = (o: Option) => {
    if (!interactive) return;
    trace('tap', o.id);
    if (speakOnTap) speakOption(o);
    setInvite(null);
    setSelected(o.id);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || selected === null) return false;
    const model = formatModel('numeral-pick');
    if (!model) return false;
    const state = model.apply(model.initialState(config), { op: 'tap', args: { id: selected } });
    const response = model.toResponse(state);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  const idOf = (action: WidgetAction | null) =>
    typeof action?.args?.id === 'string' ? action.args.id : null;

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      const id = idOf(action);
      const option = config.options.find((o) => o.id === id);
      if (!option) return;
      setDemoBusy(true);
      setInvite(null);
      try {
        setHighlighted(option.id);
        speakOption(option);
        await pause(action.op === 'highlight' ? 1200 : 600);
        if (!alive.current) return;
        if (action.op !== 'highlight') setSelected(option.id);
        setHighlighted(null);
        await pause(300);
      } finally {
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(idOf(action)),
  });

  const stimulus = config.stimulus;
  // Numeral and word cards share one width, sized for the longest label (Baloo 2 numerals ≈ 30 px
  // a digit at 48 px; Andika words ≈ 18 px a letter at 32 px). Picture cards keep their own size.
  const longestNumeral = Math.max(
    1,
    ...config.options.map((o) => (isNumeral(o.label) ? (o.label ?? '').length : 0)),
  );
  const longestWord = Math.max(
    0,
    ...config.options.map((o) => (!o.stimulus && !isNumeral(o.label) ? (o.label ?? '').length : 0)),
  );
  const cardWidth =
    longestWord > 0 ? `${longestWord * 18 + 56}px` : `${longestNumeral * 30 + 44}px`;
  return (
    <div
      ref={rootRef}
      className="ni-npick"
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      style={handRootStyle}
    >
      {stimulus.kind !== 'none' ? (
        <StimulusView spec={stimulus} maxWidth={760} maxHeight={280} />
      ) : null}
      <div className="ni-npick__answer" data-layout={config.layout}>
        <fieldset
          className="ni-npick__options"
          data-layout={config.layout}
          // Grid: even columns (2 for up to 4 choices, else 3) so no choice sits alone off-centre.
          style={
            { '--cols': config.options.length <= 4 ? 2 : 3, '--card-w': cardWidth } as CSSProperties
          }
          aria-label={t('ui.widget.choices')}
          disabled={!interactive}
        >
          {config.options.map((o, i) => {
            const variant = o.stimulus ? 'picture' : isNumeral(o.label) ? 'numeral' : 'word';
            const name =
              o.label ?? (o.speak ? t(o.speak, o.vars) : t('ui.widget.choice', { n: i + 1 }));
            return (
              <span key={o.id} className="ni-npick__slot">
                <PickCard
                  label={name}
                  selected={selected === o.id}
                  highlighted={highlighted === o.id || invite === o.id}
                  variant={variant}
                  data-id={o.id}
                  onPress={() => pick(o)}
                >
                  {o.stimulus ? (
                    <StimulusView
                      spec={o.stimulus}
                      maxWidth={260}
                      maxHeight={110}
                      minCell={22}
                      label={name}
                    />
                  ) : variant === 'numeral' ? (
                    <span className="ni-pick__numeral">{o.label}</span>
                  ) : (
                    <span>{name}</span>
                  )}
                </PickCard>
              </span>
            );
          })}
        </fieldset>
        <CheckButton onPress={submit} disabled={!interactive || selected === null} />
      </div>
      {inviteHand}
    </div>
  );
}

export default NumeralPickWidget;
