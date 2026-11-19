// Regression tests for the cross-model review of PR #82 (K01 part 5: equality and story
// problems), one block per finding, over the compiled catalog.

import type { GeneratedItem, ItemTemplate, LessonExample, ParamSpec } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { balanceEqual, blocksToBalance } from '../src/check/state/balance.equal';
import { constraintHolds } from '../src/content/expr';
import { render } from '../src/content/render';
import { registry } from '../src/generators';
import { specDomain } from '../src/generators/common';
import { story } from '../src/generators/story/model';
import { generateItem, generateItemFromParams, mergedSpec } from '../src/items/generate';
import { applicableMisconceptions, misconceptionRule } from '../src/misconceptions';
import { createRng } from '../src/rng';
import { numeralsIn } from '../src/testing/properties';
import { fixtureTemplate, loadFixture } from './fixture';

const fixture = loadFixture();
const templatesOf = (skill: string) => fixture.templates.filter((t) => t.skillId === skill);
const SEEDS = 300;
// Items of seeds 1 … n, generated once per template and shared: several tests read the same
// template's items (ADD.23.t3: 3000, 2000, 1500 and 50 seeds), and generation is the cost here.
const generated = new Map<string, GeneratedItem[]>();
const items = (t: ItemTemplate, n = SEEDS): GeneratedItem[] => {
  const have = generated.get(t.id) ?? [];
  for (let k = have.length; k < n; k += 1) have.push(generateItem(t, k + 1));
  generated.set(t.id, have);
  return have.slice(0, n);
};

/** The skills this PR authors (K01 part 5). */
const PR_SKILLS = [
  'ADD.05',
  'ADD.10',
  'ADD.11',
  'ADD.12',
  'ADD.13',
  'ADD.20',
  'ADD.21',
  'ADD.23',
  'ADD.25',
  'CMP.08',
  'ALG.05',
];

