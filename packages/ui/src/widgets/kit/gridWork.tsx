import type { NarrationKey } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from 'react';
import { IconButton } from '../../primitives/IconButton';
import {
  type AgeMode,
  DRAG_START_PX,
  MIN_TARGET_PX,
  TARGET_GAP_PX,
  TARGET_PX,
} from '../../tokens/tokens';
import type { Size } from './arrange';
import { STEP_GAP } from './twoStep';
import './kit.css';

/**
 * A grid a child works on (an array of sprites, a region of unit squares) in a short room (06 §1:
 * the widget area is about 906 × 373 at the smallest landscape screen). Ten rows of countable
 * things need the room's whole height, so the grid is a PICTURE: its cells are never targets
 * (06 §4 asks 64 px, 80 px in kindergarten mode, and 12 px between targets). What a child
 * touches is:
 *
 * - the **work pad**: full-size buttons beside the grid (arrows, and the widget's own actions),
 *   which are also the keyboard path;
 * - the **surface**: the whole grid as one target for a finger that draws on it (drag out a
 *   rectangle, slide a line, lay tiles). `useSurfacePointer` tracks one finger.
 *
 * The panel holds, top to bottom: an optional head line (what the task gives), the pad, and two
 * lines for a limit note (`role="status"`). The widget plans with `planWork` inside
 * `buildRoom(room, button)`.
 */

/** Between the panel's parts. */
export const PANEL_GAP = 8;
/** The head line: one row of 32 px numerals. */
export const PANEL_HEAD_H = 40;
/** The note: two lines of label text. */
export const NOTE_LINE_H = 30;
export const NOTE_LINES = 2;
/** A pad button's ledge (drawn under it; the next row keeps the target gap below it). */
const LEDGE = 6;

/** The pad's box: `cols` × `rows` icon buttons, the target gap apart. */
export function padBox(ageMode: AgeMode, cols: number, rows: number): Size {
  const t = TARGET_PX[ageMode].icon;
  return {
    w: cols * t + (cols - 1) * TARGET_GAP_PX,
    h: rows * t + (rows - 1) * (TARGET_GAP_PX + LEDGE) + LEDGE,
  };
}

/** The panel's box for a pad of `pad`, with or without a head line. */
export function panelBox(pad: Size, head: boolean): Size {
  return {
    // As wide as its pad, so the pad's buttons are the panel's edges (a note is two short lines).
    w: pad.w,
    h: (head ? PANEL_HEAD_H + PANEL_GAP : 0) + pad.h + PANEL_GAP + NOTE_LINES * NOTE_LINE_H,
  };
}

export interface WorkInput {
  /** The room for the panel and the grid (the build step: `buildRoom(room, button)`). */
  room: Size;
  ageMode: AgeMode;
  /** The pad's buttons, in columns and rows (0 columns: no panel, a picture only). */
  pad: { cols: number; rows: number };
  head: boolean;
  /** The grid's cells. */
  cols: number;
  rows: number;
  /** What the grid's frame, labels and gaps add to its cells, both sides together. */
  extra: Size;
  /** A cell is never drawn smaller, and never larger, than this. */
  minCell: number;
  maxCell: number;
}

export interface WorkPlan {
  cell: number;
  panel: Size;
  /** The grid with its frame. As the surface it is one target: never under the minimum. */
  board: Size;
  width: number;
  height: number;
  /** Whether everything fits the room with cells of at least `minCell`. */
  fits: boolean;
}

/** The largest whole-pixel cell at which the panel and the grid fit the room side by side. */
export function planWork(input: WorkInput): WorkPlan {
  const { room, extra } = input;
  const hasPanel = input.pad.cols > 0;
  const panel = hasPanel
    ? panelBox(padBox(input.ageMode, input.pad.cols, input.pad.rows), input.head)
    : { w: 0, h: 0 };
  const side = hasPanel ? panel.w + STEP_GAP : 0;
  const cols = Math.max(1, input.cols);
  const rows = Math.max(1, input.rows);
  const fit = Math.floor(
    Math.min((room.w - side - extra.w) / cols, (room.h - extra.h) / rows, input.maxCell),
  );
  const cell = Math.max(input.minCell, fit);
  const floor = hasPanel ? MIN_TARGET_PX[input.ageMode] : 0;
  const board = {
    w: Math.max(cols * cell + extra.w, floor),
    h: Math.max(rows * cell + extra.h, floor),
  };
  const width = side + board.w;
  const height = Math.max(panel.h, board.h);
  return {
    cell,
    panel,
    board,
    width,
    height,
    fits: fit >= input.minCell && width <= room.w && height <= room.h,
  };
}

export interface PadButton {
  /** The cue and trace id (`data-cue="pad-<id>"`). */
  id: string;
  col: number;
  row: number;
  label: NarrationKey;
  icon: ReactNode;
  onPress: () => void;
}

export interface WorkPanelProps {
  ageMode: AgeMode;
  pad: { cols: number; rows: number };
  buttons: readonly PadButton[];
  disabled: boolean;
  /** The one ringed button (a demo invite, or what a limit note points at). */
  ringed?: string | null;
  head?: ReactNode;
  /** The limit note's words ('' for none). */
  note: string;
  /** A running count shown in the note's place (a demo counting aloud). */
  count?: number | null;
  /** The group's name for assistive tech. */
  label: string;
}

