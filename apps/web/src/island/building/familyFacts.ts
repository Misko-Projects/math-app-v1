// The facts unlock rules read, family-wide (05 §4 rule 7; 02 §5.8 `UnlockRule`): the island's
// own (buildings, road, residents) and every child's learner state. A skill rule holds when any
// child reaches it; `minGrade` reads the highest profile grade; `masteredCount` the most skills
// one child has mastered. Statuses come from the learner model at the store's clock.
//
// The learner model needs the full engine (the item core), so the caller passes the loaded
// module: the island loads it for planning anyway.

import type * as EngineModule from '@number-island/engine';
import { islandFacts, type UnlockFacts } from '@number-island/engine/shell';
import type {
  ChildProfile,
  Grade,
  IslandState,
  LearnerState,
  SkillGraph,
  SkillId,
  SkillStatus,
} from '@number-island/shared';
import { GRADES } from '@number-island/shared';

const READY: readonly SkillStatus[] = [
  'ready',
  'learning',
  'practiced',
  'fluent',
  'mastered',
  'needs-review',
];
// `needs-review` was at least practiced (04 §3) and still counts: an unlock never locks again.
const PRACTICED: readonly SkillStatus[] = ['practiced', 'fluent', 'mastered', 'needs-review'];

export interface FamilyLearner {
  profile: Pick<ChildProfile, 'id' | 'grade'>;
  state: LearnerState;
}

export function familyFacts(
  engine: Pick<typeof EngineModule, 'learnerModelFor'>,
  graph: SkillGraph,
  island: IslandState,
  learners: readonly FamilyLearner[],
  now: number,
): UnlockFacts {
  const children = learners.map(({ profile, state }) => {
    const model = engine.learnerModelFor(graph, {
      childId: profile.id,
      isK: profile.grade === 'K',
    });
    const mastered = (s: SkillId) => (state.skills[s]?.masteredAt ?? null) !== null;
    return {
      grade: profile.grade,
      atLeast: (s: SkillId, level: 'ready' | 'practiced' | 'mastered') => {
        if (!(s in graph.skills)) return false;
        if (level === 'mastered') return mastered(s);
        const status = model.status(state, s, now);
        return (level === 'ready' ? READY : PRACTICED).includes(status) || mastered(s);
      },
      masteredCount: Object.keys(state.skills).filter(mastered).length,
    };
  });
  const maxGrade = children.reduce<Grade | null>(
    (best, c) => (best === null || GRADES.indexOf(c.grade) > GRADES.indexOf(best) ? c.grade : best),
    null,
  );
  return {
    ...islandFacts(island),
    skillAtLeast: (skill, level) => children.some((c) => c.atLeast(skill, level)),
    skillKindAtLeast: (kind, level) =>
      Object.values(graph.skills).some(
        (s) => s.kind === kind && children.some((c) => c.atLeast(s.id, level)),
      ),
    maxGrade,
    maxMasteredCount: Math.max(0, ...children.map((c) => c.masteredCount)),
  };
}