describe('PR #82 review (1): ADD.23.t3 equation options never give the key away', () => {
  const pickTemplates = fixture.templates.filter(
    (t) => t.generator === 'story.addsub' && t.format === 'numeral-pick',
  );

  it('ADD.23.t3 is the story numeral-pick template', () => {
    expect(pickTemplates.map((t) => t.id)).toContain('ADD.23.t3');
  });

  it.each(pickTemplates.map((t) => t.id))(
    '%s: over the whole domain, every option of every set is the key of some draw and some seed',
    (id) => {
      const t = fixtureTemplate(id);
      const g = registry.get(t.generator);
      if (!g) throw new Error(t.generator);
      const spec = mergedSpec(t, g);
      const dom = (name: string) => specDomain(spec[name] as ParamSpec);
      // Every accepted draw of the domain: its option set, and the key it marks.
      const keysBySet = new Map<string, Set<string>>();
      const fixed = Object.fromEntries(
        Object.entries(spec)
          .filter(([k]) => !['a', 'b', 'corner'].includes(k))
          .map(([k, s]) => [k, specDomain(s)[0]]),
      );
      for (const a of dom('a')) {
        for (const b of dom('b')) {
          for (const corner of dom('corner')) {
            const raw = { ...fixed, a, b, corner };
            const params = { ...raw, ...g.derive(raw) };
            if (!g.accepts?.(params, t)) continue;
            if (!(t.constraints ?? []).every((c) => constraintHolds(c, params))) continue;
            const out = g.build({ params, template: t, rng: createRng(1).fork('b') });
            if (out.widget.format !== 'numeral-pick' || out.answer.kind !== 'choice') {
              throw new Error('not a pick');
            }
            const ids = out.widget.options.map((o) => o.id).sort();
            const set = ids.join(' ');
            const keys = keysBySet.get(set) ?? new Set<string>();
            keys.add(out.answer.id);
            keysBySet.set(set, keys);
          }
        }
      }
      expect(keysBySet.size).toBeGreaterThan(1);
      for (const [set, keys] of keysBySet) {
        expect([...keys].sort(), set).toEqual(set.split(' '));
        // No equation beside its turn-around (the same two groups in the picture).
        const pairs = set.split(' ').map((s) => s.match(/^eq-(\d+)-(plus|minus)-(\d+)$/));
        for (const m of pairs) {
          if (m?.[2] !== 'plus' || m[1] === m[3]) continue;
          expect(set.split(' '), set).not.toContain(`eq-${m[3]}-plus-${m[1]}`);
        }
      }
      // The seeds reach every (set, key) pair too: the key is drawn, never placed.
      const seen = new Map<string, Set<string>>();
      for (const item of items(t, 3000)) {
        if (item.widget.format !== 'numeral-pick' || item.answer.kind !== 'choice') continue;
        const set = item.widget.options
          .map((o) => o.id)
          .sort()
          .join(' ');
        const keys = seen.get(set) ?? new Set<string>();
        keys.add(item.answer.id);
        seen.set(set, keys);
      }
      for (const [set, keys] of keysBySet) {
        expect([...(seen.get(set) ?? [])].sort(), `seeds for ${set}`).toEqual([...keys].sort());
      }
    },
  );

  it('ADD.23.t3: the key is the least, the greatest or a middle option, about equally often', () => {
    const t = fixtureTemplate('ADD.23.t3');
    const rank = [0, 0, 0, 0];
    for (const item of items(t, 2000)) {
      if (item.widget.format !== 'numeral-pick' || item.answer.kind !== 'choice') continue;
      const key = item.answer.id;
      const sorted = item.widget.options
        .map((o) => {
          const [, x, , y] = o.id.match(/^eq-(\d+)-(plus|minus)-(\d+)$/) ?? [];
          return { id: o.id, x: Number(x), y: Number(y) };
        })
        .sort((p, q) => p.x - q.x || p.y - q.y);
      const at = sorted.findIndex((o) => o.id === key);
      rank[at] = (rank[at] ?? 0) + 1;
    }
    for (const r of rank) expect(r).toBeGreaterThan(2000 / 4 / 1.5);
  });

  it('ADD.23.t3: every key of one option set has the same difficulty, so targeting cannot favour a key', () => {
    // Review round 2: size came from the keyed sum, so a target of 0.45 favoured the largest
    // total. The features now describe the grid, the same for all four corners.
    const t = fixtureTemplate('ADD.23.t3');
    const bySet = new Map<string, Set<number>>();
    for (const item of items(t, 1500)) {
      if (item.widget.format !== 'numeral-pick') continue;
      const set = item.widget.options
        .map((o) => o.id)
        .sort()
        .join(',');
      const d = bySet.get(set) ?? new Set<number>();
      d.add(item.difficulty);
      bySet.set(set, d);
    }
    for (const [set, ds] of bySet) expect([...ds], set).toHaveLength(1);
  });

  it.each([0.45, -0.3, 0, 0.3])(
    'ADD.23.t3 at target %s: guessing the largest total is no better than chance',
    (difficulty) => {
      const t = fixtureTemplate('ADD.23.t3');
      const total = (id: string) => {
        const [, x, op, y] = id.match(/^eq-(\d+)-(plus|minus)-(\d+)$/) ?? [];
        return op === 'minus' ? Number(x) - Number(y) : Number(x) + Number(y);
      };
      let hits = 0;
      // Seeds are fixed, so the count is deterministic. At 400 seeds the 0.35 bound is still
      // more than 4 standard deviations above chance (0.25), at under half the cost of 1000.
      const N = 400;
      for (let seed = 1; seed <= N; seed += 1) {
        const item = generateItem(t, seed, { difficulty });
        if (item.widget.format !== 'numeral-pick' || item.answer.kind !== 'choice') continue;
        const largest = [...item.widget.options].sort((p, q) => total(q.id) - total(p.id))[0];
        if (largest?.id === item.answer.id) hits += 1;
      }
      // One option in four has the largest total (ties go to the first): chance is about 0.25.
      expect(hits / N).toBeLessThan(0.35);
    },
  );

  it('a subtraction grid never offers an operand past maxN (it could never be the key)', () => {
    const g = registry.get('story.addsub');
    const t = { format: 'numeral-pick' } as ItemTemplate;
    const p = {
      situation: 'take-from/result',
      context: 'beach-shells',
      maxN: 5,
      maxTold: 6,
      a: 5,
      b: 2,
      corner: 0,
    };
    // Corner 0 would offer 6 − 2 and 6 − 3, which no draw can key with maxN 5.
    expect(g?.accepts?.(p, t)).toBe(false);
  });

  it('ADD.23.t3: features are rebuilt from the params alone (the drawn corner is a param)', () => {
    const t = fixtureTemplate('ADD.23.t3');
    const g = registry.get(t.generator);
    for (const item of items(t, 50)) {
      expect(typeof item.params.corner).toBe('number');
      const again = g?.build({ params: item.params, template: t, rng: createRng(99).fork('f') });
      expect(again?.answer).toEqual(item.answer);
    }
  });
});

