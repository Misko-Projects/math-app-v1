import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import type { CheckId, Diagnostic } from '../diagnostics';
import { readContentFiles } from '../fs';
import { validateContent } from '../validate';
import { compileContent } from './compile';

// Each compiler check (03 §9.2) against the C01 fixture set with one deliberate defect.

// Every test here compiles the full K–1 catalog (or a variant with one file edited). The compiler
// caches clean YAML parses by text (compile/yaml.ts), so after the first compile a variant
// re-parses only its edited files: about 0.1–1.3 s per test at full parallelism, inside the default
// budget.

const FIXTURE = readContentFiles();

type Files = Record<string, string>;
// biome-ignore lint/suspicious/noExplicitAny: tests edit parsed YAML documents of many shapes in place.
type Yaml = { [k: string]: any };

/**
 * Diagnostics other than the expected ones. SUB.03.t5 was added after SUB.03.t4 shipped, and the
 * pictorial constructed-practice templates CNT.14.t6 and GEO.05.t3 after their skills' shipped
 * abstract templates; template ids are stable (03 §4.3), so their V10 tier-order warnings are
 * expected.
 */
// MUL.06.t3: the × 0 misconception examples need MUL.06's first mul.facts template in symbols.
const LATE_PICTORIAL = ['SUB.03.t5', 'CNT.14.t6', 'GEO.05.t3', 'MUL.06.t3'];
const EXPECTED = (d: Diagnostic) =>
  d.check === 'V10' && LATE_PICTORIAL.some((id) => d.message.startsWith(`${id} (pictorial)`));
/**
 * Game data unlock rules may name catalog skills that are not authored yet (03 §9.2): they warn
 * until the curriculum issues author them.
 */
const NOT_AUTHORED = (d: Diagnostic) =>
  d.check === 'V04' && d.severity === 'warn' && /which is not authored yet/.test(d.message);
const unexpected = (ds: readonly Diagnostic[]) =>
  ds.filter((d) => !EXPECTED(d) && !NOT_AUTHORED(d));

function variant(edit: (files: Files) => void): Diagnostic[] {
  const files: Files = { ...FIXTURE };
  edit(files);
  return compileContent(files).diagnostics;
}

function editYaml(files: Files, file: string, fn: (doc: Yaml) => void): void {
  const doc = parse(files[file] as string) as Yaml;
  fn(doc);
  files[file] = stringify(doc);
}

const skill = (doc: Yaml, id: string) => (doc.skills as Yaml[]).find((s) => s.id === id) as Yaml;
const template = (doc: Yaml, id: string) =>
  (doc.templates as Yaml[]).find((t) => t.id === id) as Yaml;

function expectFinding(
  diags: Diagnostic[],
  check: CheckId,
  re: RegExp,
  severity: 'error' | 'warn' = 'error',
) {
  const hit = diags.find((d) => d.check === check && d.severity === severity && re.test(d.message));
  expect(
    hit,
    `expected ${severity} ${check} matching ${re}; got:\n${diags.map((d) => `${d.check} ${d.message}`).join('\n')}`,
  ).toBeDefined();
  return hit as Diagnostic;
}

describe('the C01 fixture set (03 §9.5)', () => {
  it('compiles with no errors and no warnings', () => {
    const result = compileContent(FIXTURE);
    expect(unexpected(result.diagnostics)).toEqual([]);
    expect(result.diagnostics.filter(EXPECTED)).toHaveLength(LATE_PICTORIAL.length);
    expect(result.content?.skills.map((s) => s.id)).toEqual([
      'ADD.01',
      'ADD.02',
      'ADD.03',
      'ADD.04',
      'ADD.05',
      'ADD.06',
      'ADD.07',
      'ADD.08',
      'ADD.09',
      'ADD.10',
      'ADD.11',
      'ADD.12',
      'ADD.13',
      'ADD.14',
      'ADD.15',
      'ADD.16',
      'ADD.17',
      'ADD.18',
      'ADD.19',
      'ADD.20',
      'ADD.21',
      'ADD.22',
      'ADD.23',
      'ADD.24',
      'ADD.25',
      'ADD.26',
      'ADD.27',
      'ALG.01',
      'ALG.02',
      'ALG.03',
      'ALG.04',
      'ALG.05',
      'ALG.06',
      'ALG.07',
      'ALG.09',
      'ALG.10',
      'CMP.01',
      'CMP.02',
      'CMP.03',
      'CMP.04',
      'CMP.05',
      'CMP.06',
      'CMP.07',
      'CMP.08',
      'CMP.09',
      'CMP.10',
      'CMP.11',
      'CMP.12',
      'CMP.13',
      'CNT.01',
      'CNT.02',
      'CNT.03',
      'CNT.04',
      'CNT.05',
      'CNT.06',
      'CNT.07',
      'CNT.08',
      'CNT.09',
      'CNT.10',
      'CNT.11',
      'CNT.12',
      'CNT.13',
      'CNT.14',
      'CNT.15',
      'CNT.16',
      'CNT.17',
      'CNT.18',
      'CNT.19',
      'CNT.20',
      'CPS.01',
      'CPS.02',
      'CPS.03',
      'CPS.04',
      'CPS.05',
      'CPS.06',
      'CPS.07',
      'CPS.08',
      'CPS.09',
      'CPS.10',
      'CPS.11',
      'DAT.01',
      'DAT.02',
      'DAT.03',
      'DAT.04',
      'DAT.05',
      'DAT.09',
      'DAT.10',
      'FRA.01',
      'FRA.02',
      'FRA.03',
      'FRA.04',
      'FRA.06',
      'FRA.07',
      'FRA.08',
      'FRA.09',
      'FRA.10',
      'FRA.11',
      'FRA.12',
      'FRA.13',
      'FRA.16',
      'GEO.01',
      'GEO.02',
      'GEO.03',
      'GEO.04',
      'GEO.05',
      'GEO.06',
      'GEO.07',
      'GEO.08',
      'GEO.09',
      'GEO.10',
      'GEO.11',
      'GEO.12',
      'GEO.15',
      'GEO.16',
      'MDA.01',
      'MDA.02',
      'MDA.03',
      'MDA.04',
      'MDA.05',
      'MDA.06',
      'MDA.07',
      'MDA.08',
      'MDA.09',
      'MDA.10',
      'MDA.11',
      'MDA.12',
      'MDA.13',
      'MDA.14',
      'MDA.15',
      'MDA.16',
      'MDA.17',
      'MDA.18',
      'MDA.19',
      'MDA.21',
      'MDA.22',
      'MDA.24',
      'MDA.25',
      'MEA.01',
      'MEA.02',
      'MEA.03',
      'MEA.04',
      'MEA.07',
      'MEA.08',
      'MEA.09',
      'MEA.10',
      'MEA.15',
      'MEA.16',
      'MEA.22',
      'MON.01',
      'MON.02',
      'MON.03',
      'MON.04',
      'MON.05',
      'MON.06',
      'MON.08',
      'MUL.01',
      'MUL.02',
      'MUL.03',
      'MUL.04',
      'MUL.05',
      'MUL.06',
      'MUL.07',
      'MUL.08',
      'MUL.09',
      'MUL.10',
      'MUL.11',
      'MUL.12',
      'MUL.13',
      'MUL.14',
      'MUL.15',
      'MUL.16',
      'MUL.17',
      'MUL.18',
      'MUL.21',
      'MUL.22',
      'PUZ.01',
      'PUZ.02',
      'PUZ.03',
      'PUZ.04',
      'PUZ.06',
      'PUZ.07',
      'PUZ.09',
      'PV.01',
      'PV.02',
      'PV.03',
      'PV.04',
      'PV.05',
      'PV.06',
      'PV.07',
      'PV.08',
      'PV.09',
      'PV.10',
      'PV.11',
      'PV.12',
      'PV.13',
      'PV.14',
      'PV.15',
      'PV.16',
      'PV.17',
      'PV.18',
      'PV.19',
      'PV.24',
      'SUB.01',
      'SUB.02',
      'SUB.03',
      'SUB.04',
      'SUB.05',
      'SUB.06',
      'SUB.07',
      'SUB.08',
      'SUB.09',
      'TIM.01',
      'TIM.02',
      'TIM.04',
      'TIM.05',
      'TIM.08',
      'TIM.09',
      'TIM.10',
      'TIM.11',
    ]);
    expect(result.content?.misconceptions.map((m) => m.id)).toEqual([
      'MC.add-instead-of-multiply',
      'MC.bigger-unit-more',
      'MC.borrow-across-zero',
      'MC.borrow-no-decrement',
      'MC.cage-repeat-digit',
      'MC.coin-value-by-size',
      'MC.coins-as-ones',
      'MC.compare-first-digit',
      'MC.count-all-instead',
      'MC.count-start-number',
      'MC.decade-transition',
      'MC.digit-order-reversed',
      'MC.dollar-as-one',
      'MC.double-once',
      'MC.equal-shares-look-alike',
      'MC.equals-add-all',
      'MC.equals-means-answer',
      'MC.face-value',
      'MC.first-step-only',
      'MC.forgot-the-ten',
      'MC.forgot-to-regroup-add',
      'MC.fraction-bigger-denominator',
      'MC.fraction-compare-tops',
      'MC.fraction-line-at-whole',
      'MC.fraction-line-ticks',
      'MC.fraction-line-whole',
      'MC.fraction-over-one',
      'MC.fraction-part-to-part',
      'MC.fraction-swapped',
      'MC.fraction-unequal-parts',
      'MC.fraction-whole-count',
      'MC.function-add-for-take',
      'MC.function-backwards',
      'MC.function-column-pattern',
      'MC.function-first-pair-double',
      'MC.grow-as-repeat',
      'MC.hour-hand-next',
      'MC.hour-minute-swap',
      'MC.keyword-more-means-add',
      'MC.lineplot-position-as-count',
      'MC.lineplot-wrong-stack',
      'MC.minute-hand-number',
      'MC.multiply-instead-of-divide',
      'MC.neighbour-fact',
      'MC.off-by-one-counting',
      'MC.partial-product-dropped',
      'MC.pattern-restart',
      'MC.perceptual-size',
      'MC.place-swap',
      'MC.recount-from-one',
      'MC.round-down-always',
      'MC.round-wrong-place',
      'MC.ruler-count-ticks',
      'MC.ruler-read-end',
      'MC.share-counted-whole',
      'MC.skip-count-slip',
      'MC.smaller-from-larger',
      'MC.start-unknown-reversed',
      'MC.symbol-reversed',
      'MC.teen-reversal',
      'MC.tens-dropped',
      'MC.times-zero-keeps',
      'MC.told-number-back',
      'MC.unequal-share',
      'MC.unit-gaps',
      'MC.way-counted-twice',
      'MC.write-as-spoken',
      'MC.wrong-operation',
      'MC.zero-placeholder',
    ]);
  });

  it('is closed under prerequisites and uses only the reference generators and fixture formats', () => {
    const c = compileContent(FIXTURE).content;
    const ids = new Set(c?.skills.map((s) => s.id));
    for (const s of c?.skills ?? []) for (const p of s.prerequisites) expect(ids.has(p)).toBe(true);
    // The five E01 reference generators, plus count.ordinal (K01, CNT.15).
    expect(new Set(c?.templates.map((t) => t.generator))).toEqual(
      new Set([
        'count.set',
        'count.sequence',
        'subitize.flash',
        'bond.parts',
        'addsub.facts',
        // K01 (#11): geometry and measurement
        'geo.identify',
        'geo.compose',
        'geo.position',
        'geo.draw',
        // K02 (#17) slice 3a: equal groups, arrays, even and odd, rows and columns
        'mul.facts',
        'mul.groups',
        'mul.tens',
        // K02 (#17) slice 4a: money
        'money.coins',
        'parity.evenodd',
        'geo.partition',
        'mea.length',
        'mea.massvolume',
        'count.ordinal',
        'subitize.flash',
        'bond.parts',
        'addsub.facts',
        // K01 (#11): comparing, ordering, number lines, estimating
        'compare.sets',
        'compare.numbers',
        'numberline.place',
        // K01 (#11): composing and decomposing (CPS.04, CPS.07)
        'pv.number',
        'estimate.quantity',
        // K01 (#11): fractions, sharing, time, data, patterns and puzzles
        'div.share',
        'frac.partition',
        'frac.compare',
        'frac.line',
        'time.clock',
        'time.sequence',
        'data.sort',
        'data.chart',
        'data.lineplot',
        'pattern.repeat',
        'pattern.grow',
        'puzzle.grid',
        // K02 (#17) slice 4c-2: function machines and equal shares
        'alg.function',
        'frac.shares',
        // K01 (#11): place value and two-digit addition and subtraction
        'pv.regroup',
        'pv.tenmore',
        // K02 (#17) slice 1b: rounding
        'pv.round',
        // K02 (#17) slice 2b: estimating by rounding
        'pv.estimate',
        'mda.addsub',
        // K01 (#11): equality and story problems
        'equality.eq',
        'story.addsub',
        'story.twostep',
        'addsub.three',
      ]),
    );
    expect(new Set(c?.templates.map((t) => t.format))).toEqual(
      new Set([
        'tap-count',
        'make-set',
        'dot-flash',
        'numeral-pick',
        'number-pad',
        'tenframe-fill',
        'number-bond',
        'number-line-jump',
        'hundred-chart',
        'order',
        'rekenrek',
        // K01 (#11): geometry and measurement formats
        'balance',
        'compare',
        'compare-length',
        'measure-length',
        'puzzle-grid',
        'shape-compose',
        'shape-sort',
        // K01 (#11): CMP
        'number-line-place',
        // K01 (#11): CPS (pv.number on the U04 models)
        'base-ten-build',
        'expanded-form',
        // K01 (#11): fractions, sharing, time, data and patterns (no engine model yet for
        // fraction-cut, fraction-pick, fraction-line, clock-set, clock-read, bar-graph-read,
        // bar-graph-build and pattern-extend; equal-share on the U04 model)
        'equal-share',
        'fraction-cut',
        'fraction-pick',
        'fraction-line',
        'clock-set',
        'coin-count',
        'coin-pay',
        'clock-read',
        'bar-graph-read',
        'bar-graph-build',
        'pattern-extend',
        // K01 (#11): PV and MDA
        'base-ten-trade',
        // K01 (#11): equality and story problems
        'story-problem',
        // K02 (#17) slice 3a: equal groups, arrays, rows and columns
        'equal-groups',
        'array-build',
        'area-tiles',
      ]),
    );
  });

  it('derives skills fields: wi, templates, misconceptions, lessons, intro', () => {
    const c = compileContent(FIXTURE).content;
    const add03 = c?.skills.find((s) => s.id === 'ADD.03');
    expect(add03?.standards.wi).toEqual(['M.1.OA.C.5a']);
    expect(add03?.misconceptions).toEqual(['MC.count-all-instead', 'MC.count-start-number']);
    expect(add03?.templates).toEqual(['ADD.03.t1', 'ADD.03.t2', 'ADD.03.t3', 'ADD.03.t4']);
    expect(add03?.lesson.mode).toBe('auto');
    expect(add03?.lesson.templateId).toBe('ADD.03.t1');
    expect(add03?.narration.intro).toBe('sk.ADD.03.intro');
    const cnt03 = c?.skills.find((s) => s.id === 'CNT.03');
    expect(cnt03?.lesson.mode).toBe('authored');
    expect(cnt03?.lesson.outro).toBe('ls.CNT.03.outro');
    const sub01 = c?.skills.find((s) => s.id === 'SUB.01');
    expect(sub01?.standards).toEqual({ ccss: [], supports: ['K.CC.B.5'], wi: ['M.K.CC.B.5'] });
  });

  it('normalises ParamSpec shorthand (03 §5.2)', () => {
    const t = compileContent(FIXTURE).content?.templates.find((x) => x.id === 'CNT.02.t1');
    expect(t?.params).toEqual({
      n: { kind: 'int', min: 1, max: 10 },
      mode: { kind: 'const', value: 'how-many' },
      layout: { kind: 'choice', values: ['line', 'scatter'], weights: [2, 1] },
    });
    expect(t?.representation).toBe('objects'); // the tap-count default, filled in
  });
});

