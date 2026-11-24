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
  readonly speaking: boolean;
}

const reports = (audio: AudioManager): audio is AudioManager & Reporting =>
  typeof (audio as Partial<Reporting>).subscribe === 'function';

/**
 * How a line ended. `done`: it was said to its end. `cut`: something else spoke over it.
 * `unheard`: it was never said and nothing else is being said either (narration locked, no
 * voice).
 */
export type SaidHow = 'done' | 'cut' | 'unheard';

/**
 * Says one line and reports how it ended. A manager that reports no events (a test double) is
 * taken at its word: its promise resolving is the line said.
 */
export async function sayThrough(audio: AudioManager, line: SpokenLineRequest): Promise<SaidHow> {
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
  if (ended === 'done') return 'done';
  // Cut while it was being said, or pushed aside before it began: someone else is speaking.
  return ended === 'cancelled' || audio.speaking ? 'cut' : 'unheard';
}

/** Resolves when nothing is being said (at once for a manager that reports nothing). */
export function whenQuiet(audio: AudioManager): Promise<void> {
  if (!reports(audio) || !audio.speaking) return Promise.resolve();
  return new Promise((resolve) => {
    const off = audio.subscribe((e) => {
      if (e.type !== 'line-end') return;
      // The manager moves on (to a queued line, or to silence) right after it reports the end.
      void Promise.resolve().then(() => {
        if (audio.speaking) return;
        off();
        resolve();
      });
    });
  });
}

/**
 * Says `lines` in order and stops at the first one that is not said to its end, or when
 * `stopped()` says so (asked before each line and after it). `onLine(i)` is told the line being
 * said, then `null` when the reading ends. Resolves `done` only when every line was said.
 * For a reading the child may interrupt (a replay on touch).
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
    if (how !== 'done') {
      opts.onLine?.(null);
      return 'cut';
    }
  }
  opts.onLine?.(null);
  return 'done';
}

/**
 * Tells `lines` in order, all of them: a line something else spoke over is said again once that
 * is over, so nothing of the telling is lost. Only `stopped()` ends it early. A line that cannot
 * be heard at all (narration locked, no voice) is passed over.
 * For what must be heard before a child can answer (an item's prompt and story).
 */
export async function tellLines(
  audio: AudioManager,
  lines: readonly SpokenLineRequest[],
  opts: { stopped?: () => boolean } = {},
): Promise<void> {
  const stopped = () => opts.stopped?.() === true;
  for (const line of lines) {
    for (;;) {
      if (stopped()) return;
      const how = await sayThrough(audio, line);
      if (stopped()) return;
      if (how !== 'cut') break;
      await whenQuiet(audio);
    }
  }
}
