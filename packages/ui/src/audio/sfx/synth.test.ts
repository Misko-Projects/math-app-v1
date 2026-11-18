import { describe, expect, it } from 'vitest';
import {
  asAudioContext,
  FakeAudioContext,
  type FakeAudioNode,
  FakeGainNode,
  FakeScheduledSource,
} from '../testing/fakeAudioContext';
import { isKnownSfx, SFX_CATALOG, SFX_IDS } from './catalog';
import { playSfx, SFX_STOP_FADE_SEC } from './synth';

function setup() {
  const fake = new FakeAudioContext({ state: 'running' });
  const dest = fake.createGain();
  dest.connect(fake.destination);
  return { fake, ctx: asAudioContext(fake), dest, destNode: dest as unknown as AudioNode };
}

function sourcesOf(fake: FakeAudioContext): FakeScheduledSource[] {
  return fake.nodes.filter((n): n is FakeScheduledSource => n instanceof FakeScheduledSource);
}

/** Nodes the synth created (everything but the context destination and the test's bus). */
function synthNodes(fake: FakeAudioContext, dest: FakeAudioNode): FakeAudioNode[] {
  return fake.nodes.filter((n) => n !== dest && n !== fake.destination);
}

/** The voice's master gain: the synth node connected straight to the destination. */
function masterOf(fake: FakeAudioContext, dest: FakeAudioNode): FakeGainNode {
  const master = synthNodes(fake, dest).find((n) => n.outputs.has(dest));
  if (!(master instanceof FakeGainNode)) throw new Error('no master gain');
  return master;
}

describe('SFX catalog', () => {
  it('lists every id with a label and a use', () => {
    expect(Object.keys(SFX_CATALOG).sort()).toEqual([...SFX_IDS].sort());
    for (const id of SFX_IDS) {
      expect(isKnownSfx(id)).toBe(true);
      expect(SFX_CATALOG[id].label.length).toBeGreaterThan(0);
      expect(SFX_CATALOG[id].use.length).toBeGreaterThan(0);
    }
    expect(isKnownSfx('buzzer')).toBe(false);
  });
});

describe.each(SFX_IDS)('playSfx(%s)', (id) => {
  it('schedules sources that reach the destination and are freed by endTime', () => {
    const { fake, ctx, dest, destNode } = setup();
    const when = 0.5;
    const voice = playSfx(ctx, destNode, id, when);
    const sources = sourcesOf(fake);
    expect(sources.length).toBeGreaterThan(0);
    expect(voice.endTime).toBeGreaterThan(when);
    expect(voice.endTime - when).toBeLessThan(2);
    for (const s of sources) {
      expect(s.reaches(dest)).toBe(true);
      expect(s.startedAt).toBeGreaterThanOrEqual(when);
      expect(s.stoppedAt).not.toBeNull();
      expect(s.stoppedAt ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(voice.endTime + 1e-9);
    }
    fake.advanceTo(voice.endTime + 0.001);
    for (const s of sources) expect(s.ended).toBe(true);
    for (const n of synthNodes(fake, dest)) expect(n.disconnected).toBe(true);
    expect(dest.disconnected).toBe(false);
  });

  it('starts every envelope from silence with a soft attack and never ramps to zero exponentially', () => {
    const { fake, ctx, dest, destNode } = setup();
    playSfx(ctx, destNode, id, 0.2);
    const gains = synthNodes(fake, dest).filter(
      (n): n is FakeGainNode => n instanceof FakeGainNode,
    );
    const enveloped = gains.filter((g) => g.gain.events.length > 0);
    expect(enveloped.length).toBeGreaterThan(0);
    for (const g of enveloped) {
      const [first, second] = g.gain.events;
      expect(first).toMatchObject({ type: 'set', value: 0 });
      expect(second?.type).toBe('linear');
      expect((second?.time ?? 0) - (first?.time ?? 0)).toBeGreaterThanOrEqual(0.004 - 1e-9);
      for (const e of g.gain.events) if (e.type === 'exp') expect(e.value).toBeGreaterThan(0);
      expect(g.gain.lastTarget()).toBeLessThanOrEqual(0.001);
    }
  });

  it('stop() fades the voice out over ~30 ms, then stops every source', () => {
    const { fake, ctx, dest, destNode } = setup();
    const voice = playSfx(ctx, destNode, id, 0);
    const at = 0.05;
    voice.stop(at);
    const master = masterOf(fake, dest);
    expect(master.gain.events).toEqual([
      { type: 'cancel', time: at },
      { type: 'set', value: 1, time: at },
      { type: 'linear', value: 0, time: at + SFX_STOP_FADE_SEC },
    ]);
    for (const s of sourcesOf(fake)) {
      expect(s.stoppedAt ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        at + SFX_STOP_FADE_SEC + 0.01,
      );
    }
    expect(voice.endTime).toBeLessThanOrEqual(at + SFX_STOP_FADE_SEC + 0.01);
    fake.advanceTo(at + 0.1);
    for (const n of synthNodes(fake, dest)) expect(n.disconnected).toBe(true);
    voice.stop(at + 0.02); // a second stop is harmless
  });

  it('is deterministic', () => {
    const describeGraph = () => {
      const { fake, ctx, destNode } = setup();
      playSfx(ctx, destNode, id, 0.1);
      return fake.nodes.map((n) => ({
        kind: n.kind,
        freq: 'frequency' in n ? (n.frequency as { events: unknown[] }).events : null,
        gain: n instanceof FakeGainNode ? n.gain.events : null,
        start: n instanceof FakeScheduledSource ? [n.startedAt, n.stoppedAt] : null,
        offset: 'offset' in n && typeof n.offset === 'number' ? n.offset : null,
      }));
    };
    expect(describeGraph()).toEqual(describeGraph());
  });
});

describe('playSfx', () => {
  it('stop() after the natural end changes nothing', () => {
    const { fake, ctx, dest, destNode } = setup();
    const voice = playSfx(ctx, destNode, 'pop', 0);
    const end = voice.endTime;
    voice.stop(end + 1);
    expect(masterOf(fake, dest).gain.events).toEqual([]);
    expect(voice.endTime).toBe(end);
  });

  it('stop() before the sound starts silences it', () => {
    const { fake, ctx, dest, destNode } = setup();
    const voice = playSfx(ctx, destNode, 'chime', 1);
    voice.stop(0.5);
    fake.advanceTo(2);
    for (const n of synthNodes(fake, dest)) expect(n.disconnected).toBe(true);
  });
});
