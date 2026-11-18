import { describe, expect, it } from 'vitest';
import {
  type CompiledNarrationEntry,
  compiledNarrationEntrySchema,
  type ItemTemplate,
  itemTemplateSchema,
  type LessonSpec,
  lessonExampleSchema,
  lessonSpecSchema,
  type MisconceptionSpec,
  misconceptionSpecSchema,
  type NarrationEntry,
  type NarrationJson,
  narrationEntrySchema,
  narrationJsonSchema,
  type Skill,
  skillKindSchema,
  skillSchema,
} from './content';

// Samples follow the YAML examples in 03 §4.2–§4.5 and §8.2, in compiled (normalised) form.

const lesson: LessonSpec = {
  mode: 'authored',
  templateId: 'ADD.08.t1',
  intro: 'sk.ADD.08.intro',
  worked: [
    {
      params: { a: 8, b: 5, op: '+', unknown: 'result', family: 'make-ten' },
      steps: [
        { actor: 'demo', say: 'ls.ADD.08.w1.s1', action: { op: 'show-addends' } },
        {
          actor: 'demo',
          say: 'ls.ADD.08.w1.s2',
          vars: { give: 2 },
          action: { op: 'move-counters', args: { fromFrame: 1, toFrame: 0, count: 2 } },
        },
        {
          actor: 'child',
          say: 'ls.ADD.08.w1.s3',
          action: { op: 'highlight', args: { target: 'frame-0' } },
          expect: { op: 'count-total' },
        },
        { actor: 'child', say: 'ls.ADD.08.w1.s4', expect: { answer: true } },
      ],
    },
  ],
  faded: [
    {
      params: { a: 9, b: 4, op: '+', unknown: 'result', family: 'make-ten' },
      childSteps: 1,
    },
    { templateId: 'ADD.08.t3', seed: 1234, target: 'typical', childSteps: 2 },
  ],
  scaffolded: { count: 2, hintStart: 2 },
  testOut: { items: 3, minCorrect: 3, templateIds: ['ADD.08.t4'] },
  outro: 'ls.ADD.08.outro',
};

const skill: Skill = {
  id: 'ADD.08',
  name: 'Make ten to add (8 + 5 = 8 + 2 + 3)',
  strand: 'ADD',
  kind: 'strategy',
  grade: '1',
  standards: { ccss: ['1.OA.C.6'], wi: ['M.1.OA.C.6', 'M.1.OA.C.6b'] },
  prerequisites: ['CPS.11', 'CPS.04', 'ADD.06'],
  encompasses: { 'CPS.03': 1.0, 'CPS.11': 1.0 },
  related: ['ADD.16', 'ADD.17', 'ADD.13'],
  gateway: true,
  representations: ['double-ten-frame', 'rekenrek', 'number-bond', 'open-number-line', 'symbols'],
  templates: ['ADD.08.t1', 'ADD.08.t3', 'ADD.08.t4', 'ADD.08.t5'],
  lesson,
  misconceptions: ['MC.count-all-instead', 'MC.forgot-the-ten'],
  narration: { intro: 'sk.ADD.08.intro' },
};

const fluencySkill: Skill = {
  ...skill,
  id: 'ADD.14',
  name: 'Fluency: sums within 20',
  kind: 'fact-fluency',
  grade: '2',
  standards: { ccss: ['2.OA.B.2'] },
  gateway: false,
  representations: ['symbols'],
  fluency: { medianLatencyMs: 3500 },
  lesson: {
    mode: 'none',
    templateId: 'ADD.14.t1',
    intro: 'sk.ADD.14.intro',
    worked: [],
    faded: [],
    scaffolded: { count: 0, hintStart: 2 },
    testOut: { items: 3, minCorrect: 3 },
  },
};

const template: ItemTemplate = {
  id: 'ADD.08.t5',
  skillId: 'ADD.08',
  format: 'numeral-pick',
  tier: 'abstract',
  representation: 'symbols',
  expectedLatencyMs: 8000,
  generator: 'addsub.facts',
  params: {
    a: { kind: 'int', min: 6, max: 9 },
    b: { kind: 'int', min: 3, max: 9 },
    op: { kind: 'const', value: '+' },
    unknown: { kind: 'choice', values: ['result', 'change'], weights: [3, 1] },
    family: { kind: 'const', value: 'make-ten' },
  },
  constraints: ['a + b >= 11', 'a + b <= 18'],
  difficulty: { base: 0.0, features: { size: 0.5 } },
  narration: { prompt: 'tp.ADD.08.t5.prompt', hints: ['h.addsub.make-ten.nudge'] },
  distractors: [{ rule: 'MC.count-start-number' }, { rule: 'MC.forgot-the-ten' }],
};

const misconception: MisconceptionSpec = {
  id: 'MC.count-start-number',
  name: 'Counts the starting number when counting on',
  area: 'addsub',
  detect: { kind: 'answer', rule: 'countStartNumber' },
  appliesTo: { generators: ['addsub.facts', 'story.addsub', 'mda.addsub'] },
  skills: ['ADD.03', 'ADD.04', 'ADD.15', 'ADD.27', 'MDA.13'],
  remediation: ['CNT.07', 'ADD.03'],
  feedback: 'fb.mc.count-start-number',
  priority: 60,
  parentTip:
    'When counting on from 5 to add 3, say "5" quietly and count "6, 7, 8" on three fingers.',
  examples: [
    {
      params: { a: 5, b: 3, op: '+', unknown: 'result' },
      response: { kind: 'number', value: 7 },
      match: true,
    },
    {
      generator: 'addsub.facts',
      params: { a: 5, b: 3, op: '+', unknown: 'result' },
      response: { kind: 'number', value: 9 },
      meta: { latencyMs: 4200, trace: [{ t: 'tap', target: 'obj-0', ms: 300 }] },
      match: false,
    },
  ],
};