describe('V01: YAML parses and matches its strict schema', () => {
  it('rejects unknown keys with file and path', () => {
    const d = expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) => {
          skill(doc, 'CNT.02').templates = ['CNT.02.t1'];
        }),
      ),
      'V01',
      /unknown key 'templates'/,
    );
    expect(d.file).toBe('skills/CNT.yaml');
    expect(d.path).toBe('skills[1]');
  });
  it('names the expected type', () => {
    const d = expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) => {
          skill(doc, 'CNT.02').gateway = 'no';
        }),
      ),
      'V01',
      /expected boolean/,
    );
    expect(d.path).toBe('skills[1].gateway');
  });
  it('strips _ metadata keys but rejects _meta.status: draft', () => {
    expect(
      unexpected(
        variant((f) =>
          editYaml(f, 'skills/CNT.yaml', (doc) => {
            skill(doc, 'CNT.02')._note = 'authoring note';
          }),
        ),
      ),
    ).toEqual([]);
    expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) => {
          skill(doc, 'CNT.02')._meta = { status: 'draft' };
        }),
      ),
      'V01',
      /draft/,
    );
  });
  it('rejects anchors, aliases and merge keys', () => {
    const anchors = variant((f) => {
      f['skills/CNT.yaml'] = (f['skills/CNT.yaml'] as string).replace(
        'representations: [number-path, hundred-chart, symbols]',
        'representations: &r [number-path, hundred-chart, symbols]',
      );
    });
    expectFinding(anchors, 'V01', /anchors \(&r\) are not allowed/);
    const merge = variant((f) => {
      f['graph.yaml'] = `${f['graph.yaml']}\nextra: { <<: { a: 1 } }\n`;
    });
    expectFinding(merge, 'V01', /merge keys/);
  });
  it('reports unparseable YAML and missing required files', () => {
    expectFinding(
      variant((f) => (f['graph.yaml'] = 'roots: [CNT.01\n')),
      'V01',
      /does not parse/,
    );
    expectFinding(
      variant((f) => delete f['standards/ccss-codes.txt']),
      'V01',
      /required content file is missing/,
    );
  });
  it('checks game data against the shared GameData schema, deep-strict', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'game/residents.yaml', (doc) => {
          doc.residents[0].favouriteColour = 'blue';
        }),
      ),
      'V01',
      /unknown key 'favouriteColour'/,
    );
    expectFinding(
      variant((f) =>
        editYaml(f, 'game/island.yaml', (doc) => {
          doc.island.grid = [10, 8];
        }),
      ),
      'V01',
      /expected 12/,
    );
  });
  it('rejects a ParamSpec whose value set is empty', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CNT.yaml', (doc) => {
          template(doc, 'CNT.02.t1').params.n = { int: [5, 5], exclude: [5] };
        }),
      ),
      'V01',
      /non-empty/,
    );
  });
});

describe('V02: ids', () => {
  it('rejects malformed, misfiled, duplicate and retired ids', () => {
    expectFinding(
      variant((f) => editYaml(f, 'skills/CNT.yaml', (doc) => (skill(doc, 'CNT.07').id = 'CNT.7'))),
      'V02',
      /not a SkillId/,
    );
    expectFinding(
      variant((f) => editYaml(f, 'skills/CNT.yaml', (doc) => (skill(doc, 'CNT.07').id = 'SUB.07'))),
      'V02',
      /does not start with this file's strand CNT/,
    );
    expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) =>
          (doc.skills as Yaml[]).push(structuredClone(skill(doc, 'CNT.07'))),
        ),
      ),
      'V02',
      /duplicate skill id CNT.07/,
    );
    expectFinding(
      variant((f) => (f['retired.yaml'] = 'skills: [CNT.07]\n')),
      'V02',
      /CNT.07 is retired/,
    );
  });
  it('rejects template ids that do not match their skill', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CNT.yaml', (doc) => (template(doc, 'CNT.07.t4').id = 'CNT.06.t9')),
      ),
      'V02',
      /must be CNT.07.t<n>/,
    );
  });
  it('rejects skills in reserved strands and strand/file mismatches', () => {
    expectFinding(
      variant(
        (f) =>
          (f['skills/DIV.yaml'] =
            'strand: DIV\nskills:\n  - { id: DIV.01, name: Share, kind: concept, grade: 4, standards: { ccss: [4.NBT.B.6] }, prerequisites: [], gateway: false, representations: [symbols] }\n'),
      ),
      'V02',
      /reserved/,
    );
    expectFinding(
      variant((f) => editYaml(f, 'skills/ADD.yaml', (doc) => (doc.strand = 'SUB'))),
      'V02',
      /named for ADD but declares strand: SUB/,
    );
  });
  it('rejects a narration key defined twice', () => {
    expectFinding(
      variant(
        (f) => (f['narration/ui.yaml'] = `${f['narration/ui.yaml']}h.replay:\n  text: "Again!"\n`),
      ),
      'V02',
      /also defined in narration\/common.yaml/,
    );
  });
});

