// @vitest-environment node
// The story of a story problem is told before the item takes input, so the answer time (which
// the play screen starts when `tellItem` resolves) never includes it.

import type { AudioManager, PresentedItem } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { openingLines, tellItem } from './tellItem';

type Item = Pick<PresentedItem, 'prompt' | 'widget'>;

const vars = { who: 'nib', item: 'shell', many: 2 };
const story = {
  prompt: { narration: 'tp.ADD.20.t3.prompt', text: 'Listen to the story.' },
  widget: {
    format: 'story-problem',
    lines: [
      { key: 'p.story.has', vars: { ...vars, a: 9 } },
      { key: 'p.story.beach-shells.take', vars: { ...vars, b: 7 } },
      { key: 'p.story.q.left', vars },
    ],
  },
} as unknown as Item;
const plain = {
  prompt: { narration: 'tp.CNT.03.t1.prompt', text: 'How many?' },
  widget: { format: 'number-pad' },
} as unknown as Item;

/** A voice whose lines end only when the test says so. */
function heldAudio() {
  const said: string[] = [];
  let release: (() => void) | null = null;
  const audio = {
    say: (key: string) => {
      said.push(key);
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  } as unknown as AudioManager;
  return {
    audio,
    said,
    finishLine: async () => {
      release?.();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe('what a child is told before an item takes input', () => {
  it('a story problem opens with its prompt and then every line of the story', () => {
    expect(openingLines(story).map((l) => l.key)).toEqual([
      'tp.ADD.20.t3.prompt',
      'p.story.has',
      'p.story.beach-shells.take',
      'p.story.q.left',
    ]);
    expect(openingLines(plain).map((l) => l.key)).toEqual(['tp.CNT.03.t1.prompt']);
  });

  it('the item opens for answers only after the last line of the story has been said', async () => {
    const voice = heldAudio();
    let open = false;
    const told = tellItem(voice.audio, story, () => false).then(() => {
      open = true;
    });
    for (const key of ['tp.ADD.20.t3.prompt', 'p.story.has', 'p.story.beach-shells.take']) {
      expect(voice.said.at(-1)).toBe(key);
      await voice.finishLine();
      // Lines are still to come: no answer time is running yet.
      expect(open).toBe(false);
    }
    expect(voice.said.at(-1)).toBe('p.story.q.left');
    expect(open).toBe(false);
    await voice.finishLine();
    await told;
    expect(open).toBe(true);
    expect(voice.said).toHaveLength(4);
  });

  it('an item that is gone tells no more lines', async () => {
    const voice = heldAudio();
    let gone = false;
    const told = tellItem(voice.audio, story, () => gone);
    gone = true;
    await voice.finishLine();
    await told;
    expect(voice.said).toEqual(['tp.ADD.20.t3.prompt']);
  });
});
