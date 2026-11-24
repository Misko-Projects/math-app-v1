// What a child is told before an item takes input (02 §5.3: answer time runs from the end of the
// prompt's narration). Framework-free.

import type { AudioManager, PresentedItem } from '@number-island/shared';
import { type SpokenLineRequest, sayLines } from '@number-island/ui';

/**
 * The lines told when an item opens: its prompt and, for a story problem, the story itself (the
 * prompt there is only "Listen to the story"; the quantities and the question are the story's
 * lines).
 */
export function openingLines(item: Pick<PresentedItem, 'prompt' | 'widget'>): SpokenLineRequest[] {
  const prompt = { key: item.prompt.narration, vars: item.prompt.vars };
  return item.widget.format === 'story-problem'
    ? [prompt, ...item.widget.lines.map((l) => ({ key: l.key, vars: l.vars }))]
    : [prompt];
}

/**
 * Tells the item's opening lines in order and resolves when the telling is over: every line
 * said, or one cut off by something else speaking (the child tapped the bubble), or `stopped()`
 * (the item is gone). The caller starts the answer time then, never before.
 */
export async function tellItem(
  audio: AudioManager,
  item: Pick<PresentedItem, 'prompt' | 'widget'>,
  stopped: () => boolean,
): Promise<void> {
  await sayLines(audio, openingLines(item), { stopped });
}