describe('content schemas round-trip', () => {
  it('Skill (strategy with an authored lesson)', () => {
    expect(skillSchema.parse(skill)).toStrictEqual(skill);
  });
  it('Skill (fact-fluency with a none lesson)', () => {
    expect(skillSchema.parse(fluencySkill)).toStrictEqual(fluencySkill);
  });
  it('ItemTemplate', () => {
    expect(itemTemplateSchema.parse(template)).toStrictEqual(template);
  });
  it('LessonSpec with worked and faded examples', () => {
    expect(lessonSpecSchema.parse(lesson)).toStrictEqual(lesson);
  });
  it('MisconceptionSpec', () => {
    expect(misconceptionSpecSchema.parse(misconception)).toStrictEqual(misconception);
  });
  it('NarrationEntry, CompiledNarrationEntry and NarrationJson', () => {
    const entries: NarrationEntry[] = [
      { text: "Let's make a ten first. A full ten helps us add!" },
      {
        text: 'Fill the shell to make ten. How many is {a} + {b}?',
        say: 'Fill the shell to make ten. How many is {a} plus {b}?',
      },
      { text: 'Move {give} from this group to fill the ten.', voice: 'pip', style: 'playful' },
      { text: 'You made a ten. Count the ten too!', level: 'K' },
    ];
    for (const e of entries) expect(narrationEntrySchema.parse(e)).toStrictEqual(e);

    const compiled: CompiledNarrationEntry = {
      text: '{a} + {b} = ?',
      say: 'What is {a} plus {b}?',
      voice: 'narrator',
      clips: ['tp.ADD.08.t4.prompt.0', '$a|num', 'word.plus', '$b|num.end'],
    };
    expect(compiledNarrationEntrySchema.parse(compiled)).toStrictEqual(compiled);
    const json: NarrationJson = {
      'tp.ADD.08.t4.prompt': compiled,
      'fb.correct.1': { text: 'Yes!', clips: ['fb.correct.1'] },
    };
    expect(narrationJsonSchema.parse(json)).toStrictEqual(json);
  });
});

describe('content schemas reject invalid samples', () => {
  it('Skill', () => {
    expect(skillSchema.safeParse({ ...skill, kind: 'trick' }).success).toBe(false);
    expect(skillSchema.safeParse({ ...skill, grade: 1 }).success).toBe(false);
    expect(skillSchema.safeParse({ ...skill, strand: 'XYZ' }).success).toBe(false);
    expect(skillSchema.safeParse({ ...skill, encompasses: { 'CPS.03': 1.5 } }).success).toBe(false);
    expect(skillSchema.safeParse({ ...skill, prerequisites: ['add.1'] }).success).toBe(false);
    expect(skillKindSchema.options).toEqual([
      'concept',
      'procedure',
      'strategy',
      'fact-fluency',
      'problem-solving',
    ]);
  });
  it('ItemTemplate', () => {
    expect(itemTemplateSchema.safeParse({ ...template, format: 'spinner' }).success).toBe(false);
    expect(itemTemplateSchema.safeParse({ ...template, id: 'ADD.08' }).success).toBe(false);
    expect(itemTemplateSchema.safeParse({ ...template, generator: 'facts' }).success).toBe(false);
    expect(
      itemTemplateSchema.safeParse({
        ...template,
        narration: { prompt: 'tp.ADD.08.t5.prompt', hints: ['h.a', 'h.b', 'h.c', 'h.d'] },
      }).success,
    ).toBe(false);
  });
  it('LessonSpec and LessonExample', () => {
    expect(lessonSpecSchema.safeParse({ ...lesson, worked: [] }).success).toBe(false);
    expect(
      lessonSpecSchema.safeParse({ ...lesson, scaffolded: { count: 5, hintStart: 2 } }).success,
    ).toBe(false);
    expect(
      lessonSpecSchema.safeParse({ ...lesson, scaffolded: { count: 2, hintStart: 4 } }).success,
    ).toBe(false);
    // exactly one of params / seed
    expect(lessonExampleSchema.safeParse({}).success).toBe(false);
    expect(lessonExampleSchema.safeParse({ params: { a: 1 }, seed: 3 }).success).toBe(false);
    expect(lessonExampleSchema.safeParse({ seed: 3, childSteps: 0 }).success).toBe(false);
  });
  it('MisconceptionSpec', () => {
    expect(
      misconceptionSpecSchema.safeParse({ ...misconception, id: 'count-start-number' }).success,
    ).toBe(false);
    expect(
      misconceptionSpecSchema.safeParse({ ...misconception, feedback: 'h.addsub.nudge' }).success,
    ).toBe(false);
    expect(
      misconceptionSpecSchema.safeParse({
        ...misconception,
        detect: { kind: 'vibes', rule: 'x' },
      }).success,
    ).toBe(false);
  });
  it('narration entries', () => {
    expect(narrationEntrySchema.safeParse({ text: 'Hi', voice: 'robot' }).success).toBe(false);
    expect(narrationEntrySchema.safeParse({ say: 'no text' }).success).toBe(false);
    expect(compiledNarrationEntrySchema.safeParse({ text: 'Hi' }).success).toBe(false);
    expect(narrationJsonSchema.safeParse({ 'Bad.key': { text: 'Hi', clips: [] } }).success).toBe(
      false,
    );
  });
});
