// 03 §7.1 misconception rules: deterministic buggy-rule detectors, registered by the `detect.rule`
// id the content library names. `answer` and `state` rules run inside checkResponse on incorrect
// responses; `process` rules run in detectProcessMisconceptions and may tag correct responses.

import type { GeneratedItem, InteractionEvent, ResponseValue } from '@number-island/shared';

export type ProcessMeta = { latencyMs: number; trace?: InteractionEvent[] };

export interface MisconceptionRule {
  /** Matches `MisconceptionSpec.detect.rule`, e.g. 'countStartNumber'. */
  id: string;
  kind: 'answer' | 'state' | 'process';
  /**
   * The buggy response, if the rule implies one. Returns null when the buggy answer equals the
   * correct one (the item cannot discriminate). Also builds diagnostic distractors.
   */
  predict?(item: GeneratedItem): ResponseValue | null;
  match(item: GeneratedItem, r: ResponseValue, meta?: ProcessMeta): boolean;
}

/** Deep equality of two responses (choice ids, numbers, number lists, state objects). */
export function sameResponse(a: ResponseValue, b: ResponseValue): boolean {
  return canonical(a) === canonical(b);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
