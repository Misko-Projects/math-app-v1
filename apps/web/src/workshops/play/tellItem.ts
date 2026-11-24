// What a child is told before an item takes input (02 §5.3: answer time runs from the end of the
// prompt's narration). Framework-free.

import type { AudioManager, PresentedItem } from '@number-island/shared';
import { type SpokenLineRequest, sayLines, sayThrough } from '@number-island/ui';

type Told = Pick<PresentedItem, 'prompt' | 'widget'>;

/**
 * The lines told when an item opens: its prompt and, for a story problem, the story itself (the
 * prompt there is only "Listen to the story"; the quantities and the question are the story's
 * lines).
 */
export function openingLines(item: Told): SpokenLineRequest[] {
  const prompt = { key: item.prompt.narration, vars: item.prompt.vars };
  return item.widget.format === 'story-problem'
    ? [prompt, ...item.widget.lines.map((l) => ({ key: l.key, vars: l.vars }))]
    : [prompt];
}

/**
 * Whether a story problem's opening is being told. The play screen's prompt bubble takes no
 * touch then, so nothing speaks over the story: there is no interruption to recover from.
 */
export function storyBeingTold(phase: string, item: Pick<PresentedItem, 'widget'>): boolean {
  return phase === 'prompt' && item.widget.format === 'story-problem';
}

/**
 * Tells the item's opening lines, each once, and resolves when the telling is over: every line
 * said, or a line cut off (the app went to the background, narration was stopped), or
 * `stopped()` (the child left, the item is gone). It never says a line again and never waits
 * for anything but the line it is saying, so an item cannot stay locked behind it.
 *
 * Resolves whether the item may open for answers: false once `stopped()`. The caller starts the
 * answer time on true, never before and never for an item that was left.
 */
export async function tellItem(
  audio: AudioManager,
  item: Told,
  stopped: () => boolean,
): Promise<boolean> {
  const [prompt, ...story] = openingLines(item);
  if (prompt) await sayThrough(audio, prompt);
  if (stopped()) return false;
  await sayLines(audio, story, { stopped });
  return !stopped();
}
