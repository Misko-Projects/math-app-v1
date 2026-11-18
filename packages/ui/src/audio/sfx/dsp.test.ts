import { describe, expect, it } from 'vitest';
import {
  asAudioContext,
  FakeAudioContext,
  type FakeAudioParam,
  FakeBufferSource,
} from '../testing/fakeAudioContext';
import {
  hashInts,
  midiToHz,
  mulberry32,
  NodeBag,
  noiseBuffer,
  percussive,
  SILENT,
  sustained,
} from './dsp';

function param(): FakeAudioParam {
  const fake = new FakeAudioContext();
  return fake.createGain().gain;
}

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 1000 }, () => c())).not.toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('hashInts is order-sensitive', () => {
    expect(hashInts(1, 2)).toBe(hashInts(1, 2));
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1));
  });
});

describe('pitch', () => {
  it('maps MIDI to hertz', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  });
});

describe('envelopes', () => {
  it('percussive: starts silent, ramps linearly to the peak, decays to SILENT', () => {
    const p = param();
    const end = percussive(asParam(p), 1, { attack: 0.005, peak: 0.4, decay: 0.3 });
    expect(end).toBeCloseTo(1.305);
    expect(p.events).toEqual([
      { type: 'set', value: 0, time: 1 },
      { type: 'linear', value: 0.4, time: 1.005 },
      { type: 'exp', value: SILENT, time: 1.305 },
    ]);
  });

  it('sustained: holds the sustain level until the gate ends, then releases', () => {
    const p = param();
    const end = sustained(asParam(p), 0, {
      attack: 0.1,
      peak: 0.5,
      decay: 0.2,
      sustain: 0.5,
      gate: 1,
      release: 0.4,
    });
    expect(end).toBeCloseTo(1.4);
    expect(p.events.map((e) => e.type)).toEqual(['set', 'linear', 'exp', 'set', 'exp']);
    expect(p.lastTarget()).toBe(SILENT);
  });

  it('sustained: a short gate skips the sustain stage without going backwards in time', () => {
    const p = param();
    sustained(asParam(p), 0, {
      attack: 0.1,
      peak: 0.5,
      decay: 0.5,
      sustain: 0.5,
      gate: 0.05,
      release: 0.2,
    });
    const times = p.events.map((e) => e.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('noiseBuffer', () => {
  it('is created once per context and is deterministic', () => {
    const a = new FakeAudioContext({ sampleRate: 8000 });
    const b = new FakeAudioContext({ sampleRate: 8000 });
    const bufA = noiseBuffer(asAudioContext(a));
    expect(noiseBuffer(asAudioContext(a))).toBe(bufA);
    const bufB = noiseBuffer(asAudioContext(b));
    expect(bufB).not.toBe(bufA);
    expect(Array.from(bufB.getChannelData(0).slice(0, 64))).toEqual(
      Array.from(bufA.getChannelData(0).slice(0, 64)),
    );
    const data = bufA.getChannelData(0);
    expect(Math.max(...data)).toBeLessThanOrEqual(1);
    expect(Math.min(...data)).toBeGreaterThanOrEqual(-1);
  });
});

describe('NodeBag', () => {
  it('disconnects every node once the last source has ended', () => {
    const fake = new FakeAudioContext({ state: 'running' });
    const ctx = asAudioContext(fake);
    const bag = new NodeBag(ctx);
    const g = bag.gain(0.5);
    g.connect(ctx.destination);
    bag.osc('sine', 440, 0, 0.5).connect(g);
    bag.noise(0.1, 0.8, mulberry32(1)).connect(g);
    let done = 0;
    bag.onDone(() => {
      done += 1;
    });
    expect(bag.end).toBe(0.8);
    fake.advanceTo(0.6);
    expect(done).toBe(0);
    expect(fake.nodes.filter((n) => n.disconnected && n.kind !== 'destination')).toHaveLength(0);
    fake.advanceTo(0.9);
    expect(done).toBe(1);
    for (const n of fake.nodes) if (n.kind !== 'destination') expect(n.disconnected).toBe(true);
    expect(fake.bufferSources()[0]).toBeInstanceOf(FakeBufferSource);
  });

  it('stopAt only shortens sources and updates the end time', () => {
    const fake = new FakeAudioContext({ state: 'running' });
    const bag = new NodeBag(asAudioContext(fake));
    bag.osc('sine', 440, 0, 0.3);
    bag.osc('sine', 660, 0, 1);
    bag.stopAt(0.5);
    const [a, b] = fake.oscillators();
    expect(a?.stoppedAt).toBe(0.3);
    expect(b?.stoppedAt).toBe(0.5);
    expect(bag.end).toBe(0.5);
  });

  it('a bag with no sources is done immediately', () => {
    const bag = new NodeBag(asAudioContext(new FakeAudioContext()));
    let done = false;
    bag.onDone(() => {
      done = true;
    });
    expect(done).toBe(true);
  });
});

function asParam(p: FakeAudioParam): AudioParam {
  return p as unknown as AudioParam;
}
