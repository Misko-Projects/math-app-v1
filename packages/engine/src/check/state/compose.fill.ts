// compose.fill `{ outline: [x, y][], pieces: { kind, count }[] }` (03 §5.5 shape-compose,
// fill-outline; GEO.10, GEO.11, PUZ.03). Response `{ pieces: { kind, at: [x, y], rot }[] }`, the
// placed pieces in the geometry of ./pieces.ts. Correct when only offered pieces are used (no more of
// a kind than offered), every piece lies inside the outline, no two pieces overlap, and at most 2%
// of the outline is uncovered. Any arrangement is correct (two trapezoids or three rhombuses for a
// hexagon, when both are offered).
import { coversOutline, type Placement, type Vec } from './pieces';
import { num, type StateChecker } from './types';

const vec = (v: unknown): Vec | undefined =>
  Array.isArray(v) && v.length === 2 && num(v[0]) !== undefined && num(v[1]) !== undefined
    ? [v[0] as number, v[1] as number]
    : undefined;

export const composeFill: StateChecker = {
  id: 'compose.fill',
  check(target, value) {
    if (!Array.isArray(target.outline) || !Array.isArray(target.pieces)) return false;
    const outline: Vec[] = [];
    for (const p of target.outline) {
      const v = vec(p);
      if (!v) return false;
      outline.push(v);
    }
    if (outline.length < 3) return false;
    const offered = new Map<string, number>();
    for (const p of target.pieces as unknown[]) {
      const rec = p as Record<string, unknown> | null;
      if (!rec || typeof rec.kind !== 'string' || num(rec.count) === undefined) return false;
      offered.set(rec.kind, (offered.get(rec.kind) ?? 0) + (rec.count as number));
    }
    if (!Array.isArray(value.pieces) || value.pieces.length === 0) return false;
    const placed: Placement[] = [];
    const used = new Map<string, number>();
    for (const p of value.pieces as unknown[]) {
      const rec = p as Record<string, unknown> | null;
      if (!rec || typeof rec.kind !== 'string') return false;
      const at = vec(rec.at);
      const rot = num(rec.rot);
      if (!at || rot === undefined) return false;
      used.set(rec.kind, (used.get(rec.kind) ?? 0) + 1);
      if ((used.get(rec.kind) ?? 0) > (offered.get(rec.kind) ?? 0)) return false;
      placed.push({ kind: rec.kind, at, rot });
    }
    return coversOutline(outline, placed);
  },
};
