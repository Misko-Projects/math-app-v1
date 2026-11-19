// 03 §5.5 equal-groups. Containers (rafts, baskets, plates, nests) of sprites.
// - `read`: `groups` containers of `perGroup` are shown; answers the typed unknown.
// - `build`: the child fills containers and types the unknown. When the number of groups is the
//   unknown the child adds containers (`add-group`, at most `maxGroups`; `add-group {remove:
//   index}` takes an empty one away again); otherwise the `groups` containers are given, empty.
//   `fill-group {index, count}` sets a container's count: at most `GROUP_CAPACITY`, and, when the
//   total is given (the size or the number of groups is asked), never more in all than that total
//   (`groupsSupply`). Answers state `{ groups: number[], value? }` (`groups.equal`); empty
//   containers do not count as groups.
// `skip-count` and `circle-group {index}` are visual.
//
// Supported domain (what the widget draws in the smallest widget area, 906 × 373): 1 …
// `GROUPS_MAX` groups of 1 … `GROUP_CAPACITY`; a build from a given total has at most
// `groupsPileMax` in its pile (40 beside up to four containers, 20 beside five or six). Groups of tens (MUL.11, ten-rods) are not supported yet.

import {
  type AnswerSpec,
  equalGroupsConfigSchema,
  type WidgetConfigOf,
} from '@number-island/shared';
import { argNumber, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'equal-groups'>;

/** A container holds at most this many (two rows of five). */
export const GROUP_CAPACITY = 10;
/** The most containers an item has (`groups`, `maxGroups`). */
export const GROUPS_MAX = 6;
/**
 * The largest pile a build starts from (a given total: the size or the number of groups is
 * asked): 40 beside up to `GROUPS_PILE_WIDE` containers, 20 beside more (five or six containers
 * leave the pile less room; every sprite stays at least 22 px as drawn). A build from the bucket
 * (the total is asked) and a picture to read go up to GROUPS_MAX × GROUP_CAPACITY.
 */
export const GROUPS_PILE_MAX = 40;
export const GROUPS_PILE_WIDE = 4;
export const GROUPS_PILE_MAX_MANY = 20;

/** The largest pile a build with this many container places starts from. */
export const groupsPileMax = (containers: number): number =>
  containers <= GROUPS_PILE_WIDE ? GROUPS_PILE_MAX : GROUPS_PILE_MAX_MANY;

/** The container places a build shows: the most it may add, or the groups it is given. */
export const groupsPlaces = (c: Pick<Config, 'unknown' | 'groups' | 'maxGroups'>): number =>
  c.unknown === 'groups' ? c.maxGroups : c.groups;

export interface EqualGroupsState extends FormatState<'equal-groups'> {
  groups: number[];
  value: number | null;
  circled: number | null;
  skipCounting: boolean;
}

/** The number the item asks for. */
export function groupsUnknown(c: Config): number {
  if (c.unknown === 'size') return c.perGroup;
  if (c.unknown === 'groups') return c.groups;
  return c.groups * c.perGroup;
}

/**
 * The sprites the child has to build with: all of them when the total is given (the size or the
 * number of groups is asked), no limit (null) when the total is the unknown.
 */
export function groupsSupply(c: Config): number | null {
  return c.mode === 'build' && c.unknown !== 'total' ? c.groups * c.perGroup : null;
}

/**
 * The largest number the answer control offers, in steps too coarse to hint at the answer: a
 * size or a number of groups is 0 … 10; a total is 0 … 20 (the numeral tray) when it is at most
 * 20, otherwise 0 … 60 (the pad).
 */
export function groupsAnswerMax(c: Config): number {
  if (c.unknown !== 'total') return GROUP_CAPACITY;
  return c.groups * c.perGroup <= 20 ? 20 : GROUPS_MAX * GROUP_CAPACITY;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Why an item's answer is not the one this config asks for (FormatModel.answerIssues): `read`
 * answers the unknown as a number; `build` is checked by `groups.equal`, whose target must be
 * this item's groups and its unknown.
 */
export function groupsAnswerIssues(c: Config, answer: AnswerSpec): string[] {
  const want = groupsUnknown(c);
  if (c.mode === 'read') {
    if (answer.kind !== 'number') return ['read answers a number'];
    return answer.value === want
      ? []
      : [`the picture shows ${want}, the answer is ${answer.value}`];
  }
  if (answer.kind !== 'state' || answer.checker !== 'groups.equal') {
    return ['build answers groups.equal'];
  }
  const out: string[] = [];
  const t = answer.target as Record<string, unknown>;
  if (t.groups !== c.groups)
    out.push(`the target has ${String(t.groups)} groups, the widget ${c.groups}`);
  if (t.perGroup !== c.perGroup) {
    out.push(`the target has ${String(t.perGroup)} in a group, the widget ${c.perGroup}`);
  }
  if (t.value !== want) out.push(`the unknown is ${want}, the target expects ${String(t.value)}`);
  return out;
}

const configSchema = equalGroupsConfigSchema.superRefine((c, ctx) => {
  if (c.groups < 1 || c.groups > GROUPS_MAX) {
    ctx.addIssue({
      code: 'custom',
      path: ['groups'],
      message: `there are 1 to ${GROUPS_MAX} groups`,
    });
  }
  if (c.maxGroups > GROUPS_MAX) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxGroups'],
      message: `at most ${GROUPS_MAX} containers`,
    });
  }
  if (c.groups > c.maxGroups) {
    ctx.addIssue({ code: 'custom', path: ['maxGroups'], message: 'groups exceed maxGroups' });
  }
  if (c.perGroup < 1 || c.perGroup > GROUP_CAPACITY) {
    ctx.addIssue({
      code: 'custom',
      path: ['perGroup'],
      message: `a container holds 1 to ${GROUP_CAPACITY}`,
    });
  }
  const pileMax = groupsPileMax(groupsPlaces(c));
  if ((groupsSupply(c) ?? 0) > pileMax) {
    ctx.addIssue({
      code: 'custom',
      path: ['perGroup'],
      message: `a pile to build from holds at most ${pileMax} beside ${groupsPlaces(c)} containers`,
    });
  }
});

