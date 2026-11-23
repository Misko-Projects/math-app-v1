// tools/content-check (03 §9.2): the engine checks pass on the fixture set, and each check catches
// the defect it exists for.

import { resetContent } from '@number-island/engine';
import type { ItemTemplate, MisconceptionSpec } from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { type CompiledInput, parameterSpace, runEngineChecks } from './checks';
import { compileInMemory } from './dist';

const fixture = compileInMemory();
// The full engine checks over the whole catalog, minus V15's difficulty-targeting property: that one
// costs about 100 targeted items per template whatever the seed count, so on the K–1 catalog it made
// this test take 2–5 minutes on a loaded CI runner and time out. `pnpm content:validate`, which
// `pnpm verify` runs before the tests, still runs targeting on every template.
const opts = { propertyN: 20, statsN: 100, targeting: false };

// The defect tests look for one diagnostic each, so they run on a slice of the content (the
// addition skills their defects touch) with few seeds: the whole K–1 catalog takes the full run
// tens of seconds on a CI runner.
const SLICE = new Set(['ADD.01', 'ADD.03']);
const small: CompiledInput = {
  ...fixture,
  skills: fixture.skills.filter((s) => SLICE.has(s.id)),
  templates: fixture.templates.filter((t) => SLICE.has(t.skillId)),
};
const defectOpts = { propertyN: 2, statsN: 10 };

afterEach(() => resetContent());

function withTemplate(t: ItemTemplate, extra: Partial<CompiledInput> = {}): CompiledInput {
  return { ...small, templates: [...small.templates, t], ...extra };
}

const base = fixture.templates.find((t) => t.id === 'ADD.01.t4') as ItemTemplate;

// The full run still checks every template of the whole content set, so it keeps its own timeout as
// a margin; the rest of the project keeps Vitest's default.
const FULL_RUN = { timeout: 180_000 };

describe('runEngineChecks on the fixture set', FULL_RUN, () => {
  it('reports no errors and writes stats for every template', () => {
    const { diagnostics, templateStats } = runEngineChecks(fixture, opts);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(Object.keys(templateStats).sort()).toEqual(fixture.templates.map((t) => t.id).sort());
    for (const s of Object.values(templateStats)) {
      expect(s.min).toBeLessThanOrEqual(s.p10);
      expect(s.p10).toBeLessThanOrEqual(s.median);
      expect(s.median).toBeLessThanOrEqual(s.p90);
      expect(s.p90).toBeLessThanOrEqual(s.max);
      expect(s.distinct).toBeGreaterThan(0);
    }
  });
});

