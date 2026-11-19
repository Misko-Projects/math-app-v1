import type { ExpressionToken } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  balancedWidth,
  cardLayout,
  expressionSize,
  type InviteContext,
  inviteTarget,
  isPlaceValue,
  traceTarget,
  trayValueOf,
  wrappedRows,
} from './layout';

describe('cardLayout', () => {
  it('gives copies of a value their own ids and hides the last copies in use', () => {
    const tray = cardLayout([300, 40, 300, 5, 300], [300, 300]);
    expect(tray.map((c) => c.id)).toEqual([
      'card-300',
      'card-40',
      'card-300~1',
      'card-5',
      'card-300~2',
    ]);
    expect(tray.filter((c) => c.visible).map((c) => c.id)).toEqual([
      'card-300',
      'card-40',
      'card-5',
    ]);
  });

  it('ignores used values that are not cards', () => {
    expect(cardLayout([40, 5], [7]).every((c) => c.visible)).toBe(true);
  });
});

describe('ids', () => {
  it('copies share one trace id; tray ids carry their value', () => {
    expect(traceTarget('card-300~2')).toBe('card-300');
    expect(traceTarget('placed-3')).toBe('placed-3');
    expect(trayValueOf('card-300~2')).toBe(300);
    expect(trayValueOf('card-5')).toBe(5);
    expect(trayValueOf('placed-1')).toBeUndefined();
  });

  it('isPlaceValue: one non-zero digit then zeros', () => {
    expect(isPlaceValue(300)).toEqual({ digit: 3, power: 2 });
    expect(isPlaceValue(5)).toEqual({ digit: 5, power: 0 });
    expect(isPlaceValue(14)).toBeNull();
    expect(isPlaceValue(0)).toBeNull();
  });
});

describe('balancedWidth', () => {
  it('evens out wrapped lines', () => {
    const six = [100, 100, 100, 100, 100, 100];
    // 5 fit in 560 px (5 × 100 + 4 × 12 = 548): 5 + 1 unbalanced → 3 + 3.
    expect(wrappedRows(six, 12, 560)).toBe(2);
    const w = balancedWidth(six, 12, 560);
    expect(wrappedRows(six, 12, w)).toBe(2);
    expect(w).toBeLessThan(330);
    // Three cards a line need 324 px; wrapping allows half a pixel of rounding.
    expect(w).toBeGreaterThanOrEqual(323.5);
  });

  it('keeps the full width when everything fits on one line', () => {
    expect(balancedWidth([100, 100], 12, 560)).toBe(560);
    expect(balancedWidth([], 12, 560)).toBe(560);
  });
});

describe('expressionSize', () => {
  const n = (v: number): ExpressionToken => ({ t: 'num', v });
  const plus: ExpressionToken = { t: 'op', v: '+' };
  it('keeps short expressions at 72 px and shrinks long ones', () => {
    expect(expressionSize([n(300), plus, n(40), plus, n(5)], 4, 760)).toBe('lg');
    const threeBlanks: ExpressionToken[] = [
      { t: 'blank', id: 'a' },
      plus,
      { t: 'blank', id: 'b' },
      plus,
      { t: 'blank', id: 'c' },
      { t: 'rel', v: '=' },
      n(345),
    ];
    expect(expressionSize(threeBlanks, 3, 760)).toBe('md');
  });
});

describe('inviteTarget', () => {
  const base: InviteContext = {
    mode: 'build',
    hasCards: true,
    placed: [300],
    tray: cardLayout([300, 40, 5], [300]),
    ids: [],
    entries: [],
    padSlots: [],
    active: 0,
  };
  it('points at the card to move, the placed card to take back, or the mat', () => {
    expect(inviteTarget({ op: 'place-card', args: { value: 40 } }, base)).toBe('card-40');
    expect(inviteTarget({ op: 'place-card', args: { value: 300, remove: true } }, base)).toBe(
      'placed-0',
    );
    expect(inviteTarget({ op: 'stack-cards' }, base)).toBe('build');
    expect(inviteTarget({ op: 'highlight-digit', args: { index: 2 } }, base)).toBe('digit-2');
    expect(inviteTarget({ op: 'answer', args: { values: [5, 40] } }, base)).toBe('card-5');
    expect(inviteTarget(null, base)).toBeNull();
  });

  it('points at blanks and word cards in the other modes', () => {
    const pad: InviteContext = {
      ...base,
      mode: 'to-standard',
      hasCards: false,
      tray: [],
      padSlots: ['answer'],
    };
    expect(inviteTarget({ op: 'answer', args: { value: 345 } }, pad)).toBe('blank-answer');
    expect(inviteTarget({ op: 'highlight-digit', args: { index: 0 } }, pad)).toBeNull();
    expect(inviteTarget({ op: 'answer', args: { id: 'b' } }, { ...pad, mode: 'words' })).toBe(
      'opt-b',
    );
  });
});
