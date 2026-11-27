import {
  type FormatModel,
  type FractionPickState,
  formatModel,
  labelFraction,
  nameInputOf,
  usesOptions,
} from '@number-island/engine';
import type { StimulusSpec, WidgetAction } from '@number-island/shared';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { CheckIcon, CloseIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  FracNumeral,
  FractionEntry,
  FractionView,
  fractionWords,
  type PadKey,
  PickCard,
  padValue,
  StimulusView,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './fraction-pick.css';

/**
 * `fraction-pick` (03 §5.5): a fraction picture and a choice.
 * - `fair-or-not`: is the picture cut into equal parts? Two big answers, yes and no (an icon and
 *   the word; the word is spoken on tap).
 * - `pick-picture`, `compare`, `equivalent`, `name` with `words`: pick one of ≥ 3 option cards
 *   (pictures, stacked fraction numerals, or words). Pictures carry no name, so the card's name
 *   never gives the answer away.
 * - `name` with `pads` (the default): type the fraction on two boxes stacked as a fraction.
 * Pictorial tier draws the pictures large; abstract tier leads with the symbols (an option with a
 * label shows it, its picture small beside it). The model (`formatModel('fraction-pick')`) holds
 * the state; the response is always its `toResponse`.
 *
 * Demo ops: `highlight {id}` (an option or `stimulus`), `overlay {a, b}`, `count-parts`, plus
 * `answer {id}` / `answer {values}`.
 */

const OPS = ['highlight', 'overlay', 'count-parts', 'answer'] as const;
const KEY_MS = 340;
const COUNT_MS = 650;

type Config = ConfigFor<'fraction-pick'>;
type Option = NonNullable<Config['options']>[number];

const model = (): FormatModel<'fraction-pick', FractionPickState> => {
  const m = formatModel('fraction-pick');
  if (!m) throw new Error('fraction-pick has no engine model');
  // The registry stores models type-erased; this one's state is FractionPickState.
  return m as unknown as FormatModel<'fraction-pick', FractionPickState>;
};

/** The widget's width, so pictures size to the area they have (06 §1: 906 to 1226 px). */
function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1180);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setWidth(el.clientWidth || 1180);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const fractionOf = (s: StimulusSpec | undefined) => (s?.kind === 'fraction' ? s : null);

