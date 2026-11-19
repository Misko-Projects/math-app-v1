import { placeCorners, type Vec } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type MouseEvent, useId, useRef, useState } from 'react';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import { CheckButton, shapeColor, useAlive, useDemoPause } from '../kit';
import { useInviteHand } from '../kit/inviteHand';
import { bounds, fits, nearestFit } from './fit';
import { CHECK_W, type ModeProps, OPS, UndoButton } from './shared';

/**
 * fill-outline (GEO.10, GEO.11, PUZ.03): fill the outline with the offered pieces. Drag a piece
 * from the tray onto the outline (or tap it, then tap where it goes; on the keyboard Enter puts it
 * in the first place it fits). A piece snaps corner to corner and only lands where it lies inside
 * the outline without overlapping another, like a real block; ↻ turns a tray piece by the
 * rotation step. Tap a placed piece to take it back. Guide lines (a triangle or square lattice)
 * show inside the outline unless the item hides them.
 */

const COLOR: Record<string, string> = {
  triangle: 'green',
  square: 'orange',
  rhombus: 'blue',
  trapezoid: 'red',
  hexagon: 'yellow',
  rectangle: 'purple',
};

/** Tray gaps (px): badge to tile, tile to its turn button (room for Pip's hand), kind to kind. */
const BADGE_GAP = 6;
const TURN_GAP = 28;
/** A picked-up tile's ring (8 px out) stays 12 px clear of the next kind's tile. */
const CELL_GAP = 24;

const pts = (p: readonly Vec[], map: (v: Vec) => Vec) => p.map((v) => map(v).join(',')).join(' ');

