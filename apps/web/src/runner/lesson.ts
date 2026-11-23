// A skill's lesson as the runner plays it (03 §6). Framework-free.
//
// `buildLesson` turns the skill's `LessonSpec` into a script: the worked examples, then the faded
// ones, each with its item (built from fixed params, or generated from a seed at the template's
// easy / typical difficulty, 03 §6.1) and its steps (authored, or the generator's solution).
// A faded example's last `childSteps` steps are the child's; the demo always does at least one.
//
// An example whose template the hosting workshop cannot show is left out. A lesson with no
// example to show (mode `none`, 03 §6.4) has no script: there is nothing to demonstrate.

import type * as EngineModule from '@number-island/engine';
import type {
  GeneratedItem,
  ItemTemplate,
  LessonExample,
  LessonStep,
  NarrationKey,
  Skill,
  SkillGraph,
  SkillId,
  TemplateId,
} from '@number-island/shared';

export type LessonEngine = Pick<
  typeof EngineModule,
  'generateItem' | 'generateItemFromParams' | 'itemSolution'
>;

export interface LessonExamplePlay {
  phase: 'worked' | 'faded';
  /** The example's place in its phase (0-based), as `lesson.step` records it. */
  example: number;
  item: GeneratedItem;
  template: ItemTemplate;
  steps: LessonStep[];
  /** The first step that is the child's; `steps.length` when the demo does them all. */
  childFrom: number;
}

export interface LessonScript {
  skillId: SkillId;
  templateId: TemplateId;
  intro: NarrationKey;
  outro: NarrationKey | null;
  examples: LessonExamplePlay[];
  scaffolded: { count: number; hintStart: 1 | 2 | 3 };
}

/** 03 §6.1: without template stats an easy example aims at −1.0 and a typical one at 0. */
const FALLBACK_TARGET = { easy: -1, typical: 0 } as const;

function exampleItem(
  engine: LessonEngine,
  graph: SkillGraph,
  template: ItemTemplate,
  example: LessonExample,
): GeneratedItem {
  if (example.params !== undefined) return engine.generateItemFromParams(template, example.params);
  const target = example.target ?? 'typical';
  const stats = graph.templateStats[template.id];
  const difficulty = stats
    ? target === 'easy'
      ? stats.p10
      : stats.median
    : FALLBACK_TARGET[target];
  return engine.generateItem(template, example.seed ?? 0, { difficulty });
}

/** The skill's lesson as a script, or null when it has no example the workshop can show. */
export function buildLesson(
  engine: LessonEngine,
  graph: SkillGraph,
  skill: Skill,
  hosts: (template: ItemTemplate) => boolean,
): LessonScript | null {
  const { lesson } = skill;
  const examples: LessonExamplePlay[] = [];
  for (const phase of ['worked', 'faded'] as const) {
    lesson[phase].forEach((example, index) => {
      const template = graph.templates[example.templateId ?? lesson.templateId];
      if (!template || !hosts(template)) return;
      const item = exampleItem(engine, graph, template, example);
      const steps = example.steps ?? engine.itemSolution(item, template);
      if (steps.length === 0) return;
      const child =
        phase === 'faded' ? Math.min(Math.max(example.childSteps ?? 1, 1), steps.length - 1) : 0;
      examples.push({
        phase,
        example: index,
        item,
        template,
        steps,
        childFrom: steps.length - child,
      });
    });
  }
  if (examples.length === 0) return null;
  const main = graph.templates[lesson.templateId];
  return {
    skillId: skill.id,
    templateId: lesson.templateId,
    intro: lesson.intro,
    outro: lesson.outro ?? null,
    examples,
    // Scaffolded items come from the lesson's own template (03 §6.2): none when it cannot show.
    scaffolded: {
      count: main && hosts(main) ? lesson.scaffolded.count : 0,
      hintStart: lesson.scaffolded.hintStart,
    },
  };
}

/** Whether a skill's lesson can open at all: it has an example on a template the workshop shows. */
export function lessonPlayable(
  graph: SkillGraph,
  skill: Skill,
  hosts: (template: ItemTemplate) => boolean,
): boolean {
  return [...skill.lesson.worked, ...skill.lesson.faded].some((example) => {
    const template = graph.templates[example.templateId ?? skill.lesson.templateId];
    return template !== undefined && hosts(template);
  });
}
