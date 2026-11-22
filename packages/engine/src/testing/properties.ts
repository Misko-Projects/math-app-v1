// 03 §9.4 property test (`runTemplateProperties`) and 03 §9.2 difficulty statistics
// (`difficultyStats`), exported for Vitest and tools/content-check (03 §9.3). Node/test only: this
// entry uses fast-check for the state mutations, so it is never part of the app bundle.

import { canonicalJson } from '@number-island/content/canonical';
import {
  FORMAT_SUPPORT,
  type GeneratedItem,
  type ItemTemplate,
  type ResponseValue,
  widgetConfigSchema,
} from '@number-island/shared';
import fc from 'fast-check';
import { stateChecker } from '../check/state';
import { blocksToBalance } from '../check/state/balance.equal';
import { boundNarration } from '../content/binding';
import { constraintHolds } from '../content/expr';
import { lineSlots, renderForms } from '../content/render';
import { formatFeatures, formatModel } from '../formats';
import { optionNumber } from '../formats/numeral-pick';
import { misplacedCharts } from '../formats/pictures';
import { inDomain } from '../generators/common';
import { attemptDifficulty } from '../items/attempt-difficulty';
import { checkResponse } from '../items/check';
import {
  generateItem,
  itemFeatures,
  itemKey,
  mergedSpec,
  requireGenerator,
} from '../items/generate';
import { itemExampleCorrect, itemSolution, replaySteps } from '../items/solution';
import { applicableMisconceptions, sameResponse } from '../misconceptions';

export interface PropertyFailure {
  seed: number | null;
  step: string;
  message: string;
}

export interface TemplatePropertyReport {
  templateId: string;
  n: number;
  failures: PropertyFailure[];
  targeting: { hits: number; total: number; rate: number; feasible: boolean };
}

export interface DifficultyStats {
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
  distinct: number;
}

/** The number of seeds to use: `CONTENT_PROPERTY_N`, else the given default. */
export function propertyN(fallback: number): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const n = Number(env?.CONTENT_PROPERTY_N);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const quantile = (sorted: number[], q: number): number =>
  sorted[Math.floor(q * (sorted.length - 1))] as number;

/** 03 §9.2 template-stats over seeds 1 … n: difficulty quantiles and distinct item count. */
export function difficultyStats(t: ItemTemplate, n = 500): DifficultyStats {
  const ds: number[] = [];
  const keys = new Set<string>();
  for (let seed = 1; seed <= n; seed += 1) {
    const item = generateItem(t, seed);
    ds.push(item.difficulty);
    keys.add(itemKey(item));
  }
  ds.sort((a, b) => a - b);
  return {
    min: ds[0] as number,
    p10: quantile(ds, 0.1),
    median: quantile(ds, 0.5),
    p90: quantile(ds, 0.9),
    max: ds[ds.length - 1] as number,
    distinct: keys.size,
  };
}

/** Numbers that would give the answer away in a hint (03 §9.4 step 7). */
export function answerNumbers(item: GeneratedItem): number[] {
  const a = item.answer;
  switch (a.kind) {
    case 'number':
    case 'placement':
      return [a.value];
    case 'numbers':
      return [...a.values];
    case 'choice': {
      const n = optionNumber(a.id);
      return n === null ? [] : [n];
    }
    case 'state': {
      // The quantity the child must produce, per checker, plus any typed value (thenAsk). Givens
      // such as a split's whole or make-ten's total are not answers.
      const t = a.target;
      const keys: Partial<Record<typeof a.checker, string[]>> = {
        'set.count': ['count'],
        'tenframe.total': ['n'],
        'rekenrek.total': ['n'],
        'jumps.reach': ['target'],
        'select.exactSet': [],
        'units.iterate': ['length'],
      };
      // When the item asks for a typed value, that value is the answer and the frame or jump target
      // is a given (the whole in a missing-part item).
      if (typeof t.value === 'number') return [t.value];
      // balance.equal: the blocks the lighter pan needs (the pans' own values are givens).
      if (a.checker === 'balance.equal') {
        const need = blocksToBalance(t);
        return need && need.count > 0 ? [need.count] : [];
      }
      const out = (keys[a.checker] ?? []).map((k) => t[k]);
      if (a.checker === 'select.exactSet' && Array.isArray(t.values)) out.push(...t.values);
      // K01: the counts a chart must show, and the numbers a number pattern continues with. A
      // clock's target time and a cut's number of parts are givens the prompt names.
      if (a.checker === 'chart.values' && Array.isArray(t.values)) out.push(...t.values);
      if (a.checker === 'pattern.tokens' && Array.isArray(t.expected)) {
        for (const tok of t.expected as unknown[]) {
          const n = (tok as { n?: unknown } | null)?.n;
          if (typeof n === 'number') out.push(n);
        }
      }
      return [...new Set(out.filter((v): v is number => typeof v === 'number'))];
    }
  }
}

