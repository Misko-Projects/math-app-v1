// Music instruments: each schedules one note on a context with a click-free envelope and returns
// the NodeBag that owns its nodes (it frees itself when the note has ended).
//
// marimba: sine fundamental + a quiet 4× partial (the marimba's two-octave overtone), short decay.
// pluck: triangle + soft 2× sine through a lowpass whose cutoff falls (ukulele / harp-like).
// pad: triangle + detuned sine through a 1.1 kHz lowpass, slow attack and long release.
// bass: sine + a little triangle through a 600 Hz lowpass, round and short.
// bell: gentle 2:1 FM whose brightness decays quickly, lowpassed at 5 kHz.
// musicbox: sine with fast-fading 2× and 3× partials, long ringing decay.
// shaker: bandpassed noise around 4.5 kHz, very short and quiet.
// woodblock: sine body with a tiny pitch drop and a short 2.5× mode.
// logdrum: low sine with a downward pitch glide (a soft woody thump).

import { hashInts, midiToHz, mulberry32, NodeBag, percussive, sustained } from '../sfx/dsp';
import type { InstrumentId } from './tracks';

export interface NoteSpec {
  instrument: InstrumentId;
  midi: number;
  /** Seconds the note is held (sustaining instruments) or its slot length (percussive ones). */
  duration: number;
  /** 0–1. */
  velocity: number;
}

type Play = (bag: NodeBag, out: AudioNode, t: number, note: NoteSpec) => void;

function partial(
  bag: NodeBag,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  freq: number,
  peak: number,
  decay: number,
  attack = 0.005,
): OscillatorNode {
  const g = bag.gain(0);
  const end = percussive(g.gain, t, { attack, peak, decay });
  const osc = bag.osc(type, freq, t, end + 0.02);
  osc.connect(g).connect(out);
  return osc;
}

const PLAYERS: Record<InstrumentId, Play> = {
  marimba(bag, out, t, n) {
    const f = midiToHz(n.midi);
    const decay = Math.min(0.9, 0.35 + 120 / f);
    partial(bag, out, t, 'sine', f, n.velocity * 0.42, decay);
    partial(bag, out, t, 'sine', f * 4, n.velocity * 0.06, decay * 0.22);
  },

  pluck(bag, out, t, n) {
    const f = midiToHz(n.midi);
    const lp = bag.filter('lowpass', Math.min(3200, f * 6), 0.7);
    lp.frequency.setValueAtTime(Math.min(3200, f * 6), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 1.5), t + 0.18);
    const g = bag.gain(0);
    const end = percussive(g.gain, t, { attack: 0.006, peak: n.velocity * 0.34, decay: 0.5 });
    lp.connect(g).connect(out);
    bag.osc('triangle', f, t, end + 0.02).connect(lp);
    const overtone = bag.gain(0.25);
    bag
      .osc('sine', f * 2, t, end + 0.02)
      .connect(overtone)
      .connect(lp);
  },

  pad(bag, out, t, n) {
    const f = midiToHz(n.midi);
    const lp = bag.filter('lowpass', 1100, 0.5);
    const g = bag.gain(0);
    const end = sustained(g.gain, t, {
      attack: 0.4,
      peak: n.velocity * 0.12,
      decay: 0.5,
      sustain: 0.75,
      gate: n.duration,
      release: 0.7,
    });
    lp.connect(g).connect(out);
    bag.osc('triangle', f, t, end + 0.02).connect(lp);
    const warm = bag.osc('sine', f, t, end + 0.02);
    warm.detune.value = 7;
    warm.connect(lp);
  },

  bass(bag, out, t, n) {
    const f = midiToHz(n.midi);
    const lp = bag.filter('lowpass', 600, 0.6);
    const g = bag.gain(0);
    const end = sustained(g.gain, t, {
      attack: 0.012,
      peak: n.velocity * 0.5,
      decay: 0.25,
      sustain: 0.6,
      gate: n.duration,
      release: 0.12,
    });
    lp.connect(g).connect(out);
    bag.osc('sine', f, t, end + 0.02).connect(lp);
    const edge = bag.gain(0.3);
    bag
      .osc('triangle', f, t, end + 0.02)
      .connect(edge)
      .connect(lp);
  },

  bell(bag, out, t, n) {
    const f = midiToHz(n.midi);
    const lp = bag.filter('lowpass', 5000, 0.6);
    lp.connect(out);
    const carrier = partial(bag, lp, t, 'sine', f, n.velocity * 0.22, 1.1, 0.004);
    const index = bag.gain(0);
    percussive(index.gain, t, { attack: 0.004, peak: f * 0.9, decay: 0.3 });
    bag
      .osc('sine', f * 2, t, t + 0.35)
      .connect(index)
      .connect(carrier.frequency);
  },

  musicbox(bag, out, t, n) {
    const f = midiToHz(n.midi);
    partial(bag, out, t, 'sine', f, n.velocity * 0.3, 1.3, 0.004);
    partial(bag, out, t, 'sine', f * 2, n.velocity * 0.07, 0.35, 0.004);
    partial(bag, out, t, 'sine', f * 3, n.velocity * 0.025, 0.12, 0.004);
  },

  shaker(bag, out, t, n) {
    const g = bag.gain(0);
    const end = percussive(g.gain, t, { attack: 0.006, peak: n.velocity * 0.07, decay: 0.05 });
    const src = bag.noise(t, end + 0.02, mulberry32(hashInts(Math.round(t * 1000))));
    src
      .connect(bag.filter('bandpass', 4500, 1.1))
      .connect(bag.filter('lowpass', 7000, 0.6))
      .connect(g)
      .connect(out);
  },

  woodblock(bag, out, t, n) {
    const f = midiToHz(n.midi);
    const body = partial(bag, out, t, 'sine', f, n.velocity * 0.3, 0.07, 0.004);
    body.frequency.setValueAtTime(f * 1.08, t);
    body.frequency.exponentialRampToValueAtTime(f, t + 0.015);
    partial(bag, out, t, 'sine', f * 2.5, n.velocity * 0.06, 0.025, 0.004);
  },

  logdrum(bag, out, t, n) {
    const f = midiToHz(n.midi);
    const body = partial(bag, out, t, 'sine', f, n.velocity * 0.5, 0.25, 0.006);
    body.frequency.setValueAtTime(f * 1.5, t);
    body.frequency.exponentialRampToValueAtTime(f, t + 0.04);
  },
};

export const INSTRUMENT_IDS = Object.keys(PLAYERS) as InstrumentId[];

/** Schedules one note at `when` into `destination`. Returns the bag owning its nodes. */
export function scheduleNote(
  ctx: BaseAudioContext,
  destination: AudioNode,
  note: NoteSpec,
  when: number,
): NodeBag {
  const bag = new NodeBag(ctx);
  if (note.velocity > 0) PLAYERS[note.instrument](bag, destination, Math.max(0, when), note);
  return bag;
}
