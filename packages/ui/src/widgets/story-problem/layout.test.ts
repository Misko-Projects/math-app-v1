import {
  STORY_COUNTERS_MAX,
  STORY_DIGITS_MAX,
  STORY_SCENE_GROUPS_MAX,
  STORY_SCENE_ROWS_MAX,
  STORY_SCENE_TOTAL_MAX,
  storySceneRows,
} from '@number-island/engine';
import { describe, expect, it } from 'vitest';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import {
  boardSize,
  boxWidth,
  CARD_MIN_W,
  countersSize,
  entrySize,
  planBuild,
  planStoryAsk,
  questionSize,
  STORY_MIN_ITEM,
  sceneSize,
} from './layout';

type AgeMode = 'k' | 'g1-up';

/** The smallest widget area (906 × 373) inside its card: 3 px border and 24 px padding a side. */
const ROOM = { w: 852, h: 319 };
const TABLET = { w: 1172, h: 439 };
/** The compact action button as measured (kit `useActionSize`: the 6 px ledge is included). */
const BUTTON = { 'g1-up': { w: 76, h: 82 }, k: { w: 96, h: 102 } };
const AGES = ['g1-up', 'k'] as const;

/** Every scene the model accepts: up to three groups, twenty things, three rows of ten. */
function scenes(): number[][] {
  const out: number[][] = [[]];
  for (let a = 1; a <= STORY_SCENE_TOTAL_MAX; a += 1) {
    out.push([a]);
    for (let b = 1; a + b <= STORY_SCENE_TOTAL_MAX; b += 1) {
      out.push([a, b]);
      for (let c = 1; a + b + c <= STORY_SCENE_TOTAL_MAX; c += 1) out.push([a, b, c]);
    }
  }
  return out.filter((scene) => storySceneRows(scene) <= STORY_SCENE_ROWS_MAX);
}

describe('story-problem, the story step in the smallest area (906 × 373)', () => {
  it('fits every scene of the domain beside the story, with and without the board', () => {
    expect(STORY_SCENE_GROUPS_MAX).toBe(3);
    for (const ageMode of AGES) {
      for (const scene of scenes()) {
        for (const board of [true, false]) {
          const l = planBuild({ room: ROOM, button: BUTTON[ageMode], ageMode, scene, board });
          const what = `${ageMode} scene ${scene.join('+') || 'none'} board ${board}`;
          expect(l.fits, what).toBe(true);
          expect(l.s, what).toBeGreaterThanOrEqual(STORY_MIN_ITEM);
          expect(l.card, what).toBeGreaterThanOrEqual(CARD_MIN_W);
          if (l.side) expect(l.side.h, what).toBeLessThanOrEqual(ROOM.h);
        }
      }
    }
  });

  it('the board has room for every counter, and its two buttons are full targets apart', () => {
    for (const ageMode of AGES) {
      const board = boardSize(STORY_MIN_ITEM, ageMode);
      expect(board.w).toBeGreaterThanOrEqual(2 * MIN_TARGET_PX[ageMode] + 12);
      expect(board.w).toBeGreaterThanOrEqual(countersSize(STORY_MIN_ITEM).w);
    }
    expect(STORY_COUNTERS_MAX).toBe(20);
  });

  it('the story alone takes the whole step, and sprites grow with the room', () => {
    const alone = planBuild({
      room: ROOM,
      button: BUTTON['g1-up'],
      ageMode: 'g1-up',
      scene: [],
      board: false,
    });
    expect(alone.side).toBeNull();
    const small = planBuild({
      room: ROOM,
      button: BUTTON.k,
      ageMode: 'k',
      scene: [9],
      board: true,
    });
    const large = planBuild({
      room: TABLET,
      button: BUTTON.k,
      ageMode: 'k',
      scene: [9],
      board: true,
    });
    expect(large.s).toBeGreaterThan(small.s);
    // The words are the task: the story keeps the wider half where the sprites allow it.
    expect(large.card).toBeGreaterThan(large.side?.w ?? 0);
  });

  it('a scene is a group to a row of ten', () => {
    expect(sceneSize([], 28)).toEqual({ w: 0, h: 0 });
    expect(sceneSize([10, 10], 28).h).toBeLessThan(sceneSize([10, 10, 1], 28).h);
    expect(sceneSize([11], 28).h).toBe(sceneSize([10, 10], 28).h - 8 + 4);
  });
});

describe('story-problem, the answer step in the smallest area (906 × 373)', () => {
  const ask = (
    ageMode: AgeMode,
    boxes: number,
    maxDigits: number,
    questionChars: number,
    counters: boolean,
    room = ROOM,
  ) =>
    planStoryAsk({
      room,
      button: BUTTON[ageMode],
      ageMode,
      boxes,
      maxDigits,
      questionChars,
      counters,
    });

  it('fits one box and two, every number of digits, at both sizes', () => {
    for (const ageMode of AGES) {
      for (const boxes of [1, 2]) {
        for (let maxDigits = 1; maxDigits <= STORY_DIGITS_MAX; maxDigits += 1) {
          for (const counters of [false, true]) {
            // The longest question story.addsub asks is under 60 characters.
            const p = ask(ageMode, boxes, maxDigits, 60, counters);
            const what = `${ageMode} ${boxes} boxes of ${maxDigits} digits`;
            expect(p.fits, what).toBe(true);
            expect(p.question.w, what).toBeGreaterThanOrEqual(240);
          }
        }
      }
    }
  });

  it('Grade 1 shows the counters again beside the 3 × 4 pad; kindergarten takes the short bar', () => {
    const g1 = ask('g1-up', 1, 2, 40, true);
    expect(g1.arrangement).toBe('beside');
    expect(g1.shape).toBe('tall');
    expect(g1.s).toBe(STORY_MIN_ITEM);
    const k = ask('k', 1, 2, 40, true);
    expect(k.arrangement).toBe('bar');
    expect(k.shape).toBe('wide');
    expect(k.s).toBe(0);
    // On the tablet kindergarten has room for the pad beside the question too.
    expect(ask('k', 1, 2, 40, true, TABLET).s).toBe(STORY_MIN_ITEM);
  });

  it('a room too small is flagged, never silently cut', () => {
    expect(ask('k', 2, 3, 60, false, { w: 500, h: 200 }).fits).toBe(false);
  });

  it('an answer box holds its digits, and the mark of its part when there are two', () => {
    for (const ageMode of AGES) {
      expect(boxWidth(ageMode, 2)).toBeGreaterThanOrEqual(MIN_TARGET_PX[ageMode]);
      expect(boxWidth(ageMode, 3)).toBeGreaterThanOrEqual(46 + 3 * 24);
      expect(boxWidth(ageMode, 2, true)).toBe(boxWidth(ageMode, 2) + 46);
      // Two boxes stand in a column beside the pad, never taller than it at the 6 × 2 pad.
      expect(entrySize('wide', ageMode, 2, 2).h).toBe(2 * MIN_TARGET_PX[ageMode] + 12);
    }
  });

  it('the question is a full target, and grows by 32 px a line', () => {
    expect(questionSize(10, 400, 'k').h).toBe(80);
    expect(questionSize(10, 400, 'g1-up').h).toBe(64);
    const two = questionSize(50, 400, 'g1-up').h;
    const three = questionSize(80, 400, 'g1-up').h;
    expect(three - two).toBe(32);
  });
});
