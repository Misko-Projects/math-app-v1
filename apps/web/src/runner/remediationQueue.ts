// The remediation queue (04 §6.4 rule 5): what `adaptNext` queued while a request was played,
// kept until the child's next plan, whose first request becomes that skill's lesson
// (`PlanOptions.remediation`). `adaptNext` can return the same remediation again and again, so
// the queue keeps one per (skill, misconception). It lives as long as the app is open.

import type { QueuedRemediation } from './TaskRunner';

export interface RemediationQueue {
  add(childId: string, remediation: QueuedRemediation): void;
  /** The oldest queued remediation of the child, left in the queue; undefined when none. */
  peek(childId: string): QueuedRemediation | undefined;
  /** The oldest queued remediation of the child, removed from the queue; undefined when none. */
  take(childId: string): QueuedRemediation | undefined;
}

export function createRemediationQueue(): RemediationQueue {
  const queued = new Map<string, QueuedRemediation[]>();
  return {
    add(childId, remediation) {
      const list = queued.get(childId) ?? [];
      const known = list.some(
        (r) =>
          r.skillId === remediation.skillId && r.misconceptionId === remediation.misconceptionId,
      );
      if (!known) queued.set(childId, [...list, remediation]);
    },
    peek(childId) {
      return queued.get(childId)?.[0];
    },
    take(childId) {
      const [first, ...rest] = queued.get(childId) ?? [];
      queued.set(childId, rest);
      return first;
    },
  };
}

/** The app's queue. */
export const remediationQueue = createRemediationQueue();
