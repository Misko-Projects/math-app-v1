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
 * corner, or use the column and row steppers (arrow keys on the board; tapping a square works
 * when squares are target-size), and Check answers `{ w, h }` (`rect.perimeterArea`).
 * - The grid is WIDE on purpose: rect.perimeterArea takes a turned rectangle as the same one, so
 *   every accepted rectangle is built lying down (area 12: a 12 × 3 grid; 1 × 12 is built as
 *   12 × 1). Columns are the longest side any accepted rectangle needs, rows the longest short side.
 * - The target says what to make in words ("Make 12 squares inside", "Make it 20 all the way
 *   around") over the rectangle to compare with, drawn lying down at the grid's square size; the
 *   child's own rectangle shows its squares and fence apart from the target.
 * - The corner grip is a visible, target-size ring with arrows; side numbers sit 12 px clear of
 *   the board's frame. In the fence modes every side's number sits outside the fence beside its
 *   own side, never on a side line, 12 px from the others.
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
  const { speakOnTap, ageMode, tapOnly } = useUiPreferences();
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
  // Short areas (up to the 1280 × 800 tablet) put the fence beside a tall 3 × 4 pad; taller
  // ones put a wide 6 × 2 pad under it.
  const beside = !design && avail !== null && avail.height < 460;
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
  // Room around the fence for the side numbers, which sit outside each side (evidence review):
  // the widest bubble's half plus its 8 px offset and a margin.
  const labelText = (i: number) => {
    const known = config.polygon.sides[i];
    return known === null || known === undefined ? '?' : String(known);
  };
  const bubbleSize = (i: number): Pt => [
    Math.max(minT, LABEL_EDGE + LABEL_DIGIT * labelText(i).length),
    minT,
  ];
  const pad =
    Math.max(minT / 2, ...config.polygon.sides.map((_, i) => bubbleSize(i)[0] / 2)) + 8 + 12;
  const sizes = config.polygon.sides.map((_, i) => bubbleSize(i));
  // The scale: the fence and every side number (placed outside it) fit the box. Bubbles that had
  // to move further out grow the picture, so shrink the scale until it all fits.
  const fence = (() => {
    let scale = Math.max(
      8,
      Math.min(70, (boxW - 2 * pad) / Math.max(fw, 1), (boxH - 2 * pad) / Math.max(fh, 1)),
    );
    let out = { u: scale, centres: [] as Pt[], minX: 0, minY: 0, w: 0, h: 0 };
    for (let k = 0; k < 8; k += 1) {
      const at = (p: Pt): Pt => [pad + p[0] * scale, pad + p[1] * scale];
      const centres = points ? placeSideLabels(points.map(at), sizes) : [];
      const boxes = centres.map((c, i) => boxAt(c, sizes[i] as Pt));
      const minX = Math.min(0, ...boxes.map((b) => b.l - 2));
      const minY = Math.min(0, ...boxes.map((b) => b.t - 2));
      const maxX = Math.max(fw * scale + 2 * pad, ...boxes.map((b) => b.r + 2));
      const maxY = Math.max(fh * scale + 2 * pad, ...boxes.map((b) => b.b + 2));
      out = { u: scale, centres, minX, minY, w: maxX - minX, h: maxY - minY };
      if ((out.w <= boxW + 0.5 && out.h <= boxH + 0.5) || scale <= 8) break;
      scale = Math.max(8, scale * Math.min(boxW / out.w, boxH / out.h) * 0.97);
    }
    return out;
  })();
  const u = fence.u;
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
  // The grid is laid out wide (review CR-1.3 follow-up). rect.perimeterArea takes a turned
  // rectangle as the same one, so every accepted rectangle can be built lying down: columns for
  // the longest side any of them needs, rows for the longest short side (area 12: 12 × 3). The
  // rectangle to compare with is drawn lying down too, at the grid's own square size.
  const longSide = (r: { w: number; h: number }) => Math.max(r.w, r.h);
  const shortSide = (r: { w: number; h: number }) => Math.min(r.w, r.h);
  const refRect = ref
    ? { w: longSide({ w: ref[0], h: ref[1] }), h: shortSide({ w: ref[0], h: ref[1] }) }
    : null;
  const gridCols = Math.max(4, refRect?.w ?? 0, ...options.map(longSide));
  const gridRows = Math.max(3, refRect?.h ?? 0, ...options.map(shortSide));
  // Room for the rectangle's side numbers above and left of the board (34 px numerals, ≈ 24 px a
  // digit, 12 px clear of the board's border) and the board's border.
  const DIM_CLEAR = 12;
  const DIM_TOP = 36 + DIM_CLEAR;
  const DIM_LEFT = 24 * String(gridRows).length + DIM_CLEAR;
  const BORDER = 6;
  // The grip sits OUTSIDE the rectangle, right of its bottom-right corner (GRIP_GAP away, joined
  // by a short connector), so it covers no built square (evidence review). The board keeps room
  // for it on the right (the whole grip) and below (half of it).
  const GRIP_GAP = 8;
  const GRIP_RIGHT = GRIP_GAP + minT - BORDER / 2 + 2;
  const GRIP_BELOW = minT / 2 - BORDER / 2 + 2;
  // The ref's "6 × 2" caption under it, and the gap between the side column and the board.
  const CAPTION = 34;
  const GAP = 24;
  // The side column: the target badge ("Make 12 squares inside", up to two lines) over the ref.
  // A target line is 66 px tall (two lines of words beside its icon); lines are 8 px apart.
  const TARGET_W = 240;
  const targets = (config.area !== undefined ? 1 : 0) + (config.perimeter !== undefined ? 1 : 0);
  const TARGET_H = 66 * targets + 8 * Math.max(0, targets - 1);
  const refH = refRect ? refRect.h : 0;
  // Under the target: a 12 px gap, then the ref's frame (3 px border, 4 + 6 px padding), its picture
  // (4 px margin each side), a 4 px gap and its caption row ("≠", size, "Not this one").
  const REF_FRAME = 6 + 12;
  const refExtra = refRect ? 12 + 6 + 10 + 8 + 4 + CAPTION : 0;
  // Capped: a stage that grows with its content must not grow the grid (the squares would change
  // size under a dragging finger).
  const designW = Math.min((avail?.width ?? 1100) - 40, 1200);
  const designH = Math.min((avail?.height ?? 640) - (minT + 40), 420);
  const boardX = DIM_LEFT + BORDER + GRIP_RIGHT;
  const boardY = DIM_TOP + BORDER + GRIP_BELOW;
  // The side column beside the board, or above it: whichever gives the larger squares.
  const besideCell = Math.min(
    (designW - boardX - GAP - TARGET_W) / gridCols,
    refRect
      ? (designW - boardX - GAP - 8 - REF_FRAME) / (gridCols + refRect.w)
      : Number.POSITIVE_INFINITY,
    (designH - boardY) / gridRows,
    refRect ? (designH - TARGET_H - refExtra) / refH : Number.POSITIVE_INFINITY,
  );
  const stackedCell = Math.min(
    (designW - boardX) / gridCols,
    refRect ? (designW - 8 - REF_FRAME) / refRect.w : Number.POSITIVE_INFINITY,
    (designH - TARGET_H - refExtra - GAP - boardY) / (gridRows + refH),
  );
  const refAbove = stackedCell > besideCell;
  const cell = Math.floor(Math.max(14, Math.min(72, Math.max(besideCell, stackedCell))));
  // A tap picks a square only when squares are full-size targets (06 §3); otherwise the steppers
  // are the tap path (and dragging the corner still works).
  const tapCells = cell >= minT;
  const size = state.size;
  const setSize = (w: number, h: number, via: 'drag' | 'tap' | 'move') => {
    const nw = Math.min(gridCols, Math.max(1, w));
    const nh = Math.min(gridRows, Math.max(1, h));
    trace(via === 'drag' ? 'drop' : via, `cell-${nw}-${nh}`);
    apply({ op: 'answer', args: { values: [nw, nh] } });
  };
  const stepBy = (dw: number, dh: number, target: string) => {
    if (!interactive) return;
    setInvite(null);
    trace('tap', target);
    const nw = Math.min(gridCols, Math.max(1, (size?.w ?? 0) + dw));
    const nh = Math.min(gridRows, Math.max(1, (size?.h ?? 0) + dh));
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
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      const first = !moved;
      moved = true;
      // Tap-only mode (06 §7): no drags; the corner only moves on a tap.
      if (tapOnly) return;
      const c = cellAt(ev.clientX, ev.clientY);
      if (!c) return;
      if (first) trace('drag', 'corner');
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
      if (moved && tapOnly) return;
      // A tap on squares smaller than a target does nothing: the steppers set the size.
      if (!moved && !tapCells) return;
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
      // Design: invite the first step, one more column (a real control; evidence review).
      setInvite(action.op === 'answer' ? (design ? 'step' : 'entry') : null);
    },
  });

  // Pip's hand under the invited side number, grid or answer box (kit useInviteHand).
  const { hand, rootStyle: handStyle } = useInviteHand(
    root,
    (r) => {
      if (!invite) return null;
      if (invite.startsWith('side-'))
        return r.querySelector<HTMLElement>(`[data-label-side="${invite.slice(5)}"]`);
      if (invite === 'step')
        return r.querySelector<HTMLElement>('.ni-pwalk__step[data-step="w-more"]');
      return r.querySelector<HTMLElement>('.ni-entry__box');
    },
    invite ?? '',
  );

  // ---------- design: the target, and what the child has built ----------
  // The target, in words (evidence review: a bare "12" beside a 1 × 3 was confusing): "Make 12
  // squares inside" and/or "Make it 20 all the way around", each with its icon.
  const targetLine = (kind: 'area' | 'perimeter', n: number) => (
    <span
      className="ni-pwalk__target-line"
      data-target={kind}
      role="img"
      aria-label={t(kind === 'area' ? 'ui.pwalk.target-area' : 'ui.pwalk.target-around', { n })}
    >
      {kind === 'area' ? <SquaresIcon /> : <FenceIcon />}
      <span aria-hidden="true" className="ni-pwalk__target-words">
        {t('ui.pwalk.make')} <span className="ni-pwalk__target-n">{n}</span>{' '}
        {t(kind === 'area' ? 'ui.pwalk.squares-inside' : 'ui.pwalk.all-around')}
      </span>
    </span>
  );
  const targetBadge = design ? (
    <div className="ni-pwalk__target">
      {config.area !== undefined ? targetLine('area', config.area) : null}
      {config.perimeter !== undefined ? targetLine('perimeter', config.perimeter) : null}
    </div>
  ) : null;
  // What the child's rectangle has now, apart from the target: its squares and its fence.
  const builtArea = state.size ? state.size.w * state.size.h : null;
  const builtAround = state.size ? 2 * (state.size.w + state.size.h) : null;
  const readout = design ? (
    <span
      className="ni-pwalk__yours"
      role="img"
      data-area={builtArea ?? undefined}
      data-around={builtAround ?? undefined}
      aria-label={
        builtArea === null
          ? t('ui.pwalk.build')
          : t('ui.pwalk.yours', { area: builtArea, around: builtAround ?? 0 })
      }
    >
      <SquaresIcon />
      <span className="ni-pwalk__yours-n" aria-hidden="true">
        {builtArea ?? '?'}
      </span>
      <FenceIcon />
      <span className="ni-pwalk__yours-n" aria-hidden="true">
        {builtAround ?? '?'}
      </span>
    </span>
  ) : null;

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
    // Every side's number outside the fence beside its own side, never over a side line, 12 px
    // from the others (evidence review: the "?" covered its side in the L's notch).
    const centres = fence.centres;
    picture = (
      <div className="ni-pwalk__fence" style={{ width: fence.w, height: fence.h }}>
        <div
          className="ni-pwalk__fence-inner"
          style={{ left: -fence.minX, top: -fence.minY, width: svgW, height: svgH }}
        >
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
          {points.map((_, i) => {
            const label = labelText(i);
            const c = centres[i] as Pt;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: one label per side
                key={`l${i}`}
                className="ni-pwalk__label-slot"
                style={{ left: c[0], top: c[1] }}
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
                  style={{ minWidth: bubbleSize(i)[0] }}
                >
                  {/* A glyph Pip's hand keeps clear of (kit useInviteHand). */}
                  <span className="ni-btn__label">{label}</span>
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
      </div>
    );
  } else if (design) {
    const w = size?.w ?? 0;
    const h = size?.h ?? 0;
    // The grip: a round, target-size handle just outside the rectangle's bottom-right corner, on
    // its bottom edge line, with a connector to the corner. It never covers a built square.
    const gripX = w * cell + GRIP_GAP;
    const gripY = Math.max(-3, h * cell - minT / 2);
    picture = (
      <div className="ni-pwalk__design" data-ref-above={refAbove ? 'true' : undefined}>
        <div className="ni-pwalk__side-col" style={{ minWidth: TARGET_W }}>
          {targetBadge}
          {refRect ? (
            <div className="ni-pwalk__ref" aria-label={t('ui.pwalk.compare')} role="img">
              <svg
                width={refRect.w * cell + 8}
                height={refRect.h * cell + 8}
                data-cell={cell}
                aria-hidden="true"
                focusable="false"
              >
                <rect
                  className="ni-pwalk__ref-rect"
                  x={4}
                  y={4}
                  width={refRect.w * cell}
                  height={refRect.h * cell}
                />
                {/* Its squares, the same size as the board's, so they can be counted. */}
                <g className="ni-pwalk__ref-squares">
                  {Array.from({ length: refRect.w - 1 }, (_, i) => (i + 1) * cell + 4).map((x) => (
                    <line key={`v${x}`} x1={x} x2={x} y1={4} y2={4 + refRect.h * cell} />
                  ))}
                  {Array.from({ length: refRect.h - 1 }, (_, i) => (i + 1) * cell + 4).map((y) => (
                    <line key={`h${y}`} x1={4} x2={4 + refRect.w * cell} y1={y} y2={y} />
                  ))}
                </g>
              </svg>
              {/* What this one is for (evidence review: it read as the target): a "≠" badge, its
                  size and "Not this one", under the picture, never on its squares. */}
              <span className="ni-pwalk__ref-caption" aria-hidden="true">
                <NotEqualIcon />
                <span className="ni-pwalk__dims">
                  {refRect.w} × {refRect.h}
                </span>
                <span className="ni-pwalk__not">{t('ui.pwalk.not-this')}</span>
              </span>
            </div>
          ) : null}
        </div>
        <div
          ref={grid}
          className={['ni-pwalk__grid-board'].filter(Boolean).join(' ')}
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
            margin: `${DIM_TOP}px ${GRIP_RIGHT}px ${GRIP_BELOW}px ${DIM_LEFT}px`,
            // Border-box: the squares fill the inside of the 3 px border.
            width: gridCols * cell + BORDER,
            height: gridRows * cell + BORDER,
            backgroundSize: `${cell}px ${cell}px`,
          }}
          onPointerDown={onGridDown}
          onKeyDown={onGridKey}
        >
          {size ? (
            <>
              <span
                className="ni-pwalk__grip-link"
                aria-hidden="true"
                style={{ left: w * cell, top: h * cell - 2, width: GRIP_GAP + 4 }}
              />
              <span
                className="ni-pwalk__corner"
                aria-hidden="true"
                style={{ left: gripX, top: gripY, width: minT, height: minT }}
              >
                <GripIcon />
              </span>
            </>
          ) : null}
          {size ? (
            <span className="ni-pwalk__rect" style={{ width: w * cell, height: h * cell }}>
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
        {!beside && !design && (sign || areaSign) ? (
          <div className="ni-pwalk__signs">
            {sign}
            {areaSign}
          </div>
        ) : null}
      </div>
      <div className="ni-pwalk__answer">
        {design ? (
          <>
            {readout}
            <Stepper
              dim="w"
              less={t('ui.pwalk.col-less')}
              more={t('ui.pwalk.col-more')}
              value={size?.w ?? 0}
              max={gridCols}
              disabled={!interactive}
              invited={invite === 'step'}
              onStep={(d) => stepBy(d, 0, d > 0 ? 'col-more' : 'col-less')}
            />
            <Stepper
              dim="h"
              less={t('ui.pwalk.row-less')}
              more={t('ui.pwalk.row-more')}
              value={size?.h ?? 0}
              max={gridRows}
              disabled={!interactive}
              onStep={(d) => stepBy(0, d, d > 0 ? 'row-more' : 'row-less')}
            />
          </>
        ) : (
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

/** A side-number bubble: border and padding (px), and one 38 px digit's width. */
const LABEL_EDGE = 26;
const LABEL_DIGIT = 24;
/** Bubbles keep this far from each other and from every side line (px). */
const LABEL_GAP = 12;

type Box = { l: number; t: number; r: number; b: number };
const boxAt = (c: Pt, s: Pt): Box => ({
  l: c[0] - s[0] / 2,
  t: c[1] - s[1] / 2,
  r: c[0] + s[0] / 2,
  b: c[1] + s[1] / 2,
});
const gapOf = (a: Box, b: Box) => Math.max(b.l - a.r, a.l - b.r, b.t - a.b, a.t - b.b);

function insidePolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i] as Pt;
    const b = poly[j] as Pt;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

/** Distance from a box to a segment (0 when they touch or cross). */
function segmentToBox(a: Pt, b: Pt, box: Box): number {
  let best = Number.POSITIVE_INFINITY;
  for (let k = 0; k <= 40; k += 1) {
    const x = a[0] + ((b[0] - a[0]) * k) / 40;
    const y = a[1] + ((b[1] - a[1]) * k) / 40;
    const dx = Math.max(box.l - x, 0, x - box.r);
    const dy = Math.max(box.t - y, 0, y - box.b);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/**
 * Where each side's number goes (centres, px): outside the polygon beside the middle of its own
 * side, along the side's outward normal; bubbles closer than 12 px slide along their own sides
 * (away from each other, never past the side's ends), and any bubble nearer than 8 px to a side
 * line is pushed further out.
 */
export function placeSideLabels(poly: readonly Pt[], sizes: readonly Pt[]): Pt[] {
  const n = poly.length;
  const sides = poly.map((a, i) => {
    const b = poly[(i + 1) % n] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let nrm: Pt = [-d[1], d[0]];
    if (insidePolygon([mid[0] + nrm[0] * 2, mid[1] + nrm[1] * 2], poly)) nrm = [d[1], -d[0]];
    return { a, b, len, d, mid, nrm };
  });
  const along = sides.map(() => 0);
  const out = sides.map((s, i) => {
    const sz = sizes[i] as Pt;
    return Math.abs(s.nrm[0]) * (sz[0] / 2) + Math.abs(s.nrm[1]) * (sz[1] / 2) + 8;
  });
  const centre = (i: number): Pt => {
    const s = sides[i] as (typeof sides)[number];
    return [
      s.mid[0] + s.d[0] * (along[i] as number) + s.nrm[0] * (out[i] as number),
      s.mid[1] + s.d[1] * (along[i] as number) + s.nrm[1] * (out[i] as number),
    ];
  };
  const box = (i: number) => boxAt(centre(i), sizes[i] as Pt);
  // How far a bubble may slide along its side: to the side's end, or a little past it for a side
  // shorter than the bubble (it stays beside that side, never beside another).
  const slide = (k: number) => {
    const s = sides[k] as (typeof sides)[number];
    const sz = sizes[k] as Pt;
    const across = Math.abs(s.d[0]) * sz[0] + Math.abs(s.d[1]) * sz[1];
    return Math.max(s.len / 2, across / 2);
  };
  for (let round = 0; round < 60; round += 1) {
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const g = gapOf(box(i), box(j));
        if (g >= LABEL_GAP) continue;
        moved = true;
        const step = (LABEL_GAP - g) / 2 + 1;
        for (const [k, other] of [
          [i, j],
          [j, i],
        ] as const) {
          const s = sides[k] as (typeof sides)[number];
          const ck = centre(k);
          const co = centre(other);
          const along_ = (ck[0] - co[0]) * s.d[0] + (ck[1] - co[1]) * s.d[1];
          const away = (ck[0] - co[0]) * s.nrm[0] + (ck[1] - co[1]) * s.nrm[1];
          const sign = Math.sign(along_) || 1;
          const next = (along[k] as number) + sign * step;
          if (Math.abs(next) <= slide(k)) along[k] = next;
          // At the end of its side: move out along the normal only if that takes it away from
          // the other bubble (two bubbles facing the same way would only travel together).
          else if (away > 0) out[k] = (out[k] as number) + step;
        }
      }
    }
    for (let i = 0; i < n; i += 1) {
      while (sides.some((s) => segmentToBox(s.a, s.b, box(i)) < 8) && (out[i] as number) < 400) {
        out[i] = (out[i] as number) + 4;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return sides.map((_, i) => centre(i));
}

/** One fewer / one more column (or row): two target-size buttons either side of an arrow. */
function Stepper({
  dim,
  less,
  more,
  value,
  max,
  disabled,
  invited = false,
  onStep,
}: {
  dim: 'w' | 'h';
  less: string;
  more: string;
  value: number;
  max: number;
  disabled: boolean;
  /** The demo invites "one more" (the design's first step). */
  invited?: boolean;
  onStep: (d: 1 | -1) => void;
}) {
  return (
    <div className="ni-pwalk__stepper" data-dim={dim}>
      <button
        type="button"
        className="ni-pwalk__step"
        data-step={`${dim}-less`}
        aria-label={less}
        disabled={disabled || value <= 1}
        onClick={() => onStep(-1)}
      >
        <span className="ni-btn__label">−</span>
      </button>
      <svg
        className="ni-pwalk__step-arrow"
        viewBox="0 0 48 48"
        width="40"
        height="40"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M6 24h36M14 14L4 24l10 10M34 14l10 10-10 10"
          transform={dim === 'h' ? 'rotate(90 24 24)' : undefined}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <button
        type="button"
        className={['ni-pwalk__step', invited ? 'ni-invite' : ''].filter(Boolean).join(' ')}
        data-step={`${dim}-more`}
        aria-label={more}
        disabled={disabled || value >= max}
        onClick={() => onStep(1)}
      >
        <span className="ni-btn__label">+</span>
      </button>
    </div>
  );
}

/** "Not this one": a coral disc with a "≠". */
function NotEqualIcon() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="var(--color-coral)"
        stroke="var(--color-ink)"
        strokeWidth="2.5"
      />
      <path
        d="M9 13h14M9 19h14M20 8 12 24"
        stroke="var(--color-paper)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The corner grip: a see-through ring with four arrows (drag me any way). */
function GripIcon() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false">
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="rgb(255 255 255 / 0.35)"
        stroke="var(--color-ink)"
        strokeWidth="5"
      />
      <g fill="var(--color-ink)">
        <path d="M32 8l7 9h-14z" />
        <path d="M32 56l7-9h-14z" />
        <path d="M8 32l9-7v14z" />
        <path d="M56 32l-9-7v14z" />
      </g>
      <circle
        cx="32"
        cy="32"
        r="6"
        fill="var(--color-sunshine)"
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
    </svg>
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
