import { ANCHOR_SIZE } from '@number-island/engine';
import type { WidgetAction } from '@number-island/shared';
import { type KeyboardEvent, type MouseEvent, useRef, useState } from 'react';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { HandPointerIcon } from '../../primitives/icons';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo } from '../demo';
import { CheckButton, ObjectSprite, useAlive, useDemoPause } from '../kit';
import { AnchorArt } from '../kit/SceneAnchors';
import { type Box, relationRegions, SCENE } from './regions';
import { CHECK_W, type ModeProps, OPS } from './shared';

/**
 * place-relative (GEO.05): put the item where the position word says (above, below, beside, next
 * to, in front of, behind, left of, right of the anchor). The concrete tier is a little stage with
 * shadows; the pictorial tier (02 §5.9 K1) is a flat drawing of the same scene. Drag the item from
 * the tray into the scene (or tap it, then tap a spot). Dropped on the top half of a thing it
 * tucks behind it (drawn behind, its outline showing through); on the bottom half it sits in
 * front. A placed item can be dragged again, or moved with the arrow keys (Enter on a thing flips
 * it between in front and behind).
 */

/** The item's smallest drawn size in scene units (larger when the scene is small, so it stays a target). */
export const ITEM_SIZE = 14;
const itemUnits = (k: number, minPx: number) => Math.max(ITEM_SIZE, Math.ceil(minPx / k));
const STEP = 2;

const clampX = (x: number) => Math.min(SCENE.w - 3, Math.max(3, x));
const clampY = (y: number) => Math.min(SCENE.h - 3, Math.max(3, y));

