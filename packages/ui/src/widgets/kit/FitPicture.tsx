import type { StimulusSpec } from '@number-island/shared';
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useNarrationText } from '../../preferences/UiProvider';
import { dotsLayout, type ObjectLayout, objectSetLayout, type PlacedObject } from './layout';
import { NumberLineView } from './NumberLineView';
import { ObjectSetView } from './ObjectSetView';
import { StimulusView } from './StimulusView';
import './kit.css';

/**
 * A `StimulusSpec` drawn to fit a box the widget measured (06 §1: container-relative layout), for
 * pictures on cards and compare sides. Countable pictures (objects, dots, ten-frames, groups,
 * arrays) re-flow their cell size; fixed-pixel pictures (number lines, base-ten blocks,
 * expressions, kinds a later issue draws) are drawn at their own size and scaled down as a whole
 * to fit, never stretched (a number line gets the width it can use first, so its ticks stay even).
 */

/** The cell a countable picture is designed around, for its natural (unscaled) size. */
const NATURAL_CELL = 56;
/** Largest cell a picture grows to (the ObjectSetView clamp). */
const MAX_CELL = 112;
/** NumberLineView's own geometry: the line's y and the band below it (numerals or none). */
const LINE_Y_MARKS = 88;
const LINE_Y_JUMPS = 104;
const LINE_Y_BARE = 30;
const LINE_Y_POINTER = 46;
const LINE_BELOW_NUMERALS = 64;
const LINE_BELOW_BARE = 30;
/** Widest a number line is drawn (NumberLineView default). */
const LINE_MAX_W = 880;

/** A ten-frame stimulus as an object layout: frames side by side, or stacked (one above the other). */
export function tenFrameLayout(
  frames: 1 | 2,
  filled: readonly number[],
  colors: readonly ('a' | 'b')[][] | undefined,
  stacked: boolean,
): ObjectLayout {
  const objects: PlacedObject[] = [];
  const outlines = [];
  for (let f = 0; f < frames; f++) {
    const fx = stacked ? 0 : f * 5.5;
    const fy = stacked ? f * 2.5 : 0;
    outlines.push({ x: fx, y: fy, cols: 5, rows: 2 });
    const n = Math.max(0, Math.min(10, filled[f] ?? 0));
    for (let k = 0; k < n; k++) {
      const c = colors?.[f]?.[k] ?? 'a';
      objects.push({
        index: f * 10 + k,
        kind: 'object',
        sprite: 'counter',
        // A margin inside each cell, so counters never touch the frame lines (as TenFrameView).
        x: fx + (k % 5) + 0.09,
        y: fy + Math.floor(k / 5) + 0.09,
        scale: 0.82,
        group: c === 'b' ? 1 : 0,
        tone: c,
      });
    }
  }
  return {
    objects,
    frames: outlines,
    width: stacked || frames === 1 ? 5 : frames * 5.5 - 0.5,
    height: stacked ? frames * 2.5 - 0.5 : 2,
  };
}

/**
 * The cell layout of a countable picture, or null for a fixed-pixel one. `stackFrames` draws a
 * double ten-frame as two rows (narrow boxes: cards).
 */
export function countLayout(spec: StimulusSpec, stackFrames = false): ObjectLayout | null {
  switch (spec.kind) {
    case 'objects':
      return objectSetLayout(spec.set);
    case 'dots':
      return spec.arrangement === 'fingers' ? null : dotsLayout(spec);
    case 'ten-frame':
      return tenFrameLayout(spec.frames, spec.filled, spec.colors, stackFrames);
    case 'groups':
      return objectSetLayout({
        count: spec.groups * spec.perGroup,
        sprite: spec.sprite,
        layout: 'groups',
        groups: Array.from({ length: spec.groups }, () => spec.perGroup),
        layoutSeed: 1,
      });
    case 'array':
      return objectSetLayout({
        count: spec.rows * spec.cols,
        sprite: spec.sprite ?? 'counter',
        layout: 'array',
        rows: spec.rows,
        layoutSeed: 1,
      });
    default:
      return null;
  }
}

/**
 * Where the line sits in a fitted number line: NumberLineView's own choice, except that arrow
 * marks with no numeral over them need only the pointer's height (38 px) above the line, so a
 * fitted line wastes no headroom.
 */
function lineHeadroom(spec: Extract<StimulusSpec, { kind: 'number-line' }>): number {
  const marks = spec.marks ?? [];
  if ((spec.jumps?.length ?? 0) > 0) return LINE_Y_JUMPS;
  if (marks.some((m) => m.label !== undefined)) return LINE_Y_MARKS;
  return marks.some((m) => m.arrow) ? LINE_Y_POINTER : LINE_Y_BARE;
}

