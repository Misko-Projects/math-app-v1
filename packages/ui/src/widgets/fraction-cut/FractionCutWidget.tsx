import {
  cutGuides,
  type FormatModel,
  type FractionCutState,
  formatModel,
  type GuidedLine,
  partCount,
  rectAt,
} from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useMemo,
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
import { BigButton } from '../../primitives/BigButton';
import { ArrowIcon, BackIcon, CheckIcon } from '../../primitives/icons';
import { CHECK_DEBOUNCE_MS } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import {
  applyPadKey,
  CheckButton,
  FractionEntry,
  type PadKey,
  padValue,
  rectParts,
  type ShapeFrame,
  sectorParts,
  shapeFrame,
  useAlive,
  useDemoPause,
  useInviteHand,
  useSubmitGuard,
  WholeBase,
  WholeOutline,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import {
  boxOffsets,
  type CutLayout,
  circleShiftPx,
  cutLayout,
  ghostOutline,
  radialSeamHalfWidth,
  radialSeamPath,
  sectorOffsets,
} from './cutLayout';
import './fraction-cut.css';

/**
 * `fraction-cut` (03 §5.5, concrete): cut a whole into parts, then fill some of them.
 *
 * - **Guided cuts:** each guide line (dotted, "cut here") has a knife beside the shape. Tap the
 *   knife (or Enter/Space on it), or swipe across the shape along the line (or drag the knife
 *   across it), and the whole is cut there. Cut parts move a little apart, so every cut shows.
 * - **Free cuts** (`cutMode: 'free'`): swipe anywhere across the shape (through the middle of a
 *   circle for a diameter, from the middle out for a radius); or pick a knife from the tools, then
 *   tap the shape where to cut, or move its dotted line with the arrow keys and press it again.
 *   A grid snaps to its cell lines. With `acceptNonCongruent` a short swipe (or a knife tap) cuts
 *   only the part under it, so equal parts may have different shapes (FRA.14, FRA.16).
 * - **Filling** (when the item asks to shade): tap a part (again to empty it), or drag the fill
 *   drop onto a part, or tap the drop and then a part; the filled parts are counted aloud.
 * - **Taking back:** tap a cut itself (the seam between two parts; Tab to it and press Enter) and
 *   the parts join again there; tap a filled part to empty it. A straight seam is a finger wide
 *   where the parts leave room, and never wider than two fifths of the narrower part beside it;
 *   a radial seam is a wedge from the hub to the rim that takes a tenth of each neighbouring
 *   sector (`radialSeamPath`). Either way a tap clearly inside a part is the part's. The Take back button undoes the last cut, fill or mend,
 *   whatever the size of the parts. With `thenName`, the fraction is typed on stacked boxes;
 *   Check is under them.
 *
 * Every part is drawn from the engine model's geometry (`formatModel('fraction-cut')`), and the
 * response is its `toResponse`: `{ regions, shaded, name? }` for `fraction.cut`.
 *
 * Demo ops: `cut {line}`, `shade {part}`, `separate`, `stack-parts`, plus `answer {values}`.
 */

const OPS = ['cut', 'shade', 'separate', 'stack-parts', 'answer'] as const;
const KEY_MS = 340;
/** Free cuts snap to 1/48 of the whole, and free radii to 7.5° (48 a turn). */
const FREE_STEPS = 48;

type Config = ConfigFor<'fraction-cut'>;
type FreeKnife = 'v' | 'h' | 'r';
type PartId = `part-${number}`;

const model = (): FormatModel<'fraction-cut', FractionCutState> => {
  const m = formatModel('fraction-cut');
  if (!m) throw new Error('fraction-cut has no engine model');
  // The registry stores models type-erased; this one's state is FractionCutState.
  return m as unknown as FormatModel<'fraction-cut', FractionCutState>;
};

function useSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1100, h: 440 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setSize({ w: el.clientWidth || 1100, h: el.clientHeight || 440 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

/** A knife: a blade and a wooden handle, the blade pointing at `angle` (0 = up). */
function KnifeIcon({ angle }: { angle: number }) {
  return (
    <svg viewBox="0 0 48 48" className="ni-fcut__knife-icon" aria-hidden="true" focusable="false">
      <g transform={`rotate(${angle} 24 24)`}>
        <path
          d="M24 3c5 6 6 14 5 22H19c-1-8 0-16 5-22Z"
          fill="var(--color-cloud)"
          stroke="var(--color-ink-soft)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <rect
          x="18.5"
          y="25"
          width="11"
          height="19"
          rx="5"
          fill="var(--color-wood)"
          stroke="var(--color-wood-deep)"
          strokeWidth="2.5"
        />
      </g>
    </svg>
  );
}

/** The fill drop: a sea-deep drop with a solid outline (what a filled part looks like). */
function FillIcon() {
  return (
    <svg viewBox="0 0 48 48" className="ni-fcut__fill-icon" aria-hidden="true" focusable="false">
      <path
        d="M24 4C18 14 11 21 11 29a13 13 0 0 0 26 0c0-8-7-15-13-25Z"
        fill="var(--color-sea-deep)"
        stroke="var(--color-sea-dark)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M18 30a6 6 0 0 0 5 6"
        fill="none"
        stroke="var(--color-cloud)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

/** The dotted path of a guide line, in design units. */
function guidePath(frame: ShapeFrame, g: GuidedLine): string {
  if (frame.kind === 'circle') {
    if (g.kind !== 'radii') return '';
    return g.angles
      .map((a) => {
        const [x, y] = polar(frame.cx, frame.cy, frame.r, a);
        return `M${frame.cx} ${frame.cy}L${x} ${y}`;
      })
      .join('');
  }
  if (g.kind === 'v') {
    const x = frame.x + g.at * frame.w;
    return `M${x} ${frame.y}V${frame.y + frame.h}`;
  }
  if (g.kind === 'h') {
    const y = frame.y + g.at * frame.h;
    return `M${frame.x} ${y}H${frame.x + frame.w}`;
  }
  return '';
}

/** Which way a knife beside the shape points (towards the shape). */
function knifeAngle(frame: ShapeFrame, g: GuidedLine, k: { x: number; y: number }, lay: CutLayout) {
  if (frame.kind === 'circle') {
    const a = g.kind === 'radii' ? (g.angles[0] ?? 0) : 0;
    return a + 180;
  }
  if (g.kind === 'v') return k.y < lay.svgY ? 180 : 0;
  return k.x < lay.svgX ? 90 : 270;
}

export function FractionCutWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, ageMode, textLabels } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const { ref, size } = useSize();

  const [state, setState] = useState<FractionCutState>(() => model().initialState(config));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [history, setHistory] = useState<FractionCutState[]>([]);
  const [texts, setTexts] = useState<[string, string]>(['', '']);
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const [active, setActive] = useState<0 | 1>(0);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoLine, setDemoLine] = useState<number | null>(null);
  const [demoPart, setDemoPart] = useState<number | null>(null);
  const [pressedKey, setPressedKey] = useState<PadKey | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [freeKnife, setFreeKnife] = useState<FreeKnife | null>(null);
  const [preview, setPreview] = useState(0.5);
  const interactive = !disabled && !demoBusy;

  const k = ageMode === 'k';
  const knifePx = k ? 80 : 64;
  const bigPx = k ? 96 : 76;
  const circle = config.shape === 'circle';
  const guided = config.cutMode === 'guided';
  const shading = (config.shade ?? 0) > 0;
  // thenName in a narrow room (the 960 × 600 area): two steps, so every part stays tap-sized.
  // First cut and fill with the whole room; "Name it" then puts the typing pad beside the finished
  // picture (no longer tappable), and Back returns to cutting.
  const twoStep = config.thenName && size.w < 1100;
  const [naming, setNaming] = useState(false);
  const showEntry = config.thenName && (!twoStep || naming);
  /** Cutting and filling are on (always, except the naming step). */
  const editing = !(twoStep && naming);
  const guides = useMemo(() => cutGuides(config), [config]);
  const frame = useMemo(
    () =>
      shapeFrame(
        // A loaf is cut as its counted whole, the box: no crust dome that no piece would cover,
        // so the pieces always make up exactly the shape they came from. It keeps its bread colour.
        config.shape === 'loaf' ? 'rect' : config.shape,
        config.gridSize,
        config.parts > 4 ? 2.6 : 1.5,
      ),
    [config.shape, config.gridSize, config.parts],
  );

  // ---------- layout: the stage gets what the tools leave ----------

  const entryW = showEntry ? Math.round(knifePx * 1.25) + 20 + 4 * knifePx + 36 + 24 : 0;
  const toolsGuess = 2 * bigPx + 12 + entryW;
  // The tools column as drawn (labels show from G1, so measure it); the stage gets the rest.
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const [toolsMeasured, setToolsMeasured] = useState(0);
  useLayoutEffect(() => {
    const el = toolsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setToolsMeasured(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A step change swaps the tools in the same commit: re-measure before paint, so the stage never
  // draws a frame too wide for the room.
  useLayoutEffect(() => {
    const w = toolsRef.current?.getBoundingClientRect().width ?? 0;
    if (w > 0 && Math.abs(w - toolsMeasured) > 0.5) setToolsMeasured(w);
  });
  const toolsW = toolsMeasured > 0 ? toolsMeasured : toolsGuess;
  // Free cuts can make more parts than the item asks for (up to the model's 12), and thin
  // sectors move further apart: the room is planned for the parts on screen, never fewer than
  // the item's, so no part is ever pushed out of the stage.
  const layoutParts = (() => {
    if (guided) return config.parts;
    if (circle) {
      const thinnest = Math.min(360, ...state.sectors.map((p) => p.a1 - p.a0));
      return Math.max(config.parts, state.sectors.length, Math.ceil(360 / thinnest - 1e-9));
    }
    return Math.max(config.parts, state.rects.length);
  })();
  const allCut = guided && guides.length > 0 && state.linesCut.length >= guides.length;
  const lay = useMemo(
    () =>
      cutLayout(
        frame,
        // Once every line is cut no knife is left: the whole takes their room, so the pieces
        // to fill are as big as the area allows.
        guided && editing && !allCut ? guides : [],
        layoutParts,
        { w: Math.max(160, size.w - toolsW - 48), h: Math.max(140, size.h - 24) },
        knifePx,
        2.2,
        shading,
      ),
    [frame, guided, editing, allCut, guides, layoutParts, size.w, size.h, toolsW, knifePx, shading],
  );
  const scale = lay.scale;

  // ---------- state changes ----------

  const commit = (next: FractionCutState) => {
    const prev = stateRef.current;
    if (next === prev) return false;
    setHistory((h) => [...h, prev]);
    stateRef.current = next;
    setState(next);
    return true;
  };
  const apply = (a: WidgetAction) => commit(model().apply(stateRef.current, a));
  /** Views (`separate`, `stack-parts`) go back to normal when the child acts. */
  const settleView = () => {
    const s = stateRef.current;
    if (!s.separated && !s.stacked) return;
    const next = { ...s, separated: false, stacked: false };
    stateRef.current = next;
    setState(next);
  };

  const filledOf = (s: FractionCutState) =>
    (circle ? s.sectors : s.rects).filter((p) => p.shaded).length;
  const parts = circle ? state.sectors : state.rects;

  const fillPart = (i: number, on: boolean) => {
    settleView();
    const done = apply({ op: 'shade', args: on ? { part: i } : { part: i, off: true } });
    // The filled parts are counted aloud, after a fill and after one is emptied.
    if (done && speakOnTap) sayNumber(filledOf(stateRef.current));
    setInvite(null);
  };

  /** Joins the parts again along one cut (the seam the child touched). */
  const mendCut = (args: Record<string, number | string>, id: string) => {
    if (!interactive || !editing) return;
    settleView();
    trace('undo', id);
    if (apply({ op: 'mend', args }) && speakOnTap) say('ui.frac.take-back');
    setInvite(null);
  };

  const cutLine = (line: number) => {
    settleView();
    apply({ op: 'cut', args: { line } });
    setInvite(null);
  };

  const takeBack = () => {
    if (!interactive || history.length === 0) return;
    trace('undo', 'take-back');
    const prev = history[history.length - 1] as FractionCutState;
    setHistory((h) => h.slice(0, -1));
    stateRef.current = prev;
    setState(prev);
  };

  // ---------- fill: tap a part, or drag / tap-to-place the fill drop ----------

  const drag = useDragToTarget<'fill', PartId>({
    onPlace: ({ target }) => fillPart(Number(target.slice(5)), true),
    disabled: !interactive || !shading,
    trace,
  });

  // ---------- free knives ----------

  const freeCut = (kind: FreeKnife, at: number, part?: number) => {
    settleView();
    if (kind === 'r') {
      apply({ op: 'cut', args: { angle: Math.round(at / 7.5) * 7.5 } });
    } else {
      const snapped = Math.round(at * FREE_STEPS) / FREE_STEPS;
      apply({
        op: 'cut',
        args: { dir: kind, at: snapped, ...(part !== undefined ? { part } : {}) },
      });
    }
    setInvite(null);
  };

  const pressFreeKnife = (kind: FreeKnife) => {
    if (!interactive) return;
    trace('tap', `knife-${kind}`);
    if (freeKnife === kind) {
      freeCut(kind, kind === 'r' ? preview * 360 : preview);
      setFreeKnife(null);
      return;
    }
    setFreeKnife(kind);
    setPreview(kind === 'r' ? 0 : 0.5);
  };

  const freeKnifeKeys = (kind: FreeKnife, e: KeyboardEvent) => {
    if (freeKnife !== kind) return;
    const step = (e.shiftKey ? 6 : 1) / FREE_STEPS;
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (dir === 0) {
      if (e.key === 'Escape') setFreeKnife(null);
      return;
    }
    e.preventDefault();
    setPreview((p) => {
      const next = Math.round((p + dir * step) * FREE_STEPS) / FREE_STEPS;
      return kind === 'r'
        ? (next + 1) % 1
        : Math.min(1 - 1 / FREE_STEPS, Math.max(1 / FREE_STEPS, next));
    });
  };

  // ---------- swipes across the shape ----------

  const stageRef = useRef<HTMLFieldSetElement | null>(null);
  const swipe = useRef<{
    id: number;
    x0: number;
    y0: number;
    x: number;
    y: number;
    knife: number | null;
    moved: boolean;
  } | null>(null);
  const swallowClick = useRef(false);

  /** A stage point (client px) in the frame's design units. */
  const toDesign = (cx: number, cy: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    return {
      x: (cx - (r?.left ?? 0) - lay.svgX) / scale,
      y: (cy - (r?.top ?? 0) - lay.svgY) / scale,
    };
  };

  const resolveSwipe = (sw: NonNullable<typeof swipe.current>, tap: boolean) => {
    const a = toDesign(sw.x0, sw.y0);
    const b = toDesign(sw.x, sw.y);
    const s = stateRef.current;
    if (tap) {
      // A tap with a free knife picked up cuts there.
      if (!freeKnife) return false;
      if (frame.kind === 'circle') {
        const ang = (Math.atan2(b.x - frame.cx, -(b.y - frame.cy)) * 180) / Math.PI;
        freeCut('r', (ang + 360) % 360);
      } else {
        const ux = (b.x - frame.x) / frame.w;
        const uy = (b.y - frame.y) / frame.h;
        if (ux <= 0 || ux >= 1 || uy <= 0 || uy >= 1) return false;
        const part = config.acceptNonCongruent ? rectAt(s.rects, ux, uy) : undefined;
        freeCut(
          freeKnife,
          freeKnife === 'v' ? ux : uy,
          part !== undefined && part >= 0 ? part : undefined,
        );
      }
      trace('tap', 'shape');
      setFreeKnife(null);
      return true;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const size = frame.kind === 'circle' ? frame.r * 2 : Math.min(frame.w, frame.h);
    if (len < size * 0.35) return false;
    if (guided) {
      const open = guides.map((g, i) => ({ g, i })).filter(({ i }) => !s.linesCut.includes(i));
      if (sw.knife !== null) {
        if (!open.some((o) => o.i === sw.knife)) return false;
        cutLine(sw.knife);
        return `line-${sw.knife}`;
      }
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let best: { i: number; score: number } | null = null;
      for (const { g, i } of open) {
        let score = Number.POSITIVE_INFINITY;
        if (frame.kind === 'circle' && g.kind === 'radii') {
          const lineAng = (Math.atan2(dx, -dy) * 180) / Math.PI;
          if (g.angles.length === 2) {
            // A diameter: the swipe passes near the centre at the diameter's slope.
            const dist = Math.abs(dx * (frame.cy - a.y) - dy * (frame.cx - a.x)) / len;
            const diff = Math.abs(((((lineAng - (g.angles[0] ?? 0)) % 180) + 270) % 180) - 90);
            if (dist < frame.r * 0.4 && diff < 25) score = diff + dist / 10;
          } else {
            // A radius: from near the centre out towards its angle.
            const far =
              Math.hypot(a.x - frame.cx, a.y - frame.cy) >
              Math.hypot(b.x - frame.cx, b.y - frame.cy)
                ? a
                : b;
            const near = far === a ? b : a;
            const ang = (Math.atan2(far.x - frame.cx, -(far.y - frame.cy)) * 180) / Math.PI;
            const diff = Math.abs(((ang - (g.angles[0] ?? 0) + 540) % 360) - 180);
            if (
              Math.hypot(near.x - frame.cx, near.y - frame.cy) < frame.r * 0.6 &&
              diff < 180 / config.parts
            )
              score = diff;
          }
        } else if (frame.kind === 'box' && g.kind === 'v' && Math.abs(dy) >= Math.abs(dx)) {
          score = Math.abs((mid.x - frame.x) / frame.w - g.at);
          if (score > 0.5 / config.parts) score = Number.POSITIVE_INFINITY;
        } else if (frame.kind === 'box' && g.kind === 'h' && Math.abs(dx) > Math.abs(dy)) {
          score = Math.abs((mid.y - frame.y) / frame.h - g.at);
          if (score > 0.3) score = Number.POSITIVE_INFINITY;
        }
        if (score < (best?.score ?? Number.POSITIVE_INFINITY)) best = { i, score };
      }
      if (!best) return false;
      cutLine(best.i);
      return `line-${best.i}`;
    }
    // Free cuts.
    if (frame.kind === 'circle') {
      const dist = Math.abs(dx * (frame.cy - a.y) - dy * (frame.cx - a.x)) / len;
      const da = Math.hypot(a.x - frame.cx, a.y - frame.cy);
      const db = Math.hypot(b.x - frame.cx, b.y - frame.cy);
      if (dist < frame.r * 0.3 && Math.min(da, db) > frame.r * 0.5) {
        const ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
        settleView();
        apply({
          op: 'cut',
          args: { angle: Math.round(((ang + 360) % 360) / 7.5) * 7.5, through: true },
        });
        return 'cut';
      }
      if (Math.min(da, db) < frame.r * 0.45) {
        const far = da > db ? a : b;
        const ang = (Math.atan2(far.x - frame.cx, -(far.y - frame.cy)) * 180) / Math.PI;
        freeCut('r', (ang + 360) % 360);
        return 'cut';
      }
      return false;
    }
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const ux = (mid.x - frame.x) / frame.w;
    const uy = (mid.y - frame.y) / frame.h;
    if (ux <= 0 || ux >= 1 || uy <= 0 || uy >= 1) return false;
    const short = vertical ? Math.abs(dy) < frame.h * 0.85 : Math.abs(dx) < frame.w * 0.85;
    const part = config.acceptNonCongruent && short ? rectAt(s.rects, ux, uy) : -1;
    freeCut(vertical ? 'v' : 'h', vertical ? ux : uy, part >= 0 ? part : undefined);
    return 'cut';
  };

  const onStagePointerDown = (e: ReactPointerEvent) => {
    if (!interactive || !editing || swipe.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const knifeEl = (e.target as Element).closest('[data-knife]');
    const knife = knifeEl ? Number(knifeEl.getAttribute('data-knife')) : null;
    const sw = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      knife,
      moved: false,
    };
    swipe.current = sw;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== sw.id) return;
      sw.x = ev.clientX;
      sw.y = ev.clientY;
      if (!sw.moved && Math.hypot(sw.x - sw.x0, sw.y - sw.y0) > 12) {
        sw.moved = true;
        trace('drag', knife !== null ? `knife-${knife}` : 'shape');
      }
      if (sw.moved) ev.preventDefault();
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== sw.id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      swipe.current = null;
      if (sw.moved) {
        const result = resolveSwipe(sw, false);
        trace('drop', typeof result === 'string' ? result : 'none');
        swallowClick.current = true;
        setTimeout(() => {
          swallowClick.current = false;
        }, 0);
      } else if (freeKnife && resolveSwipe(sw, true)) {
        swallowClick.current = true;
        setTimeout(() => {
          swallowClick.current = false;
        }, 0);
      }
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== sw.id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      swipe.current = null;
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
  };

  // ---------- answering ----------

  const named = (() => {
    const [a, b] = texts.map(padValue);
    return a === null || b === null || a === undefined || b === undefined ? null : [a, b];
  })();
  const response = (() => {
    if (!config.thenName) return model().toResponse(state);
    if (!named) return null;
    return model().toResponse(model().apply(state, { op: 'answer', args: { values: named } }));
  })();
  const submit = useSubmitGuard(() => {
    if (!interactive || !response) return false;
    onResponse(response);
    return true;
  });
  const typeKey = (key: PadKey) => {
    if (!interactive) return;
    trace('tap', `key-${key}`);
    setInvite(null);
    const next: [string, string] = [...textsRef.current];
    next[active] = applyPadKey(next[active], key, 2);
    textsRef.current = next;
    setTexts(next);
  };

  // ---------- demo mode (03 §6.3) ----------

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        // Cutting and filling happen in the cutting step; typing in the naming step.
        if (twoStep) setNaming(action.op === 'answer');
        if (action.op === 'cut') {
          const line = typeof action.args?.line === 'number' ? action.args.line : null;
          if (line !== null && guides[line] && !reduced) {
            setDemoLine(line);
            await pause(650);
            if (!alive.current) return;
          }
          settleView();
          apply(action);
          setDemoLine(null);
          await pause(250);
        } else if (action.op === 'shade') {
          const part = typeof action.args?.part === 'number' ? action.args.part : null;
          if (part !== null) setDemoPart(part);
          await pause(450);
          if (!alive.current) return;
          settleView();
          if (apply(action) && action.args?.off !== true) sayNumber(filledOf(stateRef.current));
          setDemoPart(null);
          await pause(250);
        } else if (action.op === 'separate' || action.op === 'stack-parts') {
          const s = stateRef.current;
          const next = model().apply(s, action);
          stateRef.current = next;
          setState(next);
          await pause(1100);
        } else if (action.op === 'answer') {
          const values = action.args?.values;
          if (Array.isArray(values)) {
            const cleared: [string, string] = ['', ''];
            textsRef.current = cleared;
            setTexts(cleared);
            for (const [slot, v] of values.slice(0, 2).entries()) {
              setActive(slot === 0 ? 0 : 1);
              let text = '';
              for (const ch of String(v).split('') as PadKey[]) {
                setPressedKey(ch);
                await pause(KEY_MS);
                if (!alive.current) return;
                text += ch;
                const next: [string, string] = [...textsRef.current];
                next[slot === 0 ? 0 : 1] = text;
                textsRef.current = next;
                setTexts(next);
              }
              setPressedKey(null);
            }
          }
        }
      } finally {
        setPressedKey(null);
        setDemoLine(null);
        setDemoPart(null);
        setDemoBusy(false);
      }
    },
    invite: (action) => setInvite(action),
  });

  // ---------- render ----------

  const geoms =
    frame.kind === 'circle' ? sectorParts(frame, state.sectors) : rectParts(frame, state.rects);
  const isCut = partCount(state) > 1;
  const spread = state.separated ? 2.6 : 1;
  const offsets =
    frame.kind === 'circle'
      ? sectorOffsets(
          state.sectors,
          (circleShiftPx(Math.min(...state.sectors.map((p) => p.a1 - p.a0)), lay.gapPx) * spread) /
            scale,
        )
      : boxOffsets(state.rects, (lay.gapPx * spread) / scale);
  // 6 px clear of the outermost pieces, whatever the scale.
  const ghost = ghostOutline(frame, state.stacked ? [] : offsets, 6 / scale);
  const partTransform = (i: number): string | undefined => {
    if (state.stacked && i > 0) {
      if (frame.kind === 'circle') {
        const s0 = state.sectors[0];
        const si = state.sectors[i];
        if (!s0 || !si) return undefined;
        // Rotated onto the first sector, each a little lower: a pile whose top part covers the
        // rest (no see-through), so equal parts read as the same size.
        return `translate(0px, ${i * 4}px) rotate(${s0.a0 - si.a0}deg)`;
      }
      const r0 = state.rects[0];
      const ri = state.rects[i];
      if (!r0 || !ri) return undefined;
      return `translate(${(r0.x0 - ri.x0) * frame.w + i * 3}px, ${(r0.y0 - ri.y0) * frame.h + i * 3}px)`;
    }
    const o = offsets[i];
    return o && (o.dx !== 0 || o.dy !== 0) ? `translate(${o.dx}px, ${o.dy}px)` : undefined;
  };

  // ---------- seams: each cut is a target that takes that cut back ----------

  const seams = (() => {
    const out: {
      id: string;
      args: Record<string, number | string>;
      d: string;
      dx: number;
      dy: number;
      /** Width of the touch band, in CSS px. */
      band: number;
      /** A radial cut: `d` is a filled wedge (see radialSeamPath), not a stroked line. */
      wedge?: boolean;
    }[] = [];
    if (!editing || state.stacked || state.separated) return out;
    if (frame.kind === 'circle' && state.radii.length === 1) {
      // One radius is a slit in a whole circle: it is a cut all the same, and it can be mended.
      const angle = state.radii[0] as number;
      const line = state.linesCut.find((l) => {
        const g = guides[l];
        return (
          g?.kind === 'radii' &&
          g.angles.some((a) => Math.abs((((a % 360) + 360) % 360) - angle) < 1e-6)
        );
      });
      out.push({
        id: line !== undefined ? `cut-line-${line}` : `cut-r-${Math.round(angle * 10) / 10}`,
        args: line !== undefined ? { line } : { angle },
        d: radialSeamPath(frame.cx, frame.cy, frame.r, angle, 180, knifePx / scale),
        dx: 0,
        dy: 0,
        band: knifePx,
        wedge: true,
      });
      return out;
    }
    if (!isCut) return out;
    const add = (seam: (typeof out)[number]) => {
      const same = out.find((o) => o.id === seam.id);
      if (!same) out.push(seam);
      else {
        same.d += seam.d;
        same.band = Math.min(same.band, seam.band);
      }
    };
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    if (frame.kind === 'circle') {
      const n = state.sectors.length;
      state.sectors.forEach((sec, i) => {
        // The radius at this sector's start, between it and the sector before.
        const j = (i + n - 1) % n;
        const before = state.sectors[j];
        if (!before) return;
        const angle = ((sec.a0 % 360) + 360) % 360;
        const line = state.linesCut.find((l) => {
          const g = guides[l];
          return g?.kind === 'radii' && g.angles.some((a) => near(((a % 360) + 360) % 360, angle));
        });
        const narrow = Math.min(sec.a1 - sec.a0, before.a1 - before.a0, 180);
        // The wedge's width at the rim, in CSS px.
        const rimWidth = 2 * radialSeamHalfWidth(frame.r, narrow, knifePx / scale) * scale;
        add({
          id: line !== undefined ? `cut-line-${line}` : `cut-r-${Math.round(angle * 10) / 10}`,
          args: line !== undefined ? { line } : { angle },
          d: radialSeamPath(frame.cx, frame.cy, frame.r, sec.a0, narrow, knifePx / scale),
          dx: ((offsets[i]?.dx ?? 0) + (offsets[j]?.dx ?? 0)) / 2,
          dy: ((offsets[i]?.dy ?? 0) + (offsets[j]?.dy ?? 0)) / 2,
          band: Math.min(knifePx, rimWidth),
          wedge: true,
        });
      });
      return out;
    }
    for (const dir of ['v', 'h'] as const) {
      state.rects.forEach((a, i) => {
        const at = dir === 'v' ? a.x1 : a.y1;
        const j = state.rects.findIndex(
          (b) =>
            near(dir === 'v' ? b.x0 : b.y0, at) &&
            (dir === 'v'
              ? near(b.y0, a.y0) && near(b.y1, a.y1)
              : near(b.x0, a.x0) && near(b.x1, a.x1)),
        );
        const b = state.rects[j];
        if (!b) return;
        const line = state.linesCut.find((l) => {
          const g = guides[l];
          return g !== undefined && g.kind === dir && near(g.at, at);
        });
        const across =
          dir === 'v'
            ? Math.min(a.x1 - a.x0, b.x1 - b.x0) * frame.w
            : Math.min(a.y1 - a.y0, b.y1 - b.y0) * frame.h;
        const d =
          dir === 'v'
            ? `M${frame.x + at * frame.w} ${frame.y + a.y0 * frame.h}V${frame.y + a.y1 * frame.h}`
            : `M${frame.x + a.x0 * frame.w} ${frame.y + at * frame.h}H${frame.x + a.x1 * frame.w}`;
        add({
          id: line !== undefined ? `cut-line-${line}` : `cut-${dir}-${Math.round(at * 1000)}`,
          args: line !== undefined ? { line } : { dir, at },
          d,
          dx: ((offsets[i]?.dx ?? 0) + (offsets[j]?.dx ?? 0)) / 2,
          dy: ((offsets[i]?.dy ?? 0) + (offsets[j]?.dy ?? 0)) / 2,
          band: Math.min(knifePx, across * scale * 0.4),
        });
      });
    }
    return out;
  })();

  const nextLine = guides.findIndex((_, i) => !state.linesCut.includes(i));
  const invitedLine =
    invite?.op === 'cut' && typeof invite.args?.line === 'number' ? invite.args.line : null;
  // One knife at a time: the line Pip invites, else the next line to cut.
  const shownLine =
    invitedLine !== null && !state.linesCut.includes(invitedLine) ? invitedLine : nextLine;
  const invitedPart =
    invite?.op === 'shade' && typeof invite.args?.part === 'number' ? invite.args.part : null;
  const invitedSlot: 0 | 1 | null = invite?.op === 'answer' && showEntry ? active : null;
  // Two steps, still cutting: the answer starts with "Name it".
  const invitedNext = invite?.op === 'answer' && twoStep && !naming;
  // Pip's up-pointing hand under the invited knife, part or box to type into (kit `useInviteHand`).
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    ref,
    (root) => {
      if (invitedLine !== null && guided) {
        return root.querySelector<HTMLElement>(`.ni-fcut__knife[data-knife="${invitedLine}"]`);
      }
      if (invitedPart !== null) {
        // A part is an SVG path; the hand only reads its box.
        return root.querySelector(
          `path.ni-fcut__part[data-part="${invitedPart}"]`,
        ) as HTMLElement | null;
      }
      if (invitedSlot !== null) {
        return root.querySelector<HTMLElement>(`.ni-fentry__box[data-slot="${invitedSlot}"]`);
      }
      if (invitedNext) return root.querySelector<HTMLElement>('.ni-fcut__next');
      return null;
    },
    invitedLine !== null && guided
      ? `line:${invitedLine}`
      : invitedPart !== null
        ? `part:${invitedPart}:${partCount(state)}`
        : invitedSlot !== null
          ? `slot:${invitedSlot}`
          : invitedNext
            ? 'next'
            : '',
  );

  const freePreview = (() => {
    if (!freeKnife) return null;
    if (frame.kind === 'circle') {
      const [x, y] = polar(frame.cx, frame.cy, frame.r, preview * 360);
      return `M${frame.cx} ${frame.cy}L${x} ${y}`;
    }
    if (freeKnife === 'v') {
      const x = frame.x + preview * frame.w;
      return `M${x} ${frame.y}V${frame.y + frame.h}`;
    }
    const y = frame.y + preview * frame.h;
    return `M${frame.x} ${y}H${frame.x + frame.w}`;
  })();

  const filledCount = filledOf(state);
  const stageStyle = { width: lay.width, height: lay.height } as CSSProperties;

  return (
    <div
      ref={ref}
      className="ni-fcut"
      data-shape={config.shape}
      data-cut-mode={config.cutMode}
      data-tier={tier}
      data-parts={partCount(state)}
      data-filled={filledCount}
      data-disabled={disabled ? 'true' : undefined}
      style={handRootStyle}
    >
      <fieldset
        ref={stageRef}
        className="ni-fcut__stage"
        aria-label={t('ui.widget.picture')}
        style={stageStyle}
        onPointerDown={onStagePointerDown}
        data-cut={isCut ? 'true' : undefined}
        data-view={state.stacked ? 'stacked' : state.separated ? 'separated' : undefined}
      >
        <svg
          className="ni-fcut__svg"
          // The circle the parts are cut from, in the drawing's own units (stories measure by it).
          data-circle={frame.kind === 'circle' ? `${frame.cx} ${frame.cy} ${frame.r}` : undefined}
          role="presentation"
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          width={frame.width * scale}
          height={frame.height * scale}
          style={{ left: lay.svgX, top: lay.svgY }}
        >
          {isCut ? (
            // The whole's outline goes round every piece where it now sits.
            ghost.kind === 'circle' ? (
              <circle className="ni-fraction__ghost" cx={ghost.cx} cy={ghost.cy} r={ghost.r} />
            ) : (
              <rect
                className="ni-fraction__ghost"
                x={ghost.x}
                y={ghost.y}
                width={ghost.width}
                height={ghost.height}
                rx={10}
              />
            )
          ) : (
            <WholeBase frame={frame} />
          )}
          <g className="ni-fraction__parts">
            {geoms.map((g, i) => {
              const lit = parts[i]?.shaded ?? false;
              const id: PartId = `part-${i}`;
              const target =
                shading && isCut && editing
                  ? drag.targetProps(id, { label: t('ui.frac.part', { n: i + 1 }) })
                  : null;
              const invited = invitedPart === i || demoPart === i;
              return (
                <g
                  // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional (reading order)
                  key={i}
                  className="ni-fcut__part-group"
                  style={{
                    transform: partTransform(i),
                    transformOrigin:
                      frame.kind === 'circle' ? `${frame.cx}px ${frame.cy}px` : undefined,
                  }}
                >
                  <path
                    d={g.d}
                    data-part={i}
                    data-fraction={lit ? 'filled' : 'empty'}
                    data-invite={invited ? 'true' : undefined}
                    {...(target
                      ? {
                          ...target,
                          className: `ni-fraction__part ni-fcut__part ${target.className}`,
                          'aria-disabled': interactive ? undefined : true,
                          'aria-pressed': lit,
                          tabIndex: interactive ? 0 : -1,
                          onClick: (e) => {
                            if (swallowClick.current) return;
                            if (drag.selected !== null) {
                              target.onClick(e);
                              return;
                            }
                            if (!interactive) return;
                            // Emptying a filled part is an undo.
                            trace(lit ? 'undo' : 'tap', id);
                            fillPart(i, !lit);
                          },
                          onKeyDown: (e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && drag.selected === null) {
                              e.preventDefault();
                              if (!interactive || e.repeat) return;
                              trace(lit ? 'undo' : 'tap', id);
                              fillPart(i, !lit);
                              return;
                            }
                            target.onKeyDown(e);
                          },
                        }
                      : { className: 'ni-fraction__part ni-fcut__part' })}
                  />
                </g>
              );
            })}
          </g>
          {frame.kind === 'circle' && state.radii.length === 1 ? (
            // One radius is a slit in a whole circle: drawn as the cut it is, so the child sees
            // where the knife went (and where to touch to take it back).
            <path
              className="ni-fcut__slit"
              d={(() => {
                const [x, y] = polar(frame.cx, frame.cy, frame.r, state.radii[0] as number);
                return `M${frame.cx} ${frame.cy}L${x} ${y}`;
              })()}
            />
          ) : null}
          {seams.length > 0 ? (
            <g
              className="ni-fcut__seams"
              // With the fill drop picked up, a tap is for the part under it.
              data-off={drag.selected !== null || freeKnife !== null ? 'true' : undefined}
            >
              {seams.map((seam, i) => (
                // biome-ignore lint/a11y/useSemanticElements: an SVG seam cannot be a <button>
                <path
                  key={seam.id}
                  className={seam.wedge ? 'ni-fcut__seam ni-fcut__seam--wedge' : 'ni-fcut__seam'}
                  d={seam.d}
                  data-seam={seam.id}
                  data-band={Math.round(seam.band)}
                  role="button"
                  tabIndex={interactive ? 0 : -1}
                  aria-label={`${t('ui.frac.take-back')} ${i + 1}`}
                  aria-disabled={interactive ? undefined : true}
                  strokeWidth={seam.wedge ? 0 : seam.band / scale}
                  style={{ transform: `translate(${seam.dx}px, ${seam.dy}px)` }}
                  onClick={() => {
                    if (swallowClick.current) return;
                    mendCut(seam.args, seam.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (!e.repeat) mendCut(seam.args, seam.id);
                  }}
                />
              ))}
            </g>
          ) : null}
          {guided ? (
            <g className="ni-fcut__guides">
              {guides.map((g, i) =>
                state.linesCut.includes(i) ? null : (
                  <path
                    // biome-ignore lint/suspicious/noArrayIndexKey: guide lines are numbered
                    key={i}
                    className="ni-fcut__guide"
                    d={guidePath(frame, g)}
                    data-line={i}
                  />
                ),
              )}
            </g>
          ) : null}
          {demoLine !== null && guides[demoLine] ? (
            <path className="ni-fcut__blade" d={guidePath(frame, guides[demoLine] as GuidedLine)} />
          ) : null}
          {freePreview ? <path className="ni-fcut__preview" d={freePreview} /> : null}
          {isCut ? null : <WholeOutline frame={frame} />}
        </svg>
        {guided && editing
          ? lay.knives.map((spot) => {
              const g = guides[spot.line] as GuidedLine;
              if (state.linesCut.includes(spot.line)) return null;
              // One knife at a time when they would crowd: the next line to cut.
              if (lay.single && spot.line !== shownLine) return null;
              return (
                <button
                  key={spot.line}
                  type="button"
                  className={['ni-fcut__knife', invitedLine === spot.line ? 'ni-invite' : '']
                    .filter(Boolean)
                    .join(' ')}
                  data-knife={spot.line}
                  style={{ left: spot.x - knifePx / 2, top: spot.y - knifePx / 2 }}
                  aria-label={t('ui.frac.cut-line', { n: spot.line + 1 })}
                  disabled={!interactive}
                  onClick={() => {
                    if (swallowClick.current || !interactive) return;
                    trace('tap', `knife-${spot.line}`);
                    cutLine(spot.line);
                  }}
                >
                  <KnifeIcon angle={knifeAngle(frame, g, spot, lay)} />
                </button>
              );
            })
          : null}
      </fieldset>
      <div
        ref={toolsRef}
        className="ni-fcut__tools"
        data-then-name={config.thenName ? 'true' : undefined}
        data-labels={textLabels ? 'true' : undefined}
      >
        <div className="ni-fcut__toolgrid">
          {shading && editing ? (
            <span className="ni-fcut__slot">
              <button
                type="button"
                {...drag.itemProps('fill', { label: t('ui.frac.fill'), disabled: !isCut })}
                className={`ni-draggable ni-fcut__fill${drag.selected === 'fill' ? ' ni-fcut__fill--picked' : ''}`}
                disabled={!interactive || !isCut}
              >
                <FillIcon />
              </button>
            </span>
          ) : null}
          {guided || !editing
            ? null
            : (circle ? (['r'] as const) : (['v', 'h'] as const)).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="ni-fcut__knife ni-fcut__knife--free"
                  data-free-knife={kind}
                  aria-pressed={freeKnife === kind}
                  aria-label={t(kind === 'h' ? 'ui.frac.cut-side' : 'ui.frac.cut-down')}
                  disabled={!interactive}
                  onClick={() => pressFreeKnife(kind)}
                  onKeyDown={(e) => freeKnifeKeys(kind, e)}
                >
                  <KnifeIcon angle={kind === 'h' ? 90 : 180} />
                </button>
              ))}
          {editing ? (
            <BigButton
              label="ui.frac.take-back"
              icon={<BackIcon />}
              tone="cloud"
              onPress={takeBack}
              disabled={!interactive || history.length === 0}
              className="ni-fcut__back"
              // Beside the typing pad there is no room for words: the icon, with its spoken name.
              showLabel={showEntry || twoStep ? false : undefined}
            />
          ) : (
            // The naming step: back to cutting and filling.
            <BigButton
              label="ui.button.back"
              icon={<BackIcon />}
              tone="cloud"
              onPress={() => {
                if (!interactive) return;
                trace('tap', 'back-to-cut');
                setNaming(false);
              }}
              disabled={!interactive}
              className="ni-fcut__back"
              showLabel={false}
            />
          )}
          {twoStep && editing ? (
            // The cutting step: on to naming once the whole is cut.
            <BigButton
              label="ui.frac.name-it"
              icon={<ArrowIcon />}
              tone="sun"
              onPress={() => {
                if (!interactive || !isCut) return;
                trace('tap', 'name-it');
                setInvite(null);
                setNaming(true);
              }}
              disabled={!interactive || !isCut}
              className={invitedNext ? 'ni-fcut__next ni-invite' : 'ni-fcut__next'}
              // Icon-only in the narrow room (its spoken name stays "Name it"): the parts keep their room.
              showLabel={false}
            />
          ) : null}
          {config.thenName ? null : (
            <CheckButton onPress={submit} disabled={!interactive || response === null} />
          )}
        </div>
        {showEntry ? (
          <FractionEntry
            texts={texts}
            active={active}
            onActivate={(slot) => {
              if (!interactive) return;
              trace('tap', slot === 0 ? 'top' : 'bottom');
              setActive(slot);
            }}
            onKey={typeKey}
            onEnter={submit}
            disabled={!interactive}
            pressedKey={pressedKey}
            invitedSlot={invitedSlot}
            below={
              twoStep ? (
                // Icon-only (its spoken name stays "Check"): the pad and the shape keep their room.
                <BigButton
                  label="ui.btn.check"
                  icon={<CheckIcon />}
                  tone="sun"
                  debounceMs={CHECK_DEBOUNCE_MS}
                  disabled={!interactive || response === null}
                  onPress={submit}
                  showLabel={false}
                />
              ) : (
                <CheckButton onPress={submit} disabled={!interactive || response === null} />
              )
            }
          />
        ) : null}
      </div>
      {inviteHand}
    </div>
  );
}

export default FractionCutWidget;
