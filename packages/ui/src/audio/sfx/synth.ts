/*
 * Procedural sound effects (05 §12). Design note: the sound recipes.
 *
 * Every sound is built from sine/triangle oscillators and filtered noise, with soft linear attacks
 * (4–8 ms or longer, so nothing clicks) and exponential decays down to −80 dB before the source is
 * stopped. Pitches come from the C major pentatonic family; per-sound "randomness" (sparkle timing,
 * noise offsets) uses a seeded PRNG, so a sound is identical every time it plays. Peaks stay at or
 * below about 0.45 and there is little energy above 6 kHz; `AudioQuality.stories.tsx` renders every
 * sound in an OfflineAudioContext in Chromium and asserts those limits.
 *
 * - chime (correct): a three-note rising bell arpeggio E5–G5–C6. Each note is additive: partials at
 *   1×, 2×, 3× and a faint 4.07× for bell colour, the upper ones decaying faster, so the attack is
 *   bright and the tail is pure. The shimmer tail is two quiet C6 voices detuned ±3.5 Hz (a slow
 *   beating) plus a faint E6, fading in over 80 ms and ringing for about a second.
 * - knock (try again): two muffled wooden taps, G3 then E3 (a friendly falling "hm-hm"). Each tap is
 *   a sine body with a 25 ms downward pitch drop, a short wood mode at 2.4×, and a 1.6 kHz lowpassed
 *   noise tick, all through a 2.2 kHz lowpass. No sustained tone, so it can never read as a buzzer.
 * - fuse (combining): bandpassed noise sweeping 500 Hz → 3 kHz (a soft whoosh) under a rising
 *   pentatonic run C5–D5–E5–G5–A5, settling on a C5+G5 bell and a gentle low C4 thump.
 * - pop (product): a round sine blip gliding 260 → 880 Hz in 45 ms over a short 620 Hz body, with a
 *   smaller second bubble. Lowpassed at 3 kHz.
 * - horn (boat): "toot-toot", two soft triangle tones on G3 + D4 (a fifth) with a slightly detuned
 *   third voice and a tiny upward scoop, through a lowpass whose cutoff swells and settles.
 * - twinkle (fireflies): five delicate sine sparkles on G6–E7 pentatonic notes with a faint octave
 *   partial, seeded timing and gentle stereo placement.
 * - coin (clink): two light metallic clinks built from inharmonic sine partials (1, 1.47, 2.09,
 *   2.56× of 1.76 kHz and 2.09 kHz) with 60–220 ms decays.
 * - page (page turn): noise through a bandpass sweeping 900 Hz → 2.4 kHz → 1.5 kHz plus a lowpass,
 *   with a 60 ms swell and a soft 250 ms fall.
 * - build-tap (construction): three wooden mallet taps rising G4–A4–C5, each a sine body with a
 *   quick pitch drop, a 2.7× wood mode and a lowpassed noise tick.
 */

import type { KnownSfxId } from './catalog';
import {
  hashInts,
  midiToHz,
  mulberry32,
  NodeBag,
  type PercussiveEnvelope,
  percussive,
  SILENT,
  sustained,
} from './dsp';

export interface SfxVoice {
  /** Context time at which the sound has fully finished (earlier after `stop`). */
  readonly endTime: number;
  /** Fade out over ~30 ms starting at `at` (default: now) and free the nodes. */
  stop(at?: number): void;
}

/** Fade length used by `SfxVoice.stop`. */
export const SFX_STOP_FADE_SEC = 0.03;

interface Ctx {
  bag: NodeBag;
  /** The voice's master input; everything a recipe makes ends up here. */
  out: AudioNode;
  t: number;
  rand: () => number;
}

/** One sine/triangle partial with its own percussive envelope. Returns the oscillator. */
function tone(
  c: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  env: PercussiveEnvelope,
  type: OscillatorType = 'sine',
): OscillatorNode {
  const g = c.bag.gain(0);
  const end = percussive(g.gain, t, env);
  const osc = c.bag.osc(type, freq, t, end + 0.02);
  osc.connect(g).connect(dest);
  return osc;
}

/** Exponential pitch glide on an oscillator frequency. */
function glide(param: AudioParam, t: number, from: number, to: number, time: number): void {
  param.setValueAtTime(from, t);
  param.exponentialRampToValueAtTime(to, t + time);
}

/** Filtered noise burst; `filters` are applied in series. */
function noiseBurst(
  c: Ctx,
  dest: AudioNode,
  t: number,
  env: PercussiveEnvelope,
  filters: BiquadFilterNode[],
): void {
  const g = c.bag.gain(0);
  const end = percussive(g.gain, t, env);
  const src = c.bag.noise(t, end + 0.02, c.rand);
  let node: AudioNode = src;
  for (const f of filters) node = node.connect(f);
  node.connect(g).connect(dest);
}

