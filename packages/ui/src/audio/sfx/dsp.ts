// Shared building blocks for the procedural SFX synth and the music instruments: a seeded PRNG,
// pitch helpers, click-free envelopes, a per-context cached noise buffer, and `NodeBag`, which
// owns the nodes of one sound and frees them when its sources have ended.

/** "Silence" for exponential ramps, which cannot reach 0 (−80 dB below full scale). */
export const SILENT = 0.0001;

/** mulberry32: a tiny, fast, seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Mixes integers into one 32-bit seed (order-sensitive). */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export interface PercussiveEnvelope {
  /** Seconds from silence to peak (≥ 4 ms keeps onsets click-free). */
  attack: number;
  peak: number;
  /** Seconds from peak down to SILENT (exponential, so it sounds like a natural decay). */
  decay: number;
}

/** Linear attack from 0, exponential decay to SILENT. Returns the time the envelope is silent. */
export function percussive(param: AudioParam, t: number, env: PercussiveEnvelope): number {
  const peak = Math.max(env.peak, SILENT * 2);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + env.attack);
  param.exponentialRampToValueAtTime(SILENT, t + env.attack + env.decay);
  return t + env.attack + env.decay;
}

export interface SustainedEnvelope {
  attack: number;
  peak: number;
  /** Seconds from peak to the sustain level. */
  decay: number;
  /** Sustain level as a fraction of peak (0 < sustain ≤ 1). */
  sustain: number;
  /** Gate length in seconds from `t` (how long the key is held). */
  gate: number;
  /** Seconds from the end of the gate down to SILENT. */
  release: number;
}

/** Attack, decay to sustain, hold until the gate ends, smooth release. Returns the silent time. */
export function sustained(param: AudioParam, t: number, env: SustainedEnvelope): number {
  const peak = Math.max(env.peak, SILENT * 2);
  const level = Math.max(peak * env.sustain, SILENT * 2);
  const gateEnd = t + Math.max(env.gate, env.attack + 0.01);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + env.attack);
  if (gateEnd > t + env.attack + env.decay) {
    param.exponentialRampToValueAtTime(level, t + env.attack + env.decay);
    param.setValueAtTime(level, gateEnd);
  }
  param.exponentialRampToValueAtTime(SILENT, gateEnd + env.release);
  return gateEnd + env.release;
}

const NOISE_SECONDS = 2;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of seeded white noise, created once per context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const length = Math.round(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = mulberry32(0x5eed);
  for (let i = 0; i < length; i += 1) data[i] = rand() * 2 - 1;
  noiseCache.set(ctx, buffer);
  return buffer;
}

/**
 * The nodes of one sound. Every node it creates is remembered; every source is started and given a
 * stop time. When the last source has ended, all nodes are disconnected so the graph is freed.
 */
export class NodeBag {
  readonly ctx: BaseAudioContext;
  readonly #nodes: AudioNode[] = [];
  readonly #stops = new Map<AudioScheduledSourceNode, number>();
  readonly #live = new Set<AudioScheduledSourceNode>();
  readonly #onDone: (() => void)[] = [];
  #end = 0;
  #done = false;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  /** The latest stop time of any source (when the sound is fully over). */
  get end(): number {
    return this.#end;
  }

  get done(): boolean {
    return this.#done;
  }

  gain(value: number): GainNode {
    const node = this.ctx.createGain();
    node.gain.value = value;
    return this.#track(node);
  }

  filter(type: BiquadFilterType, frequency: number, q = Math.SQRT1_2): BiquadFilterNode {
    const node = this.ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return this.#track(node);
  }

  panner(pan: number): StereoPannerNode {
    const node = this.ctx.createStereoPanner();
    node.pan.value = pan;
    return this.#track(node);
  }

  delay(seconds: number, max = 1): DelayNode {
    const node = this.ctx.createDelay(max);
    node.delayTime.value = seconds;
    return this.#track(node);
  }

  osc(type: OscillatorType, frequency: number, start: number, stop: number): OscillatorNode {
    const node = this.ctx.createOscillator();
    node.type = type;
    node.frequency.value = frequency;
    node.start(start);
    this.#schedule(node, stop);
    return node;
  }

  /** White noise from the shared buffer, starting at a seeded offset so repeats differ. */
  noise(start: number, stop: number, rand: () => number): AudioBufferSourceNode {
    const node = this.ctx.createBufferSource();
    node.buffer = noiseBuffer(this.ctx);
    node.loop = true;
    node.start(start, rand() * (NOISE_SECONDS - 0.5));
    this.#schedule(node, stop);
    return node;
  }

  /** Stop every source at `at` unless it already stops earlier (callers fade a gain first). */
  stopAt(at: number): void {
    let end = 0;
    for (const [src, stop] of this.#stops) {
      if (at < stop && this.#live.has(src)) {
        src.stop(at);
        this.#stops.set(src, at);
      }
      end = Math.max(end, this.#stops.get(src) ?? stop);
    }
    this.#end = end;
  }

  /** Calls `fn` once, after every source has ended and the nodes are disconnected. */
  onDone(fn: () => void): void {
    if (this.#done || this.#stops.size === 0) fn();
    else this.#onDone.push(fn);
  }

  #track<T extends AudioNode>(node: T): T {
    this.#nodes.push(node);
    return node;
  }

  /** Registers a started source: gives it a stop time and frees the bag when the last one ends. */
  #schedule(node: AudioScheduledSourceNode, stop: number): void {
    this.#track(node);
    this.#live.add(node);
    node.addEventListener('ended', () => this.#ended(node));
    node.stop(stop);
    this.#stops.set(node, stop);
    this.#end = Math.max(this.#end, stop);
  }

  #ended(node: AudioScheduledSourceNode): void {
    if (!this.#live.delete(node) || this.#live.size > 0 || this.#done) return;
    this.#done = true;
    for (const n of this.#nodes) n.disconnect();
    for (const fn of this.#onDone.splice(0)) fn();
  }
}
