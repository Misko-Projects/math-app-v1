// The equation model of equality.eq (eq.ts), shared with the equality misconception rules
// (MC.equals-means-answer, MC.equals-add-all, MC.start-unknown-reversed). Pure: no generator
// helpers, so the rules can import it without an import cycle.

import type { ExpressionToken, ParamValues } from '@number-island/shared';

export const FORMS = [
  'a+b=_',
  '_=a+b',
  'a+_=c',
  '_+b=c',
  'a+b=c+_',
  'a+b=_+c',
  'a=c+_',
  'between',
] as const;
export type Form = (typeof FORMS)[number];

/** Forms with an operation on both sides of the equal sign. */
export const TWO_SIDED: ReadonlySet<string> = new Set(['a+b=c+_', 'a+b=_+c']);
/** Forms a number bond can show (one operation, one blank). */
export const ONE_SIDED: ReadonlySet<string> = new Set(['a+b=_', '_=a+b', 'a+_=c', '_+b=c']);
/** Forms a balance can make equal: the blank is what the right pan still needs. */
export const MAKE_EQUAL: ReadonlySet<string> = new Set(['a+b=c+_', 'a=c+_']);

export type Term = { n: number } | { op: '+' | '-' } | { blank: true } | { rel: '<' | '>' | '=' };

/** One equation: its sides, the number the blank stands for, and every number it shows. */
export interface Equation {
  form: Form;
  op: '+' | '-';
  left: Term[];
  right: Term[];
  /** The value each side has when the blank holds `missing`. */
  value: number;
  missing: number;
  /** The numbers written in the equation (not the blank). */
  shown: number[];
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);

export const asForm = (v: unknown): Form =>
  (FORMS as readonly unknown[]).includes(v) ? (v as Form) : 'a+b=_';
export const asOp = (v: unknown): '+' | '-' => (v === '-' ? '-' : '+');

/** The equation an item's params describe (see eq.ts for the forms). */
export function equation(p: ParamValues): Equation {
  const form = asForm(p.form);
  const op = asOp(p.op);
  const a = num(p.a);
  const b = num(p.b);
  const c = num(p.c);
  const r = op === '-' ? a - b : a + b;
  const n = (v: number): Term => ({ n: v });
  const o: Term = { op };
  const plus: Term = { op: '+' };
  const blank: Term = { blank: true };
  const eq = (
    left: Term[],
    right: Term[],
    value: number,
    missing: number,
    shown: number[],
    eqOp: '+' | '-' = op,
  ): Equation => ({ form, op: eqOp, left, right, value, missing, shown });
  switch (form) {
    case 'a+b=_':
      return eq([n(a), o, n(b)], [blank], r, r, [a, b]);
    case '_=a+b':
      return eq([blank], [n(a), o, n(b)], r, r, [a, b]);
    case 'a+_=c':
      return eq([n(a), o, blank], [n(r)], r, b, [a, r]);
    case '_+b=c':
      return eq([blank, o, n(b)], [n(r)], r, a, [b, r]);
    case 'a+b=c+_':
      return eq([n(a), o, n(b)], [n(c), plus, blank], r, r - c, [a, b, c]);
    case 'a+b=_+c':
      return eq([n(a), o, n(b)], [blank, plus, n(c)], r, r - c, [a, b, c]);
    case 'a=c+_':
      return eq([n(a)], [n(c), plus, blank], a, a - c, [a, c], '+');
    case 'between': {
      const rel: Term = { rel: p.rel === '>' ? '>' : '<' };
      const less = p.rel !== '>';
      const lo = a;
      const hi = a + 2;
      return eq(
        less ? [n(lo), rel, blank] : [n(hi), rel, blank],
        less ? [n(hi)] : [n(lo)],
        a + 1,
        a + 1,
        [lo, hi],
        '+',
      );
    }
  }
}

/** The value shown in the blank of a judged equation: right, or off by `off` when false. */
export function judgedValue(p: ParamValues, eq: Equation = equation(p)): number {
  return p.truth === false ? eq.missing + num(p.off) : eq.missing;
}

/** Expression tokens of the equation; the blank is `x`, or the number `fill` when given. */
export function tokens(eq: Equation, fill?: number): ExpressionToken[] {
  const tok = (t: Term): ExpressionToken =>
    'n' in t
      ? { t: 'num', v: t.n }
      : 'op' in t
        ? { t: 'op', v: t.op }
        : 'rel' in t
          ? { t: 'rel', v: t.rel }
          : fill === undefined
            ? { t: 'blank', id: 'x' }
            : { t: 'num', v: fill };
  if (eq.form === 'between') {
    // lo < _ < hi: the left side carries the first relation; the same relation joins the right.
    const rel = eq.left.find((t) => 'rel' in t) as { rel: '<' | '>' };
    return [...eq.left.map(tok), { t: 'rel', v: rel.rel }, ...eq.right.map(tok)];
  }
  return [...eq.left.map(tok), { t: 'rel', v: '=' }, ...eq.right.map(tok)];
}

/** The value of one side with `fill` in its blank. */
export function sideValue(terms: Term[], fill = 0): number {
  let total = 0;
  let sign = 1;
  for (const t of terms) {
    if ('op' in t) sign = t.op === '-' ? -1 : 1;
    else if ('n' in t) total += sign * t.n;
    else if ('blank' in t) total += sign * fill;
  }
  return total;
}
