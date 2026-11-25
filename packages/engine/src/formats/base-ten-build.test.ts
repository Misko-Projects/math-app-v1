// base-ten-build: the mat-size cap from cross-model review round 1 of PR #74 (finding 7). An item
// may not start with, or need, more pieces of a kind than the widget's mat fits (MAT_MAX); the
// widget's layout test proves MAT_MAX fits 1280 × 800 with all four columns full.

import type { WidgetConfigOf } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  baseTenBuild,
  MAT_MAX,
  MAT_MAX_DISKS,
  MAT_MAX_FLAT,
  overfullKinds,
} from './base-ten-build';

type Config = WidgetConfigOf<'base-ten-build'>;

const ALL = { thousands: true, hundreds: true, tens: true, ones: true };
const TENS_ONES = { thousands: false, hundreds: false, tens: true, ones: true };

const read = (prebuilt: Config['prebuilt'], target: number): Config => ({
  format: 'base-ten-build',
  target,
  mode: 'read',
  pieces: ALL,
  wholeIs: 'unit',
  prebuilt,
});

const valid = (c: Config) => baseTenBuild.configSchema.safeParse(c).success;

describe('base-ten-build: MAT_MAX', () => {
  it('rejects the review case: a read of 1000 shown as 100 rods', () => {
    const c = read({ hundreds: 0, tens: 100, ones: 0 }, 1000);
    expect(valid(c)).toBe(false);
    expect(overfullKinds(c)).toEqual([{ kind: 'tens', path: ['prebuilt', 'tens'], need: 100 }]);
  });

  it('is well above every generator maximum', () => {
    // pv.number (n ≤ 9999, nonCanonical moves one unit down a place), pv.regroup (up to 99 ones),
    // pv.tenmore and mda.addsub (canonical), bond.parts (canonical part).
    expect(MAT_MAX.thousands).toBeGreaterThanOrEqual(9);
    expect(MAT_MAX.hundreds).toBeGreaterThanOrEqual(10 + 9);
    expect(MAT_MAX.tens).toBeGreaterThanOrEqual(19 + 10);
    expect(MAT_MAX.ones).toBeGreaterThanOrEqual(99 * 2);
    expect(valid(read({ thousands: 9, hundreds: 9, tens: 9, ones: 9 }, 9999))).toBe(true);
    expect(valid(read({ thousands: 9, hundreds: 9, tens: 8, ones: 19 }, 9999))).toBe(true);
    // 99 loose ones (pv.regroup) are a mat of tens and ones: proportional pieces.
    expect(valid({ ...read({ hundreds: 0, tens: 0, ones: 99 }, 99), pieces: TENS_ONES })).toBe(
      true,
    );
    // With hundreds in play the mat draws disks (K02), still above every generator: 9 hundreds
    // (10 mid-trade), 19 tens and 19 ones.
    expect(MAT_MAX_DISKS.hundreds).toBeGreaterThanOrEqual(10);
    expect(MAT_MAX_DISKS.tens).toBeGreaterThanOrEqual(19);
    expect(MAT_MAX_DISKS.ones).toBeGreaterThanOrEqual(19);
    expect(valid(read({ thousands: 0, hundreds: 8, tens: 19, ones: 9 }, 999))).toBe(true);
  });

  it('accepts each kind up to its cap and no further', () => {
    const value = { thousands: 1000, hundreds: 100, tens: 10, ones: 1 } as const;
    // A mat with hundreds in play (the tray offers them) draws disks.
    for (const k of ['thousands', 'hundreds', 'tens', 'ones'] as const) {
      const at = (n: number) => read({ hundreds: 0, tens: 0, ones: 0, [k]: n }, n * value[k]);
      expect(valid(at(MAT_MAX_DISKS[k])), `${k} disks at the cap`).toBe(true);
      expect(valid(at(MAT_MAX_DISKS[k] + 1)), `${k} disks past the cap`).toBe(false);
    }
    // A mat of tens and ones keeps its proportional pieces.
    for (const k of ['tens', 'ones'] as const) {
      const at = (n: number) => ({
        ...read({ hundreds: 0, tens: 0, ones: 0, [k]: n }, n * value[k]),
        pieces: TENS_ONES,
      });
      expect(valid(at(MAT_MAX[k])), `${k} at the cap`).toBe(true);
      expect(valid(at(MAT_MAX[k] + 1)), `${k} past the cap`).toBe(false);
    }
  });

  it('counts what a limited tray can add to the prebuilt pieces', () => {
    const c: Config = {
      format: 'base-ten-build',
      target: 34,
      mode: 'build',
      pieces: TENS_ONES,
      wholeIs: 'unit',
      prebuilt: { hundreds: 0, tens: 0, ones: 190 },
      limits: { ones: 10 },
    };
    expect(overfullKinds(c)).toEqual([{ kind: 'ones', path: ['limits', 'ones'], need: 200 }]);
    expect(valid(c)).toBe(false);
    expect(valid({ ...c, limits: { ones: 9 } })).toBe(true);
    // An unlimited tray is the widget's to bound (it never lets a move overfill the mat).
    expect(valid({ ...c, limits: undefined })).toBe(true);
  });

  it('counts the pieces an exact build forces', () => {
    const c: Config = {
      format: 'base-ten-build',
      target: 300,
      mode: 'build-exact',
      pieces: { ...TENS_ONES, ones: true },
      exact: { hundreds: 0, tens: 0 },
      wholeIs: 'unit',
    };
    // No hundreds and no tens: 300 ones.
    expect(overfullKinds(c)).toEqual([{ kind: 'ones', path: ['exact'], need: 300 }]);
    expect(valid(c)).toBe(false);
    expect(valid({ ...c, target: 199 })).toBe(true);
    expect(valid({ ...c, exact: { tens: 30 } })).toBe(false);
    expect(valid({ ...c, exact: { tens: 29 }, target: 290 })).toBe(true);
  });

  it('caps a build target at 9 thousands (ten thousands is a place the mat lacks)', () => {
    const c: Config = {
      format: 'base-ten-build',
      target: 9999,
      mode: 'build',
      pieces: ALL,
      wholeIs: 'unit',
    };
    expect(valid(c)).toBe(true);
    expect(valid({ ...c, target: 10_000 })).toBe(false);
    expect(valid({ ...c, mode: 'build-exact', exact: { ones: 0 }, target: 10_000 })).toBe(false);
  });

  it('lets a read show a target past 9 thousands with pieces within the cap (review round 2)', () => {
    // 10 000 as 9 thousands and 10 hundreds: the widget draws the prebuilt pieces, all in range.
    const c = read({ thousands: 9, hundreds: 10, tens: 0, ones: 0 }, 10_000);
    expect(overfullKinds(c)).toEqual([]);
    expect(baseTenBuild.configSchema.safeParse(c).success).toBe(true);
    // Its pieces are still capped.
    expect(valid(read({ thousands: 10, hundreds: 0, tens: 0, ones: 0 }, 10_000))).toBe(false);
  });

  it('caps a decimal mat (flat = 1) at its own MAT_MAX_FLAT (review round 3)', () => {
    // Wider column names (Tenths, Hundredths) leave room for fewer flats beside the full panel.
    const decimalWorst: Config = {
      format: 'base-ten-build',
      target: 9999,
      mode: 'build-exact',
      pieces: ALL,
      wholeIs: 'flat',
      exact: { hundreds: 9, tens: 9, ones: 9 },
      limits: { hundreds: 0 },
      prebuilt: { thousands: 9, hundreds: 19, tens: 29, ones: 199 },
    };
    expect(overfullKinds(decimalWorst)).toEqual([
      { kind: 'hundreds', path: ['prebuilt', 'hundreds'], need: 19 },
    ]);
    expect(valid(decimalWorst)).toBe(false);
    expect(
      valid({ ...decimalWorst, prebuilt: { thousands: 9, hundreds: 14, tens: 29, ones: 199 } }),
    ).toBe(true);
    // The same mat in ones (flat = 100) is a mat of disks (K02), with their cap.
    expect(valid({ ...decimalWorst, wholeIs: 'unit' })).toBe(false);
    expect(
      valid({
        ...decimalWorst,
        wholeIs: 'unit',
        prebuilt: { thousands: 9, hundreds: 20, tens: 20, ones: 20 },
      }),
    ).toBe(true);
    // Each decimal cap, and one past it.
    const value = { thousands: 1000, hundreds: 100, tens: 10, ones: 1 } as const;
    for (const k of ['thousands', 'hundreds', 'tens', 'ones'] as const) {
      const at = (n: number) => ({
        ...read({ hundreds: 0, tens: 0, ones: 0, [k]: n }, n * value[k]),
        wholeIs: 'flat' as const,
      });
      expect(valid(at(MAT_MAX_FLAT[k])), `${k} at the cap`).toBe(true);
      expect(valid(at(MAT_MAX_FLAT[k] + 1)), `${k} past the cap`).toBe(false);
    }
    // Above pv.number's decimal maxima: 9 thousands, 10 hundreds, 10 tens, 19 ones.
    expect(MAT_MAX_FLAT.thousands).toBeGreaterThanOrEqual(9);
    expect(MAT_MAX_FLAT.hundreds).toBeGreaterThan(10);
    expect(MAT_MAX_FLAT.tens).toBeGreaterThan(10);
    expect(MAT_MAX_FLAT.ones).toBeGreaterThan(19);
  });
});
