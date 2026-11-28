import { formatModel } from '@number-island/engine';
import type { ExpressionToken, WidgetAction } from '@number-island/shared';
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
import { ASK_GAP, MIN_ASK, planBreak, planPad, planPadRow } from './layout';
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
/** How many times the text's numerals step down (number-pad.css `data-text`): 72 → 60 → 48 → 40 px. */
const TEXT_STEPS = 3;
/** The least a picture is given before the whole question is scaled instead. */
const MIN_PICTURE_H = 96;

/** The legibility bars (05 §11, 06 §4): numerals in the sentence, the answer box, a counted thing. */
const BAR_NUMERAL = 32;
const BAR_BOX = 64;
const BAR_COUNTED = 22;
/** Text steps a legible layout may take: one more than TEXT_STEPS, to 32 px (number-pad.css). */
const TEXT_STEPS_LEGIBLE = 4;
/** The least a picture beside the sentence is given (one-row pad, `beside`). */
const BESIDE_PICTURE_MIN = 160;

/**
 * How the question is laid out. `fit`: the question scaled as one block to the room, as it always
 * was. Where that draws the sentence, the answer box or a counted thing under the bars, the widget
 * steps on: `keep` (only the picture scales; the sentence steps to 32 px, then breaks before an
 * "="), `row` (the same with the keys in one row under the question, Check beside it), `beside`
 * (the one-row pad with the picture beside the sentence).
 */
type AskMode = 'fit' | 'keep' | 'row' | 'beside';