describe('V03: sequential ids', () => {
  it('rejects a gap that is neither retired nor planned', () => {
    expectFinding(
      variant((f) => editYaml(f, 'graph.yaml', (doc) => (doc.plannedIds = []))),
      'V03',
      /missing ALG.08/,
    );
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CNT.yaml', (doc) => (template(doc, 'CNT.07.t3').id = 'CNT.07.t5')),
      ),
      'V03',
      /missing CNT.07.t3/,
    );
  });
  it('accepts a retired gap', () => {
    const diags = variant((f) => {
      // ALG.08 moves from planned to retired; the other planned gaps stay planned.
      editYaml(
        f,
        'graph.yaml',
        (doc) => (doc.plannedIds = (doc.plannedIds as string[]).filter((id) => id !== 'ALG.08')),
      );
      f['retired.yaml'] = 'skills: [ALG.08]\n';
    });
    expect(diags.filter((d) => d.check === 'V03')).toEqual([]);
  });
  it('rejects a planned id that is authored', () => {
    expectFinding(
      variant((f) => editYaml(f, 'graph.yaml', (doc) => (doc.plannedIds = ['ADD.01']))),
      'V03',
      /ADD.01 is authored/,
    );
  });
});

describe('V04: references resolve', () => {
  it('reports a dangling prerequisite', () => {
    const d = expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) => skill(doc, 'CNT.07').prerequisites.push('CNT.99')),
      ),
      'V04',
      /unknown prerequisite skill CNT.99/,
    );
    expect(d.path).toBe('skills[6].prerequisites[1]');
  });
  it('reports unknown encompassed, related, template, distractor and misconception references', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'skills/ADD.yaml', (doc) => (skill(doc, 'ADD.03').related = ['ADD.42'])),
      ),
      'V04',
      /unknown related skill ADD.42/,
    );
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'templates/CNT.yaml',
          (doc) => (template(doc, 'CNT.03.t3').distractors = [{ rule: 'MC.nope' }]),
        ),
      ),
      'V04',
      /unknown misconception MC.nope/,
    );
    expectFinding(
      variant((f) =>
        editYaml(f, 'misconceptions/addsub.yaml', (doc) =>
          doc.misconceptions[0].skills.push('ADD.28'),
        ),
      ),
      'V04',
      /unknown skill ADD.28/,
    );
    expectFinding(
      variant((f) =>
        editYaml(f, 'misconceptions/addsub.yaml', (doc) =>
          doc.misconceptions[0].remediation.push('ADD.28'),
        ),
      ),
      'V04',
      /unknown remediation skill ADD.28/,
    );
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'templates/ADD.yaml',
          (doc) => (template(doc, 'ADD.03.t4').params.context = 'moon-base'),
        ),
      ),
      'V04',
      /unknown story context moon-base/,
    );
  });
  it('reports lesson templates that are missing or belong to another skill', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'lessons/CNT.yaml', (doc) => (doc.lessons[0].templateId = 'CNT.02.t1')),
      ),
      'V04',
      /belongs to another skill/,
    );
    expectFinding(
      variant((f) => editYaml(f, 'lessons/CNT.yaml', (doc) => (doc.lessons[0].skillId = 'CNT.42'))),
      'V04',
      /unknown skill CNT.42/,
    );
  });
});

// Game data (02 §5.8): the compiler checks of checkGame, one defect at a time.
const byId = (list: Yaml[], id: string) => list.find((x) => x.id === id) as Yaml;
const gameVariant = (file: string, fn: (doc: Yaml) => void) =>
  variant((f) => editYaml(f, `game/${file}.yaml`, fn));

describe('V04: game data references', () => {
  it('reports unknown buildings and materials, at the file and index they were authored at', () => {
    const home = expectFinding(
      gameVariant('residents', (doc) => (byId(doc.residents, 'hobb').arrival.home = 'castle')),
      'V04',
      /unknown building castle/,
    );
    expect(home.file).toBe('game/residents.yaml');
    expect(home.path).toMatch(/^residents\[\d+\]\.arrival\.home$/);
    expectFinding(
      gameVariant(
        'buildings',
        (doc) => (byId(doc.buildings, 'shell-cottage').levels[0].recipe = { gold: 1 }),
      ),
      'V04',
      /unknown material gold/,
    );
    expectFinding(
      gameVariant(
        'buildings',
        (doc) => (byId(doc.buildings, 'driftwood-hut').unlock = { building: 'castle' }),
      ),
      'V04',
      /unlock rule names unknown building castle/,
    );
  });
  // Fixtures for pendingGameSkills: every test sets the map itself, and uses an id whose existence
  // it controls. CNT.01 is a fixture root (always authored); PUZ.99 can never be authored without
  // PUZ.01–PUZ.98 first (V03), so it stays unauthored whatever the curriculum PRs add.
  const AUTHORED = 'CNT.01';
  const UNAUTHORED = 'PUZ.99';
  it('the pending-skill fixtures hold: one id is authored, the other is not', () => {
    const ids = new Set(compileContent(FIXTURE).content?.skills.map((s) => s.id));
    expect(ids.has(AUTHORED)).toBe(true);
    expect(ids.has(UNAUTHORED)).toBe(false);
  });
  const pendingVariant = (
    pending: Record<string, string[]>,
    lighthouseSkill?: string,
  ): Diagnostic[] =>
    variant((f) => {
      editYaml(f, 'graph.yaml', (doc) => {
        doc.pendingGameSkills = { ...doc.pendingGameSkills, ...pending };
      });
      if (lighthouseSkill)
        editYaml(f, 'game/buildings.yaml', (doc) => {
          byId(doc.buildings, 'lighthouse').unlock.all[1].skill = lighthouseSkill;
        });
    });
  it('warns, not errors, on an unauthored skill pendingGameSkills lists for that place (03 §9.2)', () => {
    const diags = pendingVariant({ [UNAUTHORED]: ['building:lighthouse'] }, UNAUTHORED);
    const hit = expectFinding(diags, 'V04', /skill PUZ.99, which is not authored yet/, 'warn');
    expect(hit.file).toBe('game/buildings.yaml');
    expect(hit.path).toMatch(/^buildings\[\d+\]\.unlock\.all\[1\]$/);
    expect(diags.filter((d) => d.severity === 'error')).toEqual([]);
  });
  it('rejects an unauthored skill anywhere it is not listed for, such as a typo', () => {
    expectFinding(
      pendingVariant({}, 'CPS.30'),
      'V04',
      /unknown skill CPS.30; .* must be listed for building:lighthouse in graph.yaml: pendingGameSkills/,
    );
    // Pending for another place does not cover this one: the Lighthouse naming PUZ.99 is an
    // error while PUZ.99 is pending only for the Brick Factory.
    expectFinding(
      pendingVariant({ [UNAUTHORED]: ['building:brick-factory'] }, UNAUTHORED),
      'V04',
      /unknown skill PUZ.99; .* listed for building:lighthouse/,
    );
  });
  it('a pending entry covers one clause: naming the skill twice in one rule is an error', () => {
    // The Bakery shape, any[authored, pending]: editing the authored clause into the pending
    // skill must not let the one entry silently cover both clauses (and drop a route).
    const bakery = (clauses: string[]) =>
      variant((f) => {
        editYaml(f, 'graph.yaml', (doc) => {
          doc.pendingGameSkills = {
            ...doc.pendingGameSkills,
            [UNAUTHORED]: ['building:bakery'],
          };
        });
        editYaml(f, 'game/buildings.yaml', (doc) => {
          byId(doc.buildings, 'bakery').unlock = {
            any: clauses.map((skill) => ({ skill, atLeast: 'ready' })),
          };
        });
      });
    const ok = bakery([AUTHORED, UNAUTHORED]);
    expectFinding(ok, 'V04', /skill PUZ.99, which is not authored yet/, 'warn');
    expect(ok.filter((d) => d.severity === 'error')).toEqual([]);
    const hit = expectFinding(
      bakery([UNAUTHORED, UNAUTHORED]),
      'V04',
      /unlock rule of building:bakery names pending skill PUZ.99 2 times/,
    );
    expect(hit.file).toBe('game/buildings.yaml');
    expect(hit.path).toMatch(/^buildings\[\d+\]\.unlock$/);
  });
  it('a stale pendingGameSkills entry or place warns, never errors', () => {
    const authored = pendingVariant({ [AUTHORED]: ['building:lighthouse'] });
    expectFinding(authored, 'V03', /CNT.01 is authored; remove it from pendingGameSkills/, 'warn');
    expect(authored.filter((d) => d.severity === 'error')).toEqual([]);
    const unused = pendingVariant({ [UNAUTHORED]: ['building:market', 'ring:3'] });
    for (const place of ['building:market', 'ring:3']) {
      const hit = expectFinding(
        unused,
        'V04',
        new RegExp(`no unlock rule of ${place} names PUZ.99; remove it from pendingGameSkills`),
        'warn',
      );
      expect(hit.file).toBe('graph.yaml');
    }
    expect(unused.filter((d) => d.severity === 'error')).toEqual([]);
  });
  it('pendingGameSkills keys are canonical SkillIds and its places follow the grammar', () => {
    expectFinding(
      pendingVariant({ 'CPS.4': ['building:brick-factory'] }),
      'V02',
      /'CPS.4' is not a canonical SkillId/,
    );
    expectFinding(
      pendingVariant({ [UNAUTHORED]: ['brick-factory'] }),
      'V02',
      /'brick-factory' is not building:<id>, resident:<id>, outfit:<option> or ring:<index>/,
    );
  });
  it('rejects unlock skills of unknown or reserved strands, and retired skills', () => {
    const lighthouse = (skill: string) =>
      gameVariant('buildings', (doc) => {
        byId(doc.buildings, 'lighthouse').unlock.all[1].skill = skill;
      });
    expectFinding(lighthouse('XYZ.01'), 'V04', /unknown skill XYZ.01 \(no strand XYZ\)/);
    expectFinding(lighthouse('DIV.01'), 'V04', /DIV.01 in reserved strand DIV/);
    expectFinding(
      variant((f) => {
        f['retired.yaml'] = 'skills: [MUL.13]\ntemplates: []\n';
        editYaml(f, 'game/buildings.yaml', (doc) => {
          byId(doc.buildings, 'lighthouse').unlock.all[1].skill = 'MUL.13';
        });
      }),
      'V04',
      /retired skill MUL.13/,
    );
    // A malformed id fails the shared SkillId schema.
    expectFinding(lighthouse('MUL.2'), 'V01', /SkillId/);
  });
  it('level unlocks are decor:<id>, outfit:<option> or resident:<id> naming defined ones', () => {
    const unlocks = (u: string) =>
      gameVariant('buildings', (doc) => {
        byId(doc.buildings, 'road-crew').levels[1].unlocks = [u];
      });
    expectFinding(unlocks('badge:CNT.01'), 'V04', /'badge:CNT.01' is not decor:<id>/);
    expectFinding(unlocks('shell-bench'), 'V04', /'shell-bench' is not decor:<id>/);
    expectFinding(unlocks('skill:CNT.01'), 'V04', /is not decor:<id>, outfit:<option>/);
    expectFinding(unlocks('decor:castle'), 'V04', /unknown decor castle/);
    expectFinding(unlocks('outfit:hat-crown'), 'V04', /unknown outfit hat-crown/);
    expectFinding(unlocks('resident:nobody'), 'V04', /unknown resident nobody/);
    expectFinding(unlocks('decor:'), 'V04', /'decor:' is not decor:<id>/);
    expectFinding(unlocks(':shell-bench'), 'V04', /':shell-bench' is not decor:<id>/);
    // A bare prefix is not a grant, even when a decor happens to be called 'decor'.
    const bare = variant((f) => {
      editYaml(f, 'game/decor.yaml', (doc) =>
        doc.decor.push({ id: 'decor', art: 'decor/decor', footprint: [1, 1], source: 'starter' }),
      );
      editYaml(f, 'game/buildings.yaml', (doc) => {
        byId(doc.buildings, 'road-crew').levels[1].unlocks = ['decor'];
      });
    });
    expectFinding(bare, 'V04', /'decor' is not decor:<id>/);
    for (const ok of ['decor:fountain', 'outfit:hat-captain', 'resident:marlo']) {
      expect(unlocks(ok).filter((d) => d.severity === 'error')).toEqual([]);
    }
  });
  it("a resident's home is a building of kind home, named only when it arrives via home", () => {
    expectFinding(
      gameVariant('residents', (doc) => (byId(doc.residents, 'hobb').arrival.home = 'market')),
      'V04',
      /market is a workshop, not a home/,
    );
    expectFinding(
      gameVariant('residents', (doc) => delete byId(doc.residents, 'hobb').arrival.home),
      'V01',
      /hobb arrives via home but names no home/,
    );
    expectFinding(
      gameVariant(
        'residents',
        (doc) => (byId(doc.residents, 'marlo').arrival.home = 'shell-cottage'),
      ),
      'V01',
      /only a resident that arrives via home names a home/,
    );
  });
  it('affinity names workshops', () => {
    expectFinding(
      gameVariant('residents', (doc) => (byId(doc.residents, 'nib').affinity = ['storehouse'])),
      'V04',
      /unknown workshop storehouse/,
    );
  });
  it("the island's names are listed once each, and their spoken lines exist (05 §10 step 3)", () => {
    expectFinding(
      gameVariant('island', (doc) => {
        doc.island.names[1].name = doc.island.names[0].name;
      }),
      'V02',
      /duplicate island name Shell/,
    );
    expectFinding(
      gameVariant('island', (doc) => {
        doc.island.names[0].welcome = 'game.island.welcome.nowhere';
      }),
      'V16',
      /narration key game\.island\.welcome\.nowhere does not exist/,
    );
  });
  it('ring rules use island facts and outfit rules no learner facts but mastery (02 §4.3)', () => {
    expectFinding(
      gameVariant('island', (doc) => {
        doc.island.rings[2].unlock = { skill: 'CNT.01', atLeast: 'practiced' };
      }),
      'V04',
      /a ring rule cannot use 'skill'/,
    );
    expectFinding(
      gameVariant('island', (doc) => {
        doc.island.rings[2].unlock = { any: [{ roadLength: 20 }, { masteredCount: 3 }] };
      }),
      'V04',
      /a ring rule cannot use 'masteredCount'/,
    );
    expectFinding(
      gameVariant('progression', (doc) => {
        doc.outfits[0].unlock = { minGrade: '1' };
      }),
      'V04',
      /an outfit rule cannot use 'minGrade'/,
    );
  });
});

