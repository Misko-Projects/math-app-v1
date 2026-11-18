// A recording stand-in for the Web Audio API, for unit tests in Node (no real audio). It models
// just enough of AudioContext for the AudioManager, the SFX synth and the music player: a clock the
// test advances, nodes that remember their connections, AudioParams that record automation, and
// buffer sources that fire `onended` when the clock passes their scheduled end.

export type ParamEvent =
  | { type: 'set'; value: number; time: number }
  | { type: 'linear'; value: number; time: number }
  | { type: 'exp'; value: number; time: number }
  | { type: 'target'; value: number; time: number; timeConstant: number }
  | { type: 'curve'; values: number[]; time: number; duration: number }
  | { type: 'cancel'; time: number }
  | { type: 'hold'; time: number };

export class FakeAudioParam {
  readonly events: ParamEvent[] = [];
  readonly defaultValue: number;
  readonly minValue = -3.4e38;
  readonly maxValue = 3.4e38;
  automationRate: 'a-rate' | 'k-rate' = 'a-rate';
  #value: number;

  constructor(defaultValue: number) {
    this.defaultValue = defaultValue;
    this.#value = defaultValue;
  }
  get value(): number {
    return this.#value;
  }
  set value(v: number) {
    assertFinite(v, 'AudioParam.value');
    this.#value = v;
  }
  setValueAtTime(value: number, time: number): this {
    assertFinite(value, 'setValueAtTime value');
    assertTime(time);
    this.events.push({ type: 'set', value, time });
    this.#value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    assertFinite(value, 'linearRampToValueAtTime value');
    assertTime(time);
    this.events.push({ type: 'linear', value, time });
    this.#value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    if (value === 0 || !Number.isFinite(value)) {
      // Real browsers throw a RangeError for 0; catching it here keeps synth code honest.
      throw new RangeError(`exponentialRampToValueAtTime: value must be non-zero, got ${value}`);
    }
    assertTime(time);
    this.events.push({ type: 'exp', value, time });
    this.#value = value;
    return this;
  }
  setTargetAtTime(value: number, time: number, timeConstant: number): this {
    assertFinite(value, 'setTargetAtTime value');
    assertTime(time);
    if (!(timeConstant >= 0)) throw new RangeError('setTargetAtTime: timeConstant must be ≥ 0');
    this.events.push({ type: 'target', value, time, timeConstant });
    this.#value = value;
    return this;
  }
  setValueCurveAtTime(values: Iterable<number>, time: number, duration: number): this {
    assertTime(time);
    const list = Array.from(values);
    this.events.push({ type: 'curve', values: list, time, duration });
    const last = list.at(-1);
    if (last !== undefined) this.#value = last;
    return this;
  }
  cancelScheduledValues(time: number): this {
    assertTime(time);
    this.events.push({ type: 'cancel', time });
    return this;
  }
  cancelAndHoldAtTime(time: number): this {
    assertTime(time);
    this.events.push({ type: 'hold', time });
    return this;
  }
  /** The most recent event's target value (what the param is heading to). */
  lastTarget(): number | undefined {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const e = this.events[i];
      if (e && 'value' in e) return e.value;
    }
    return undefined;
  }
}

function assertFinite(v: number, what: string): void {
  if (!Number.isFinite(v)) throw new TypeError(`${what} must be finite, got ${v}`);
}
function assertTime(t: number): void {
  if (!Number.isFinite(t) || t < 0) throw new RangeError(`time must be finite and ≥ 0, got ${t}`);
}

let nextNodeId = 1;

export class FakeAudioNode {
  readonly id = nextNodeId++;
  readonly kind: string;
  readonly context: FakeAudioContext;
  readonly outputs = new Set<FakeAudioNode | FakeAudioParam>();
  disconnected = false;
  channelCount = 2;
  numberOfInputs = 1;
  numberOfOutputs = 1;

  constructor(context: FakeAudioContext, kind: string) {
    this.context = context;
    this.kind = kind;
    context.nodes.push(this);
  }
  connect<T extends FakeAudioNode | FakeAudioParam>(dest: T): T {
    if (dest instanceof FakeAudioNode && dest.context !== this.context) {
      throw new Error('connect: nodes belong to different contexts');
    }
    this.outputs.add(dest);
    this.disconnected = false;
    return dest;
  }
  disconnect(dest?: FakeAudioNode | FakeAudioParam): void {
    if (dest) this.outputs.delete(dest);
    else this.outputs.clear();
    if (this.outputs.size === 0) this.disconnected = true;
  }
  /** True when a path of connections leads from this node to `target`. */
  reaches(target: FakeAudioNode | FakeAudioParam, seen = new Set<FakeAudioNode>()): boolean {
    if (seen.has(this)) return false;
    seen.add(this);
    for (const out of this.outputs) {
      if (out === target) return true;
      if (out instanceof FakeAudioNode && out.reaches(target, seen)) return true;
    }
    return false;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'gain');
  }
}

export class FakeAudioBuffer {
  readonly sampleRate: number;
  readonly length: number;
  readonly numberOfChannels: number;
  readonly #channels: Float32Array[];
  /** Test label (e.g. the clip id the buffer was decoded from). */
  label?: string;

