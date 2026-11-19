import {
  blankIds,
  type ExpandedFormState,
  type FormatModel,
  formatModel,
} from '@number-island/engine';
import { FORMAT_SUPPORT, type ResponseValue, type WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type TraceRecorder, useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { IconButton } from '../../primitives/IconButton';
import { HandPointerIcon, SpeakerIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  ExpressionView,
  NumberPadKeys,
  type PadKey,
  PickCard,
  padValue,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  balancedWidth,
  cardLayout,
  expressionSize,
  inviteTarget,
  isPlaceValue,
  traceTarget,
  trayValueOf,
} from './layout';
import './expanded-form.css';

/**
 * `expanded-form` (03 §5.5): place-value cards (300, 40, 5) and expanded expressions. The widget
 * renders and changes its state only through the engine model (`formatModel('expanded-form')`),
 * except for text the child is still typing on the pad, which reaches the model as `answer` on
 * "check" (as number-pad does).
 *
 * - `build`: the target numeral on top, a card tray below; the child moves cards onto the build
 *   mat (drag, tap-to-place or keyboard). Placed cards read left to right, joined by "+". A placed
 *   card goes back to the tray the same ways. Answers `numbers` (the placed values).
 * - `fill`: an expression with blanks. With `cards`, a card fills the next empty blank and tapping
 *   a filled blank clears it; otherwise the number pad types into the chosen blank.
 * - `to-standard`: the expanded expression and one big answer blank on the pad.
 * - `words`: word cards to pick (`choice`), or a "hear it" button and the pad (`number`).
 * - `digit-value`: the target numeral with one digit ringed and underlined; the pad (`number`).
 *
 * The target numeral is ONE number with tight tabular digits; tapping it speaks the whole number.
 * Nothing on screen names the answer: no digit ever speaks or shows its place value.
 *
 * Trace targets: `number` (the target numeral), `card-<value>` (a tray card; copies share the
 * id), `placed-<i>`, `build`, `tray`, `blank-<id>` (`blank-answer` for a lone answer slot),
 * `opt-<id>`, `key-<k>` and `hear`.
 *
 * Demo ops (03 §5.5): `place-card {value, remove?}`, `stack-cards`, `highlight-digit {index}`,
 * plus `answer {value | values | id}`.
 */

type Config = ConfigFor<'expanded-form'>;
type Model = FormatModel<'expanded-form', ExpandedFormState>;

const OPS: readonly string[] = [...FORMAT_SUPPORT['expanded-form'].ops, 'answer'];
const FLY_MS = 520;
const KEY_MS = 340;
const PULSE_MS = 1200;
const FLY_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** The lone answer slot of to-standard, words and digit-value when the expression has no blank. */
const ANSWER_SLOT = 'answer';

function requireModel(): Model {
  const model = formatModel('expanded-form') as Model | undefined;
  if (!model) throw new Error('expanded-form: no engine state model registered');
  return model;
}

const digitCount = (n: number) => String(Math.trunc(Math.abs(n))).length;
const numArg = (a: WidgetAction | null, key: string) => {
  const v = a?.args?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
const numsArg = (a: WidgetAction | null, key: string) => {
  const v = a?.args?.[key];
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? (v as number[])
    : undefined;
};

/**
 * One place-value card face: tight tabular digits, right-aligned, so cards stacked with their
 * right edges together line their digits up in columns (300 under 40 under 5 reads 345).
 */
function CardFace({ value, pictorial }: { value: number; pictorial: boolean }) {
  const place = pictorial ? isPlaceValue(value) : null;
  return (
    <span className="ni-efw__face">
      <span className="ni-efw__digits" aria-hidden="true">
        {String(value)
          .split('')
          .map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: digit cells are positional
            <span key={i} className="ni-efw__cell">
              {d}
            </span>
          ))}
      </span>
      {place ? (
        <span className="ni-efw__glyphs" aria-hidden="true" data-place={place.power}>
          {Array.from({ length: place.digit }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical glyphs
            <span key={i} className="ni-efw__glyph" data-place={place.power} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Caps a wrapping row's width so its lines come out even (6 cards as 3 + 3, not 5 + 1). Measures
 * the row's items and the room its zone gives it; re-measures when the zone resizes or `key`
 * (what the row shows) changes.
 */
function useBalancedRow(key: string, enabled: boolean) {
  const ref = useRef<HTMLFieldSetElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` (what the row shows) triggers a re-measure
  useLayoutEffect(() => {
    const row = ref.current;
    const zone = row?.parentElement;
    if (!row || !zone) return;
    const measure = () => {
      if (!enabled) {
        row.style.maxWidth = '';
        return;
      }
      const zoneStyle = getComputedStyle(zone);
      const avail =
        zone.clientWidth -
        (Number.parseFloat(zoneStyle.paddingLeft) || 0) -
        (Number.parseFloat(zoneStyle.paddingRight) || 0);
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      // offsetWidth: the layout width, unaffected by a demo pulse's scale.
      const widths = [...row.children].map((c) => (c as HTMLElement).offsetWidth);
      const w = balancedWidth(widths, gap, avail);
      row.style.maxWidth = w >= avail ? '' : `${Math.ceil(w) + 1}px`;
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(zone);
    return () => ro.disconnect();
  }, [key, enabled]);
  return ref;
}

function Hand() {
  return (
    <span className="ni-hand ni-efw__hand">
      <HandPointerIcon />
    </span>
  );
}

export function ExpandedFormWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const model = requireModel();
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const rawTrace = useInteractionTrace(onInteract);
  // Copies of one card share their trace id (`card-300`), so the trace names what the child moved.
  const trace: TraceRecorder = useCallback(
    (kind, target) => rawTrace(kind, traceTarget(target)),
    [rawTrace],
  );
  const alive = useAlive();
  const pause = useDemoPause();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const mode = config.mode;
  const cards = config.cards ?? [];
  const hasCards = (mode === 'build' || mode === 'fill') && cards.length > 0;
  const ids = blankIds(config);
  const wordOptions = mode === 'words' ? config.wordOptions : undefined;
  const usesPad =
    mode === 'to-standard' ||
    mode === 'digit-value' ||
    (mode === 'fill' && !hasCards) ||
    (mode === 'words' && !wordOptions);
  const targetDigits = digitCount(config.target);
  // Blanks that the pad types into. Fill: every expression blank. Other pad modes: one answer slot,
  // drawn in the expression's own blank when it has one.
  const padSlots = !usesPad ? [] : mode === 'fill' ? ids : [ids[0] ?? ANSWER_SLOT];
  // Sized for a few more digits than the target has, so neither the box nor its limit hints at
  // how long the answer is. Fill parts never have more digits than the target.
  const maxDigits = mode === 'fill' ? targetDigits : targetDigits + 1;

  // ---------- state (the engine model) ----------

  const [state, setState] = useState<ExpandedFormState>(() => model.initialState(config));
  const stateRef = useRef(state);
  stateRef.current = state;
  const commit = (next: ExpandedFormState) => {
    stateRef.current = next;
    setState(next);
  };
  const act = (action: WidgetAction) => commit(model.apply(stateRef.current, action));

  // Pad text being typed (reaches the model as `answer` on check, as in number-pad).
  const [texts, setTexts] = useState<string[]>(() => padSlots.map(() => ''));
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const setTextsNow = (next: string[]) => {
    textsRef.current = next;
    setTexts(next);
  };
  const [active, setActive] = useState(0);

  const [demoBusy, setDemoBusy] = useState(false);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  /** The demo's current highlight (a key like `placed-1`, `build`, `opt-a`). */
  const [flash, setFlash] = useState<string | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const interactive = !disabled && !demoBusy;

  // Resolves after this widget's next commit (demo flights measure the committed DOM).
  const commitWaiters = useRef<(() => void)[]>([]);
  useLayoutEffect(() => {
    if (commitWaiters.current.length === 0) return;
    const ready = commitWaiters.current;
    commitWaiters.current = [];
    for (const resolve of ready) resolve();
  });
  const afterCommit = () =>
    new Promise<void>((resolve) => {
      commitWaiters.current.push(resolve);
      // A state update that changed nothing never commits.
      setTimeout(resolve, 250);
    });

  // ---------- the card tray ----------

  const used =
    mode === 'build'
      ? state.placed
      : mode === 'fill'
        ? state.entries.filter((e): e is number => e !== null)
        : [];
  const tray = hasCards ? cardLayout(cards, used) : [];
  const nextBlank = state.entries.indexOf(null);
  const trayRowRef = useBalancedRow(
    `${ageMode}|${tray.flatMap((c) => (c.visible ? [c.id] : [])).join(',')}`,
    true,
  );
  const buildRowRef = useBalancedRow(`${ageMode}|${state.placed.join(',')}`, !state.stacked);

  const valueOfItem = (item: string): number | undefined => {
    if (item.startsWith('placed-')) return stateRef.current.placed[Number(item.slice(7))];
    return trayValueOf(item);
  };

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive,
    trace,
    canPlace: (item, target) => {
      const isPlaced = item.startsWith('placed-');
      if (target === 'tray') return isPlaced;
      if (isPlaced) return false;
      if (target === 'build') return mode === 'build';
      const open = ids[stateRef.current.entries.indexOf(null)];
      return mode === 'fill' && open !== undefined && target === `blank-${open}`;
    },
    onSelect: (item) => {
      if (item === null) return;
      setInvite(null);
      const v = valueOfItem(item);
      if (speakOnTap && v !== undefined) sayNumber(v);
    },
    onPlace: ({ item, target }) => {
      setInvite(null);
      const v = valueOfItem(item);
      if (v === undefined) return;
      act({
        op: 'place-card',
        args: target === 'tray' ? { value: v, remove: true } : { value: v },
      });
    },
  });

  // ---------- pad ----------

  const typeKey = (key: PadKey) => {
    const i = Math.min(active, padSlots.length - 1);
    if (i < 0) return;
    const nextText = applyPadKey(textsRef.current[i] ?? '', key, maxDigits);
    const next = [...textsRef.current];
    next[i] = nextText;
    setTextsNow(next);
    // A full blank moves on to the next empty one.
    if (key !== 'back' && nextText.length >= maxDigits) {
      const after = next.findIndex((txt, j) => j > i && txt === '');
      if (after >= 0) setActive(after);
    }
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    typeKey(key);
  };

  // ---------- the response ----------

  const currentResponse = (): ResponseValue | null => {
    if (!usesPad) return model.toResponse(stateRef.current);
    const values = textsRef.current.map(padValue);
    if (values.some((v) => v === null)) return null;
    const action: WidgetAction =
      mode === 'fill'
        ? { op: 'answer', args: { values: values as number[] } }
        : { op: 'answer', args: { value: values[0] as number } };
    return model.toResponse(model.apply(model.initialState(config), action));
  };
  const canCheck = currentResponse() !== null;

  // One debounce for every way to submit (Check, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const response = currentResponse();
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- child actions outside drag and drop ----------

  const tapNumber = () => {
    if (!interactive) return;
    trace('tap', 'number');
    setInvite(null);
    // The whole number only, never one digit's value (that would give digit-value away).
    if (speakOnTap) sayNumber(config.target);
  };

  const clearBlank = (i: number) => {
    if (!interactive) return;
    const id = ids[i];
    if (id === undefined) return;
    trace('undo', `blank-${id}`);
    setInvite(null);
    // `place-card {remove, blank}` empties one blank; the next card fills it again.
    commit(model.apply(stateRef.current, { op: 'place-card', args: { remove: true, blank: id } }));
  };

  const pickOption = (id: string, words: Parameters<typeof say>[0]) => {
    if (!interactive) return;
    trace('tap', `opt-${id}`);
    setInvite(null);
    if (speakOnTap) say(words);
    act({ op: 'answer', args: { id } });
  };

  // ---------- demo mode (03 §6.3) ----------

  const el = (selector: string) => rootRef.current?.querySelector<HTMLElement>(selector) ?? null;
  const trayCardEl = (v: number, which: 'first' | 'last') => {
    const all = rootRef.current?.querySelectorAll<HTMLElement>(
      `.ni-efw__card[data-in="tray"][data-card="${v}"]`,
    );
    if (!all || all.length === 0) return null;
    return which === 'first' ? (all[0] ?? null) : (all[all.length - 1] ?? null);
  };

  /** Slides `target` from where `from` was drawn to its own place (FLIP), or highlights it. */
  const fly = async (target: HTMLElement | null, from: DOMRect | null | undefined, key: string) => {
    if (reduced || !target || !from || typeof target.animate !== 'function') {
      setFlash(key);
      return;
    }
    const to = target.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    target.setAttribute('data-flying', 'true');
    const anim = target.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
      { duration: FLY_MS, easing: FLY_EASING },
    );
    await anim.finished.catch(() => undefined);
    target.removeAttribute('data-flying');
  };

  /** Moves one card from the tray to the mat or the next blank (or back), as the child would. */
  const playPlaceCard = async (v: number, remove: boolean) => {
    const before = stateRef.current;
    if (mode === 'build' && remove) {
      const i = before.placed.lastIndexOf(v);
      if (i < 0) return;
      const from = el(`[data-place-item="placed-${i}"]`)?.getBoundingClientRect();
      act({ op: 'place-card', args: { value: v, remove: true } });
      await afterCommit();
      if (!alive.current) return;
      const back = trayCardEl(v, 'last');
      await fly(back, from, back?.getAttribute('data-place-item') ?? 'tray');
      return;
    }
    if (hasCards) {
      const from = trayCardEl(v, 'last')?.getBoundingClientRect();
      act({ op: 'place-card', args: { value: v } });
      const after = stateRef.current;
      if (after === before) return;
      await afterCommit();
      if (!alive.current) return;
      if (mode === 'build') {
        const key = `placed-${after.placed.length - 1}`;
        await fly(el(`[data-place-item="${key}"]`), from, key);
      } else {
        const i = after.entries.findIndex((e, j) => e !== before.entries[j]);
        const id = ids[i];
        if (id !== undefined) await fly(el(`[data-blank="${id}"]`), from, `blank-${id}`);
      }
      return;
    }
    if (mode === 'fill') {
      // No cards: the pad types the value into the next empty blank.
      const i = textsRef.current.indexOf('');
      if (i >= 0) await typeValue(i, v);
    }
  };

  /** Types a number into a pad blank key by key. */
  const typeValue = async (i: number, v: number) => {
    setActive(i);
    const cleared = [...textsRef.current];
    cleared[i] = '';
    setTextsNow(cleared);
    let text = '';
    for (const ch of String(v).split('') as PadKey[]) {
      setPressedKey(ch);
      await pause(KEY_MS);
      if (!alive.current) return;
      text += ch;
      const next = [...textsRef.current];
      next[i] = text;
      setTextsNow(next);
    }
    setPressedKey(null);
    const id = padSlots[i];
    if (reduced && id !== undefined) setFlash(`blank-${id}`);
    await pause(KEY_MS);
  };

  const playAnswer = async (action: WidgetAction) => {
    const s = stateRef.current;
    const final = model.apply(s, action);
    const id = action.args?.id;
    if (mode === 'words' && wordOptions) {
      const option = wordOptions.find((o) => o.id === id);
      if (!option) return;
      setFlash(`opt-${option.id}`);
      say(option.words);
      await pause(600);
      if (!alive.current) return;
      commit(final);
      await pause(300);
      if (alive.current && !reduced) setFlash(null);
      return;
    }
    if (hasCards) {
      const values =
        numsArg(action, 'values') ??
        [numArg(action, 'value')].flatMap((v) => (v === undefined ? [] : [v]));
      if (reduced) {
        commit(final);
        setFlash(mode === 'build' ? 'build' : 'expr');
        return;
      }
      // Clear the mat (or the blanks), then move the cards one by one.
      act({ op: 'answer', args: { values: [] } });
      await afterCommit();
      for (const v of values) {
        if (!alive.current) return;
        await playPlaceCard(v, false);
        await pause(200);
      }
      if (alive.current) commit(final);
      return;
    }
    if (usesPad) {
      const values = numsArg(action, 'values');
      const value = numArg(action, 'value');
      if (mode === 'fill') {
        // As the model: `values` replaces every blank, `value` fills the first one.
        const list: [number, number][] = values
          ? values.map((v, i) => [i, v] as [number, number])
          : value !== undefined
            ? [[0, value]]
            : [];
        if (values) setTextsNow(padSlots.map(() => ''));
        for (const [i, v] of list) {
          if (i >= padSlots.length || !alive.current) continue;
          await typeValue(i, v);
        }
      } else if (value !== undefined) {
        await typeValue(0, value);
      }
      if (alive.current) commit(final);
    }
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      setFlash(null);
      if (stateRef.current.highlightedDigit !== null) act({ op: 'highlight-digit' });
      try {
        if (action.op === 'place-card') {
          const v = numArg(action, 'value');
          if (v === undefined) return;
          await playPlaceCard(v, action.args?.remove === true);
          await pause(250);
          if (alive.current && !reduced) setFlash(null);
        } else if (action.op === 'stack-cards') {
          const before = new Map<string, DOMRect>();
          for (const card of rootRef.current?.querySelectorAll<HTMLElement>(
            '.ni-efw__card[data-in="mat"]',
          ) ?? []) {
            before.set(card.getAttribute('data-place-item') ?? '', card.getBoundingClientRect());
          }
          act({ op: 'stack-cards' });
          await afterCommit();
          if (!alive.current) return;
          if (reduced || before.size === 0) {
            setFlash('build');
          } else {
            await Promise.all(
              [...before].map(([key, from]) => fly(el(`[data-place-item="${key}"]`), from, key)),
            );
            await pause(300);
          }
        } else if (action.op === 'highlight-digit') {
          act(action);
          await pause(PULSE_MS);
          // The pulse ends; with reduced motion the ring stays until the next step.
          if (alive.current && !reduced) act({ op: 'highlight-digit' });
        } else if (action.op === 'answer') {
          await playAnswer(action);
        }
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
        // Resolve once the end state is on screen, so the host sees what the op did.
        await afterCommit();
      }
    },
    invite: (action) => {
      setFlash(null);
      if (stateRef.current.highlightedDigit !== null) act({ op: 'highlight-digit' });
      setInvite(action);
    },
  });

  // ---------- render ----------

  const invited = inviteTarget(invite, {
    mode,
    hasCards,
    placed: state.placed,
    tray,
    ids,
    entries: state.entries,
    padSlots,
    active,
  });
  const marked = (key: string) => invited === key || flash === key;

  const blankName = (i: number, count: number) =>
    count === 1 ? t('ui.widget.answer') : t('ui.widget.blank', { n: i + 1 });

  /** A pad blank (fill without cards, or the lone answer slot). */
  const padBlank = (i: number, size: 'lg' | 'md' | 'xl') => {
    const id = padSlots[i];
    if (id === undefined) return null;
    const text = texts[i] ?? '';
    const isActive = i === active && !disabled;
    const key = `blank-${id}`;
    return (
      <span className="ni-efw__slot" key={id}>
        <button
          type="button"
          className={['ni-number', 'ni-efw__blank', marked(key) ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-size={size === 'md' ? undefined : size}
          style={{ minWidth: `${maxDigits * 0.62 + 0.8}em` }}
          data-state={isActive ? 'active' : 'idle'}
          data-empty={text === '' ? 'true' : undefined}
          data-blank={id}
          aria-label={`${blankName(i, padSlots.length)}: ${text}`.trim()}
          aria-current={isActive ? 'true' : undefined}
          disabled={!interactive}
          onClick={() => {
            trace('tap', key);
            setInvite(null);
            setActive(i);
          }}
        >
          {text === '' ? <span className="ni-number__slot" /> : <span>{text}</span>}
          {isActive ? <span className="ni-number__caret" /> : null}
        </button>
        {invited === key ? <Hand /> : null}
      </span>
    );
  };

  /** A fill blank that takes a card: a drop target while empty, a "tap to clear" box when full. */
  const cardBlank = (i: number, size: 'lg' | 'md') => {
    const id = ids[i];
    if (id === undefined) return null;
    const key = `blank-${id}`;
    const v = state.entries[i];
    const name = blankName(i, ids.length);
    const minWidth = `${targetDigits * 0.62 + 0.8}em`;
    const className = ['ni-number', 'ni-efw__blank', marked(key) ? 'ni-invite' : '']
      .filter(Boolean)
      .join(' ');
    if (v === null || v === undefined) {
      const props = dnd.targetProps(key, { label: name, disabled: i !== nextBlank });
      return (
        <span className="ni-efw__slot" key={id}>
          <div
            {...props}
            className={`${props.className} ${className}`}
            data-size={size === 'lg' ? 'lg' : undefined}
            style={{ minWidth }}
            data-empty="true"
            data-blank={id}
            data-next={i === nextBlank ? 'true' : undefined}
          >
            <span className="ni-number__slot" />
          </div>
          {invited === key ? <Hand /> : null}
        </span>
      );
    }
    return (
      <span className="ni-efw__slot" key={id}>
        <button
          type="button"
          className={className}
          data-size={size === 'lg' ? 'lg' : undefined}
          style={{ minWidth }}
          data-blank={id}
          data-filled="true"
          aria-label={`${name}: ${v}`}
          disabled={!interactive}
          onClick={() => clearBlank(i)}
        >
          <span>{v}</span>
        </button>
        {invited === key ? <Hand /> : null}
      </span>
    );
  };

  /**
   * The target numeral: ONE tappable number with tight tabular digits; tapping it speaks the whole
   * number. Digits are spans inside it only so digit-value can ring one and a demo can pulse one.
   */
  const targetNumeral = (size: 'lg' | 'xl', ringAt?: number) => {
    const digits = String(config.target).split('');
    const ringed = ringAt === undefined ? undefined : digits[ringAt];
    return (
      <button
        type="button"
        className="ni-efw__number"
        data-size={size}
        aria-label={
          ringed === undefined
            ? String(config.target)
            : t('ui.widget.ef.number-ring', { n: config.target, d: ringed })
        }
        disabled={!interactive}
        onClick={tapNumber}
      >
        <span className="ni-efw__numeral" aria-hidden="true">
          {digits.map((d, i) => {
            const key = `digit-${i}`;
            const pulsing = state.highlightedDigit === i || marked(key);
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: digits are positional
                key={i}
                className={['ni-efw__nd', pulsing ? 'ni-invite' : ''].filter(Boolean).join(' ')}
                data-digit={i}
                data-ringed={ringAt === i ? 'true' : undefined}
              >
                {d}
                {invited === key ? <Hand /> : null}
              </span>
            );
          })}
        </span>
      </button>
    );
  };

  const card = (
    id: string,
    v: number,
    where: 'tray' | 'mat',
    label: string,
    style?: CSSProperties,
  ) => {
    const props = dnd.itemProps(id, { label });
    return (
      <span className="ni-efw__cardslot" key={id} style={style}>
        <div
          {...props}
          className={[props.className, 'ni-efw__card', marked(id) ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-in={where}
          data-card={v}
        >
          <CardFace value={v} pictorial={tier !== 'abstract'} />
        </div>
        {invited === id ? <Hand /> : null}
      </span>
    );
  };

  const trayZone = hasCards ? (
    <div className="ni-efw__zone ni-efw__zone--tray">
      {(() => {
        const props = dnd.targetProps('tray', { label: t('ui.widget.ef.tray') });
        return (
          <div
            {...props}
            className={[
              props.className,
              'ni-efw__pad',
              'ni-efw__pad--tray',
              marked('tray') ? 'ni-invite' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        );
      })()}
      <fieldset
        ref={trayRowRef}
        className="ni-efw__row ni-efw__row--tray"
        aria-label={t('ui.widget.numbers')}
      >
        {tray.filter((c) => c.visible).map((c) => card(c.id, c.value, 'tray', String(c.value)))}
      </fieldset>
      {invited === 'tray' ? <Hand /> : null}
    </div>
  ) : null;

  const check = <CheckButton onPress={submit} disabled={!interactive || !canCheck} />;

  let body: ReactNode;
  let layout: 'column' | 'pad' = 'column';

  if (mode === 'build') {
    const order = state.placed
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v || a.i - b.i)
      .map((c) => c.i);
    const buildProps = dnd.targetProps('build', { label: t('ui.widget.ef.build') });
    body = (
      <>
        {targetNumeral('lg')}
        <div
          className="ni-efw__zone ni-efw__zone--build"
          data-stacked={state.stacked ? 'true' : undefined}
        >
          <div
            {...buildProps}
            className={[
              buildProps.className,
              'ni-efw__pad',
              'ni-efw__pad--build',
              marked('build') ? 'ni-invite' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
          <fieldset
            ref={buildRowRef}
            className="ni-efw__row ni-efw__row--build"
            aria-label={t('ui.widget.ef.built')}
            data-stacked={state.stacked ? 'true' : undefined}
          >
            {state.placed.flatMap((v, i) => {
              const id = `placed-${i}`;
              // Stacked like arrow cards: the biggest value at the bottom, all right-aligned.
              const style = state.stacked ? { zIndex: order.indexOf(i) + 1 } : undefined;
              const node = card(id, v, 'mat', t('ui.widget.ef.placed', { n: v }), style);
              return i === 0
                ? [node]
                : [
                    <span key={`plus-${id}`} className="ni-efw__plus" aria-hidden="true">
                      +
                    </span>,
                    node,
                  ];
            })}
          </fieldset>
          {invited === 'build' ? <Hand /> : null}
        </div>
        <div className="ni-efw__bottom">
          {trayZone}
          {check}
        </div>
      </>
    );
  } else if (mode === 'fill' && hasCards && config.expression) {
    const size = expressionSize(config.expression.tokens, targetDigits, 980);
    body = (
      <>
        <div
          className={['ni-efw__expr', marked('expr') ? 'ni-invite' : ''].filter(Boolean).join(' ')}
          data-size={size}
        >
          <ExpressionView
            expr={config.expression}
            renderBlank={(id) => cardBlank(ids.indexOf(id), size)}
          />
        </div>
        <div className="ni-efw__bottom">
          {trayZone}
          {check}
        </div>
      </>
    );
  } else if (mode === 'words' && wordOptions) {
    body = (
      <>
        <fieldset
          className="ni-efw__options"
          aria-label={t('ui.widget.choices')}
          disabled={!interactive}
        >
          {wordOptions.map((o) => {
            const key = `opt-${o.id}`;
            const words = t(o.words);
            return (
              <span key={o.id} className="ni-efw__optslot">
                <PickCard
                  label={words}
                  selected={state.choice === o.id}
                  highlighted={marked(key)}
                  variant="word"
                  data-id={key}
                  onPress={() => pickOption(o.id, o.words)}
                >
                  <span>{words}</span>
                </PickCard>
                {invited === key ? <Hand /> : null}
              </span>
            );
          })}
        </fieldset>
        {check}
      </>
    );
  } else {
    // Pad modes: fill without cards, to-standard, words heard, digit-value.
    layout = 'pad';
    const expr = config.expression;
    let ask: ReactNode;
    if (mode === 'digit-value') {
      ask = (
        <>
          {targetNumeral('xl', config.digitIndex)}
          <div className="ni-efw__answers">{padBlank(0, 'lg')}</div>
        </>
      );
    } else if (mode === 'words') {
      ask = (
        <>
          <IconButton
            label="ui.widget.ef.hear"
            icon={<SpeakerIcon tone="light" />}
            tone="sea"
            speak="always"
            className="ni-efw__hear ni-replay"
            disabled={!interactive}
            onPress={() => trace('tap', 'hear')}
          />
          <div className="ni-efw__answers">{padBlank(0, 'lg')}</div>
        </>
      );
    } else if (expr) {
      const size = expressionSize(expr.tokens, maxDigits, 760);
      const inExpr = ids.length > 0;
      ask = (
        <>
          <div className="ni-efw__expr" data-size={size}>
            <ExpressionView
              expr={expr}
              renderBlank={(id) => {
                const i = padSlots.indexOf(id);
                return i >= 0 ? padBlank(i, size) : <span className="ni-expr__blank" />;
              }}
            />
          </div>
          {inExpr ? null : <div className="ni-efw__answers">{padBlank(0, 'lg')}</div>}
        </>
      );
    } else {
      ask = <div className="ni-efw__answers">{padBlank(0, 'lg')}</div>;
    }
    body = (
      <>
        <div className="ni-efw__ask">{ask}</div>
        <div className="ni-efw__controls">
          <NumberPadKeys
            onKey={onKey}
            onEnter={submit}
            disabled={!interactive}
            highlighted={pressedKey}
          />
          {check}
        </div>
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      className="ni-efw"
      data-mode={mode}
      data-layout={layout}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
    >
      {body}
    </div>
  );
}

export default ExpandedFormWidget;
