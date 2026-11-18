import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { HandPointerIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import { CheckButton, PickCard, StimulusView, useAlive, useDemoPause } from '../kit';
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

  const submit = () => {
    if (!interactive || selected === null) return;
    const model = formatModel('numeral-pick');
    if (!model) return;
    const state = model.apply(model.initialState(config), { op: 'tap', args: { id: selected } });
    const response = model.toResponse(state);
    if (response) onResponse(response);
  };

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
  return (
    <div className="ni-npick" data-tier={tier} data-disabled={disabled ? 'true' : undefined}>
      {stimulus.kind !== 'none' ? (
        <StimulusView spec={stimulus} maxWidth={760} maxHeight={280} />
      ) : null}
      <div className="ni-npick__answer">
        <fieldset
          className="ni-npick__options"
          data-layout={config.layout}
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
                    <StimulusView spec={o.stimulus} maxWidth={220} maxHeight={140} label={name} />
                  ) : variant === 'numeral' ? (
                    <span className="ni-pick__numeral">{o.label}</span>
                  ) : (
                    <span>{name}</span>
                  )}
                </PickCard>
                {invite === o.id ? (
                  <span className="ni-hand ni-npick__hand">
                    <HandPointerIcon />
                  </span>
                ) : null}
              </span>
            );
          })}
        </fieldset>
        <CheckButton onPress={submit} disabled={!interactive || selected === null} />
      </div>
    </div>
  );
}

export default NumeralPickWidget;