export function FillOutline({
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
  const { say } = useSpeech();
  const { speakOnTap, ageMode } = useUiPreferences();
  const alive = useAlive();
  const pause = useDemoPause();
  const board = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const outline = (config.outline?.points ?? []) as Vec[];
  const pieces = config.pieces ?? [];
  const b = bounds(outline);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const minT = MIN_TARGET_PX[ageMode];
  // The tray: one column per piece kind, side by side: the turn button, then the count badge
  // (never on the piece, whose corners a child counts), then the tile at the bottom, so Pip's
  // hand, which hangs below an invited tile, touches nothing else (evidence review: it covered
  // the turn button). A column is minT + TURN_GAP + 64 (badge) + BADGE_GAP + tile tall (274 px in
  // K), so even four kinds fit the smallest area (960 × 600: about 289 px of height inside the
  // widget's padding; review CR-1.1, evidence review).
  const tile = Math.max(minT + 16, 96);
  const trayW = pieces.length * tile + Math.max(0, pieces.length - 1) * CELL_GAP;
  const checkW = ageMode === 'k' ? minT + 24 : CHECK_W;
  const boardW = Math.max(200, (avail?.width ?? 1100) - trayW - checkW - 80);
  const boardH = Math.max(200, (avail?.height ?? 600) - 24);
  // The board adds its 14 px padding on each side.
  // As large as the area allows (evidence review: the composition used 39 % of the tablet area).
  const u = Math.max(40, Math.min(240, (boardW - 28) / w, (boardH - 28) / h));
  const pad = 14;
  const toPx = ([x, y]: Vec): Vec => [pad + (x - b.minX) * u, pad + (b.maxY - y) * u];
  const toUnits = (px: number, py: number): Vec => [
    (px - pad) / u + b.minX,
    b.maxY - (py - pad) / u,
  ];

  const placedAsPlacement = state.placed.map((p) => ({ kind: p.kind, at: p.at, rot: p.rot }));
  const left = (id: string) =>
    (pieces.find((p) => p.id === id)?.count ?? 0) -
    state.placed.filter((p) => p.piece === id).length;

  const place = (id: string, near: Vec | null, via: string) => {
    const piece = pieces.find((p) => p.id === id);
    if (!piece) return;
    const rot = state.trayRot[id] ?? 0;
    const options = fits(outline, placedAsPlacement, piece.kind, rot);
    const fit =
      near === null ? (options[0] ?? null) : nearestFit(options, near, via === 'drag' ? 0.9 : 1.6);
    if (!fit) {
      trace('drop', 'none');
      return;
    }
    apply({ op: 'drag-piece', args: { id, to: fit.at, rot: fit.rot } });
  };

  const dragFrom = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const tapAt = useRef<{ x: number; y: number } | null>(null);
  const dnd = useDragToTarget<string, string>({
    disabled: !interactive,
    trace,
    canPlace: (item) => left(item) > 0,
    onSelect: (item) => {
      if (!item) return;
      setInvite(null);
      const kind = pieces.find((p) => p.id === item)?.kind;
      if (kind && speakOnTap) say(`shape.${kind}.one`);
    },
    onPlace: ({ item, via }) => {
      setInvite(null);
      const r = board.current?.getBoundingClientRect();
      if (!r) return;
      if (via === 'drag' && dragFrom.current) {
        const cx = dragFrom.current.cx + last.current.x - dragFrom.current.x;
        const cy = dragFrom.current.cy + last.current.y - dragFrom.current.y;
        place(item, toUnits(cx - r.left, cy - r.top), via);
      } else if (via === 'tap' && tapAt.current) {
        place(item, toUnits(tapAt.current.x - r.left, tapAt.current.y - r.top), via);
      } else {
        place(item, null, via);
      }
      dragFrom.current = null;
      tapAt.current = null;
    },
  });

  /** "Take one back": the piece placed last goes back to the tray. */
  const takeBack = () => {
    const p = state.placed[state.placed.length - 1];
    if (!p || !interactive) return;
    trace('undo', p.id);
    apply({ op: 'drag-piece', args: { id: p.id, remove: true } });
  };

  const turn = (id: string) => {
    if (!interactive) return;
    trace('tap', `rotate-${id}`);
    setInvite(null);
    apply({ op: 'rotate', args: { id } });
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action: WidgetAction) => {
      setInvite(null);
      setDemoBusy(true);
      try {
        const id = typeof action.args?.id === 'string' ? action.args.id : null;
        if (id) setLit(id.split(':')[0] ?? id);
        await pause(500);
        if (!alive.current) return;
        apply(action);
        setLit(null);
        await pause(500);
      } finally {
        if (alive.current) setDemoBusy(false);
      }
    },
    invite: (action) => {
      if (!action) return setInvite(null);
      const id = typeof action.args?.id === 'string' ? action.args.id : null;
      setInvite(action.op === 'rotate' && id ? `rotate-${id}` : id);
    },
  });

  // Guide lines: the lattice the pieces sit on, clipped to the outline.
  const clipId = `ni-scomp-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const lattice: [Vec, Vec][] = [];
  if (config.showOutlineLines) {
    const span = Math.ceil(Math.max(w, h)) + 2;
    if (config.rotationStep === 90) {
      for (let k = Math.floor(b.minX); k <= Math.ceil(b.maxX); k += 1)
        lattice.push([
          [k, b.minY - 1],
          [k, b.maxY + 1],
        ]);
      for (let k = Math.floor(b.minY); k <= Math.ceil(b.maxY); k += 1)
        lattice.push([
          [b.minX - 1, k],
          [b.maxX + 1, k],
        ]);
    } else {
      const H = Math.sqrt(3) / 2;
      for (let j = -span; j <= span; j += 1) {
        const y = j * H;
        if (y >= b.minY - 1e-6 && y <= b.maxY + 1e-6)
          lattice.push([
            [b.minX - span, y],
            [b.maxX + span, y],
          ]);
      }
      for (let k = -2 * span; k <= 2 * span; k += 1) {
        // Lines at ±60° through (k, 0).
        lattice.push([
          [k - span * 0.5, -span * H],
          [k + span * 0.5, span * H],
        ]);
        lattice.push([
          [k + span * 0.5, -span * H],
          [k - span * 0.5, span * H],
        ]);
      }
    }
  }

  // Pip's hand under the invited tray piece or turn button (kit useInviteHand).
  const { hand, rootStyle: handStyle } = useInviteHand(
    host,
    (r) =>
      invite?.startsWith('rotate-')
        ? r.querySelector<HTMLElement>(`[data-piece="${invite.slice(7)}"] .ni-scomp__rotate`)
        : invite
          ? r.querySelector<HTMLElement>(`[data-piece="${invite}"] .ni-scomp__tile`)
          : null,
    invite ?? '',
  );
  const boardP = dnd.targetProps('board', { label: t('ui.scomp.outline') });
  const svgW = w * u + 2 * pad;
  const svgH = h * u + 2 * pad;
  // One scale for every tray piece (from the widest piece, any turn), so a triangle looks half a
  // trapezoid in the tray as on the outline.
  const diameter = (kind: string) => {
    const c = placeCorners({ kind, at: [0, 0], rot: 0 }) ?? [];
    return Math.max(...c.flatMap((p) => c.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
  };
  // Every piece, in any turn, 12 px inside its tile (3 px border + 12 on each side; evidence
  // review: the hexagon reached 7 px from the edge). One scale for all kinds.
  const trayK = Math.min(u, (tile - 30) / Math.max(1, ...pieces.map((p) => diameter(p.kind))));

  return (
    <div className="ni-scomp__fill" ref={host} style={handStyle}>
      <div
        className="ni-scomp__board"
        ref={board}
        // The board's left padding is empty paper: pulled back by it, what is drawn (the outline,
        // the tray, Check) sits centred in the widget (evidence review: margins 149/135).
        style={{ width: svgW, height: svgH, marginLeft: -pad }}
      >
        <button
          type="button"
          {...boardP}
          className={[boardP.className, 'ni-scomp__pad'].join(' ')}
          onClick={(e: MouseEvent) => {
            tapAt.current = { x: e.clientX, y: e.clientY };
            boardP.onClick(e);
          }}
        />
        <svg
          className="ni-scomp__svg"
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <clipPath id={clipId}>
              <polygon points={pts(outline, toPx)} />
            </clipPath>
          </defs>
          <polygon className="ni-scomp__outline-fill" points={pts(outline, toPx)} />
          <g clipPath={`url(#${clipId})`} className="ni-scomp__lattice" data-lines={lattice.length}>
            {lattice.map(([p, q], i) => {
              const [x1, y1] = toPx(p);
              const [x2, y2] = toPx(q);
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed lattice
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
          </g>
          {state.placed.map((p) => {
            const c = shapeColor(COLOR[p.kind] ?? 'tan');
            const corners = placeCorners(p) ?? [];
            return (
              <polygon
                key={p.id}
                className="ni-scomp__piece"
                data-placed={p.id}
                data-at={p.at.join(',')}
                data-rot={p.rot}
                points={pts(corners, toPx)}
                fill={c.fill}
                stroke={c.line}
              />
            );
          })}
          <polygon className="ni-scomp__outline" points={pts(outline, toPx)} />
        </svg>
      </div>
      <fieldset
        className="ni-scomp__tray"
        aria-label={t('ui.scomp.pieces')}
        style={{ gap: CELL_GAP }}
      >
        {pieces.map((piece) => {
          const n = left(piece.id);
          const rot = state.trayRot[piece.id] ?? 0;
          const shape = placeCorners({ kind: piece.kind, at: [0, 0], rot }) ?? [];
          const pb = bounds(shape);
          const k = trayK;
          // The picture is the piece's own box at the one tray scale (plus the 3 px outline
          // margin each side), centred in the tile: never stretched to the tile.
          const picW = (pb.maxX - pb.minX) * k + 6;
          const picH = (pb.maxY - pb.minY) * k + 6;
          const c = shapeColor(COLOR[piece.kind] ?? 'tan');
          const p = dnd.itemProps(piece.id, {
            label: t('ui.scomp.piece', { name: t(`shape.${piece.kind}.one`), n }),
            disabled: n <= 0,
          });
          return (
            <div
              key={piece.id}
              className="ni-scomp__tray-row"
              data-piece={piece.id}
              style={{ gap: TURN_GAP }}
            >
              <button
                type="button"
                className={['ni-scomp__rotate', invite === `rotate-${piece.id}` ? 'ni-invite' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-label={t('ui.scomp.turn', { name: t(`shape.${piece.kind}.one`) })}
                disabled={!interactive}
                onClick={() => turn(piece.id)}
              >
                <TurnIcon />
              </button>
              <span className="ni-scomp__tile-slot" style={{ gap: BADGE_GAP }}>
                <span className="ni-scomp__count" aria-hidden="true">
                  {n}
                </span>
                <span
                  {...p}
                  className={[
                    p.className,
                    'ni-scomp__tile',
                    invite === piece.id || lit === piece.id ? 'ni-invite' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ width: tile, height: tile }}
                  onPointerDown={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    dragFrom.current = {
                      x: e.clientX,
                      y: e.clientY,
                      cx: r.left + r.width / 2,
                      cy: r.top + r.height / 2,
                    };
                    last.current = { x: e.clientX, y: e.clientY };
                    const move = (ev: PointerEvent) => {
                      last.current = { x: ev.clientX, y: ev.clientY };
                    };
                    const up = () => {
                      window.removeEventListener('pointermove', move);
                      window.removeEventListener('pointerup', up);
                    };
                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', up);
                    p.onPointerDown(e);
                  }}
                >
                  <svg
                    width={picW}
                    height={picH}
                    viewBox={`${pb.minX * k - 3} ${-pb.maxY * k - 3} ${picW} ${picH}`}
                    aria-hidden="true"
                    focusable="false"
                    data-tray-rot={rot}
                  >
                    <polygon
                      className="ni-scomp__piece"
                      points={shape.map(([x, y]) => `${x * k},${-y * k}`).join(' ')}
                      fill={c.fill}
                      stroke={c.line}
                    />
                  </svg>
                </span>
              </span>
            </div>
          );
        })}
      </fieldset>
      <div className="ni-scomp__check" data-tier={tier}>
        <UndoButton
          label={t('ui.scomp.undo')}
          disabled={!interactive || state.placed.length === 0}
          onPress={takeBack}
        />
        <CheckButton onPress={submit} disabled={!interactive || !response} />
      </div>
      {hand}
    </div>
  );
}

function TurnIcon() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" focusable="false">
      <path
        d="M36 18a14 14 0 1 0 2 12"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M40 8v14H26z" fill="var(--color-ink)" />
    </svg>
  );
}