  constructor(opts: { numberOfChannels?: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels ?? 1;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.#channels = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(opts.length),
    );
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    const data = this.#channels[channel];
    if (!data) throw new RangeError(`getChannelData: no channel ${channel}`);
    return data;
  }
  copyToChannel(source: Float32Array, channel: number): void {
    this.getChannelData(channel).set(source);
  }
}

export class FakeScheduledSource extends FakeAudioNode {
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  ended = false;
  onended: ((ev: Event) => void) | null = null;
  readonly #listeners = new Set<() => void>();

  start(when = 0): void {
    if (this.startedAt !== null) throw new Error('InvalidStateError: start() called twice');
    assertTime(when);
    this.startedAt = Math.max(when, this.context.currentTime);
    this.context.scheduled.add(this);
  }
  stop(when = 0): void {
    if (this.startedAt === null) throw new Error('InvalidStateError: stop() before start()');
    assertTime(when);
    this.stoppedAt = Math.max(when, this.context.currentTime);
  }
  addEventListener(type: string, fn: () => void): void {
    if (type === 'ended') this.#listeners.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    if (type === 'ended') this.#listeners.delete(fn);
  }
  /** Natural end time (Infinity for sources that run until stopped). */
  naturalEnd(): number {
    return Number.POSITIVE_INFINITY;
  }
  endTime(): number {
    if (this.startedAt === null) return Number.POSITIVE_INFINITY;
    return Math.min(this.stoppedAt ?? Number.POSITIVE_INFINITY, this.naturalEnd());
  }
  fireEnded(): void {
    if (this.ended) return;
    this.ended = true;
    const ev = { type: 'ended', target: this } as unknown as Event;
    this.onended?.(ev);
    for (const fn of this.#listeners) fn();
  }
}

export class FakeBufferSource extends FakeScheduledSource {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeAudioParam(1);
  readonly detune = new FakeAudioParam(0);
  offset = 0;

  constructor(ctx: FakeAudioContext) {
    super(ctx, 'bufferSource');
  }
  override start(when = 0, offset = 0): void {
    super.start(when);
    this.offset = offset;
  }
  override naturalEnd(): number {
    if (this.startedAt === null || !this.buffer || this.loop) return Number.POSITIVE_INFINITY;
    const rate = this.playbackRate.value || 1;
    return this.startedAt + Math.max(0, this.buffer.duration - this.offset) / rate;
  }
}

export class FakeOscillator extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam(440);
  readonly detune = new FakeAudioParam(0);
  periodicWave: unknown = null;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'oscillator');
  }
  setPeriodicWave(wave: unknown): void {
    this.type = 'custom';
    this.periodicWave = wave;
  }
}

export class FakeConstantSource extends FakeScheduledSource {
  readonly offset = new FakeAudioParam(1);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'constantSource');
  }
}

export class FakeBiquadFilter extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam(0);
  readonly detune = new FakeAudioParam(0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'biquad');
  }
}

export class FakeDelay extends FakeAudioNode {
  readonly delayTime = new FakeAudioParam(0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'delay');
  }
}

export class FakeStereoPanner extends FakeAudioNode {
  readonly pan = new FakeAudioParam(0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'stereoPanner');
  }
}

export class FakeCompressor extends FakeAudioNode {
  readonly threshold = new FakeAudioParam(-24);
  readonly knee = new FakeAudioParam(30);
  readonly ratio = new FakeAudioParam(12);
  readonly attack = new FakeAudioParam(0.003);
  readonly release = new FakeAudioParam(0.25);
  readonly reduction = 0;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'compressor');
  }
}

export class FakeWaveShaper extends FakeAudioNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = 'none';
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'waveShaper');
  }
}

export class FakeConvolver extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  normalize = true;
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'convolver');
  }
}

export interface FakeAudioContextOptions {
  /** Initial state. Real contexts created before a user gesture start `suspended`. */
  state?: AudioContextState;
  sampleRate?: number;
  /** Duration in seconds for each decoded buffer; default: one second per 1000 input bytes. */
  decodeDuration?: (data: ArrayBuffer) => number;
  /** Make `decodeAudioData` reject for these inputs (simulates a corrupt clip). */
  decodeFails?: (data: ArrayBuffer) => boolean;
  /** Make `resume()` leave the context suspended (simulates a browser refusing to unlock). */
  refuseResume?: boolean;
}

export class FakeAudioContext {
  readonly sampleRate: number;
  readonly nodes: FakeAudioNode[] = [];
  readonly scheduled = new Set<FakeScheduledSource>();
  readonly destination: FakeAudioNode;
  readonly listener = {};
  state: AudioContextState;
  currentTime = 0;
  baseLatency = 0;
  onstatechange: ((ev: Event) => void) | null = null;
  resumeCalls = 0;
  readonly #opts: FakeAudioContextOptions;
  readonly #stateListeners = new Set<() => void>();

