// The music player: a lookahead scheduler that plays one procedural track at a time and crossfades
// between tracks. Each track run owns a bus (fade gain, level, soft echo, gentle lowpass); notes
// are scheduled a little ahead of the audio clock from a timer, so timer jitter never makes
// notes late. A run that fades out stops scheduling, and its bus is disconnected once its last
// notes have ended.

import type { NodeBag } from '../sfx/dsp';
import { scheduleNote } from './instruments';
import { trackEvents, trackInfo } from './sequencer';
import { type InstrumentId, isKnownMusic, type KnownMusicId, TRACKS } from './tracks';

export interface TimerApi {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface MusicPlayerOptions {
  timers?: TimerApi;
  /** How far ahead of the audio clock notes are scheduled (seconds). */
  lookaheadSec?: number;
  /** Scheduler tick (milliseconds). */
  intervalMs?: number;
  /** Track-to-track crossfade, also used to fade in from and out to silence (seconds). */
  crossfadeSec?: number;
}

const globalTimers: TimerApi = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Fade used by `dispose()` (seconds). */
const DISPOSE_FADE_SEC = 0.05;
/** Equal-power fades are drawn with this many linear segments. */
const FADE_SEGMENTS = 8;
/** New runs start this far after `play()` so their first notes are never late. */
const START_DELAY_SEC = 0.05;

/** A track's mixing bus: per-instrument inputs → level → lowpass → fade gain → destination. */
class TrackBus {
  readonly fade: GainNode;
  readonly #ctx: BaseAudioContext;
  readonly #dry: GainNode;
  readonly #echo: DelayNode;
  readonly #nodes: AudioNode[] = [];
  readonly #inputs = new Map<InstrumentId, AudioNode>();
  readonly #sends: Map<InstrumentId, number>;

  constructor(ctx: BaseAudioContext, destination: AudioNode, id: KnownMusicId) {
    this.#ctx = ctx;
    const def = TRACKS[id];
    this.fade = this.#gain(1);
    this.fade.connect(destination);
    const tone = this.#track(ctx.createBiquadFilter());
    tone.type = 'lowpass';
    tone.frequency.value = 7000;
    tone.Q.value = 0.5;
    tone.connect(this.fade);
    this.#dry = this.#gain(def.level);
    this.#dry.connect(tone);
    // Soft dotted-eighth echo; each repeat is quieter and darker.
    this.#echo = this.#track(ctx.createDelay(1));
    this.#echo.delayTime.value = 3 * trackInfo(id).stepSec;
    const darken = this.#track(ctx.createBiquadFilter());
    darken.type = 'lowpass';
    darken.frequency.value = 2200;
    const feedback = this.#gain(0.3);
    this.#echo.connect(darken).connect(feedback).connect(this.#echo);
    this.#echo.connect(this.#gain(0.5)).connect(this.#dry);
    this.#sends = new Map();
    for (const part of def.parts) {
      const send = part.echo ?? 0;
      this.#sends.set(part.instrument, Math.max(send, this.#sends.get(part.instrument) ?? 0));
    }
  }

  input(instrument: InstrumentId): AudioNode {
    const existing = this.#inputs.get(instrument);
    if (existing) return existing;
    const input = this.#gain(1);
    input.connect(this.#dry);
    const send = this.#sends.get(instrument) ?? 0;
    if (send > 0) input.connect(this.#gain(send)).connect(this.#echo);
    this.#inputs.set(instrument, input);
    return input;
  }

  disconnect(): void {
    for (const node of this.#nodes) node.disconnect();
  }

  #gain(value: number): GainNode {
    const g = this.#track(this.#ctx.createGain());
    g.gain.value = value;
    return g;
  }

  #track<T extends AudioNode>(node: T): T {
    this.#nodes.push(node);
    return node;
  }
}

type GainPoint = readonly [time: number, value: number];

interface Run {
  readonly id: KnownMusicId;
  readonly bus: TrackBus;
  readonly start: number;
  readonly stepSec: number;
  nextStep: number;
  /** Set when the run is fading out: no notes are scheduled at or after this time. */
  fadeOutEnd: number | null;
  /** The fade automation as scheduled, to compute the gain at any time for a new fade. */
  points: GainPoint[];
  readonly live: Set<NodeBag>;
  closed: boolean;
}

function gainAt(points: readonly GainPoint[], t: number): number {
  let prev: GainPoint | undefined;
  for (const p of points) {
    if (t < p[0]) {
      if (!prev) return p[1];
      const x = (t - prev[0]) / (p[0] - prev[0]);
      return prev[1] + (p[1] - prev[1]) * x;
    }
    prev = p;
  }
  return prev?.[1] ?? 0;
}

/**
 * Ramps `param` from its current (modelled) value to `target` over `dur`, along `shape`
 * (progress 0→1). Returns the new automation points.
 */
function rampTo(
  param: AudioParam,
  points: readonly GainPoint[],
  now: number,
  target: number,
  dur: number,
  shape: (x: number) => number,
): GainPoint[] {
  const v0 = gainAt(points, now);
  param.cancelScheduledValues(now);
  param.setValueAtTime(v0, now);
  const out: GainPoint[] = [[now, v0]];
  for (let i = 1; i <= FADE_SEGMENTS; i += 1) {
    const x = i / FADE_SEGMENTS;
    const v = i === FADE_SEGMENTS ? target : v0 + (target - v0) * shape(x);
    param.linearRampToValueAtTime(v, now + dur * x);
    out.push([now + dur * x, v]);
  }
  return out;
}

const fadeInShape = (x: number) => Math.sin((x * Math.PI) / 2);
const fadeOutShape = (x: number) => 1 - Math.cos((x * Math.PI) / 2);

export class MusicPlayer {
  readonly #ctx: BaseAudioContext;
  readonly #destination: AudioNode;
  readonly #timers: TimerApi;
  readonly #lookahead: number;
  readonly #intervalMs: number;
  readonly #crossfade: number;
  readonly #runs = new Set<Run>();
  #current: Run | null = null;
  #timer: unknown = null;
  #disposed = false;

