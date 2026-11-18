// 03 §5.2 constraint grammar. The parser and evaluator are the ones the content compiler uses for
// V21 (`@number-island/content/expr`, pure TS with no imports), so the compiler and the engine can
// never disagree about what a constraint means. This module adds a parse cache and a boolean check.

import {
  type Expr,
  ExprError,
  evaluate,
  identifiers,
  parseExpr,
} from '@number-island/content/expr';
import type { ParamValues } from '@number-island/shared';

export { type Expr, ExprError, evaluate, identifiers, parseExpr };

const cache = new Map<string, Expr>();

/** Parse once per distinct source string. Throws `ExprError` on a syntax error. */
export function compileConstraint(src: string): Expr {
  let e = cache.get(src);
  if (!e) {
    e = parseExpr(src);
    cache.set(src, e);
  }
  return e;
}

/** True when the constraint evaluates to a non-zero number (or a non-empty string). */
export function constraintHolds(src: string, env: Readonly<ParamValues>): boolean {
  const v = evaluate(compileConstraint(src), env);
  return typeof v === 'number' ? v !== 0 : v !== '';
}
