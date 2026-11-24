// @vitest-environment node
// The story of a story problem is told before the item takes input, so the answer time (which
// the play screen starts when `tellItem` resolves true) never includes it. Each line is said
// once: nothing is said again, and nothing waits for anything but the line being said.

import type { AudioManager, PresentedItem } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { openingLines, storyBeingTold, tellItem } from './tellItem';

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

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * A voice that reports its lines as the app's AudioManager does: a new line cuts the one being
 * said, each start and end is reported, and a line cancelled while it is still being prepared
 * ends without any report.
 */
function reportingAudio() {
  type Listener = (e: { type: string; lineId: number; reason?: string }) => void;
  const listeners = new Set<Listener>();
  const said: string[] = [];
  let nextId = 1;
  let current: { id: number; started: boolean; resolve: () => void } | null = null;
  const emit = (e: Parameters<Listener>[0]) => {
    for (const l of [...listeners]) l(e);
  };
  const end = (reason: 'done' | 'cancelled') => {
    const line = current;
    if (!line) return;
    // The real manager reports the end of a line only if the line had started.
    if (line.started || reason === 'done') emit({ type: 'line-end', lineId: line.id, reason });
    current = null;
    line.resolve();
  };
  /** Lines said from now on stay "preparing" (no start reported) until `startLine`. */
  let preparing = false;
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
        current = { id, started: !preparing, resolve };
        if (!preparing) emit({ type: 'line-start', lineId: id });
      });
    },
    /** As `AudioManager.stop()` and a suspended audio context: whatever is being said ends. */
    stop() {
      end('cancelled');
    },
  };
  return {
    audio: audio as unknown as AudioManager,
    said,
    finishLine: async () => {
      end('done');
      await settle();
    },
    stop: async () => {
      audio.stop();
      await settle();
    },
    holdPreparing: () => {
      preparing = true;
    },
    listeners,
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
    const voice = reportingAudio();
    let open: boolean | null = null;
    const told = tellItem(voice.audio, story, () => false).then((o) => {
      open = o;
    });
    for (const key of ['tp.ADD.20.t3.prompt', 'p.story.has', 'p.story.beach-shells.take']) {
      await settle();
      expect(voice.said.at(-1)).toBe(key);
      // Lines are still to come: no answer time is running yet.
      expect(open).toBeNull();
      await voice.finishLine();
    }
    expect(voice.said.at(-1)).toBe('p.story.q.left');
    expect(open).toBeNull();
    await voice.finishLine();
    await told;
    expect(open).toBe(true);
    expect(voice.said).toHaveLength(4);
    expect(voice.listeners.size).toBe(0);
  });

  it('nothing can speak over a story: its bubble takes no touch while it is told', () => {
    expect(storyBeingTold('prompt', story)).toBe(true);
    // Once the item takes input the bubble speaks again, and a plain item's bubble always does.
    expect(storyBeingTold('answer', story)).toBe(false);
    expect(storyBeingTold('feedback', story)).toBe(false);
    expect(storyBeingTold('prompt', plain)).toBe(false);
  });

  it('a line cut off without a report (the app goes to the background) never locks the item', async () => {
    const voice = reportingAudio();
    let open: boolean | null = null;
    const told = tellItem(voice.audio, story, () => false).then((o) => {
      open = o;
    });
    await voice.finishLine();
    await voice.finishLine();
    // The next line is still being prepared when the audio is suspended: the manager goes
    // quiet and reports nothing at all.
    voice.holdPreparing();
    await voice.finishLine();
    expect(voice.said.at(-1)).toBe('p.story.q.left');
    await voice.stop();
    await told;
    // The telling is over and the item takes input: nothing waited for a report, and no line
    // was said again.
    expect(open).toBe(true);
    expect(voice.said).toHaveLength(4);
    expect(voice.listeners.size).toBe(0);
  });

  it('Home during a story line: the line stops, nothing is said again, and the item does not open', async () => {
    const voice = reportingAudio();
    let left = false;
    let open: boolean | null = null;
    const told = tellItem(voice.audio, story, () => left).then((o) => {
      open = o;
    });
    await voice.finishLine();
    expect(voice.said).toEqual(['tp.ADD.20.t3.prompt', 'p.story.has']);
    // The child presses Home: the screen marks the item left and stops the narration.
    left = true;
    await voice.stop();
    await told;
    expect(open).toBe(false);
    expect(voice.said).toEqual(['tp.ADD.20.t3.prompt', 'p.story.has']);
    await settle();
    expect(voice.said).toHaveLength(2);
  });

  it('Home during the prompt: no story line is said and the item does not open', async () => {
    const voice = reportingAudio();
    let left = false;
    const told = tellItem(voice.audio, story, () => left);
    await settle();
    left = true;
    await voice.stop();
    expect(await told).toBe(false);
    expect(voice.said).toEqual(['tp.ADD.20.t3.prompt']);
  });

  it('a plain item opens when its prompt ends or is replayed from the bubble, as before', async () => {
    const voice = reportingAudio();
    const told = tellItem(voice.audio, plain, () => false);
    await settle();
    // The child taps the bubble: its replay takes the prompt's place.
    void (voice.audio as unknown as { say(key: string): Promise<void> }).say('tp.CNT.03.t1.prompt');
    expect(await told).toBe(true);
    expect(voice.said).toEqual(['tp.CNT.03.t1.prompt', 'tp.CNT.03.t1.prompt']);
  });
});
