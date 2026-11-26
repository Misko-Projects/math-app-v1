import { resetContent } from '@number-island/engine';
import type { NumberLineJumpConfig } from '@number-island/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { shippedItems } from '../shippedItems';
import { hopperLabel, hopSpeech } from './NumberLineJumpWidget';

// Content walk (Refs #35): over every shipped number-line-jump item that asks where the hops
// land, a child's hops say the hop ("Hop 10"), never the landing, and the hopper's accessible
// name never carries it. Written against the compiled content, so a new template cannot bring
// the leak back.

/** A child's way to the target: the biggest allowed jump that does not pass it, hop by hop. */
function hopsTo(c: NumberLineJumpConfig): number[] {
  const target = c.target ?? c.start;
  const hops: number[] = [];
  let at = c.start;
  for (let guard = 0; at !== target && guard < 200; guard += 1) {
    const left = target - at;
    const fits = c.allowedJumps.filter(
      (j) => Math.sign(j) === Math.sign(left) && Math.abs(j) <= Math.abs(left),
    );
    const by = fits.sort((a, b) => Math.abs(b) - Math.abs(a))[0];
    if (by === undefined) break;
    hops.push(by);
    at += by;
  }
  return hops;
}

afterAll(() => resetContent());

describe('number-line-jump never says the landing it asks for', () => {
  const items = shippedItems('number-line-jump');
  const asking = items.filter((i) => (i.widget as NumberLineJumpConfig).thenAsk === 'landing');

  it('walks the shipped landing items', () => {
    expect(new Set(asking.map((i) => i.templateId)).size).toBeGreaterThan(10);
  });

  it('each hop says the hop, not where it lands; the hopper is not named by its place', () => {
    const bad = new Set<string>();
    for (const item of asking) {
      const c = item.widget as NumberLineJumpConfig;
      let at = c.start;
      const hops = hopsTo(c);
      expect(hops.length, item.templateId).toBeGreaterThan(0);
      for (const by of hops) {
        at += by;
        const said = hopSpeech(c, by, at);
        // What is said must not depend on the landing at all.
        if ('number' in said || JSON.stringify(said) !== JSON.stringify(hopSpeech(c, by, at + 1)))
          bad.add(`${item.templateId} hop`);
        // Another place off the start (the start itself is given, and named).
        const elsewhere = at + 1 === c.start ? at - 1 : at + 1;
        if (JSON.stringify(hopperLabel(c, at)) !== JSON.stringify(hopperLabel(c, elsewhere)))
          bad.add(`${item.templateId} hopper`);
      }
    }
    expect([...bad]).toEqual([]);
  });

  it('a hop on an item that gives its landing still says the number', () => {
    const given = items.find((i) => (i.widget as NumberLineJumpConfig).thenAsk === null);
    expect(given).toBeDefined();
    const c = given?.widget as NumberLineJumpConfig;
    expect(hopSpeech(c, 1, c.start + 1)).toEqual({ number: c.start + 1 });
    expect(hopperLabel(c, c.start + 1)).toEqual({ key: 'ui.nlj.hopper', vars: { n: c.start + 1 } });
  });
});
