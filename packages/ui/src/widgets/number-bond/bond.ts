import { formatModel } from '@number-island/engine';
import type { ResponseValue } from '@number-island/shared';
import type { ConfigFor } from '../types';

/**
 * Pure logic for the number-bond widget. Slots are `whole`, `part-0` and `part-1` (engine model).
 * Responses always go through `formatModel('number-bond')`: `fill`/`answer` for typed numbers,
 * `split-counters` for counters moved into the parts.
 */

type Config = ConfigFor<'number-bond'>;
export type Slot = 'whole' | 'part-0' | 'part-1';
export const SLOTS: readonly Slot[] = ['whole', 'part-0', 'part-1'];

function model() {
  const m = formatModel('number-bond');
  if (!m) throw new Error('number-bond has no format model');
  return m;
}

export const isSlot = (s: unknown): s is Slot => s === 'whole' || s === 'part-0' || s === 'part-1';

/** The value a config shows in a slot (null = a blank the child fills). */
export function given(config: Config, slot: Slot): number | null {
  if (slot === 'whole') return config.whole;
  return config.parts[slot === 'part-0' ? 0 : 1] ?? null;
}

/** The blanks the child fills, in reading order (whole first, then the parts). */
export const blanks = (config: Config): Slot[] => SLOTS.filter((s) => given(config, s) === null);

/** The slot a missing-part / missing-whole item asks for (as the engine model's `answer`). */
export function missingSlot(config: Config): Slot {
  if (config.whole === null) return 'whole';
  return config.parts[0] === null ? 'part-0' : 'part-1';
}

export const asksNumber = (config: Config) =>
  config.mode === 'missing-part' || config.mode === 'missing-whole';

/** How many counters the concrete bond holds: the whole, or the two given parts together. */
export function counterTotal(config: Config): number {
  if (config.whole !== null) return Math.max(0, config.whole);
  return config.parts.reduce<number>((sum, p) => sum + Math.max(0, p ?? 0), 0);
}

/**
 * Where each counter starts (its home). For missing-whole the counters sit in the two given parts
 * (`counter-0 … a − 1` in part 0, then part 1: the engine's addend order); otherwise all of them
 * wait in the whole, to be split into the parts.
 */
export function homes(config: Config): Slot[] {
  const n = counterTotal(config);
  if (config.mode === 'missing-whole') {
    const a = Math.max(0, config.parts[0] ?? 0);
    return Array.from({ length: n }, (_, i) => (i < a ? 'part-0' : 'part-1'));
  }
  return Array.from({ length: n }, () => 'whole');
}

/** The most counters a slot can ever hold (it sizes the pool so it never reflows). */
export function capacityOf(config: Config, slot: Slot): number {
  const h = homes(config);
  if (config.mode === 'missing-whole' && slot !== 'whole')
    return h.filter((s) => s === slot).length;
  return h.length;
}

/** Columns for a pool of `cap` counters: one row up to 5, then rows of 5 (a ten-frame row). */
export function poolColumns(cap: number): number {
  return Math.max(1, Math.min(5, cap));
}

/** The largest number the answer control offers: the whole (0 … whole), else 10 or 20. */
export function entryMax(config: Config): number {
  if (config.whole !== null) return config.whole;
  return counterTotal(config) > 10 ? 20 : 10;
}

/** Typed answers (pictorial, or the asked number on the concrete bond), through the model. */
export function fillResponse(
  config: Config,
  values: Partial<Record<Slot, number | null>>,
): ResponseValue | null {
  let s = model().initialState(config);
  for (const slot of blanks(config)) {
    const v = values[slot];
    if (v !== null && v !== undefined)
      s = model().apply(s, { op: 'fill', args: { slot, value: v } });
  }
  return model().toResponse(s);
}

/** Counters split into the parts (concrete split / new-way), through the model. */
export function splitResponse(config: Config, where: readonly Slot[]): ResponseValue | null {
  const left = where.filter((s) => s === 'part-0').length;
  const right = where.filter((s) => s === 'part-1').length;
  return model().toResponse(
    model().apply(model().initialState(config), { op: 'split-counters', args: { left, right } }),
  );
}

/**
 * The counter moves that take `where` to `want` counters in part 0 and part 1 (demo
 * `split-counters`, and `fill` on a concrete part): first back to the whole, then out again.
 */
export function movesToSplit(
  where: readonly Slot[],
  want: { 'part-0'?: number; 'part-1'?: number },
): { id: number; to: Slot }[] {
  const moves: { id: number; to: Slot }[] = [];
  const now = [...where];
  for (const part of ['part-0', 'part-1'] as const) {
    const target = want[part];
    if (target === undefined) continue;
    const ids = now.flatMap((s, i) => (s === part ? [i] : []));
    for (const id of ids.slice(target).reverse()) {
      moves.push({ id, to: 'whole' });
      now[id] = 'whole';
    }
  }
  for (const part of ['part-0', 'part-1'] as const) {
    const target = want[part];
    if (target === undefined) continue;
    let have = now.filter((s) => s === part).length;
    for (let id = 0; id < now.length && have < target; id++) {
      if (now[id] !== 'whole') continue;
      moves.push({ id, to: part });
      now[id] = part;
      have += 1;
    }
  }
  return moves;
}

export const counterId = (id: number) => `counter-${id}`;