describe('PR #82 review (2): ADD.11 has no numeral-pick; the equality misconceptions discriminate', () => {
  it('ADD.11 practises with constructed templates only, and its test-out pool is constructed', () => {
    const add11 = templatesOf('ADD.11');
    expect(add11.map((t) => t.format)).not.toContain('numeral-pick');
    for (const t of add11) {
      for (const item of items(t, 20)) expect(item.answer.kind, t.id).not.toBe('choice');
    }
    const lesson = fixture.skills.find((s) => s.id === 'ADD.11')?.lesson;
    expect(lesson?.testOut.templateIds).toEqual(['ADD.11.t3', 'ADD.11.t4']);
    const ids = new Set(add11.map((t) => t.id));
    for (const ex of lesson?.faded ?? []) expect(ids.has(ex.templateId ?? '')).toBe(true);
    expect(fixture.narration['p.eq.pick']).toBeUndefined();
  });

  it.each(['MC.equals-means-answer', 'MC.equals-add-all'])(
    '%s discriminates on at least 20 percent of the items of every template it tracks',
    (id) => {
      let tracked = 0;
      // Only the templates of skills the misconception tracks: applicableMisconceptions never
      // returns it for any other skill, so generating their items could only count zero.
      const spec = fixture.misconceptions.find((m) => m.id === id);
      expect(spec).toBeDefined();
      for (const t of fixture.templates.filter((x) => spec?.skills.includes(x.skillId))) {
        let hits = 0;
        let total = 0;
        for (const item of items(t, 100)) {
          const mc = applicableMisconceptions(item, ['answer']).find((m) => m.spec.id === id);
          if (!mc?.rule.predict) continue;
          total += 1;
          if (mc.rule.predict(item) !== null) hits += 1;
        }
        if (total === 0) continue;
        tracked += 1;
        expect(hits / total, t.id).toBeGreaterThanOrEqual(0.2);
      }
      expect(tracked).toBeGreaterThanOrEqual(2);
    },
  );
});