/**
 * Whether a rendered hint gives the answer away: as a numeral anywhere in its display text, or as
 * the value of any of its slots (slots are spoken as number words, 03 §8.3). Static number words
 * an author wrote ("two groups", "a full row is five") belong to the line, not to the item, so
 * they are not item-dependent reveals (03 §9.4 step 7).
 */
function revealsNumber(
  text: string,
  slots: readonly string[],
  vars: Readonly<Record<string, string | number>>,
  n: number,
): boolean {
  if (numeralsIn(text).includes(n)) return true;
  return slots.some((s) => vars[s] === n || vars[s] === String(n));
}

/** A plain integer, or a thousands grouping exactly as the renderer writes one (03 §8.4). */
const PLAIN_NUMERAL = /^[0-9]+$/;
const GROUPED_NUMERAL = /^[1-9][0-9]{0,2}(?:,[0-9]{3})+$/;

/**
 * The numerals in rendered hint text, by a strict grammar (03 §9.4 step 7). Each run of digits and
 * commas must be either a plain integer ("8", "305") or a canonical thousands grouping ("1,000",
 * "12,345"). Any other run ("6,7,8", "0,500", "1,000,8") is ambiguous: it is returned in
 * `ambiguous` and contributes no numbers, and V17 reports it as a content error. Authors separate
 * list items with a comma and a space ("6, 7, 8").
 */
export function parseNumerals(text: string): { numbers: number[]; ambiguous: string[] } {
  const numbers: number[] = [];
  const ambiguous: string[] = [];
  for (const m of text.matchAll(/[0-9](?:[0-9,]*[0-9])?/g)) {
    const run = m[0];
    if (PLAIN_NUMERAL.test(run) || GROUPED_NUMERAL.test(run)) {
      numbers.push(Number(run.replaceAll(',', '')));
    } else {
      ambiguous.push(run);
    }
  }
  return { numbers, ambiguous };
}

/** The unambiguous numerals in rendered text (see `parseNumerals`). */
export function numeralsIn(text: string): number[] {
  return parseNumerals(text).numbers;
}

/**
 * Free-split items (bond.split, bond.newWay) accept every valid split, and no text check can tell
 * a numeral that sizes a part ("put 4 in each frame") from one that counts something else ("use 2
 * hands"). So the rule is an authoring constraint (03 §9.4 step 7): a level 2–4 hint on a split
 * item names no numeral that could be a part, that is anything from 1 to whole − 1 (0 too when
 * zero parts are allowed). The whole itself may be named, and counting words are written in
 * letters ("use two hands"). Numerals come from the rendered display text, which includes slot
 * values. Returns the offending numerals, or an empty list.
 */
export function splitPartNumerals(item: GeneratedItem, text: string): number[] {
  const a = item.answer;
  if (a.kind !== 'state' || (a.checker !== 'bond.split' && a.checker !== 'bond.newWay')) return [];
  const whole = a.target.whole;
  if (typeof whole !== 'number') return [];
  const lowest = a.target.nonZero === true ? 1 : 0;
  const mentioned = numeralsIn(text);
  return [...new Set(mentioned.filter((n) => n >= lowest && n < whole))];
}

// ---------- near misses (step 5) ----------

function nearMissNumbers(v: number): number[] {
  return v >= 10 ? [v + 1, v - 1, v + 10, v - 10] : [v + 1, v - 1];
}

type StateValue = Record<string, unknown>;

