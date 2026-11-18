import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asAudioContext,
  FakeAudioContext,
  FakeGainNode,
  FakeScheduledSource,
  reachesThroughParams,
} from '../testing/fakeAudioContext';
import { scheduleNote } from './instruments';
import { MusicPlayer, renderTrack, type TimerApi } from './player';
import { trackEvents, trackInfo } from './sequencer';
import type { InstrumentId } from './tracks';

/** A TimerApi the test drives by hand. */
class ManualTimers implements TimerApi {
  readonly #fns = new Map<number, () => void>();
  #next = 1;
  setInterval(fn: () => void): unknown {
    const id = this.#next++;
    this.#fns.set(id, fn);
    return id;
  }
  clearInterval(handle: unknown): void {
    this.#fns.delete(handle as number);
  }
  get active(): number {
    return this.#fns.size;
  }
  fire(): void {
    for (const fn of [...this.#fns.values()]) fn();
  }
}

/** How many sources one note of `instrument` creates. */
function sourcesPerNote(instrument: InstrumentId): number {
  const fake = new FakeAudioContext();
  scheduleNote(
    asAudioContext(fake),
    asAudioContext(fake).destination,
    { instrument, midi: 60, duration: 0.2, velocity: 0.5 },
    0,
  );
  return fake.nodes.filter((n) => n instanceof FakeScheduledSource).length;
}

const LOOKAHEAD = 0.2;
const CROSSFADE = 1.5;

function setup() {
  const fake = new FakeAudioContext({ state: 'running' });
  const dest = fake.createGain();
  dest.connect(fake.destination);
  const timers = new ManualTimers();
  const player = new MusicPlayer(asAudioContext(fake), dest as unknown as AudioNode, {
    timers,
    lookaheadSec: LOOKAHEAD,
    intervalMs: 25,
    crossfadeSec: CROSSFADE,
  });
  /** Advance audio time in 25 ms ticks, firing the scheduler each tick. */
  const run = (seconds: number) => {
    const end = fake.currentTime + seconds;
    while (fake.currentTime < end - 1e-9) {
      fake.advanceTo(Math.min(end, fake.currentTime + 0.025));
      timers.fire();
    }
  };
  /** Each track run's fade gain: the gains connected straight to the destination, in order. */
  const fades = () =>
    fake.nodes.filter((n): n is FakeGainNode => n instanceof FakeGainNode && n.outputs.has(dest));
  const sources = () =>
    fake.nodes.filter((n): n is FakeScheduledSource => n instanceof FakeScheduledSource);
  return { fake, dest, timers, player, run, fades, sources };
}

describe('MusicPlayer', () => {
  it('fades a track in and keeps scheduling notes just ahead of the clock', () => {
    const { fake, dest, timers, player, run, fades, sources } = setup();
    player.play('island');
    expect(player.current).toBe('island');
    expect(timers.active).toBe(1);
    const [fade] = fades();
    expect(fade?.gain.events[0]).toMatchObject({ type: 'cancel', time: 0 });
    expect(fade?.gain.events[1]).toMatchObject({ type: 'set', value: 0, time: 0 });
    expect(fade?.gain.events.at(-1)).toMatchObject({ type: 'linear', value: 1 });
    expect(fade?.gain.events.at(-1)?.time).toBeCloseTo(CROSSFADE);

    run(6);
    const all = sources();
    expect(all.length).toBeGreaterThan(20);
    for (const s of all) {
      expect(s.startedAt ?? 0).toBeLessThanOrEqual(fake.currentTime + LOOKAHEAD + 0.05);
    }
    for (const s of all.filter((x) => !x.ended)) expect(reachesThroughParams(s, dest)).toBe(true);
    // A note frees its nodes once all its partials have ended; long-finished notes are freed.
    const longDone = all.filter((s) => s.ended && s.endTime() < fake.currentTime - 2);
    expect(longDone.length).toBeGreaterThan(0);
    for (const s of longDone) expect(s.disconnected).toBe(true);
  });

  it('schedules every note of the track exactly once, at its time', () => {
    const { player, run, sources } = setup();
    player.play('workshop.town');
    run(5);
    const start = 0.05; // the player starts a track a moment after play()
    const cutoff = 4.5; // everything before this is certainly scheduled by now
    const events = trackEvents(
      'workshop.town',
      0,
      Math.ceil(cutoff / trackInfo('workshop.town').stepSec),
    ).filter((e) => start + e.time < cutoff);
    const expectedSources = events.reduce((n, e) => n + sourcesPerNote(e.instrument), 0);
    const started = sources().filter((s) => (s.startedAt ?? 0) < cutoff);
    expect(started.length).toBe(expectedSources);
    const round = (t: number) => Math.round(t * 1e6);
    expect(new Set(started.map((s) => round(s.startedAt ?? 0)))).toEqual(
      new Set(events.map((e) => round(start + e.time))),
    );
  });

  it('crossfades: the old track ramps down and stops scheduling, the new one ramps up', () => {
    const { fake, player, run, fades, sources } = setup();
    player.play('island');
    run(3);
    const switchAt = fake.currentTime;
    player.play('festival');
    expect(player.current).toBe('festival');
    const [oldFade, newFade] = fades();
    expect(oldFade?.gain.events.at(-1)).toMatchObject({ type: 'linear', value: 0 });
    expect(oldFade?.gain.events.at(-1)?.time).toBeCloseTo(switchAt + CROSSFADE);
    // The fade starts from where the gain was (fully faded in), so there is no jump.
    const holdAt = oldFade?.gain.events.findLast((e) => e.type === 'set');
    expect(holdAt).toMatchObject({ value: 1, time: switchAt });
    expect(newFade?.gain.events.at(-1)).toMatchObject({ type: 'linear', value: 1 });

    run(CROSSFADE - 0.05);
    const lateOld = sources().filter(
      (s) => oldFade && s.reaches(oldFade) && (s.startedAt ?? 0) >= switchAt + CROSSFADE,
    );
    expect(lateOld).toHaveLength(0);

    run(3);
    expect(oldFade?.disconnected).toBe(true);
    expect(newFade?.disconnected).toBe(false);
  });

  it('playing the same track again is a no-op', () => {
    const { player, run, fades } = setup();
    player.play('sunset');
    run(1);
    const before = fades()[0]?.gain.events.length;
    player.play('sunset');
    expect(fades()).toHaveLength(1);
    expect(fades()[0]?.gain.events.length).toBe(before);
  });

  it('null fades out, then clears the timer and frees the track', () => {
    const { timers, player, run, fades } = setup();
    player.play('workshop.harbor');
    run(2);
    player.play(null);
    expect(player.current).toBeNull();
    const [fade] = fades();
    expect(fade?.gain.lastTarget()).toBe(0);
    run(CROSSFADE + 2);
    expect(timers.active).toBe(0);
    expect(fade?.disconnected).toBe(true);
    player.play(null); // already silent: nothing happens
    expect(timers.active).toBe(0);
  });

  it('ignores unknown ids without throwing', () => {
    const { fake, player, timers } = setup();
    const nodes = fake.nodes.length;
    expect(() => player.play('workshop.moon')).not.toThrow();
    expect(player.current).toBeNull();
    expect(fake.nodes.length).toBe(nodes);
    expect(timers.active).toBe(0);
    player.play('island');
    player.play('nope');
    expect(player.current).toBe('island');
  });

  it('dispose stops everything quickly and clears the timer', () => {
    const { fake, player, timers, run, fades, sources } = setup();
    player.play('workshop.garden');
    run(2);
    player.play('workshop.shore');
    run(0.5);
    const at = fake.currentTime;
    player.dispose();
    expect(timers.active).toBe(0);
    expect(player.current).toBeNull();
    const all = fades();
    expect(all).toHaveLength(2);
    for (const f of all) expect(f.gain.lastTarget()).toBe(0);
    for (const f of all) expect(f.gain.events.at(-1)?.time).toBeLessThanOrEqual(at + 0.06);
    for (const s of sources()) expect(s.endTime()).toBeLessThanOrEqual(at + 0.07);
    fake.advance(0.2);
    for (const f of all) expect(f.disconnected).toBe(true);
    player.play('island');
    expect(player.current).toBeNull();
  });

  it('uses globalThis timers by default', () => {
    vi.useFakeTimers();
    const fake = new FakeAudioContext({ state: 'running' });
    const player = new MusicPlayer(asAudioContext(fake), asAudioContext(fake).destination);
    player.play('island');
    expect(vi.getTimerCount()).toBe(1);
    player.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('renderTrack', () => {
  it('schedules the requested seconds of a track into the destination at once', () => {
    const fake = new FakeAudioContext({ state: 'running' });
    const dest = fake.createGain();
    renderTrack(asAudioContext(fake), dest as unknown as AudioNode, 'festival', 1, 4);
    const sources = fake.nodes.filter(
      (n): n is FakeScheduledSource => n instanceof FakeScheduledSource,
    );
    expect(sources.length).toBeGreaterThan(30);
    for (const s of sources) {
      expect(reachesThroughParams(s, dest)).toBe(true);
      expect(s.startedAt ?? 0).toBeGreaterThanOrEqual(1);
      expect(s.startedAt ?? 0).toBeLessThan(5);
    }
  });
});