describe('PR #82 review (3): ADD.12 practises with stories only', () => {
  const add12 = templatesOf('ADD.12');

  it('every ADD.12 template is a story.addsub story, the number pads told in their prompt', () => {
    expect(add12.length).toBeGreaterThanOrEqual(3);
    for (const t of add12) {
      expect(t.generator, t.id).toBe('story.addsub');
      for (const item of items(t, 10)) {
        if (item.widget.format === 'story-problem') {
          expect(item.widget.lines.length).toBeGreaterThanOrEqual(2);
        } else {
          expect(item.widget.format).toBe('number-pad');
          // The prompt tells a story: the resident and the nouns of its context.
          expect(item.prompt.vars.who, t.id).toBe('@resident');
          expect(item.prompt.text, t.id).toMatch(/shells/);
        }
      }
    }
  });

  it('the number-pad stories cover a start unknown and a compare story, with bar and line pictures', () => {
    const pads = add12.filter((t) => t.format === 'number-pad');
    const situations = pads.map((t) => story(generateItem(t, 1).params).situation);
    expect(situations.some((s) => s.endsWith('/start'))).toBe(true);
    expect(situations.some((s) => s.startsWith('compare/'))).toBe(true);
    expect(pads.map((t) => t.representation).sort()).toEqual(['bar-model', 'number-line']);
  });

  it.each(['MC.keyword-more-means-add', 'MC.start-unknown-reversed'])(
    '%s tracks an ADD.12 number pad and discriminates on at least 20 percent of what it applies to',
    (id) => {
      let padTracked = false;
      for (const t of add12) {
        let hits = 0;
        let total = 0;
        for (const item of items(t, 200)) {
          const mc = applicableMisconceptions(item, ['answer']).find((m) => m.spec.id === id);
          if (!mc?.rule.predict) continue;
          total += 1;
          if (mc.rule.predict(item) !== null) hits += 1;
        }
        if (total === 0) continue;
        if (t.format === 'number-pad') padTracked = true;
        expect(hits / total, t.id).toBeGreaterThanOrEqual(0.2);
      }
      expect(padTracked).toBe(true);
    },
  );

  it('the two story rules apply only to the items they read', () => {
    const keyword = misconceptionRule('keywordMoreMeansAdd');
    const start = misconceptionRule('startUnknownReversed');
    const t2 = generateItem(fixtureTemplate('ADD.12.t2'), 1); // add-to/start
    const t3 = generateItem(fixtureTemplate('ADD.12.t3'), 1); // compare/smaller-more
    expect(keyword?.applies?.(t2)).toBe(false);
    expect(keyword?.applies?.(t3)).toBe(true);
    expect(start?.applies?.(t2)).toBe(true);
    expect(start?.applies?.(t3)).toBe(false);
    const ids = (item: GeneratedItem) =>
      applicableMisconceptions(item, ['answer']).map((m) => m.spec.id);
    expect(ids(t2)).toContain('MC.start-unknown-reversed');
    expect(ids(t2)).not.toContain('MC.keyword-more-means-add');
    expect(ids(t3)).toContain('MC.keyword-more-means-add');
    expect(ids(t3)).not.toContain('MC.start-unknown-reversed');
  });
});

describe('PR #82 review (6): an authored worked example names the answer only in its last step', () => {
  /** The number the child produces: the typed number, or the blocks a make-equal pan needs. */
  function answerOf(item: GeneratedItem): number | null {
    const a = item.answer;
    if (a.kind === 'number') return a.value;
    if (a.kind === 'state' && a.checker === 'balance.equal') {
      return blocksToBalance(a.target)?.count ?? null;
    }
    return null;
  }

  const cases = fixture.skills
    .filter((s) => PR_SKILLS.includes(s.id) && s.lesson.mode === 'authored')
    .flatMap((s) =>
      s.lesson.worked
        .filter((ex): ex is LessonExample => !!ex.steps?.length && !!ex.params)
        .map((ex, k) => ({ name: `${s.id} worked ${k + 1}`, skill: s, ex })),
    );

  it('the PR has authored worked steps to check (ADD.10, ADD.11)', () => {
    expect(cases.map((c) => c.skill.id)).toEqual(expect.arrayContaining(['ADD.10', 'ADD.11']));
  });

  it.each(cases)('$name', ({ skill, ex }) => {
    const t = fixtureTemplate(ex.templateId ?? skill.lesson.templateId ?? '');
    const item = generateItemFromParams(t, ex.params ?? {});
    const n = answerOf(item);
    expect(n, 'an answer number').not.toBeNull();
    const steps = ex.steps ?? [];
    const says = (k: number): number[] => {
      const st = steps[k];
      if (!st?.say) return [];
      const vars = st.vars ?? {};
      return [
        ...Object.values(vars).filter((v): v is number => typeof v === 'number'),
        ...numeralsIn(render(st.say, vars as Record<string, string | number>)),
      ];
    };
    for (let k = 0; k < steps.length - 1; k += 1) {
      expect(says(k), `step ${k + 1} of ${steps.length} names ${n}`).not.toContain(n);
    }
    expect(says(steps.length - 1)).toContain(n);
  });

  it('the ADD.10 example still balances when its last step places the blocks', () => {
    const lesson = fixture.skills.find((s) => s.id === 'ADD.10')?.lesson;
    const ex = lesson?.worked[0];
    const last = ex?.steps?.at(-1);
    expect(last?.action?.op).toBe('place');
    const count = (last?.action?.args as { count?: number } | undefined)?.count;
    expect(balanceEqual.check({ left: 7, right: 5 }, { left: 0, right: count })).toBe(true);
    for (const st of ex?.steps?.slice(0, -1) ?? []) expect(st.action?.op).not.toBe('place');
  });
});

