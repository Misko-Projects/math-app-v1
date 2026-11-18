// 03 §6.3 format state models. Each format has a pure model in packages/engine/src/formats/<format>.ts:
// `initialState(config)`, `apply(state, action)` and `toResponse(state)`. The widget renders the
// model, demo mode calls `apply`, and the property test replays `solution()` through it (03 §9.4).
// E01 owns the models and widget schemas for the 11 fixture formats; U03–U05 add the rest.

import type {
  AnswerSpec,
  ItemFormat,
  ResponseValue,
  WidgetAction,
  WidgetConfigOf,
} from '@number-island/shared';
import type { z } from 'zod';

/** Raised by `apply` for an op the format does not support (03 §6.3: dev throws, prod skips). */
export class UnsupportedOpError extends Error {
  constructor(
    readonly format: ItemFormat,
    readonly op: string,
  ) {
    super(`format ${format} does not support op '${op}'`);
    this.name = 'UnsupportedOpError';
  }
}

export interface FormatState<F extends ItemFormat> {
  readonly config: WidgetConfigOf<F>;
}

export interface FormatModel<F extends ItemFormat, S extends FormatState<F>> {
  format: F;
  /**
   * The per-format widget schema (03 §9.4 step 3): the shared structural schema plus the semantic
   * rules a widget relies on (counts within capacity, options distinct, and so on).
   */
  configSchema: z.ZodType<WidgetConfigOf<F>>;
  /** Format features (03 §5.5) with their default weights and docs. */
  features: Record<string, { weight: number; doc: string }>;
  /** Raw format feature values for a built item. Every value is 0 for the easiest item. */
  featureValues(config: WidgetConfigOf<F>, answer: AnswerSpec): Record<string, number>;
  initialState(config: WidgetConfigOf<F>): S;
  /**
   * Apply one demo or child action. Pure: returns a new state. Every model also accepts the
   * generic `answer` op (`{ value }`, `{ values }` or `{ id }`), which enters the final answer
   * the way the widget's answer control does (number pad, numeral tray, pick).
   */
  apply(state: S, action: WidgetAction): S;
  /** The response the widget would submit now, or null while nothing is submittable. */
  toResponse(state: S): ResponseValue | null;
}

// ---------- helpers shared by the models ----------

export function argNumber(action: WidgetAction, key: string): number | undefined {
  const v = action.args?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function argString(action: WidgetAction, key: string): string | undefined {
  const v = action.args?.[key];
  return typeof v === 'string' ? v : undefined;
}

export function argNumbers(action: WidgetAction, key: string): number[] | undefined {
  const v = action.args?.[key];
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? (v as number[])
    : undefined;
}

export function requireNumber(format: ItemFormat, action: WidgetAction, key: string): number {
  const v = argNumber(action, key);
  if (v === undefined) {
    throw new RangeError(`format ${format}: op '${action.op}' needs a numeric '${key}' argument`);
  }
  return v;
}

/** Digits of a non-negative integer (0 has one digit). */
export const digitCount = (n: number): number => String(Math.abs(Math.trunc(n))).length;