describe('V01/V02: game data shape', () => {
  it('a workshop has a workshopId, unique; other buildings have none', () => {
    expectFinding(
      gameVariant('buildings', (doc) => delete byId(doc.buildings, 'bakery').workshopId),
      'V01',
      /workshop bakery needs a workshopId/,
    );
    expectFinding(
      gameVariant(
        'buildings',
        (doc) => (byId(doc.buildings, 'shell-cottage').workshopId = 'shell-cottage'),
      ),
      'V01',
      /only a workshop has a workshopId/,
    );
    expectFinding(
      gameVariant('buildings', (doc) => (byId(doc.buildings, 'bakery').workshopId = 'market')),
      'V02',
      /duplicate workshopId market/,
    );
  });
  it('levels are numbered 1, 2, 3 in order', () => {
    expectFinding(
      gameVariant('buildings', (doc) => byId(doc.buildings, 'market').levels.reverse()),
      'V01',
      /levels are numbered 1, 2, 3 in order; expected 1/,
    );
  });
  it('rejects duplicate ids, outfit options and festival ids', () => {
    expectFinding(
      gameVariant('progression', (doc) => doc.outfits.push(structuredClone(doc.outfits[0]))),
      'V02',
      /duplicate outfit option hat-captain/,
    );
    expectFinding(
      gameVariant('progression', (doc) => doc.festivals.push(structuredClone(doc.festivals[0]))),
      'V02',
      /duplicate festival id lantern-night/,
    );
    expectFinding(
      gameVariant('decor', (doc) => doc.decor.push(structuredClone(doc.decor[0]))),
      'V02',
      /duplicate decor id shell-bench/,
    );
  });
  it('ring and road plots lie inside the 12 × 8 grid; a plot is in one ring; stones ascend', () => {
    expectFinding(
      gameVariant('island', (doc) => (doc.island.road[0].plot = [12, 0])),
      'V01',
      /plot \[12, 0\] is outside the 12 × 8 grid/,
    );
    expectFinding(
      gameVariant('island', (doc) => doc.island.rings[1].plots.push([0, 8])),
      'V01',
      /plot \[0, 8\] is outside/,
    );
    expectFinding(
      gameVariant('island', (doc) => doc.island.rings[2].plots.push([4, 4])),
      'V02',
      /plot \[4, 4\] is already in ring 0/,
    );
    const swapped = gameVariant('island', (doc) => {
      const [a, b] = doc.island.road;
      doc.island.road[0] = b;
      doc.island.road[1] = a;
    });
    const hit = expectFinding(swapped, 'V02', /increasing order \(1 after 2\)/);
    expect(hit.file).toBe('game/island.yaml');
  });
  it('a plot holds at most 64 road stones, the most the road planner is tested to fit', () => {
    const crowd = (k: number) =>
      gameVariant('island', (doc) => {
        const plot = doc.island.road[0].plot;
        const last = doc.island.road.at(-1).n as number;
        for (let i = 1; i <= k; i++) doc.island.road.push({ n: last + i, plot: [...plot] });
      });
    const stonesOn = (k: number) => {
      const doc = parse(FIXTURE['game/island.yaml'] as string) as Yaml;
      const key = doc.island.road[0].plot.join(',');
      return doc.island.road.filter((s: Yaml) => s.plot.join(',') === key).length + k;
    };
    const atCap = 64 - stonesOn(0);
    expect(atCap).toBeGreaterThan(0);
    expect(stonesOn(atCap)).toBe(64);
    expect(unexpected(crowd(atCap)).filter((d) => d.severity === 'error')).toEqual([]);
    const hits = unexpected(crowd(atCap + 1)).filter((d) =>
      /more than 64 road stones/.test(d.message),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ check: 'V02', file: 'game/island.yaml', severity: 'error' });
  });
});

describe('V05: roots allowlist', () => {
  it('rejects a skill without prerequisites that is not a root', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) => (skill(doc, 'CNT.05').prerequisites = [])),
      ),
      'V05',
      /CNT.05 has no prerequisites but is not in the graph.yaml roots/,
    );
  });
});

describe('V06: the prerequisite graph is a DAG', () => {
  it('rejects a cycle and prints its path', () => {
    const d = expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) => skill(doc, 'CNT.02').prerequisites.push('CNT.04')),
      ),
      'V06',
      /prerequisite cycle/,
    );
    expect(d.message).toContain('CNT.04 → CNT.02 → CNT.03 → CNT.04');
  });
  it('rejects a PUZ prerequisite', () => {
    const diags = variant((f) => {
      f['skills/PUZ.yaml'] =
        'strand: PUZ\nskills:\n  - { id: PUZ.01, name: Number paths, kind: problem-solving, grade: 1, standards: { ccss: [], supports: [1.OA.C.6] }, prerequisites: [CNT.07], gateway: false, representations: [symbols] }\n';
      editYaml(f, 'skills/ADD.yaml', (doc) => skill(doc, 'ADD.03').prerequisites.push('PUZ.01'));
    });
    expectFinding(diags, 'V06', /enrichment puzzle PUZ.01/);
  });
});