export function PlaceRelative({
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
  const scene = useRef<HTMLDivElement>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const anchors = config.scene?.anchors ?? [];
  const relation = config.relation;
  const item = relation?.item ?? 'pebble';
  const minT = MIN_TARGET_PX[ageMode];
  const sideW = minT + 40;
  const w = Math.max(
    300,
    Math.min(
      ((avail?.height ?? 600) - 20) * (SCENE.w / SCENE.h),
      (avail?.width ?? 1100) - sideW - CHECK_W - 72,
      900,
    ),
  );
  const k = w / SCENE.w;
  const h = SCENE.h * k;
  const boxOf = (sprite: string, at: [number, number]): Box => {
    const [bw, bh] = ANCHOR_SIZE[sprite] ?? [20, 20];
    return { x: at[0], y: at[1], w: bw, h: bh };
  };
  const anchorBox = (() => {
    const a = anchors.find((x) => x.id === relation?.anchor);
    return a ? boxOf(a.sprite, a.at) : null;
  })();

  /** Behind when dropped on the top half of a thing, in front otherwise. */
  const layerAt = (x: number, y: number): 'front' | 'back' => {
    for (const a of anchors) {
      const b = boxOf(a.sprite, a.at);
      if (Math.abs(x - b.x) <= b.w / 2 && y >= b.y - b.h / 2 && y < b.y) return 'back';
    }
    return 'front';
  };
  const onAnchor = (x: number, y: number) =>
    anchors.some((a) => {
      const b = boxOf(a.sprite, a.at);
      return Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2;
    });

  const put = (x: number, y: number, layer?: 'front' | 'back') => {
    const at: [number, number] = [Math.round(clampX(x) * 10) / 10, Math.round(clampY(y) * 10) / 10];
    apply({
      op: 'drag-piece',
      args: { id: item, to: at, rot: 0, layer: layer ?? layerAt(at[0], at[1]) },
    });
  };

  const dragFrom = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const tapAt = useRef<{ x: number; y: number } | null>(null);
  const toScene = (cx: number, cy: number) => {
    const r = scene.current?.getBoundingClientRect();
    return r ? { x: (cx - r.left) / k, y: (cy - r.top) / k } : { x: 50, y: 30 };
  };

  const dnd = useDragToTarget<string, string>({
    disabled: !interactive,
    trace,
    onSelect: (id) => {
      if (!id) return;
      setInvite(null);
      if (speakOnTap) say(`noun.${item}.one`);
    },
    onPlace: ({ via }) => {
      setInvite(null);
      if (via === 'drag' && dragFrom.current) {
        const p = toScene(
          dragFrom.current.cx + last.current.x - dragFrom.current.x,
          dragFrom.current.cy + last.current.y - dragFrom.current.y,
        );
        put(p.x, p.y);
      } else if (via === 'tap' && tapAt.current) {
        const p = toScene(tapAt.current.x, tapAt.current.y);
        put(p.x, p.y);
      } else {
        // Keyboard: a start spot on the left; the arrow keys take it from there.
        put(10, 30, 'front');
      }
      dragFrom.current = null;
      tapAt.current = null;
    },
  });

  const placed = state.item;
  const itemP = dnd.itemProps(item, { label: t(`noun.${item}.one`) });
  const onItemDown = (e: React.PointerEvent) => {
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
    itemP.onPointerDown(e);
  };
  const onItemKey = (e: KeyboardEvent) => {
    if (placed && interactive) {
      const [x, y] = placed.at;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-STEP, 0],
        ArrowRight: [STEP, 0],
        ArrowUp: [0, -STEP],
        ArrowDown: [0, STEP],
      };
      const d = moves[e.key];
      if (d) {
        e.preventDefault();
        trace('move', item);
        const nx = clampX(x + d[0]);
        const ny = clampY(y + d[1]);
        put(nx, ny, onAnchor(nx, ny) ? placed.layer : 'front');
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && onAnchor(x, y)) {
        e.preventDefault();
        trace('move', item);
        put(x, y, placed.layer === 'back' ? 'front' : 'back');
        return;
      }
    }
    itemP.onKeyDown(e);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action: WidgetAction) => {
      setInvite(null);
      setDemoBusy(true);
      try {
        apply(action);
        await pause(action.op === 'highlight-region' ? 1500 : 800);
      } finally {
        if (alive.current) setDemoBusy(false);
      }
    },
    invite: (action) => {
      if (!action) return setInvite(null);
      setInvite(
        action.op === 'drag-piece' ? 'item' : action.op === 'highlight-region' ? 'scene' : null,
      );
    },
  });

  const sceneP = dnd.targetProps('scene', { label: t('ui.scomp.scene') });
  const regions = state.region && anchorBox ? relationRegions(state.region, anchorBox) : [];
  const size = itemUnits(k, minT);
  const itemBox = (at: [number, number]) => ({
    left: (at[0] - size / 2) * k,
    top: (at[1] - size / 2) * k,
    width: size * k,
    height: size * k,
  });
  const itemEl = (
    <button
      type="button"
      {...itemP}
      className={[itemP.className, 'ni-scomp__item', invite === 'item' ? 'ni-invite' : '']
        .filter(Boolean)
        .join(' ')}
      data-item={item}
      data-at={placed ? placed.at.join(',') : undefined}
      data-layer={placed?.layer}
      style={
        placed
          ? { ...itemBox(placed.at), zIndex: placed.layer === 'back' ? 1 : 4 }
          : { width: Math.max(minT, 72), height: Math.max(minT, 72) }
      }
      onPointerDown={onItemDown}
      onKeyDown={onItemKey}
    >
      <ObjectSprite sprite={item} />
    </button>
  );

  return (
    <div className="ni-scomp__relative">
      <div className="ni-scomp__item-tray">
        <span className="ni-scomp__tile-slot">
          {placed ? <span className="ni-scomp__item-home" aria-hidden="true" /> : itemEl}
          {invite === 'item' && !placed ? (
            <span className="ni-hand ni-scomp__hand" aria-hidden="true">
              <HandPointerIcon />
            </span>
          ) : null}
        </span>
      </div>
      <div
        className={['ni-scomp__scene', invite === 'scene' ? 'ni-invite' : '']
          .filter(Boolean)
          .join(' ')}
        data-tier={tier}
        ref={scene}
        style={{ width: w, height: h }}
      >
        <button
          type="button"
          {...sceneP}
          className={[sceneP.className, 'ni-scomp__pad'].join(' ')}
          onClick={(e: MouseEvent) => {
            tapAt.current = { x: e.clientX, y: e.clientY };
            sceneP.onClick(e);
          }}
        />
        {regions.map((r) => (
          <span
            key={`${r.x0},${r.y0}`}
            className="ni-scomp__region"
            data-region={state.region ?? undefined}
            style={{
              left: r.x0 * k,
              top: r.y0 * k,
              width: (r.x1 - r.x0) * k,
              height: (r.y1 - r.y0) * k,
            }}
            aria-hidden="true"
          />
        ))}
        {anchors.map((a) => {
          const b = boxOf(a.sprite, a.at);
          return (
            <span
              key={a.id}
              className="ni-scomp__anchor"
              data-anchor-id={a.id}
              style={{
                left: (b.x - b.w / 2) * k,
                top: (b.y - b.h / 2) * k,
                width: b.w * k,
                height: b.h * k,
              }}
              aria-hidden="true"
            >
              <span className="ni-scomp__shadow" />
              <AnchorArt sprite={a.sprite} />
            </span>
          );
        })}
        {placed ? itemEl : null}
        {placed?.layer === 'back' ? (
          <span className="ni-scomp__xray" style={itemBox(placed.at)} aria-hidden="true">
            <ObjectSprite sprite={item} />
          </span>
        ) : null}
      </div>
      <div className="ni-scomp__check">
        <CheckButton onPress={submit} disabled={!interactive || !response} />
      </div>
    </div>
  );
}