/** Additive bell note: partial ratio, relative amplitude, relative decay. */
const BELL_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2, 0.3, 0.55],
  [3, 0.1, 0.35],
  [4.07, 0.04, 0.18],
];

function bell(c: Ctx, dest: AudioNode, t: number, midi: number, peak: number, decay: number): void {
  const f = midiToHz(midi);
  for (const [ratio, amp, dec] of BELL_PARTIALS) {
    tone(c, dest, t, f * ratio, { attack: 0.006, peak: peak * amp, decay: decay * dec });
  }
}

/** A wooden tap: pitched body with a pitch drop, a short inharmonic mode and a noise tick. */
function woodTap(
  c: Ctx,
  dest: AudioNode,
  t: number,
  f: number,
  peak: number,
  opts: { mode: number; tickHz: number; decay: number },
): void {
  const body = tone(c, dest, t, f, { attack: 0.004, peak, decay: opts.decay });
  glide(body.frequency, t, f * 1.25, f, 0.025);
  tone(c, dest, t, f * opts.mode, { attack: 0.004, peak: peak * 0.3, decay: opts.decay * 0.4 });
  noiseBurst(c, dest, t, { attack: 0.004, peak: peak * 0.35, decay: 0.025 }, [
    c.bag.filter('lowpass', opts.tickHz, 0.7),
  ]);
}

