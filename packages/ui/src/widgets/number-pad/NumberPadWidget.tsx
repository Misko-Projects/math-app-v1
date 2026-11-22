import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  ExpressionView,
  NumberPadKeys,
  type PadKey,
  padValue,
  roomBox,
  Scaled,
  StimulusView,
  useActionSize,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
  useWidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { planPad } from './layout';
import './number-pad.css';

/**
 * `number-pad` (03 §5.5): a picture or an expression with blanks, and the 3 × 4 number pad
 * (06 §4). One blank answers `number`, several answer `numbers` in reading order. The entered
 * number shows large in its blank; tapping a blank makes it the one being typed into. "Check"
 * stays off until every blank has a number (never auto-submits, 06 §4).
 *
 * Laid out in the measured room (`planPad`, layout.ts): the keys and Check take what the room's
 * height allows, the question is drawn to fit the rest, its picture first, so nothing scrolls.
 *
 * Demo ops (03 §5.5): `type {blank, value}`, `highlight {token}`, `show-stimulus`, plus `answer`.
 */

const OPS = ['type', 'highlight', 'show-stimulus', 'answer'] as const;
const KEY_MS = 340;

type Config = ConfigFor<'number-pad'>;

/** Between the picture and the text under it (`.ni-npw__ask` gap). */
const ASK_PART_GAP = 16;
/** The least a picture is given before the whole question is scaled instead. */
const MIN_PICTURE_H = 96;

/** The element's own height (layout px, before any transform), kept up to date. */
function useOwnHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}

const UNIT_PREFIX: Partial<Record<NonNullable<Config['unit']>, string>> = { dollars: '$' };
const UNIT_SUFFIX: Partial<Record<NonNullable<Config['unit']>, string>> = {
  cents: '¢',
  cm: 'cm',
  in: 'in',
  ft: 'ft',
  m: 'm',
  g: 'g',
  kg: 'kg',
  L: 'L',
  min: 'min',
  'sq-units': 'sq units',
};

