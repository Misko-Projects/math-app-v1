import type { ItemFormat, Representation, Tier } from '@number-island/shared';

// 03 §5.5 summary table plus each format's demo-mode op list. The compiler uses it for V11
// (representation and tier the format supports) and V21 (authored lesson ops exist for the format).
// The default representation per format lives in shared (`FORMAT_DEFAULT_REPRESENTATION`).

export type AnswerKind = 'number' | 'numbers' | 'choice' | 'placement' | 'state';

export interface FormatSupport {
  /** Representations the format can render, or 'any' (rendered through a `StimulusSpec`). */
  representations: readonly Representation[] | 'any';
  tiers: readonly Tier[];
  /** Demo-mode `WidgetAction.op`s (03 §5.5 "Ops", 03 §6.3). */
  ops: readonly string[];
  answers: readonly AnswerKind[];
}

const C = 'concrete';
const P = 'pictorial';
const A = 'abstract';

export const FORMAT_SUPPORT: Readonly<Record<ItemFormat, FormatSupport>> = {
  'tap-count': {
    representations: ['objects', 'dots', 'ten-frame', 'double-ten-frame', 'number-path', 'fingers'],
    tiers: [C, P],
    ops: ['tap', 'count-aloud', 'ring', 'say-total'],
    answers: ['number', 'choice'],
  },
  'make-set': {
    representations: [
      'objects',
      'ten-frame',
      'double-ten-frame',
      'five-frame',
      'fingers',
      'bundles',
      'groups',
    ],
    tiers: [C],
    ops: ['drag', 'remove', 'count-aloud', 'bundle', 'close-container'],
    answers: ['state'],
  },
  'dot-flash': {
    representations: [
      'dots',
      'five-frame',
      'ten-frame',
      'double-ten-frame',
      'fingers',
      'rekenrek',
      'base-ten',
      'bundles',
      'groups',
      'array',
      'objects',
    ],
    tiers: [P],
    ops: ['flash', 'show', 'circle-groups'],
    answers: ['number'],
  },
  'numeral-pick': {
    representations: 'any',
    tiers: [P, A],
    ops: ['highlight', 'tap'],
    answers: ['choice'],
  },
  'number-pad': {
    representations: 'any',
    tiers: [P, A],
    ops: ['type', 'highlight', 'show-stimulus'],
    answers: ['number', 'numbers'],
  },
  compare: {
    representations: 'any',
    tiers: [C, P, A],
    ops: ['match', 'highlight', 'place-symbol'],
    answers: ['choice'],
  },
  order: {
    representations: 'any',
    tiers: [P, A],
    ops: ['drag', 'highlight'],
    answers: ['numbers'],
  },
  'tenframe-fill': {
    representations: ['five-frame', 'ten-frame', 'double-ten-frame'],
    tiers: [C, P],
    ops: ['show-addends', 'place', 'remove', 'move-counters', 'highlight', 'count-total'],
    answers: ['state'],
  },
  'number-bond': {
    representations: ['number-bond'],
    tiers: [C, P],
    ops: ['split-counters', 'fill', 'highlight'],
    answers: ['number', 'state'],
  },
  rekenrek: {
    representations: ['rekenrek'],
    tiers: [C],
    ops: ['slide', 'highlight', 'count-total'],
    answers: ['state', 'number'],
  },
  'number-line-place': {
    representations: ['number-line', 'number-path', 'thermometer', 'ruler'],
    tiers: [P],
    ops: ['drop', 'show-tick', 'count-ticks', 'zoom'],
    answers: ['placement', 'number', 'choice'],
  },
  'number-line-jump': {
    representations: [
      'number-line',
      'open-number-line',
      'number-path',
      'timeline',
      'thermometer',
      'ruler',
    ],
    tiers: [C, P],
    ops: ['hop', 'label-landing', 'highlight', 'bridge-to'],
    answers: ['state'],
  },
  'hundred-chart': {
    representations: ['hundred-chart'],
    tiers: [P],
    ops: ['tap', 'highlight-row', 'highlight-col', 'slide'],
    answers: ['number', 'numbers', 'state'],
  },
  'base-ten-build': {
    representations: ['base-ten', 'bundles'],
    tiers: [C, P],
    ops: ['add-piece', 'fuse', 'split', 'count-by'],
    answers: ['state', 'number'],
  },
  'base-ten-trade': {
    representations: ['base-ten', 'bundles', 'pv-chart'],
    tiers: [C, P],
    ops: ['trade', 'combine', 'take', 'write-digit'],
    answers: ['state'],
  },
  'expanded-form': {
    representations: ['expanded', 'words'],
    tiers: [P, A],
    ops: ['place-card', 'stack-cards', 'highlight-digit'],
    answers: ['numbers', 'number', 'choice'],
  },
  'array-build': {
    representations: ['array', 'tiles', 'area-grid', 'area-model'],
    tiers: [C, P],
    ops: ['drag-rect', 'add-row', 'split-at', 'count-rows', 'skip-count-rows'],
    answers: ['state', 'number'],
  },
  'equal-groups': {
    representations: ['groups'],
    tiers: [C, P],
    ops: ['add-group', 'fill-group', 'skip-count', 'circle-group'],
    answers: ['number', 'state'],
  },
  'equal-share': {
    representations: ['objects', 'groups'],
    tiers: [C],
    ops: ['deal', 'deal-round', 'set-aside-leftover'],
    answers: ['state', 'choice'],
  },
  'fraction-cut': {
    representations: ['fraction-shape', 'fraction-strip', 'area-grid'],
    tiers: [C],
    ops: ['cut', 'shade', 'separate', 'stack-parts'],
    answers: ['state'],
  },
  'fraction-pick': {
    representations: ['fraction-shape', 'fraction-strip', 'fraction-line', 'words', 'symbols'],
    tiers: [P, A],
    ops: ['highlight', 'overlay', 'count-parts'],
    answers: ['choice', 'numbers'],
  },
  'fraction-line': {
    representations: ['fraction-line', 'fraction-strip', 'ruler'],
    tiers: [P],
    ops: ['partition', 'hop', 'label', 'drop'],
    answers: ['placement', 'numbers', 'number', 'state'],
  },
  'clock-set': {
    representations: ['clock', 'digital-clock'],
    tiers: [C],
    ops: ['drag-minute', 'drag-hour', 'count-fives', 'highlight-hand'],
    answers: ['state'],
  },
  'clock-read': {
    representations: ['clock', 'digital-clock'],
    tiers: [P],
    ops: ['point-hour', 'point-minute', 'count-fives'],
    answers: ['numbers', 'choice'],
  },
  'coin-pay': {
    representations: ['coins', 'bills'],
    tiers: [C],
    ops: ['drop', 'count-up', 'say-total'],
    answers: ['state'],
  },
  'coin-count': {
    representations: ['coins', 'bills'],
    tiers: [P],
    ops: ['sort-coins', 'count-up', 'say-running'],
    answers: ['number', 'numbers', 'choice'],
  },
  'make-change': {
    representations: ['coins', 'bills'],
    tiers: [C],
    ops: ['drop', 'count-up'],
    answers: ['state'],
  },
  'measure-length': {
    representations: ['ruler', 'units'],
    tiers: [C, P],
    ops: ['lay-unit', 'slide-ruler', 'align-zero', 'count-units', 'read-end'],
    answers: ['number', 'numbers', 'placement', 'state', 'choice'],
  },
  'compare-length': {
    representations: ['objects', 'ruler'],
    tiers: [C, P],
    ops: ['align', 'lay-string', 'highlight-difference'],
    answers: ['choice', 'numbers', 'number'],
  },
  'area-tiles': {
    representations: ['tiles', 'area-grid', 'area-model'],
    tiers: [C, P],
    ops: ['place-tile', 'fill-row', 'draw-split', 'label-side'],
    answers: ['state', 'number'],
  },
  'perimeter-walk': {
    representations: ['shapes', 'dot-grid', 'area-grid'],
    tiers: [P],
    ops: ['walk-side', 'add-label', 'trace'],
    answers: ['number', 'state'],
  },
  'shape-compose': {
    representations: ['shapes', 'pattern-blocks', 'dot-grid', 'objects'],
    tiers: [C],
    ops: ['drag-piece', 'rotate', 'draw-edge', 'highlight-region'],
    answers: ['state'],
  },
  'shape-sort': {
    representations: 'any',
    tiers: [C, P],
    ops: ['drag-card', 'highlight-attribute', 'count-sides'],
    answers: ['state', 'choice'],
  },
  'pattern-extend': {
    representations: ['objects', 'shapes', 'tiles', 'symbols', 'table'],
    tiers: [C, P, A],
    ops: ['place-token', 'bracket-core', 'highlight'],
    answers: ['state', 'number', 'numbers'],
  },
  balance: {
    representations: ['balance'],
    tiers: [C, P],
    ops: ['place', 'tilt', 'level', 'highlight-side'],
    answers: ['choice', 'number', 'state'],
  },
  'bar-graph-read': {
    representations: ['picture-graph', 'bar-graph', 'line-plot', 'tally', 'table'],
    tiers: [P],
    ops: ['point-bar', 'read-axis', 'count-pictures'],
    answers: ['number', 'choice'],
  },
  'bar-graph-build': {
    representations: ['picture-graph', 'bar-graph', 'line-plot', 'tally', 'table'],
    tiers: [C, P],
    ops: ['raise-bar', 'add-picture', 'add-x', 'tally'],
    answers: ['state'],
  },
  'story-problem': {
    representations: ['story'],
    tiers: [P, A],
    ops: ['show-scene', 'act-out', 'draw-bar', 'highlight-line'],
    answers: ['number', 'state'],
  },
  'puzzle-grid': {
    representations: 'any',
    tiers: [P, A],
    ops: ['fill', 'highlight-cage', 'check-line'],
    answers: ['state'],
  },
};

/**
 * Formats whose templates may carry `distractors` (03 §4.3): the multiple-choice formats whose
 * options the generator builds (`fraction-pick` and `clock-read` in their pick modes).
 */
export const DISTRACTOR_FORMATS: readonly ItemFormat[] = [
  'numeral-pick',
  'compare',
  'fraction-pick',
  'clock-read',
];

export function formatRendersRepresentation(format: ItemFormat, rep: Representation): boolean {
  const reps = FORMAT_SUPPORT[format].representations;
  return reps === 'any' || reps.includes(rep);
}