describe('V07: encompasses', () => {
  it('rejects a non-ancestor and a weight outside (0, 1]', () => {
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'skills/CNT.yaml',
          (doc) => (skill(doc, 'CNT.06').encompasses = { 'CNT.07': 0.5 }),
        ),
      ),
      'V07',
      /CNT.07 is not an ancestor of CNT.06/,
    );
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'skills/CNT.yaml',
          (doc) => (skill(doc, 'CNT.06').encompasses = { 'CNT.04': 1.5 }),
        ),
      ),
      'V07',
      /weight 1.5 must be in \(0, 1\]/,
    );
  });
});

describe('V08–V12: templates per skill', () => {
  it('V08: ≥ 2 templates across ≥ 2 formats', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CNT.yaml', (doc) => {
          template(doc, 'CNT.02.t2').format = 'tap-count';
          template(doc, 'CNT.02.t2').representation = 'ten-frame';
        }),
      ),
      'V08',
      /CNT.02 needs ≥ 2 templates across ≥ 2 formats/,
    );
  });
  it('V09: gateway skills need an abstract template', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CNT.yaml', (doc) => (template(doc, 'CNT.03.t4').tier = 'pictorial')),
      ),
      'V09',
      /gateway skill CNT.03/,
    );
  });
  it('V10: representations listed, used and ordered', () => {
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'templates/CNT.yaml',
          (doc) => (template(doc, 'CNT.02.t3').representation = 'fingers'),
        ),
      ),
      'V10',
      /uses representation fingers, which CNT.02 does not list/,
    );
    expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) =>
          skill(doc, 'CNT.02').representations.push('number-path'),
        ),
      ),
      'V10',
      /lists number-path but no template uses it/,
    );
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CNT.yaml', (doc) => (template(doc, 'CNT.01.t1').tier = 'abstract')),
      ),
      'V10',
      // The mutated skill's own template, not the expected SUB.03.t5 warning in the baseline.
      /^CNT\.01\.t\d+ \(\w+\) comes after a more abstract template/,
      'warn',
    );
  });
  it('V11: representation, tier and distractors fit the format', () => {
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'templates/CNT.yaml',
          (doc) => (template(doc, 'CNT.04.t3').representation = 'objects'),
        ),
      ),
      'V11',
      /tenframe-fill cannot render objects/,
    );
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/SUB.yaml', (doc) => (template(doc, 'SUB.01.t1').tier = 'concrete')),
      ),
      'V11',
      /dot-flash supports the pictorial tier/,
    );
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'templates/CNT.yaml',
          (doc) => (template(doc, 'CNT.03.t4').distractors = [{ rule: 'MC.off-by-one-counting' }]),
        ),
      ),
      'V11',
      /only for multiple-choice formats/,
    );
  });
  it('V12: fluency if and only if fact-fluency', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'skills/ADD.yaml', (doc) => (skill(doc, 'ADD.01').kind = 'fact-fluency')),
      ),
      'V12',
      /needs fluency.medianLatencyMs/,
    );
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'skills/ADD.yaml',
          (doc) => (skill(doc, 'ADD.01').fluency = { medianLatencyMs: 3000 }),
        ),
      ),
      'V12',
      /only for fact-fluency skills/,
    );
    const noPad = variant((f) => {
      editYaml(f, 'skills/ADD.yaml', (doc) =>
        Object.assign(skill(doc, 'ADD.01'), {
          kind: 'fact-fluency',
          fluency: { medianLatencyMs: 3500 },
        }),
      );
      editYaml(f, 'templates/ADD.yaml', (doc) => (template(doc, 'ADD.01.t4').tier = 'pictorial'));
    });
    expectFinding(noPad, 'V12', /needs an abstract number-pad template/);
  });
});

describe('V16: narration completeness', () => {
  it('reports a missing narration line', () => {
    const d = expectFinding(
      variant(
        (f) =>
          (f['narration/CNT.yaml'] = (f['narration/CNT.yaml'] as string).replace(
            /sk\.CNT\.05\.intro:\n.*\n/,
            '',
          )),
      ),
      'V16',
      /missing narration sk.CNT.05.intro/,
    );
    expect(d.file).toBe('skills/CNT.yaml');
  });
  it('requires the always-present keys and a retry line per format in use', () => {
    expectFinding(
      variant(
        (f) =>
          (f['narration/common.yaml'] = (f['narration/common.yaml'] as string).replace(
            /fb\.correct\.6:\n.*\n.*\n/,
            '',
          )),
      ),
      'V16',
      /missing narration fb.correct.6/,
    );
    expectFinding(
      variant(
        (f) =>
          (f['narration/common.yaml'] = (f['narration/common.yaml'] as string).replace(
            /fb\.rekenrek\.retry:\n.*\n/,
            '',
          )),
      ),
      'V16',
      /fb.rekenrek.retry/,
    );
  });
  it('requires the clip inventory and resident name clips', () => {
    expectFinding(
      variant(
        (f) =>
          (f['narration/numbers.yaml'] = (f['narration/numbers.yaml'] as string).replace(
            /num\.57:\n.*\n/,
            '',
          )),
      ),
      'V16',
      /missing narration num.57 \(clip inventory/,
    );
    expectFinding(
      variant(
        (f) =>
          (f['narration/game.yaml'] = (f['narration/game.yaml'] as string).replace(
            /res\.nib:\n.*\n/,
            '',
          )),
      ),
      'V16',
      /res.nib does not exist/,
    );
  });
  it('rejects malformed slots and untyped string slots', () => {
    expectFinding(
      variant(
        (f) =>
          (f['narration/common.yaml'] = (f['narration/common.yaml'] as string).replace(
            'Split {whole} into two parts.',
            'Split {whole|money} into two parts.',
          )),
      ),
      'V16',
      /unknown type 'money'/,
    );
    expectFinding(
      variant(
        (f) =>
          (f['narration/common.yaml'] = (f['narration/common.yaml'] as string).replace(
            'Split {whole} into two parts.',
            'Split {unknown} into two parts.',
          )),
      ),
      'V16',
      /string param 'unknown'.*need a type/,
    );
  });
  it('warns about orphan keys', () => {
    expectFinding(
      variant(
        (f) =>
          (f['narration/CNT.yaml'] =
            `${f['narration/CNT.yaml']}tp.CNT.01.t9.prompt:\n  text: "Count!"\n`),
      ),
      'V16',
      /orphan narration key tp.CNT.01.t9.prompt/,
      'warn',
    );
  });
});

describe('V17: reading level and tone', () => {
  it('rejects a K line over 12 words and over 2 sentences', () => {
    expectFinding(
      variant(
        (f) =>
          (f['narration/CNT.yaml'] = (f['narration/CNT.yaml'] as string).replace(
            'Touch each one as you count it.',
            'Touch each one as you count it and then say the number out loud.',
          )),
      ),
      'V17',
      /14 words; reading level K allows 12/,
    );
    expectFinding(
      variant(
        (f) =>
          (f['narration/CNT.yaml'] = (f['narration/CNT.yaml'] as string).replace(
            'Touch each one as you count it.',
            'Touch each. Count it. Say it.',
          )),
      ),
      'V17',
      /3 sentences; reading level K allows 2/,
    );
  });
  it('honours an explicit level', () => {
    const diags = variant(
      (f) =>
        (f['narration/CNT.yaml'] = (f['narration/CNT.yaml'] as string).replace(
          '  text: "Touch each one as you count it."',
          '  text: "Touch each one as you count it and then say the number out loud."\n  level: 2',
        )),
    );
    expect(diags.filter((d) => d.check === 'V17' && d.severity === 'error')).toEqual([]);
  });
  it('rejects tone words in feedback and denylist words anywhere', () => {
    expectFinding(
      variant(
        (f) =>
          (f['narration/common.yaml'] = (f['narration/common.yaml'] as string).replace(
            'Find the smallest one first.',
            'That is wrong. Find the smallest one first.',
          )),
      ),
      'V17',
      /'wrong' is not allowed/,
    );
    expectFinding(
      variant(
        (f) =>
          (f['narration/game.yaml'] = (f['narration/game.yaml'] as string).replace(
            'Thank you for my new home.',
            'You are so smart.',
          )),
      ),
      'V17',
      /'smart' is not allowed/,
    );
  });
  it('warns about words off the reading list', () => {
    expectFinding(
      variant(
        (f) =>
          (f['narration/CNT.yaml'] = (f['narration/CNT.yaml'] as string).replace(
            'Touch each one as you count it.',
            'Enumerate each one.',
          )),
      ),
      'V17',
      /not on the K–1 word list: enumerate/,
      'warn',
    );
  });
});

describe('V18: misconception examples', () => {
  it('needs a matching and a non-matching example', () => {
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'misconceptions/counting.yaml',
          (doc) => (doc.misconceptions[0].examples = doc.misconceptions[0].examples.slice(0, 1)),
        ),
      ),
      'V18',
      /needs ≥ 1 example with match: true and ≥ 1 with match: false/,
    );
  });
  it('warns when remediation is not a listed skill or an ancestor', () => {
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'misconceptions/counting.yaml',
          (doc) => (doc.misconceptions[0].remediation = ['ADD.03']),
        ),
      ),
      'V18',
      /ADD.03 is neither a listed skill nor an ancestor/,
      'warn',
    );
  });
});

describe('V19: standards codes', () => {
  it('rejects a code that is not in the code list', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) => (skill(doc, 'CNT.01').standards.ccss = ['K.CC.1'])),
      ),
      'V19',
      /K.CC.1 is not in standards\/ccss-codes.txt/,
    );
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'skills/SUB.yaml',
          (doc) => (skill(doc, 'SUB.01').standards.wi = ['M.K.CC.B.9']),
        ),
      ),
      'V19',
      /M.K.CC.B.9 is not in standards\/wi-2021-codes.txt/,
    );
  });
  it('rejects a derived WI code missing from the WI list (incomplete exception table)', () => {
    const diags = variant((f) => {
      editYaml(f, 'skills/ADD.yaml', (doc) => skill(doc, 'ADD.03').standards.ccss.push('1.OA.D.8'));
      editYaml(f, 'standards/wi-exceptions.yaml', (doc) => delete doc.exceptions['1.OA.D.8']);
    });
    expectFinding(diags, 'V19', /derived WI code M.1.OA.D.8 .* exception table .* is incomplete/);
  });
});

