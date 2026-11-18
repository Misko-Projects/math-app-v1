// 04 §5 placement runner.

export {
  ancestorsWithin,
  type BktObservation,
  beginPlacementSession,
  bktPosterior,
  completePlacement,
  gradePrior,
  nearFrontier,
  nextProbe,
  type ProbeScore,
  placementBudget,
  placementCandidates,
  placementConverged,
  placementProbeSeed,
  probeScores,
  probeTemplates,
  recordProbe,
  resumePlacement,
  roundPosterior,
  startPlacement,
} from './runner';
export type {
  PlacementAnswer,
  PlacementBudget,
  PlacementContext,
  PlacementProbeEvent,
  PlacementProbeRecord,
  PlacementRun,
  PlacementSessionEnd,
  PlacementStopReason,
  StartPlacementInput,
} from './types';
