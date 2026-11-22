import {
  asksCategory,
  type BarGraphReadState,
  type FormatModel,
  formatModel,
  GRAPH_ANSWER_MAX,
  symbolParts,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type ReactNode, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  ChartView,
  CheckButton,
  NumberPadKeys,
  type PadKey,
  PickCard,
  padValue,
  type SlotGeometry,
  Stepper,
  useAlive,
  useDemoPause,
  useInviteHand,
  useMeasuredBox,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './bar-graph-read.css';

/**
 * `bar-graph-read` (03 §5.5): a finished chart (picture graph, bar graph, line plot, tally chart or
 * table) and a question. Counting questions (how many, in all, how many more, …) answer the typed
 * number: a 3 × 4 pad from G1, a one-more / one-less counter in K (06 §1: a K pad cannot fit the
 * 960 × 600 widget area). "Most" and "fewest" questions answer a category: its label on the chart
 * is the choice (tap it: it speaks its name and is picked, ink ring and check badge; tap the
 * picked one again and it is put back, traced as an undo). Tapping any category label speaks its
 * name (06 §5). The response is built by the engine model. The pad and the counter enter whole
 * numbers 0 to GRAPH_ANSWER_MAX, which holds every answer the model accepts.
 *
 * Demo ops: `point-bar {id}`, `read-axis {id}` (a dashed line from the bar's top to the axis),
 * `count-pictures {id}` (the marks ringed one by one, counted aloud), plus `answer {value | id}`.
 */

const OPS = ['point-bar', 'read-axis', 'count-pictures', 'answer'] as const;
const KEY_MS = 340;

type Config = ConfigFor<'bar-graph-read'>;

function useModel(): FormatModel<'bar-graph-read', BarGraphReadState> {
  const model = formatModel('bar-graph-read');
  if (!model) throw new Error('bar-graph-read has no engine model');
  // The registry stores models type-erased; this one's state is BarGraphReadState.
  return model as unknown as FormatModel<'bar-graph-read', BarGraphReadState>;
}

/** The category an op points at (`id`), if it is one of the chart's. */
const idOf = (action: WidgetAction | null): string | null =>
  typeof action?.args?.id === 'string' ? action.args.id : null;

export function BarGraphReadWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const model = useModel();
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  // The chart takes the room the answer leaves; the chart and the answer then sit together,
  // centred in the widget area (equal margins either side).
  const [layoutRef, layout] = useMeasuredBox<HTMLDivElement>();
  const [answerRef, answerSize] = useMeasuredBox<HTMLDivElement>();
  const [state, setState] = useState<BarGraphReadState>(() => model.initialState(config));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [text, setText] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const [readLine, setReadLine] = useState<string | null>(null);
  const [counted, setCounted] = useState<{ id: string; n: number } | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const interactive = !disabled && !demoBusy;
  const choice = asksCategory(config.question.type);
  const usePad = ageMode !== 'k';
  const chart = config.chart;
  const target = ageMode === 'k' ? 80 : 64;
  const maxDigits = 3;

  const apply = (action: WidgetAction) => {
    const next = model.apply(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    return next;
  };

  const value = usePad ? padValue(text) : count;
  const ready = choice ? state.choice !== null : value !== null;

  const speakSlot = (slot: SlotGeometry) => {
    if (slot.label) say(slot.label);
    else if (slot.at !== undefined) sayNumber(slot.at);
  };

  const tapCategory = (slot: SlotGeometry) => {
    if (!interactive) return;
    setInvite(null);
    // The picked category, tapped again, is put back (undone where it sits).
    if (choice && stateRef.current.choice === slot.id) {
      trace('undo', `cat-${slot.id}`);
      if (speakOnTap) speakSlot(slot);
      apply({ op: 'answer', args: {} });
      return;
    }
    trace('tap', `cat-${slot.id}`);
    if (speakOnTap) speakSlot(slot);
    if (choice) apply({ op: 'answer', args: { id: slot.id } });
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    setText((x) => applyPadKey(x, key, maxDigits));
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || !ready) return false;
    const s = choice ? stateRef.current : apply({ op: 'answer', args: { value } });
    const response = model.toResponse(s);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  /** How many marks a slot shows, and the running count after each (pictures count by the scale). */
  const marksOf = (id: string): number[] => {
    const c = chart.categories.find((x) => x.id === id);
    const v = c?.value ?? 0;
    if (chart.kind === 'picture') {
      const { whole, part } = symbolParts(v, chart.scale);
      return Array.from({ length: whole + (part > 0 ? 1 : 0) }, (_, k) =>
        Math.min(v, (k + 1) * chart.scale),
      );
    }
    if (chart.kind === 'table') return [v];
    return Array.from({ length: Math.floor(v) }, (_, k) => k + 1);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        const id = idOf(action);
        const isCat = id !== null && chart.categories.some((c) => c.id === id);
        switch (action.op) {
          case 'point-bar': {
            if (!isCat) return;
            apply(action);
            setPointed(id);
            await pause(1200);
            break;
          }
          case 'read-axis': {
            if (!isCat) return;
            apply(action);
            setPointed(id);
            setReadLine(id);
            await pause(1600);
            break;
          }
          case 'count-pictures': {
            if (!isCat) return;
            apply(action);
            setPointed(id);
            const steps = marksOf(id);
            if (reduced) {
              setCounted({ id, n: steps.length });
              if (steps.length > 0) sayNumber(steps.at(-1) as number);
            } else {
              for (const [k, n] of steps.entries()) {
                setCounted({ id, n: k + 1 });
                sayNumber(n);
                await pause(520);
                if (!alive.current) return;
              }
              await pause(400);
            }
            break;
          }
          case 'answer': {
            if (choice) {
              if (!isCat) return;
              setPointed(id);
              apply(action);
              await pause(700);
              break;
            }
            const v = action.args?.value;
            if (typeof v !== 'number' || !Number.isFinite(v)) return;
            apply(action);
            if (usePad) {
              let typed = '';
              setText('');
              for (const ch of String(v).split('') as PadKey[]) {
                setPressedKey(ch);
                await pause(KEY_MS);
                if (!alive.current) return;
                typed += ch;
                setText(typed);
              }
              setPressedKey(null);
            } else {
              setCount(v);
            }
            await pause(KEY_MS);
            break;
          }
        }
        if (!alive.current || reduced) return;
        setPointed(null);
        setReadLine(null);
        setCounted(null);
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => {
      setPointed(null);
      setReadLine(null);
      setCounted(null);
      setInvite(action);
    },
  });

  // ---------- render ----------

  const invitedCat = invite && (invite.op !== 'answer' || choice) ? idOf(invite) : null;
  const invitedAnswer = invite?.op === 'answer' && !choice;
  // Pip's up-pointing hand hangs below the invited control (kit `useInviteHand`).
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      invitedCat !== null
        ? root.querySelector<HTMLElement>(`.ni-bgr__catslot [data-id="${CSS.escape(invitedCat)}"]`)
        : invitedAnswer
          ? root.querySelector<HTMLElement>('.ni-bgr__display, .ni-stepper__key[data-key="more"]')
          : null,
    invitedCat !== null ? `cat-${invitedCat}` : invitedAnswer ? 'answer' : '',
  );

  const renderLabel = (slot: SlotGeometry, content: ReactNode) => {
    const name = slot.label ? t(slot.label) : String(slot.at ?? slot.id);
    const invited = invitedCat === slot.id;
    return (
      <span className="ni-bgr__catslot">
        {choice ? (
          <PickCard
            label={name}
            selected={state.choice === slot.id}
            highlighted={invited}
            variant="picture"
            data-id={slot.id}
            disabled={!interactive}
            onPress={() => tapCategory(slot)}
            className="ni-bgr__cat"
          >
            {content}
          </PickCard>
        ) : (
          <button
            type="button"
            className={['ni-bgr__name', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
            aria-label={name}
            data-id={slot.id}
            disabled={!interactive}
            onClick={() => tapCategory(slot)}
          >
            {content}
          </button>
        )}
      </span>
    );
  };

  const boardPad = 6;
  const GAP = 16;
  const stacked = (layout?.width ?? 1000) <= 760;
  const area =
    layout && answerSize
      ? stacked
        ? { width: layout.width, height: layout.height - answerSize.height - GAP }
        : { width: layout.width - answerSize.width - GAP, height: layout.height }
      : null;
  const answerBox = (
    <span className="ni-bgr__answerbox">
      <output
        className={['ni-number', 'ni-bgr__display', invitedAnswer ? 'ni-invite' : '']
          .filter(Boolean)
          .join(' ')}
        data-size="lg"
        data-empty={text === '' ? 'true' : undefined}
        aria-label={`${t('ui.widget.answer')}: ${text}`.trim()}
      >
        {text === '' ? <span className="ni-number__slot" /> : <span>{text}</span>}
      </output>
    </span>
  );

  return (
    <div
      ref={rootRef}
      className="ni-bgr"
      style={handRootStyle}
      data-tier={tier}
      data-answer={choice ? 'choice' : usePad ? 'pad' : 'stepper'}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-bgr__layout" ref={layoutRef}>
        <div className="ni-bgr__chart">
          {area ? (
            <div className="ni-bgr__board" style={{ padding: boardPad }}>
              <ChartView
                chart={chart}
                maxWidth={Math.max(200, area.width - 2 * boardPad - 6)}
                maxHeight={Math.max(160, area.height - 2 * boardPad - 6)}
                // A choice card needs room for its 6 px ledge; a name button is target-sized.
                target={choice ? target + 8 : target}
                label={t('ui.widget.chart.graph')}
                renderLabel={renderLabel}
                pointed={pointed}
                readLine={readLine}
                counted={counted}
              />
            </div>
          ) : null}
        </div>
        <div className="ni-bgr__answer" ref={answerRef}>
          {choice ? null : usePad ? (
            <>
              <div className="ni-bgr__entry">
                {answerBox}
                {/* Icon-only where the area is narrow, so the chart keeps its columns' room. */}
                <CheckButton
                  onPress={submit}
                  disabled={!interactive || !ready}
                  compact={(layout?.width ?? 1200) < 1000}
                />
              </div>
              <NumberPadKeys
                onKey={onKey}
                onEnter={submit}
                disabled={!interactive}
                highlighted={pressedKey}
              />
            </>
          ) : (
            <div className="ni-bgr__entry">
              <span className="ni-bgr__answerbox">
                <Stepper
                  value={count}
                  max={GRAPH_ANSWER_MAX}
                  highlighted={invitedAnswer ? 'more' : null}
                  disabled={!interactive}
                  onPress={(k) => trace('tap', `step-${k}`)}
                  onChange={(v) => {
                    setInvite(null);
                    setCount(v);
                  }}
                />
              </span>
              <CheckButton onPress={submit} disabled={!interactive || !ready} />
            </div>
          )}
          {choice ? <CheckButton onPress={submit} disabled={!interactive || !ready} /> : null}
        </div>
      </div>
      {inviteHand}
    </div>
  );
}

export default BarGraphReadWidget;
