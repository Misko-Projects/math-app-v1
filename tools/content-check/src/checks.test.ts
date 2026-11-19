// tools/content-check (03 §9.2): the engine checks pass on the fixture set, and each check catches
// the defect it exists for.

import { resetContent } from '@number-island/engine';
import type { ItemTemplate, MisconceptionSpec } from '@number-island/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { type CompiledInput, parameterSpace, runEngineChecks } from './checks';
import { compileInMemory } from './dist';

const fixture = compileInMemory();
// A quick run: this test proves the checks run clean and write stats for every template. The
// full gate is `pnpm content:validate` (100 property seeds per template with difficulty
// targeting; nightly 500), which `pnpm verify` runs on the same catalog just before the tests.
// Targeting alone is 100 targeted items per template whatever the seed count, so with it this
// test took over its 180 s budget on CI once the K–1 catalog reached 430 templates (#11, PR #84).
const opts = { propertyN: 10, statsN: 20, targeting: false };

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

// The full run checks the whole content set (about 35 s on a CI runner with the K–1 catalog), so it
// gets its own timeout; the rest of the project keeps Vitest's default.
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
