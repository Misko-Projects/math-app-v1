import { stickCount } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNarrationText, useReducedMotion, useUiPreferences } from '../../preferences/UiProvider';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import { CheckButton, useAlive, useDemoPause } from '../kit';
import { type ModeProps, OPS, UndoButton } from './shared';

/**
 * draw-on-grid (GEO.02, GEO.09) and build-sticks (GEO.09): draw a closed shape on a dot grid, or
 * build it with sticks that meet at corners. Tap a dot to start, then tap the next dot: a line (a
 * stick) joins them and the new dot is where the next line starts; tap the last dot again to stop.
 * A press dragged from one dot to another draws that line. The keyboard moves between the dots
 * (arrows) and Enter taps. Drawing a line again takes it away; "take one back" removes the last
 * line. Every dot is its own target (evidence review): a target-size square round it (80 px in K,
 * 64 in G1), the dots one target and a 12 px gap apart (92 / 76 px) or more, the grid filling its
 * board; a press between targets does nothing. A grid with more dots than fit at that spacing
 * (a K 5 × 5 in a short area) is drawn at the spacing anyway: targets never shrink.
 */

type Pt = [number, number];
const same = (a: Pt | null, b: Pt | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

export function DotGrid({
  config,
  tier,
  state,
  apply,
  interactive,
  setDemoBusy,
  trace,
  submit,
  response,
  demo,
  avail,
}: ModeProps) {
  const t = useNarrationText();
  const { ageMode, tapOnly } = useUiPreferences();
  const reduced = useReducedMotion();
  const alive = useAlive();
  const pause = useDemoPause();
  const board = useRef<HTMLFieldSetElement>(null);
  const cols = config.grid?.cols ?? 5;
  const rows = config.grid?.rows ?? 5;
  const sticks = config.mode === 'build-sticks';
  const minT = MIN_TARGET_PX[ageMode];
  // Each dot's target: a target-size square centred on it, 6 px inside the board's edge.
  const pad = minT / 2 + 6;
  const gMin = minT + 12;
  const controlsW = (ageMode === 'k' ? 120 : 190) + 24;
  // The grid fills the board: the spacing is as large as the area allows (to 140 px), never under
  // a target and a gap; squares stay squares.
  const g = Math.max(
    gMin,
    Math.min(
      140,
      ((avail?.height ?? 640) - 2 * pad - 16) / Math.max(1, rows - 1),
      ((avail?.width ?? 1100) - controlsW - 32 - 2 * pad) / Math.max(1, cols - 1),
    ),
  );
  const H = 2 * pad + (rows - 1) * g;
  const W = 2 * pad + (cols - 1) * g;
  const offX = 0;
  const [start, setStart] = useState<Pt | null>(null);
  const [cursor, setCursor] = useState<Pt>([0, 0]);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const press = useRef<{ dot: Pt; x: number; y: number; id: number } | null>(null);
  const px = (p: Pt) => [offX + pad + p[0] * g, pad + p[1] * g] as const;
  const sticksLeft = sticks ? stickCount(config) - state.edges.length : 0;

  /** The dot whose target square is under the pointer (none between targets). */
  const dotAt = (clientX: number, clientY: number): Pt | null => {
    const r = board.current?.getBoundingClientRect();
    if (!r) return null;
    const fx = (clientX - r.left - offX - pad) / g;
    const fy = (clientY - r.top - pad) / g;
    const x = Math.round(fx);
    const y = Math.round(fy);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
    if (Math.abs(fx - x) * g > minT / 2 || Math.abs(fy - y) * g > minT / 2) return null;
    return [x, y];
  };
  // The keyboard's dot has focus while the board does (arrow keys move it).
  const focusCursor = useRef(false);
  useEffect(() => {
    if (!focusCursor.current) return;
    board.current
      ?.querySelector<HTMLElement>(`[data-dot-target="${cursor[0]},${cursor[1]}"]`)
      ?.focus();
  }, [cursor]);

  const draw = (from: Pt, to: Pt) => {
    apply({ op: 'draw-edge', args: { from, to } });
  };

  const tapDot = (dot: Pt) => {
    if (!interactive) return;
    setInvite(null);
    trace('tap', `dot-${dot[0]}-${dot[1]}`);
    setCursor(dot);
    if (!start) return setStart(dot);
    if (same(start, dot)) return setStart(null);
    draw(start, dot);
    setStart(dot);
  };

  const onDown = (e: ReactPointerEvent) => {
    if (!interactive) return;
    const dot = dotAt(e.clientX, e.clientY);
    if (!dot) return;
    press.current = { dot, x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onUp = (e: ReactPointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId || !interactive) return;
    const dot = dotAt(e.clientX, e.clientY);
    if (!dot) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 8 && !same(dot, p.dot)) {
      // Tap-only mode (06 §7): a press that moved is no drag, and no tap either.
      if (tapOnly) return;
      // A drag from one dot to another: that line.
      setInvite(null);
      trace('drag', `dot-${p.dot[0]}-${p.dot[1]}`);
      trace('drop', `dot-${dot[0]}-${dot[1]}`);
      draw(p.dot, dot);
      setStart(dot);
      setCursor(dot);
      return;
    }
    tapDot(dot);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!interactive) return;
    const moves: Record<string, Pt> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = moves[e.key];
    if (d) {
      e.preventDefault();
      const next: Pt = [
        Math.min(cols - 1, Math.max(0, cursor[0] + d[0])),
        Math.min(rows - 1, Math.max(0, cursor[1] + d[1])),
      ];
      focusCursor.current = true;
      setCursor(next);
      trace('move', `dot-${next[0]}-${next[1]}`);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tapDot(cursor);
    } else if (e.key === 'Escape') {
      setStart(null);
    }
  };

  const undo = () => {
    const last = state.edges[state.edges.length - 1];
    if (!last || !interactive) return;
    trace('undo', `line-${state.edges.length - 1}`);
    draw(last[0], last[1]);
    setStart(null);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action: WidgetAction) => {
      setInvite(null);
      setDemoBusy(true);
      try {
        if (action.op === 'draw-edge') {
          const key = JSON.stringify(action.args ?? {});
          setDrawing(reduced ? null : key);
          apply(action);
          await pause(650);
          if (!alive.current) return;
          setDrawing(null);
          return;
        }
        apply(action);
        await pause(500);
      } finally {
        if (alive.current) setDemoBusy(false);
      }
    },
    invite: (action) => {
      if (!action) return setInvite(null);
      if (action.op === 'draw-edge' && Array.isArray(action.args?.from)) {
        const [x, y] = action.args.from as Pt;
        setCursor([x, y]);
        return setInvite('dot');
      }
      setInvite(null);
    },
  });

  const used = new Set(state.edges.flatMap(([a, b]) => [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`]));
  const dots: Pt[] = [];
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) dots.push([x, y]);

  return (
    <div className="ni-scomp__grid-mode" data-tool={sticks ? 'sticks' : 'dots'}>
      <fieldset
        ref={board}
        // Focusing the board focuses its keyboard dot (one tab stop for the whole grid).
        tabIndex={-1}
        aria-label={t(sticks ? 'ui.scomp.sticks-board' : 'ui.scomp.dots-board')}
        aria-disabled={!interactive || undefined}
        className="ni-scomp__dots"
        onFocus={(e) => {
          if (e.target !== e.currentTarget) return;
          focusCursor.current = true;
          board.current
            ?.querySelector<HTMLElement>(`[data-dot-target="${cursor[0]},${cursor[1]}"]`)
            ?.focus();
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            focusCursor.current = false;
        }}
        data-tier={tier}
        data-start={start ? start.join(',') : undefined}
        data-cursor={cursor.join(',')}
        style={{ width: W, height: H }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onKeyDown={onKey}
      >
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          {state.edges.map(([a, b], i) => {
            const [x1, y1] = px(a);
            const [x2, y2] = px(b);
            const len = Math.hypot(x2 - x1, y2 - y1);
            const animate = drawing === JSON.stringify({ from: a, to: b });
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: lines in drawing order
                key={i}
                className={sticks ? 'ni-scomp__stick' : 'ni-scomp__line'}
                data-edge={`${a.join(',')}-${b.join(',')}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                style={
                  animate
                    ? {
                        strokeDasharray: len,
                        strokeDashoffset: len,
                        animation: 'ni-scomp-draw 550ms ease-out forwards',
                      }
                    : undefined
                }
              />
            );
          })}
          {dots.map(([x, y]) => {
            const [dx, dy] = px([x, y]);
            const corner = sticks && used.has(`${x},${y}`);
            return (
              <circle
                key={`${x},${y}`}
                className={corner ? 'ni-scomp__corner' : 'ni-scomp__dot'}
                data-dot={`${x},${y}`}
                cx={dx}
                cy={dy}
                r={corner ? 11 : 7}
              />
            );
          })}
          {start ? (
            <circle className="ni-scomp__start" cx={px(start)[0]} cy={px(start)[1]} r={17} />
          ) : null}
        </svg>
        {/* One target per dot: a target-size square on it (pointer presses are read by the
            board; the keyboard moves focus between them). */}
        {dots.map(([x, y]) => {
          const [dx, dy] = px([x, y]);
          const here = x === cursor[0] && y === cursor[1];
          return (
            <button
              key={`t${x},${y}`}
              type="button"
              className={['ni-scomp__dot-target', here && invite === 'dot' ? 'ni-invite' : '']
                .filter(Boolean)
                .join(' ')}
              data-dot-target={`${x},${y}`}
              aria-label={t('ui.scomp.dot', { n: y * cols + x + 1 })}
              aria-pressed={same(start, [x, y])}
              tabIndex={interactive && here ? 0 : -1}
              disabled={!interactive}
              style={{ left: dx - minT / 2, top: dy - minT / 2, width: minT, height: minT }}
              onClick={(e) => e.preventDefault()}
              onFocus={() => {
                focusCursor.current = true;
                if (!here) setCursor([x, y]);
              }}
            />
          );
        })}
      </fieldset>
      <div className="ni-scomp__check">
        {sticks ? (
          <span
            className="ni-scomp__sticks-left"
            role="img"
            aria-label={t('ui.scomp.sticks-left', { n: sticksLeft })}
          >
            <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" focusable="false">
              <rect
                x="6"
                y="20"
                width="36"
                height="8"
                rx="4"
                fill="var(--color-wood)"
                stroke="var(--color-wood-deep)"
                strokeWidth="2"
              />
            </svg>
            <span className="ni-scomp__sticks-n" aria-hidden="true">
              {sticksLeft}
            </span>
          </span>
        ) : null}
        <UndoButton
          label={t('ui.scomp.undo')}
          disabled={!interactive || state.edges.length === 0}
          onPress={undo}
        />
        <CheckButton onPress={submit} disabled={!interactive || !response} />
      </div>
    </div>
  );
}