/** One-step mutations of an example state: a counter or piece added or removed, or moved. */
function stateMutation(original: StateValue): fc.Arbitrary<StateValue> {
  const options: fc.Arbitrary<StateValue>[] = [];
  const clone = (): StateValue => JSON.parse(JSON.stringify(original)) as StateValue;
  if (typeof original.count === 'number') {
    options.push(
      fc.constantFrom(1, -1).map((d) => {
        const s = clone();
        s.count = (original.count as number) + d;
        if (Array.isArray(s.parts)) (s.parts as number[])[0] = ((s.parts as number[])[0] ?? 0) + d;
        return s;
      }),
    );
  }
  for (const key of ['parts', 'rows'] as const) {
    const arr = original[key];
    if (Array.isArray(arr) && arr.length > 0) {
      options.push(
        fc.tuple(fc.nat({ max: arr.length - 1 }), fc.constantFrom(1, -1)).map(([i, d]) => {
          const s = clone();
          const a = s[key] as number[];
          a[i] = (a[i] as number) + d;
          if (key === 'parts' && typeof s.count === 'number') s.count = (s.count as number) + d;
          return s;
        }),
      );
      if (arr.length === 2) {
        // Move one from one side to the other (checkers may exempt this as an alternative).
        options.push(
          fc.constantFrom(0, 1).map((from) => {
            const s = clone();
            const a = s[key] as number[];
            a[from] = (a[from] as number) - 1;
            a[1 - from] = (a[1 - from] as number) + 1;
            return s;
          }),
        );
      }
    }
  }
  if (Array.isArray(original.cells)) {
    const cells = original.cells as number[][];
    const flat = cells.flatMap((f, fi) => f.map((x, ci) => ({ fi, ci, x })));
    options.push(
      fc.nat({ max: Math.max(0, flat.length - 1) }).map((k) => {
        const s = clone();
        const c = flat[k] as { fi: number; ci: number; x: number };
        const target = (s.cells as number[][])[c.fi] as number[];
        target[c.ci] = c.x === 0 ? 1 : 0; // add a counter to an empty cell, or remove one
        return s;
      }),
    );
  }
  if (Array.isArray(original.jumps) && original.jumps.length > 0) {
    const jumps = original.jumps as number[];
    options.push(
      fc.constantFrom('add', 'drop').map((op) => {
        const s = clone();
        s.jumps = op === 'add' ? [...jumps, jumps[0] as number] : jumps.slice(0, -1);
        return s;
      }),
    );
  }
  if (Array.isArray(original.values)) {
    const values = original.values as number[];
    options.push(
      fc.constantFrom('add', 'drop').map((op) => {
        const s = clone();
        s.values = op === 'add' ? [...values, Math.max(0, ...values) + 1] : values.slice(1);
        return s;
      }),
    );
  }
  // U04 (#13) state shapes: base-ten pieces and mat columns, array dimensions and split line,
  // container and share counts, and the leftover. One piece, row, column or item more or less.
  // K01 (#11) balance make-equal: the blocks added to each pan (balance.equal).
  for (const key of [
    'thousands',
    'hundreds',
    'tens',
    'ones',
    'cols',
    'split',
    'leftover',
    'left',
    'right',
  ]) {
    if (typeof original[key] === 'number') {
      options.push(
        fc.constantFrom(1, -1).map((d) => {
          const s = clone();
          s[key] = (original[key] as number) + d;
          return s;
        }),
      );
    }
  }
  if (typeof original.rows === 'number') {
    options.push(
      fc.constantFrom(1, -1).map((d) => {
        const s = clone();
        s.rows = (original.rows as number) + d;
        return s;
      }),
    );
  }
  if (typeof original.tiles === 'string' && original.tiles.length > 0) {
    // One tile added or taken away (area-tiles `tile`).
    const tiles = original.tiles;
    options.push(
      fc.nat({ max: tiles.length - 1 }).map((i) => {
        const s = clone();
        s.tiles = `${tiles.slice(0, i)}${tiles[i] === '1' ? '0' : '1'}${tiles.slice(i + 1)}`;
        return s;
      }),
    );
  }
  if (Array.isArray(original.splits) && original.splits.length > 0) {
    // One split line taken away (area-tiles `decompose`; tiles.cover exempts what stays valid).
    const n = original.splits.length;
    options.push(
      fc.nat({ max: n - 1 }).map((i) => {
        const s = clone();
        s.splits = (original.splits as unknown[]).filter((_, j) => j !== i);
        return s;
      }),
    );
  }
  for (const key of ['groups', 'shares'] as const) {
    const arr = original[key];
    if (Array.isArray(arr) && arr.length > 0) {
      options.push(
        fc.tuple(fc.nat({ max: arr.length - 1 }), fc.constantFrom(1, -1)).map(([i, d]) => {
          const s = clone();
          const a = s[key] as number[];
          a[i] = (a[i] as number) + d;
          return s;
        }),
      );
    }
  }
  if (typeof original.value === 'number') {
    options.push(
      fc.constantFrom(1, -1).map((d) => {
        const s = clone();
        s.value = (original.value as number) + d;
        return s;
      }),
    );
  }
  if (Array.isArray(original.values) && original.values.length > 0) {
    // K01 data: one count one more or one less (chart.values bars, pictures or tally marks). On a
    // select.exactSet `{ values }` item this selects another cell, which the checker rejects too.
    const values = original.values as number[];
    options.push(
      fc.tuple(fc.nat({ max: values.length - 1 }), fc.constantFrom(1, -1)).map(([i, d]) => {
        const s = clone();
        (s.values as number[])[i] = (values[i] as number) + d;
        return s;
      }),
    );
  }
  if (typeof original.h === 'number' && typeof original.m === 'number') {
    // K01 time (clock.time `{ h, m }`): a hand moved one step, the short hand one hour or the
    // long hand five minutes either way.
    options.push(
      fc.tuple(fc.constantFrom('h', 'm'), fc.constantFrom(1, -1)).map(([hand, d]) => {
        const s = clone();
        s[hand] = (original[hand] as number) + (hand === 'h' ? d : 5 * d);
        return s;
      }),
    );
  }
  if (Array.isArray(original.regions) && original.regions.length > 1) {
    // K01 fractions (fraction.cut `{ regions, shaded }`): a cut moved so a tenth of the whole goes
    // from one region to the next, a region merged into its neighbour, or one part more or less
    // shaded (fraction.cut exempts shading a different part).
    const regions = original.regions as number[];
    const shaded = Array.isArray(original.shaded) ? (original.shaded as number[]) : [];
    options.push(
      fc.constantFrom('move', 'merge', 'shade', 'unshade').map((op) => {
        const s = clone();
        const r = s.regions as number[];
        if (op === 'move') {
          r[0] = (regions[0] as number) + 0.1;
          r[1] = (regions[1] as number) - 0.1;
        } else if (op === 'merge') {
          s.regions = [(regions[0] as number) + (regions[1] as number), ...regions.slice(2)];
          s.shaded = shaded.filter((i) => i < regions.length - 1);
        } else if (op === 'shade') {
          const free = regions.findIndex((_, i) => !shaded.includes(i));
          s.shaded = free >= 0 ? [...shaded, free] : shaded.slice(1);
        } else {
          s.shaded = shaded.length > 0 ? shaded.slice(1) : [0];
        }
        return s;
      }),
    );
  }
  if (Array.isArray(original.cuts) && original.cuts.length > 0) {
    // K01 fractions (fraction.partition `{ cuts }`): one mark moved a tenth of a unit (towards
    // the middle of the strip), one taken away, or one more at the middle of the first part.
    const cuts = original.cuts as number[];
    options.push(
      fc.constantFrom('move', 'drop', 'add').map((op) => {
        const s = clone();
        const c0 = cuts[0] as number;
        if (op === 'move') (s.cuts as number[])[0] = c0 + (c0 < 0.5 ? 0.1 : -0.1);
        else if (op === 'drop') s.cuts = cuts.slice(1);
        else s.cuts = [c0 / 2, ...cuts];
        return s;
      }),
    );
  }
  if (Array.isArray(original.fill)) {
    // K01 puzzles (puzzle.satisfies number variants `{ fill }`): one filled number one more or
    // one less. Shape-fill grids hold no numbers, so they get no mutation here.
    const spots = (original.fill as unknown[][]).flatMap((row, r) =>
      Array.isArray(row) ? row.flatMap((v, c) => (typeof v === 'number' ? [[r, c]] : [])) : [],
    );
    if (spots.length > 0) {
      options.push(
        fc.tuple(fc.nat({ max: spots.length - 1 }), fc.constantFrom(1, -1)).map(([k, d]) => {
          const s = clone();
          const [r, c] = spots[k] as [number, number];
          const row = (s.fill as number[][])[r] as number[];
          row[c] = (row[c] as number) + d;
          return s;
        }),
      );
    }
  }
  if (Array.isArray(original.tokens) && original.tokens.length > 0) {
    // K01 patterns (pattern.tokens `{ tokens }`): the last token taken away, or one token
    // replaced by its neighbour (a different unit when the two differ).
    const tokens = original.tokens as unknown[];
    options.push(
      fc.nat({ max: tokens.length }).map((i) => {
        const s = clone();
        if (i === tokens.length || tokens.length === 1) {
          s.tokens = tokens.slice(0, -1);
        } else {
          const t = [...tokens];
          t[i] = tokens[(i + 1) % tokens.length];
          s.tokens = t;
        }
        return s;
      }),
    );
  }
  // A widget can never produce a negative count, so such mutations are not near misses.
  return options.length > 0 ? fc.oneof(...options).filter(noNegatives) : fc.constant(original);
}