const RECIPES: Record<KnownSfxId, (c: Ctx) => void> = {
  chime(c) {
    const notes = [76, 79, 84]; // E5 G5 C6
    notes.forEach((midi, i) => {
      bell(c, c.out, c.t + i * 0.075, midi, i === 2 ? 0.2 : 0.15, i === 2 ? 1.1 : 0.55);
    });
    const tail = c.t + 0.15;
    for (const [midi, detune] of [
      [84, 3.5],
      [84, -3.5],
      [88, 2],
    ] as const) {
      tone(c, c.out, tail, midiToHz(midi) + detune, { attack: 0.08, peak: 0.025, decay: 1.2 });
    }
  },

  knock(c) {
    const muffle = c.bag.filter('lowpass', 2200, 0.6);
    muffle.connect(c.out);
    woodTap(c, muffle, c.t, midiToHz(55), 0.3, { mode: 2.4, tickHz: 1600, decay: 0.13 }); // G3
    woodTap(c, muffle, c.t + 0.15, midiToHz(52), 0.25, { mode: 2.4, tickHz: 1400, decay: 0.16 }); // E3
  },

  fuse(c) {
    const { t, bag } = c;
    // Whoosh: bandpassed noise sweeping upwards, swelling then falling away.
    const sweep = bag.filter('bandpass', 500, 1.4);
    glide(sweep.frequency, t, 500, 3000, 0.4);
    const whoosh = bag.gain(0);
    whoosh.gain.setValueAtTime(0, t);
    whoosh.gain.linearRampToValueAtTime(0.16, t + 0.28);
    whoosh.gain.exponentialRampToValueAtTime(SILENT, t + 0.6);
    const src = bag.noise(t, t + 0.62, c.rand);
    src.connect(sweep).connect(bag.filter('lowpass', 4000)).connect(whoosh).connect(c.out);
    // Rising pentatonic run.
    [72, 74, 76, 79, 81].forEach((midi, i) => {
      tone(c, c.out, t + 0.05 + i * 0.055, midiToHz(midi), {
        attack: 0.008,
        peak: 0.06 + i * 0.012,
        decay: 0.22,
      });
    });
    // Settle: a soft open-fifth bell and a round low thump.
    const settle = t + 0.36;
    bell(c, c.out, settle, 72, 0.13, 0.8);
    bell(c, c.out, settle, 79, 0.09, 0.7);
    const thump = tone(c, c.out, settle, midiToHz(60), { attack: 0.008, peak: 0.18, decay: 0.3 });
    glide(thump.frequency, settle, midiToHz(64), midiToHz(60), 0.06);
  },

  pop(c) {
    const { t } = c;
    const soften = c.bag.filter('lowpass', 3000, 0.7);
    soften.connect(c.out);
    const blip = tone(c, soften, t, 260, { attack: 0.005, peak: 0.34, decay: 0.13 });
    glide(blip.frequency, t, 260, 880, 0.045);
    const body = tone(c, soften, t + 0.008, 620, { attack: 0.005, peak: 0.1, decay: 0.08 });
    glide(body.frequency, t + 0.008, 620, 540, 0.08);
    const bubble = tone(c, soften, t + 0.07, 520, { attack: 0.005, peak: 0.1, decay: 0.07 });
    glide(bubble.frequency, t + 0.07, 520, 1240, 0.035);
  },

  horn(c) {
    const toots: readonly (readonly [number, number])[] = [
      [0, 0.18],
      [0.3, 0.3],
    ];
    for (const [offset, gate] of toots) {
      const t = c.t + offset;
      const lp = c.bag.filter('lowpass', 500, 0.8);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(1100, t + 0.05);
      lp.frequency.exponentialRampToValueAtTime(800, t + 0.2);
      const amp = c.bag.gain(0);
      const end = sustained(amp.gain, t, {
        attack: 0.03,
        peak: 0.24,
        decay: 0.08,
        sustain: 0.85,
        gate,
        release: 0.09,
      });
      lp.connect(amp).connect(c.out);
      const voices: readonly (readonly [number, number, number])[] = [
        [midiToHz(55), 0, 0.55], // G3
        [midiToHz(55), 7, 0.35], // G3, detuned for warmth
        [midiToHz(62), 0, 0.3], // D4, the fifth
      ];
      for (const [f, cents, level] of voices) {
        const osc = c.bag.osc('triangle', f, t, end + 0.02);
        osc.detune.value = cents;
        glide(osc.frequency, t, f * 0.96, f, 0.05);
        const g = c.bag.gain(level);
        osc.connect(g).connect(lp);
      }
    }
  },

  twinkle(c) {
    const pool = [91, 93, 96, 98, 100]; // G6 A6 C7 D7 E7
    const order = [...pool];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(c.rand() * (i + 1));
      [order[i], order[j]] = [order[j] as number, order[i] as number];
    }
    let t = c.t;
    for (const midi of order) {
      const pan = c.bag.panner((c.rand() - 0.5) * 0.8);
      pan.connect(c.out);
      const f = midiToHz(midi);
      const decay = 0.18 + c.rand() * 0.12;
      tone(c, pan, t, f, { attack: 0.006, peak: 0.15, decay });
      tone(c, pan, t, f * 2, { attack: 0.006, peak: 0.012, decay: decay * 0.4 });
      t += 0.07 + c.rand() * 0.05;
    }
  },

  coin(c) {
    const partials: readonly (readonly [number, number, number])[] = [
      [1, 1, 0.22],
      [1.47, 0.55, 0.14],
      [2.09, 0.3, 0.09],
      [2.56, 0.16, 0.06],
    ];
    const clinks: readonly (readonly [number, number, number])[] = [
      [0, 1760, 0.13],
      [0.085, 2093, 0.1],
    ];
    for (const [offset, base, peak] of clinks) {
      for (const [ratio, amp, decay] of partials) {
        tone(c, c.out, c.t + offset, base * ratio, { attack: 0.004, peak: peak * amp, decay });
      }
    }
  },

  page(c) {
    const { t, bag } = c;
    const band = bag.filter('bandpass', 900, 0.9);
    band.frequency.setValueAtTime(900, t);
    band.frequency.exponentialRampToValueAtTime(2400, t + 0.12);
    band.frequency.exponentialRampToValueAtTime(1500, t + 0.3);
    const amp = bag.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.32, t + 0.06);
    amp.gain.exponentialRampToValueAtTime(SILENT, t + 0.31);
    const src = bag.noise(t, t + 0.33, c.rand);
    src
      .connect(band)
      .connect(bag.filter('lowpass', 3800, 0.6))
      .connect(bag.filter('lowpass', 5000, 0.6))
      .connect(amp)
      .connect(c.out);
  },

  'build-tap'(c) {
    const notes = [67, 69, 72]; // G4 A4 C5
    notes.forEach((midi, i) => {
      woodTap(c, c.out, c.t + i * 0.15, midiToHz(midi), 0.26, {
        mode: 2.7,
        tickHz: 2800,
        decay: 0.1,
      });
    });
  },
};

/**
 * Schedules sound `id` on `ctx` at time `when` into `destination`. Works with AudioContext and
 * OfflineAudioContext. The returned voice can be stopped early with a short fade.
 */
export function playSfx(
  ctx: BaseAudioContext,
  destination: AudioNode,
  id: KnownSfxId,
  when: number,
): SfxVoice {
  const t = Math.max(when, 0);
  const bag = new NodeBag(ctx);
  const master = bag.gain(1);
  master.connect(destination);
  RECIPES[id]({
    bag,
    out: master,
    t,
    rand: mulberry32(hashInts(...[...id].map((ch) => ch.charCodeAt(0)))),
  });

  let stoppedAt: number | null = null;
  return {
    get endTime() {
      return bag.end;
    },
    stop(at = ctx.currentTime) {
      if (stoppedAt !== null || at >= bag.end) return;
      stoppedAt = at;
      master.gain.cancelScheduledValues(at);
      master.gain.setValueAtTime(1, at);
      master.gain.linearRampToValueAtTime(0, at + SFX_STOP_FADE_SEC);
      bag.stopAt(at + SFX_STOP_FADE_SEC + 0.005);
    },
  };
}
