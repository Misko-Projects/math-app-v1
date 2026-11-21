// Measurements of drawn `fraction` and `chart` stimulus pictures for widget stories (compare and
// order): what the browser drew, never what the layout planned.
import { expect } from 'storybook/test';

/** How much an element is scaled on screen (a fitted picture is drawn at its size, then scaled). */
function renderScale(svg: SVGSVGElement): number {
  const drawn = svg.getBoundingClientRect().width;
  const own = svg.width.baseVal.value;
  return own > 0 ? drawn / own : 1;
}

export interface FractionMeasure {
  shape: string;
  parts: number;
  shaded: number;
  /** The whole's drawn size in CSS px. */
  width: number;
  height: number;
}

/**
 * Every fraction picture under `root` is a real drawing (not the placeholder card): it has the
 * parts its data says, the filled ones counted from the drawn paths, and, where its parts are
 * equal, parts of one outline length to a hundredth of a unit (congruent parts). Returns each
 * picture's numbers in document order.
 */
export async function expectFractionPictures(root: HTMLElement): Promise<FractionMeasure[]> {
  const out: FractionMeasure[] = [];
  await expect(root.querySelector('[data-kind="fraction"][data-unsupported]')).toBeNull();
  for (const pic of root.querySelectorAll<HTMLElement>('.ni-fraction')) {
    const svg = pic.querySelector('svg') as SVGSVGElement;
    const parts = [...svg.querySelectorAll<SVGPathElement>('.ni-fraction__part')];
    const filled = parts.filter((p) => p.dataset.fraction === 'filled');
    await expect(parts.length).toBe(Number(pic.dataset.parts));
    await expect(filled.length).toBe(Number(pic.dataset.shaded));
    // The filled parts are the first ones, in reading order.
    await expect(filled.map((p) => Number(p.dataset.part)).sort((a, b) => a - b)).toEqual(
      filled.map((_, i) => i),
    );
    if (pic.dataset.equal === 'true') {
      const lengths = parts.map((p) => p.getTotalLength());
      const spread = Math.max(...lengths) - Math.min(...lengths);
      await expect(spread, `equal parts, outline lengths ${lengths.join(' ')}`).toBeLessThan(0.01);
    }
    // Drawn without distortion: the whole keeps its own proportions.
    const r = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    await expect(Math.abs(r.width / r.height - box.width / box.height)).toBeLessThan(0.02);
    await expect((pic.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
    out.push({
      shape: pic.dataset.shape ?? '',
      parts: parts.length,
      shaded: filled.length,
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
    });
  }
  await expect(out.length).toBeGreaterThan(0);
  return out;
}

export interface ChartMeasure {
  /** Each bar's value and drawn length (along the value axis) in CSS px. */
  bars: { id: string; value: number; px: number }[];
  /** CSS px one unit of value is drawn at. */
  unit: number;
  /** The smallest drawn numeral size in CSS px. */
  numeral: number;
  /** The numerals on the axis, as drawn. */
  labels: number[];
}

/**
 * Every bar chart under `root` is a real drawing: each bar's drawn length is its value times the
 * chart's unit (measured between the axis numerals' gridlines, to half a px), every category
 * shows its picture and its name, and the numerals are at least 32 px on screen.
 */
export async function expectBarCharts(root: HTMLElement): Promise<ChartMeasure[]> {
  const out: ChartMeasure[] = [];
  await expect(root.querySelector('[data-kind="chart"][data-unsupported]')).toBeNull();
  for (const chart of root.querySelectorAll<HTMLElement>('.ni-chart[data-kind="bar"]')) {
    const svg = chart.querySelector('svg') as SVGSVGElement;
    const vertical = chart.dataset.orientation === 'vertical';
    const along = (r: DOMRect) => (vertical ? r.height : r.width);
    const pos = (r: DOMRect) => (vertical ? r.top : r.left);
    const grid = [...svg.querySelectorAll<SVGLineElement>('.ni-chart__grid')].map((g) => ({
      value: Number(g.dataset.value),
      at: pos(g.getBoundingClientRect()),
    }));
    await expect(grid.length).toBeGreaterThan(1);
    const zero = grid.find((g) => g.value === 0);
    const top = grid.reduce((a, b) => (b.value > a.value ? b : a));
    if (!zero) throw new Error('the axis starts at 0');
    const unit = Math.abs(top.at - zero.at) / top.value;
    const s = renderScale(svg);
    const bars: ChartMeasure['bars'] = [];
    for (const bar of svg.querySelectorAll<SVGRectElement>('.ni-chart__bar')) {
      const value = Number(bar.dataset.value);
      // The geometry box (the stroke is centred on it): its length is the value on the axis.
      const px = (vertical ? bar.height.baseVal.value : bar.width.baseVal.value) * s;
      await expect(Math.abs(px - value * unit), `bar ${bar.dataset.slot}`).toBeLessThan(0.5);
      await expect(along(bar.getBoundingClientRect())).toBeGreaterThan(0);
      bars.push({ id: bar.dataset.slot ?? '', value, px: Math.round(px * 10) / 10 });
    }
    const numerals = [...svg.querySelectorAll<SVGTextElement>('.ni-chart__numeral')];
    await expect(numerals.length).toBeGreaterThan(1);
    const sizes = numerals.map((n) => Number.parseFloat(getComputedStyle(n).fontSize) * s);
    for (const label of chart.querySelectorAll<HTMLElement>('.ni-chart__labelface')) {
      await expect(label.querySelector('svg')).not.toBeNull();
      await expect((label.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
    await expect(chart.querySelectorAll('.ni-chart__labelface').length).toBeGreaterThan(0);
    await expect((chart.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
    out.push({
      bars,
      unit: Math.round(unit * 100) / 100,
      numeral: Math.round(Math.min(...sizes) * 10) / 10,
      labels: numerals.map((n) => Number(n.textContent)),
    });
  }
  await expect(out.length).toBeGreaterThan(0);
  for (const m of out) await expect(m.numeral).toBeGreaterThanOrEqual(32);
  return out;
}

/** Pictures compared by eye are drawn to one scale: one size of whole, one px per unit. */
export async function expectOneScale(values: number[], what: string) {
  const spread = Math.max(...values) - Math.min(...values);
  await expect(spread, `${what}: ${values.join(' ')}`).toBeLessThan(0.5);
}
