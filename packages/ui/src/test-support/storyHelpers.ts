// Helpers for story play functions (not exported from the package).
import type { AudioManager } from '@number-island/shared';
import { expect, fn } from 'storybook/test';
import { type AgeMode, MIN_TARGET_PX, TARGET_GAP_PX } from '../tokens/tokens';

/** An AudioManager made of spies, for asserting spoken labels. */
export function spyAudio() {
  return {
    unlock: fn(async () => {}),
    say: fn(async () => {}),
    sayPhrases: fn(async () => {}),
    sayText: fn(async () => {}),
    sfx: fn(),
    music: fn(),
    stop: fn(),
    setVolumes: fn(),
  } satisfies AudioManager;
}

export type SpyAudio = ReturnType<typeof spyAudio>;

export function clearSpies(audio: SpyAudio) {
  for (const spy of Object.values(audio)) spy.mockClear();
}

/** 06 §4: every hit target is at least the age mode's minimum in both dimensions. */
export async function expectTargetSize(el: Element, ageMode: AgeMode) {
  // Measure the settled size, not mid-entrance (pop-in starts small). Idle loops never finish.
  await Promise.all(
    el
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
      .map((a) => a.finished.catch(() => undefined)),
  );
  const r = el.getBoundingClientRect();
  const min = MIN_TARGET_PX[ageMode];
  await expect(Math.round(r.width), `${describe(el)} width`).toBeGreaterThanOrEqual(min);
  await expect(Math.round(r.height), `${describe(el)} height`).toBeGreaterThanOrEqual(min);
}

/** 06 §4: neighbouring targets are at least 12 px apart (edge to edge). */
export async function expectTargetGaps(els: Element[]) {
  const rects = els.map((el) => el.getBoundingClientRect());
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i] as DOMRect;
      const b = rects[j] as DOMRect;
      const dx = Math.max(b.left - a.right, a.left - b.right);
      const dy = Math.max(b.top - a.bottom, a.top - b.bottom);
      const gap = Math.max(dx, dy);
      await expect(gap, `gap between targets ${i} and ${j}`).toBeGreaterThanOrEqual(
        TARGET_GAP_PX - 0.5,
      );
    }
  }
}

function describe(el: Element) {
  return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName;
}

/** Waits until an element's transitions and finite animations have finished. */
export async function waitForSettled(el: Element) {
  await Promise.all(
    el
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
      .map((a) => a.finished.catch(() => undefined)),
  );
}

export function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

let pointerSeq = 10;

/**
 * Starts a touch drag of `el` towards a point and holds it there. Call the returned function to
 * lift the finger. Lets a test change the page mid-drag.
 */
export async function touchDragAndHold(el: Element, to: { x: number; y: number }, steps = 8) {
  const from = center(el);
  const pointerId = ++pointerSeq;
  const init = (x: number, y: number, buttons: number): PointerEventInit => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
  });
  el.dispatchEvent(new PointerEvent('pointerdown', init(from.x, from.y, 1)));
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    window.dispatchEvent(new PointerEvent('pointermove', init(x, y, 1)));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  return async () => {
    window.dispatchEvent(new PointerEvent('pointerup', init(to.x, to.y, 0)));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  };
}

/**
 * Drags `el` to a point with a real PointerEvent sequence: `mouse` (button 0) or `touch`
 * (touch emulation: pointerType "touch", as a tablet browser sends). Moves in steps like a finger.
 */
export async function pointerDrag(
  el: Element,
  to: { x: number; y: number },
  pointerType: 'mouse' | 'touch' | 'pen' = 'mouse',
  steps = 8,
  /** Pause between pressing and moving (a slow frame on a busy device). */
  pauseAfterDownMs = 0,
) {
  const from = center(el);
  const pointerId = pointerType === 'mouse' ? 1 : ++pointerSeq;
  const init = (x: number, y: number, buttons: number): PointerEventInit => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
    pointerType,
    isPrimary: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    width: pointerType === 'touch' ? 24 : 1,
    height: pointerType === 'touch' ? 24 : 1,
    pressure: buttons ? 0.5 : 0,
  });
  el.dispatchEvent(new PointerEvent('pointerdown', init(from.x, from.y, 1)));
  if (pauseAfterDownMs > 0) await new Promise((r) => setTimeout(r, pauseAfterDownMs));
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    const over = document.elementFromPoint(x, y) ?? el;
    over.dispatchEvent(new PointerEvent('pointermove', init(x, y, 1)));
    await nextFrame();
  }
  const over = document.elementFromPoint(to.x, to.y) ?? el;
  over.dispatchEvent(new PointerEvent('pointerup', init(to.x, to.y, 0)));
  await nextFrame();
}
