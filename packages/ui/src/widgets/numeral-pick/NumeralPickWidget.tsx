import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  CheckButton,
  naturalPictureSize,
  PickCard,
  roomBox,
  Scaled,
  type Size,
  StimulusView,
  shapeSetFelt,
  shapeSetUnit,
  useActionSize,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
  useWidgetRoom,
  withInviteRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './numeral-pick.css';
import { CARD_LEDGE, planPick } from './layout';

/**
 * `numeral-pick` (03 §5.5): a picture (or only the spoken question) and 3–5 choices: numerals,
 * number words, or small pictures. Tapping a choice speaks it (06 §5) and picks it; "check" sends
 * the pick as `{ kind: 'choice', id }`. The widget never shows which choice is right.
 *
 * Laid out in the measured room (`planPick`, layout.ts): the cards and Check keep their size, the
 * picture is drawn to fit the room they leave, above the cards or beside them.
 *
 * Demo ops: `highlight {id}`, `tap {id}`, plus `answer {id}`.
 */

const OPS = ['highlight', 'tap', 'answer'] as const;

/** The boxes (CSS px) the question picture and a picture choice fit in. */
const STIMULUS_BOX = { width: 760, height: 280 };
/** The picture's frame around its drawing (kit.css `.ni-stimulus`: padding and border). */
const FRAME = { w: 2 * (28 + 3), h: 2 * (20 + 3) };
const CHOICE_BOX = { width: 260, height: 110 };
/**
 * Narrower boxes for picture choices, tried in turn while no arrangement fits the room (three
 * number-line cards beside a picture on the smallest landscape area).
 */
