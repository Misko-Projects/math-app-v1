import { describe, expect, it } from 'vitest';
import { MAJOR_SCALE, type NoteEvent, trackEvents, trackInfo, variantForPass } from './sequencer';
import { isKnownMusic, MUSIC_CATALOG, MUSIC_IDS, STEPS_PER_BEAT, TRACKS } from './tracks';

const PASSES = 24;

describe('music catalog', () => {
  it('lists every track with a label and a use', () => {
    expect(Object.keys(MUSIC_CATALOG).sort()).toEqual([...MUSIC_IDS].sort());
    expect(Object.keys(TRACKS).sort()).toEqual([...MUSIC_IDS].sort());
    for (const id of MUSIC_IDS) {
      expect(isKnownMusic(id)).toBe(true);
      expect(MUSIC_CATALOG[id].label.length).toBeGreaterThan(0);
    }
    expect(isKnownMusic('workshop.space')).toBe(false);
  });
});

describe.each(MUSIC_IDS)('track %s', (id) => {
  const def = TRACKS[id];
  const info = trackInfo(id);

  it('has consistent timing', () => {
    expect(info.bpm).toBe(def.bpm);
    expect(info.stepSec).toBeCloseTo(60 / def.bpm / STEPS_PER_BEAT);
    expect(info.loopSteps).toBe(def.bars * def.beatsPerBar * STEPS_PER_BEAT);
    expect(info.loopSec).toBeCloseTo(info.loopSteps * info.stepSec);
    expect(def.progression).toHaveLength(def.bars);
    expect(def.bpm).toBeGreaterThanOrEqual(60);
    expect(def.bpm).toBeLessThanOrEqual(110);
  });

  it('is deterministic', () => {
    expect(trackEvents(id, 0, info.loopSteps * 3)).toEqual(trackEvents(id, 0, info.loopSteps * 3));
  });

  it('keeps every event inside its step range, sorted, with sane values', () => {
    const windows: [number, number][] = [
      [0, 1],
      [3, 37],
      [info.loopSteps - 5, info.loopSteps + 5],
      [info.loopSteps * 7 + 11, info.loopSteps * 9 + 2],
    ];
    for (const [from, to] of windows) {
      const events = trackEvents(id, from, to);
      for (const e of events) {
        expect(e.step).toBeGreaterThanOrEqual(from);
        expect(e.step).toBeLessThan(to);
        expect(e.time).toBeGreaterThanOrEqual(e.step * info.stepSec);
        expect(e.time).toBeLessThan((e.step + 0.5) * info.stepSec);
        expect(e.duration).toBeGreaterThan(0);
        expect(e.velocity).toBeGreaterThan(0);
        expect(e.velocity).toBeLessThanOrEqual(1);
        expect(e.midi).toBeGreaterThanOrEqual(36);
        expect(e.midi).toBeLessThanOrEqual(100);
      }
      expect(events.map((e) => e.step)).toEqual(events.map((e) => e.step).sort((a, b) => a - b));
    }
    expect(trackEvents(id, 10, 10)).toEqual([]);
    expect(trackEvents(id, 10, 5)).toEqual([]);
  });

  it('uses only pitches of its major key', () => {
    const scale = new Set(MAJOR_SCALE.map((s) => (def.tonic + s) % 12));
    for (const e of trackEvents(id, 0, info.loopSteps * PASSES)) {
      expect(scale.has(e.midi % 12), `${e.instrument} midi ${e.midi} at step ${e.step}`).toBe(true);
    }
  });

  it('gives the same events however the range is chunked (as the scheduler asks for it)', () => {
    const total = info.loopSteps * 3 + 7;
    const whole = trackEvents(id, 0, total);
    const sizes = [1, 2, 5, 3, 13, 1, 8];
    const chunked: NoteEvent[] = [];
    for (let from = 0, i = 0; from < total; i += 1) {
      const to = Math.min(total, from + (sizes[i % sizes.length] ?? 1));
      chunked.push(...trackEvents(id, from, to));
      from = to;
    }
    expect(chunked).toEqual(whole);
  });

  it('loops seamlessly: passes with the same variant are identical, shifted by whole loops', () => {
    const passEvents = (pass: number) =>
      trackEvents(id, pass * info.loopSteps, (pass + 1) * info.loopSteps).map((e) => ({
        ...e,
        step: e.step - pass * info.loopSteps,
        time: e.time - pass * info.loopSec,
      }));
    const firstWithVariant = new Map<number, ReturnType<typeof passEvents>>();
    for (let pass = 0; pass < PASSES; pass += 1) {
      const v = variantForPass(id, pass);
      const events = passEvents(pass);
      const reference = firstWithVariant.get(v);
      if (!reference) firstWithVariant.set(v, events);
      else {
        expect(events.length).toBe(reference.length);
        events.forEach((e, i) => {
          const r = reference[i];
          expect({ ...e, time: 0 }).toEqual({ ...r, time: 0 });
          expect(e.time).toBeCloseTo(r?.time ?? Number.NaN, 6);
        });
      }
    }
  });

  it('varies the melody between passes but keeps the accompaniment identical', () => {
    expect(variantForPass(id, 0)).toBe(0);
    const seen = new Set(Array.from({ length: PASSES }, (_, p) => variantForPass(id, p)));
    expect(seen.size).toBe(def.variants);
    const melodic = new Set(
      def.parts
        .filter((p) => p.kind === 'melody' && p.variants.length > 1)
        .map((p) => p.instrument),
    );
    const accompaniment = (pass: number) =>
      trackEvents(id, pass * info.loopSteps, (pass + 1) * info.loopSteps)
        .filter((e) => !melodic.has(e.instrument))
        .map((e) => ({
          step: e.step - pass * info.loopSteps,
          midi: e.midi,
          instrument: e.instrument,
        }));
    const first = accompaniment(0);
    expect(first.length).toBeGreaterThan(0);
    for (let pass = 1; pass < 8; pass += 1) expect(accompaniment(pass)).toEqual(first);
  });

  it('keeps the melody sparse (lots of space)', () => {
    for (const part of def.parts) {
      if (part.kind !== 'melody') continue;
      expect(part.register % 12).toBe(def.tonic);
      for (const bars of part.variants) {
        const tokens = bars.join(' ').split(/\s+/);
        const notes = tokens.filter((t) => t !== '.' && t !== '-').length;
        expect(notes / tokens.length).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
