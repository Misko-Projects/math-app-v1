import type { ItemFormat } from '@number-island/shared';
import type { WidgetRegistry } from './types';

/**
 * The widget registry: one lazily loaded widget per ItemFormat (02 §5.2). Widget issues (U03–U05)
 * add one line each, keeping parallel PRs conflict-free (docs/build/plan.md, rule 2):
 *
 *   'tap-count': () => import('./tap-count/TapCountWidget'),
 *
 * A widget module default-exports a `WidgetComponent<'tap-count'>`. Formats without an entry render
 * the PlaceholderWidget. See README.md in this folder for the contract.
 */
export const widgetRegistry: WidgetRegistry = {
  'number-pad': () => import('./number-pad/NumberPadWidget'),
  'numeral-pick': () => import('./numeral-pick/NumeralPickWidget'),
  'fraction-pick': () => import('./fraction-pick/FractionPickWidget'), // U05 (#14)
};

/** Formats that have a registered widget. */
export function registeredFormats(registry: WidgetRegistry = widgetRegistry): ItemFormat[] {
  return (Object.keys(registry) as ItemFormat[]).filter((f) => registry[f] !== undefined);
}
