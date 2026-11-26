// mul.groups (03 §5.6): `groups` equal groups of `perGroup`. Derived: `result` = groups × perGroup.
// `unknown` says what the child finds: the total (MUL.02–04, SUB.09), the size of each group
// (fair sharing, MUL.05) or the number of groups (making groups, MUL.22).
// Formats (K02 slice 3a):
// - equal-groups: `mode: read` shows the groups and asks the total (number); `mode: build` gives
//   the containers (or, for the number of groups, lets the child add them) and answers state
//   `groups.equal` with the typed unknown.
// - array-build: `read` shows `groups` rows of `perGroup` and asks the total; `build-dims` asks for
//   that many rows of that many (`array.dims`, orientation matters: "3 rows of 4").
// - number-pad: a picture from the template's representation (objects in groups or, when the total
//   is given, a pile; groups; an array; dots in groups; jumps on a number line; none for symbols),
//   and with `signs` (or the symbols representation) a number sentence: groups × perGroup, total ÷
//   groups, total ÷ perGroup; without `signs` the total is a sum of equal addends.
// - dot-flash: groups, an array or dots in groups flash; type the total.
// - number-line-jump: from 0 in jumps of perGroup. The total: `groups` jumps, then say where you
//   land. The number of groups: hop to the total (named) in jumps of perGroup.
// Bounds come from the formats (GROUPS_MAX, GROUP_CAPACITY, the pile limits, ARRAY_SIDE_MAX); a
// draw outside them is redrawn (`accepts`).
// Not built yet (spec params and formats a later slice adds): `area-tiles`, a ten-rod container
// (MUL.11), the number-line representation on equal-groups. mul.facts (MUL.06–09, MUL.13) can share
// `mulExpression` and the number-line picture below; it differs in that its items ask a fact, so
// its abstract items show no countable picture.

import type {
  ExpressionToken,
  LessonStep,
  ParamValues,
  ResponseValue,
  StimulusSpec,
} from '@number-island/shared';
import { ARRAY_SIDE_MAX } from '../../formats/array-build';
import { GROUP_CAPACITY, GROUPS_MAX, groupsPileMax } from '../../formats/equal-groups';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  layoutSeed,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import { SHARE_SPRITES } from '../div/share';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const UNKNOWNS = ['total', 'size', 'groups'] as const;
const MODES = ['read', 'build'] as const;
const CONTAINERS = ['raft', 'basket', 'plate', 'nest'] as const;
/** The farthest a skip-count line goes (to 100 by tens). */
export const MUL_LINE_MAX = 100;

