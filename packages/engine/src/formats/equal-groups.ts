// 03 §5.5 equal-groups. Containers (rafts, baskets, plates, nests) of sprites.
// - `read`: `groups` containers of `perGroup` are shown; answers the typed unknown.
// - `build`: the child fills containers and types the unknown. When the number of groups is the
//   unknown the child adds containers (`add-group`, at most `maxGroups`); otherwise the `groups`
//   containers are given, empty. `fill-group {index, count}` sets a container's count.
//   Answers state `{ groups: number[], value? }` (`groups.equal`); empty containers do not count
//   as groups.
// `skip-count` and `circle-group {index}` are visual.

import { equalGroupsConfigSchema, type WidgetConfigOf } from '@number-island/shared';
import { argNumber, type FormatModel, type FormatState, UnsupportedOpError } from './types';

type Config = WidgetConfigOf<'equal-groups'>;

/**
 * A container holds at most this many: MUL.11 (`mul.tens`, 03 §5.6) builds groups of up to 90,
 * which the widget shows as tens and ones.
 */
export const GROUP_CAPACITY = 100;

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

const configSchema = equalGroupsConfigSchema.superRefine((c, ctx) => {
  if (c.groups < 1 || c.perGroup < 1) {
    ctx.addIssue({ code: 'custom', path: ['groups'], message: 'groups and perGroup are ≥ 1' });
  }
  if (c.groups > c.maxGroups) {
    ctx.addIssue({ code: 'custom', path: ['maxGroups'], message: 'groups exceed maxGroups' });
  }
  if (c.perGroup > GROUP_CAPACITY) {
    ctx.addIssue({
      code: 'custom',
      path: ['perGroup'],
      message: `a container holds at most ${GROUP_CAPACITY}`,
    });
  }
});

export const equalGroups: FormatModel<'equal-groups', EqualGroupsState> = {
  format: 'equal-groups',
  configSchema,
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
        if (c.mode === 'read' || s.groups.length >= c.maxGroups) return s;
        return { ...s, groups: [...s.groups, 0] };
      }
      case 'fill-group': {
        const i = Math.trunc(argNumber(a, 'index') ?? -1);
        const n = Math.trunc(argNumber(a, 'count') ?? -1);
        if (c.mode === 'read' || i < 0 || i >= s.groups.length || n < 0) return s;
        const groups = [...s.groups];
        groups[i] = Math.min(GROUP_CAPACITY, n);
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
