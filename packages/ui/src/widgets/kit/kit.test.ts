import type { ObjectSet } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { applyPadKey, createSubmitGuard, padValue } from './controls';
import { dicePattern, dotsLayout, groupIndexes, objectSetLayout } from './layout';
import { stepsBetween } from './NumberLineView';

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