const say = (
  key: string,
  vars: Record<string, string | number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

/** perGroup, 2 × perGroup, … up to the total: "4, 8, 12". */
export const skipCounts = (groups: number, perGroup: number): string =>
  Array.from({ length: groups }, (_, k) => (k + 1) * perGroup).join(', ');

/** The number sentence of an item: `signs` gives × or ÷, otherwise a sum of equal addends. */
export function mulExpression(
  groups: number,
  perGroup: number,
  unknown: string,
  signs: boolean,
): ExpressionToken[] | null {
  const total = groups * perGroup;
  const tail: ExpressionToken[] = [
    { t: 'rel', v: '=' },
    { t: 'blank', id: 'x' },
  ];
  if (unknown === 'total') {
    if (signs) {
      return [{ t: 'num', v: groups }, { t: 'op', v: '×' }, { t: 'num', v: perGroup }, ...tail];
    }
    const sum: ExpressionToken[] = [];
    for (let k = 0; k < groups; k += 1) {
      if (k > 0) sum.push({ t: 'op', v: '+' });
      sum.push({ t: 'num', v: perGroup });
    }
    return [...sum, ...tail];
  }
  if (!signs) return null;
  const by = unknown === 'size' ? groups : perGroup;
  return [{ t: 'num', v: total }, { t: 'op', v: '÷' }, { t: 'num', v: by }, ...tail];
}

/** The number line a jump item or picture uses: 0 to one jump past the total. */
function lineOf(groups: number, perGroup: number) {
  const total = groups * perGroup;
  return { min: 0, max: Math.min(MUL_LINE_MAX + perGroup, total + perGroup), ticks: perGroup };
}

function asked(p: ParamValues): number {
  const u = asStr(p.unknown, 'total');
  if (u === 'size') return asNum(p.perGroup);
  if (u === 'groups') return asNum(p.groups);
  return asNum(p.result);
}

/** Containers a build may add when the number of groups is asked. */
const maxGroupsOf = (groups: number) => Math.min(GROUPS_MAX, groups + 2);

export const mulGroups: GeneratorDef = {
  id: 'mul.groups',
  formats: ['equal-groups', 'array-build', 'number-pad', 'dot-flash', 'number-line-jump'],
  params: {
    groups: {
      type: 'int',
      default: { kind: 'int', min: 2, max: 5 },
      doc: 'how many groups (rows); 1–6, an array 1–10',
    },
    perGroup: {
      type: 'int',
      default: { kind: 'int', min: 2, max: 5 },
      doc: 'how many in each group (row); 1–10',
    },
    unknown: {
      type: 'string',
      values: [...UNKNOWNS],
      default: { kind: 'const', value: 'total' },
      doc: 'what the child finds: the total, the size of each group (sharing) or the number of groups',
    },
    mode: {
      type: 'string',
      values: [...MODES],
      default: { kind: 'const', value: 'read' },
      doc: 'equal-groups: read the groups shown (the total only), or build them; array-build: read or build-dims',
    },
    signs: {
      type: 'bool',
      default: { kind: 'const', value: false },
      doc: 'number-pad: write the item with × or ÷ (grade 3); otherwise a sum of equal addends',
    },
    container: {
      type: 'string',
      values: [...CONTAINERS],
      default: { kind: 'choice', values: [...CONTAINERS] },
      doc: 'equal-groups: what holds each group',
    },
    sprite: {
      type: 'string',
      values: [...SHARE_SPRITES],
      default: { kind: 'choice', values: [...SHARE_SPRITES] },
      doc: 'what is grouped (a noun with clips)',
    },
    flashMs: {
      type: 'int',
      default: { kind: 'const', value: 2000 },
      doc: 'dot-flash: how long the picture shows',
    },
  },
  derived: ['result'],
  features: {
    product: { weight: 0.3, doc: 'result / 10: the size of the total' },
    'factor.over5': { weight: 0.4, doc: 'a factor above 5 (harder to skip-count)' },
    'unknown.size': { weight: 0.5, doc: 'the size of each group is asked (sharing)' },
    'unknown.groups': { weight: 0.4, doc: 'the number of groups is asked (making groups)' },
  },
  narration: [
    'gen.mul.groups.count-by',
    'gen.mul.groups.total',
    'gen.mul.groups.fill',
    'gen.mul.groups.share',
    'gen.mul.groups.each',
    'gen.mul.groups.make-group',
    'gen.mul.groups.how-many-groups',
    'gen.mul.groups.rows',
    'gen.mul.groups.look',
    'gen.mul.groups.hop',
    'gen.mul.groups.land',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    return { result: asNum(p.groups) * asNum(p.perGroup) };
  },
  accepts(p, t) {
    const groups = asNum(p.groups);
    const per = asNum(p.perGroup);
    const total = groups * per;
    const unknown = asStr(p.unknown, 'total');
    const mode = asStr(p.mode, 'read');
    if (groups < 1 || per < 1) return false;
    switch (t.format) {
      case 'equal-groups': {
        if (groups > GROUPS_MAX || per > GROUP_CAPACITY) return false;
        if (mode === 'read') return unknown === 'total';
        if (unknown === 'total') return true;
        const places = unknown === 'groups' ? maxGroupsOf(groups) : groups;
        return total <= groupsPileMax(places);
      }
      case 'array-build':
        return groups <= ARRAY_SIDE_MAX && per <= ARRAY_SIDE_MAX && unknown === 'total';
      case 'dot-flash':
        return unknown === 'total' && groups <= GROUPS_MAX && per <= GROUP_CAPACITY;
      case 'number-line-jump':
        return unknown !== 'size' && total <= MUL_LINE_MAX;
      case 'number-pad': {
        const rep = t.representation ?? 'symbols';
        if (rep === 'symbols')
          return mulExpression(groups, per, unknown, p.signs === true) !== null;
        if (rep === 'number-line') return unknown === 'total' && total <= MUL_LINE_MAX;
        if (rep === 'objects' || rep === 'groups' || rep === 'dots') {
          return groups <= GROUPS_MAX && per <= GROUP_CAPACITY && total <= GROUPS_PILE_CAP;
        }
        return groups <= ARRAY_SIDE_MAX && per <= ARRAY_SIDE_MAX;
      }
      default:
        return false;
    }
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t, rng } = ctx;
    const groups = asNum(params.groups);
    const perGroup = asNum(params.perGroup);
    const total = groups * perGroup;
    const unknown = asStr(params.unknown, 'total') as (typeof UNKNOWNS)[number];
    const mode = asStr(params.mode, 'read');
    const sprite = asStr(params.sprite, 'shell');
    const signs = params.signs === true;
    const value = asked(params);
    const vars = pickVars(t, { groups, perGroup, total, sprite });
    const math: Record<string, number> = {
      product: total / 10,
      'factor.over5': Math.max(groups, perGroup) > 5 ? 1 : 0,
      'unknown.size': unknown === 'size' ? 1 : 0,
      'unknown.groups': unknown === 'groups' ? 1 : 0,
    };
    const rep = t.representation;
    let p: PartialOutput;
    switch (t.format) {
      case 'equal-groups':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'equal-groups',
            groups,
            perGroup,
            unknown,
            mode: mode === 'build' ? 'build' : 'read',
            container: asStr(params.container, 'basket') as (typeof CONTAINERS)[number],
            sprite,
            maxGroups: unknown === 'groups' ? maxGroupsOf(groups) : groups,
          },
          answer:
            mode === 'build'
              ? { kind: 'state', checker: 'groups.equal', target: { groups, perGroup, value } }
              : { kind: 'number', value },
        };
        break;
      case 'array-build': {
        const side = Math.max(groups, perGroup) <= 5 ? 6 : ARRAY_SIDE_MAX;
        const build = mode === 'build';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'array-build',
            maxRows: side,
            maxCols: side,
            mode: build ? 'build-dims' : 'read',
            rows: groups,
            cols: perGroup,
            orientationMatters: true,
            sprite,
            gridShown: rep === 'tiles' || rep === 'area-grid',
          },
          answer: build
            ? {
                kind: 'state',
                checker: 'array.dims',
                target: { rows: groups, cols: perGroup, orientationMatters: true },
              }
            : { kind: 'number', value: total },
        };
        break;
      }
      case 'dot-flash':
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'dot-flash',
            stimulus: flashPicture(rep ?? 'groups', groups, perGroup, sprite),
            flashMs: asNum(params.flashMs, 2000),
            reflashes: 1,
            input: 'pad',
          },
          answer: { kind: 'number', value: total },
        };
        break;
      case 'number-line-jump': {
        const line = lineOf(groups, perGroup);
        const landing = unknown === 'total';
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-line-jump',
            min: line.min,
            max: line.max,
            ticksEvery: line.ticks,
            labelsEvery: landing ? null : line.ticks,
            start: 0,
            goal: 'land-on',
            target: total,
            allowedJumps: [perGroup],
            path: 'line',
            thenAsk: landing ? 'landing' : null,
          },
          answer: {
            kind: 'state',
            checker: 'jumps.reach',
            target: {
              start: 0,
              target: total,
              allowedJumps: [perGroup],
              ...(landing ? { value: total } : {}),
            },
          },
          highlight: [{ op: 'highlight', args: { at: 0 } }],
        };
        break;
      }
      case 'number-pad': {
        const r = rep ?? 'symbols';
        const expr =
          r === 'symbols' || signs ? mulExpression(groups, perGroup, unknown, signs) : null;
        p = {
          params,
          vars,
          math,
          widget: {
            format: 'number-pad',
            stimulus: picture(r, groups, perGroup, unknown, sprite, rng),
            ...(expr ? { expression: { tokens: expr } } : {}),
            blanks: [{ id: 'x', maxDigits: value >= 100 ? 3 : 2 }],
            unit: null,
          },
          answer: { kind: 'number', value },
        };
        break;
      }
      default:
        throw new Error(`mul.groups cannot build ${t.format}`);
    }
    return finish(mulGroups, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    const a = out.answer;
    const groups = asNum(out.params.groups);
    const perGroup = asNum(out.params.perGroup);
    if (a.kind !== 'state') return correctFromAnswer(a);
    if (a.checker === 'groups.equal') {
      return {
        kind: 'state',
        value: { groups: new Array<number>(groups).fill(perGroup), value: asked(out.params) },
      };
    }
    if (a.checker === 'array.dims')
      return { kind: 'state', value: { rows: groups, cols: perGroup } };
    const jumps = new Array<number>(groups).fill(perGroup);
    return {
      kind: 'state',
      value: { jumps, ...(a.target.value !== undefined ? { value: groups * perGroup } : {}) },
    };
  },
  solution(out): LessonStep[] {
    const w = out.widget;
    const groups = asNum(out.params.groups);
    const perGroup = asNum(out.params.perGroup);
    const total = groups * perGroup;
    const unknown = asStr(out.params.unknown, 'total');
    const counts = skipCounts(groups, perGroup);
    const value = asked(out.params);
    switch (w.format) {
      case 'equal-groups': {
        if (w.mode === 'read') {
          return [
            say('gen.mul.groups.count-by', { perGroup }, { op: 'skip-count' }),
            say('gen.mul.groups.total', { counts, total }, { op: 'answer', args: { value } }),
          ];
        }
        const steps: LessonStep[] = [];
        for (let k = 0; k < groups; k += 1) {
          if (unknown === 'groups') {
            steps.push(say('gen.mul.groups.make-group', { perGroup }, { op: 'add-group' }));
          }
          const key = unknown === 'size' ? 'gen.mul.groups.share' : 'gen.mul.groups.fill';
          steps.push(
            say(key, { perGroup }, { op: 'fill-group', args: { index: k, count: perGroup } }),
          );
        }
        const last =
          unknown === 'size'
            ? say('gen.mul.groups.each', { perGroup }, { op: 'answer', args: { value } })
            : unknown === 'groups'
              ? say('gen.mul.groups.how-many-groups', { groups }, { op: 'answer', args: { value } })
              : say('gen.mul.groups.total', { counts, total }, { op: 'answer', args: { value } });
        steps.push(last);
        return steps;
      }
      case 'array-build':
        return w.mode === 'build-dims'
          ? [
              say(
                'gen.mul.groups.rows',
                { groups, perGroup },
                { op: 'drag-rect', args: { rows: groups, cols: perGroup } },
              ),
            ]
          : [
              say('gen.mul.groups.count-by', { perGroup }, { op: 'skip-count-rows' }),
              say('gen.mul.groups.total', { counts, total }, { op: 'answer', args: { value } }),
            ];
      case 'dot-flash':
        return [
          say('gen.mul.groups.look', {}, { op: 'show' }),
          say('gen.mul.groups.total', { counts, total }, { op: 'answer', args: { value } }),
        ];
      case 'number-line-jump': {
        const steps: LessonStep[] = [];
        for (let k = 1; k <= groups; k += 1) {
          steps.push(
            say('gen.mul.groups.hop', { n: k * perGroup }, { op: 'hop', args: { by: perGroup } }),
          );
        }
        steps.push(
          w.thenAsk
            ? say('gen.mul.groups.land', { total }, { op: 'label-landing' })
            : say('gen.mul.groups.how-many-groups', { groups }),
        );
        return steps;
      }
      case 'number-pad': {
        const type = { op: 'type', args: { blank: 'x', value } } as const;
        const lead = w.stimulus.kind === 'none' ? undefined : ({ op: 'show-stimulus' } as const);
        const first =
          unknown === 'total'
            ? say('gen.mul.groups.count-by', { perGroup }, lead)
            : unknown === 'size'
              ? say('gen.mul.groups.share', { perGroup }, lead)
              : say('gen.mul.groups.make-group', { perGroup }, lead);
        const answer =
          unknown === 'total'
            ? say('gen.mul.groups.total', { counts, total }, type)
            : unknown === 'size'
              ? say('gen.mul.groups.each', { perGroup }, type)
              : say('gen.mul.groups.how-many-groups', { groups }, type);
        return [first, answer];
      }
      default:
        return [];
    }
  },
};

