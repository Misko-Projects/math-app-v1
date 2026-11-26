// K02 slice 4e (#17): leftovers from the story-problem slice.
// (a) The look-again line of a story screen is true for that screen: "Show it with counters" only
//     where the story has a counters board, over every shipped story template and many draws.

import { describe, expect, it } from 'vitest';
import { render } from '../src/content/render';
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

describe('MEA.04 compare stories name the planks by length (#17 slice 4e, leftover c)', () => {
  const mea04 = fixture.templates.filter((t) => t.skillId === 'MEA.04');

  it('never says first or second plank, and the long plank is always the longer', () => {
    let compared = 0;
    for (const t of mea04) {
      for (let seed = 1; seed <= 400; seed++) {
        const item = generateItem(t, seed);
        const w = item.widget;
        const lines =
          w.format === 'story-problem'
            ? w.lines.map((l) => render(l.key, l.vars, fixture.narration))
            : [render(item.prompt.narration, item.prompt.vars ?? {}, fixture.narration)];
        const text = lines.join(' ');
        const what = `${t.id} seed ${seed}: ${text}`;
        expect(text, what).not.toMatch(/(first|second) plank/);
        const long = /The long plank is (\d+) \w+ long\./.exec(text);
        const short = /The short plank is (\d+) \w+ long\./.exec(text);
        if (long && short) {
          compared++;
          expect(Number(long[1]), what).toBeGreaterThan(Number(short[1]));
        }
        if (/long plank|short plank/.test(text) && item.answer.kind === 'number') {
          // A told difference: the long plank is longer than the short one by a positive amount.
          const diff = /(\d+) \w+ (longer|shorter) than/.exec(text);
          if (diff) expect(Number(diff[1]), what).toBeGreaterThan(0);
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
});
