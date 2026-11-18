// What a static narration segment says aloud (03 §8.4). These rules mirror the A01 AudioManager's
// planner (packages/ui/src/audio/narration.ts: `isSpoken`, `speakSymbols`), which tools/narration
// may not import (02 §2). scripts/narration-playback.test.ts plans every compiled line with A01's
// planner against a rendered manifest, so any drift between the two shows up in CI.

/**
 * True when a static segment has something to say: words, numbers, or a math symbol or blank
 * that 03 §8.4 reads aloud. A `?` is a blank when it stands alone (after a space, or with nothing
 * spoken before it in the line); it is punctuation when it directly ends a word or a slot.
 */
export function isSpoken(text: string, followsContent = true): boolean {
  if (/[\p{L}\p{N}+−×÷=<>_□]/u.test(text)) return true;
  if (/\s\?/.test(text) || /(^|\s)-(\s|$)/.test(text)) return true;
  return !followsContent && /^\s*\?/.test(text);
}

const SYMBOLS: [RegExp, string][] = [
  [/\s*\+\s*/g, ' plus '],
  [/\s+[−-]\s+/g, ' minus '],
  [/\s*×\s*/g, ' times '],
  [/\s*÷\s*/g, ' divided by '],
  [/\s*=\s*/g, ' equals '],
  [/\s*<\s*/g, ' is less than '],
  [/\s*>\s*/g, ' is greater than '],
  [/(^|\s)(?:\?|_{1,}|□)(?=\s|$|[.,!])/g, '$1what number'],
];

/** 03 §8.4 spoken symbols, for lines without an authored `say`. */
export function speakSymbols(text: string): string {
  return SYMBOLS.reduce((t, [re, word]) => t.replace(re, word), text);
}

/** Collapses whitespace and pulls punctuation onto the preceding word. */
export function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}
