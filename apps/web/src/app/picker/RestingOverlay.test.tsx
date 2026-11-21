import { describe, expect, it } from 'vitest';
import { restingLine } from './RestingOverlay';

describe('restingLine', () => {
  it('names when quiet hours end, in a child’s words', () => {
    expect(restingLine('quiet-hours', '07:00')).toEqual({
      key: 'ui.rest.quiet-hours.morning',
      vars: { at: '7:00' },
    });
    expect(restingLine('quiet-hours', '12:30')).toEqual({
      key: 'ui.rest.quiet-hours.afternoon',
      vars: { at: '12:30' },
    });
    expect(restingLine('quiet-hours', '18:15')).toEqual({
      key: 'ui.rest.quiet-hours.evening',
      vars: { at: '6:15' },
    });
    expect(restingLine('quiet-hours', '00:05')).toEqual({
      key: 'ui.rest.quiet-hours.morning',
      vars: { at: '12:05' },
    });
  });

  it('falls back to the general line without a valid time, and covers the other reasons', () => {
    expect(restingLine('quiet-hours')).toEqual({ key: 'ui.rest.quiet-hours' });
    expect(restingLine('quiet-hours', '7am')).toEqual({ key: 'ui.rest.quiet-hours' });
    expect(restingLine('quiet-hours', '25:00')).toEqual({ key: 'ui.rest.quiet-hours' });
    expect(restingLine('daily-cap')).toEqual({ key: 'ui.rest.daily-cap' });
    expect(restingLine('elsewhere')).toEqual({ key: 'ui.rest.elsewhere' });
  });
});
