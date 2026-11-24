// 03 §5.5 story-problem. A narrated island scene, then a question answered in one or more blanks.
// The workspace (counters, ten-frame, bar model, number line, base ten) is a tool the child may
// use; it is never graded, and its use appears only in the trace.
// - One blank answers `number`; several answer `numbers` in blank order.
// - `put-together/both` (both addends unknown, any valid pair) answers state `{ parts: [a, b] }`
//   from its two blanks, checked by `bond.split`.
// Ops: `show-scene`, `act-out {sprite, count}` (puts counters in the workspace), `draw-bar
// {parts}` (draws a bar model), `highlight-line {index}`, plus the generic `answer`.
// The workspace holds at most STORY_COUNTERS_MAX counters in all (an `act-out` that would pass it
// changes nothing); the child's own add-one and take-one are `act-out` with the next count.
// The domain the widget draws is stated and enforced here (README, "Balance and story problems").

import {
  type AnswerSpec,
  type SituationType,
  storyProblemConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import {
  argNumber,
  argNumbers,
  argString,
  type FormatModel,
  type FormatState,
  UnsupportedOpError,
} from './types';

type Config = WidgetConfigOf<'story-problem'>;

export interface StoryProblemState extends FormatState<'story-problem'> {
  entries: (number | null)[];
  sceneShown: boolean;
  /** Counters acted out in the workspace, by sprite. */
  actedOut: { sprite: string; count: number }[];
  /** The bar model's parts, once drawn. */
  bar: number[] | null;
  highlightedLine: number | null;
}

/**
 * 03 §5.5 situation priors (the CCSS situation-table progression). Types the table does not list
 * (`area/product`, `time/elapsed`, `money`, `two-step`, whose difficulty is `steps.two`) are 0.
 */
export const SITUATION_PRIOR: Record<SituationType, number> = {
  'add-to/result': 0,
  'put-together/total': 0,
  'take-from/result': 0.1,
  'put-together/both': 0.2,
  'put-together/addend': 0.6,
  'add-to/change': 0.6,
  'compare/difference-more': 0.6,
  'take-from/change': 0.7,
  'compare/difference-fewer': 0.7,
  'compare/bigger-more': 0.7,
  'compare/smaller-fewer': 0.8,
  'add-to/start': 1.0,
  'take-from/start': 1.1,
  'compare/bigger-fewer': 1.2,
  'compare/smaller-more': 1.2,
  'equal-groups/product': 0,
  'array/product': 0,
  'equal-groups/size': 0.5,
  'equal-groups/groups': 0.4,
  'array/side': 0.6,
  'measure/product': 0.5,
  'measure/size': 0.5,
  'area/product': 0,
  'area/side': 0.6,
  'two-step': 0,
  'time/elapsed': 0,
  money: 0,
};

/** Whether the item answers with a free split (both addends unknown). */
export const answersSplit = (c: Config): boolean => c.situation === 'put-together/both';

/** A story is told in 1 to this many lines (the last one asks the question). */
export const STORY_LINES_MAX = 5;
/** The scene shows at most this many groups of told things, */
export const STORY_SCENE_GROUPS_MAX = 3;
/** each of 1 to this many. */
export const STORY_SCENE_COUNT_MAX = 20;
/** An answer box takes 1 to this many digits. */
export const STORY_DIGITS_MAX = 3;
/** The counters the workspace holds in all (two ten-frames). */
export const STORY_COUNTERS_MAX = 20;
/** A drawn bar has 1 to this many parts, each a whole number from 1 to STORY_BAR_PART_MAX. */
export const STORY_BAR_PARTS_MAX = 3;
export const STORY_BAR_PART_MAX = 999;
/** The workspaces the widget draws. */
export const STORY_WORKSPACES = ['none', 'counters', 'ten-frame', 'bar-model'] as const;

const whole = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

/** The largest number an answer box takes (0 … max): from its digits, never from the answer. */
export const storyEntryMax = (c: Pick<Config, 'blanks'>): number =>
  10 ** Math.max(...c.blanks.map((b) => b.maxDigits), 1) - 1;

/**
 * Why an item's answer is not the one this config asks for (FormatModel.answerIssues): one box
 * answers a whole number its digits can hold; `put-together/both` is checked by `bond.split`
 * with a whole its boxes can hold.
 */
export function storyAnswerIssues(c: Config, answer: AnswerSpec): string[] {
  const max = storyEntryMax(c);
  if (answersSplit(c)) {
    if (answer.kind !== 'state' || answer.checker !== 'bond.split') {
      return ['put-together/both answers bond.split'];
    }
    const total = answer.target.whole;
    return typeof total === 'number' && whole(total, 0, max)
      ? []
      : [`the whole ${String(total)} is not a whole number from 0 to ${max}`];
  }
  if (answer.kind !== 'number') return ['a story with one box answers a number'];
  return whole(answer.value, 0, max)
    ? []
    : [`the answer ${answer.value} is not a whole number from 0 to ${max}`];
}

const configSchema = storyProblemConfigSchema.superRefine((c, ctx) => {
  if (c.blanks.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['blanks'], message: 'a story asks for an answer' });
  }
  const ids = c.blanks.map((b) => b.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', path: ['blanks'], message: 'blank ids must be distinct' });
  }
  if (answersSplit(c) && c.blanks.length !== 2) {
    ctx.addIssue({
      code: 'custom',
      path: ['blanks'],
      message: 'put-together/both asks for the two parts',
    });
  }
  if (c.lines.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'a story has narrated lines' });
  }
  if (c.lines.length > STORY_LINES_MAX) {
    ctx.addIssue({
      code: 'custom',
      path: ['lines'],
      message: `a story has at most ${STORY_LINES_MAX} lines`,
    });
  }
  if (c.blanks.length > (answersSplit(c) ? 2 : 1)) {
    ctx.addIssue({ code: 'custom', path: ['blanks'], message: 'a story has one answer box' });
  }
  if (c.blanks.some((b) => b.maxDigits > STORY_DIGITS_MAX)) {
    ctx.addIssue({
      code: 'custom',
      path: ['blanks'],
      message: `a box takes at most ${STORY_DIGITS_MAX} digits`,
    });
  }
  if (c.unit !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['unit'], message: 'a unit beside the box is not drawn' });
  }
  if (!(STORY_WORKSPACES as readonly string[]).includes(c.workspace)) {
    ctx.addIssue({
      code: 'custom',
      path: ['workspace'],
      message: `the workspace is one of ${STORY_WORKSPACES.join(', ')}`,
    });
  }
  if (c.scene.kind === 'scene') {
    const counts = c.scene.sprites.map((g) => g.count);
    if (
      counts.length > STORY_SCENE_GROUPS_MAX ||
      counts.some((n) => !whole(n, 1, STORY_SCENE_COUNT_MAX))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['scene'],
        message: `a scene shows at most ${STORY_SCENE_GROUPS_MAX} groups of 1 to ${STORY_SCENE_COUNT_MAX}`,
      });
    }
  } else if (c.scene.kind !== 'none') {
    ctx.addIssue({ code: 'custom', path: ['scene'], message: 'the scene is a scene or none' });
  }
  if (c.situation === 'two-step' && c.steps !== 2) {
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'a two-step story has two steps' });
  }
});

