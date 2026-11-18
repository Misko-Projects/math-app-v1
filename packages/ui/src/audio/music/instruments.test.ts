import { describe, expect, it } from 'vitest';
import {
  asAudioContext,
  FakeAudioContext,
  FakeGainNode,
  FakeScheduledSource,
  reachesThroughParams,
} from '../testing/fakeAudioContext';
import { INSTRUMENT_IDS, scheduleNote } from './instruments';

describe.each(INSTRUMENT_IDS)('instrument %s', (instrument) => {
  it('plays a note into the destination with a click-free envelope and frees it afterwards', () => {
    const fake = new FakeAudioContext({ state: 'running' });
    const dest = fake.createGain();
    const bag = scheduleNote(
      asAudioContext(fake),
      dest as unknown as AudioNode,
      { instrument, midi: 64, duration: 0.5, velocity: 0.8 },
      0.25,
    );
    const sources = fake.nodes.filter(
      (n): n is FakeScheduledSource => n instanceof FakeScheduledSource,
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(reachesThroughParams(s, dest)).toBe(true);
      expect(s.startedAt).toBe(0.25);
      expect(s.stoppedAt ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(bag.end);
    }
    expect(bag.end).toBeLessThan(0.25 + 3);
    for (const g of fake.nodes.filter((n): n is FakeGainNode => n instanceof FakeGainNode)) {
      if (g === dest || g.gain.events.length === 0) continue;
      expect(g.gain.events[0]).toMatchObject({ type: 'set', value: 0 });
    }
    fake.advanceTo(bag.end + 0.01);
    expect(bag.done).toBe(true);
    for (const n of fake.nodes) {
      if (n !== dest && n !== fake.destination) expect(n.disconnected).toBe(true);
    }
  });
});

describe('scheduleNote', () => {
  it('a silent note creates no sources', () => {
    const fake = new FakeAudioContext();
    const bag = scheduleNote(
      asAudioContext(fake),
      asAudioContext(fake).destination,
      { instrument: 'marimba', midi: 60, duration: 0.2, velocity: 0 },
      0,
    );
    expect(fake.oscillators()).toHaveLength(0);
    let done = false;
    bag.onDone(() => {
      done = true;
    });
    expect(done).toBe(true);
  });
});
