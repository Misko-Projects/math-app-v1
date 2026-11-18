import { formatModel } from '@number-island/engine';
import type { ResponseValue, WidgetAction } from '@number-island/shared';
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { ArrowIcon, HandPointerIcon } from '../../primitives/icons';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  flyFrom,
  NumberPadKeys,
  type PadKey,
  padValue,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './hundred-chart.css';

/**
 * `hundred-chart` (03 §5.5, Road Crew W1): ten columns from `first`, `rows` rows (10, or 12 for a
 * 1–120 chart). Hidden cells are blank. Every cell is a button; tapping a shown number says it.
 *
 * - `find` / `next` / `move`: tap the number (the `from` cell carries a start flag; `move` lists
 *   its arrows beside the chart) and "check" → `number`.
 * - `fill`: type the hidden numbers on the pad; the cell being filled has a thick ring and a caret,
 *   and tapping a blank cell chooses it → `numbers` in the config's hidden order (reading order).
 * - `pattern`: tap cells to select a set (shaded, ringed and dotted, never colour alone) → state
 *   `{ values }`.
 *
 * Size rule (06 §4): a 10 × 10 grid cannot keep 64–80 px square cells with 12 px gaps inside the
 * ~550 px widget height, so cells are 72 × 50 px with 8 / 4 px gaps (the largest that fit, ≥ 48 px).
 * Arrow keys move between cells (one tab stop); Enter or Space taps.
 *
 * Trace: `tap` `cell-<n>`, `tap` `key-<k>`. Demo ops: `tap {n}`, `highlight-row {n}` and
 * `highlight-col {n}` (the row or column holding number n), `slide {dir}`, plus `answer`.
 */

const OPS = ['tap', 'highlight-row', 'highlight-col', 'slide', 'answer'] as const;
const MODEL = formatModel('hundred-chart');
const CELL_W = 72;
const CELL_H = 50;
const COL_GAP = 8;
const ROW_GAP = 4;
const SLIDE_MS = 420;
const KEY_MS = 300;

type Config = ConfigFor<'hundred-chart'>;
type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];
const STEP: Record<Dir, number> = { up: -10, down: 10, left: -1, right: 1 };
const ROTATE: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

function MoveArrow({ dir }: { dir: Dir }) {
  return (
    <span className="ni-hc__arrow" style={{ transform: `rotate(${ROTATE[dir]}deg)` }}>
      <ArrowIcon />
    </span>
  );
}

