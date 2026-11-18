/**
 * Compile-time helpers that keep each hand-written contract type and its Zod schema in lock-step.
 *
 * Usage, next to every schema:
 *   assertType<Equals<z.infer<typeof skillSchema>, Skill>>(true);
 *
 * If the schema and the interface drift apart, `Equals` resolves to `false` and the call no longer
 * type-checks, so `pnpm typecheck` fails.
 */
export type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

/** Mutual assignability: weaker than `Equals`, for types whose modifiers Zod cannot mirror exactly. */
export type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export function assertType<_T extends true>(_value: true): void {}
