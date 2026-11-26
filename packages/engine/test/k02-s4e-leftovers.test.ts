// K02 slice 4e (#17): leftovers from the story-problem slice.
// (a) The look-again line of a story screen is true for that screen: "Show it with counters" only
//     where the story has a counters board, over every shipped story template and many draws.

import { describe, expect, it } from 'vitest';
import { retryFeedback } from '../src/items/check';
import { generateItem } from '../src/items/generate';
import { loadFixture } from './fixture';

const fixture = loadFixture();
const SEEDS = 60;

describe('story look-again line (#17 slice 4e, leftover a)', () => {
  const stories = fixture.templates.filter((t) => t.format === 'story-problem');

  it('walks every shipped story template', () => {
    expect(stories.length).toBeGreaterThan(10);
  });

  it('says "Show it with counters" only on a story with a counters board', () => {
    const counters = fixture.narration['fb.story-problem.retry']?.text ?? '';
    expect(counters).toMatch(/counters/);
    expect(fixture.narration['fb.story-problem.retry-listen']?.text ?? '').not.toMatch(/counters/);
    const seen = new Set<string>();
    for (const t of stories) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const item = generateItem(t, seed);
        const w = item.widget;
        if (w.format !== 'story-problem') throw new Error(`${t.id} is not a story screen`);
        const key = retryFeedback(item);
        seen.add(w.workspace);
        expect(key, `${t.id} seed ${seed} (${w.workspace})`).toBe(
          w.workspace === 'counters' ? 'fb.story-problem.retry' : 'fb.story-problem.retry-listen',
        );
      }
    }
    // Both kinds of screen ship, so both lines are exercised.
    expect(seen.has('counters')).toBe(true);
    expect([...seen].some((s) => s !== 'counters')).toBe(true);
  });
});
