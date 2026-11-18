// Turns the track data in tracks.ts into note events. Pure and deterministic: no clock, no audio,
// no Math.random. Loop events are computed once per (track, variant) and cached.

import { hashInts, mulberry32 } from '../sfx/dsp';
import {
  type InstrumentId,
  type KnownMusicId,
  type PartDef,
  STEPS_PER_BEAT,
  TRACKS,
  type TrackDef,
} from './tracks';

export interface NoteEvent {
  /** Absolute 16th-note step from the start of the track (pass k starts at k × loopSteps). */
  step: number;
  /** Seconds from the track start (includes swing). */
  time: number;
  instrument: InstrumentId;
  midi: number;
  /** Seconds. */
  duration: number;
  /** 0–1, already scaled by the part level. */
  velocity: number;
}

export interface TrackInfo {
  bpm: number;
  stepSec: number;
  loopSteps: number;
  loopSec: number;
}

/** Major scale, in semitones from the tonic. */
export const MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

export function trackInfo(id: KnownMusicId): TrackInfo {
  const def = TRACKS[id];
  const stepSec = 60 / def.bpm / STEPS_PER_BEAT;
  const loopSteps = def.bars * def.beatsPerBar * STEPS_PER_BEAT;
  return { bpm: def.bpm, stepSec, loopSteps, loopSec: loopSteps * stepSec };
}

/** Which melody variant loop pass `pass` plays: 0 for the first pass, then seeded per pass. */
export function variantForPass(id: KnownMusicId, pass: number): number {
  const def = TRACKS[id];
  if (pass === 0) return 0;
  return Math.floor(mulberry32(hashInts(def.seed, pass))() * def.variants);
}

/** The note events for steps [fromStep, toStep), sorted by step. */
export function trackEvents(id: KnownMusicId, fromStep: number, toStep: number): NoteEvent[] {
  const from = Math.max(0, Math.ceil(fromStep));
  const to = Math.ceil(toStep);
  if (to <= from) return [];
  const def = TRACKS[id];
  const { stepSec, loopSteps } = trackInfo(id);
  const out: NoteEvent[] = [];
  const lastPass = Math.floor((to - 1) / loopSteps);
  for (let pass = Math.floor(from / loopSteps); pass <= lastPass; pass += 1) {
    const base = pass * loopSteps;
    for (const e of passEvents(id, variantForPass(id, pass))) {
      const step = base + e.step;
      if (step < from || step >= to) continue;
      const swing = step % STEPS_PER_BEAT === 2 ? def.swing * stepSec : 0;
      out.push({
        step,
        time: step * stepSec + swing,
        instrument: e.instrument,
        midi: e.midi,
        duration: e.steps * stepSec,
        velocity: e.velocity,
      });
    }
  }
  return out;
}

interface LoopEvent {
  step: number;
  instrument: InstrumentId;
  midi: number;
  /** Length in steps (may be fractional: gated notes are shorter than their slot). */
  steps: number;
  velocity: number;
}

const loopCache = new Map<string, readonly LoopEvent[]>();

/** All events of one loop pass for a variant, steps relative to the pass start. */
function passEvents(id: KnownMusicId, variant: number): readonly LoopEvent[] {
  const key = `${id}#${variant}`;
  const cached = loopCache.get(key);
  if (cached) return cached;
  const def = TRACKS[id];
  const events = def.parts
    .flatMap((part, index) => partEvents(id, def, part, index, variant))
    .sort((a, b) => a.step - b.step);
  loopCache.set(key, events);
  return events;
}

/** Note-length fraction of the token slot, per part kind (melodies breathe, pads are legato). */
const GATE: Record<PartDef['kind'], number> = { melody: 0.9, chord: 0.85, pad: 1, perc: 1 };