/** A number line prints numerals (tick labels or mark labels). */
const numerals = (spec: Extract<StimulusSpec, { kind: 'number-line' }>) =>
  spec.labelsEvery !== null || (spec.marks ?? []).some((m) => m.label !== undefined);
/** End room of a line with no numerals (its end caps' reach): more of a small line for ticks. */
export const LINE_BARE_PAD = 30;

/** A fitted number line's drawn height in px, which its width does not change. */
export function numberLineHeight(spec: Extract<StimulusSpec, { kind: 'number-line' }>): number {
  return lineHeadroom(spec) + (spec.labelsEvery !== null ? LINE_BELOW_NUMERALS : LINE_BELOW_BARE);
}

/**
 * The picture's natural size in px (its aspect is what a layout plans with). `flexWidth`: a number
 * line takes any width (its height is fixed).
 */
export function naturalPictureSize(
  spec: StimulusSpec,
  stackFrames = false,
): { w: number; h: number; flexWidth?: boolean } {
  const layout = countLayout(spec, stackFrames);
  if (layout) return { w: layout.width * NATURAL_CELL, h: layout.height * NATURAL_CELL };
  switch (spec.kind) {
    case 'number-line':
      return { w: 560, h: numberLineHeight(spec), flexWidth: true };
    case 'base-ten': {
      // BaseTenView: 14 px units, 10 px gaps; cubes, flats (140 × 140), rods (14 × 140), ones.
      const blocks = (spec.thousands ?? 0) + spec.hundreds + spec.tens;
      const w =
        (spec.thousands ?? 0) * 158 + spec.hundreds * 140 + spec.tens * 14 + blocks * 10 + 32;
      const onesRows = Math.ceil(spec.ones / 2);
      const h =
        Math.max(blocks > 0 ? 140 : 0, onesRows * 18, 14) + ((spec.thousands ?? 0) ? 18 : 0);
      return { w, h };
    }
    case 'expression': {
      // Roughly 0.6 em a digit at the 96 px side numeral, 26 px between tokens.
      const chars = spec.expr.tokens.reduce(
        (n, tok) => n + ('v' in tok ? String(tok.v).length : 1),
        0,
      );
      return { w: chars * 58 + (spec.expr.tokens.length - 1) * 26 + 24, h: 112 };
    }
    case 'none':
      return { w: 1, h: 1 };
    default:
      return { w: 160, h: 160 };
  }
}

/**
 * A one-row line layout wrapped into rows of `perRow` in reading order (each row filled before
 * the next, continuing left to right under the one above; spacing inside a row kept): with rows
 * of five, 7 reads 5 + 2 and 10 reads 5 + 5, like a ten-frame. Object order is unchanged, so
 * object i is still obj-<i>.
 */
export function wrapLine(layout: ObjectLayout, perRow = 5): ObjectLayout {
  const slots = [...layout.objects].sort((a, b) => a.x - b.x);
  const rows = Math.ceil(slots.length / Math.max(1, perRow));
  const base = (o: PlacedObject) => o.x - (1 - o.scale) / 2;
  const chunks = Array.from({ length: rows }, (_, r) =>
    slots.slice(r * perRow, (r + 1) * perRow),
  ).filter((c) => c.length > 0);
  if (chunks.length < 2) return layout;
  const lo = (c: PlacedObject[]) => Math.min(...c.map(base));
  const hi = (c: PlacedObject[]) => Math.max(...c.map((o) => base(o) + 1));
  const moved = new Map<PlacedObject, PlacedObject>();
  chunks.forEach((c, r) => {
    const shift = -lo(c);
    for (const o of c) moved.set(o, { ...o, x: o.x + shift, y: o.y + r * 1.2 });
  });
  return {
    ...layout,
    objects: layout.objects.map((o) => moved.get(o) ?? o),
    width: Math.max(...chunks.map((c) => hi(c) - lo(c))),
    height: (chunks.length - 1) * 1.2 + layout.height,
  };
}

/** The largest cell `layout` gets in a w × h box (no floor: small cards may draw small dots). */
export function cellToFit(layout: ObjectLayout, w: number, h: number): number {
  return Math.max(4, Math.floor(Math.min(w / layout.width, h / layout.height, MAX_CELL)));
}

/**
 * Draws `children` at their own size, scaled (uniformly, about the top-left corner) to fit
 * `maxWidth` × `maxHeight`, at most `maxScale`. The box takes the scaled size, so it lays out like
 * an image of that size.
 */