describe('V20: coverage', () => {
  it('covers every K and grade-1 code: K01 sets coverageGrades [K, 1]', () => {
    expect((parse(FIXTURE['graph.yaml'] as string) as Yaml).coverageGrades).toEqual(['K', 1]);
    expect(compileContent(FIXTURE).diagnostics.filter((d) => d.check === 'V20')).toEqual([]);
  });
  it('rejects an uncovered code in a covered grade', () => {
    const diags = variant((f) => {
      editYaml(f, 'graph.yaml', (doc) => (doc.coverageGrades = ['K']));
      // CNT.14 is the only skill tagged K.CC.B.4c; retag it so K.CC.B.4 is partly covered.
      editYaml(
        f,
        'skills/CNT.yaml',
        (doc) => (skill(doc, 'CNT.14').standards.ccss = ['K.CC.B.4b']),
      );
      // ADD.20 is the only skill tagged K.OA.A.2; a supports tag does not address it.
      editYaml(
        f,
        'skills/ADD.yaml',
        (doc) => (skill(doc, 'ADD.20').standards = { ccss: [], supports: ['K.OA.A.2'] }),
      );
      // DAT.02 is the only skill tagged 1.MD.C.4; grade 1 is not judged here.
      editYaml(
        f,
        'skills/DAT.yaml',
        (doc) => (skill(doc, 'DAT.02').standards = { ccss: [], supports: ['1.MD.C.4'] }),
      );
    });
    expectFinding(diags, 'V20', /uncovered standard K.OA.A.2/);
    expectFinding(diags, 'V20', /uncovered standard K.CC.B.4 \(untagged parts: K.CC.B.4c\)/);
    // Supports never count: K.OA.A.3 is addressed by CPS.01/CPS.02, K.CC.B.5 by CNT.04/CNT.06.
    expect(diags.some((d) => /standard K.OA.A.3\b/.test(d.message))).toBe(false);
    // Grades outside coverageGrades are not judged.
    expect(diags.some((d) => /standard 1\./.test(d.message))).toBe(false);
  });
  it('needs a ccss or supports code except for ALG.01 and ALG.04', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'skills/CNT.yaml', (doc) => (skill(doc, 'CNT.07').standards = { ccss: [] })),
      ),
      'V20',
      /CNT.07 needs a ccss or supports code/,
    );
  });
});

describe('V21: lessons', () => {
  it('rejects an op the format does not have', () => {
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'lessons/CNT.yaml',
          (doc) => (doc.lessons[0].worked[0].steps[0].action.op = 'hop'),
        ),
      ),
      'V21',
      /op 'hop' does not exist for tap-count/,
    );
  });
  it('needs exactly one of params and seed', () => {
    expectFinding(
      variant((f) => editYaml(f, 'lessons/CNT.yaml', (doc) => (doc.lessons[0].faded[0].seed = 7))),
      'V21',
      /exactly one of params and seed/,
    );
  });
  it('checks given params against the ParamSpec and the constraints', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'lessons/CNT.yaml', (doc) => (doc.lessons[0].faded[0].params.n = 12)),
      ),
      'V21',
      /n: 12 is outside CNT.03.t1's ParamSpec/,
    );
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'lessons/CPS.yaml',
          (doc) => (doc.lessons[0].faded[0].params = { whole: 7, part: 7, unknown: 'part' }),
        ),
      ),
      'V21',
      /break CPS.02.t3's constraint "part < whole"/,
    );
  });
  it('keeps the demo doing at least one step', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'lessons/CNT.yaml', (doc) => (doc.lessons[0].worked[0].childSteps = 3)),
      ),
      'V21',
      /childSteps \(3\) must be less than the number of steps \(3\)/,
    );
  });
  it('needs eligible test-out templates', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CNT.yaml', (doc) => (template(doc, 'CNT.04.t3').tier = 'concrete')),
      ),
      'V21',
      /CNT.04 has no abstract or pictorial template for its test-out/,
    );
  });
  it('warns when a gateway skill uses an auto lesson', () => {
    expectFinding(
      variant((f) => delete f['lessons/SUB.yaml']),
      'V21',
      /gateway skill SUB.03 uses an auto lesson/,
      'warn',
    );
  });
});

describe('V21: the test-out pool (03 §6.5) is resolved into testOut.templateIds', () => {
  const pool = (files: Files, id: string) =>
    compileContent(files).content?.skills.find((s) => s.id === id)?.lesson.testOut.templateIds;
  it('uses abstract templates, else pictorial, and never choice-only ones when others remain', () => {
    expect(pool(FIXTURE, 'ADD.03')).toEqual(['ADD.03.t4']);
    expect(pool(FIXTURE, 'CPS.01')).toEqual(['CPS.01.t4', 'CPS.01.t5']);
    // SUB.01.t3 is numeral-pick; SUB.01.t4 is the number-pad one.
    expect(pool(FIXTURE, 'SUB.01')).toEqual(['SUB.01.t1', 'SUB.01.t2', 'SUB.01.t4']);
  });
  it('adds pictorial templates for a gateway skill whose abstract ones span one representation', () => {
    expect(pool(FIXTURE, 'CNT.03')).toEqual(['CNT.03.t2', 'CNT.03.t4']); // t3 is choice-only
    expect(pool(FIXTURE, 'SUB.03')).toEqual(['SUB.03.t2', 'SUB.03.t3', 'SUB.03.t4', 'SUB.03.t5']);
    expect(pool(FIXTURE, 'CPS.02')).toEqual(['CPS.02.t3', 'CPS.02.t4']);
  });
  it('rejects a gateway pool that still spans one representation', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CPS.yaml', (doc) => (template(doc, 'CPS.02.t3').tier = 'concrete')),
      ),
      'V21',
      /gateway skill CPS.02: test-out items must span ≥ 2 representations/,
    );
  });
  it('keeps an authored list but rejects concrete templates in it', () => {
    const files: Files = { ...FIXTURE };
    editYaml(
      files,
      'lessons/CNT.yaml',
      (doc) => (doc.lessons[0].testOut.templateIds = ['CNT.03.t4', 'CNT.03.t2']),
    );
    expect(pool(files, 'CNT.03')).toEqual(['CNT.03.t4', 'CNT.03.t2']);
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'lessons/CNT.yaml',
          (doc) => (doc.lessons[0].testOut.templateIds = ['CNT.03.t1', 'CNT.03.t4']),
        ),
      ),
      'V21',
      /CNT.03.t1 is concrete/,
    );
  });
});

describe('V21: test-out choice rule and gateway item count', () => {
  const authoredList = (ids: string[]) => (f: Files) =>
    editYaml(f, 'lessons/CNT.yaml', (doc) => (doc.lessons[0].testOut.templateIds = ids));
  it('rejects a choice-answer template beside a constructed-response one in an authored list', () => {
    const diags = variant(authoredList(['CNT.03.t3', 'CNT.03.t4']));
    expectFinding(diags, 'V21', /CNT.03.t3 answers with a choice/);
    // Without the choice template the list spans only one representation.
    expectFinding(
      diags,
      'V21',
      /gateway skill CNT.03: test-out items must span ≥ 2 representations/,
    );
  });
  it('rejects an all-choice authored list when the skill has an eligible constructed-response template', () => {
    const diags = variant((f) => {
      editYaml(
        f,
        'templates/CNT.yaml',
        (doc) => (template(doc, 'CNT.03.t2').format = 'numeral-pick'),
      );
      authoredList(['CNT.03.t2', 'CNT.03.t3'])(f);
    });
    expectFinding(
      diags,
      'V21',
      /CNT.03.t2 answers with a choice, but CNT.03 has a constructed-response template/,
    );
    expectFinding(diags, 'V21', /CNT.03.t3 answers with a choice/);
  });
  it('rejects an authored list that mixes a choice template with a constructed one outside the eligible tiers', () => {
    const diags = variant((f) => {
      editYaml(f, 'templates/CNT.yaml', (doc) => {
        Object.assign(template(doc, 'CNT.03.t2'), { format: 'number-pad' }); // pictorial, constructed, ten-frame
        template(doc, 'CNT.03.t3').tier = 'abstract'; // numeral-pick dots: choice
        template(doc, 'CNT.03.t4').format = 'numeral-pick'; // symbols: choice
      });
      authoredList(['CNT.03.t2', 'CNT.03.t3'])(f);
    });
    expectFinding(
      diags,
      'V21',
      /CNT.03.t3 answers with a choice, but CNT.03 has a constructed-response template/,
    );
  });
  it('treats a mixed-answer template without distractors as unknown, not as a constructed response', () => {
    const files: Files = { ...FIXTURE };
    // CNT.03.t4 becomes multiple choice, so no eligible template is a known constructed response.
    editYaml(
      files,
      'templates/CNT.yaml',
      (doc) => (template(doc, 'CNT.03.t4').format = 'numeral-pick'),
    );
    authoredList(['CNT.03.t2', 'CNT.03.t3'])(files); // tap-count (mixed) + numeral-pick (choice)
    const result = compileContent(files);
    expect(result.diagnostics.filter((d) => d.check === 'V21')).toEqual([]);
    expect(
      result.content?.skills.find((s) => s.id === 'CNT.03')?.lesson.testOut.templateIds,
    ).toEqual(['CNT.03.t2', 'CNT.03.t3']);
  });
  it('rejects a one-item gateway test-out', () => {
    expectFinding(
      variant((f) =>
        editYaml(
          f,
          'lessons/CNT.yaml',
          (doc) => (doc.lessons[0].testOut = { items: 1, minCorrect: 1 }),
        ),
      ),
      'V21',
      /gateway skill CNT.03: testOut.items is 1/,
    );
  });
});