export const storyProblem: FormatModel<'story-problem', StoryProblemState> = {
  format: 'story-problem',
  configSchema,
  answerIssues: storyAnswerIssues,
  features: {
    situation: { weight: 1, doc: 'the 03 §5.5 situation prior (x is the prior itself)' },
    'steps.two': { weight: 0.8, doc: 'a two-step story' },
    extraneous: {
      weight: 0.5,
      doc: 'an unneeded number; the generator sets it (0 from the config alone)',
    },
    inconsistentLanguage: {
      weight: 0.5,
      doc: '"more" in a subtraction story; the generator sets it (0 from the config alone)',
    },
    'workspace.none': { weight: 0.3, doc: 'no workspace tool' },
  },
  featureValues(c: Config, _answer: AnswerSpec) {
    return {
      situation: SITUATION_PRIOR[c.situation],
      'steps.two': c.steps === 2 ? 1 : 0,
      extraneous: 0,
      inconsistentLanguage: 0,
      'workspace.none': c.workspace === 'none' ? 1 : 0,
    };
  },
  initialState: (config) => ({
    config,
    entries: config.blanks.map(() => null),
    sceneShown: false,
    actedOut: [],
    bar: null,
    highlightedLine: null,
  }),
  apply(s, a) {
    switch (a.op) {
      case 'show-scene':
        return { ...s, sceneShown: true };
      case 'act-out': {
        const sprite = argString(a, 'sprite');
        const count = Math.trunc(argNumber(a, 'count') ?? 0);
        if (!sprite || count < 0) return s;
        const rest = s.actedOut.filter((x) => x.sprite !== sprite);
        // A full workspace takes no more: the call changes nothing.
        if (rest.reduce((n, x) => n + x.count, count) > STORY_COUNTERS_MAX) return s;
        return { ...s, actedOut: count === 0 ? rest : [...rest, { sprite, count }] };
      }
      case 'draw-bar': {
        const parts = argNumbers(a, 'parts');
        const drawable =
          parts !== undefined &&
          parts.length >= 1 &&
          parts.length <= STORY_BAR_PARTS_MAX &&
          parts.every((n) => whole(n, 1, STORY_BAR_PART_MAX));
        return drawable ? { ...s, bar: [...parts] } : s;
      }
      case 'highlight-line': {
        const i = argNumber(a, 'index');
        const line = i !== undefined && whole(i, 0, s.config.lines.length - 1) ? i : null;
        return { ...s, highlightedLine: line };
      }
      case 'answer': {
        const values = argNumbers(a, 'values');
        const v = argNumber(a, 'value');
        if (values) return { ...s, entries: s.entries.map((_, i) => values[i] ?? null) };
        if (v !== undefined)
          return { ...s, entries: s.entries.map((_, i) => (i === 0 ? v : null)) };
        return s;
      }
      default:
        throw new UnsupportedOpError('story-problem', a.op);
    }
  },
  toResponse(s) {
    if (s.entries.some((e) => e === null)) return null;
    const values = s.entries as number[];
    if (answersSplit(s.config)) return { kind: 'state', value: { parts: [...values] } };
    return values.length === 1
      ? { kind: 'number', value: values[0] as number }
      : { kind: 'numbers', values };
  },
};