export function Scaled({
  maxWidth,
  maxHeight,
  maxScale = 1,
  scale,
  onFit,
  children,
}: {
  maxWidth: number;
  maxHeight: number;
  maxScale?: number;
  /** Draw at this scale (never more than fits): pictures compared share one (`useSharedScale`). */
  scale?: number;
  /** Receives the scale that would fit this picture alone. */
  onFit?: (fit: number) => void;
  children: ReactNode;
}) {
  const inner = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    // offsetWidth/Height ignore the transform: the natural size.
    const measure = () =>
      setNatural((n) =>
        n && n.w === el.offsetWidth && n.h === el.offsetHeight
          ? n
          : { w: el.offsetWidth, h: el.offsetHeight },
      );
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = natural
    ? Math.min(maxScale, maxWidth / Math.max(1, natural.w), maxHeight / Math.max(1, natural.h))
    : 1;
  const s = scale === undefined ? fit : Math.min(scale, fit);
  const report = useRef(onFit);
  report.current = onFit;
  useLayoutEffect(() => {
    if (natural) report.current?.(fit);
  }, [natural, fit]);
  return (
    <div
      className="ni-scaled"
      style={natural ? { width: natural.w * s, height: natural.h * s } : undefined}
    >
      <div ref={inner} className="ni-scaled__inner" style={{ transform: `scale(${s})` }}>
        {children}
      </div>
    </div>
  );
}

export interface FitPictureProps {
  spec: StimulusSpec;
  maxWidth: number;
  maxHeight: number;
  /** Cell size for a countable picture (two pictures compared share one); default: fit the box. */
  cell?: number;
  /** A number line marks every 5th and 10th tick longer (all ticks kept). */
  tickRhythm?: boolean;
  /** The countable picture's layout, when the widget re-arranged it (`wrapLine`). */
  layout?: ObjectLayout;
  /** Draw a double ten-frame as two rows. */
  stackFrames?: boolean;
  /** How far a fixed-pixel picture (base-ten blocks) may grow, default 1. */
  maxScale?: number;
  /** Accessible name (defaults to the generic picture name). */
  label?: string;
  /** A drawn-to-size picture's scale, shared with the pictures it is compared with. */
  scale?: number;
  /** Receives the scale that would fit this picture alone (`useSharedScale().report`). */
  onFit?: (fit: number) => void;
}

/**
 * One scale for several drawn-to-size pictures (base-ten blocks, number lines, expressions) shown
 * side by side, so a picture's size is never a cue its number doesn't give: each reports the scale
 * that fits it alone, and all draw at the smallest.
 */
export function useSharedScale(): {
  scale: number | undefined;
  report: (id: string) => (fit: number) => void;
} {
  const [fits, setFits] = useState<Record<string, number>>({});
  const report = useCallback(
    (id: string) => (fit: number) => setFits((f) => (f[id] === fit ? f : { ...f, [id]: fit })),
    [],
  );
  const values = Object.values(fits);
  return { scale: values.length > 0 ? Math.min(...values) : undefined, report };
}

/** A stimulus picture fitted to a box (no frame of its own: the card or side frames it). */
export function FitPicture({
  spec,
  maxWidth,
  maxHeight,
  cell,
  layout: given,
  tickRhythm = false,
  stackFrames = false,
  maxScale = 1,
  label,
  scale,
  onFit,
}: FitPictureProps) {
  const t = useNarrationText();
  const pictureName = t('ui.widget.picture');
  const w = Math.max(1, maxWidth);
  const h = Math.max(1, maxHeight);
  const layout = given ?? countLayout(spec, stackFrames);
  if (layout) {
    return (
      <div className="ni-fitpic" data-kind={spec.kind}>
        <ObjectSetView layout={layout} cell={cell ?? cellToFit(layout, w, h)} label={label} />
      </div>
    );
  }
  if (spec.kind === 'number-line') {
    // The line takes the box's width at the scale its fixed height allows, so it is scaled no
    // more than it must be and its numerals stay as big as the box lets them.
    const s = Math.min(1, h / numberLineHeight(spec));
    return (
      <div className="ni-fitpic" data-kind={spec.kind}>
        <Scaled maxWidth={w} maxHeight={h} scale={scale} onFit={onFit}>
          <NumberLineView
            min={spec.min}
            max={spec.max}
            ticksEvery={spec.ticksEvery}
            labelsEvery={spec.labelsEvery}
            marks={spec.marks}
            jumps={spec.jumps}
            width={Math.min(LINE_MAX_W, Math.floor(w / s))}
            headroom={lineHeadroom(spec)}
            pad={numerals(spec) ? undefined : LINE_BARE_PAD}
            tickRhythm={tickRhythm}
            label={label ?? pictureName}
          />
        </Scaled>
      </div>
    );
  }
  return (
    <div className="ni-fitpic" data-kind={spec.kind}>
      <Scaled maxWidth={w} maxHeight={h} maxScale={maxScale} scale={scale} onFit={onFit}>
        <StimulusView spec={spec} label={label} className="ni-fitpic__bare" />
      </Scaled>
    </div>
  );
}