function partEvents(
  id: KnownMusicId,
  def: TrackDef,
  part: PartDef,
  partIndex: number,
  variant: number,
): LoopEvent[] {
  const stepsPerBar = def.beatsPerBar * STEPS_PER_BEAT;
  const bars = barsOf(def, part, variant);
  const tokensPerBar = stepsPerBar / part.grid;
  const slots: { step: number; token: string; bar: number }[] = [];
  bars.forEach((bar, b) => {
    const tokens = bar.trim().split(/\s+/);
    if (tokens.length !== tokensPerBar) {
      throw new Error(
        `${id} part ${partIndex} bar ${b + 1}: ${tokens.length} tokens, expected ${tokensPerBar}`,
      );
    }
    tokens.forEach((token, i) => {
      slots.push({ step: b * stepsPerBar + i * part.grid, token, bar: b });
    });
  });

  const events: LoopEvent[] = [];
  slots.forEach((slot, i) => {
    if (slot.token === '.' || slot.token === '-') return;
    let holds = 0;
    while (slots[i + holds + 1]?.token === '-') holds += 1;
    const steps = (holds + 1) * part.grid * GATE[part.kind];
    const accent = metricAccent(slot.step, stepsPerBar);
    const human = 0.92 + 0.08 * mulberry32(hashInts(def.seed, partIndex, slot.step))();
    const chord = def.progression[slot.bar] ?? 'I';
    for (const { midi, weight } of pitchesOf(def, part, slot.token, chord)) {
      events.push({
        step: slot.step,
        instrument: part.instrument,
        midi,
        steps,
        velocity: Math.min(1, weight * accent * human * part.level),
      });
    }
  });
  return events;
}

function barsOf(def: TrackDef, part: PartDef, variant: number): readonly string[] {
  if (part.kind === 'melody') {
    const bars = part.variants.length === 1 ? part.variants[0] : part.variants[variant];
    if (!bars || bars.length !== def.bars)
      throw new Error(`melody variant ${variant} needs ${def.bars} bars`);
    return bars;
  }
  if (typeof part.pattern === 'string')
    return Array.from({ length: def.bars }, () => part.pattern as string);
  if (part.pattern.length !== def.bars) throw new Error(`pattern needs ${def.bars} bars`);
  return part.pattern;
}

function metricAccent(step: number, stepsPerBar: number): number {
  const inBar = step % stepsPerBar;
  if (inBar === 0) return 1;
  if (inBar % STEPS_PER_BEAT === 0) return 0.9;
  return 0.8;
}

const NUMERAL = /^(vii|iii|ii|IV|vi|V|I)(6|7|add9)?$/;
const DEGREES: Record<string, number> = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5, vii: 6 };

/** Chord symbol → scale degrees (0-based): triad first, then any added tone. */
export function chordDegrees(symbol: string): { triad: number[]; added: number[] } {
  const m = NUMERAL.exec(symbol);
  const root = m?.[1] ? DEGREES[m[1]] : undefined;
  if (!m || root === undefined) throw new Error(`unknown chord symbol ${symbol}`);
  const triad = [root, root + 2, root + 4];
  const added =
    m[2] === '6' ? [root + 5] : m[2] === '7' ? [root + 6] : m[2] === 'add9' ? [root + 1] : [];
  return { triad, added };
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function pitchClass(tonic: number, degree: number): number {
  return mod(tonic + (MAJOR_SCALE[mod(degree, 7)] ?? 0), 12);
}

/** The lowest MIDI note with pitch class `pc` at or above `low`. */
function placeAbove(pc: number, low: number): number {
  return low + mod(pc - low, 12);
}

function pitchesOf(
  def: TrackDef,
  part: PartDef,
  token: string,
  chord: string,
): { midi: number; weight: number }[] {
  switch (part.kind) {
    case 'perc': {
      if (token !== 'x' && token !== 'o') throw new Error(`bad perc token ${token}`);
      return [{ midi: part.register, weight: token === 'x' ? 1 : 0.55 }];
    }
    case 'pad': {
      if (token !== 'x') throw new Error(`bad pad token ${token}`);
      const { triad, added } = chordDegrees(chord);
      return [...triad, ...added]
        .map((d) => placeAbove(pitchClass(def.tonic, d), part.register))
        .sort((a, b) => a - b)
        .map((midi) => ({ midi, weight: 1 }));
    }
    case 'chord': {
      const m = /^(\d)(,*)$/.exec(token);
      if (!m) throw new Error(`bad chord token ${token}`);
      const index = Number(m[1]);
      const { triad } = chordDegrees(chord);
      const degree = triad[index % 3] ?? 0;
      const octave = Math.floor(index / 3) - (m[2]?.length ?? 0);
      return [
        { midi: placeAbove(pitchClass(def.tonic, degree), part.register) + 12 * octave, weight: 1 },
      ];
    }
    case 'melody': {
      const m = /^([1-7])([',]*)$/.exec(token);
      if (!m) throw new Error(`bad melody token ${token}`);
      const n = Number(m[1]) - 1;
      const marks = m[2] ?? '';
      const octave = [...marks].reduce((o, c) => o + (c === "'" ? 1 : -1), 0);
      return [{ midi: part.register + (MAJOR_SCALE[n] ?? 0) + 12 * octave, weight: 1 }];
    }
  }
}