  constructor(opts: FakeAudioContextOptions = {}) {
    this.#opts = opts;
    this.sampleRate = opts.sampleRate ?? 48_000;
    this.state = opts.state ?? 'suspended';
    this.destination = new FakeAudioNode(this, 'destination');
  }

  createGain(): FakeGainNode {
    return new FakeGainNode(this);
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource(this);
  }
  createOscillator(): FakeOscillator {
    return new FakeOscillator(this);
  }
  createConstantSource(): FakeConstantSource {
    return new FakeConstantSource(this);
  }
  createBiquadFilter(): FakeBiquadFilter {
    return new FakeBiquadFilter(this);
  }
  createDelay(_maxDelayTime = 1): FakeDelay {
    return new FakeDelay(this);
  }
  createStereoPanner(): FakeStereoPanner {
    return new FakeStereoPanner(this);
  }
  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor(this);
  }
  createWaveShaper(): FakeWaveShaper {
    return new FakeWaveShaper(this);
  }
  createConvolver(): FakeConvolver {
    return new FakeConvolver(this);
  }
  createPeriodicWave(real: ArrayLike<number>, imag: ArrayLike<number>): unknown {
    return { real: Array.from(real), imag: Array.from(imag) };
  }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    if (length <= 0) throw new RangeError('createBuffer: length must be > 0');
    return new FakeAudioBuffer({ numberOfChannels, length, sampleRate });
  }
  decodeAudioData(data: ArrayBuffer): Promise<FakeAudioBuffer> {
    if (this.#opts.decodeFails?.(data)) {
      return Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
    }
    const seconds = this.#opts.decodeDuration?.(data) ?? data.byteLength / 1000;
    const length = Math.max(1, Math.round(seconds * this.sampleRate));
    const buffer = new FakeAudioBuffer({ length, sampleRate: this.sampleRate });
    const label = bufferLabels.get(data);
    if (label !== undefined) buffer.label = label;
    return Promise.resolve(buffer);
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    if (!this.#opts.refuseResume && this.state !== 'closed') this.#setState('running');
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    if (this.state !== 'closed') this.#setState('suspended');
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.#setState('closed');
    return Promise.resolve();
  }
  addEventListener(type: string, fn: () => void): void {
    if (type === 'statechange') this.#stateListeners.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    if (type === 'statechange') this.#stateListeners.delete(fn);
  }

  /** Test helper: the OS or browser changed the state (e.g. Android suspends a background tab). */
  simulateState(state: AudioContextState): void {
    this.#setState(state);
  }

  /** Advance the clock by `seconds`, firing `onended` for sources whose end time has passed. */
  advance(seconds: number): void {
    this.advanceTo(this.currentTime + seconds);
  }
  advanceTo(time: number): void {
    // Fire ends in time order so chained callbacks see a consistent clock.
    for (;;) {
      let next: FakeScheduledSource | null = null;
      for (const s of this.scheduled) {
        if (s.ended) continue;
        const end = s.endTime();
        if (end <= time && (!next || end < next.endTime())) next = s;
      }
      if (!next) break;
      this.currentTime = Math.max(this.currentTime, next.endTime());
      this.scheduled.delete(next);
      next.fireEnded();
    }
    this.currentTime = Math.max(this.currentTime, time);
  }

  nodesOfKind<T extends FakeAudioNode>(kind: string): T[] {
    return this.nodes.filter((n) => n.kind === kind) as T[];
  }
  bufferSources(): FakeBufferSource[] {
    return this.nodesOfKind<FakeBufferSource>('bufferSource');
  }
  oscillators(): FakeOscillator[] {
    return this.nodesOfKind<FakeOscillator>('oscillator');
  }

  #setState(state: AudioContextState): void {
    if (this.state === state) return;
    this.state = state;
    const ev = { type: 'statechange' } as Event;
    this.onstatechange?.(ev);
    for (const fn of this.#stateListeners) fn();
  }
}

const bufferLabels = new WeakMap<ArrayBuffer, string>();

/** Encoded test audio: `durationSec` long once decoded, and the decoded buffer carries `label`. */
export function fakeEncodedClip(label: string, durationSec: number): ArrayBuffer {
  const data = new ArrayBuffer(Math.max(1, Math.round(durationSec * 1000)));
  bufferLabels.set(data, label);
  return data;
}

/**
 * Like `node.reaches(target)`, but a connection into an AudioParam (e.g. an FM modulator driving a
 * carrier's frequency) continues from the node that owns that param.
 */
export function reachesThroughParams(
  node: FakeAudioNode,
  target: FakeAudioNode,
  seen = new Set<FakeAudioNode>(),
): boolean {
  if (seen.has(node)) return false;
  seen.add(node);
  for (const out of node.outputs) {
    const next =
      out instanceof FakeAudioNode
        ? out
        : node.context.nodes.find((n) => Object.values(n).includes(out));
    if (next === target) return true;
    if (next && reachesThroughParams(next, target, seen)) return true;
  }
  return false;
}

/** The fake, typed as the real interface for code under test. */
export function asAudioContext(ctx: FakeAudioContext): AudioContext {
  return ctx as unknown as AudioContext;
}
