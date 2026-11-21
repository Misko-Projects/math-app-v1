import { describe, expect, it } from 'vitest';
import { planRack } from '../rekenrek/plan';
import {
  type ActionSizes,
  keepActionSizes,
  largestActionSize,
  recordActionSize,
} from './actionSize';
import type { Size } from './arrange';

describe('action size for a plan (the largest button measured)', () => {
  const NEXT: Size = { w: 150, h: 86 };
  const CHECK: Size = { w: 230, h: 86 };
  const FALLBACK: Size = { w: 108, h: 72 };

  it('is the fallback until a button is measured, then the largest of those seen', () => {
    let seen: ActionSizes = {};
    expect(largestActionSize(seen, FALLBACK)).toEqual(FALLBACK);
    seen = recordActionSize(seen, 'next', NEXT);
    expect(largestActionSize(seen, FALLBACK)).toEqual(NEXT);
    seen = recordActionSize(seen, 'check', CHECK);
    expect(largestActionSize(seen, FALLBACK)).toEqual(CHECK);
    // Next in view again: the size stays.
    seen = recordActionSize(seen, 'next', NEXT);
    expect(largestActionSize(seen, FALLBACK)).toEqual(CHECK);
  });

  it('a re-measure one pixel off (another zoom) changes nothing; a real change is taken', () => {
    const seen = recordActionSize({}, 'next', NEXT);
    expect(recordActionSize(seen, 'next', { w: NEXT.w - 1, h: NEXT.h })).toBe(seen);
    expect(recordActionSize(seen, 'next', { w: NEXT.w + 1, h: NEXT.h }).next?.w).toBe(NEXT.w + 1);
    expect(recordActionSize(seen, 'next', { w: 90, h: 60 }).next).toEqual({ w: 90, h: 60 });
  });

  it('starts again when the age mode, the text labels or the language changes', () => {
    const text = () => '';
    const g1 = { ageMode: 'g1-up', textLabels: true, text } as const;
    let seen = recordActionSize({}, 'check', CHECK);
    seen = recordActionSize(seen, 'next', NEXT);
    // Nothing changed (also on the first measure): the sizes stay.
    expect(keepActionSizes(seen, null, g1)).toBe(seen);
    expect(keepActionSizes(seen, g1, { ...g1 })).toBe(seen);
    // Text labels off: the wide Check (not in view) is forgotten, and the icon-only Next that is
    // measured next is the whole answer, as on a fresh widget.
    const ICON: Size = { w: 86, h: 86 };
    for (const now of [
      { ...g1, textLabels: false },
      { ...g1, ageMode: 'k' as const },
      { ...g1, text: () => '' },
    ]) {
      const kept = keepActionSizes(seen, g1, now);
      expect(kept).toEqual({});
      expect(largestActionSize(recordActionSize(kept, 'next', ICON), CHECK)).toEqual(ICON);
    }
  });

  it('the rekenrek plan settles where Next and Check differ in width (it used to alternate)', () => {
    const input = (button: Size) =>
      ({ ageMode: 'g1-up', rows: 2, still: false, askMax: 20, button }) as const;
    const stepsWith = (button: Size, w: number) => planRack(input(button), { w, h: 373 }).steps;
    // A room where the plan's layout depends on which of the two buttons was measured.
    const widths = Array.from({ length: 1000 }, (_, i) => 300 + i);
    const w = widths.find((x) => !stepsWith(NEXT, x) && stepsWith(CHECK, x));
    expect(w, 'a width where the two button sizes plan different layouts').toBeDefined();
    if (w === undefined) return;
    /** The button a layout shows first: Next on the two-step rack, Check in one step. */
    const shown = (steps: boolean) =>
      steps ? (['next', NEXT] as const) : (['check', CHECK] as const);

    // Fed only the button in view, the layout flips on every pass.
    let button = NEXT;
    const naive: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const steps = stepsWith(button, w);
      naive.push(steps);
      button = shown(steps)[1];
    }
    expect(new Set(naive.slice(-2)).size).toBe(2);

    // Fed the largest size measured, it settles after both have been seen.
    let seen: ActionSizes = {};
    let size = NEXT;
    const layouts: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const steps = stepsWith(size, w);
      layouts.push(steps);
      const [cue, measured] = shown(steps);
      seen = recordActionSize(seen, cue, measured);
      size = largestActionSize(seen, size);
    }
    expect(new Set(layouts.slice(-4)).size).toBe(1);
  });
});
