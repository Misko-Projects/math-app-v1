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

/**
 * A voice that reports its lines as the app's AudioManager does: a new line cuts the one being
 * said, and each start and end is reported.
 */
function reportingAudio() {
  type Listener = (e: { type: string; lineId: number; reason?: string }) => void;
  const listeners = new Set<Listener>();
  const said: string[] = [];
  let nextId = 1;
  let current: { id: number; resolve: () => void } | null = null;
  const emit = (e: Parameters<Listener>[0]) => {
    for (const l of [...listeners]) l(e);
  };
  const end = (reason: 'done' | 'cancelled') => {
    const line = current;
    if (!line) return;
    emit({ type: 'line-end', lineId: line.id, reason });
    current = null;
    line.resolve();
  };
  const audio = {
    get speaking() {
      return current !== null;
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    say(key: string) {
      end('cancelled');
      said.push(key);
      const id = nextId++;
      return new Promise<void>((resolve) => {
        current = { id, resolve };
        emit({ type: 'line-start', lineId: id });
      });
    },
  };
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    audio: audio as unknown as AudioManager,
    said,
    finishLine: async () => {
      end('done');
      await settle();
    },
    /** The child taps the prompt bubble: it says the prompt, over whatever is being said. */
    tapBubble: async (key: string) => {
      void audio.say(key);
      await settle();
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

  it('a tap on the prompt bubble during the story loses none of it and does not open the item', async () => {
    const voice = reportingAudio();
    let open = false;
    const told = tellItem(voice.audio, story, () => false).then(() => {
      open = true;
    });
    await voice.finishLine();
    expect(voice.said).toEqual(['tp.ADD.20.t3.prompt', 'p.story.has']);
    // The first story line is being said: the child taps the bubble.
    await voice.tapBubble('tp.ADD.20.t3.prompt');
    expect(open).toBe(false);
    // The bubble's line is heard out, never cut by the story.
    expect(voice.said.at(-1)).toBe('tp.ADD.20.t3.prompt');
    await voice.finishLine();
    // Then the line that was cut is said again, and the story goes on to its question.
    expect(voice.said.at(-1)).toBe('p.story.has');
    await voice.finishLine();
    expect(voice.said.at(-1)).toBe('p.story.beach-shells.take');
    await voice.finishLine();
    expect(voice.said.at(-1)).toBe('p.story.q.left');
    expect(open).toBe(false);
    await voice.finishLine();
    await told;
    expect(open).toBe(true);
  });

  it('a tap on the bubble during the prompt of a plain item opens it, as before', async () => {
    const voice = reportingAudio();
    let open = false;
    const told = tellItem(voice.audio, plain, () => false).then(() => {
      open = true;
    });
    await voice.tapBubble('tp.CNT.03.t1.prompt');
    await told;
    expect(open).toBe(true);
    // The prompt is not said a third time.
    expect(voice.said).toEqual(['tp.CNT.03.t1.prompt', 'tp.CNT.03.t1.prompt']);
  });

  it('a story whose prompt was replayed starts after the replay', async () => {
    const voice = reportingAudio();
    void tellItem(voice.audio, story, () => false);
    await voice.tapBubble('tp.ADD.20.t3.prompt');
    expect(voice.said).toEqual(['tp.ADD.20.t3.prompt', 'tp.ADD.20.t3.prompt']);
    await voice.finishLine();
    expect(voice.said.at(-1)).toBe('p.story.has');
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