export const equalGroups: FormatModel<'equal-groups', EqualGroupsState> = {
  format: 'equal-groups',
  configSchema,
  answerIssues: groupsAnswerIssues,
  features: {
    product: { weight: 0.3, doc: '(groups × perGroup − 1) / 10' },
    'factor.over5': { weight: 0.4, doc: 'groups or perGroup is above 5' },
    'unknown.size': { weight: 0.5, doc: 'the group size is unknown (sharing division)' },
    'unknown.groups': {
      weight: 0.4,
      doc: 'the number of groups is unknown (measurement division)',
    },
    'mode.build': { weight: -0.1, doc: 'build mode (the child makes the groups)' },
  },
  featureValues(c: Config) {
    return {
      product: Math.max(0, c.groups * c.perGroup - 1) / 10,
      'factor.over5': Math.max(c.groups, c.perGroup) > 5 ? 1 : 0,
      'unknown.size': c.unknown === 'size' ? 1 : 0,
      'unknown.groups': c.unknown === 'groups' ? 1 : 0,
      'mode.build': c.mode === 'build' ? 1 : 0,
    };
  },
  initialState(config) {
    const groups =
      config.mode === 'read'
        ? new Array<number>(config.groups).fill(config.perGroup)
        : config.unknown === 'groups'
          ? []
          : new Array<number>(config.groups).fill(0);
    return { config, groups, value: null, circled: null, skipCounting: false };
  },
  apply(s, a) {
    const c = s.config;
    switch (a.op) {
      case 'add-group': {
        if (c.mode === 'read' || c.unknown !== 'groups') return s;
        // `{ remove: index }` undoes it: an empty container is taken away again.
        const remove = argNumber(a, 'remove');
        if (remove !== undefined) {
          if (!Number.isInteger(remove) || s.groups[remove] !== 0) return s;
          return { ...s, groups: s.groups.filter((_, i) => i !== remove) };
        }
        if (s.groups.length >= c.maxGroups) return s;
        return { ...s, groups: [...s.groups, 0] };
      }
      case 'fill-group': {
        const i = Math.trunc(argNumber(a, 'index') ?? -1);
        const n = Math.trunc(argNumber(a, 'count') ?? -1);
        if (c.mode === 'read' || i < 0 || i >= s.groups.length || n < 0) return s;
        const groups = [...s.groups];
        // A container holds GROUP_CAPACITY at most, and a given total is all there is.
        const supply = groupsSupply(c);
        const others = sum(s.groups) - (s.groups[i] as number);
        const left = supply === null ? GROUP_CAPACITY : Math.max(0, supply - others);
        const next = Math.min(GROUP_CAPACITY, left, n);
        if (next === s.groups[i]) return s;
        groups[i] = next;
        return { ...s, groups };
      }
      case 'skip-count':
        return { ...s, skipCounting: true };
      case 'circle-group': {
        const i = argNumber(a, 'index');
        return { ...s, circled: i === undefined ? null : i };
      }
      case 'answer': {
        const v = argNumber(a, 'value');
        return v === undefined ? s : { ...s, value: v };
      }
      default:
        throw new UnsupportedOpError('equal-groups', a.op);
    }
  },
  toResponse(s) {
    if (s.value === null) return null;
    if (s.config.mode === 'read') return { kind: 'number', value: s.value };
    return { kind: 'state', value: { groups: [...s.groups], value: s.value } };
  },
};
