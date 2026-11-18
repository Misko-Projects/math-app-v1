// Worked solutions and example responses for a generated item (lessons, hint level 5, tests), and
// replaying a solution through the format state model (03 §6.3, §9.4 step 4).

import type { GeneratedItem, ItemTemplate, LessonStep, ResponseValue } from '@number-island/shared';
import { boundTemplate } from '../content/binding';
import { formatModel } from '../formats';
import { itemOutput, requireGenerator } from './generate';

function templateFor(item: GeneratedItem, t?: ItemTemplate): ItemTemplate {
  const template = t ?? boundTemplate(item.templateId);
  if (!template) throw new Error(`template ${item.templateId} is not bound (call initContent)`);
  return template;
}

/** `generator.solution(item)`: the narrated worked solution (LessonStep[]). */
export function itemSolution(item: GeneratedItem, t?: ItemTemplate): LessonStep[] {
  return requireGenerator(templateFor(item, t)).solution(itemOutput(item));
}

/** `generator.exampleCorrect(item)`: a correct response. */
export function itemExampleCorrect(item: GeneratedItem, t?: ItemTemplate): ResponseValue {
  return requireGenerator(templateFor(item, t)).exampleCorrect(itemOutput(item));
}

/**
 * Replays the steps' actions through the format's state model from `initialState` and returns
 * the response the widget would then submit (null when nothing is submittable). Throws when the
 * format has no model yet.
 */
export function replaySteps(
  item: GeneratedItem,
  steps: readonly LessonStep[],
): ResponseValue | null {
  const model = formatModel(item.widget.format);
  if (!model) throw new Error(`format ${item.widget.format} has no state model yet`);
  let state = model.initialState(item.widget);
  for (const s of steps) if (s.action) state = model.apply(state, s.action);
  return model.toResponse(state);
}
