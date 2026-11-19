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
  // U05 (#14) measurement and geometry
  'shape-sort': () => import('./shape-sort/ShapeSortWidget'),
  'compare-length': () => import('./compare-length/CompareLengthWidget'),
  'measure-length': () => import('./measure-length/MeasureLengthWidget'),
  'shape-compose': () => import('./shape-compose/ShapeComposeWidget'),
  'perimeter-walk': () => import('./perimeter-walk/PerimeterWalkWidget'),
  // U05 (#14) fractions
  'fraction-pick': () => import('./fraction-pick/FractionPickWidget'),
  'fraction-cut': () => import('./fraction-cut/FractionCutWidget'),
  'fraction-line': () => import('./fraction-line/FractionLineWidget'),
  // U05 (#14) patterns and data
  'pattern-extend': () => import('./pattern-extend/PatternExtendWidget'),
  'bar-graph-read': () => import('./bar-graph-read/BarGraphReadWidget'),
  'bar-graph-build': () => import('./bar-graph-build/BarGraphBuildWidget'),
  'tap-count': () => import('./tap-count/TapCountWidget'),
  'make-set': () => import('./make-set/MakeSetWidget'),
  'dot-flash': () => import('./dot-flash/DotFlashWidget'),
  // U04 (#13): place value
  'base-ten-build': () => import('./base-ten-build/BaseTenBuildWidget'),
  'base-ten-trade': () => import('./base-ten-trade/BaseTenTradeWidget'),
  'expanded-form': () => import('./expanded-form/ExpandedFormWidget'),
  'number-line-place': () => import('./number-line-place/NumberLinePlaceWidget'),
  'number-line-jump': () => import('./number-line-jump/NumberLineJumpWidget'),
  'hundred-chart': () => import('./hundred-chart/HundredChartWidget'),
  'tenframe-fill': () => import('./tenframe-fill/TenframeFillWidget'),
  'number-bond': () => import('./number-bond/NumberBondWidget'),
  rekenrek: () => import('./rekenrek/RekenrekWidget'),
  compare: () => import('./compare/CompareWidget'),
  order: () => import('./order/OrderWidget'),
  // U04 (#13): operations
  'array-build': () => import('./array-build/ArrayBuildWidget'),
  'equal-groups': () => import('./equal-groups/EqualGroupsWidget'),
  'equal-share': () => import('./equal-share/EqualShareWidget'),
  'area-tiles': () => import('./area-tiles/AreaTilesWidget'),
};

/** Formats that have a registered widget. */
export function registeredFormats(registry: WidgetRegistry = widgetRegistry): ItemFormat[] {
  return (Object.keys(registry) as ItemFormat[]).filter((f) => registry[f] !== undefined);
}
