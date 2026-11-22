// The answer a coin-pay or make-change item must carry (03 §5.5, 03 §5.7; PR #101 review 4).
//
// Two things judge a tray: the widget, which tells a child when a full tray is not the answer
// (`trayAnswers`, from the config), and Check, which runs the item's `coins.total` or
// `coins.fewest` checker on its `answer.target`. The checker's `purse` and `found` are optional
// (no purse means every coin unlimited and no bills), so an item whose target left them out, or
// gave other ones than the config, would be judged against two different purses: twelve quarters
// for $3.00 are the fewest pieces without bills and not the fewest with them. So the target is
// not free: it is exactly the one the config implies, and content-check refuses anything else.

import type { AnswerSpec, WidgetConfigOf } from '@number-island/shared';
import { canonicalKey, PIECES_BIG_FIRST, type Purse, purseLimit, readPurse } from './money';

type PayConfig = WidgetConfigOf<'coin-pay'>;
type ChangeConfig = WidgetConfigOf<'make-change'>;
type CoinConfig = PayConfig | ChangeConfig;

/** The purse as a checker target carries it: every kind the purse has, with its count. */
function targetPurse(purse: Purse): Record<string, number | 'unlimited'> {
  const out: Record<string, number | 'unlimited'> = {};
  for (const k of PIECES_BIG_FIRST) {
    const n = purseLimit(purse, k);
    if (n > 0) out[k] = Number.isFinite(n) ? n : 'unlimited';
  }
  return out;
}

/** Whether two purses allow the same pieces (a kind listed with 0 is a kind not listed). */
const samePurse = (a: Purse, b: Purse): boolean =>
  PIECES_BIG_FIRST.every((k) => purseLimit(a, k) === purseLimit(b, k));

/** The ways found, as a sorted list of canonical keys (keys that are not keys are kept as they are). */
const foundKeys = (found: readonly unknown[] | undefined): string[] =>
  [
    ...new Set(
      (found ?? []).map((k) => (typeof k === 'string' ? (canonicalKey(k) ?? k) : String(k))),
    ),
  ].sort();

/** The answer a coin item's config implies: the one its item must carry. */
export function coinAnswerSpec(c: CoinConfig): Extract<AnswerSpec, { kind: 'state' }> {
  if (c.format === 'make-change') {
    return {
      kind: 'state',
      checker: 'coins.total',
      target: { cents: c.paid - c.price, purse: targetPurse(c.purse) },
    };
  }
  const target: Record<string, unknown> = { cents: c.target, purse: targetPurse(c.purse) };
  if (c.mode === 'new-way' && (c.found ?? []).length > 0) target.found = foundKeys(c.found);
  return { kind: 'state', checker: c.requireFewest ? 'coins.fewest' : 'coins.total', target };
}

/**
 * What is wrong with a coin item's answer, as messages (none when it is the answer its config
 * implies): the checker, the amount, the purse (never left out, never another one) and the ways
 * found must all be the config's, so the widget and Check judge a tray alike.
 */
export function coinAnswerIssues(c: CoinConfig, answer: AnswerSpec): string[] {
  const want = coinAnswerSpec(c);
  if (answer.kind !== 'state') return [`${c.format} answers with a state (${want.checker})`];
  const out: string[] = [];
  if (answer.checker !== want.checker) {
    out.push(
      c.format === 'coin-pay'
        ? `the checker is ${want.checker} (requireFewest is ${c.requireFewest}), not ${answer.checker}`
        : `the checker is ${want.checker}, not ${answer.checker}`,
    );
  }
  if (answer.target.cents !== want.target.cents) {
    out.push(`target.cents is ${String(want.target.cents)}, not ${String(answer.target.cents)}`);
  }
  if (answer.target.purse === undefined) {
    out.push(
      'target.purse is missing: without it the checker allows every coin and no bills, which is not the purse the child has',
    );
  } else {
    const purse = readPurse(answer.target.purse);
    if (!purse || !samePurse(purse, c.purse)) {
      out.push('target.purse is not the purse of the widget config');
    }
  }
  const got = Array.isArray(answer.target.found) ? answer.target.found : undefined;
  const wantFound = c.format === 'coin-pay' && c.mode === 'new-way' ? c.found : undefined;
  if (JSON.stringify(foundKeys(got)) !== JSON.stringify(foundKeys(wantFound))) {
    out.push('target.found is not the ways found of the widget config');
  }
  return out;
}
