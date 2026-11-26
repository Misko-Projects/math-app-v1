// One scale within a screen (05 §11): pictures that a child compares by eye must be drawn to one
// scale, or the bigger picture is a false cue. compare and order apply this to their pictures.
// Each picture's own supported ranges (parts, categories, values, axis steps) are in the contract
// (`stimulusSpecSchema`, `chartSpecSchema`).

import { type ChartSpec, chartAxisTop, type StimulusSpec } from '@number-island/shared';
import type { z } from 'zod';

/**
 * A line plot's own scale (its positions), as one comparable value; '' for the other kinds,
 * which do not draw from `lineScale` even when a chart carries one.
 */
const lineScaleKey = (c: ChartSpec): string =>
  c.kind === 'line-plot' && c.lineScale
    ? `${c.lineScale.min}:${c.lineScale.max}:${c.lineScale.step}`
    : '';

/**
 * The compare asks whose sides may be charts: the side picks, where the answer control fits
 * beside the sides and each side keeps the height a chart needs for 32 px numerals (05 §11),
 * down to the smallest widget area in K mode. Every other ask puts its answer row under the
 * sides, which leaves a chart too little height.
 */
export const CHART_COMPARE_ASKS: readonly string[] = ['more', 'fewer'];

/**
 * Where a `chart` stimulus may sit (compare's config schema applies it). A chart keeps its
 * numerals at 32 px only where the layout gives it its own box at full size, so:
 * - the ask is one of `CHART_COMPARE_ASKS`;
 * - both sides are charts (a fitted picture beside it, such as base-ten blocks, would share its
 *   smaller scale with the chart).
 */
export function compareChartIssues(
  c: { left: StimulusSpec; right: StimulusSpec; ask: string },
  ctx: z.RefinementCtx,
): void {
  const sides = ['left', 'right'] as const;
  if (!sides.some((s) => c[s].kind === 'chart')) return;
  if (!CHART_COMPARE_ASKS.includes(c.ask)) {
    ctx.addIssue({
      code: 'custom',
      path: ['ask'],
      message: `chart sides are compared with ${CHART_COMPARE_ASKS.join(' or ')} (the side picks)`,
    });
  }
  for (const s of sides) {
    if (c[s].kind !== 'chart') {
      ctx.addIssue({
        code: 'custom',
        path: [s],
        message: 'a chart is compared with a chart: both sides are charts',
      });
    }
  }
}

/**
 * The places in an item that hold a `chart` stimulus where none may be: anything but a side of a
 * `compare` widget (whose own schema then bounds it). No other format's layout is proven to keep
 * a chart's numerals at 32 px, so a generated item with a chart elsewhere (another format's
 * stimulus, an order card, a hint overlay) fails content-check. Returns the paths found.
 */