const CHOICE_WIDTHS = [CHOICE_BOX.width, 215] as const;

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
  const { ageMode } = useUiPreferences();
  const actRef = useRef<HTMLSpanElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const unzoomed = useRef(1);
  const button = useActionSize(actRef, unzoomed, ageMode);
  const room = roomBox(useWidgetRoom(rootRef));
  // Picture choices get a narrower box while nothing fits; a new room starts from the full one.
  const [choiceTier, setChoiceTier] = useState({ tier: 0, w: room.w, h: room.h });
  const choiceStep = choiceTier.w === room.w && choiceTier.h === room.h ? choiceTier.tier : 0;
  // The cards share one size (the grid's equal tracks), measured as drawn, and again as soon as
  // the choices' box changes, so a plan never works with the size of another box.
  const [card, setCard] = useState<(Size & { step: number }) | null>(null);
  const stepNow = useRef(choiceStep);
  stepNow.current = choiceStep;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new choice box is measured at once
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const el = grid.querySelector<HTMLElement>('.ni-npick__slot');
      if (!el) return;
      const w = Math.ceil(el.getBoundingClientRect().width);
      const h = Math.ceil(el.getBoundingClientRect().height) - CARD_LEDGE;
      const step = stepNow.current;
      setCard((c) => (c && c.w === w && c.h === h && c.step === step ? c : { w, h, step }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [choiceStep]);
  // The guide's up-pointing hand hangs below the invited card (kit `useInviteHand`), its fingertip inside
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
  const n = config.options.length;
  const natural = stimulus.kind === 'none' ? null : naturalPictureSize(stimulus);
  const planIn = (r: Size) =>
    planPick({
      room: r,
      card: card ?? { w: MIN_TARGET_PX[ageMode] * 1.4, h: MIN_TARGET_PX[ageMode] * 1.4 },
      n,
      button,
      picture: natural
        ? {
            w: Math.min(STIMULUS_BOX.width, natural.w) + FRAME.w,
            h: Math.min(STIMULUS_BOX.height, natural.h) + FRAME.h,
          }
        : null,
      // Row: the cards in one line with Check beside them. Grid: even columns (2 for up to 4
      // choices, else 3) with Check under them.
      classic:
        config.layout === 'grid'
          ? { cols: n <= 4 ? 2 : 3, check: 'below' }
          : { cols: n, check: 'beside' },
    });
  // Room below for the guide's pointer under an invited card, wherever a layout leaves it.
  const roomy = planIn(withInviteRoom(room));
  const plan = roomy.fits ? roomy : planIn(room);
  const box = plan.picture ?? { w: STIMULUS_BOX.width, h: STIMULUS_BOX.height };
  const pictureBox = {
    width: Math.max(1, Math.min(STIMULUS_BOX.width, box.w - FRAME.w)),
    height: Math.max(1, Math.min(STIMULUS_BOX.height, box.h - FRAME.h)),
  };
  // A short last row is centred under the full ones.
  const hasPictureChoices = config.options.some((o) => o.stimulus);
  useLayoutEffect(() => {
    if (card === null || card.step !== choiceStep || plan.fits || !hasPictureChoices) return;
    if (choiceStep + 1 < CHOICE_WIDTHS.length) {
      setChoiceTier({ tier: choiceStep + 1, w: room.w, h: room.h });
    }
  }, [card, plan.fits, hasPictureChoices, choiceStep, room.w, room.h]);
  const choiceWidth = CHOICE_WIDTHS[choiceStep] ?? CHOICE_BOX.width;
  const cells = n + (plan.check === 'cell' ? 1 : 0);
  const lastRow = cells - (Math.ceil(cells / plan.cols) - 1) * plan.cols;
  const lastShift = ((plan.cols - lastRow) * ((card?.w ?? 0) + plan.gap)) / 2;
  const inLastRow = (i: number) => i >= cells - lastRow;
  const check = (
    <span
      ref={actRef}
      className="ni-npick__check"
      style={plan.check === 'cell' ? { left: lastShift } : undefined}
    >
      <CheckButton onPress={submit} disabled={!interactive || selected === null} />
    </span>
  );
  // Shape pictures share one scale: a composition's target and the pieces in its choices compare
  // truly (GEO.10, GEO.11), so the smallest fit of any of them draws them all.
  //
  // The question's shapes are fitted to the box the plan gives them, and the plan depends on the
  // cards, whose shapes use the same scale: smaller shapes make smaller cards, a bigger box and
  // bigger shapes again. So in one room the question's scale only ever goes down (`unitCap`), and
  // the layout settles on the first scale that fits.
  const stimulusUnit =
    stimulus.kind === 'shape'
      ? shapeSetUnit(stimulus.shapes, pictureBox.width, pictureBox.height)
      : null;
  const [unitCap, setUnitCap] = useState<{ px: number; w: number; h: number } | null>(null);
  const cap =
    unitCap && unitCap.w === room.w && unitCap.h === room.h ? unitCap.px : Number.POSITIVE_INFINITY;
  useLayoutEffect(() => {
    if (stimulusUnit !== null && stimulusUnit < cap - 0.01) {
      setUnitCap({ px: stimulusUnit, w: room.w, h: room.h });
    }
  }, [stimulusUnit, cap, room.w, room.h]);
  const shapeUnits = [
    ...(stimulusUnit !== null ? [Math.min(stimulusUnit, cap)] : []),
    ...config.options.flatMap((o) =>
      o.stimulus?.kind === 'shape'
        ? [shapeSetUnit(o.stimulus.shapes, choiceWidth, CHOICE_BOX.height)]
        : [],
    ),
  ];
  const shapeUnitPx = shapeUnits.length > 0 ? Math.min(...shapeUnits) : undefined;
  // Every shape on the screen (question and choices) is dressed the same, by the smallest of them.
  const shapeFelt =
    shapeUnitPx === undefined
      ? undefined
      : shapeSetFelt(
          [
            ...(stimulus.kind === 'shape' ? stimulus.shapes : []),
            ...config.options.flatMap((o) =>
              o.stimulus?.kind === 'shape' ? o.stimulus.shapes : [],
            ),
          ],
          shapeUnitPx,
        );
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
      data-layout={plan.side ? 'side' : 'stack'}
      style={handRootStyle}
    >
      {stimulus.kind !== 'none' ? (
        <div className="ni-npick__look">
          <Scaled maxWidth={Math.max(1, box.w)} maxHeight={Math.max(1, box.h)}>
            <StimulusView
              spec={stimulus}
              maxWidth={pictureBox.width}
              maxHeight={pictureBox.height}
              shapeUnitPx={shapeUnitPx}
              shapeFelt={shapeFelt}
            />
          </Scaled>
          {plan.check === 'top' ? check : null}
        </div>
      ) : null}
      <div className="ni-npick__answer" data-check={plan.check}>
        <div
          ref={gridRef}
          className="ni-npick__grid"
          style={{ '--cols': plan.cols, '--card-w': cardWidth, gap: plan.gap } as CSSProperties}
        >
          <fieldset
            className="ni-npick__options"
            aria-label={t('ui.widget.choices')}
            disabled={!interactive}
          >
            {config.options.map((o, i) => {
              const variant = o.stimulus ? 'picture' : isNumeral(o.label) ? 'numeral' : 'word';
              const name =
                o.label ?? (o.speak ? t(o.speak, o.vars) : t('ui.widget.choice', { n: i + 1 }));
              return (
                <span
                  key={o.id}
                  className="ni-npick__slot"
                  style={inLastRow(i) && lastShift > 0 ? { left: lastShift } : undefined}
                >
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
                        maxWidth={choiceWidth}
                        maxHeight={CHOICE_BOX.height}
                        minCell={22}
                        shapeUnitPx={shapeUnitPx}
                        shapeFelt={shapeFelt}
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
          {plan.check === 'cell' ? check : null}
        </div>
        {plan.check === 'beside' || plan.check === 'below' ? check : null}
      </div>
      {inviteHand}
    </div>
  );
}

export default NumeralPickWidget;
