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
import { boundNarration } from '../content/binding';
import { constraintHolds } from '../content/expr';
import { lineSlots, renderForms } from '../content/render';
import { formatFeatures, formatModel } from '../formats';
import { optionNumber } from '../formats/numeral-pick';
import { inDomain } from '../generators/common';
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
      };
      // When the item asks for a typed value, that value is the answer and the frame or jump target
      // is a given (the whole in a missing-part item).
      if (typeof t.value === 'number') return [t.value];
      const out = (keys[a.checker] ?? []).map((k) => t[k]);
      if (a.checker === 'select.exactSet' && Array.isArray(t.values)) out.push(...t.values);
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

/**
 * The numbers written as numerals in rendered text. A thousands-grouped numeral ("1,000", 03 §8.4
 * display formatting) is one number, not "1" and "000".
 */
export function numeralsIn(text: string): number[] {
  return [...text.matchAll(/(?<![0-9,])(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?![0-9])/g)].map((m) =>
    Number(m[0].replaceAll(',', '')),
  );
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
  if (typeof original.value === 'number') {
    options.push(
      fc.constantFrom(1, -1).map((d) => {
        const s = clone();
        s.value = (original.value as number) + d;
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

function choiceOptions(item: GeneratedItem): string[] {
  const w = item.widget;
  if (w.format === 'numeral-pick') return w.options.map((o) => o.id);
  if (w.format === 'tap-count' && w.mode === 'ordinal') {
    return Array.from({ length: w.set.count }, (_, i) => `obj-${i}`);
  }
  return [];
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
    if (item.widget.format !== t.format)
      fail(seed, '3.format', 'widget.format differs from template.format');
    if (!support.tiers.includes(t.tier))
      fail(seed, '3.tier', `${t.format} does not support ${t.tier}`);
    if (!support.answers.includes(item.answer.kind)) {
      fail(seed, '3.answer', `${t.format} does not answer with ${item.answer.kind}`);
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
    // 9. multiple choice: 3–5 distinct options, exactly one correct
    if (a.kind === 'choice') {
      const ids = choiceOptions(item);
      const correct = ids.filter((id) => checkResponse(item, { kind: 'choice', id }).correct);
      if (
        ids.length < 3 ||
        ids.length > 5 ||
        new Set(ids).size !== ids.length ||
        correct.length !== 1
      ) {
        fail(
          seed,
          '9.choice',
          `options ${canonicalJson(ids)}: need 3–5 distinct with exactly one correct`,
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