/** The element's own size (layout px, before any transform), kept up to date. */
function useOwnSize(
  ref: React.RefObject<HTMLElement | null>,
  /** A new element to observe: the layout drew it again. */
  key: string,
): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` names a new element to observe
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((was) =>
        was.w === el.offsetWidth && was.h === el.offsetHeight
          ? was
          : { w: el.offsetWidth, h: el.offsetHeight },
      );
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, key]);
  return size;
}

/** Under the bars in the question as drawn: a hard miss (the sentence or a box), else a soft one. */
function legibilityMiss(
  ask: HTMLElement,
  text: HTMLElement | null,
  parts: HTMLElement | null,
  box: { w: number; h: number } | null,
): 'hard' | 'soft' | null {
  if (text && text.offsetWidth > 0) {
    const scale = text.getBoundingClientRect().width / text.offsetWidth;
    for (const el of text.querySelectorAll<HTMLElement>(
      '.ni-expr__num, .ni-expr__frac > span, .ni-npw__blank, .ni-npw__unit',
    )) {
      const px = Number.parseFloat(getComputedStyle(el).fontSize) * scale;
      if (px < BAR_NUMERAL - 0.5) return 'hard';
    }
  }
  for (const b of ask.querySelectorAll<HTMLElement>('.ni-npw__blank')) {
    const r = b.getBoundingClientRect();
    if (r.height > 0 && Math.min(r.width, r.height) < BAR_BOX - 0.5) return 'hard';
  }
  if (box && parts) {
    const r = parts.getBoundingClientRect();
    if (r.width > box.w + 1 || r.height > box.h + 1) return 'hard';
  }
  return smallestSprite(ask) < BAR_COUNTED - 0.5 ? 'soft' : null;
}

/** The smallest counted thing drawn in the question (px), Infinity without one. */
function smallestSprite(ask: HTMLElement): number {
  let px = Number.POSITIVE_INFINITY;
  for (const s of ask.querySelectorAll<SVGElement>('.ni-sprite')) {
    const r = s.getBoundingClientRect();
    if (r.width > 0) px = Math.min(px, r.width, r.height);
  }
  return px;
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
  const room = roomBox(useWidgetRoom(rootRef));
  const plan = planPad(room, button, ageMode);
  const askRef = useRef<HTMLDivElement | null>(null);
  const partsRef = useRef<HTMLDivElement | null>(null);
  const allowDecimal = blanks.some((b) => b.allowDecimal);
  const rowPlan = planPadRow(room, button, ageMode, allowDecimal);
  // The question's layout (AskMode), chosen again for every room: `fit` until it is measured under
  // the bars, then the next mode; `best`: of the modes that missed only on a counted thing, the one
  // that draws it largest (kept when every mode misses).
  const [askTier, setAskTier] = useState<{
    mode: AskMode;
    best: { mode: AskMode; px: number } | null;
    final: boolean;
    w: number;
    h: number;
  }>({ mode: 'fit', best: null, final: false, w: room.w, h: room.h });
  const sameRoom = askTier.w === room.w && askTier.h === room.h;
  const mode: AskMode = sameRoom ? askTier.mode : 'fit';
  const legible = mode !== 'fit';
  const rowed = (mode === 'row' || mode === 'beside') && rowPlan !== null;
  const beside = mode === 'beside' && rowed;
  const askBox = rowed && rowPlan ? rowPlan.ask : plan.ask;
  const textMaxW = beside ? Math.max(MIN_ASK.w, askBox.w - BESIDE_PICTURE_MIN - ASK_GAP) : askBox.w;
  const maxSteps = legible ? TEXT_STEPS_LEGIBLE : TEXT_STEPS;
  const textSize = useOwnSize(textRef, mode);
  const textH = textSize.h;
  const tierKey = `${room.w}x${room.h}:${mode}`;
  // The text's numerals step down while the text is wider than the question's box (a new room
  // starts from the full size): the blanks keep their target size, only the numerals shrink.
  const [textTier, setTextTier] = useState({ step: 0, key: tierKey });
  const textStep = textTier.key === tierKey ? textTier.step : 0;
  // A sentence still too wide at 32 px: two rows (`planBreak`), or none fits (`at` -1).
  const [breakTier, setBreakTier] = useState<{ at: number; indent: number; key: string } | null>(
    null,
  );
  const brk = breakTier?.key === tierKey ? breakTier : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured after every layout of the text
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || el.offsetWidth <= textMaxW + 0.5) return;
    if (textStep < maxSteps) {
      setTextTier({ step: textStep + 1, key: tierKey });
      return;
    }
    const exprEl = el.querySelector<HTMLElement>('.ni-npw__expr .ni-expr');
    if (!legible || brk || !exprEl) return;
    const tokens = [...exprEl.querySelectorAll<HTMLElement>(':scope > .ni-expr__token')];
    const chrome = el.offsetWidth - exprEl.offsetWidth;
    const b = planBreak(
      tokens.map((t) => t.offsetWidth),
      tokens.map((t) => t.dataset.eq === 'true'),
      Number.parseFloat(getComputedStyle(exprEl).columnGap) || 0,
      textMaxW - chrome,
    );
    setBreakTier(
      b ? { at: b.at, indent: b.indent, key: tierKey } : { at: -1, indent: 0, key: tierKey },
    );
  }, [textStep, maxSteps, textMaxW, tierKey, legible, brk, textSize.w, textH]);

  // Whether the layout drawn now holds the bars; if not, the next mode (see AskMode).
  const judge = useRef<() => void>(() => {});
  judge.current = () => {
    const ask = askRef.current;
    if (!ask || (sameRoom && askTier.final)) return;
    if (ask.getBoundingClientRect().width < 1) return;
    // Not settled yet: a picture not measured, or the text still stepping or breaking.
    if ([...ask.querySelectorAll<HTMLElement>('.ni-scaled')].some((el) => el.style.width === '')) {
      return;
    }
    const text = textRef.current;
    const overW = text ? text.offsetWidth > textMaxW + 0.5 : false;
    if (overW && (textStep < maxSteps || (legible && expression && !brk))) return;
    const pictureBox = legible ? askBox : null;
    const miss =
      legible && overW ? 'hard' : legibilityMiss(ask, text, partsRef.current, pictureBox);
    if (miss === null) {
      if (legible) setAskTier({ ...askTier, mode, final: true, w: room.w, h: room.h });
      return;
    }
    const order: AskMode[] = rowPlan ? ['fit', 'keep', 'row', 'beside'] : ['fit', 'keep'];
    const best = sameRoom ? askTier.best : null;
    // A miss only on a counted thing: the mode that draws it largest is kept for the end.
    const px = miss === 'soft' ? smallestSprite(ask) : 0;
    const nextBest = miss === 'soft' && (!best || px > best.px) ? { mode, px } : best;
    const next = order[order.indexOf(mode) + 1];
    setAskTier(
      next
        ? { mode: next, best: nextBest, final: false, w: room.w, h: room.h }
        : { mode: nextBest?.mode ?? 'fit', best: nextBest, final: true, w: room.w, h: room.h },
    );
  };
  // Judged once the layout has been still for two frames: a picture measures its own box after
  // its first frame, and a first frame drawn small is not the layout a child sees. `data-judging`
  // says a judgement is pending (the fit check waits for it before it measures).
  const judgeFrame = useRef(0);
  const scheduleJudge = useRef(() => {
    cancelAnimationFrame(judgeFrame.current);
    if (rootRef.current) rootRef.current.dataset.judging = 'true';
    judgeFrame.current = requestAnimationFrame(() => {
      judgeFrame.current = requestAnimationFrame(() => {
        if (rootRef.current) delete rootRef.current.dataset.judging;
        judge.current();
      });
    });
  });
  useLayoutEffect(() => scheduleJudge.current());
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new mode draws new parts to observe
  useLayoutEffect(() => {
    const ask = askRef.current;
    if (!ask || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => scheduleJudge.current());
    ro.observe(ask);
    for (const el of ask.querySelectorAll('.ni-npw__parts, .ni-npw__stimulus, .ni-npw__text')) {
      ro.observe(el);
    }
    return () => {
      ro.disconnect();
      cancelAnimationFrame(judgeFrame.current);
    };
  }, [mode]);

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
  // The guide's up-pointing hand hangs below the invited blank (kit `useInviteHand`), its fingertip
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

  const fracBlankOther = new Map([
    ...fracBlankContext(config.expression?.tokens ?? []),
    ...fracBlankContext(exprTokensOf(config.stimulus)),
  ]);
  const renderBlank = (id: string) => {
    const i = blanks.findIndex((b) => b.id === id);
    if (i < 0) return <span className="ni-expr__blank" />;
    const text = texts[i] ?? '';
    const isActive = i === active && !disabled;
    // A box in a stacked fraction is named by its place and the number beside it, so a screen
    // reader hears "missing top number, over 8" (K02 slice 5c); never the answer.
    const inFrac = fracBlankOther.get(id);
    const name = inFrac
      ? t(inFrac.side === 'a' ? 'ui.widget.blank-frac-top' : 'ui.widget.blank-frac-bottom', {
          n: inFrac.other,
        })
      : blanks.length === 1
        ? t('ui.widget.answer')
        : t('ui.widget.blank', { n: i + 1 });
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
    ...tokenBlankIds(expression?.tokens ?? []),
    ...(expressionInStimulus ? tokenBlankIds(stimulus.expr.tokens) : []),
  ]);
  const looseBlanks = blanks.filter((b) => !blankIdsInText.has(b.id));
  const hasText = Boolean(expression) || looseBlanks.length > 0;
  // The picture takes the question's height less the text under it; the text keeps its size.
  const pictureH = Math.max(
    MIN_PICTURE_H,
    Math.min(expression ? 220 : 300, plan.ask.h - (hasText ? textH + ASK_PART_GAP : 0)),
  );
  // A legible layout: the picture alone is scaled, into what the sentence leaves of the box.
  const pictureBox = beside
    ? { w: askBox.w - (hasText ? textSize.w + ASK_GAP : 0), h: askBox.h }
    : { w: askBox.w, h: askBox.h - (hasText ? textH + ASK_PART_GAP : 0) };
  const picture =
    stimulus.kind === 'none' ? null : !legible ? (
      <StimulusView
        spec={stimulus}
        maxWidth={Math.min(640, plan.ask.w)}
        maxHeight={pictureH}
        renderBlank={expressionInStimulus ? renderBlank : undefined}
      />
    ) : expressionInStimulus ? (
      // A sentence given as the stimulus is the sentence: never scaled.
      <StimulusView
        spec={stimulus}
        maxWidth={askBox.w}
        maxHeight={askBox.h}
        renderBlank={renderBlank}
      />
    ) : (
      <Scaled maxWidth={Math.max(1, pictureBox.w)} maxHeight={Math.max(1, pictureBox.h)}>
        <StimulusView
          spec={stimulus}
          maxWidth={Math.max(MIN_PICTURE_H, pictureBox.w)}
          maxHeight={Math.max(MIN_PICTURE_H, pictureBox.h)}
        />
      </Scaled>
    );
  const parts = (
    <div ref={partsRef} className="ni-npw__parts" data-beside={beside ? 'true' : undefined}>
      {picture ? (
        <div
          className={highlight === 'stimulus' ? 'ni-invite ni-npw__stimulus' : 'ni-npw__stimulus'}
        >
          {picture}
        </div>
      ) : null}
      {hasText ? (
        <div ref={textRef} className="ni-npw__text" data-text={textStep || undefined}>
          {expression ? (
            <div className="ni-npw__expr">
              <ExpressionView
                expr={expression}
                renderBlank={renderBlank}
                breakAt={brk && brk.at > 0 ? brk : undefined}
              />
            </div>
          ) : null}
          {looseBlanks.length > 0 ? (
            <div className="ni-npw__answers">{looseBlanks.map((b) => renderBlank(b.id))}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="ni-npw"
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      data-layout={plan.stacked && !rowed ? 'stack' : 'side'}
      data-check={rowed ? 'beside' : plan.check}
      data-pad={rowed ? 'row' : undefined}
      data-ask={mode}
      style={handRootStyle}
    >
      <div ref={askRef} className="ni-npw__ask" style={{ maxWidth: askBox.w, maxHeight: askBox.h }}>
        {legible ? (
          parts
        ) : (
          <Scaled maxWidth={plan.ask.w} maxHeight={plan.ask.h}>
            {parts}
          </Scaled>
        )}
      </div>
      <div ref={actRef} className="ni-npw__controls">
        <NumberPadKeys
          onKey={onKey}
          onEnter={submit}
          allowDecimal={allowDecimal}
          disabled={!interactive}
          highlighted={pressedKey}
          shape={rowed ? 'row' : plan.shape}
          compact={rowed || plan.compact}
        />
        <CheckButton
          onPress={submit}
          disabled={!interactive || !complete}
          compact={rowed || plan.check === 'beside'}
        />
      </div>
      {inviteHand}
    </div>
  );
}

const exprTokensOf = (s: ConfigFor<'number-pad'>['stimulus']): readonly ExpressionToken[] =>
  s.kind === 'expression' ? s.expr.tokens : [];

/** Each stacked fraction's box (`frac-<i>-a` / `-b`), its side and the number on the other side. */
function fracBlankContext(
  tokens: readonly ExpressionToken[],
): [string, { side: 'a' | 'b'; other: number }][] {
  return tokens.flatMap((tok, i): [string, { side: 'a' | 'b'; other: number }][] => {
    if (tok.t !== 'frac') return [];
    if (tok.a === 'blank' && typeof tok.b === 'number')
      return [[`frac-${i}-a`, { side: 'a', other: tok.b }]];
    if (tok.b === 'blank' && typeof tok.a === 'number')
      return [[`frac-${i}-b`, { side: 'b', other: tok.a }]];
    return [];
  });
}

/**
 * The blank ids an expression draws in its text: `blank` tokens, and a stacked fraction's blank top
 * or bottom (`frac-<token index>-a` / `-b`, as ExpressionView names them; K02 slice 5c, FRA.05).
 */
function tokenBlankIds(tokens: readonly ExpressionToken[]): string[] {
  return tokens.flatMap((tok, i) => {
    if (tok.t === 'blank') return [tok.id];
    if (tok.t !== 'frac') return [];
    return [
      ...(tok.a === 'blank' ? [`frac-${i}-a`] : []),
      ...(tok.b === 'blank' ? [`frac-${i}-b`] : []),
    ];
  });
}

export default NumberPadWidget;