export function FractionPickWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const { ref, width } = useWidth();
  const [state, setState] = useState<FractionPickState>(() => model().initialState(config));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [texts, setTexts] = useState<[string, string]>(['', '']);
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const [active, setActive] = useState<0 | 1>(0);
  const [counting, setCounting] = useState<number | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const interactive = !disabled && !demoBusy;

  const pads = config.mode === 'name' && nameInputOf(config) === 'pads';
  const withOptions = usesOptions(config);
  const compact = width < 1100;
  const apply = (a: WidgetAction) => {
    const next = model().apply(stateRef.current, a);
    stateRef.current = next;
    setState(next);
  };

  // ---------- answering ----------

  const choose = (id: string, speak?: () => void) => {
    if (!interactive) return;
    setInvite(null);
    // A child's pick clears the guide's hints on the picture.
    apply({ op: 'overlay' });
    if (stateRef.current.choice === id) {
      // Tapping (or Enter on) the picked card again takes the pick back.
      trace('undo', id);
      if (speakOnTap) say('ui.frac.take-back');
      apply({ op: 'answer', args: { id, off: true } });
      return;
    }
    trace('tap', id);
    if (speakOnTap) speak?.();
    apply({ op: 'answer', args: { id } });
  };

  const typeKey = (key: PadKey) => {
    if (!interactive) return;
    trace('tap', `key-${key}`);
    setInvite(null);
    const next: [string, string] = [...textsRef.current];
    next[active] = applyPadKey(next[active], key, 2);
    textsRef.current = next;
    setTexts(next);
  };

  const response = (() => {
    if (!pads) return model().toResponse(state);
    const [a, b] = texts.map(padValue);
    if (a === null || b === null || a === undefined || b === undefined) return null;
    return model().toResponse(model().apply(state, { op: 'answer', args: { values: [a, b] } }));
  })();

  const submit = useSubmitGuard(() => {
    if (!interactive || !response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const stimulusParts = fractionOf(config.stimulus)?.parts ?? 0;

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'count-parts') {
          apply(action);
          if (!reduced) {
            for (let i = 0; i < stimulusParts; i += 1) {
              setCounting(i);
              sayNumber(i + 1);
              await pause(COUNT_MS);
              if (!alive.current) return;
            }
          }
          setCounting(null);
        } else if (action.op === 'highlight') {
          apply(action);
          await pause(1200);
          if (alive.current) apply({ op: 'highlight' });
        } else if (action.op === 'overlay') {
          apply(action);
          await pause(900);
        } else if (action.op === 'answer') {
          const values = action.args?.values;
          if (pads && Array.isArray(values)) {
            const cleared: [string, string] = ['', ''];
            textsRef.current = cleared;
            setTexts(cleared);
            for (const [slot, v] of values.slice(0, 2).entries()) {
              setActive(slot === 0 ? 0 : 1);
              let text = '';
              for (const ch of String(v).split('') as PadKey[]) {
                setPressedKey(ch);
                await pause(KEY_MS);
                if (!alive.current) return;
                text += ch;
                const next: [string, string] = [...textsRef.current];
                next[slot === 0 ? 0 : 1] = text;
                textsRef.current = next;
                setTexts(next);
              }
              setPressedKey(null);
            }
          } else {
            const id = typeof action.args?.id === 'string' ? action.args.id : null;
            if (id) {
              apply({ op: 'highlight', args: { id } });
              await pause(600);
              if (!alive.current) return;
            }
            apply(action);
            apply({ op: 'highlight' });
          }
          await pause(300);
        }
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  const invitedId =
    invite?.op === 'answer' || invite?.op === 'highlight'
      ? typeof invite.args?.id === 'string'
        ? invite.args.id
        : null
      : null;
  const inviteStimulus = invite?.op === 'count-parts' || invitedId === 'stimulus';
  const invitedSlot: 0 | 1 | null = pads && invite?.op === 'answer' && !invitedId ? active : null;
  // Pip's up-pointing hand under the invited card, the picture or the box to type into (kit
  // `useInviteHand`). Option ids are matched by value, not in a selector.
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    ref,
    (root) => {
      if (inviteStimulus) return root.querySelector<HTMLElement>('.ni-fpick__stimulus');
      if (invitedSlot !== null) {
        return root.querySelector<HTMLElement>(`.ni-fentry__box[data-slot="${invitedSlot}"]`);
      }
      if (invitedId === null) return null;
      return (
        [...root.querySelectorAll<HTMLElement>('.ni-pick[data-id]')].find(
          (el) => el.dataset.id === invitedId,
        ) ?? null
      );
    },
    inviteStimulus
      ? 'stimulus'
      : invitedSlot !== null
        ? `slot:${invitedSlot}`
        : invitedId === null
          ? ''
          : `opt:${invitedId}`,
  );

  // ---------- render ----------

  const stimulus = config.stimulus;
  const stimFraction = fractionOf(stimulus);
  // A name item's number line (#17 slice 5b, FRA.10): 0 to 1 cut into equal parts with a dot,
  // named by its parts and the dot's counted tick, never the fraction.
  const dot = stimulus?.kind === 'number-line' ? stimulus.marks?.[0] : undefined;
  const lineName =
    config.mode === 'name' &&
    stimulus?.kind === 'number-line' &&
    stimulus.ticksEvery !== null &&
    dot &&
    dot.label === undefined
      ? t('ui.frac.dot-line', {
          max: stimulus.max,
          n: Math.round(1 / stimulus.ticksEvery),
          k: Math.round(dot.at / stimulus.ticksEvery),
        })
      : undefined;
  const k = ageMode === 'k';
  // Option pictures share one box (abstract tier with labels: a small one beside the symbols), so
  // every option's whole is drawn the same size.
  const baseBox = compact ? { w: 190, h: 130 } : { w: 250, h: 170 };
  // Many options stay on one row: each picture shrinks to its share of the width (a picture card
  // is its picture plus 34 px; 24 px between cards), never below a K-sized card.
  const nPictures = (config.options ?? []).length + (config.stimulus ? 1 : 0);
  const share =
    nPictures > 0 ? Math.floor((width - 40 - 140 - (nPictures - 1) * 24) / nPictures) - 34 : 0;
  const fitW = Math.max(k ? 82 : 64, Math.min(baseBox.w, share));
  const cardBox = { w: fitW, h: Math.min(baseBox.h, fitW * (baseBox.h / baseBox.w) + 20) };
  const optionScale =
    tier === 'abstract' && (config.options ?? []).some((o) => o.label !== undefined) ? 0.45 : 1;
  const optionPicBox = { w: cardBox.w * optionScale, h: cardBox.h * optionScale };
  // When the picture is compared with the options (equivalent, compare), it is drawn at their
  // size, so the wholes are at true relative scale.
  const comparedStimulus =
    withOptions && (config.mode === 'equivalent' || config.mode === 'compare');
  const stimBox = comparedStimulus
    ? optionPicBox
    : compact
      ? pads
        ? { w: k ? 180 : 200, h: 220 }
        : { w: 280, h: 230 }
      : { w: 420, h: 330 };

  const stimulusNode = stimulus ? (
    <div
      className={[
        'ni-fpick__stimulus',
        state.highlighted === 'stimulus' || inviteStimulus ? 'ni-invite' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-counting={counting !== null ? 'true' : undefined}
    >
      {stimFraction ? (
        <FractionView
          shape={stimFraction.shape}
          parts={stimFraction.parts}
          shaded={stimFraction.shaded}
          equalParts={stimFraction.equalParts}
          maxWidth={stimBox.w}
          maxHeight={stimBox.h}
          label={
            // A name item's picture says what a sighted child sees: the shape, its equal parts
            // and how many are shaded, never the fraction's name (K02 slice 5a). Other modes
            // keep "Picture": a fair-or-not item asks whether the parts are equal.
            config.mode === 'name' && stimFraction.equalParts
              ? t(`ui.frac.picture-shaded-${stimFraction.shape}`, {
                  n: stimFraction.parts,
                  s: stimFraction.shaded,
                })
              : t('ui.widget.picture')
          }
          overlay={state.overlay}
          counting={counting}
        />
      ) : (
        <StimulusView
          spec={stimulus}
          maxWidth={stimBox.w}
          maxHeight={stimBox.h}
          {...(lineName ? { label: lineName } : {})}
        />
      )}
    </div>
  ) : null;

  const checkButton = <CheckButton onPress={submit} disabled={!interactive || response === null} />;
  let answer: ReactNode;
  if (config.mode === 'fair-or-not') {
    const yesNo = [
      { id: 'yes', key: 'word.yes', icon: <CheckIcon /> },
      { id: 'no', key: 'word.no', icon: <CloseIcon /> },
    ];
    answer = (
      <fieldset
        className="ni-fpick__options"
        data-kind="yes-no"
        aria-label={t('ui.widget.choices')}
        disabled={!interactive}
      >
        {yesNo.map((o) => (
          <span key={o.id} className="ni-fpick__slot">
            <PickCard
              label={t(o.key)}
              selected={state.choice === o.id}
              highlighted={state.highlighted === o.id || invitedId === o.id}
              variant="word"
              data-id={o.id}
              onPress={() => choose(o.id, () => say(o.key))}
            >
              <span className="ni-fpick__yesno" data-answer={o.id}>
                <span className="ni-fpick__yesno-icon">{o.icon}</span>
                <span className="ni-fpick__word">{t(o.key)}</span>
              </span>
            </PickCard>
          </span>
        ))}
      </fieldset>
    );
  } else if (withOptions) {
    answer = (
      <fieldset
        className="ni-fpick__options"
        data-count={config.options?.length ?? 0}
        aria-label={t('ui.widget.choices')}
        disabled={!interactive}
      >
        {(config.options ?? []).map((o, i) => (
          <span key={o.id} className="ni-fpick__slot">
            <OptionCard
              option={o}
              index={i}
              tier={tier}
              box={optionPicBox}
              selected={state.choice === o.id}
              highlighted={state.highlighted === o.id || invitedId === o.id}
              onPress={(speak) => choose(o.id, speak)}
            />
          </span>
        ))}
      </fieldset>
    );
  } else {
    answer = (
      <div className="ni-fpick__entry">
        <FractionEntry
          texts={texts}
          active={active}
          onActivate={(slot) => {
            if (!interactive) return;
            trace('tap', slot === 0 ? 'top' : 'bottom');
            setActive(slot);
          }}
          onKey={typeKey}
          onEnter={submit}
          disabled={!interactive}
          pressedKey={pressedKey}
          invitedSlot={invitedSlot}
          below={checkButton}
        />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="ni-fpick"
      data-mode={config.mode}
      data-tier={tier}
      data-compact={compact ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={handRootStyle}
    >
      {stimulusNode}
      <div className="ni-fpick__answer" data-stacked={stimulus ? undefined : 'true'}>
        {answer}
        {pads ? null : checkButton}
      </div>
      {inviteHand}
    </div>
  );
}

/** One option: a fraction picture, a stacked fraction, or a word. */
function OptionCard({
  option,
  index,
  tier,
  box,
  selected,
  highlighted,
  onPress,
}: {
  option: Option;
  index: number;
  tier: string;
  box: { w: number; h: number };
  selected: boolean;
  highlighted: boolean;
  onPress: (speak?: () => void) => void;
}) {
  const t = useNarrationText();
  const { say } = useSpeech();
  const fraction = fractionOf(option.stimulus);
  const numeral = labelFraction(option.label);
  // A picture-only option is named by what it shows ("a circle in 3 parts, all the same size"),
  // as a sighted child sees it, never by a fraction word (PR #132 review).
  const described = fraction
    ? t(`ui.frac.picture-${fraction.equalParts ? 'equal' : 'unequal'}-${fraction.shape}`, {
        n: fraction.parts,
      })
    : undefined;
  const name = numeral
    ? fractionWords(t, numeral.a, numeral.b)
    : (option.label ??
      (option.speak ? t(option.speak) : (described ?? t('ui.widget.choice', { n: index + 1 }))));
  const speak = option.speak
    ? () => say(option.speak as string)
    : numeral
      ? () => say('ui.frac.value', { f: `${numeral.a}/${numeral.b}` })
      : undefined;
  // Abstract tier leads with the symbols: a labelled option shows its label large.
  const symbolsFirst = tier === 'abstract' && option.label !== undefined;
  const picture = option.stimulus ? (
    fraction ? (
      <FractionView
        shape={fraction.shape}
        parts={fraction.parts}
        shaded={fraction.shaded}
        equalParts={fraction.equalParts}
        maxWidth={box.w}
        maxHeight={box.h}
      />
    ) : (
      <StimulusView spec={option.stimulus} maxWidth={box.w} maxHeight={box.h} minCell={22} />
    )
  ) : null;
  const text =
    option.label !== undefined || option.speak ? (
      numeral ? (
        <FracNumeral a={numeral.a} b={numeral.b} drawn />
      ) : (
        <span className="ni-fpick__word">{option.label ?? t(option.speak as string)}</span>
      )
    ) : null;
  return (
    <PickCard
      label={name}
      selected={selected}
      highlighted={highlighted}
      variant={picture && !symbolsFirst ? 'picture' : text && !picture ? 'word' : 'picture'}
      data-id={option.id}
      onPress={() => onPress(speak)}
    >
      <span className="ni-fpick__card" data-symbols-first={symbolsFirst ? 'true' : undefined}>
        {symbolsFirst ? text : picture}
        {symbolsFirst ? picture : text}
      </span>
    </PickCard>
  );
}

export default FractionPickWidget;
