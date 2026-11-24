import type { AudioManager } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import type { AudioEvent } from './AudioManager';
import { sayLines, sayThrough, tellLines, whenQuiet } from './sayLines';

/**
 * A manager that reports its lines as the real one does: a line starts when it is said, and a
 * new line cuts the one being said (its promise resolves either way).
 */
function reportingAudio() {
  const listeners = new Set<(e: AudioEvent) => void>();
  const said: string[] = [];
  let nextId = 1;
  let current: { id: number; resolve: () => void } | null = null;
  const emit = (e: AudioEvent) => {
    for (const l of [...listeners]) l(e);
  };
  const end = (reason: 'done' | 'cancelled') => {
    const line = current;
    if (!line) return;
    // As the real manager: the end is reported first, then the manager moves on.
    emit({ type: 'line-end', lineId: line.id, reason });
    current = null;
    line.resolve();
  };
  const audio = {
    get speaking() {
      return current !== null;
    },
    subscribe(listener: (e: AudioEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    say(key: string) {
      end('cancelled');
      said.push(key);
      const id = nextId++;
      return new Promise<void>((resolve) => {
        current = { id, resolve };
        emit({
          type: 'line-start',
          lineId: id,
          key,
          text: key,
          voice: 'narrator',
          via: 'clips',
          clips: [],
        });
      });
    },
  };
  return {
    audio: audio as unknown as AudioManager,
    said,
    /** The line being said ends. */
    finish: () => end('done'),
    /** Something else speaks (the prompt bubble): it cuts the line being said. */
    interrupt: (key: string) => void audio.say(key),
    listeners,
  };
}

const lines = [{ key: 'p.story.has' }, { key: 'p.story.take' }, { key: 'p.story.q.left' }];
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('lines said one after the other', () => {
  it('says every line to its end, in order, marking the one being said', async () => {
    const a = reportingAudio();
    const marked: (number | null)[] = [];
    const reading = sayLines(a.audio, lines, { onLine: (i) => marked.push(i) });
    for (let i = 0; i < lines.length; i += 1) {
      await settle();
      expect(a.said).toHaveLength(i + 1);
      a.finish();
    }
    expect(await reading).toBe('done');
    expect(a.said).toEqual(['p.story.has', 'p.story.take', 'p.story.q.left']);
    expect(marked).toEqual([0, 1, 2, null]);
    expect(a.listeners.size).toBe(0);
  });

  it('stops when something else speaks over a line: the other line is never cut in turn', async () => {
    const a = reportingAudio();
    const marked: (number | null)[] = [];
    const reading = sayLines(a.audio, lines, { onLine: (i) => marked.push(i) });
    await settle();
    a.interrupt('tp.ADD.20.t3.prompt');
    expect(await reading).toBe('cut');
    await settle();
    // The story did not go on: the prompt's replay is the last thing said, still being said.
    expect(a.said).toEqual(['p.story.has', 'tp.ADD.20.t3.prompt']);
    expect(marked).toEqual([0, null]);
  });

  it('stops when its owner says so, and leaves what is shown to the owner', async () => {
    const a = reportingAudio();
    const marked: (number | null)[] = [];
    let stop = false;
    const reading = sayLines(a.audio, lines, {
      onLine: (i) => marked.push(i),
      stopped: () => stop,
    });
    await settle();
    stop = true;
    a.finish();
    expect(await reading).toBe('cut');
    expect(a.said).toEqual(['p.story.has']);
    expect(marked).toEqual([0]);
  });

  it('a line that is never heard (narration locked) is unheard, and a reading stops there', async () => {
    const silent = {
      speaking: false,
      subscribe: () => () => {},
      say: async () => {},
    } as unknown as AudioManager;
    expect(await sayThrough(silent, { key: 'p.story.has' })).toBe('unheard');
    expect(await sayLines(silent, lines)).toBe('cut');
    // A telling passes over what cannot be heard and ends: it never waits for a voice.
    await tellLines(silent, lines);
  });

  it('a telling loses nothing: a line spoken over is said again when that is over', async () => {
    const a = reportingAudio();
    let told = false;
    const telling = tellLines(a.audio, lines).then(() => {
      told = true;
    });
    await settle();
    // The child taps the prompt bubble while the first line is being said.
    a.interrupt('tp.ADD.20.t3.prompt');
    await settle();
    // The telling waits for the bubble's line; it does not cut it.
    expect(a.said).toEqual(['p.story.has', 'tp.ADD.20.t3.prompt']);
    a.finish();
    await settle();
    // Then the line that was cut is said again, and the telling goes on to its end.
    expect(a.said).toEqual(['p.story.has', 'tp.ADD.20.t3.prompt', 'p.story.has']);
    for (const next of ['p.story.take', 'p.story.q.left']) {
      expect(told).toBe(false);
      a.finish();
      await settle();
      expect(a.said.at(-1)).toBe(next);
    }
    expect(told).toBe(false);
    a.finish();
    await telling;
    expect(told).toBe(true);
    expect(a.listeners.size).toBe(0);
  });

  it('a telling ends at once when its owner says so', async () => {
    const a = reportingAudio();
    let stop = false;
    const telling = tellLines(a.audio, lines, { stopped: () => stop });
    await settle();
    stop = true;
    a.interrupt('tp.ADD.20.t3.prompt');
    await telling;
    expect(a.said).toEqual(['p.story.has', 'tp.ADD.20.t3.prompt']);
  });

  it('quiet is when nothing is being said', async () => {
    const a = reportingAudio();
    await whenQuiet(a.audio);
    a.interrupt('tp.ADD.20.t3.prompt');
    let quiet = false;
    const waiting = whenQuiet(a.audio).then(() => {
      quiet = true;
    });
    await settle();
    expect(quiet).toBe(false);
    a.finish();
    await waiting;
    expect(quiet).toBe(true);
  });

  it('a manager that reports nothing is taken at its word', async () => {
    const said: string[] = [];
    const plain = {
      say: async (key: string) => {
        said.push(key);
      },
    } as unknown as AudioManager;
    expect(await sayLines(plain, lines)).toBe('done');
    expect(said).toHaveLength(3);
  });
});
