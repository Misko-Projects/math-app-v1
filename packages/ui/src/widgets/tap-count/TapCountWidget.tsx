import { formatModel } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { ArrowIcon, CheckIcon, HandPointerIcon } from '../../primitives/icons';
import { NumberDisplay } from '../../primitives/NumberDisplay';
import { MIN_TARGET_PX, TARGET_GAP_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  fitCell,
  minObjectStep,
  NumberPadKeys,
  NumeralTray,
  numeralCardPx,
  ObjectSetView,
  ObjectSprite,
  objectSetLayout,
  type PadKey,
  type PlacedObject,
  padValue,
  spriteNameKey,
  TRAY_PANEL_EDGES_PX,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './tap-count.css';

/**
 * `tap-count` (03 §5.5): count a set of objects.
 *
 * - **Concrete** (C): every object is a tap target. A tapped object gets a numbered pebble badge
 *   with the count it was given (`marks`, never colour alone), and `countAloud` speaks the running
 *   count. Tapping a counted object again speaks its number and is traced again (the trace drives
 *   MC.off-by-one-counting and MC.recount-from-one). Distractors can be tapped to hear their name,
 *   but they are never counted or marked.
 * - **Pictorial** (P): a static picture; the child only answers.
 *
 * Answer controls: `input: 'auto'` shows a numeral tray (0–10, or 0–20 above 10) once every object
 * has been counted (straight away in P); `'pad'` is the number pad with a big answer slot; `'pick'`
 * is a numeral tray of `pickOptions`. `mode: 'ordinal'` answers `choice obj-<i>`: the child taps
 * the k-th object from the side marked by a "start here" arrow; the tapped object is ringed. The
 * response always comes from the engine model (`formatModel('tap-count')`) on "check".
 *
 * Demo ops (03 §5.5): `tap {index}`, `count-aloud {upTo}`, `ring {index}`, `say-total`, plus
 * `answer {value | id}`.
 */

const OPS = ['tap', 'count-aloud', 'ring', 'say-total', 'answer'] as const;
const COUNT_MS = 650;

// Ordinal layout budget, in px (tap-count.css). The whole widget must fit the workshop's widget
// area (a 1200 px stage with 24 px padding, so ~1146 px inside) with room to spare on both sides.
const ORDINAL_AREA_W = 1080;
/** `.ni-tapc[data-mode="ordinal"]` side padding, the row card's padding + border, the cue gap. */
const ORDINAL_CHROME_W = 2 * 16 + 2 * (20 + 3) + 16;
/** The Check pill beside the row (G1+ shows its word; K is icon-only and narrower) + column gap. */
const ORDINAL_CHECK_W = 200 + 56;

type Config = ConfigFor<'tap-count'>;

/** The numeral tray for `input: 'auto'`: 0–10, 0–20, or on to the next ten for larger sets. */
export function autoTrayValues(count: number): number[] {
  const top = count <= 10 ? 10 : count <= 20 ? 20 : Math.ceil(count / 10) * 10;
  return Array.from({ length: top + 1 }, (_, i) => i);
}

/** Object indexes in the order they were first tapped (a double tap counts once). */
function countOrder(taps: readonly number[]): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const i of taps) {
    if (!seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  }
  return order;
}

