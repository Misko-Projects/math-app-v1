// Several narration lines said one after the other (a story problem's lines). `AudioManager.say`
// resolves when its line ends and when it is cut off alike, so a plain chain would go on with
// the next line after something else spoke over the last one, and cut that off in turn. These
// helpers read how the line really ended from the manager's own events.

import type { AudioManager, NarrationKey } from '@number-island/shared';
import type { AudioEvent } from './AudioManager';

export interface SpokenLineRequest {
  key: NarrationKey;
  vars?: Record<string, string | number>;
}

interface Reporting {
  subscribe(listener: (event: AudioEvent) => void): () => void;
}

const reports = (audio: AudioManager): audio is AudioManager & Reporting =>
  typeof (audio as Partial<Reporting>).subscribe === 'function';

/**
 * Says one line. `done`: it was said to its end. `cut`: something else spoke over it, or it was
 * never heard at all (narration locked, no voice). A manager that reports no events (a test
 * double) is taken at its word: its promise resolving is the line said.
 */
export async function sayThrough(
  audio: AudioManager,
  line: SpokenLineRequest,
): Promise<'done' | 'cut'> {
  if (!reports(audio)) {
    await audio.say(line.key, line.vars).catch(() => {});
    return 'done';
  }
  // A line that is not queued starts next, whatever was being said: the first start is ours.
  let mine: number | null = null;
  let ended: 'done' | 'cancelled' | null = null;
  const off = audio.subscribe((e) => {
    if (e.type === 'line-start' && mine === null) mine = e.lineId;
    else if (e.type === 'line-end' && e.lineId === mine) ended = e.reason;
  });
  try {
    await audio.say(line.key, line.vars).catch(() => {});
  } finally {
    off();
  }
  return ended === 'done' ? 'done' : 'cut';
}

/**
 * Says `lines` in order and stops at the first one that is cut, or when `stopped()` says so
 * (asked before each line and after it). `onLine(i)` is told the line being said, then `null`
 * when the reading ends. Resolves `done` only when every line was said to its end.
 */
export async function sayLines(
  audio: AudioManager,
  lines: readonly SpokenLineRequest[],
  opts: { onLine?: (index: number | null) => void; stopped?: () => boolean } = {},
): Promise<'done' | 'cut'> {
  const stopped = () => opts.stopped?.() === true;
  for (const [i, line] of lines.entries()) {
    if (stopped()) return 'cut';
    opts.onLine?.(i);
    const how = await sayThrough(audio, line);
    // Stopped from outside: whoever stopped it owns what is shown now.
    if (stopped()) return 'cut';
    if (how === 'cut') {
      opts.onLine?.(null);
      return 'cut';
    }
  }
  opts.onLine?.(null);
  return 'done';
}
