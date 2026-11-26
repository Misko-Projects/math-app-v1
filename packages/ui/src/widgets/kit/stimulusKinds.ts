import type { StimulusSpec } from '@number-island/shared';

/**
 * Every `StimulusSpec` kind (03 §5.1) and what StimulusView does with it: `drawn` (a real
 * picture), or `placeholder` (the neutral card, until the widget issue that owns the kind draws
 * it). The record is typed over the union, so a new kind does not compile until it is listed, and
 * StimulusView's switch is exhaustive in the same way; `stimulusKinds.test.tsx` renders every kind
 * and holds the two together. Read this table (not the source text of StimulusView) to learn
 * which kinds are drawn.
 */
export const STIMULUS_KINDS = {
  none: 'drawn',
  objects: 'drawn',
  dots: 'drawn',
  'ten-frame': 'drawn',
  rekenrek: 'drawn',
  'base-ten': 'drawn',
  'number-line': 'drawn',
  'bar-model': 'drawn',
  'number-bond': 'drawn',
  groups: 'drawn',
  array: 'drawn',
  fraction: 'drawn',
  gauge: 'drawn',
  clock: 'drawn',
  coins: 'drawn',
  shape: 'drawn',
  chart: 'drawn',
  expression: 'drawn',
  scene: 'drawn',
} as const satisfies Record<StimulusSpec['kind'], 'drawn' | 'placeholder'>;

export type StimulusKind = StimulusSpec['kind'];

/** Whether StimulusView draws a real picture for this kind. */
export const stimulusDrawn = (kind: StimulusKind): boolean => STIMULUS_KINDS[kind] === 'drawn';
