// 03 §5.8 hint ladder: five levels (replay, nudge, representation, worked step, show me). Levels
// 2–4 use the template's hint keys in order; when a template lists fewer than three, the missing
// levels are skipped, so the ladder is shorter but each rung keeps its level number.

import type {
  HintStep,
  ItemTemplate,
  LessonStep,
  StimulusSpec,
  WidgetAction,
} from '@number-island/shared';

export interface HintOptions {
  template: ItemTemplate;
  vars: Record<string, string | number>;
  solution: LessonStep[];
  /** Level 3 picture for abstract/pictorial items (e.g. a ten-frame beside a number pad). */
  overlay?: StimulusSpec;
  /** Level 2 / level 3 highlight actions for concrete items. */
  nudge?: WidgetAction[];
  highlight?: WidgetAction[];
}

const actionsOf = (steps: LessonStep[]): WidgetAction[] =>
  steps.flatMap((s) => (s.action ? [s.action] : []));

/**
 * The worked-step rung shows the first step(s) of the solution in demo mode, but never the final
 * step, which enters the answer.
 */
export function workedStepActions(solution: LessonStep[]): WidgetAction[] {
  if (solution.length < 2) return [];
  const n = Math.max(1, Math.floor((solution.length - 1) / 2));
  return actionsOf(solution.slice(0, n));
}

export function buildHints(o: HintOptions): HintStep[] {
  const { template: t, vars } = o;
  const keys = t.narration.hints;
  const replay: WidgetAction[] = [{ op: 'replay-prompt' }];
  if (t.format === 'dot-flash') replay.push({ op: 'flash' });
  const hints: HintStep[] = [{ level: 1, kind: 'replay', say: 'h.replay', vars, actions: replay }];
  if (keys[0]) {
    hints.push({
      level: 2,
      kind: 'nudge',
      say: keys[0],
      vars,
      ...(o.nudge && o.nudge.length > 0 ? { actions: o.nudge } : {}),
    });
  }
  if (keys[1]) {
    const concrete = t.tier === 'concrete';
    hints.push({
      level: 3,
      kind: 'representation',
      say: keys[1],
      vars,
      ...(!concrete && o.overlay ? { overlay: o.overlay } : {}),
      ...(concrete && o.highlight && o.highlight.length > 0 ? { actions: o.highlight } : {}),
    });
  }
  if (keys[2]) {
    hints.push({
      level: 4,
      kind: 'worked-step',
      say: keys[2],
      vars,
      actions: workedStepActions(o.solution),
    });
  }
  hints.push({ level: 5, kind: 'show-me', say: 'h.show-me', vars, actions: actionsOf(o.solution) });
  return hints;
}