export function HundredChartWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { sayNumber } = useSpeech();
  const { speakOnTap } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const c = config;
  const last = c.first + c.rows * 10 - 1;
  const cells = Array.from({ length: c.rows * 10 }, (_, i) => c.first + i);
  const hidden = new Set(c.hidden);
  const readingOrder = [...c.hidden].sort((a, b) => a - b);
  const maxDigits = String(last).length;

  const [selected, setSelected] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [active, setActive] = useState<number | null>(readingOrder[0] ?? null);
  const [focusCell, setFocusCell] = useState<number>(c.from ?? c.first);
  const [band, setBand] = useState<{ kind: 'row' | 'col'; n: number } | null>(null);
  const [token, setToken] = useState<number | null>(null);
  const [tokenFrom, setTokenFrom] = useState<DOMRect | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [pulse, setPulse] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const tokenRef = useRef<HTMLSpanElement | null>(null);
  const typedRef = useRef(typed);
  typedRef.current = typed;

  const interactive = !disabled && !demoBusy;
  const fill = c.mode === 'fill';
  const pattern = c.mode === 'pattern';

  const rowOf = (n: number) => Math.floor((n - c.first) / 10);
  const colOf = (n: number) => (n - c.first) % 10;
  const onChart = (n: number) => n >= c.first && n <= last;

  // ---------- taps ----------

  const tapCell = (n: number) => {
    if (!interactive) return;
    trace('tap', `cell-${n}`);
    setInvite(null);
    setFocusCell(n);
    // Never say a hidden number: that would give the answer away.
    if (speakOnTap && !hidden.has(n)) sayNumber(n);
    if (fill) {
      if (hidden.has(n)) setActive(n);
      return;
    }
    if (pattern) {
      setPicked((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
      return;
    }
    setSelected(n);
  };

  const onCellKeyDown = (e: KeyboardEvent, n: number) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 10,
      ArrowUp: -10,
    };
    let next: number | null = null;
    if (e.key in moves) next = n + (moves[e.key] as number);
    else if (e.key === 'Home') next = n - colOf(n);
    else if (e.key === 'End') next = n - colOf(n) + 9;
    if (next === null) return;
    e.preventDefault();
    if (!onChart(next)) return;
    setFocusCell(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-n="${next}"]`)?.focus();
  };

  // ---------- typing (fill) ----------

  const typeInto = (n: number, key: PadKey) => {
    const text = applyPadKey(typedRef.current[n] ?? '', key, maxDigits);
    const next = { ...typedRef.current, [n]: text };
    typedRef.current = next;
    setTyped(next);
    // A cell full of digits moves on to the next empty one (reading order).
    if (key !== 'back' && text.length >= String(n).length) {
      const after = readingOrder.find((h) => h > n && !next[h]);
      const before = readingOrder.find((h) => !next[h]);
      const to = after ?? before;
      if (to !== undefined) setActive(to);
    }
  };

  const onKey = (key: PadKey) => {
    if (!interactive || active === null || key === '.') return;
    trace('tap', `key-${key}`);
    setInvite(null);
    typeInto(active, key);
  };

  // ---------- check (through the format model) ----------

  const response = (): ResponseValue | null => {
    if (!MODEL) return null;
    let s = MODEL.initialState(c);
    if (fill) {
      const values = c.hidden.map((h) => padValue(typed[h] ?? ''));
      if (values.some((v) => v === null)) return null;
      s = MODEL.apply(s, { op: 'answer', args: { values: values as number[] } });
    } else if (pattern) {
      if (picked.length === 0) return null;
      s = MODEL.apply(s, { op: 'answer', args: { values: picked } });
    } else if (selected !== null) {
      s = MODEL.apply(s, { op: 'tap', args: { n: selected } });
    }
    return MODEL.toResponse(s);
  };
  const ready = response() !== null;
  // One debounce for every way to submit (Check button, desktop Enter): 06 §4.
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const r = response();
    if (!r) return false;
    onResponse(r);
    return true;
  });

  // ---------- demo mode (03 §6.3) ----------

  useLayoutEffect(() => {
    if (!tokenFrom || !tokenRef.current) return;
    const from = tokenFrom;
    setTokenFrom(null);
    void flyFrom(tokenRef.current, from, { ms: reduced ? 0 : SLIDE_MS });
  }, [tokenFrom, reduced]);

  const num = (a: WidgetAction, key: string) => {
    const v = a.args?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const typeCell = async (n: number, value: number) => {
    setActive(n);
    let text = '';
    for (const ch of String(value).split('') as PadKey[]) {
      setPressedKey(ch);
      await pause(KEY_MS);
      if (!alive.current) return;
      text = applyPadKey(text, ch, maxDigits);
      const next = { ...typedRef.current, [n]: text };
      typedRef.current = next;
      setTyped(next);
    }
    setPressedKey(null);
    await pause(KEY_MS);
  };

  const moveToken = (to: number) => {
    const from = tokenRef.current?.getBoundingClientRect() ?? null;
    setToken(to);
    if (from && !reduced) setTokenFrom(from);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'tap') {
          const n = num(action, 'n');
          if (n === null || !onChart(n)) return;
          setPulse(n);
          await pause(500);
          if (!alive.current) return;
          setPulse(null);
          if (fill && hidden.has(n)) {
            // Pip fills the blank: "the next one is …".
            await typeCell(n, n);
            sayNumber(n);
          } else {
            if (!hidden.has(n)) sayNumber(n);
            if (pattern)
              setPicked((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
            else if (!fill) setSelected(n);
          }
          moveToken(n);
          await pause(300);
        } else if (action.op === 'highlight-row' || action.op === 'highlight-col') {
          const n = num(action, 'n');
          if (n === null || !onChart(n)) return;
          setBand({ kind: action.op === 'highlight-row' ? 'row' : 'col', n });
          if (!hidden.has(n)) sayNumber(n);
          await pause(1100);
        } else if (action.op === 'slide') {
          const dir = action.args?.dir;
          if (typeof dir !== 'string' || !DIRS.includes(dir as Dir)) return;
          const from = token ?? selected ?? c.from ?? c.first;
          if (token === null) setToken(from);
          const to = from + STEP[dir as Dir];
          if (!onChart(to)) return;
          moveToken(to);
          await pause(SLIDE_MS + 120);
          if (!alive.current) return;
          if (!hidden.has(to)) sayNumber(to);
        } else if (action.op === 'answer') {
          const values = action.args?.values;
          if (Array.isArray(values)) {
            const list = values.filter((v): v is number => typeof v === 'number');
            if (fill) {
              // `answer` replaces every entry, like the engine model: unnamed cells clear.
              typedRef.current = {};
              setTyped({});
              for (let i = 0; i < c.hidden.length; i++) {
                const h = c.hidden[i] as number;
                const v = list[i];
                if (v !== undefined) await typeCell(h, v);
                if (!alive.current) return;
              }
            } else if (pattern) {
              setPicked(list.filter(onChart));
            }
          } else {
            const v = num(action, 'value');
            if (v === null) return;
            if (fill) {
              typedRef.current = {};
              setTyped({});
              const h = c.hidden[0];
              if (h !== undefined) await typeCell(h, v);
            } else if (pattern) setPicked(onChart(v) ? [v] : []);
            else if (onChart(v)) {
              setPulse(v);
              await pause(500);
              if (!alive.current) return;
              setPulse(null);
              setSelected(v);
            }
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

  // ---------- render ----------

  const invitedCell = invite?.op === 'tap' ? num(invite, 'n') : null;
  const inviteChart =
    invite !== null && ['highlight-row', 'highlight-col', 'slide'].includes(invite.op);
  const inviteAnswer = invite?.op === 'answer';
  const pos = (n: number) => ({
    left: colOf(n) * (CELL_W + COL_GAP),
    top: rowOf(n) * (CELL_H + ROW_GAP),
  });
  const gridW = 10 * CELL_W + 9 * COL_GAP;
  const gridH = c.rows * CELL_H + (c.rows - 1) * ROW_GAP;
  const bandStyle = band
    ? band.kind === 'row'
      ? { left: -6, top: pos(band.n).top - 6, width: gridW + 12, height: CELL_H + 12 }
      : { left: pos(band.n).left - 6, top: -6, width: CELL_W + 12, height: gridH + 12 }
    : null;

  const cellLabel = (n: number) => {
    if (hidden.has(n)) {
      const v = typed[n];
      return v ? `${t('ui.hc.missing')}: ${v}` : t('ui.hc.missing');
    }
    return n === c.from ? t('ui.hc.start', { n }) : String(n);
  };

  return (
    <div
      className="ni-hc"
      data-tier={tier}
      data-mode={c.mode}
      data-disabled={disabled ? 'true' : undefined}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a CSS grid of cell buttons with overlays, not a form group */}
      <div
        ref={gridRef}
        className={['ni-hc__chart', inviteChart ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        role="group"
        aria-label={t('ui.hc.chart')}
        style={{
          gridTemplateColumns: `repeat(10, ${CELL_W}px)`,
          gridAutoRows: `${CELL_H}px`,
          columnGap: COL_GAP,
          rowGap: ROW_GAP,
          width: gridW,
        }}
      >
        {cells.map((n) => {
          const isHidden = hidden.has(n);
          const isActive = fill && isHidden && active === n && interactive;
          const isSelected = pattern ? picked.includes(n) : !fill && selected === n;
          const text = isHidden ? (typed[n] ?? '') : String(n);
          return (
            <button
              key={n}
              type="button"
              className={['ni-hc__cell', invitedCell === n ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
              data-n={n}
              data-hidden={isHidden ? 'true' : undefined}
              data-active={isActive ? 'true' : undefined}
              data-selected={isSelected ? 'true' : undefined}
              data-start={n === c.from ? 'true' : undefined}
              data-pulse={pulse === n ? 'true' : undefined}
              aria-label={cellLabel(n)}
              aria-pressed={fill ? undefined : isSelected}
              aria-current={isActive ? 'true' : undefined}
              tabIndex={focusCell === n ? 0 : -1}
              disabled={!interactive}
              onClick={() => tapCell(n)}
              onKeyDown={(e) => onCellKeyDown(e, n)}
              onFocus={() => setFocusCell(n)}
            >
              <span className="ni-hc__num" aria-hidden="true">
                {text}
              </span>
              {isActive ? <span className="ni-hc__caret" aria-hidden="true" /> : null}
            </button>
          );
        })}
        {bandStyle ? <span className="ni-hc__band" style={bandStyle} aria-hidden="true" /> : null}
        {token !== null ? (
          <span
            ref={tokenRef}
            className="ni-hc__token"
            style={{ ...pos(token), width: CELL_W, height: CELL_H }}
            aria-hidden="true"
          />
        ) : null}
        {invitedCell !== null && onChart(invitedCell) ? (
          <span
            className="ni-hand ni-hc__hand"
            style={{
              left: pos(invitedCell).left + CELL_W / 2 - 10,
              top: pos(invitedCell).top + CELL_H - 8,
            }}
          >
            <HandPointerIcon />
          </span>
        ) : null}
      </div>

      <div className="ni-hc__side">
        {c.mode === 'move' && c.moves ? (
          <ul className="ni-hc__moves" aria-label={t('ui.hc.moves')}>
            {c.moves.map((m, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: moves are positional
              <li key={i} className="ni-hc__move" aria-label={t(`ui.hc.move.${m}`)}>
                <MoveArrow dir={m} />
              </li>
            ))}
          </ul>
        ) : null}
        {fill ? (
          <NumberPadKeys
            onKey={onKey}
            onEnter={submit}
            disabled={!interactive}
            highlighted={pressedKey}
          />
        ) : null}
        <span
          className={['ni-hc__checkslot', inviteAnswer ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <CheckButton onPress={submit} disabled={!interactive || !ready} />
          {inviteAnswer ? (
            <span className="ni-hand ni-hc__checkhand">
              <HandPointerIcon />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export default HundredChartWidget;
