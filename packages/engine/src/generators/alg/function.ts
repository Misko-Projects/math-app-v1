// alg.function (03 §5.6): input–output machines, find the rule (ALG.09, K02 slice 4c-2).
// A machine adds `n` (`op: add`) or takes `n` away (`op: sub`) from every number put in. Grade 2:
// no ×, `n` 1 to 9, every number 0 to `max` (at most 99).
// - pattern-extend `table`: `rows` pairs (2 to 4) as In / Out columns, the outputs of the `blanks`
//   last-but-one and last columns missing (1: the last; 2: the second and the last). The child
//   types the missing outputs.
// - number-pad: the prompt tells `rows` pairs (In 3, out 6. …) and the child types `n` (the
//   template's prompt says "adds" or "takes away"; one template a direction).
// The inputs come from `arrange` (a seed, so a lesson or a misconception example can name an
// item): distinct, never in order up or down, each output 0 to `max`.
// - The column trap: an output is never the last output plus the last output step (continuing
//   the Out row as a pattern), because no three inputs in a row are evenly spaced.
// - With `lure` (add only), the first pair also fits doubling (in = n, out = 2n): a rule read off
//   the first pair alone. No other input is `n`, so doubling an asked input is always wrong.
// - An asked output is never a number already in the table (an input, or a shown output).

import type { LessonStep, ResponseValue } from '@number-island/shared';
import { createRng } from '../../rng';
import {
  asNum,
  asStr,
  correctFromAnswer,
  finish,
  type PartialOutput,
  pickVars,
  sampleAll,
} from '../common';
import type { BuildContext, GeneratorDef, GeneratorOutput } from '../types';

const OPS = ['add', 'sub'] as const;
/** The biggest number a machine shows (two digits). */
export const FUNCTION_MAX = 99;
/** Tries to arrange the inputs before the item is refused. */
const TRIES = 60;

export interface FunctionTable {
  op: 'add' | 'sub';
  n: number;
  inputs: number[];
  outputs: number[];
  /** The rows whose output the child finds. */
  asked: number[];
}

/** The rows asked: none on number-pad, the last for one blank, the second and last for two. */
export const askedRows = (rows: number, blanks: number): number[] =>
  blanks <= 0 ? [] : blanks === 1 ? [rows - 1] : [1, rows - 1];

export const applyRule = (op: string, n: number, x: number): number =>
  op === 'sub' ? x - n : x + n;

/** The Out-row continuation a child reading the table as a pattern gives for row j (j ≥ 2). */
export const columnGuess = (outputs: readonly number[], j: number): number | null =>
  j < 2 ? null : 2 * (outputs[j - 1] as number) - (outputs[j - 2] as number);

/** The table an `arrange` seed gives, or null when no arrangement meets every rule. */
export function functionTable(p: Record<string, unknown>): FunctionTable | null {
  const op = (p.op === 'sub' ? 'sub' : 'add') as 'add' | 'sub';
  const n = asNum(p.n as number);
  const max = Math.min(FUNCTION_MAX, asNum(p.max as number, 20));
  const rows = asNum(p.rows as number, 4);
  const blanks = asNum(p.blanks as number, 1);
  const lure = op === 'add' && asNum(p.lure as number) === 1;
  const asked = askedRows(rows, blanks);
  // Every output 1 to max: an add machine takes 1 to max − n, a take-away machine n + 1 to max.
  const lo = op === 'add' ? 1 : n + 1;
  const hi = op === 'add' ? max - n : max;
  if (n < 1 || n > 9 || rows < 2 || rows > 4 || hi - lo + 1 < rows + 2) return null;
  if (lure && (n < lo || n > hi)) return null;
  const rng = createRng(asNum(p.arrange as number) * 7919 + n * 131 + max * 17 + rows);
  for (let t = 0; t < TRIES; t += 1) {
    const inputs: number[] = [];
    if (lure) inputs.push(n);
    while (inputs.length < rows) {
      const x = rng.int(lo, hi);
      // Only a lure's first input is n (so doubling another input is never right).
      if (!inputs.includes(x) && x !== n) inputs.push(x);
    }
    const outputs = inputs.map((x) => applyRule(op, n, x));
    if (ok({ op, n, inputs, outputs, asked })) return { op, n, inputs, outputs, asked };
  }
  return null;
}