/** The panel beside the grid: the head line, the pad and the note. */
export function WorkPanel({
  ageMode,
  pad,
  buttons,
  disabled,
  ringed = null,
  head,
  note,
  count = null,
  label,
}: WorkPanelProps) {
  const t = TARGET_PX[ageMode].icon;
  const box = padBox(ageMode, pad.cols, pad.rows);
  const size = panelBox(box, head !== undefined && head !== null);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset brings its own box model
    <div
      className="ni-work"
      role="group"
      aria-label={label}
      style={{ width: size.w, height: size.h, gap: PANEL_GAP }}
    >
      {head !== undefined && head !== null ? (
        <div className="ni-work__head" style={{ height: PANEL_HEAD_H }}>
          {head}
        </div>
      ) : null}
      <div className="ni-work__pad" style={{ width: box.w, height: box.h }}>
        {buttons.map((b) => {
          const style: CSSProperties = {
            left: b.col * (t + TARGET_GAP_PX),
            top: b.row * (t + TARGET_GAP_PX + LEDGE),
          };
          return (
            <span key={b.id} className="ni-work__btn" data-cue={`pad-${b.id}`} style={style}>
              <IconButton
                label={b.label}
                icon={b.icon}
                tone="cloud"
                caption={false}
                onPress={b.onPress}
                disabled={disabled}
                className={ringed === b.id ? 'ni-invite' : undefined}
              />
            </span>
          );
        })}
      </div>
      <div className="ni-work__foot" style={{ height: NOTE_LINES * NOTE_LINE_H }}>
        <p className="ni-work__note" role="status">
          {note}
        </p>
        {count !== null ? (
          <span className="ni-work__count ni-invite-glyph" aria-hidden="true">
            {count}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A pad arrow (the direction the thing on the grid moves). Decorative: the button has the name. */
export function PadArrowIcon({ dir }: { dir: 'up' | 'down' | 'left' | 'right' }) {
  const turn = { right: 0, down: 90, left: 180, up: 270 }[dir];
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 24h30M26 11l13 13-13 13"
        stroke="var(--color-ink)"
        strokeWidth="6"
        transform={`rotate(${turn} 24 24)`}
      />
    </svg>
  );
}

/** A point of the surface, in px from its top-left corner (outside it when the finger is). */
export interface SurfacePoint {
  x: number;
  y: number;
}

export interface SurfacePointerOptions {
  /** Whether the surface takes a finger now. */
  enabled: boolean;
  /** Whether a moving finger draws (off in tap-only mode: the lift alone counts). */
  drag: boolean;
  /** The finger went down. */
  onDown?: (p: SurfacePoint) => void;
  /** The finger moved past the tap threshold, and each move after that. */
  onMove?: (p: SurfacePoint, from: SurfacePoint) => void;
  /** The finger lifted: after a drag (`moved`) or as a tap. */
  onUp: (p: SurfacePoint, from: SurfacePoint, moved: boolean) => void;
  /** The system took the finger away (the gesture did not finish). */
  onCancel?: () => void;
}

interface ActivePointer {
  id: number;
  el: HTMLElement;
  from: SurfacePoint;
  moved: boolean;
  stop: () => void;
}

/**
 * One finger on a drawing surface. The first pointer that goes down owns the gesture until it
 * lifts or is cancelled; any other finger is ignored, and so is a mouse button other than the
 * main one. Moves and the lift are followed on the window, so a drag that leaves the surface
 * still ends (its points are then outside the surface: the widget clamps them).
 */
export function useSurfacePointer(options: SurfacePointerOptions) {
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<ActivePointer | null>(null);

  useEffect(
    () => () => {
      active.current?.stop();
      active.current = null;
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!latest.current.enabled || active.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.currentTarget;
    const at = (ev: { clientX: number; clientY: number }): SurfacePoint => {
      const r = el.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const from = at(e);
    const start = { x: e.clientX, y: e.clientY };
    const id = e.pointerId;
    const move = (ev: PointerEvent) => {
      const a = active.current;
      if (!a || ev.pointerId !== id) return;
      if (!a.moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_START_PX) {
        return;
      }
      a.moved = true;
      if (latest.current.drag && latest.current.enabled) latest.current.onMove?.(at(ev), from);
    };
    const end = (ev: PointerEvent) => {
      const a = active.current;
      if (!a || ev.pointerId !== id) return;
      a.stop();
      active.current = null;
      if (ev.type === 'pointercancel' || !latest.current.enabled) {
        latest.current.onCancel?.();
        return;
      }
      latest.current.onUp(at(ev), from, a.moved && latest.current.drag);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    active.current = { id, el, from, moved: false, stop };
    latest.current.onDown?.(from);
  };

  return { onPointerDown };
}

/** Which of `n` cells of size `cell` holds offset `v` (clamped into the grid: 0 … n − 1). */
export function cellAt(v: number, cell: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.floor(v / cell)));
}

/** The inner line (1 … n − 1) nearest to offset `v` in a row of `n` cells (n ≥ 2). */
export function lineAt(v: number, cell: number, n: number): number {
  return Math.max(1, Math.min(n - 1, Math.round(v / cell)));
}
