// 02 §5.8 UnlockRule evaluation (family-wide, 05 §4 rule 7). Island facts come from the island
// projection; learner facts (skills, grades, mastered counts) are optional, because the island and
// collection folds see only the event log. A rule that needs a fact that was not supplied is false.

import type { BuildingId, Grade, Skill, SkillId, UnlockRule } from '@number-island/shared';
import { GRADES } from '@number-island/shared';

export interface UnlockFacts {
  /** Highest level built per building id (buildings are never un-built). */
  buildings: Readonly<Record<BuildingId, number>>;
  roadLength: number;
  residentCount: number;
  /** Learner facts, family-wide ("any child"). Omitted → rules that need them are false. */
  skillAtLeast?: (skill: SkillId, atLeast: 'ready' | 'practiced' | 'mastered') => boolean;
  skillKindAtLeast?: (kind: Skill['kind'], atLeast: 'practiced' | 'mastered') => boolean;
  /** The highest profile grade of any child. */
  maxGrade?: Grade | null;
  /** The most skills any single child has mastered. */
  maxMasteredCount?: number;
}

export function evaluateUnlock(rule: UnlockRule, facts: UnlockFacts): boolean {
  if ('start' in rule) return true;
  if ('all' in rule) return rule.all.every((r) => evaluateUnlock(r, facts));
  if ('any' in rule) return rule.any.some((r) => evaluateUnlock(r, facts));
  if ('skill' in rule) return facts.skillAtLeast?.(rule.skill, rule.atLeast) ?? false;
  if ('skillKind' in rule) return facts.skillKindAtLeast?.(rule.skillKind, rule.atLeast) ?? false;
  if ('minGrade' in rule) {
    const g = facts.maxGrade;
    return g != null && GRADES.indexOf(g) >= GRADES.indexOf(rule.minGrade);
  }
  if ('masteredCount' in rule) return (facts.maxMasteredCount ?? 0) >= rule.masteredCount;
  if ('building' in rule) {
    const level = Object.hasOwn(facts.buildings, rule.building)
      ? facts.buildings[rule.building]
      : 0;
    return (level ?? 0) >= (rule.level ?? 1);
  }
  if ('roadLength' in rule) return facts.roadLength >= rule.roadLength;
  return facts.residentCount >= rule.residentCount;
}