export function NumberPadWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const blanks = config.blanks;
  const [texts, setTexts] = useState<string[]>(() => blanks.map(() => ''));
  const [active, setActive] = useState(0);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const textsRef = useRef(texts);
  const rootRef = useRef<HTMLDivElement | null>(null);
  textsRef.current = texts;
  const { ageMode } = useUiPreferences();
  const actRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const unzoomed = useRef(1);
  const button = useActionSize(actRef, unzoomed, ageMode);
  const plan = planPad(roomBox(useWidgetRoom(rootRef)), button, ageMode);
  const textH = useOwnHeight(textRef);

  const interactive = !disabled && !demoBusy;
  const values = texts.map(padValue);
  const complete = values.every((v) => v !== null);

  const typeKey = (key: PadKey) => {
    const i = Math.min(active, blanks.length - 1);
    const blank = blanks[i];
    if (!blank) return;
    const nextText = applyPadKey(texts[i] ?? '', key, blank.maxDigits);
    const next = [...texts];
    next[i] = nextText;
    setTexts(next);
    setInvite(null);
    // A full blank moves on to the next empty one (multi-blank sequences like 47 _ _ 50).
    const digits = nextText.replace('.', '').length;
    if (key !== 'back' && digits >= blank.maxDigits) {
      const after = next.findIndex((txt, j) => j > i && txt === '');
      if (after >= 0) setActive(after);
    }
  };

  const onKey = (key: PadKey) => {
    if (!interactive) return;
    if (key === '.' && !blanks[active]?.allowDecimal) return;
    trace('tap', `key-${key}`);
    typeKey(key);
  };

  // One debounce for every way to submit (Check button, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive || !complete) return false;
    const model = formatModel('number-pad');
    if (!model) return false;
    const state = model.apply(model.initialState(config), {
      op: 'answer',
      args: { values: values as number[] },
    });
    const response = model.toResponse(state);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const blankIndex = (action: WidgetAction) => {
    const id = action.args?.blank;
    const i = blanks.findIndex((b) => b.id === id);
    return Math.max(i, 0);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'type' || action.op === 'answer') {
          const list: [number, number][] = [];
          if (action.op === 'type') {
            const v = Number(action.args?.value);
            if (Number.isFinite(v)) list.push([blankIndex(action), v]);
          } else if (Array.isArray(action.args?.values)) {
            (action.args.values as unknown[]).forEach((v, i) => {
              if (typeof v === 'number') list.push([i, v]);
            });
          } else if (typeof action.args?.value === 'number') {
            list.push([0, action.args.value]);
          }
          if (action.op === 'answer') {
            // `answer` replaces every entry, as the engine model does: blanks it doesn't name clear.
            const cleared = blanks.map(() => '');
            textsRef.current = cleared;
            setTexts(cleared);
          }
          for (const [i, v] of list) {
            setActive(i);
            const chars = String(v).split('') as PadKey[];
            let text = '';
            for (const ch of chars) {
              setPressedKey(ch);
              await pause(KEY_MS);
              if (!alive.current) return;
              text += ch;
              const next = [...textsRef.current];
              next[i] = text;
              textsRef.current = next;
              setTexts(next);
            }
            setPressedKey(null);
            await pause(KEY_MS);
            if (!alive.current) return;
          }
        } else if (action.op === 'highlight') {
          setHighlight(String(action.args?.token ?? ''));
          await pause(1200);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'show-stimulus') {
          setHighlight('stimulus');
          await pause(1200);
          if (alive.current) setHighlight(null);
        }
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => {
      setInvite(action);
      if (action?.op === 'type') setActive(blankIndex(action));
    },
  });

  // ---------- render ----------

  const invitedBlank = invite?.op === 'type' ? blankIndex(invite) : invite ? active : -1;
  // Pip's up-pointing hand hangs below the invited blank (kit `useInviteHand`), its fingertip
  // inside the blank's bottom edge and clear of its digits.
  const invitedId = invitedBlank >= 0 ? (blanks[invitedBlank]?.id ?? null) : null;
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    // Matched by value, not a selector: a config ID may hold any character (a quote included).
    (root) =>
      invitedId === null
        ? null
        : ([...root.querySelectorAll<HTMLElement>('[data-blank]')].find(
            (el) => el.dataset.blank === invitedId,
          ) ?? null),
    // Prefixed: an empty ID is valid, and an empty key would hide the hand.
    invitedId === null ? '' : `blank:${invitedId}`,
  );

  const renderBlank = (id: string) => {
    const i = blanks.findIndex((b) => b.id === id);
    if (i < 0) return <span className="ni-expr__blank" />;
    const text = texts[i] ?? '';
    const isActive = i === active && !disabled;
    const name = blanks.length === 1 ? t('ui.widget.answer') : t('ui.widget.blank', { n: i + 1 });
    const prefix = config.unit ? UNIT_PREFIX[config.unit] : undefined;
    const suffix = config.unit ? UNIT_SUFFIX[config.unit] : undefined;
    return (
      <span className="ni-npw__slot" key={id}>
        {prefix ? <span className="ni-npw__unit">{prefix}</span> : null}
        <button
          type="button"
          className={[
            'ni-number',
            'ni-npw__blank',
            invitedBlank === i || highlight === id ? 'ni-invite' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-size="lg"
          // Same width empty or full, sized for the blank's digits (no jump as the child types).
          style={{ minWidth: `${Math.max(1, blanks[i]?.maxDigits ?? 1) * 0.62 + 0.8}em` }}
          data-state={isActive ? 'active' : 'idle'}
          data-empty={text === '' ? 'true' : undefined}
          data-blank={id}
          aria-label={`${name}: ${text}`.trim()}
          aria-current={isActive ? 'true' : undefined}
          disabled={!interactive}
          onClick={() => {
            trace('tap', `blank-${id}`);
            setActive(i);
          }}
        >
          {text === '' ? <span className="ni-number__slot" /> : <span>{text}</span>}
          {isActive ? <span className="ni-number__caret" /> : null}
        </button>
        {suffix ? <span className="ni-npw__unit">{suffix}</span> : null}
      </span>
    );
  };

  const stimulus = config.stimulus;
  const expressionInStimulus = stimulus.kind === 'expression';
  const expression = config.expression;
  const blankIdsInText = new Set([
    ...(expression?.tokens ?? []).flatMap((tok) => (tok.t === 'blank' ? [tok.id] : [])),
    ...(expressionInStimulus
      ? stimulus.expr.tokens.flatMap((tok) => (tok.t === 'blank' ? [tok.id] : []))
      : []),
  ]);
  const looseBlanks = blanks.filter((b) => !blankIdsInText.has(b.id));
  const hasText = Boolean(expression) || looseBlanks.length > 0;
  // The picture takes the question's height less the text under it; the text keeps its size.
  const pictureH = Math.max(
    MIN_PICTURE_H,
    Math.min(expression ? 220 : 300, plan.ask.h - (hasText ? textH + ASK_PART_GAP : 0)),
  );

  return (
    <div
      ref={rootRef}
      className="ni-npw"
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      data-layout={plan.stacked ? 'stack' : 'side'}
      data-check={plan.check}
      style={handRootStyle}
    >
      <div className="ni-npw__ask" style={{ width: plan.ask.w, maxHeight: plan.ask.h }}>
        <Scaled maxWidth={plan.ask.w} maxHeight={plan.ask.h}>
          <div className="ni-npw__parts">
            {stimulus.kind !== 'none' ? (
              <div
                className={
                  highlight === 'stimulus' ? 'ni-invite ni-npw__stimulus' : 'ni-npw__stimulus'
                }
              >
                <StimulusView
                  spec={stimulus}
                  maxWidth={Math.min(640, plan.ask.w)}
                  maxHeight={pictureH}
                  renderBlank={expressionInStimulus ? renderBlank : undefined}
                />
              </div>
            ) : null}
            {hasText ? (
              <div ref={textRef} className="ni-npw__text">
                {expression ? (
                  <div className="ni-npw__expr">
                    <ExpressionView expr={expression} renderBlank={renderBlank} />
                  </div>
                ) : null}
                {looseBlanks.length > 0 ? (
                  <div className="ni-npw__answers">{looseBlanks.map((b) => renderBlank(b.id))}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Scaled>
      </div>
      <div ref={actRef} className="ni-npw__controls">
        <NumberPadKeys
          onKey={onKey}
          onEnter={submit}
          allowDecimal={blanks.some((b) => b.allowDecimal)}
          disabled={!interactive}
          highlighted={pressedKey}
          shape={plan.shape}
          compact={plan.compact}
        />
        <CheckButton
          onPress={submit}
          disabled={!interactive || !complete}
          compact={plan.check === 'beside'}
        />
      </div>
      {inviteHand}
    </div>
  );
}

export default NumberPadWidget;