function noNegatives(v: unknown): boolean {
  if (typeof v === 'number') return v >= 0;
  if (Array.isArray(v)) return v.every(noNegatives);
  if (v !== null && typeof v === 'object') {
    // Jumps are signed (counting back); every other quantity is a count.
    return Object.entries(v).every(([k, x]) => k === 'jumps' || noNegatives(x));
  }
  return true;
}

export function choiceOptions(item: GeneratedItem): string[] {
  const w = item.widget;
  if (w.format === 'numeral-pick') return w.options.map((o) => o.id);
  if (w.format === 'expanded-form' && w.wordOptions) return w.wordOptions.map((o) => o.id);
  if (w.format === 'equal-share') {
    if (w.ask === 'fair-or-not') return ['yes', 'no'];
    if (w.ask === 'even-odd') return ['even', 'odd'];
  }
  if (w.format === 'tap-count' && w.mode === 'ordinal') {
    return Array.from({ length: w.set.count }, (_, i) => `obj-${i}`);
  }
  // Formats whose choices the format fixes (03 §5.5): the two sides plus "same", the relation
  // symbols, true / false, or the objects shown.
  if (w.format === 'compare') {
    if (w.ask === 'symbol') return ['<', '>', '='];
    if (w.ask === 'true-false') return ['true', 'false'];
    if (w.ask === 'same-or-not') return ['same', 'not-same'];
    return ['left', 'right', 'same'];
  }
  if (w.format === 'balance') {
    if (w.mode === 'judge') return ['true', 'false'];
    if (w.mode === 'which-heavier') return ['left', 'right', 'same'];
  }
  if (w.format === 'compare-length') return w.objects.map((o) => o.id);
  if (w.format === 'shape-sort' && w.mode === 'odd-one-out') return w.cards.map((c) => c.id);
  // K01 conventions (engine README): fraction-pick `fair-or-not` answers `yes` | `no` (like
  // equal-share); its other pick modes, and clock-read `pick`, answer one of their `options`; a
  // bar-graph-read `most` / `least` question answers a category id of the chart.
  if (w.format === 'fraction-pick') {
    if (w.mode === 'fair-or-not') return ['yes', 'no'];
    return (w.options ?? []).map((o) => o.id);
  }
  if (w.format === 'clock-read' && w.input === 'pick') return (w.options ?? []).map((o) => o.id);
  if (w.format === 'bar-graph-read') return w.chart.categories.map((c) => c.id);
  return [];
}

