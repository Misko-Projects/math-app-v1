// The region a position word defines around an anchor's box, exactly as the engine's
// compose.relative checker reads it (`inRelation`), as rectangles in scene units (x right, y down,
// clipped to the 100 × 60 scene). The demo's `highlight-region` draws these.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const SCENE = { w: 100, h: 60 } as const;

const clip = (r: Rect): Rect => ({
  x0: Math.max(0, r.x0),
  y0: Math.max(0, r.y0),
  x1: Math.min(SCENE.w, r.x1),
  y1: Math.min(SCENE.h, r.y1),
});

export function relationRegions(word: string, box: Box): Rect[] {
  const l = box.x - box.w / 2;
  const r = box.x + box.w / 2;
  const t = box.y - box.h / 2;
  const b = box.y + box.h / 2;
  const column = { x0: l - box.w / 2, x1: r + box.w / 2 };
  const row = { y0: t - box.h / 2, y1: b + box.h / 2 };
  switch (word) {
    case 'above':
      return [clip({ ...column, y0: 0, y1: t })];
    case 'below':
      return [clip({ ...column, y0: b, y1: SCENE.h })];
    case 'left-of':
      return [clip({ x0: 0, x1: l, ...row })];
    case 'right-of':
      return [clip({ x0: r, x1: SCENE.w, ...row })];
    case 'beside':
    case 'next-to':
      return [clip({ x0: l - box.w, x1: l, ...row }), clip({ x0: r, x1: r + box.w, ...row })];
    case 'in-front-of':
    case 'behind':
      return [{ x0: l, y0: t, x1: r, y1: b }];
    default:
      return [];
  }
}
