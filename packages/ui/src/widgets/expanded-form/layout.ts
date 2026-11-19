// Pure helpers for the expanded-form widget: the card tray with duplicate copies, trace ids, the
// expression's size and what a demo invite points at. No DOM, so they have plain unit tests.
import type { ExpressionToken, WidgetAction } from '@number-island/shared';

/** One card in the tray, in config order. */
export interface TrayCard {
  /** The item id: `card-<value>` for the first copy, `card-<value>~<k>` for copy k. */
  id: string;
  value: number;
  /** Still in the tray (copies of a value that was placed leave it, the last copy first). */
  visible: boolean;
}

/** The tray: every config card, with as many copies of each value hidden as are in use. */
export function cardLayout(cards: readonly number[], used: readonly number[]): TrayCard[] {
  const seen = new Map<number, number>();
  const total = new Map<number, number>();
  const inUse = new Map<number, number>();
  for (const v of cards) total.set(v, (total.get(v) ?? 0) + 1);
  for (const v of used) inUse.set(v, (inUse.get(v) ?? 0) + 1);
  return cards.map((value) => {
    const k = seen.get(value) ?? 0;
    seen.set(value, k + 1);
    const left = (total.get(value) ?? 0) - (inUse.get(value) ?? 0);
    return { id: k === 0 ? `card-${value}` : `card-${value}~${k}`, value, visible: k < left };
  });
}

/** The trace id of an item or target: copies of a card share `card-<value>`. */
export function traceTarget(id: string): string {
  return id.replace(/~\d+$/, '');
}

/** The value of a tray card id (`card-300`, `card-300~1`), or undefined. */
export function trayValueOf(id: string): number | undefined {
  const m = /^card-(\d+(?:\.\d+)?)(?:~\d+)?$/.exec(id);
  return m ? Number(m[1]) : undefined;
}

/** How many lines flex wrapping makes of items `widths` px wide, `gap` px apart, in `limit` px. */
export function wrappedRows(widths: readonly number[], gap: number, limit: number): number {
  let rows = 0;
  let line = -1;
  for (const w of widths) {
    if (line < 0 || line + gap + w > limit + 0.5) {
      rows += 1;
      line = w;
    } else {
      line += gap + w;
    }
  }
  return rows;
}

/**
 * The narrowest width that still wraps the items into as few lines as `avail` allows, so the
 * lines come out even (6 cards → 3 + 3, not 5 + 1). Returns `avail` when one line holds them all.
 */
export function balancedWidth(widths: readonly number[], gap: number, avail: number): number {
  if (widths.length === 0) return avail;
  const rows = wrappedRows(widths, gap, avail);
  if (rows <= 1) return avail;
  let lo = Math.max(...widths);
  let hi = avail;
  for (let i = 0; i < 24 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (wrappedRows(widths, gap, mid) <= rows) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** `d × 10^power` with one non-zero digit (300 → 3, 2), or null (14, 0, 2.5). */
export function isPlaceValue(v: number): { digit: number; power: number } | null {
  if (!Number.isInteger(v) || v <= 0) return null;
  const s = String(v);
  if (!/^[1-9]0*$/.test(s)) return null;
  return { digit: Number(s[0]), power: s.length - 1 };
}

/**
 * The expression's numeral size: 72 px (`lg`) when it fits `availPx` on one line, else 48 px
 * (`md`). Widths are estimated in em of Baloo 2 (≈ 0.6 em a digit or sign, 26 px gaps, blanks as
 * wide as `blankDigits` digits plus their padding).
 */
export function expressionSize(
  tokens: readonly ExpressionToken[],
  blankDigits: number,
  availPx: number,
): 'lg' | 'md' {
  const LG = 72;
  let em = 0;
  for (const tok of tokens) {
    if (tok.t === 'num') em += String(tok.v).length * 0.6;
    else if (tok.t === 'blank') em += blankDigits * 0.62 + 0.8 + 0.1;
    else em += 0.6;
  }
  const px = em * LG + Math.max(0, tokens.length - 1) * 26;
  return px <= availPx ? 'lg' : 'md';
}

export interface InviteContext {
  mode: 'build' | 'fill' | 'to-standard' | 'words' | 'digit-value';
  hasCards: boolean;
  placed: readonly number[];
  tray: readonly TrayCard[];
  ids: readonly string[];
  entries: readonly (number | null)[];
  padSlots: readonly string[];
  active: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * What a demo invite (03 §6.3) points at, as a render key: a tray card (`card-300`), a placed card
 * (`placed-1`), the mat (`build`), the tray (`tray`), a blank (`blank-<id>`), a digit
 * (`digit-<i>`) or a word card (`opt-<id>`). Null when the step has no target on screen.
 */
export function inviteTarget(action: WidgetAction | null, c: InviteContext): string | null {
  if (!action) return null;
  const firstCard = (v: number | undefined) =>
    v === undefined ? null : (c.tray.find((card) => card.visible && card.value === v)?.id ?? null);
  const padBlank = () => {
    const id = c.padSlots[Math.min(Math.max(c.active, 0), c.padSlots.length - 1)];
    return id === undefined ? null : `blank-${id}`;
  };
  switch (action.op) {
    case 'place-card': {
      const v = num(action.args?.value);
      if (action.args?.remove === true) {
        const i = v === undefined ? -1 : c.placed.lastIndexOf(v);
        return i >= 0 ? `placed-${i}` : null;
      }
      if (c.hasCards) return firstCard(v) ?? (c.mode === 'build' ? 'build' : null);
      if (c.mode === 'fill') {
        const i = c.entries.indexOf(null);
        return i >= 0 && c.ids[i] !== undefined ? `blank-${c.ids[i]}` : padBlank();
      }
      return null;
    }
    case 'stack-cards':
      return c.mode === 'build' ? 'build' : null;
    case 'highlight-digit': {
      const i = num(action.args?.index);
      return i === undefined || (c.mode !== 'build' && c.mode !== 'digit-value')
        ? null
        : `digit-${i}`;
    }
    case 'answer': {
      if (typeof action.args?.id === 'string') return `opt-${action.args.id}`;
      if (c.hasCards) {
        const values = action.args?.values;
        const v = Array.isArray(values) ? num(values[0]) : num(action.args?.value);
        return firstCard(v);
      }
      return padBlank();
    }
    default:
      return null;
  }
}