function ok(t: FunctionTable): boolean {
  const { inputs, outputs, asked } = t;
  const up = inputs.every((x, i) => i === 0 || x > (inputs[i - 1] as number));
  const down = inputs.every((x, i) => i === 0 || x < (inputs[i - 1] as number));
  if (inputs.length > 2 && (up || down)) return false;
  // No three inputs in a row evenly spaced: the column trap never lands on the answer.
  for (let j = 2; j < inputs.length; j += 1) {
    const a = inputs[j - 2] as number;
    const b = inputs[j - 1] as number;
    const c = inputs[j] as number;
    if (c - b === b - a) return false;
  }
  const shown = new Set<number>([...inputs, ...outputs.filter((_, i) => !asked.includes(i))]);
  return asked.every((j) => !shown.has(outputs[j] as number));
}

const say = (
  key: string,
  vars: Record<string, number>,
  action?: LessonStep['action'],
): LessonStep =>
  action ? { actor: 'demo', say: key, vars, action } : { actor: 'demo', say: key, vars };

export const algFunction: GeneratorDef = {
  id: 'alg.function',
  formats: ['pattern-extend', 'number-pad'],
  params: {
    op: {
      type: 'string',
      values: [...OPS],
      default: { kind: 'const', value: 'add' },
      doc: 'add (the machine adds n) or sub (it takes n away)',
    },
    n: {
      type: 'int',
      default: { kind: 'int', min: 1, max: 5 },
      doc: 'the number added or taken away (1–9)',
    },
    max: {
      type: 'int',
      default: { kind: 'const', value: 20 },
      doc: 'the biggest number in the table (at most 99)',
    },
    rows: {
      type: 'int',
      default: { kind: 'const', value: 4 },
      doc: 'pairs: In / Out columns (2–4)',
    },
    blanks: {
      type: 'int',
      // Each format draws the value it takes (a table 1, number-pad 0).
      default: { kind: 'choice', values: [0, 1] },
      doc: 'pattern-extend: outputs to find (1: the last; 2: the second and the last); number-pad: 0 (it asks the rule)',
    },
    lure: {
      type: 'int',
      default: { kind: 'choice', values: [1, 0, 0] },
      doc: 'add: 1 when the first pair also fits doubling (in = n), about one item in three',
    },
    arrange: {
      type: 'int',
      default: { kind: 'int', min: 0, max: 9999 },
      doc: 'the seed that arranges the inputs',
    },
  },
  derived: ['in1', 'in2', 'in3', 'in4', 'out1', 'out2', 'out3', 'out4'],
  features: {
    'op.sub': { weight: 0.4, doc: 'the machine takes away' },
    'n.over5': { weight: 0.2, doc: 'n is 6 or more' },
    'answer.over10': { weight: 0.2, doc: 'an asked output (or a number-pad pair) is over 10' },
    'answer.over20': { weight: 0.3, doc: 'an asked output (or a number-pad pair) is over 20' },
    'blanks.two': { weight: 0.3, doc: 'two outputs to find' },
  },
  narration: [
    'gen.alg.function.rule-add',
    'gen.alg.function.rule-sub',
    'gen.alg.function.check-add',
    'gen.alg.function.check-sub',
    'gen.alg.function.out-add',
    'gen.alg.function.out-sub',
    'gen.alg.function.name-add',
    'gen.alg.function.name-sub',
  ],
  sample: (spec, rng) => sampleAll(spec, rng),
  derive(p) {
    const t = functionTable(p);
    const out: Record<string, number> = {};
    for (let i = 0; i < 4; i += 1) {
      out[`in${i + 1}`] = t?.inputs[i] ?? 0;
      out[`out${i + 1}`] = t?.outputs[i] ?? 0;
    }
    return out;
  },
  accepts(p, t) {
    const blanks = asNum(p.blanks, 1);
    if (asNum(p.max, 20) > FUNCTION_MAX) return false;
    // A table asks 1 or 2 outputs; number-pad asks the rule (its prompt names the pairs), no output.
    if (t.format === 'pattern-extend' && (blanks < 1 || blanks > 2)) return false;
    if (t.format === 'number-pad' && blanks !== 0) return false;
    // The worked solution finds the rule from one shown pair and checks it on a second.
    if (asNum(p.rows, 4) - blanks < 2) return false;
    if (asStr(p.op) === 'sub' && asNum(p.lure) === 1) return false;
    return functionTable(p) !== null;
  },
  build(ctx: BuildContext): GeneratorOutput {
    const { params, template: t } = ctx;
    const table = functionTable(params) as FunctionTable;
    const { op, n, inputs, outputs, asked } = table;
    const pairVars: Record<string, number> = { n };
    inputs.forEach((x, i) => {
      pairVars[`i${i + 1}`] = x;
      pairVars[`o${i + 1}`] = outputs[i] as number;
    });
    const vars = pickVars(t, pairVars);
    const answers = asked.map((j) => outputs[j] as number);
    const biggest =
      t.format === 'number-pad' ? Math.max(...inputs, ...outputs) : Math.max(...answers);
    const math: Record<string, number> = {
      'op.sub': op === 'sub' ? 1 : 0,
      'n.over5': n > 5 ? 1 : 0,
      'answer.over10': biggest > 10 ? 1 : 0,
      'answer.over20': biggest > 20 ? 1 : 0,
      'blanks.two': asked.length === 2 ? 1 : 0,
    };
    let p: PartialOutput;
    if (t.format === 'number-pad') {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'number-pad',
          stimulus: { kind: 'none' },
          blanks: [{ id: 'x', maxDigits: 1 }],
        },
        answer: { kind: 'number', value: n },
      };
    } else {
      p = {
        params,
        vars,
        math,
        widget: {
          format: 'pattern-extend',
          sequence: [],
          palette: [],
          mode: 'table',
          kind: 'function',
          table: { inputs, outputs: outputs.map((o, i) => (asked.includes(i) ? null : o)) },
        },
        answer: { kind: 'numbers', values: answers, ordered: true },
      };
    }
    return finish(algFunction, ctx, p);
  },
  exampleCorrect(out): ResponseValue {
    return correctFromAnswer(out.answer);
  },
  solution(out): LessonStep[] {
    const table = functionTable(out.params);
    if (!table) return [];
    const { op, n, inputs, outputs, asked } = table;
    const shown = inputs.map((_, i) => i).filter((i) => !asked.includes(i));
    const [first, second] = shown as [number, number];
    const pair = (i: number) => ({ a: inputs[i] as number, b: outputs[i] as number, n });
    // Find the rule from one pair, check it on a second, then use it.
    const steps: LessonStep[] = [
      say(`gen.alg.function.rule-${op}`, pair(first), { op: 'highlight', args: { index: first } }),
      say(`gen.alg.function.check-${op}`, pair(second), {
        op: 'highlight',
        args: { index: second },
      }),
    ];
    if (out.widget.format === 'number-pad') {
      steps.push(
        say(`gen.alg.function.name-${op}`, { n }, { op: 'type', args: { blank: 'x', value: n } }),
      );
      return steps;
    }
    for (const j of asked) {
      steps.push(
        say(`gen.alg.function.out-${op}`, pair(j), {
          op: 'place-token',
          args: { index: j, token: { n: outputs[j] as number } },
        }),
      );
    }
    return steps;
  },
};
