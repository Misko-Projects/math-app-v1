// 04 §4 review selection helpers the session planner (E03) uses: review compression and
// transfer probes. Pure.

import type { DueReview, SkillGraph, SkillId, SkillStatus } from '@number-island/shared';
import { type EngineParams, PARAMS } from '../params';
import type { Rng } from '../rng';

/**
 * Review compression (04 §4): walk the due skills deepest first, pick one, and drop from the due
 * set every skill it encompasses with weight ≥ 0.5 (a success gives them implicit credit), until
 * `budget` skills are picked. `due` is ordered as `dueReviews` returns it.
 */
export function compressReviews(
  due: readonly DueReview[],
  graph: SkillGraph,
  budget: number,
  params: EngineParams = PARAMS,
): DueReview[] {
  const ordered = [...due].sort(
    (a, b) => b.depth - a.depth || a.dueTs - b.dueTs || (a.skillId < b.skillId ? -1 : 1),
  );
  const removed = new Set<SkillId>();
  const picked: DueReview[] = [];
  for (const r of ordered) {
    if (picked.length >= budget) break;
    if (removed.has(r.skillId)) continue;
    picked.push(r);
    for (const [b, w] of Object.entries(graph.encompasses[r.skillId] ?? {})) {
      if (w >= params.memory.compressionMinWeight) removed.add(b);
    }
  }
  return picked;
}

/**
 * The context of one review task (04 §4 transfer probes): 10% of review tasks for mastered skills
 * are `transfer-probe` (abstract tier, no manipulative); everything else is `review`.
 */
export function reviewContext(
  status: SkillStatus,
  rng: Rng,
  params: EngineParams = PARAMS,
): 'review' | 'transfer-probe' {
  if (status !== 'mastered') return 'review';
  return rng.float() < params.memory.transferProbeRate ? 'transfer-probe' : 'review';
}