describe('V02/V03: excused ids must be canonical', () => {
  it('does not let ALG.008 excuse the missing ALG.08', () => {
    const diags = variant((f) =>
      editYaml(f, 'graph.yaml', (doc) => (doc.plannedIds = ['ALG.008'])),
    );
    expectFinding(diags, 'V02', /'ALG.008' is not a canonical SkillId or TemplateId/);
    expectFinding(diags, 'V03', /missing ALG.08/);
  });
  it('rejects excused template ids that could never be authored', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'graph.yaml', (doc) => doc.plannedIds.push('ADD.02.t9007199254740992')),
      ),
      'V02',
      /'ADD.02.t9007199254740992' is not a canonical/,
    );
    expectFinding(
      variant((f) => (f['retired.yaml'] = 'templates: [ADD.00.t1]\n')),
      'V02',
      /'ADD.00.t1' is not a canonical TemplateId/,
    );
  });
  it('does not let a zero-padded retired template excuse a gap', () => {
    const diags = variant((f) => {
      f['retired.yaml'] = 'templates: [CNT.07.t03]\n';
      editYaml(f, 'templates/CNT.yaml', (doc) => {
        doc.templates = (doc.templates as Yaml[]).filter((t) => t.id !== 'CNT.07.t3');
      });
    });
    expectFinding(diags, 'V02', /'CNT.07.t03' is not a canonical TemplateId/);
    expectFinding(diags, 'V03', /missing CNT.07.t3/);
  });
});