  constructor(ctx: BaseAudioContext, destination: AudioNode, opts: MusicPlayerOptions = {}) {
    this.#ctx = ctx;
    this.#destination = destination;
    this.#timers = opts.timers ?? globalTimers;
    this.#lookahead = opts.lookaheadSec ?? 0.2;
    this.#intervalMs = opts.intervalMs ?? 40;
    this.#crossfade = opts.crossfadeSec ?? 1.5;
  }

  /** The track playing (or fading in), or null. */
  get current(): string | null {
    return this.#current?.id ?? null;
  }

  /**
   * Crossfade to track `id`. `null` fades out; the same id as now playing is a no-op; an unknown id
   * is ignored (the caller warns).
   */
  play(id: string | null): void {
    if (this.#disposed || id === this.current) return;
    if (id !== null && !isKnownMusic(id)) return;
    const now = this.#ctx.currentTime;
    if (this.#current) this.#fadeOut(this.#current, now, this.#crossfade);
    this.#current = id === null ? null : this.#startRun(id, now);
    if (this.#runs.size > 0 && this.#timer === null) {
      this.#timer = this.#timers.setInterval(() => this.#tick(), this.#intervalMs);
    }
    this.#tick();
  }

  /** Stop everything with a very short fade and clear the timer. The player is unusable after. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const now = this.#ctx.currentTime;
    for (const run of this.#runs) {
      this.#fadeOut(run, now, DISPOSE_FADE_SEC);
      this.#retire(run, now + DISPOSE_FADE_SEC + 0.01);
    }
    this.#current = null;
    this.#stopTimer();
  }

  #startRun(id: KnownMusicId, now: number): Run {
    const bus = new TrackBus(this.#ctx, this.#destination, id);
    const run: Run = {
      id,
      bus,
      start: now + START_DELAY_SEC,
      stepSec: trackInfo(id).stepSec,
      nextStep: 0,
      fadeOutEnd: null,
      points: [[now, 0]],
      live: new Set(),
      closed: false,
    };
    run.points = rampTo(bus.fade.gain, run.points, now, 1, this.#crossfade, fadeInShape);
    this.#runs.add(run);
    return run;
  }

  #fadeOut(run: Run, now: number, dur: number): void {
    const end = now + dur;
    if (run.fadeOutEnd !== null && run.fadeOutEnd <= end) return;
    run.points = rampTo(run.bus.fade.gain, run.points, now, 0, dur, fadeOutShape);
    run.fadeOutEnd = end;
  }

  #tick(): void {
    const now = this.#ctx.currentTime;
    for (const run of this.#runs) {
      if (run.fadeOutEnd !== null && now >= run.fadeOutEnd) this.#retire(run, now);
      else this.#schedule(run, now);
    }
    if (this.#runs.size === 0) this.#stopTimer();
  }

  #schedule(run: Run, now: number): void {
    const horizon = Math.min(now + this.#lookahead, run.fadeOutEnd ?? Number.POSITIVE_INFINITY);
    const toStep = Math.ceil((horizon - run.start) / run.stepSec);
    // After a stall (e.g. a background tab), skip notes whose time has passed instead of bursting.
    const from = Math.max(run.nextStep, Math.ceil((now - run.start) / run.stepSec));
    if (toStep <= from) return;
    run.nextStep = toStep;
    for (const e of trackEvents(run.id, from, toStep)) {
      const when = run.start + e.time;
      if (run.fadeOutEnd !== null && when >= run.fadeOutEnd) continue;
      const bag = scheduleNote(this.#ctx, run.bus.input(e.instrument), e, when);
      run.live.add(bag);
      bag.onDone(() => {
        run.live.delete(bag);
        if (run.closed && run.live.size === 0) run.bus.disconnect();
      });
    }
  }

  /** Stop scheduling, stop any notes still sounding at `at`, and free the bus once they end. */
  #retire(run: Run, at: number): void {
    this.#runs.delete(run);
    run.closed = true;
    for (const bag of run.live) bag.stopAt(at);
    if (run.live.size === 0) run.bus.disconnect();
  }

  #stopTimer(): void {
    if (this.#timer === null) return;
    this.#timers.clearInterval(this.#timer);
    this.#timer = null;
  }
}

/**
 * Schedules `seconds` of track `id` from `startTime` into `destination` in one go (no timer). Used
 * for quality renders in an OfflineAudioContext.
 */
export function renderTrack(
  ctx: BaseAudioContext,
  destination: AudioNode,
  id: KnownMusicId,
  startTime: number,
  seconds: number,
): void {
  const bus = new TrackBus(ctx, destination, id);
  const { stepSec } = trackInfo(id);
  for (const e of trackEvents(id, 0, Math.ceil(seconds / stepSec))) {
    if (e.time < seconds) scheduleNote(ctx, bus.input(e.instrument), e, startTime + e.time);
  }
}
