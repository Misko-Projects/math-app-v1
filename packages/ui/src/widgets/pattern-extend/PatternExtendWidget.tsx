import {
  blankIndexes,
  type FormatModel,
  formatModel,
  MAX_TILES,
  type PatternExtendState,
  tableBlanks,
  tokenFamily,
} from '@number-island/engine';
import type { PatternToken, WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  NumberPadKeys,
  type PadKey,
  padValue,
  Stepper,
  trayGrid,
  useAlive,
  useDemoPause,
  useInviteHand,
  useMeasuredBox,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { PatternTokenView, tokenName, tokenSpeech } from './PatternTokenView';
import './pattern-extend.css';

/**
 * `pattern-extend` (03 §5.5): a pattern of island objects, coloured shapes, numbers or growing
 * tile stacks, read left to right.
 * - `extend`, `fill`: drag a unit from the pieces onto a blank (or tap the unit, then the blank;
 *   or the keyboard). Tapping a filled blank takes its unit off. Number blanks are typed on the pad
 *   (tap a blank to choose it); tile blanks are built with one-more / one-less.
 * - `core`: tap where the repeating part starts and where it ends (or drag across it); a band
 *   marks the part. `translate`: rebuild the pattern below with the new units.
 * - `rule`: type how much each jump grows. `table`: type the missing outputs.
 * Every change goes through the engine model; Check sends its response. Tapping a unit speaks it.
 *
 * Demo ops: `place-token {index, token}`, `bracket-core {from, to}`, `highlight {index}`, plus
 * `answer {value | values}`.
 */

const OPS = ['place-token', 'bracket-core', 'highlight', 'answer'] as const;
const KEY_MS = 340;
const MAX_DIGITS = 3;

type Config = ConfigFor<'pattern-extend'>;

function useModel(): FormatModel<'pattern-extend', PatternExtendState> {
  const model = formatModel('pattern-extend');
  if (!model) throw new Error('pattern-extend has no engine model');
  // The registry stores models type-erased; this one's state is PatternExtendState.
  return model as unknown as FormatModel<'pattern-extend', PatternExtendState>;
}

const sameToken = (a: PatternToken | null | undefined, b: PatternToken | null | undefined) =>
  Boolean(a && b) && JSON.stringify(a) === JSON.stringify(b);

const argIndex = (a: WidgetAction | null, key = 'index'): number | null => {
  const v = a?.args?.[key];
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
};

export function PatternExtendWidget({
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
  const [rowRef, rowBox] = useMeasuredBox<HTMLDivElement>();
  const [state, setState] = useState<PatternExtendState>(() => model.initialState(config));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const mode = config.mode;
  const shown = config.sequence.find((x): x is PatternToken => x !== null);
  const family = shown ? tokenFamily(shown) : 'n';
  const typed = mode === 'rule' || mode === 'table' || (family === 'n' && mode !== 'core');
  const tiles = family === 'tiles' && config.palette.length === 0 && !typed;
  const units = mode === 'translate' ? (config.translateTo ?? []) : config.palette;
  const placing =
    !typed && !tiles && (mode === 'extend' || mode === 'fill' || mode === 'translate');
  const blanks =
    mode === 'table'
      ? tableBlanks(config)
      : mode === 'translate'
        ? config.sequence.map((_, i) => i)
        : mode === 'extend' || mode === 'fill'
          ? blankIndexes(config)
          : [];

  const [texts, setTexts] = useState<Record<number, string>>({});
  const [ruleText, setRuleText] = useState('');
  const [active, setActive] = useState<number | null>(blanks[0] ?? null);
  const [pending, setPending] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [flashUnit, setFlashUnit] = useState<number | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const interactive = !disabled && !demoBusy;
  const target = ageMode === 'k' ? 80 : 64;

  const apply = (action: WidgetAction) => {
    const next = model.apply(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    return next;
  };

  const speakToken = (token: PatternToken | null | undefined) => {
    if (!token) return;
    const s = tokenSpeech(token);
    if (typeof s === 'number') sayNumber(s);
    else say(s);
  };

  // ---------- placing units (extend, fill, translate) ----------

  const place = useDragToTarget<string, string>({
    disabled: !interactive || !placing,
    trace,
    onSelect: (item) => {
      if (item && speakOnTap) speakToken(units[Number(item.slice(5))]);
    },
    onPlace: ({ item, target: tid }) => {
      const token = units[Number(item.slice(5))];
      const index = Number(tid.slice(6));
      if (!token) return;
      setInvite(null);
      apply({ op: 'place-token', args: { index, token } });
    },
  });

  const clearBlank = (index: number) => {
    if (!interactive || place.selected !== null || !stateRef.current.placed[index]) return;
    trace('undo', `blank-${index}`);
    apply({ op: 'place-token', args: { index } });
  };

  // ---------- typed blanks (numbers, tables, rule) ----------

  const typeInto = (index: number, text: string) => {
    setTexts((x) => ({ ...x, [index]: text }));
    const v = padValue(text);
    apply({ op: 'place-token', args: v === null ? { index } : { index, token: { n: v } } });
  };

  const onKey = (key: PadKey) => {
    if (!interactive || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    if (mode === 'rule') {
      const text = applyPadKey(ruleText, key, MAX_DIGITS);
      setRuleText(text);
      const v = padValue(text);
      if (v !== null) apply({ op: 'answer', args: { value: v } });
      return;
    }
    if (active === null) return;
    const text = applyPadKey(texts[active] ?? '', key, MAX_DIGITS);
    typeInto(active, text);
    // A full blank moves on to the next empty one.
    if (key !== 'back' && text.length >= MAX_DIGITS) {
      const next = blanks.find((i) => i > active && !(texts[i] ?? ''));
      if (next !== undefined) setActive(next);
    }
  };

  // ---------- core: tap the start, then the end (or drag across) ----------

  const drag = useRef<{ start: number; end: number; moved: boolean; pointerId: number } | null>(
    null,
  );
  const suppressClick = useRef(false);

  const bracket = (from: number, to: number) => apply({ op: 'bracket-core', args: { from, to } });

  const tapToken = (i: number) => {
    const token = config.sequence[i];
    if (!interactive) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    trace('tap', `tok-${i}`);
    if (speakOnTap) speakToken(token);
    if (mode !== 'core') return;
    setInvite(null);
    if (pending === null) {
      setPending(i);
      bracket(i, i);
    } else {
      bracket(pending, i);
      setPending(null);
    }
  };

  const indexAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-index]');
    const v = el?.getAttribute('data-index');
    return v === null || v === undefined ? null : Number(v);
  };

  const onCorePointerDown = (i: number) => (e: ReactPointerEvent) => {
    if (!interactive || mode !== 'core' || e.button !== 0) return;
    drag.current = { start: i, end: i, moved: false, pointerId: e.pointerId };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      const j = indexAt(ev.clientX, ev.clientY);
      if (j === null || j === d.end) return;
      if (!d.moved) trace('drag', `tok-${d.start}`);
      d.moved = true;
      d.end = j;
      bracket(d.start, j);
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      drag.current = null;
      if (!d || ev.pointerId !== d.pointerId || !d.moved) return;
      trace('drop', `tok-${d.end}`);
      setPending(null);
      setInvite(null);
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // ---------- submit ----------

  const response = model.toResponse(state);
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const r = model.toResponse(stateRef.current);
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  const typeDemo = async (set: (text: string) => void, value: number) => {
    let text = '';
    set('');
    for (const ch of String(value).split('') as PadKey[]) {
      setPressedKey(ch);
      await pause(KEY_MS);
      if (!alive.current) return;
      text += ch;
      set(text);
    }
    setPressedKey(null);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      place.select(null);
      try {
        switch (action.op) {
          case 'place-token': {
            const index = argIndex(action);
            if (index === null) return;
            const token = action.args?.token as PatternToken | undefined;
            setFlash(index);
            if (typed && token && 'n' in token) {
              setActive(index);
              await typeDemo((text) => setTexts((x) => ({ ...x, [index]: text })), token.n);
              apply(action);
            } else {
              const u = units.findIndex((x) => sameToken(x, token));
              if (u >= 0) {
                setFlashUnit(u);
                speakToken(units[u]);
                await pause(500);
              }
              if (!alive.current) return;
              apply(action);
              setFlashUnit(null);
            }
            await pause(500);
            break;
          }
          case 'bracket-core': {
            const from = argIndex(action, 'from');
            const to = argIndex(action, 'to');
            if (from === null || to === null) return;
            if (reduced) {
              apply(action);
              break;
            }
            // The band grows from the start to the end, one unit at a time.
            for (let k = Math.min(from, to); k <= Math.max(from, to); k += 1) {
              bracket(Math.min(from, to), k);
              speakToken(config.sequence[k]);
              await pause(450);
              if (!alive.current) return;
            }
            apply(action);
            await pause(400);
            break;
          }
          case 'highlight': {
            apply(action);
            setFlash(argIndex(action));
            await pause(1000);
            break;
          }
          case 'answer': {
            const value = action.args?.value;
            if (mode === 'rule' && typeof value === 'number') {
              await typeDemo(setRuleText, value);
              apply(action);
              break;
            }
            const values = action.args?.values;
            if (Array.isArray(values) && typed) {
              for (const [k, v] of values.entries()) {
                const index = blanks[k];
                if (index === undefined || typeof v !== 'number') continue;
                setActive(index);
                await typeDemo((text) => setTexts((x) => ({ ...x, [index]: text })), v);
              }
            }
            apply(action);
            await pause(400);
            break;
          }
        }
        if (!alive.current || reduced) return;
        setFlash(null);
      } finally {
        setPressedKey(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => {
      setFlash(null);
      setFlashUnit(null);
      setInvite(action);
      const i = argIndex(action);
      if (action?.op === 'place-token' && i !== null && typed) setActive(i);
    },
  });

  // ---------- layout ----------

  const len = config.sequence.length;
  const gap = 12;
  // The strip's padding and border take 40 px of the measured width.
  const width = (rowBox?.width ?? 840) - 40;
  const cell =
    mode === 'table'
      ? target
      : Math.max(target, Math.min(104, Math.floor((width - (len - 1) * gap) / len)));
  const perRow = Math.max(1, Math.floor((width + gap) / (cell + gap)));
  // Even columns (as the numeral tray lays out cards): full rows line up, the last is centred.
  const grid = trayGrid(len, perRow);
  const rows = Array.from({ length: grid.rows }, (_, r) =>
    Math.min(grid.cols, len - r * grid.cols),
  );
  const rowsOf = (n: number) => {
    const out: number[][] = [];
    let k = 0;
    for (const size of rows) {
      out.push(Array.from({ length: size }, (_, j) => k + j).filter((i) => i < n));
      k += size;
    }
    return out;
  };

  const invitedIndex =
    invite?.op === 'place-token' || invite?.op === 'highlight'
      ? argIndex(invite)
      : invite?.op === 'bracket-core'
        ? argIndex(invite, 'from')
        : null;
  const invitedUnit =
    invite?.op === 'place-token'
      ? units.findIndex((u) => sameToken(u, invite.args?.token as PatternToken))
      : -1;
  const selected = new Set(state.selected);
  // Pip's up-pointing hand hangs below the invited control (kit `useInviteHand`).
  const handScope =
    mode === 'translate' && invite?.op === 'place-token'
      ? '[data-row="new"]'
      : mode === 'table'
        ? '.ni-pattern__table'
        : '[data-row="pattern"]';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      invitedIndex !== null
        ? root.querySelector<HTMLElement>(`${handScope} [data-index="${invitedIndex}"]`)
        : invite?.op === 'answer'
          ? root.querySelector<HTMLElement>('.ni-pattern__answer, .ni-pattern__blank')
          : null,
    invitedIndex !== null
      ? `${invite?.op}-${invitedIndex}`
      : invite?.op === 'answer'
        ? 'answer'
        : '',
  );
  const coreEdge = (i: number) => {
    if (!selected.has(i)) return undefined;
    const start = !selected.has(i - 1);
    const end = !selected.has(i + 1);
    return start && end ? 'only' : start ? 'start' : end ? 'end' : 'mid';
  };

  const style = { '--cell': `${cell}px` } as CSSProperties;
  // Tile stacks share one scale: the largest stack shown or built.
  const tileFrame = Math.max(
    5,
    ...[...config.sequence, ...state.placed].map((x) => (x && 'tiles' in x ? x.tiles : 0)),
  );

  /** A shown unit: a button that speaks it (and, in core, marks the part that repeats). */
  const shownCell = (i: number, token: PatternToken) => {
    const name = tokenName(token, t);
    const invited = invitedIndex === i;
    return (
      <span key={i} className="ni-pattern__slot">
        <button
          type="button"
          className={['ni-pattern__cell', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
          data-index={i}
          data-family={family}
          data-core={coreEdge(i)}
          data-pending={pending === i ? 'true' : undefined}
          data-flash={flash === i || state.highlighted === i ? 'true' : undefined}
          aria-label={mode === 'core' ? t('ui.widget.pattern.place', { name, n: i + 1 }) : name}
          aria-pressed={mode === 'core' ? selected.has(i) : undefined}
          disabled={!interactive}
          onClick={() => tapToken(i)}
          onPointerDown={onCorePointerDown(i)}
        >
          <PatternTokenView token={token} frame={tileFrame} />
        </button>
      </span>
    );
  };

  /** A blank: a drop target for units, a typed box for numbers, a tile builder for stacks. */
  const blankCell = (i: number, n: number) => {
    const placed = state.placed[i] ?? null;
    const invited = invitedIndex === i;
    const label = t('ui.widget.pattern.blank', { n });
    if (placing) {
      const base = place.targetProps(`blank-${i}`, {
        label: placed ? `${label}: ${tokenName(placed, t)}` : label,
      });
      // A tap with no piece picked up takes the blank's piece off (the hook ignores that tap).
      const props = {
        ...base,
        onClick: (e: Parameters<typeof base.onClick>[0]) => {
          base.onClick(e);
          clearBlank(i);
        },
      };
      return (
        <span key={i} className="ni-pattern__slot">
          <span
            {...props}
            className={[
              props.className,
              'ni-pattern__cell',
              'ni-pattern__blank',
              invited ? 'ni-invite' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-index={i}
            data-empty={placed ? undefined : 'true'}
            data-flash={flash === i ? 'true' : undefined}
          >
            {placed ? <PatternTokenView token={placed} frame={tileFrame} /> : null}
          </span>
        </span>
      );
    }
    const text = tiles ? '' : (texts[i] ?? '');
    const isActive = active === i && !disabled;
    return (
      <span key={i} className="ni-pattern__slot">
        <button
          type="button"
          className={[
            'ni-pattern__cell',
            'ni-pattern__blank',
            typed ? 'ni-number' : '',
            invited ? 'ni-invite' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-index={i}
          data-state={isActive ? 'active' : 'idle'}
          data-empty={(tiles ? !placed : text === '') ? 'true' : undefined}
          data-flash={flash === i ? 'true' : undefined}
          aria-label={`${label}: ${tiles ? (placed ? tokenName(placed, t) : '') : text}`.trim()}
          aria-current={isActive ? 'true' : undefined}
          disabled={!interactive}
          onClick={() => {
            trace('tap', `blank-${i}`);
            setActive(i);
          }}
        >
          {tiles ? (
            placed ? (
              <PatternTokenView token={placed} frame={tileFrame} />
            ) : null
          ) : text === '' ? (
            <span className="ni-number__slot" />
          ) : (
            <span className="ni-pattern__numeral">{text}</span>
          )}
        </button>
      </span>
    );
  };

  const sequenceRow = (newRow: boolean) => (
    <fieldset
      className="ni-pattern__rows"
      aria-label={t(newRow ? 'ui.widget.pattern.new-row' : 'ui.widget.pattern.row')}
      data-row={newRow ? 'new' : 'pattern'}
    >
      {rowsOf(len).map((indexes) => (
        <div key={indexes[0]} className="ni-pattern__row">
          {indexes.map((i) => {
            const token = config.sequence[i];
            if (newRow) return blankCell(i, i + 1);
            if (token === null || token === undefined) {
              return blankCell(i, blanks.indexOf(i) + 1);
            }
            return shownCell(i, token);
          })}
          {mode === 'rule' && indexes.at(-1) === len - 1 ? (
            <span className="ni-pattern__slot ni-pattern__next" aria-hidden="true">
              …
            </span>
          ) : null}
        </div>
      ))}
    </fieldset>
  );

  const palette = placing ? (
    <fieldset className="ni-pattern__palette" aria-label={t('ui.widget.pattern.pieces')}>
      {units.map((u, k) => {
        const p = place.itemProps(`unit-${k}`, { label: tokenName(u, t) });
        const invited = invitedUnit === k || flashUnit === k;
        return (
          <span key={JSON.stringify(u)} className="ni-pattern__slot">
            <button
              type="button"
              {...p}
              className={[
                p.className,
                'ni-pattern__cell',
                'ni-pattern__unit',
                invited ? 'ni-invite' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <PatternTokenView token={u} />
            </button>
          </span>
        );
      })}
    </fieldset>
  ) : null;

  const tilesControl =
    tiles && active !== null ? (
      <Stepper
        value={(() => {
          const p = state.placed[active];
          return p && 'tiles' in p ? p.tiles : null;
        })()}
        max={MAX_TILES}
        min={1}
        label="ui.widget.pattern.blank"
        labelVars={{ n: blanks.indexOf(active) + 1 }}
        disabled={!interactive}
        onPress={(k) => trace('tap', `tiles-${k}`)}
        onChange={(v) => {
          setInvite(null);
          apply({ op: 'place-token', args: { index: active, token: { tiles: v } } });
        }}
      />
    ) : null;

  let main: ReactNode;
  if (mode === 'table') {
    const table = config.table ?? { inputs: [], outputs: [] };
    main = (
      <table className="ni-pattern__table">
        <thead>
          <tr>
            <th scope="col">{t('ui.widget.pattern.in')}</th>
            <th scope="col">{t('ui.widget.pattern.out')}</th>
          </tr>
        </thead>
        <tbody>
          {table.inputs.map((x, r) => {
            const out = table.outputs[r];
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: table rows are fixed
              <tr key={r} data-flash={flash === r || state.highlighted === r ? 'true' : undefined}>
                <td className="ni-pattern__numeral">{x}</td>
                <td>
                  {out === null || out === undefined ? (
                    blankCell(r, blanks.indexOf(r) + 1)
                  ) : (
                    <span className="ni-pattern__numeral">{out}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  } else {
    main = (
      <>
        {sequenceRow(false)}
        {mode === 'translate' ? sequenceRow(true) : null}
        {mode === 'rule' ? (
          <div className="ni-pattern__rule">
            <span className="ni-pattern__jump" aria-hidden="true">
              <svg viewBox="0 0 96 40" width="96" height="40" aria-hidden="true" focusable="false">
                <path
                  d="M6 34C20 6 76 6 90 34M82 26l8 8 2-11"
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <output
              className={[
                'ni-number',
                'ni-pattern__answer',
                invite?.op === 'answer' ? 'ni-invite' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-empty={ruleText === '' ? 'true' : undefined}
              aria-label={`${t('ui.widget.pattern.jump')} ${ruleText}`.trim()}
            >
              {ruleText === '' ? <span className="ni-number__slot" /> : <span>{ruleText}</span>}
            </output>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      className="ni-pattern"
      data-tier={tier}
      data-mode={mode}
      data-family={family}
      data-typed={typed ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      style={{ ...style, ...handRootStyle }}
    >
      <div className="ni-pattern__layout">
        <div className="ni-pattern__main" ref={rowRef}>
          {main}
        </div>
        <div className="ni-pattern__controls">
          {palette}
          {tilesControl}
          {typed ? (
            <NumberPadKeys
              onKey={onKey}
              onEnter={submit}
              disabled={!interactive}
              highlighted={pressedKey}
            />
          ) : null}
          <CheckButton onPress={submit} disabled={!interactive || response === null} />
        </div>
      </div>
      {inviteHand}
    </div>
  );
}

export default PatternExtendWidget;