describe('V16: string vars in authored lesson steps need typed slots', () => {
  const withStepVar = (text: string) => (f: Files) => {
    editYaml(
      f,
      'lessons/CNT.yaml',
      (doc) => (doc.lessons[0].worked[0].steps[1].vars = { n: 5, item: 'shell' }),
    );
    f['narration/CNT.yaml'] = (f['narration/CNT.yaml'] as string).replace(
      'I count each one once. I stop at {n}.',
      text,
    );
  };
  it('rejects an untyped slot that takes a string var', () => {
    expectFinding(
      variant(withStepVar('I count each {item} once. I stop at {n}.')),
      'V16',
      /string var 'item' of a CNT.03 lesson step/,
    );
  });
  it('accepts the same var with a type', () => {
    const diags = variant(withStepVar('I count each {item|noun:n} once. I stop at {n}.'));
    expect(diags.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('V20: grade-4 codes a skill names', () => {
  it('rejects a named grade-4 sub-part nobody addresses, though coverageGrades leaves grade 4 out', () => {
    const named = (f: Files) =>
      editYaml(
        f,
        'skills/ADD.yaml',
        (doc) => (skill(doc, 'ADD.03').standards.supports = ['4.NF.B.3a']),
      );
    expectFinding(
      variant(named),
      'V20',
      /uncovered standard 4.NF.B.3a \(named by a skill, grade 4\)/,
    );
    const addressedByParent = variant((f) => {
      named(f);
      editYaml(f, 'skills/ADD.yaml', (doc) => skill(doc, 'ADD.03').standards.ccss.push('4.NF.B.3'));
    });
    expect(addressedByParent.filter((d) => d.check === 'V20')).toEqual([]);
  });
});

describe('V02/V03: template number suffixes', () => {
  it('rejects leading zeros', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'templates/CNT.yaml', (doc) => (template(doc, 'CNT.07.t4').id = 'CNT.07.t04')),
      ),
      'V02',
      /no leading zeros/,
    );
  });
  it('reports a huge out-of-sequence suffix promptly with a bounded list', () => {
    const started = Date.now();
    const d = expectFinding(
      variant((f) =>
        editYaml(
          f,
          'templates/CNT.yaml',
          (doc) => (template(doc, 'CNT.07.t4').id = 'CNT.07.t999999999'),
        ),
      ),
      'V03',
      /missing CNT.07.t4, CNT.07.t5, .* … and 999999985 more/,
    );
    expect(d.message.length).toBeLessThan(400);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('V23: prerequisite grade labels', () => {
  it('warns when a prerequisite has a higher grade label', () => {
    expectFinding(
      variant((f) => editYaml(f, 'skills/CNT.yaml', (doc) => (skill(doc, 'CNT.07').grade = 2))),
      'V23',
      /prerequisite CNT.07 \(grade 2\) has a higher grade label than ADD.03 \(grade 1\)/,
      'warn',
    );
  });
});

describe('V26: contexts', () => {
  it('rejects an unknown situation and a noun without clips', () => {
    expectFinding(
      variant((f) =>
        editYaml(f, 'contexts.yaml', (doc) => doc.contexts[0].situations.push('juggling')),
      ),
      'V26',
      /'juggling' is not a SituationType/,
    );
    expectFinding(
      variant((f) => editYaml(f, 'contexts.yaml', (doc) => doc.contexts[0].nouns.push('anchor'))),
      'V26',
      /noun anchor has no clip noun.anchor.one/,
    );
  });
  it('accepts full SituationTypes as well as families', () => {
    expect(
      unexpected(
        variant((f) =>
          editYaml(f, 'contexts.yaml', (doc) =>
            doc.contexts[0].situations.push('compare/bigger-fewer'),
          ),
        ),
      ),
    ).toEqual([]);
  });
});

describe('V24 and contentVersion (03 §9.1)', () => {
  it('builds byte-identical output twice and matches a fresh dist/', () => {
    const a = compileContent(FIXTURE);
    const b = compileContent({ ...FIXTURE });
    expect(a.outputs).toEqual(b.outputs);
    const { diagnostics } = validateContent(FIXTURE, a.outputs);
    expect(unexpected(diagnostics)).toEqual([]);
  });
  it('reports a stale or extra dist/ file', () => {
    const a = compileContent(FIXTURE).outputs as Record<string, string>;
    const stale = {
      ...a,
      'skills.json': a['skills.json']?.replace('Say the', 'Sing the') as string,
      'old.json': '{}',
    };
    const { diagnostics } = validateContent(FIXTURE, stale);
    expectFinding(diagnostics, 'V24', /does not match the sources byte for byte/);
    expectFinding(diagnostics, 'V24', /unexpected file in dist\//);
  });
  it('does not depend on file order, and writes canonical JSON with a trailing newline', () => {
    const reversed = Object.fromEntries(Object.entries(FIXTURE).reverse());
    const a = compileContent(FIXTURE);
    expect(compileContent(reversed).outputs).toEqual(a.outputs);
    for (const text of Object.values(a.outputs ?? {})) {
      expect(text.endsWith('}\n') || text.endsWith(']\n')).toBe(true);
      expect(text.slice(0, -1)).not.toMatch(/\n/);
    }
  });
  it('contentVersion is 16 hex chars; it changes with content but not with game data', () => {
    const base = compileContent(FIXTURE).contentVersion;
    expect(base).toMatch(/^[0-9a-f]{16}$/);
    const files: Files = { ...FIXTURE };
    editYaml(files, 'skills/CNT.yaml', (doc) => (skill(doc, 'CNT.01').name = 'Count to 20'));
    expect(compileContent(files).contentVersion).not.toBe(base);
    const game: Files = { ...FIXTURE };
    editYaml(game, 'game/residents.yaml', (doc) => (doc.residents[0].palette = 'gold'));
    expect(compileContent(game).contentVersion).toBe(base);
  });
  it('the manifest lists every output with its sha256 and the counts', () => {
    const r = compileContent(FIXTURE);
    const manifest = JSON.parse(r.outputs?.['manifest.json'] as string);
    expect(manifest.contentVersion).toBe(r.contentVersion);
    expect(manifest.schemaVersion).toBe(1);
    // Pinned to the current content; K01 (#11) updates these numbers as each strand group lands.
    expect(manifest.counts).toEqual({
      // CMP (K01) added 9 skills, 31 templates and MC.perceptual-size; CPS and SUB.04/SUB.07 (K01)
      // added 7 skills and 27 templates; V27 (constructed practice) added 7 CMP templates and 18
      // for CNT, SUB, GEO and MEA skills; ADD facts and strategies (K01) added 14 skills, 58
      // templates, MC.forgot-the-ten and MC.wrong-operation; place value and two-digit addition and
      // subtraction (K01) added 15 skills, 56 templates, MC.place-swap, MC.face-value and
      // MC.write-as-spoken; equality and story problems (K01) added 11 skills (ALG.05 and CMP.08
      // among them), 41 templates and 5 misconceptions; fractions, sharing, time, data, patterns
      // and puzzles (K01) added 18 skills, 62 templates and six misconceptions; place value to
      // 1000 (K02 slice 1a) added 10 skills, 46 templates, MC.zero-placeholder and
      // MC.compare-first-digit; counting, number lines, rounding and fact fluency (K02 slice 1b)
      // added 11 skills, 49 templates, MC.round-down-always and MC.round-wrong-place; addition and
      // subtraction within 100 (K02 slice 2a) added 10 skills, 29 templates,
      // MC.forgot-to-regroup-add, MC.smaller-from-larger and MC.borrow-no-decrement; within 1000
      // (K02 slice 2b) added 8 skills, 22 templates and MC.borrow-across-zero; equal groups and
      // arrays (K02 slice 3a) added 9 skills, 33 templates, MC.add-instead-of-multiply and
      // MC.skip-count-slip; facts and strategies (K02 slice 3b) added 7 skills, 25 templates,
      // MC.times-zero-keeps, MC.double-once, MC.tens-dropped and MC.partial-product-dropped;
      // rulers, graphs, faces and corners (K02 slice 4b) added 7 skills, 23 templates,
      // MC.ruler-count-ticks and MC.ruler-read-end; grade 2 story problems (K02 slice 4d) added 4
      // skills, 13 templates, MC.first-step-only and MC.dollar-as-one; grade 2 patterns and puzzles
      // (K02 slice 4e) added 7 skills, 19 templates, MC.grow-as-repeat, MC.cage-repeat-digit,
      // MC.digit-order-reversed and MC.way-counted-twice; division facts (K02 slice 3c) added 7
      // skills, 27 templates, MC.multiply-instead-of-divide, MC.told-number-back and
      // MC.neighbour-fact. Fractions on the number line (K02 slice 5b) added 4 skills, 14
      // templates, MC.fraction-line-ticks, MC.fraction-line-whole, MC.fraction-line-at-whole,
      // MC.fraction-over-one and MC.fraction-whole-count.
      skills: 219,
      templates: 798,
      misconceptions: 69,
      narrationKeys: Object.keys(r.content?.narration ?? {}).length,
    });
    expect(Object.keys(manifest.files).sort()).toEqual([
      'contexts.json',
      'game.json',
      'graph.json',
      'misconceptions.json',
      'narration.json',
      'skills.json',
      'standards.json',
      'templates.json',
    ]);
  });
});

describe('graph.json (03 §9.1)', () => {
  it('orders nodes topologically with ties by id, and computes depth and descendants2', () => {
    const g = compileContent(FIXTURE).content?.graph;
    expect(g?.nodes[0]).toBe('ALG.01');
    const pos = new Map(g?.nodes.map((id, i) => [id, i]));
    for (const [from, to] of g?.edges ?? [])
      expect(pos.get(from) as number).toBeLessThan(pos.get(to) as number);
    expect(g?.roots).toEqual([
      'ALG.01',
      'CNT.01',
      'GEO.01',
      'GEO.05',
      'MEA.15',
      'SUB.01',
      'TIM.08',
    ]);
    expect(g?.gateways).toEqual([
      'ADD.08',
      'ADD.10',
      'ADD.11',
      'CNT.03',
      'CNT.14',
      'CPS.02',
      'CPS.04',
      'FRA.03',
      'FRA.04',
      'GEO.04',
      'MDA.03',
      'MDA.12',
      'MUL.04',
      'MUL.05',
      'MUL.07',
      'PV.01',
      'PV.04',
      'PV.09',
      'PV.12',
      'PV.15',
      'SUB.03',
    ]);
    expect(g?.depth['CNT.01']).toBe(0);
    expect(g?.depth['ADD.03']).toBe(6); // CNT.01 → 02 → 03 → 04 → 06 → 07 → ADD.03
    // CPS.04, CPS.09, CPS.11; then ADD.08, ADD.19, CMP.07, CPS.07, CPS.10, PV.09 and SUB.04
    expect(g?.descendants2['CPS.03']).toBe(10);
    // CNT.07, CNT.15, CPS.04, DAT.09, MEA.02, MUL.12, PV.09; then ADD.03, ADD.08, CMP.03, CMP.07,
    // CNT.08, CNT.09, CNT.14, CNT.19, CPS.07, FRA.07, MEA.22, PV.10, PV.11 and SUB.04; K02 slice
    // 3a adds GEO.03 and then GEO.04 and MUL.05; slice 4b adds MEA.03 (under MEA.02), DAT.04
    // (under DAT.09), GEO.12, GEO.15 and GEO.16 (under GEO.03)
    expect(g?.descendants2['CNT.06']).toBe(29);
    expect(g?.encompasses).toEqual([
      ['ADD.06', 'ADD.02', 1],
      ['ADD.08', 'CPS.03', 1],
      ['ADD.08', 'CPS.11', 1],
      ['ADD.14', 'ADD.06', 0.8],
      ['ADD.14', 'ADD.07', 0.3],
      ['ADD.14', 'ADD.08', 0.4],
      ['ADD.14', 'ADD.16', 0.3],
      ['ADD.22', 'ADD.06', 0.6],
      ['ADD.22', 'ADD.18', 0.4],
      ['ADD.22', 'ADD.19', 0.4],
      ['CNT.06', 'CNT.04', 1],
      ['CNT.06', 'CNT.05', 0.5],
      ['CNT.10', 'CNT.09', 1],
      ['DAT.05', 'DAT.02', 0.6],
      ['FRA.10', 'FRA.04', 1],
      ['FRA.10', 'FRA.09', 0.5],
      ['FRA.13', 'FRA.08', 0.5],
      ['MDA.01', 'ADD.06', 0.5],
      ['MDA.01', 'PV.03', 0.5],
      ['MDA.03', 'ADD.14', 0.8],
      ['MDA.03', 'MDA.08', 0.5],
      ['MDA.03', 'MDA.09', 1],
      ['MDA.03', 'PV.12', 0.5],
      ['MDA.04', 'ADD.13', 0.5],
      ['MDA.04', 'MDA.03', 1],
      ['MDA.05', 'MDA.03', 1],
      ['MDA.05', 'MDA.24', 1],
      ['MDA.06', 'MDA.03', 0.5],
      ['MDA.06', 'MDA.12', 0.5],
      ['MDA.07', 'MDA.05', 1],
      ['MDA.12', 'ADD.22', 0.8],
      ['MDA.12', 'MDA.10', 0.5],
      ['MDA.12', 'MDA.11', 1],
      ['MDA.12', 'PV.12', 0.5],
      ['MDA.17', 'MDA.12', 1],
      ['MDA.17', 'MDA.25', 1],
      ['MDA.21', 'MDA.17', 1],
      ['MDA.21', 'MDA.18', 0.5],
      ['MON.02', 'MON.04', 1],
      ['MUL.09', 'MUL.07', 0.3],
      ['MUL.09', 'MUL.13', 0.6],
      ['MUL.09', 'MUL.14', 0.5],
      ['MUL.09', 'MUL.15', 0.5],
      ['MUL.17', 'MUL.08', 0.5],
      ['MUL.17', 'MUL.09', 0.5],
      ['PV.06', 'PV.02', 0.6],
      ['PV.06', 'PV.05', 0.5],
      ['PV.07', 'PV.03', 1],
      ['PV.18', 'PV.08', 0.6],
      ['TIM.02', 'TIM.04', 0.6],
      ['TIM.02', 'TIM.09', 0.5],
    ]);
    expect(g?.strands.SUB).toEqual([
      'SUB.01',
      'SUB.02',
      'SUB.03',
      'SUB.04',
      'SUB.05',
      'SUB.06',
      'SUB.07',
      'SUB.08',
      'SUB.09',
    ]);
  });
});

// PR #121 review, round 1: three lines said something false for items their templates generate.
describe('place value to 1000: lines that hold for every item (K02)', () => {
  const text = (key: string) => compileContent(FIXTURE).content?.narration[key]?.text ?? '';

  it('ten more across a hundred changes two digits: no line says only one changes', () => {
    // 199 + 10 = 209 (PV.07.t2, PV.07.t3).
    for (const key of ['h.pv.one-place-changes', 'sk.PV.07.intro', 'h.pv.tens-or-hundreds']) {
      expect(text(key), key).not.toBe('');
      expect(text(key), key).not.toMatch(/only one (place|digit)/i);
    }
    // PV.07's templates draw "less" as often as "more" (PR #121 review, round 2): its hints
    // name no direction, so a hint never sends a "10 less" item forward.
    for (const key of ['h.pv.one-place-changes', 'h.pv.tens-or-hundreds', 'h.pv.rod-or-flat']) {
      expect(text(key), key).not.toMatch(/count on|count back|\\badd\\b|take away/i);
    }
    expect(text('h.pv.one-jump')).not.toMatch(/count on|forward|\\badd\\b/i);
  });

  it('the digit-count hint compares digit counts, and holds for 100 itself', () => {
    // 99 against 100 (PV.06.t5): 100 is not more than one hundred.
    expect(text('h.compare.more-digits')).toMatch(/three digits is greater than a number with two/);
    expect(text('h.compare.more-digits')).not.toMatch(/more than one hundred/);
  });

  it('the written-as-spoken feedback fits a three-digit number', () => {
    // 305 written as 3005 (PV.05, PV.14) is not a number of "two places".
    expect(text('fb.mc.write-as-spoken')).not.toMatch(/two places|tens and ones/);
    expect(text('fb.mc.write-as-spoken')).toMatch(/Each place gets just one number/);
  });
});

describe('counting, number lines and rounding: lines that hold for every item (K02 slice 1b)', () => {
  const text = (key: string) => compileContent(FIXTURE).content?.narration[key]?.text ?? '';

  it('the number-line hint counts on from the number before the mark, never the nearest', () => {
    // CMP.11.t1 at 38: the nearest label is 40, and counting on from it moves away.
    expect(text('h.numberline.from-label')).toMatch(/just before the mark/);
    expect(text('h.numberline.from-label')).not.toMatch(/closest|nearest/);
  });

  it('the rounding pad hints hold at the middle (45, 350 round up)', () => {
    const c = compileContent(FIXTURE).content;
    for (const id of ['PV.08.t1', 'PV.18.t1']) {
      const hints = c?.templates.find((t) => t.id === id)?.narration.hints ?? [];
      expect(hints, id).not.toContain('h.closer.middle');
      expect(hints, id).toContain('h.round.middle-up');
    }
    expect(text('h.round.middle-up')).toMatch(/middle or past it, round up/);
  });
});

describe('line plots, units and estimates: lines that hold for every item (K02 slice 4c-1)', () => {
  const c = () => compileContent(FIXTURE).content;

  it('DAT.03 stacks hold at most 5 Xs (an X stays at least 22 px at 960 × 600)', () => {
    const lineplots = c()?.templates.filter((t) => t.generator === 'data.lineplot') ?? [];
    expect(lineplots.map((t) => t.id)).toEqual(['DAT.03.t1', 'DAT.03.t2', 'DAT.03.t3']);
    for (const t of lineplots) {
      for (const [k, spec] of Object.entries(t.params)) {
        if (!/^x\d$/.test(k)) continue;
        const top =
          spec.kind === 'int' ? spec.max : spec.kind === 'const' ? Number(spec.value) : Infinity;
        expect(top, `${t.id} ${k}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('MEA.08 sort hints name no thing a card can show (R1)', () => {
    const things = ['pencil', 'shoe', 'spoon', 'cup', 'button', 'door', 'table', 'fishing'];
    const content = c();
    for (const id of ['MEA.08.t1', 'MEA.08.t2']) {
      const hints = content?.templates.find((t) => t.id === id)?.narration.hints ?? [];
      expect(hints.length, id).toBe(3);
      for (const h of hints) {
        const text = (content?.narration[h]?.text ?? '').toLowerCase();
        for (const thing of things) expect(text, `${id} ${h}`).not.toContain(thing);
        // One cutoff for every card, no gap between two (R2): every inch card (pencil, shoe,
        // spoon, cup, button) fits in a box a child carries; no foot card (door, table, fishing
        // rod) does.
        expect(text, `${id} ${h}`).toContain('a box you can carry');
      }
    }
  });
});