export function misplacedCharts(item: { widget: unknown; hints?: unknown }): string[] {
  const found: string[] = [];
  const walk = (v: unknown, path: string, allowed: boolean) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        walk(x, `${path}.${i}`, false);
      });
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    const o = v as Record<string, unknown>;
    if (o.kind === 'chart' && typeof o.chart === 'object' && o.chart !== null) {
      if (!allowed) found.push(path);
      return;
    }
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`, false);
  };
  const w = item.widget as Record<string, unknown> | null;
  if (typeof w === 'object' && w !== null) {
    const compare = w.format === 'compare';
    for (const [k, x] of Object.entries(w)) {
      walk(x, `widget.${k}`, compare && (k === 'left' || k === 'right'));
    }
  }
  walk(item.hints, 'hints', false);
  return found;
}

/**
 * Pictures shown together agree on what one unit is:
 * - `fraction` pictures are wholes of one shape, so the wholes are one size and only their parts
 *   differ (a circle and a strip have no common whole to compare parts of);
 * - `chart` pictures are one kind and orientation with one scale, one axis top and as many
 *   categories as each other (and one position scale, on line plots), so they are laid out
 *   alike and a taller bar is always a bigger number.
 * `paths[i]` is where `specs[i]` sits in the config.
 */
export function sharedScaleIssues(
  specs: readonly (StimulusSpec | undefined)[],
  ctx: z.RefinementCtx,
  paths: readonly (string | number)[][],
): void {
  let whole: Extract<StimulusSpec, { kind: 'fraction' }> | null = null;
  let chart: Extract<StimulusSpec, { kind: 'chart' }>['chart'] | null = null;
  specs.forEach((s, i) => {
    const path = paths[i] ?? [];
    if (s?.kind === 'fraction') {
      if (whole === null) whole = s;
      else if (s.shape !== whole.shape) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'shape'],
          message: 'fraction pictures shown together are wholes of one shape',
        });
      }
    } else if (s?.kind === 'chart') {
      const c = s.chart;
      if (chart === null) chart = c;
      else if (
        c.kind !== chart.kind ||
        c.orientation !== chart.orientation ||
        c.scale !== chart.scale ||
        chartAxisTop(c) !== chartAxisTop(chart) ||
        c.categories.length !== chart.categories.length ||
        lineScaleKey(c) !== lineScaleKey(chart)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'chart'],
          message:
            'charts shown together share their kind, orientation, scale, axis top and number of categories',
        });
      }
    }
  });
}

/**
 * A `clock` or `coins` stimulus is not yet shown anywhere in a generated item: no format's layout
 * is proven to hold one in the smallest widget area. A clock face keeps its numbers at 32 px only
 * from 280 px across (taller, with its frame, than a format that stacks its answer under the
 * picture can spare), and a coins picture keeps one scale only in a full picture box. The clock
 * and coin formats draw their own clock and coins (their configs carry a time and pieces, never a
 * stimulus); a time or an amount in a prompt is said and printed, not drawn. So one found
 * anywhere in an item (a format's own picture, a choice card, a compare side, an order card, a
 * hint overlay) is a content-check error, until a layout for it is built and proven. Returns the
 * paths found.
 *
 * Proven (#17 slice 4a, fit cases at 906 × 373 and 960 × 600): a coins picture of exactly one coin
 * and no bill as the picture of a number-pad or numeral-pick (MON.01: a silent coin to name), and
 * the coins of an order card, at most ORDER_CARD_COINS coins and no bill on three cards (MON.08).
 */
export const ORDER_CARD_COINS = 4;

const isOneCoin = (o: unknown): boolean => {
  const s = o as { kind?: unknown; coins?: unknown; bills?: unknown } | null;
  return (
    s?.kind === 'coins' &&
    Array.isArray(s.coins) &&
    s.coins.length === 1 &&
    (!Array.isArray(s.bills) || s.bills.length === 0)
  );
};

const isCardCoins = (o: unknown): boolean => {
  const s = o as { kind?: unknown; coins?: unknown; bills?: unknown } | null;
  return (
    s?.kind === 'coins' &&
    Array.isArray(s.coins) &&
    s.coins.length >= 1 &&
    s.coins.length <= ORDER_CARD_COINS &&
    (!Array.isArray(s.bills) || s.bills.length === 0)
  );
};

export function misplacedTimeMoneyPictures(item: { widget: unknown; hints?: unknown }): string[] {
  const found: string[] = [];
  const isPicture = (o: Record<string, unknown>) =>
    (o.kind === 'clock' && typeof o.h === 'number' && typeof o.m === 'number') ||
    (o.kind === 'coins' && Array.isArray(o.coins));
  const walk = (v: unknown, path: string, allowed: boolean) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        walk(x, `${path}.${i}`, false);
      });
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    const o = v as Record<string, unknown>;
    if (isPicture(o)) {
      if (!allowed) found.push(path);
      return;
    }
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`, false);
  };
  const w = item.widget as Record<string, unknown> | null;
  if (typeof w === 'object' && w !== null) {
    const onePictureFormat = w.format === 'number-pad' || w.format === 'numeral-pick';
    const items = w.format === 'order' && Array.isArray(w.items) ? w.items : null;
    for (const [k, x] of Object.entries(w)) {
      if (k === 'stimulus' && onePictureFormat && isOneCoin(x)) continue;
      if (k === 'items' && items && items.length === 3) {
        items.forEach((card, i) => {
          const c = card as Record<string, unknown> | null;
          for (const [ck, cx] of Object.entries(c ?? {})) {
            walk(cx, `widget.items.${i}.${ck}`, ck === 'stimulus' && isCardCoins(cx));
          }
        });
        continue;
      }
      walk(x, `widget.${k}`, false);
    }
  }
  walk(item.hints, 'hints', false);
  return found;
}
