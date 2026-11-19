import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  ExpressionView,
  NumberPadKeys,
  type PadKey,
  padValue,
  StimulusView,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './number-pad.css';

/**
 * `number-pad` (03 §5.5): a picture or an expression with blanks, and the 3 × 4 number pad
 * (06 §4). One blank answers `number`, several answer `numbers` in reading order. The entered
 * number shows large in its blank; tapping a blank makes it the one being typed into. "Check"
 * stays off until every blank has a number (never auto-submits, 06 §4).
 *
 * Demo ops (03 §5.5): `type {blank, value}`, `highlight {token}`, `show-stimulus`, plus `answer`.
 */

const OPS = ['type', 'highlight', 'show-stimulus', 'answer'] as const;
const KEY_MS = 340;

type Config = ConfigFor<'number-pad'>;

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
    (root) =>
      invitedId === null ? null : root.querySelector<HTMLElement>(`[data-blank="${invitedId}"]`),
    invitedId ?? '',
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

  return (
    <div
      ref={rootRef}
      className="ni-npw"
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      style={handRootStyle}
    >
      <div className="ni-npw__ask">
        {stimulus.kind !== 'none' ? (
          <div
            className={highlight === 'stimulus' ? 'ni-invite ni-npw__stimulus' : 'ni-npw__stimulus'}
          >
            <StimulusView
              spec={stimulus}
              maxWidth={640}
              maxHeight={expression ? 220 : 300}
              renderBlank={expressionInStimulus ? renderBlank : undefined}
            />
          </div>
        ) : null}
        {expression ? (
          <div className="ni-npw__expr">
            <ExpressionView expr={expression} renderBlank={renderBlank} />
          </div>
        ) : null}
        {looseBlanks.length > 0 ? (
          <div className="ni-npw__answers">{looseBlanks.map((b) => renderBlank(b.id))}</div>
        ) : null}
      </div>
      <div className="ni-npw__controls">
        <NumberPadKeys
          onKey={onKey}
          onEnter={submit}
          allowDecimal={blanks.some((b) => b.allowDecimal)}
          disabled={!interactive}
          highlighted={pressedKey}
        />
        <CheckButton onPress={submit} disabled={!interactive || !complete} />
      </div>
      {inviteHand}
    </div>
  );
}

export default NumberPadWidget;