describe('PR #82 review (7): bond and bar hints fit which slot is unknown', () => {
  // Hints that start from a known part and work towards the whole, and the one that joins parts.
  const PART_UNKNOWN_ONLY = ['h.bond.count-on', 'h.bond.fingers', 'h.bond.through-ten'];
  const WHOLE_UNKNOWN_ONLY = ['h.bond.join-parts'];

  /** Which slot of the item's bond or bar is unknown, or null when it shows none. */
  function unknownSlot(item: GeneratedItem): 'whole' | 'part' | null {
    const w = item.widget;
    if (w.format === 'number-bond') {
      if (w.mode === 'missing-whole') return 'whole';
      if (w.mode === 'missing-part') return 'part';
      return null;
    }
    if (w.format === 'number-pad') {
      const s = w.stimulus;
      if (s.kind !== 'number-bond' && s.kind !== 'bar-model') return null;
      if (s.whole === '?') return 'whole';
      return s.parts.includes('?') ? 'part' : null;
    }
    return null;
  }

  it('ADD.05.t3 (missing whole) hints at joining the parts, not counting up from one', () => {
    const t = fixtureTemplate('ADD.05.t3');
    expect(t.narration.hints).toContain('h.bond.join-parts');
    expect(t.narration.hints).not.toContain('h.bond.count-on');
    for (const item of items(t, 50)) expect(unknownSlot(item)).toBe('whole');
  });

  it('across the catalog, part-only hints never meet an unknown whole, and the join hint never an unknown part', () => {
    let checked = 0;
    for (const t of fixture.templates) {
      const hints = t.narration.hints;
      if (![...PART_UNKNOWN_ONLY, ...WHOLE_UNKNOWN_ONLY].some((h) => hints.includes(h))) continue;
      for (const item of items(t, 40)) {
        const slot = unknownSlot(item);
        if (slot === null) continue;
        checked += 1;
        const banned = slot === 'whole' ? PART_UNKNOWN_ONLY : WHOLE_UNKNOWN_ONLY;
        for (const h of hints)
          expect(banned, `${t.id} (${slot} unknown) uses ${h}`).not.toContain(h);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('PR #82 review (8): CMP.08 symbol hints also fit equal numbers', () => {
  const symbolTemplates = templatesOf('CMP.08').filter(
    (t) => t.generator === 'compare.numbers' && t.params.ask?.kind === 'const',
  );

  it('CMP.08 has symbol templates that can draw a = b', () => {
    expect(symbolTemplates.map((t) => t.id)).toEqual(['CMP.08.t2', 'CMP.08.t3']);
  });

  it.each(symbolTemplates.map((t) => t.id))(
    '%s at 7 _ 7: the key is =, no hint assumes one number is greater, and a hint names "same"',
    (id) => {
      const t = fixtureTemplate(id);
      const item = generateItemFromParams(t, { a: 7, b: 7 });
      expect(item.answer).toEqual({ kind: 'choice', id: '=' });
      const texts = item.hints
        .filter((h) => h.level >= 2 && h.level <= 4)
        .map((h) => render(h.say, h.vars ?? {}));
      // "Find the greater number" or "open it toward the greater one" alone fail when they match.
      for (const text of texts) {
        if (/greater/i.test(text)) expect(text, text).toMatch(/same|=|right on the line/i);
      }
      expect(texts.some((x) => /same/i.test(x))).toBe(true);
    },
  );
});
