import { describe, expect, it } from 'vitest';
import { createKeyPressGate } from './keyPress';

describe('createKeyPressGate (one action per key press)', () => {
  it('lets every action through while no key is down (pointer, touch)', () => {
    const g = createKeyPressGate();
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
