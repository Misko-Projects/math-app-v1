import type { ObjectSet } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import {
  applyPadKey,
  cardsPerRow,
  createSubmitGuard,
  layoutBox,
  padValue,
  trayGrid,
} from './controls';
import { dicePattern, dotsLayout, groupIndexes, minObjectStep, objectSetLayout } from './layout';
import { numberLineViewScale, stepsBetween } from './NumberLineView';

const set = (over: Partial<ObjectSet>): ObjectSet => ({
  count: 7,
  sprite: 'shell',
  layout: 'line',
  layoutSeed: 42,
  ...over,
});

const overlaps = (objs: { x: number; y: number; scale: number }[]) => {
  for (let i = 0; i < objs.length; i++) {
    for (let j = i + 1; j < objs.length; j++) {
      const a = objs[i] as { x: number; y: number; scale: number };
      const b = objs[j] as { x: number; y: number; scale: number };
      if (
        Math.abs(a.x - b.x) < 0.95 * Math.min(a.scale, b.scale) &&
        Math.abs(a.y - b.y) < 0.95 * Math.min(a.scale, b.scale)
      )
        return true;
    }
  }
  return false;
};

describe('objectSetLayout', () => {
  it.each([
    'line',
    'array',
    'circle',
    'scatter',
    'ten-frame',
    'double-ten-frame',
    'dice',
    'groups',
  ] as const)(
    '%s: one placed object per counted object, none overlapping, inside the bounds',
    (layout) => {
      for (const count of [0, 1, 5, 10, 17, 20]) {
        const l = objectSetLayout(
          set({
            count,
            layout,
            rows: 2,
            groups:
              layout === 'groups' || layout === 'dice'
                ? [Math.ceil(count / 2), Math.floor(count / 2)]
                : undefined,
          }),
        );
        expect(l.objects.filter((o) => o.kind === 'object')).toHaveLength(count);
        expect(overlaps(l.objects)).toBe(false);
        for (const o of l.objects) {
          expect(o.x).toBeGreaterThanOrEqual(0);
          expect(o.y).toBeGreaterThanOrEqual(0);
          expect(o.x + o.scale).toBeLessThanOrEqual(l.width + 1e-9);
          expect(o.y + o.scale).toBeLessThanOrEqual(l.height + 1e-9);
        }
      }
    },
  );

  it('is deterministic per layoutSeed', () => {
    const a = objectSetLayout(set({ layout: 'scatter', count: 12 }));
    const b = objectSetLayout(set({ layout: 'scatter', count: 12 }));
    const c = objectSetLayout(set({ layout: 'scatter', count: 12, layoutSeed: 43 }));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('keeps counted objects in reading order (obj-<i>)', () => {
    const l = objectSetLayout(set({ layout: 'scatter', count: 10 }));
    const objs = l.objects.filter((o) => o.kind === 'object');
    expect(objs.map((o) => o.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('mixes in distractors with their own sprite', () => {
    const l = objectSetLayout(set({ count: 5, distractors: { sprite: 'crab', count: 3 } }));
    expect(l.objects.filter((o) => o.kind === 'distractor').map((o) => o.sprite)).toEqual([
      'crab',
      'crab',
      'crab',
    ]);
    expect(l.objects.filter((o) => o.kind === 'object')).toHaveLength(5);
  });

  it('tones alternate by sub-group, and line groups are split by a gap', () => {
    const l = objectSetLayout(set({ count: 5, groups: [3, 2] }));
    expect(l.objects.map((o) => o.tone)).toEqual(['a', 'a', 'a', 'b', 'b']);
    const gap = (l.objects[3]?.x ?? 0) - (l.objects[2]?.x ?? 0);
    expect(gap).toBeGreaterThan(1.12);
  });

  it('minObjectStep: the closest pair of objects, in cells', () => {
    expect(minObjectStep(objectSetLayout(set({ count: 7 })))).toBeCloseTo(1.12);
    expect(minObjectStep(objectSetLayout(set({ count: 7, layout: 'ten-frame' })))).toBe(1);
    expect(minObjectStep(objectSetLayout(set({ count: 6, layout: 'array', rows: 2 })))).toBeCloseTo(
      1.15,
    );
    // Scatter jitter never brings two objects closer than one cell.
    for (const seed of [1, 2, 3, 42, 99]) {
      const l = objectSetLayout(set({ count: 12, layout: 'scatter', layoutSeed: seed }));
      expect(minObjectStep(l)).toBeGreaterThanOrEqual(1 - 1e-9);
    }
    expect(minObjectStep(objectSetLayout(set({ count: 1 })))).toBe(Number.POSITIVE_INFINITY);
  });

  it('ten-frames fill top row first and draw one frame per ten', () => {
    const l = objectSetLayout(set({ count: 7, layout: 'ten-frame' }));
    expect(l.frames).toHaveLength(1);
    expect(l.objects.slice(0, 5).every((o) => Math.floor(o.y) === 0)).toBe(true);
    expect(Math.floor(l.objects[5]?.y ?? 0)).toBe(1);
    expect(objectSetLayout(set({ count: 3, layout: 'double-ten-frame' })).frames).toHaveLength(2);
  });
});

describe('dots', () => {
  it('die faces for 1–6 and two columns for 7–10', () => {
    expect(dicePattern(5).cells).toHaveLength(5);
    expect(dicePattern(8)).toMatchObject({ cols: 2, rows: 4 });
  });

  it('five-frame dots follow their groups', () => {
    const l = dotsLayout({ kind: 'dots', arrangement: 'five-frame', groups: [5, 2] });
    expect(l.frames).toHaveLength(2);
    expect(l.objects.map((o) => o.tone)).toEqual(['a', 'a', 'a', 'a', 'a', 'b', 'b']);
  });

  it('groupIndexes', () => {
    expect(groupIndexes(5, [2, 3])).toEqual([0, 0, 1, 1, 1]);
    expect(groupIndexes(3)).toEqual([0, 0, 0]);
  });
});

describe('number line steps', () => {
  it('aligns to multiples and avoids float drift', () => {
    expect(stepsBetween(3, 21, 5)).toEqual([5, 10, 15, 20]);
    expect(stepsBetween(0, 1, 0.1)).toHaveLength(11);
    expect(stepsBetween(0, 1, 0.1).at(-1)).toBe(1);
    expect(stepsBetween(0, 10, null)).toEqual([]);
  });

  it('numberLineViewScale matches the view: end padding for the widest numeral', () => {
    const s = numberLineViewScale({ min: 0, max: 10, width: 500, headroom: 120 });
    expect(s.lineY).toBe(120);
    expect(s.pad).toBe(40);
    expect(s.x(0)).toBe(40);
    expect(s.x(10)).toBe(460);
    expect(s.value(250)).toBe(5);
    const wide = numberLineViewScale({ min: 0, max: 1000, width: 500, headroom: 96 });
    expect(wide.pad).toBe(Math.max(40, (4 * 19 + 6) / 2 + 8));
  });
});

describe('number pad entry', () => {
  it('caps digits, drops leading zeros, one decimal point', () => {
    let t = '';
    for (const k of ['0', '7', '3', '9'] as const) t = applyPadKey(t, k, 2);
    expect(t).toBe('73');
    expect(applyPadKey('', '.', 3)).toBe('0.');
    expect(applyPadKey('2.', '.', 3)).toBe('2.');
    expect(applyPadKey('25', 'back', 3)).toBe('2');
    expect(padValue('')).toBeNull();
    expect(padValue('0.')).toBe(0);
    expect(padValue('2.5')).toBe(2.5);
  });
});

describe('review regressions (PR #63 round 1)', () => {
  it('ten objects with sub-group gaps stay on one row (CNT.15.t3 ordinal, groups [8, 1, 1])', () => {
    const l = objectSetLayout(set({ count: 10, layout: 'line', groups: [8, 1, 1] }));
    const objs = l.objects.filter((o) => o.kind === 'object');
    expect(new Set(objs.map((o) => o.y))).toEqual(new Set([0]));
    // The marked object (group 1, index 8) has exactly one object to its right.
    const marked = objs.find((o) => o.group === 1) as (typeof objs)[number];
    expect(objs.filter((o) => o.x > marked.x)).toHaveLength(1);
    // An eleventh object starts a second row.
    const eleven = objectSetLayout(set({ count: 11, layout: 'line', groups: [8, 1, 2] }));
    expect(eleven.objects.filter((o) => o.y > 0)).toHaveLength(1);
  });

  it.each(['groups', 'dice', 'ten-frame'] as const)(
    '%s with distractors: counted objects keep their structured places, distractors do not overlap',
    (layout) => {
      const l = objectSetLayout(
        set({ count: 5, layout, groups: [3, 2], distractors: { sprite: 'crab', count: 2 } }),
      );
      expect(l.objects).toHaveLength(7);
      expect(overlaps(l.objects)).toBe(false);
      const counted = l.objects.filter((o) => o.kind === 'object');
      const loose = l.objects.filter((o) => o.kind === 'distractor');
      expect(counted.map((o) => o.sprite)).toEqual(Array(5).fill('shell'));
      // Distractors sit below every counted object.
      const lowest = Math.max(...counted.map((o) => o.y + o.scale));
      for (const d of loose) expect(d.y).toBeGreaterThan(lowest);
      for (const o of l.objects) {
        expect(o.x + o.scale).toBeLessThanOrEqual(l.width + 1e-9);
        expect(o.y + o.scale).toBeLessThanOrEqual(l.height + 1e-9);
      }
      if (layout !== 'ten-frame') {
        expect(counted.filter((o) => o.group === 0)).toHaveLength(3);
        expect(counted.filter((o) => o.group === 1)).toHaveLength(2);
      }
    },
  );
});

describe('review regressions (PR #63 round 3)', () => {
  it('the submit guard refuses a nested submit fired from inside onResponse', () => {
    let t = 1000;
    const guard = createSubmitGuard(400, () => t);
    const sent: string[] = [];
    const outer = () => {
      sent.push('outer');
      // The host's onResponse synchronously triggers another Enter.
      guard(() => {
        sent.push('nested');
        return true;
      });
      return true;
    };
    expect(guard(outer)).toBe(true);
    expect(sent).toEqual(['outer']);
    t += 399;
    expect(guard(() => true)).toBe(false);
    t += 2;
    expect(guard(() => true)).toBe(true);
  });

  it('a submit that sends nothing releases the window', () => {
    let t = 0;
    const guard = createSubmitGuard(400, () => t);
    expect(guard(() => false)).toBe(false);
    t += 10;
    expect(guard(() => true)).toBe(true);
    t += 10;
    expect(guard(() => true)).toBe(false);
  });

  it('explicit empty groups stay as empty plates', () => {
    const l = objectSetLayout(set({ count: 0, layout: 'groups', groups: [0, 0, 0] }));
    expect(l.objects).toHaveLength(0);
    expect(l.frames.filter((f) => f.kind === 'plate')).toHaveLength(3);
    const mixed = objectSetLayout(set({ count: 2, layout: 'groups', groups: [2, 0] }));
    expect(mixed.frames).toHaveLength(2);
    expect(mixed.objects).toHaveLength(2);
  });
});

describe('trayGrid (PR #63 evidence ruling: even columns, no lone last card)', () => {
  it('lays 0–20 out as 0–10 over 11–20, 7 × 3 or 3 × 7 by width', () => {
    expect(trayGrid(21, 11)).toEqual({ cols: 11, rows: 2 });
    expect(trayGrid(21, 12)).toEqual({ cols: 11, rows: 2 });
    expect(trayGrid(21, 10)).toEqual({ cols: 7, rows: 3 });
    expect(trayGrid(21, 7)).toEqual({ cols: 7, rows: 3 });
    expect(trayGrid(21, 6)).toEqual({ cols: 6, rows: 4 });
    expect(trayGrid(21, 5)).toEqual({ cols: 3, rows: 7 });
    expect(trayGrid(11, 9)).toEqual({ cols: 6, rows: 2 });
    expect(trayGrid(11, 11)).toEqual({ cols: 11, rows: 1 });
    expect(trayGrid(10, 4)).toEqual({ cols: 4, rows: 3 });
    expect(trayGrid(0, 5)).toEqual({ cols: 1, rows: 0 });
  });
  it('always fits the width, fills every row but the last, and keeps the last row half full', () => {
    for (let n = 1; n <= 30; n++) {
      for (let cap = 1; cap <= n + 2; cap++) {
        const { cols, rows } = trayGrid(n, cap);
        const last = n - (rows - 1) * cols;
        expect(cols).toBeLessThanOrEqual(Math.max(1, cap));
        expect(last).toBeGreaterThanOrEqual(Math.ceil(cols / 2));
        expect(last).toBeLessThanOrEqual(cols);
      }
    }
  });
});

describe('review regressions (PR #63 round 6)', () => {
  it('ten-frames keep sizeVaries, each object inside its cell, deterministically', () => {
    const s = set({ count: 7, layout: 'ten-frame', sizeVaries: true, layoutSeed: 11 });
    const l = objectSetLayout(s);
    expect(new Set(l.objects.map((o) => o.scale.toFixed(3))).size).toBeGreaterThan(1);
    l.objects.forEach((o, i) => {
      const cellX = i % 5;
      const cellY = Math.floor(i / 5);
      expect(o.x).toBeGreaterThan(cellX);
      expect(o.x + o.scale).toBeLessThan(cellX + 1);
      expect(o.y).toBeGreaterThan(cellY);
      expect(o.y + o.scale).toBeLessThan(cellY + 1);
    });
    expect(objectSetLayout(s)).toEqual(l);
    // Without sizeVaries every object has the same in-cell size.
    const plain = objectSetLayout({ ...s, sizeVaries: false });
    expect(new Set(plain.objects.map((o) => o.scale)).size).toBe(1);
  });
});

describe('review regressions (PR #63 round 4)', () => {
  it('zero groups draw zero plates; a missing list with objects still draws one', () => {
    expect(objectSetLayout(set({ count: 0, layout: 'groups', groups: [] })).frames).toHaveLength(0);
    expect(
      objectSetLayout(set({ count: 0, layout: 'groups', groups: [0, 0, 0] })).frames,
    ).toHaveLength(3);
    const loose = objectSetLayout(set({ count: 4, layout: 'groups', groups: [] }));
    expect(loose.frames).toHaveLength(1);
    expect(loose.objects).toHaveLength(4);
  });

  it('a nested submit is refused even when onResponse runs past the window', () => {
    let t = 0;
    const guard = createSubmitGuard(400, () => t);
    let nestedSent = false;
    guard(() => {
      t += 400; // slow host work inside onResponse
      nestedSent = guard(() => true);
      return true;
    });
    expect(nestedSent).toBe(false);
    // A throwing submit (the host's onResponse threw after recording the response) releases the
    // in-flight lock but keeps the window: a retry 1 ms later is refused, 400 ms later allowed.
    t += 500;
    expect(() =>
      guard(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    t += 1;
    expect(guard(() => true)).toBe(false);
    t += 399;
    expect(guard(() => true)).toBe(true);
  });
});

describe('review regressions (PR #63 round 2)', () => {
  const check = (s: ObjectSet, counted: number, distractors: number) => {
    const l = objectSetLayout(s);
    expect(l.objects.filter((o) => o.kind === 'object')).toHaveLength(counted);
    expect(l.objects.filter((o) => o.kind === 'distractor')).toHaveLength(distractors);
    expect(overlaps(l.objects)).toBe(false);
    for (const o of l.objects) {
      expect(o.x + o.scale).toBeLessThanOrEqual(l.width + 1e-9);
      expect(o.y + o.scale).toBeLessThanOrEqual(l.height + 1e-9);
    }
    return l;
  };

  it.each(['groups', 'dice'] as const)(
    '%s: groups that overshoot the count never draw extra counted objects',
    (layout) => {
      check(
        set({ count: 5, layout, groups: [4, 2], distractors: { sprite: 'crab', count: 1 } }),
        5,
        1,
      );
    },
  );

  it('a double ten-frame with more than 20 objects grows a frame; distractors go below', () => {
    const l = check(
      set({ count: 21, layout: 'double-ten-frame', distractors: { sprite: 'crab', count: 1 } }),
      21,
      1,
    );
    expect(l.frames).toHaveLength(3);
  });
});

describe('layoutBox (round 11: tray capacity from layout, not transformed, widths)', () => {
  const style = (s: Partial<Record<string, string>>) =>
    ({
      width: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
      borderLeftWidth: '0px',
      borderRightWidth: '0px',
      boxSizing: 'content-box',
      ...s,
    }) as unknown as CSSStyleDeclaration;
  it('keeps fractional widths and handles both box sizings', () => {
    expect(
      layoutBox(
        style({
          width: '643.75px',
          paddingLeft: '48px',
          paddingRight: '48px',
          boxSizing: 'border-box',
        }),
      ),
    ).toEqual({ content: 547.75, border: 643.75 });
    expect(
      layoutBox(style({ width: '547.75px', paddingLeft: '8px', borderRightWidth: '2px' })),
    ).toEqual({ content: 547.75, border: 557.75 });
    expect(layoutBox(style({ width: 'auto' }))).toEqual({ content: 0, border: 0 });
  });
});

describe('cardsPerRow (round 12: computed-style rounding at a fit boundary)', () => {
  it('fits at the exact boundary despite 4-decimal serialization, and wraps one layout unit past it', () => {
    // 4 × 73.59375 + 3 × 12 = 330.375; getComputedStyle reports the card as 73.5938.
    expect(cardsPerRow(330.375, 73.5938, 12)).toBe(4);
    expect(cardsPerRow(330.375 - 1 / 64, 73.5938, 12)).toBe(3);
    expect(cardsPerRow(330.375 - 1 / 64, 73.59375, 12)).toBe(3);
    expect(cardsPerRow(547.75, 100, 12)).toBe(4);
    expect(cardsPerRow(560, 100, 12)).toBe(5);
    expect(cardsPerRow(50, 100, 12)).toBe(1);
  });
});
