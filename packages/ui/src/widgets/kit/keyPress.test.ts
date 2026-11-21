import { describe, expect, it } from 'vitest';
import { createKeyPressGate } from './keyPress';

describe('createKeyPressGate (one action per key press)', () => {
  it('lets every action through while no key is down (pointer, touch)', () => {
    const g = createKeyPressGate();
    expect(g.take()).toBe(true);
    g.pointerDown();
    expect(g.take()).toBe(true);
    expect(g.take()).toBe(true);
  });

  it('lets one action through per Enter or Space press, until the key is released', () => {
    for (const key of ['Enter', ' ']) {
      const g = createKeyPressGate();
      g.keyDown(key);
      expect(g.take()).toBe(true);
      // The held key repeats: its later activations do nothing.
      g.keyDown(key);
      expect(g.take()).toBe(false);
      expect(g.take()).toBe(false);
      g.keyUp(key);
      g.keyDown(key);
      expect(g.take()).toBe(true);
    }
  });

  it('a pointer press acts while a key is held, and the key stays used afterwards', () => {
    const g = createKeyPressGate();
    g.keyDown('Enter');
    expect(g.take()).toBe(true);
    // A click or a tap on the other button while Enter is still down.
    g.pointerDown();
    expect(g.take()).toBe(true);
    // Enter repeats again: still the same press.
    g.keyDown('Enter');
    expect(g.take()).toBe(false);
  });

  it('a pointer click acts although the held key repeated between its press and its click', () => {
    const g = createKeyPressGate();
    g.keyDown('Enter');
    g.clickStart(0);
    expect(g.take()).toBe(true);
    g.clickEnd();
    // The mouse goes down, Enter repeats (about every 30 ms), then the mouse's click arrives.
    g.pointerDown();
    g.keyDown('Enter');
    g.clickStart(1);
    expect(g.take()).toBe(true);
    g.clickEnd();
    // The repeat's own click (detail 0) is still the press that already acted.
    g.keyDown('Enter');
    g.clickStart(0);
    expect(g.take()).toBe(false);
    g.clickEnd();
  });

  it('keeps Enter and Space apart: releasing one does not free the other', () => {
    const g = createKeyPressGate();
    g.keyDown('Enter');
    expect(g.take()).toBe(true);
    // Space goes down and up while Enter is held. Its own press may act once (on release).
    g.keyDown(' ');
    g.keyUp(' ');
    expect(g.take()).toBe(true);
    // Enter's repeats are still the press that already acted.
    g.keyDown('Enter');
    expect(g.take()).toBe(false);
    g.keyUp('Enter');
    g.keyDown('Enter');
    expect(g.take()).toBe(true);
  });

  it('ignores other keys and recovers when the page loses the focus', () => {
    const g = createKeyPressGate();
    g.keyDown('ArrowLeft');
    expect(g.take()).toBe(true);
    expect(g.take()).toBe(true);
    g.keyDown('Enter');
    expect(g.take()).toBe(true);
    g.keyUp('ArrowLeft');
    expect(g.take()).toBe(false);
    g.reset();
    expect(g.take()).toBe(true);
  });
});