/** The largest set a number-pad picture draws as objects, groups or dots. */
const GROUPS_PILE_CAP = 40;

/** The picture a number-pad or dot-flash item shows for its representation. */
function picture(
  rep: string,
  groups: number,
  perGroup: number,
  unknown: string,
  sprite: string,
  rng: BuildContext['rng'],
): StimulusSpec {
  const total = groups * perGroup;
  const sp = sprite as (typeof SHARE_SPRITES)[number];
  switch (rep) {
    case 'objects':
      return unknown === 'total'
        ? {
            kind: 'objects',
            set: {
              count: total,
              sprite: sp,
              layout: 'groups',
              groups: new Array<number>(groups).fill(perGroup),
              layoutSeed: 0,
            },
          }
        : {
            kind: 'objects',
            set: { count: total, sprite: sp, layout: 'scatter', layoutSeed: layoutSeed(rng) },
          };
    case 'groups':
      return { kind: 'groups', groups, perGroup, sprite: sp };
    case 'dots':
      return {
        kind: 'dots',
        arrangement: 'groups',
        groups: new Array<number>(groups).fill(perGroup),
      };
    case 'array':
    case 'tiles':
      return { kind: 'array', rows: groups, cols: perGroup, sprite: sp };
    case 'number-line': {
      const line = lineOf(groups, perGroup);
      return {
        kind: 'number-line',
        min: line.min,
        max: line.max,
        ticksEvery: line.ticks,
        labelsEvery: null,
        marks: [{ at: 0, label: '0' }],
        jumps: Array.from({ length: groups }, (_, k) => ({
          from: k * perGroup,
          to: (k + 1) * perGroup,
        })),
      };
    }
    default:
      return { kind: 'none' };
  }
}

/**
 * The picture a dot-flash item flashes (the format reads objects, dots and frames): objects in
 * groups, objects in an array of `groups` rows, or dots in groups.
 */
function flashPicture(rep: string, groups: number, perGroup: number, sprite: string): StimulusSpec {
  const sp = sprite as (typeof SHARE_SPRITES)[number];
  const count = groups * perGroup;
  if (rep === 'dots') {
    return {
      kind: 'dots',
      arrangement: 'groups',
      groups: new Array<number>(groups).fill(perGroup),
    };
  }
  if (rep === 'array') {
    return {
      kind: 'objects',
      set: { count, sprite: sp, layout: 'array', rows: groups, layoutSeed: 0 },
    };
  }
  return {
    kind: 'objects',
    set: {
      count,
      sprite: sp,
      layout: 'groups',
      groups: new Array<number>(groups).fill(perGroup),
      layoutSeed: 0,
    },
  };
}
