import {
  designRectangles,
  type FormatModel,
  formatModel,
  type PerimeterWalkState,
  polygonPoints,
  resolvedSides,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';
import { Pebbling } from '../../art';
import { useInteractionTrace } from '../../interaction/trace';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import { CheckButton, type PadKey, useAlive, useDemoPause, useSubmitGuard } from '../kit';
import { useInviteHand } from '../kit/inviteHand';
import { enteredValues, NumberEntry } from '../kit/NumberEntry';
import { useAvailableSize } from '../kit/useAvailableSize';
import type { ConfigFor, WidgetProps } from '../types';
import './perimeter-walk.css';

/**
 * `perimeter-walk` (03 §5.5; grade 3: MEA.06, MEA.11, MEA.14), pictorial. The fence is drawn to
 * scale (every side exactly its length, `polygonPoints`), each side labelled with its number (the
 * missing one with "?"). Tapping a side's number sends the Pebbling walking along that side; the
 * walked sides turn solid. The child types the total (`total`), or the missing side from the
 * fence's length (`missing-side`). In `design` the child builds a rectangle on the grid: drag its
 * corner (or tap a square; arrow keys on the corner) and Check answers `{ w, h }`
 * (`rect.perimeterArea`); the rectangle to compare with is drawn beside it.
 *
 * Demo ops: `walk-side {index}`, `add-label {index}`, `trace`, plus `answer`.
 */

const OPS = ['walk-side', 'add-label', 'trace', 'answer'] as const;
type Config = ConfigFor<'perimeter-walk'>;
type Pt = [number, number];

export function PerimeterWalkWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const model = formatModel('perimeter-walk') as
    | FormatModel<'perimeter-walk', PerimeterWalkState>
    | undefined;
  if (!model) throw new Error('perimeter-walk has no engine model');
  const t = useNarrationText();
  const { sayNumber } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const root = useRef<HTMLDivElement>(null);
  const avail = useAvailableSize(root);
  const [state, setState] = useState<PerimeterWalkState>(() => model.initialState(config));
  const [texts, setTexts] = useState<string[]>(['']);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [walker, setWalker] = useState<{ side: number; t: number } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const interactive = !disabled && !demoBusy;
  const apply = (a: WidgetAction) => setState((s) => model.apply(s, a));
  const minT = MIN_TARGET_PX[ageMode];
  const design = config.mode === 'design';

  // ---------- the fence, to scale ----------
  const points = design ? null : polygonPoints(config);
  const sides = resolvedSides(config);
  const xs = (points ?? [[0, 0]]).map((p) => p[0]);
  const ys = (points ?? [[0, 0]]).map((p) => p[1]);
  const fw = Math.max(...xs) - Math.min(...xs);
  const fh = Math.max(...ys) - Math.min(...ys);
  // Short areas (the smallest landscape screen) put the fence beside a tall 3 × 4 pad; taller
  // ones put a wide 6 × 2 pad under it.
  const beside = !design && avail !== null && avail.height < 420;
  // Beside: a column (sign, box, Check) and a 3-wide pad.
  const entryW = 190 + 16 + 3 * minT + 24;
  const boxW = Math.max(
    220,
    Math.min(760, (avail?.width ?? 1100) - 40 - (beside ? entryW + 24 : 0)),
  );
  const boxH = Math.max(
    160,
    (avail?.height ?? 640) - (design ? minT + 40 : beside ? 12 : 2 * minT + 12 + 74),
  );
  // Room around the fence for the side numbers, which sit just outside each side.
  const pad = minT * 0.8;
  const u = Math.max(
    8,
    Math.min(70, (boxW - 2 * pad) / Math.max(fw, 1), (boxH - 2 * pad) / Math.max(fh, 1)),
  );
  const toPx = ([x, y]: Pt): Pt => [pad + x * u, pad + y * u];
  const svgW = fw * u + 2 * pad;
  const svgH = fh * u + 2 * pad;

  const walk = async (i: number) => {
    // The Pebbling walks the side (instant with reduced motion).
    if (reduced) {
      setWalker({ side: i, t: 1 });
      return;
    }
    for (let s = 0; s <= 10; s += 1) {
      setWalker({ side: i, t: s / 10 });
      await new Promise((r) => setTimeout(r, 45));
      if (!alive.current) return;
    }
  };

  const tapSide = (i: number) => {
    if (!interactive) return;
    trace('tap', `side-${i}`);
    setInvite(null);
    const len = config.polygon.sides[i];
    if (speakOnTap && typeof len === 'number') sayNumber(len);
    apply({ op: 'walk-side', args: { index: i } });
    void walk(i);
  };

  // ---------- design: a rectangle on the grid ----------
  const options = design ? designRectangles(config) : [];
  const ref =
    config.polygon.sides.length === 4
      ? (config.polygon.sides as [number, number, number, number])
      : null;
  // A grid that holds every rectangle the checker accepts (12 × 1 and 1 × 12 for area 12, review
  // CR-1.3) and the one to compare with, plus a spare row and column; the squares shrink to fit.
  const gridCols = Math.max(5, (ref?.[0] ?? 0) + 1, ...options.map((r) => r.w + 1));
  const gridRows = Math.max(4, (ref?.[1] ?? 0) + 1, ...options.map((r) => r.h + 1));
  const cell = Math.max(
    14,
    Math.min(
      60,
      (Math.min(boxW, 900) * (ref ? 0.68 : 1) - 24) / gridCols,
      // Capped: a stage that grows with its content must not grow the grid (the squares would
      // change size under a dragging finger).
      (Math.min(boxH, 420) - 24) / gridRows,
    ),
  );
  const size = state.size;
  const setSize = (w: number, h: number, via: 'drag' | 'tap' | 'move') => {
    const nw = Math.min(gridCols, Math.max(1, w));
    const nh = Math.min(gridRows, Math.max(1, h));
    trace(via === 'drag' ? 'drop' : via, `cell-${nw}-${nh}`);
    apply({ op: 'answer', args: { values: [nw, nh] } });
  };
  const grid = useRef<HTMLDivElement>(null);
  const cellAt = (clientX: number, clientY: number) => {
    const el = grid.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Squares start inside the board's border.
    const x = clientX - r.left - el.clientLeft;
    const y = clientY - r.top - el.clientTop;
    return [Math.ceil(x / cell), Math.ceil(y / cell)] as Pt;
  };
  const onGridDown = (e: ReactPointerEvent) => {
    if (!interactive) return;
    const start = cellAt(e.clientX, e.clientY);
    if (!start) return;
    const id = e.pointerId;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const c = cellAt(ev.clientX, ev.clientY);
      if (!c) return;
      if (!moved) trace('drag', 'corner');
      moved = true;
      apply({
        op: 'answer',
        args: {
          values: [Math.min(gridCols, Math.max(1, c[0])), Math.min(gridRows, Math.max(1, c[1]))],
        },
      });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const c = cellAt(ev.clientX, ev.clientY) ?? start;
      setSize(c[0], c[1], moved ? 'drag' : 'tap');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onGridKey = (e: KeyboardEvent) => {
    if (!interactive) return;
    const w = size?.w ?? 1;
    const h = size?.h ?? 1;
    const d: Record<string, Pt> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const step = d[e.key];
    if (step) {
      e.preventDefault();
      setSize(w + step[0], h + step[1], 'move');
    }
  };

  // ---------- answer ----------
  const values = enteredValues(texts);
  const response = design
    ? model.toResponse(state)
    : values
      ? model.toResponse(model.apply(state, { op: 'answer', args: { value: values[0] } }))
      : null;
  const submit = useSubmitGuard(() => {
    if (!interactive || !response) return false;
    onResponse(response);
    return true;
  });

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setInvite(null);
      setDemoBusy(true);
      try {
        const a = action.args ?? {};
        if (action.op === 'walk-side' && typeof a.index === 'number') {
          apply(action);
          const len = config.polygon.sides[a.index];
          if (typeof len === 'number') sayNumber(len);
          await walk(a.index);
          await pause(300);
          return;
        }
        if (action.op === 'trace') {
          for (let i = 0; i < config.polygon.sides.length; i += 1) {
            apply({ op: 'walk-side', args: { index: i } });
            await walk(i);
            if (!alive.current) return;
          }
          apply(action);
          return;
        }
        if (action.op === 'answer' && typeof a.value === 'number') {
          let text = '';
          for (const d of String(a.value)) {
            setPressedKey(d as PadKey);
            text += d;
            setTexts([text]);
            await pause(320);
            if (!alive.current) return;
          }
          setPressedKey(null);
          return;
        }
        apply(action);
        if (action.op === 'add-label' && typeof a.index === 'number') {
          const len = sides?.[a.index];
          if (typeof len === 'number' && config.polygon.sides[a.index] !== null) sayNumber(len);
        }
        await pause(600);
      } finally {
        if (alive.current) setDemoBusy(false);
      }
    },
    invite: (action) => {
      if (!action) return setInvite(null);
      if (action.op === 'walk-side' || action.op === 'add-label') {
        return setInvite(`side-${String(action.args?.index ?? 0)}`);
      }
      setInvite(action.op === 'answer' ? (design ? 'corner' : 'entry') : null);
    },
  });

  // Pip's hand under the invited side number, grid or answer box (kit useInviteHand).
  const { hand, rootStyle: handStyle } = useInviteHand(
    root,
    (r) => {
      if (!invite) return null;
      if (invite.startsWith('side-'))
        return r.querySelector<HTMLElement>(`[data-label-side="${invite.slice(5)}"]`);
      if (invite === 'corner') return r.querySelector<HTMLElement>('.ni-pwalk__grid-board');
      return r.querySelector<HTMLElement>('.ni-entry__box');
    },
    invite ?? '',
  );

  // ---------- drawing ----------
  let picture: React.ReactNode = null;
  if (!design && points && sides) {
    const n = points.length;
    const walkerAt = walker
      ? (() => {
          const a = toPx(points[walker.side] as Pt);
          const b = toPx(points[(walker.side + 1) % n] as Pt);
          return [a[0] + (b[0] - a[0]) * walker.t, a[1] + (b[1] - a[1]) * walker.t];
        })()
      : null;
    const cx = xs.reduce((s, x) => s + x, 0) / n;
    const cy = ys.reduce((s, y) => s + y, 0) / n;
    picture = (
      <div className="ni-pwalk__fence" style={{ width: svgW, height: svgH }}>
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          aria-hidden="true"
          focusable="false"
        >
          {config.polygon.grid ? (
            <g className="ni-pwalk__grid">
              {Array.from({ length: Math.floor(fw) + 1 }, (_, i) => pad + i * u).map((x) => (
                <line key={`v${x}`} x1={x} x2={x} y1={pad} y2={pad + fh * u} />
              ))}
              {Array.from({ length: Math.floor(fh) + 1 }, (_, i) => pad + i * u).map((y) => (
                <line key={`h${y}`} x1={pad} x2={pad + fw * u} y1={y} y2={y} />
              ))}
            </g>
          ) : null}
          <polygon
            className="ni-pwalk__inside"
            points={points.map((p) => toPx(p).join(',')).join(' ')}
          />
          {points.map((p, i) => {
            const a = toPx(p);
            const b = toPx(points[(i + 1) % n] as Pt);
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: one side per index
                key={i}
                className={
                  state.walked.includes(i)
                    ? 'ni-pwalk__side ni-pwalk__side--walked'
                    : 'ni-pwalk__side'
                }
                data-side={i}
                data-length={sides[i]}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
              />
            );
          })}
          {points.map((p, i) => {
            const [x, y] = toPx(p);
            // biome-ignore lint/suspicious/noArrayIndexKey: one post per corner
            return <circle key={i} className="ni-pwalk__post" cx={x} cy={y} r={6} />;
          })}
        </svg>
        {points.map((p, i) => {
          const a = toPx(p);
          const b = toPx(points[(i + 1) % n] as Pt);
          // The label sits just outside the side's midpoint.
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          const ox = mx - toPx([cx, cy])[0];
          const oy = my - toPx([cx, cy])[1];
          const d = Math.hypot(ox, oy) || 1;
          const off = minT * 0.3;
          const known = config.polygon.sides[i];
          const label = known === null ? '?' : String(known);
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: one label per side
              key={`l${i}`}
              className="ni-pwalk__label-slot"
              style={{ left: mx + (ox / d) * off, top: my + (oy / d) * off }}
            >
              <button
                type="button"
                className={[
                  'ni-pwalk__label',
                  state.walked.includes(i) ? 'ni-pwalk__label--walked' : '',
                  invite === `side-${i}` ? 'ni-invite' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-label-side={i}
                aria-label={t('ui.pwalk.side', { n: i + 1, len: label })}
                aria-pressed={state.walked.includes(i)}
                disabled={!interactive}
                onClick={() => tapSide(i)}
              >
                {label}
              </button>
            </span>
          );
        })}
        {walkerAt ? (
          <span
            className="ni-pwalk__walker"
            style={{ left: walkerAt[0], top: walkerAt[1] }}
            aria-hidden="true"
          >
            <Pebbling species="crab" palette="sunshine" number={null} size={54} />
          </span>
        ) : null}
      </div>
    );
  } else if (design) {
    const w = size?.w ?? 0;
    const h = size?.h ?? 0;
    picture = (
      <div className="ni-pwalk__design">
        {ref ? (
          <div className="ni-pwalk__ref" aria-label={t('ui.pwalk.compare')} role="img">
            <svg
              width={ref[0] * cell * 0.5 + 8}
              height={ref[1] * cell * 0.5 + 8}
              aria-hidden="true"
            >
              <rect
                className="ni-pwalk__ref-rect"
                x={4}
                y={4}
                width={ref[0] * cell * 0.5}
                height={ref[1] * cell * 0.5}
              />
            </svg>
            <span className="ni-pwalk__dims" aria-hidden="true">
              {ref[0]} × {ref[1]}
            </span>
          </div>
        ) : null}
        <div
          ref={grid}
          className={['ni-pwalk__grid-board', invite === 'corner' ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          role="slider"
          tabIndex={interactive ? 0 : -1}
          aria-label={t('ui.pwalk.build')}
          aria-valuetext={size ? `${w} × ${h}` : '?'}
          aria-valuemin={1}
          aria-valuemax={gridCols * gridRows}
          aria-valuenow={w * h}
          aria-disabled={!interactive || undefined}
          data-size={size ? `${w}x${h}` : undefined}
          data-cell={cell}
          style={{
            width: gridCols * cell,
            height: gridRows * cell,
            backgroundSize: `${cell}px ${cell}px`,
          }}
          onPointerDown={onGridDown}
          onKeyDown={onGridKey}
        >
          {size ? (
            <span className="ni-pwalk__rect" style={{ width: w * cell, height: h * cell }}>
              <span className="ni-pwalk__corner" aria-hidden="true" />
              <span className="ni-pwalk__dim ni-pwalk__dim--w" aria-hidden="true">
                {w}
              </span>
              <span className="ni-pwalk__dim ni-pwalk__dim--h" aria-hidden="true">
                {h}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const sign =
    config.perimeter !== undefined && config.mode !== 'total' ? (
      <span
        className="ni-pwalk__sign"
        role="img"
        aria-label={t('ui.pwalk.around', { n: config.perimeter })}
      >
        <FenceIcon />
        <span aria-hidden="true">{config.perimeter}</span>
      </span>
    ) : null;
  const areaSign =
    config.area !== undefined ? (
      <span
        className="ni-pwalk__sign"
        role="img"
        aria-label={t('ui.pwalk.inside', { n: config.area })}
      >
        <SquaresIcon />
        <span aria-hidden="true">{config.area}</span>
      </span>
    ) : null;

  return (
    <div
      ref={root}
      className="ni-pwalk"
      data-mode={config.mode}
      data-beside={beside ? 'true' : undefined}
      data-tier={tier}
      data-disabled={disabled ? 'true' : undefined}
      style={handStyle}
    >
      <div className="ni-pwalk__stage">
        {picture}
        {!beside && (sign || areaSign) ? (
          <div className="ni-pwalk__signs">
            {sign}
            {areaSign}
          </div>
        ) : null}
      </div>
      <div className="ni-pwalk__answer">
        {design ? null : (
          <NumberEntry
            texts={texts}
            active={0}
            onActive={() => {}}
            onTexts={(next) => {
              setInvite(null);
              setTexts(next);
            }}
            labels={[t('ui.widget.answer')]}
            maxDigits={3}
            disabled={!interactive}
            compact
            shape={beside ? 'tall' : 'wide'}
            highlightedKey={pressedKey}
            invitedBox={invite === 'entry' ? 0 : null}
            onEnter={submit}
            onKeyTrace={(k) => trace('tap', `key-${k}`)}
            aside={
              beside ? (
                <>
                  {sign}
                  <CheckButton onPress={submit} disabled={!interactive || !response} />
                </>
              ) : undefined
            }
          />
        )}
        {beside ? null : <CheckButton onPress={submit} disabled={!interactive || !response} />}
      </div>
      {hand}
    </div>
  );
}

function FenceIcon() {
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" focusable="false">
      <path
        d="M8 14l4-6 4 6v28H8zM22 14l4-6 4 6v28h-8zM36 14l4-6 4 6v28h-8z"
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M4 20h42M4 34h42"
        stroke="var(--color-wood-deep)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SquaresIcon() {
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" focusable="false">
      <path
        d="M6 6h18v18H6zM24 6h18v18H24zM6 24h18v18H6zM24 24h18v18H24z"
        fill="var(--color-shallows)"
        stroke="var(--color-sea-dark)"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export default PerimeterWalkWidget;