/**
 * The fewest options a multiple-choice item may show (03 §9.4 step 9). The 03 §5.1 pick widgets
 * show at least 3. Reading (K01): an answer set the format fixes at two (compare true-false and
 * same-or-not, balance judge), or the objects on screen (compare-length: two lengths side by side, MEA.01), is
 * the format's own answer set, so it needs 2.
 */
function minChoiceOptions(item: GeneratedItem): number {
  const w = item.widget;
  if (w.format === 'compare-length') return 2;
  if (w.format === 'compare' && (w.ask === 'true-false' || w.ask === 'same-or-not')) return 2;
  if (w.format === 'balance' && w.mode === 'judge') return 2;
  // K01: fraction-pick `fair-or-not` is a fixed yes / no pair, and a graph question picks one of
  // the categories the chart shows (two or three at grade 1).
  if (w.format === 'fraction-pick' && w.mode === 'fair-or-not') return 2;
  if (w.format === 'bar-graph-read') return 2;
  return 3;
}

// ---------- the property test ----------

export interface PropertyOptions {
  n?: number;
  /** Run the targeting check (default true). */
  targeting?: boolean;
  /** Difficulty statistics to target against (computed over 500 seeds when absent). */
  stats?: DifficultyStats;
}

export function runTemplateProperties(
  t: ItemTemplate,
  opts: PropertyOptions = {},
): TemplatePropertyReport {
  const n = opts.n ?? 500;
  const failures: PropertyFailure[] = [];
  const fail = (seed: number | null, step: string, message: string) => {
    if (failures.length < 50) failures.push({ seed, step, message });
  };
  let g: ReturnType<typeof requireGenerator>;
  try {
    g = requireGenerator(t);
  } catch (e) {
    fail(null, 'registry', (e as Error).message);
    return {
      templateId: t.id,
      n,
      failures,
      targeting: { hits: 0, total: 0, rate: 0, feasible: false },
    };
  }
  const spec = mergedSpec(t, g);
  const declared = new Set([...Object.keys(g.features), ...Object.keys(formatFeatures(t.format))]);
  const model = formatModel(t.format);
  const support = FORMAT_SUPPORT[t.format];
  const narration = boundNarration();

  for (let seed = 1; seed <= n; seed += 1) {
    // 1. determinism
    let item: GeneratedItem;
    try {
      item = generateItem(t, seed);
    } catch (e) {
      fail(seed, '1.generate', (e as Error).message);
      continue;
    }
    if (canonicalJson(generateItem(t, seed)) !== canonicalJson(item)) {
      fail(seed, '1.determinism', 'a second call returned a different item');
    }
    // 2. params in domain, constraints hold
    for (const [name, s] of Object.entries(spec)) {
      const v = item.params[name];
      if (v !== undefined && !inDomain(s, v)) {
        fail(seed, '2.domain', `param ${name}=${String(v)} is outside its ParamSpec`);
      }
    }
    for (const c of t.constraints ?? []) {
      try {
        if (!constraintHolds(c, item.params)) fail(seed, '2.constraint', `constraint "${c}" fails`);
      } catch (e) {
        fail(seed, '2.constraint', `constraint "${c}": ${(e as Error).message}`);
      }
    }
    // 3. widget schema, format, tier
    const schema = model?.configSchema ?? widgetConfigSchema;
    const parsed = schema.safeParse(item.widget);
    if (!parsed.success) {
      fail(
        seed,
        '3.widget',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    // A chart stimulus sits only on a compare side (formats/pictures.ts): nowhere else is its
    // layout proven to keep the numerals at 32 px.
    for (const at of misplacedCharts(item)) {
      fail(seed, '3.chart', `${at}: a chart stimulus is shown only on a compare side`);
    }
    if (item.widget.format !== t.format)
      fail(seed, '3.format', 'widget.format differs from template.format');
    if (!support.tiers.includes(t.tier))
      fail(seed, '3.tier', `${t.format} does not support ${t.tier}`);
    if (!support.answers.includes(item.answer.kind)) {
      fail(seed, '3.answer', `${t.format} does not answer with ${item.answer.kind}`);
    }
    // The answer is one the widget can send for this config (FormatModel.answerIssues).
    if (model?.answerIssues && parsed.success) {
      for (const issue of model.answerIssues(item.widget as never, item.answer)) {
        fail(seed, '3.answer', `answer: ${issue}`);
      }
    }
    // Every label the widget prints fits it (FormatModel.labelIssues).
    if (model?.labelIssues && parsed.success) {
      const words = (key: string) => narration[key as keyof typeof narration]?.text;
      for (const issue of model.labelIssues(item.widget as never, words)) {
        fail(seed, '3.label', issue);
      }
    }
    // 4. example correct, solution replays to a correct response
    try {
      const ex = itemExampleCorrect(item, t);
      if (!checkResponse(item, ex).correct)
        fail(seed, '4.example', `exampleCorrect is not correct: ${canonicalJson(ex)}`);
    } catch (e) {
      fail(seed, '4.example', (e as Error).message);
    }
    if (model) {
      try {
        const r = replaySteps(item, itemSolution(item, t));
        if (!r) fail(seed, '4.solution', 'replaying the solution leaves nothing to submit');
        else if (!checkResponse(item, r).correct) {
          fail(seed, '4.solution', `the replayed solution is not correct: ${canonicalJson(r)}`);
        }
      } catch (e) {
        fail(seed, '4.solution', (e as Error).message);
      }
    }
    // 5. near misses
    const a = item.answer;
    if (a.kind === 'number') {
      for (const v of nearMissNumbers(a.value)) {
        if (
          Math.abs(v - a.value) > (a.tolerance ?? 0) &&
          checkResponse(item, { kind: 'number', value: v }).correct
        ) {
          fail(seed, '5.near-miss', `${v} is accepted for ${a.value}`);
        }
      }
    } else if (a.kind === 'numbers' && a.values.length > 0) {
      const values = [...a.values];
      values[0] = (values[0] as number) + 1;
      if (checkResponse(item, { kind: 'numbers', values }).correct) {
        fail(seed, '5.near-miss', `${canonicalJson(values)} is accepted`);
      }
    } else if (a.kind === 'choice') {
      for (const id of choiceOptions(item)) {
        if (id !== a.id && checkResponse(item, { kind: 'choice', id }).correct) {
          fail(seed, '5.near-miss', `option ${id} is also accepted`);
        }
      }
    } else if (a.kind === 'state') {
      try {
        const ex = itemExampleCorrect(item, t);
        if (ex.kind === 'state') {
          const checker = stateChecker(a.checker);
          const mutations = fc.sample(stateMutation(ex.value), { seed, numRuns: 8 });
          for (const m of mutations) {
            const r: ResponseValue = { kind: 'state', value: m };
            if (sameResponse(r, ex)) continue;
            if (checker?.exempt?.(a.target, ex.value, m)) continue;
            if (checkResponse(item, r).correct) {
              fail(seed, '5.near-miss', `mutated state ${canonicalJson(m)} is accepted`);
            }
          }
        }
      } catch (e) {
        fail(seed, '5.near-miss', (e as Error).message);
      }
    }
    // 6. misconception predictions are tagged
    const applicable = applicableMisconceptions(item, ['answer', 'state']);
    for (const { spec: mc, rule } of applicable) {
      const predicted = rule.predict?.(item) ?? null;
      if (!predicted) continue;
      const res = checkResponse(item, predicted);
      const covered =
        res.misconceptionIds.includes(mc.id) ||
        applicable.some(
          (o) =>
            o.spec.priority > mc.priority &&
            res.misconceptionIds.includes(o.spec.id) &&
            sameResponse(o.rule.predict?.(item) ?? { kind: 'skip' }, predicted),
        );
      if (res.correct || !covered) {
        fail(
          seed,
          '6.misconception',
          `${mc.id}'s prediction ${canonicalJson(predicted)} is not tagged`,
        );
      }
    }
    // 7. vars cover slots; hints 2–4 never reveal the answer
    const vars = item.prompt.vars;
    for (const key of [t.narration.prompt, ...t.narration.hints]) {
      for (const slot of lineSlots(key, narration)) {
        if (!(slot in vars))
          fail(seed, '7.vars', `${key} uses {${slot}}, which the generator does not fill`);
      }
    }
    try {
      for (const step of itemSolution(item, t)) {
        for (const slot of lineSlots(step.say, narration)) {
          if (!(slot in (step.vars ?? {}))) {
            fail(
              seed,
              '7.vars',
              `solution line ${step.say} uses {${slot}}, which the step does not fill`,
            );
          }
        }
        if (!narration[step.say]) fail(seed, '7.vars', `solution line ${step.say} does not exist`);
      }
    } catch (e) {
      fail(seed, '7.vars', (e as Error).message);
    }
    const answers = answerNumbers(item);
    for (const h of item.hints) {
      if (h.level < 2 || h.level > 4) continue;
      const hv = h.vars ?? {};
      const slots = lineSlots(h.say, narration);
      // Both what the child reads and what the child hears (`say`) are checked.
      for (const text of renderForms(h.say, hv, narration)) {
        const { ambiguous } = parseNumerals(text);
        if (ambiguous.length > 0) {
          fail(
            seed,
            '7.hint-reveals',
            `hint ${h.say} ("${text}") has an ambiguous numeral run ${ambiguous.join(', ')} (separate list items with ", ")`,
          );
        }
        for (const v of answers) {
          if (revealsNumber(text, slots, hv, v)) {
            fail(seed, '7.hint-reveals', `hint ${h.say} ("${text}") reveals ${v}`);
          }
        }
        const parts = splitPartNumerals(item, text);
        if (parts.length > 0) {
          fail(
            seed,
            '7.hint-reveals',
            `hint ${h.say} ("${text}") names part size ${parts.join(', ')} on a split item (write counting words in letters)`,
          );
        }
      }
    }
    // 8. difficulty finite; features declared
    if (!Number.isFinite(item.difficulty)) fail(seed, '8.difficulty', 'difficulty is not finite');
    for (const f of Object.keys(itemFeatures(item, t))) {
      if (!declared.has(f))
        fail(seed, '8.features', `feature ${f} is not declared by ${g.id} or ${t.format}`);
    }
    // 8a. the learner rebuilds d_item from the logged params and seed (04 §2.2) with its own rng,
    // so the difficulty must be a function of the params alone (03 §5.4).
    const replayed = attemptDifficulty(t, item.params, item.seed);
    if (!(Math.abs(replayed - item.difficulty) <= 1e-9))
      fail(
        seed,
        '8.replay-difficulty',
        `difficulty ${item.difficulty} rebuilds from the params as ${replayed}`,
      );
    // 9. multiple choice: min–5 distinct options (see minChoiceOptions), exactly one correct.
    // A tap-count ordinal item (CNT.15, "tap the eighth one") answers with an object id, but its
    // objects are a line to count, not options to choose from, so the upper bound is lifted for it.
    if (a.kind === 'choice') {
      const ids = choiceOptions(item);
      const min = minChoiceOptions(item);
      const correct = ids.filter((id) => checkResponse(item, { kind: 'choice', id }).correct);
      const objects = item.widget.format === 'tap-count';
      // equal-share's choices are fixed pairs (yes/no, even/odd, 03 §5.5), so two is enough.
      const pair = item.widget.format === 'equal-share';
      if (
        ids.length < (pair ? 2 : min) ||
        (ids.length > 5 && !objects) ||
        new Set(ids).size !== ids.length ||
        correct.length !== 1
      ) {
        fail(
          seed,
          '9.choice',
          `options ${canonicalJson(ids)}: need ${min}–5 distinct with exactly one correct`,
        );
      }
    }
  }

  // Targeting: 10 targets evenly spaced in [p10, p90], 10 seeds each; ≥ 90% within ±0.5.
  let hits = 0;
  let total = 0;
  let feasible = false;
  if (opts.targeting !== false && failures.length === 0) {
    const stats = opts.stats ?? difficultyStats(t, 500);
    feasible = true;
    for (let k = 0; k < 10; k += 1) {
      const target = stats.p10 + ((stats.p90 - stats.p10) * k) / 9;
      for (let s = 1; s <= 10; s += 1) {
        const item = generateItem(t, 1000 + k * 10 + s, { difficulty: target });
        total += 1;
        if (Math.abs(item.difficulty - target) <= 0.5) hits += 1;
      }
    }
    if (hits / total < 0.9) {
      fail(null, 'targeting', `only ${hits}/${total} items land within ±0.5 of the target`);
    }
  }
  return {
    templateId: t.id,
    n,
    failures,
    targeting: { hits, total, rate: total > 0 ? hits / total : 0, feasible },
  };
}