describe('each check catches its defect', FULL_RUN, () => {
  const errorsOf = (input: CompiledInput, check: string) =>
    runEngineChecks(input, defectOpts).diagnostics.filter(
      (d) => d.check === check && d.severity === 'error',
    );

  it('V14: an unregistered generator or a format the generator does not build', () => {
    expect(
      errorsOf(withTemplate({ ...base, id: 'ADD.01.t9', generator: 'nope.gen' }), 'V14'),
    ).toHaveLength(1);
    expect(
      errorsOf(withTemplate({ ...base, id: 'ADD.01.t9', format: 'clock-set' }), 'V14'),
    ).toHaveLength(1);
  });

  it('V13: an undeclared param, a mistyped value, an unknown identifier, a bad override', () => {
    const t: ItemTemplate = {
      ...base,
      id: 'ADD.01.t9',
      params: {
        ...base.params,
        colour: { kind: 'const', value: 'red' },
        op: { kind: 'const', value: '*' },
      },
      constraints: ['a + q <= 10', 'a +'],
      difficulty: { base: 0, features: { sparkle: 0.3 } },
    };
    const messages = errorsOf(withTemplate(t), 'V13').map((d) => d.message);
    expect(messages.some((m) => m.includes("no param 'colour'"))).toBe(true);
    expect(messages.some((m) => m.includes('"*"'))).toBe(true);
    expect(messages.some((m) => m.includes('unknown identifier(s) q'))).toBe(true);
    expect(messages.some((m) => m.includes('"a +"'))).toBe(true);
    expect(messages.some((m) => m.includes("'sparkle'"))).toBe(true);
  });

  it('V15: a template the generator cannot satisfy fails the property test', () => {
    const t: ItemTemplate = { ...base, id: 'ADD.01.t9', constraints: ['a + b > 100'] };
    expect(errorsOf(withTemplate(t), 'V15').length).toBeGreaterThan(0);
  });

  it('V18: an example that does not evaluate as declared, and an unregistered rule', () => {
    const spec = fixture.misconceptions.find(
      (m) => m.id === 'MC.count-start-number',
    ) as MisconceptionSpec;
    const flipped: MisconceptionSpec = {
      ...spec,
      examples: spec.examples.map((e) => ({ ...e, match: !e.match })),
    };
    const unknownRule: MisconceptionSpec = {
      ...spec,
      id: 'MC.mystery',
      detect: { kind: 'answer', rule: 'mystery' },
    };
    const input = { ...small, misconceptions: [flipped, unknownRule] };
    const messages = errorsOf(input, 'V18').map((d) => d.message);
    expect(messages.filter((m) => m.includes('but the example declares'))).toHaveLength(2);
    expect(messages.some((m) => m.includes("rule 'mystery' is not registered"))).toBe(true);
  });

  it('V16: a generator narration key that does not exist', () => {
    const narration = { ...small.narration };
    delete narration['gen.addsub.facts.answer'];
    expect(errorsOf({ ...small, narration }, 'V16').map((d) => d.path)).toContain(
      'gen.addsub.facts.answer',
    );
  });

  it('V27: a skill whose constructed-answer templates cannot meet its practiced variety rule', () => {
    // ADD.01 with only t4 left: one format and one tier among its evidence templates.
    const templates = small.templates.filter((t) => t.skillId !== 'ADD.01' || t.id === 'ADD.01.t4');
    expect(errorsOf({ ...small, templates }, 'V27').map((d) => d.path)).toEqual(['ADD.01']);
    // The same template as a choice answer leaves no evidence template at all.
    const choice: ItemTemplate = { ...base, format: 'numeral-pick' };
    const onlyChoice = templates.map((t) => (t.id === 'ADD.01.t4' ? choice : t));
    expect(errorsOf({ ...small, templates: onlyChoice }, 'V27')[0]?.message).toContain('(none)');
  });

  const find = (id: string) => fixture.templates.find((t) => t.id === id) as ItemTemplate;

  it('V28: an ordinal slot with no position word, and a numeral written as an ordinal', () => {
    // CNT.15.t2 asks for "the {k|ord} stone"; without ord.<k> the slot would read "the 3 stone".
    const narration = Object.fromEntries(
      Object.entries(small.narration).filter(([key]) => !key.startsWith('ord.')),
    );
    const missing = errorsOf(withTemplate(find('CNT.15.t2'), { narration }), 'V28');
    // Its prompt and the worked solution's "This one is …" both carry the slot.
    expect(new Set(missing.map((d) => d.path))).toEqual(new Set(['CNT.15.t2']));
    expect(missing[0]?.message).toContain('tp.CNT.15.t2.prompt');
    // A line that interpolates the numeral where the position word belongs.
    const numeral = {
      ...small.narration,
      'tp.X.prompt': { text: 'Tap the {k} one.', clips: [] },
      'tp.Y.prompt': { text: 'Find the {k}th shell.', clips: [] },
    };
    expect(errorsOf({ ...small, narration: numeral }, 'V28').map((d) => d.path)).toEqual([
      'tp.X.prompt',
      'tp.Y.prompt',
    ]);
    expect(errorsOf(withTemplate(find('CNT.15.t2')), 'V28')).toEqual([]);
    // A position word whose spoken override is a numeral: captions and speech read `say` first.
    const spoken = Object.fromEntries(
      Object.entries(small.narration).map(([key, entry]) =>
        key.startsWith('ord.') ? [key, { ...entry, say: key.slice(4) }] : [key, entry],
      ),
    );
    expect(
      errorsOf(withTemplate(find('CNT.15.t2'), { narration: spoken }), 'V28').length,
    ).toBeGreaterThan(0);
  });

  it('V29: a template that can generate a fact with every operand zero', () => {
    const zero: ItemTemplate = {
      ...find('ADD.02.t1'),
      params: {
        ...find('ADD.02.t1').params,
        a: { kind: 'int', min: 0, max: 1 },
        b: { kind: 'int', min: 0, max: 1 },
      },
    };
    const got = errorsOf(withTemplate(zero), 'V29');
    expect(got.map((d) => d.path)).toEqual(['ADD.02.t1']);
    expect(got[0]?.message).toContain('0 + 0');
    // The shipped ranges start at 1; one zero addend is not the defect.
    expect(errorsOf(withTemplate(find('ADD.02.t1')), 'V29')).toEqual([]);
    expect(errorsOf(withTemplate(find('ADD.06.t1')), 'V29')).toEqual([]);
  });

  it('V30: a hint or prompt that assumes unequal numbers on a template that generates equal ones', () => {
    // ADD.03.t1 says "Start with the bigger number."; with a ≥ b it also generates 4 + 4.
    const four = { kind: 'int' as const, min: 4, max: 4 };
    const equal: ItemTemplate = {
      ...find('ADD.03.t1'),
      params: { ...find('ADD.03.t1').params, a: four, b: four },
      constraints: ['a >= b', 'a + b <= 13'],
    };
    const templates = small.templates.map((t) => (t.id === equal.id ? equal : t));
    const got = errorsOf({ ...small, templates }, 'V30');
    expect(got.map((d) => d.path)).toEqual(['ADD.03.t1']);
    expect(got[0]?.message).toContain('h.add.start-big');
    // A prompt asking which group has more, with equal groups and no "They may be the same."
    const conflict: ItemTemplate = { ...find('CMP.05.t1'), constraints: [] };
    expect(errorsOf(withTemplate(conflict), 'V30')[0]?.message).toContain('tp.CMP.05.t1.prompt');
    // "same" alone is no equal answer: "the same way" describes the counting.
    const sameWay = {
      ...small.narration,
      'tp.CMP.05.t1.prompt': {
        ...(small.narration['tp.CMP.05.t1.prompt'] as (typeof small.narration)[string]),
        text: 'Which group has {ask|word}? Count both groups the same way.',
      },
    };
    expect(errorsOf(withTemplate(conflict, { narration: sameWay }), 'V30')[0]?.message).toContain(
      'tp.CMP.05.t1.prompt',
    );
    // CMP.01.t1 generates equal groups too, and its prompt says so.
    expect(errorsOf(withTemplate(find('CMP.01.t1')), 'V30')).toEqual([]);
  });
});

describe('parameterSpace (V22)', () => {
  const t = (id: string) => fixture.templates.find((x) => x.id === id) as ItemTemplate;
  it('counts only valid, distinct param sets', () => {
    // CPS.01.t3: whole 2–5, part 0–5 with part ≤ whole → 3 + 4 + 5 + 6 = 18 bonds.
    expect(parameterSpace(t('CPS.01.t3'))).toBe(18);
    // CPS.01.t1 (split): `part` is not drawn for a split, so only the whole varies.
    expect(parameterSpace(t('CPS.01.t1'))).toBe(4);
    // CPS.03.t1: whole 10, part 1–9.
    expect(parameterSpace(t('CPS.03.t1'))).toBe(9);
  });
});
