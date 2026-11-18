// Engine-local types of the placement runner (04 §5). The run is a plain serializable object
// (JSON round-trips exactly), advanced only by the pure functions in ./runner.

import type {
  ChildContext,
  EventPayloads,
  LearnerState,
  SkillGraph,
  SkillId,
  StrandId,
  TemplateId,
  Tier,
} from '@number-island/shared';
import type { EngineParams } from '../params';

/** Why a placement stopped (the `placement.completed` reason). */
export type PlacementStopReason = EventPayloads['placement.completed']['reason'];

/** Why a mini-session ended before the placement did. */
export type PlacementSessionEnd = 'budget' | 'frustration';

export interface PlacementBudget {
  /** Items per mini-session. */
  perSession: number;
  /** Mini-sessions allowed. */
  sessions: number;
}

/** One recorded probe, in order. */
export interface PlacementProbeRecord {
  skillId: SkillId;
  templateId: TemplateId;
  seed: number;
  correct: boolean;
  skipped: boolean;
  /** p of the probed skill after its own update (the `placement.probe` posterior). */
  posterior: number;
  ts: number;
  /** 0-based mini-session the probe belongs to. */
  session: number;
}

export interface PlacementRun {
  placementId: string;
  /** null = initial placement (every graph skill); a strand = incremental mini-placement. */
  strand: StrandId | null;
  budget: PlacementBudget;
  /** Skills whose p the placement estimates (sorted). Includes `onTrack`. */
  scope: SkillId[];
  /** Scope skills already on the practiced track: p = 0.95, never probed, not output (sorted). */
  onTrack: SkillId[];
  /** p(v) for every graph skill. Only scope skills off the practiced track ever change. */
  p: Record<SkillId, number>;
  /** Probes per skill (absent = 0). */
  probeCount: Record<SkillId, number>;
  /** Downward-search priority: direct prerequisites of a wrongly answered probe (cleared when probed). */
  boost: Record<SkillId, number>;
  probes: PlacementProbeRecord[];
  /** Items used across all mini-sessions. */
  items: number;
  session: {
    /** 0-based mini-session index. */
    index: number;
    /** Items used in this mini-session. */
    items: number;
    /** Consecutive wrong or skipped probes in this mini-session. */
    misses: number;
    /** Set when the mini-session ended before the placement did (call `beginPlacementSession`). */
    ended: PlacementSessionEnd | null;
  };
  /** Set once the placement has stopped; then call `completePlacement`. */
  done: PlacementStopReason | null;
}

export interface StartPlacementInput {
  graph: SkillGraph;
  child: ChildContext;
  state: LearnerState;
  placementId: string;
  strand: StrandId | null;
  params?: EngineParams;
}

export interface PlacementContext {
  graph: SkillGraph;
  child: ChildContext;
  params?: EngineParams;
}

/** What the TaskRunner reports for a presented probe. */
export interface PlacementAnswer {
  skillId: SkillId;
  templateId: TemplateId;
  seed: number;
  correct: boolean;
  skipped: boolean;
  latencyMs: number;
  ts: number;
  /** Tier the item was presented at (expected latency for the slow-correct rule). */
  tier: Tier;
  /** k for a k-choice item: the BKT guess becomes 1/k. */
  choices?: number;
  /** The runner's frustration signal on this answer (04 §5 stop rule). */
  frustrationSignal?: boolean;
}
