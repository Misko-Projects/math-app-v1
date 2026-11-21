// chart.values `{ values }` (03 §5.5 bar-graph-build): every category (in the chart's category
// order) shows the right count. Response `{ values }`: the count the child built for each category,
// whatever the marks are (bars, pictures, tally marks), so any way of building a count is the same
// end state. K01 convention (engine README).
import { nums, type StateChecker } from './types';

export const chartValues: StateChecker = {
  id: 'chart.values',
  check(target, value) {
    const want = nums(target.values);
    const got = nums(value.values);
    if (!want || !got || want.length !== got.length) return false;
    return want.every((v, i) => got[i] === v);
  },
};
