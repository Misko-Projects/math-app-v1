// What a child is told before an item takes input (02 §5.3: answer time runs from the end of the
// prompt's narration). Framework-free.

import type { AudioManager, PresentedItem } from '@number-island/shared';
import { type SpokenLineRequest, sayThrough, tellLines, whenQuiet } from '@number-island/ui';

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
 * Tells the item's opening lines and resolves when the telling is over, or at `stopped()` (the
 * item is gone). The caller starts the answer time then, never before.
 *
 * The prompt is said once: when the child taps the bubble while it plays, the bubble's own
 * replay takes its place. A story's lines are all told: a line something else speaks over is
 * said again when that is over, so no part of the story is lost and the answer time never runs
 * while the story is still being told.
 */
export async function tellItem(
  audio: AudioManager,
  item: Pick<PresentedItem, 'prompt' | 'widget'>,
  stopped: () => boolean,
): Promise<void> {
  const [prompt, ...story] = openingLines(item);
  if (!prompt) return;
  const how = await sayThrough(audio, prompt);
  if (story.length === 0 || stopped()) return;
  // The bubble's replay of the prompt is heard out before the story begins.
  if (how === 'cut') await whenQuiet(audio);
  await tellLines(audio, story, { stopped });
}