export function TapCountWidget({
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
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const n = Math.max(0, config.set.count);
  const ordinal = config.mode === 'ordinal';
  const concrete = tier === 'concrete';
  const layout = useMemo(() => objectSetLayout(config.set), [config.set]);

  const [taps, setTaps] = useState<number[]>([]);
  const [ringed, setRinged] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [padText, setPadText] = useState('');
  const [demoBusy, setDemoBusy] = useState(false);
  const [counting, setCounting] = useState<number | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoMarked, setDemoMarked] = useState(false);
  const tapsRef = useRef(taps);
  tapsRef.current = taps;

  const interactive = !disabled && !demoBusy;
  const order = countOrder(taps);
  const markOf = new Map(order.map((i, k) => [i, k + 1]));
  const allCounted = order.length >= n;
  /** Objects are buttons: always in C; in P only when the answer is an object (ordinal). */
  const objectsTappable = concrete || ordinal;
  // Pip's counting (demo) always marks, so a "show me" leaves the counted picture behind.
  const showMarks = (concrete && config.marks) || demoMarked;

  // ---------- sizes (06 §4: K ≥ 80 px, G1 ≥ 64 px, ≥ 12 px apart) ----------

  const target = MIN_TARGET_PX[ageMode];
  const step = Math.min(1.5, minObjectStep(layout));
  // Tappable objects: a cell big enough that `step × cell − gap` is a full target.
  const minCell = objectsTappable
    ? Math.max(target, Math.ceil((target + TARGET_GAP_PX) / step))
    : 32;
  const trayValues = config.input === 'pick' ? (config.pickOptions ?? []) : autoTrayValues(n);
  // Numeral cards in an even grid (NumeralTray `columns`): 0–10 as 6 over 5, 0–20 as 7 × 3, pick
  // options up to 4 a row.
  const trayCols =
    config.input === 'pick' ? Math.min(4, trayValues.length) : trayValues.length > 11 ? 7 : 6;
  const trayDigits = Math.max(1, ...trayValues.map((v) => String(v).length));
  const card = numeralCardPx(trayDigits, target) + TARGET_GAP_PX;
  const trayW = trayCols * card - TARGET_GAP_PX + TRAY_PANEL_EDGES_PX;
  // The answer column of a how-many layout (ordinal layouts budget their own, below).
  const answerW = config.input === 'pad' ? 3 * (target + 16) + 2 * TARGET_GAP_PX : trayW;
  const answerH =
    config.input === 'pad'
      ? 560
      : Math.ceil(trayValues.length / trayCols) * (target + TARGET_GAP_PX + 6) + 30;
  // "Start here" pebble: not a target, so it stays compact enough for a row of ten K targets.
  const cueSize = Math.min(64, Math.round(target * 0.9));
  const empty = layout.objects.length === 0;
  const { arrange, cell } = ((): { arrange: 'side' | 'stack'; cell: number } => {
    // Nothing to count: an empty dish centred above the answer.
    if (empty) return { arrange: 'stack', cell: 32 };
    if (ordinal) {
      // The row card (cue + objects) and Check side by side when the row still gets full-size
      // targets; otherwise Check sits centred under the row, which then takes the full width.
      const rowW = ORDINAL_AREA_W - ORDINAL_CHROME_W - cueSize;
      const sideFit = fitCell(layout, rowW - ORDINAL_CHECK_W, 360, 32);
      if (sideFit >= minCell && layout.width * sideFit <= rowW - ORDINAL_CHECK_W) {
        return { arrange: 'side', cell: sideFit };
      }
      return { arrange: 'stack', cell: Math.max(minCell, fitCell(layout, rowW, 360, 32)) };
    }
    // Side by side (picture left, answer right) when both fit the ~1100 px widget area; otherwise
    // the picture spans the width above the answer. Either way the objects grow into the room left.
    const sideW = 1100 - answerW - 240;
    const sideCell = Math.max(minCell, fitCell(layout, sideW, 340, 32));
    if (layout.width * sideCell <= sideW) return { arrange: 'side', cell: sideCell };
    return {
      arrange: 'stack',
      cell: Math.max(minCell, fitCell(layout, 1000, Math.max(120, 520 - answerH), 32)),
    };
  })();
  // A picture (P) keeps full-size objects; tap targets leave the 12 px gap between them.
  const hitSize = objectsTappable ? Math.min(cell, Math.floor(step * cell - TARGET_GAP_PX)) : cell;

  // ---------- child actions ----------

  const objectName = (o: PlacedObject) => t(spriteNameKey(o.sprite));

  const tapObject = (o: PlacedObject) => {
    if (!interactive) return;
    if (o.kind === 'distractor') {
      trace('tap', `distractor-${o.index}`);
      if (speakOnTap) say(spriteNameKey(o.sprite));
      return;
    }
    const i = o.index;
    trace('tap', `obj-${i}`);
    setInvite(null);
    if (ordinal) setRinged(i);
    if (!concrete) {
      if (speakOnTap) say(spriteNameKey(o.sprite));
      return;
    }
    const mark = markOf.get(i) ?? order.length + 1;
    const next = [...tapsRef.current, i];
    tapsRef.current = next;
    setTaps(next);
    if (config.countAloud) sayNumber(mark);
    else if (speakOnTap) say(spriteNameKey(o.sprite));
  };

  const trayShown =
    config.input !== 'pad' && !ordinal && (config.input === 'pick' || !concrete || allCounted);

  const pick = (v: number) => {
    if (!interactive) return;
    trace('tap', `opt-${v}`);
    setInvite(null);
    setPicked(v);
  };

  const maxDigits = String(Math.max(20, n)).length;
  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    setPadText((s) => applyPadKey(s, key, maxDigits));
  };

  const answerValue = config.input === 'pad' ? padValue(padText) : picked;
  const ready = ordinal ? ringed !== null : answerValue !== null;

  // One 400 ms debounce for Check and desktop Enter together (06 §4).
  const submit = useSubmitGuard(() => {
    if (!interactive || !ready) return false;
    const model = formatModel('tap-count');
    if (!model) return false;
    const actions: WidgetAction[] = tapsRef.current.map((index) => ({
      op: 'tap',
      args: { index },
    }));
    if (ordinal && ringed !== null) actions.push({ op: 'ring', args: { index: ringed } });
    if (!ordinal && answerValue !== null) {
      actions.push({ op: 'answer', args: { value: answerValue } });
    }
    const state = actions.reduce(model.apply, model.initialState(config));
    const response = model.toResponse(state);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const markDemo = async (i: number) => {
    if (i < 0 || i >= n) return;
    setDemoMarked(true);
    setCounting(i);
    const already = tapsRef.current.includes(i);
    const next = [...tapsRef.current, i];
    tapsRef.current = next;
    setTaps(next);
    sayNumber(already ? countOrder(next).indexOf(i) + 1 : countOrder(next).length);
    await pause(COUNT_MS);
  };

  const enterValue = async (v: number) => {
    sayNumber(v);
    if (config.input === 'pad') {
      // The answer replaces whatever was typed (like the engine model's `answer` op).
      let text = '';
      setPadText(text);
      for (const ch of String(v).split('') as PadKey[]) {
        setPressedKey(ch);
        await pause(340);
        if (!alive.current) return;
        text = applyPadKey(text, ch, maxDigits);
        setPadText(text);
      }
      setPressedKey(null);
    } else {
      setPicked(v);
    }
    await pause(400);
  };

  const indexArg = (action: WidgetAction) => {
    const v = action.args?.index;
    return typeof v === 'number' && Number.isInteger(v) ? v : null;
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'tap') {
          const i = indexArg(action);
          if (i !== null) await markDemo(i);
        } else if (action.op === 'count-aloud') {
          const upTo = Math.min(n, Number(action.args?.upTo ?? n) || n);
          for (let i = 0; i < upTo; i++) {
            if (tapsRef.current.includes(i)) continue;
            await markDemo(i);
            if (!alive.current) return;
          }
        } else if (action.op === 'ring') {
          const i = indexArg(action);
          if (i !== null && i >= 0 && i < n) {
            setCounting(i);
            setRinged(i);
            await pause(COUNT_MS);
          }
        } else if (action.op === 'say-total') {
          await enterValue(countOrder(tapsRef.current).length);
        } else if (action.op === 'answer') {
          const id = typeof action.args?.id === 'string' ? action.args.id : null;
          const m = id?.match(/^obj-(\d+)$/);
          if (m) {
            setRinged(Number(m[1]));
            await pause(COUNT_MS);
          } else if (typeof action.args?.value === 'number') {
            await enterValue(action.args.value);
          }
        }
      } finally {
        if (alive.current) {
          setCounting(null);
          setPressedKey(null);
          setDemoBusy(false);
        }
      }
    },
    invite: (action) => setInvite(action),
  });

  const invitedObject = (() => {
    if (!invite) return null;
    if (invite.op === 'tap' || invite.op === 'ring') return indexArg(invite);
    if (invite.op === 'count-aloud') {
      for (let i = 0; i < n; i++) if (!taps.includes(i)) return i;
    }
    if (invite.op === 'answer' && typeof invite.args?.id === 'string') {
      const m = invite.args.id.match(/^obj-(\d+)$/);
      return m ? Number(m[1]) : null;
    }
    return null;
  })();
  const invitedAnswer = invite !== null && invitedObject === null;

  // ---------- render ----------

  const renderObject = (o: PlacedObject, style: CSSProperties) => {
    const left = Number(style.left) + Number(style.width) / 2 - hitSize / 2;
    const top = Number(style.top) + Number(style.height) / 2 - hitSize / 2;
    const spriteSize = Math.min(hitSize, Number(style.width));
    const isObject = o.kind === 'object';
    const mark = isObject ? markOf.get(o.index) : undefined;
    const box: CSSProperties = { left, top, width: hitSize, height: hitSize };
    const sprite = (
      <span className="ni-tapc__sprite" style={{ width: spriteSize, height: spriteSize }}>
        <ObjectSprite sprite={o.sprite} tone={o.tone} />
      </span>
    );
    const badge =
      mark !== undefined && showMarks ? (
        <span className="ni-tapc__mark" aria-hidden="true">
          {mark}
        </span>
      ) : null;
    const isRinged = isObject && ringed === o.index;
    const invited = isObject && invitedObject === o.index;
    const tappable = objectsTappable && (isObject || concrete);
    if (!tappable) {
      return (
        <span
          key={`${o.kind}-${o.index}`}
          className="ni-tapc__obj"
          style={box}
          data-kind={o.kind}
          data-counting={counting === o.index && isObject ? 'true' : undefined}
          data-ringed={isRinged ? 'true' : undefined}
          aria-hidden="true"
        >
          {sprite}
          {badge}
        </span>
      );
    }
    const name = objectName(o);
    const label =
      mark !== undefined && showMarks ? t('ui.count.marked', { thing: name, n: mark }) : name;
    return (
      <button
        key={`${o.kind}-${o.index}`}
        type="button"
        className={['ni-tapc__obj', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        style={box}
        data-kind={o.kind}
        data-obj={isObject ? `obj-${o.index}` : `distractor-${o.index}`}
        data-marked={mark !== undefined ? 'true' : undefined}
        data-counting={counting === o.index && isObject ? 'true' : undefined}
        data-ringed={isRinged ? 'true' : undefined}
        aria-label={label}
        aria-pressed={ordinal && isObject ? isRinged : undefined}
        disabled={!interactive}
        onClick={() => tapObject(o)}
      >
        {sprite}
        {badge}
        {isRinged ? (
          <span className="ni-tapc__ring-badge" aria-hidden="true">
            <CheckIcon tone="light" />
          </span>
        ) : null}
        {invited ? (
          <span className="ni-hand ni-tapc__hand">
            <HandPointerIcon />
          </span>
        ) : null}
      </button>
    );
  };

  const from = config.ordinal?.from ?? 'left';
  const firstRowTop = Math.min(...layout.objects.map((o) => o.y), 0);

  return (
    <div
      className="ni-tapc"
      data-tier={tier}
      data-mode={ordinal ? 'ordinal' : 'how-many'}
      data-arrange={arrange}
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="ni-tapc__picture" data-from={ordinal ? from : undefined}>
        {ordinal ? (
          // "Start here": an arrow on the counting side, level with the first row (no words).
          <span
            className="ni-tapc__cue"
            data-from={from}
            role="img"
            aria-label={t('ui.count.start')}
            style={{
              width: cueSize,
              height: cueSize,
              marginTop: firstRowTop * cell + (cell - cueSize) / 2,
            }}
          >
            <ArrowIcon />
          </span>
        ) : null}
        {empty ? (
          // Nothing to count (CNT.13): an empty dish, so the picture never reads as a missing image.
          <span className="ni-tapc__empty" role="img" aria-label={t('ui.widget.picture')} />
        ) : (
          <ObjectSetView
            layout={layout}
            cell={cell}
            label={t('ui.widget.picture')}
            renderObject={renderObject}
            className="ni-tapc__set"
          />
        )}
      </div>

      <div className="ni-tapc__answer">
        {config.input === 'pad' && !ordinal ? (
          <div className="ni-tapc__pad">
            <span className={invitedAnswer ? 'ni-tapc__slot ni-invite' : 'ni-tapc__slot'}>
              <NumberDisplay
                value={padText === '' ? null : padText}
                digits={maxDigits}
                size="lg"
                state={interactive ? 'active' : 'idle'}
                label="ui.widget.answer"
              />
            </span>
            <NumberPadKeys
              onKey={onKey}
              onEnter={submit}
              disabled={!interactive}
              highlighted={pressedKey}
            />
          </div>
        ) : null}
        {config.input !== 'pad' && !ordinal ? (
          <div
            className={['ni-tapc__tray', invitedAnswer ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
            data-shown={trayShown ? 'true' : 'false'}
            inert={!trayShown}
          >
            <NumeralTray
              values={trayValues}
              selected={picked}
              onPick={pick}
              disabled={!interactive || !trayShown}
              columns={trayCols}
            />
          </div>
        ) : null}
        <span className="ni-tapc__check">
          <CheckButton onPress={submit} disabled={!interactive || !ready} />
          {invitedAnswer ? (
            <span className="ni-hand ni-tapc__check-hand">
              <HandPointerIcon />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export default TapCountWidget;
