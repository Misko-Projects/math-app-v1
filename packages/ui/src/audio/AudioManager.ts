// The Web Audio implementation of the 02 §5.5 `AudioManager`.
//
// Graph:   voice line gains ─► voice bus ─┐
//          sfx voices ───────► sfx bus ───┼─► master ─► gentle compressor ─► destination
//          music tracks ─────► music bus ─► duck ─┘
//
// Narration rules (06 §5): narration never overlaps itself. A new line cancels the current one and
// anything queued, except feedback: `fb.*` lines and Glim's AI lines (`sayPhrases`, `sayText`) wait
// for the line in progress to finish. Music ducks under every spoken line, clips and Web Speech
// alike. Lines are stitched gaplessly from pre-rendered clips (03 §8.4); when the manifest or any
// spoken clip is missing, the whole line falls back to on-device Web Speech with a dev warning.
//
// Nothing plays before `unlock()` runs inside a user gesture (06 §5: the first tap of the Profile
// Picker). Calls made while locked resolve at once without sound; `state` tells the app to show its
// big "Tap to start".
import {
  type AudioManager,
  type AudioManifest,
  audioManifestSchema,
  type ClipId,
  type FamilySettings,
  type MusicId,
  type NarrationJson,
  type NarrationKey,
  type NarrationVoice,
  type PhrasePart,
  type SfxId,
} from '@number-island/shared';
import { MusicPlayer } from './music/player';
import { isKnownMusic } from './music/tracks';
import { type LinePlan, planLine, planPhrases } from './narration';
import {
  type AudioSettings,
  audioSettingsFromFamily,
  DEFAULT_AUDIO_SETTINGS,
  mergeAudioSettings,
  normalizeAudioSettings,
} from './settings';
import { isKnownSfx } from './sfx/catalog';
import { playSfx, type SfxVoice } from './sfx/synth';
import { createWebSpeech, type SpeechBackend } from './speech';

export type AudioState = 'locked' | 'running' | 'unavailable';

export type AudioEvent =
  | { type: 'state'; state: AudioState }
  | {
      type: 'line-start';
      lineId: number;
      key?: NarrationKey;
      text: string;
      voice: NarrationVoice;
      via: 'clips' | 'speech';
      clips: ClipId[];
    }
  | { type: 'clip-start'; lineId: number; index: number; clip: ClipId }
  | { type: 'line-end'; lineId: number; reason: 'done' | 'cancelled' };

export type AudioListener = (event: AudioEvent) => void;

type Loadable<T> = T | (() => Promise<T>);

export interface AudioTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface WebAudioManagerOptions {
  /** Compiled `narration.json` (02 §5.5), or a loader; loaded once, on first use. */
  narration: Loadable<NarrationJson>;
  /** `public/audio/manifest.json`, or a loader. `null` (or a loader resolving null) = no clips. */
  manifest?: Loadable<AudioManifest | null>;
  /** Where manifest files live. Default `/audio/`. */
  audioBaseUrl?: string;
  /** Creates the AudioContext inside `unlock()`. Return null when Web Audio is unavailable. */
  createContext?: () => AudioContext | null;
  /** Fetches one clip file. Default: `fetch` → ArrayBuffer. */
  fetchClip?: (url: string) => Promise<ArrayBuffer>;
  /** Web Speech backend. Default: the browser's speechSynthesis. */
  speech?: SpeechBackend;
  timers?: AudioTimers;
  /** Dev warnings (missing clips, unknown keys). Default: console.warn in dev builds only. */
  warn?: (message: string) => void;
  /** Which narration keys queue behind the current line instead of cancelling it (06 §5). */
  isQueuedKey?: (key: NarrationKey) => boolean;
  settings?: AudioSettings;
  /** Decoded clips kept in memory. Default 160. */
  clipCacheSize?: number;
}

/** Music level while someone speaks (about −10 dB). */
export const DUCK_LEVEL = 0.3;
/** Fade applied when a line is cut off, so cancellation never clicks. */
export const CANCEL_FADE_SEC = 0.04;
/** Lead time before the first clip, so the whole line can be scheduled gaplessly. */
export const LINE_START_DELAY_SEC = 0.02;
const MAX_SFX_VOICES = 8;
const SFX_RETRIGGER_SEC = 0.04;
const RESUME_TIMEOUT_MS = 1500;
/** Longest wait for narration.json, the manifest or a line's clips before falling back. */
export const LOAD_TIMEOUT_MS = 5000;

type LineRequest =
  | { kind: 'key'; key: NarrationKey; vars?: Record<string, string | number> }
  | { kind: 'phrases'; parts: PhrasePart[] }
  | { kind: 'text'; text: string; voice: NarrationVoice };

interface Line {
  id: number;
  request: LineRequest;
  phase: 'waiting' | 'preparing' | 'playing' | 'done';
  resolve: () => void;
  promise: Promise<void>;
  stopPlayback: (() => void) | null;
}

interface Buses {
  master: GainNode;
  voice: GainNode;
  sfx: GainNode;
  music: GainNode;
  duck: GainNode;
}

export const isFeedbackKey = (key: NarrationKey): boolean => key.startsWith('fb.');

export class WebAudioManager implements AudioManager {
  readonly #opts: WebAudioManagerOptions;
  readonly #speech: SpeechBackend;
  readonly #timers: AudioTimers;
  readonly #warn: (message: string) => void;
  readonly #warned = new Set<string>();
  readonly #listeners = new Set<AudioListener>();
  readonly #clipCache = new Map<string, Promise<AudioBuffer>>();

  #settings: AudioSettings;
  #state: AudioState = 'locked';
  #ctx: AudioContext | null = null;
  #buses: Buses | null = null;
  #narration: Promise<NarrationJson> | null = null;
  #manifest: Promise<AudioManifest | null> | null = null;
  #current: Line | null = null;
  #queue: Line[] = [];
  #nextLineId = 1;
  #ducked = false;
  #speechPrimed = false;
  #hidden = false;
  #detach: (() => void) | null = null;
  #sfxVoices: SfxVoice[] = [];
  #lastSfx = new Map<string, number>();
  readonly #ownsSpeech: boolean;
  #disposed = false;
  /** Context time when a cut-off line's fade-out ends; the next line starts no earlier. */
  #voiceFreeAt = 0;
  #music: MusicPlayer | null = null;
  #desiredMusic: MusicId | null = null;

  constructor(opts: WebAudioManagerOptions) {
    this.#opts = opts;
    this.#ownsSpeech = opts.speech === undefined;
    this.#speech = opts.speech ?? createWebSpeech();
    this.#timers = opts.timers ?? (globalThis as unknown as AudioTimers);
    this.#warn = opts.warn ?? defaultWarn;
    this.#settings = normalizeAudioSettings(opts.settings ?? DEFAULT_AUDIO_SETTINGS);
  }

  // ---------- state ----------

  get state(): AudioState {
    return this.#state;
  }
  get settings(): AudioSettings {
    return this.#settings;
  }
  /** True while a line is being prepared or spoken. */
  get speaking(): boolean {
    return this.#current !== null;
  }
  /** The music track requested last (it may be silent while music is disabled or locked). */
  get musicTrack(): MusicId | null {
    return this.#desiredMusic;
  }

  subscribe(listener: AudioListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Call synchronously from the first user gesture's handler (06 §5). Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (this.#disposed) return;
    // Must run before any await: speech permission is tied to the gesture (Chrome, Android).
    if (!this.#speechPrimed) {
      this.#speechPrimed = true;
      this.#speech.prime();
    }
    if (this.#state === 'running') return;
    const ctx = this.#ensureContext();
    if (!ctx) {
      this.#setState('unavailable');
      return;
    }
    try {
      // A one-sample silent buffer started in the gesture unlocks older WebKit/Android builds too.
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const kick = ctx.createBufferSource();
      kick.buffer = buffer;
      kick.connect(ctx.destination);
      kick.start(0);
    } catch {
      // Not needed where resume() suffices.
    }
    try {
      await withTimeout(ctx.resume(), RESUME_TIMEOUT_MS, this.#timers);
    } catch (e) {
      this.#warnOnce(`audio: resume() did not complete (${String(e)})`);
    }
    this.#syncState();
  }

  // ---------- narration ----------

  say(key: NarrationKey, vars?: Record<string, string | number>): Promise<void> {
    const queued = (this.#opts.isQueuedKey ?? isFeedbackKey)(key);
    return this.#submit({ kind: 'key', key, ...(vars ? { vars } : {}) }, queued);
  }

  sayPhrases(parts: ({ id: string } | { number: number })[]): Promise<void> {
    return this.#submit({ kind: 'phrases', parts: [...parts] }, true);
  }

  sayText(text: string, opts?: { voice?: 'glim' | 'narrator' }): Promise<void> {
    return this.#submit({ kind: 'text', text, voice: opts?.voice ?? 'glim' }, true);
  }

  /** Cuts off the line in progress and drops queued lines, leaving music and SFX alone. */
  cancelSpeech(): void {
    const queued = this.#queue;
    this.#queue = [];
    for (const line of queued) this.#finish(line, 'cancelled');
    if (this.#current) this.#finish(this.#current, 'cancelled');
    this.#speech.cancel();
  }

  // ---------- sfx, music, volumes ----------

  sfx(id: SfxId): void {
    const ctx = this.#ctx;
    const buses = this.#buses;
    if (this.#state !== 'running' || !ctx || !buses) return;
    if (!isKnownSfx(id)) {
      this.#warnOnce(`audio: unknown sfx "${id}"`);
      return;
    }
    const now = ctx.currentTime;
    const last = this.#lastSfx.get(id);
    // A double-fired event should not stack the same sound into a loud flam.
    if (last !== undefined && now - last < SFX_RETRIGGER_SEC) return;
    this.#lastSfx.set(id, now);
    this.#sfxVoices = this.#sfxVoices.filter((v) => v.endTime > now);
    while (this.#sfxVoices.length >= MAX_SFX_VOICES) this.#sfxVoices.shift()?.stop();
    try {
      this.#sfxVoices.push(playSfx(ctx, buses.sfx, id, now + 0.005));
    } catch (e) {
      this.#warnOnce(`audio: sfx "${id}" failed (${String(e)})`);
    }
  }

  music(track: MusicId | null): void {
    if (track !== null && !isKnownMusic(track)) {
      this.#warnOnce(`audio: unknown music track "${track}"`);
      return;
    }
    this.#desiredMusic = track;
    this.#applyMusic();
  }

  /** Silences everything: narration (current and queued), SFX and music. */
  stop(): void {
    this.cancelSpeech();
    for (const v of this.#sfxVoices) v.stop();
    this.#sfxVoices = [];
    this.#desiredMusic = null;
    this.#music?.play(null);
  }

  setVolumes(v: { voice: number; sfx: number; music: number }): void {
    this.configure({ volumes: v });
  }

  /** Applies volumes, voice rate and the music switch. Takes effect immediately. */
  configure(
    patch: Partial<Omit<AudioSettings, 'volumes'>> & {
      volumes?: Partial<AudioSettings['volumes']>;
    },
  ): void {
    const before = this.#settings;
    this.#settings = mergeAudioSettings(before, patch);
    this.#applyGains();
    if (before.musicEnabled !== this.#settings.musicEnabled) this.#applyMusic();
  }

  /** Maps the family settings document (02 §5.8) onto the mixer. */
  applyFamilySettings(s: Pick<FamilySettings, 'music' | 'volumes' | 'voiceRate'>): void {
    this.configure(audioSettingsFromFamily(s));
  }

  /** Releases the AudioContext. Terminal: afterwards every call is a silent no-op. */
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.stop();
    this.#disposed = true;
    if (this.#ownsSpeech) this.#speech.dispose?.();
    this.#music?.dispose();
    this.#music = null;
    this.#detach?.();
    this.#detach = null;
    const ctx = this.#ctx;
    this.#ctx = null;
    this.#buses = null;
    this.#setState('unavailable');
    await ctx?.close().catch(() => {});
  }

  // ---------- internals: lines ----------

  #voiceAllowed(): boolean {
    if (this.#disposed) return false;
    return this.#state === 'running' || (this.#state === 'unavailable' && this.#speech.available);
  }

  #submit(request: LineRequest, queued: boolean): Promise<void> {
    if (!this.#voiceAllowed()) {
      if (!this.#disposed) {
        this.#warnOnce('audio: narration requested before unlock(); nothing played');
      }
      return Promise.resolve();
    }
    let resolve: () => void = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    const line: Line = {
      id: this.#nextLineId++,
      request,
      phase: 'waiting',
      resolve,
      promise,
      stopPlayback: null,
    };
    if (!queued) this.cancelSpeech();
    if (this.#current) {
      this.#queue.push(line);
    } else {
      this.#current = line;
      void this.#run(line);
    }
    return promise;
  }

  async #run(line: Line): Promise<void> {
    line.phase = 'preparing';
    // A closure, so TypeScript does not narrow `phase` across the awaits (cancel() changes it).
    const cancelled = () => line.phase === 'done';
    this.#setDucked(true);
    try {
      const plan = await this.#plan(line.request);
      if (cancelled()) return;
      if (!plan) {
        this.#finish(line, 'done');
        return;
      }
      for (const p of plan.problems) this.#warnOnce(`audio: ${p}`);
      const loaded = plan.clips ? await this.#loadClips(plan) : null;
      if (cancelled()) return;
      if (loaded) this.#playClips(line, plan, loaded);
      else this.#speak(line, plan);
    } catch (e) {
      this.#warnOnce(`audio: line failed (${String(e)})`);
      this.#finish(line, 'done');
    }
  }

  async #plan(request: LineRequest): Promise<LinePlan | null> {
    if (request.kind === 'text') {
      return {
        text: request.text,
        spoken: request.text,
        voice: request.voice,
        clips: null,
        problems: [],
      };
    }
    let narration: NarrationJson;
    try {
      narration = await withTimeout(this.#loadNarration(), LOAD_TIMEOUT_MS, this.#timers);
    } catch {
      this.#warnOnce('audio: narration.json is taking too long; a line was skipped');
      return null;
    }
    if (request.kind === 'phrases') return planPhrases(narration, request.parts);
    const plan = planLine(narration, request.key, request.vars);
    if (!plan) this.#warnOnce(`audio: narration key "${request.key}" is not in narration.json`);
    return plan;
  }

  async #loadClips(plan: LinePlan): Promise<{ ids: ClipId[]; buffers: AudioBuffer[] } | null> {
    const ctx = this.#ctx;
    if (!ctx || this.#state !== 'running' || !plan.clips) return null;
    let manifest: AudioManifest | null;
    try {
      // Bounded: a stalled request must not freeze narration (the late answer is still cached).
      manifest = await withTimeout(this.#loadManifest(), LOAD_TIMEOUT_MS, this.#timers);
    } catch {
      this.#warnOnce('audio: the audio manifest is taking too long; using Web Speech');
      return null;
    }
    if (!manifest) {
      this.#warnOnce('audio: no audio manifest; narration falls back to Web Speech');
      return null;
    }
    const ids: ClipId[] = [];
    for (const clip of plan.clips) {
      const id = clip.candidates.find((c) => manifest.clips[c] !== undefined);
      if (id !== undefined) ids.push(id);
      else if (!clip.optional) {
        this.#warnOnce(`audio: clip "${clip.candidates.at(-1)}" is missing; using Web Speech`);
        return null;
      }
    }
    const loads = ids.map((id) => {
      const url = this.#clipUrl(manifest, id);
      const entry = { url, promise: this.#clipBuffer(ctx, url), settled: false };
      entry.promise.then(
        () => {
          entry.settled = true;
        },
        () => {
          entry.settled = true;
        },
      );
      return entry;
    });
    try {
      const buffers = await withTimeout(
        Promise.all(loads.map((l) => l.promise)),
        LOAD_TIMEOUT_MS,
        this.#timers,
      );
      return { ids, buffers };
    } catch (e) {
      // Forget requests that are still pending, so a retry fetches afresh instead of joining a
      // stalled one.
      for (const l of loads) {
        if (!l.settled && this.#clipCache.get(l.url) === l.promise) this.#clipCache.delete(l.url);
      }
      this.#warnOnce(`audio: a clip failed to load (${String(e)}); using Web Speech`);
      return null;
    }
  }

  #clipUrl(manifest: AudioManifest, id: ClipId): string {
    return joinUrl(this.#opts.audioBaseUrl ?? '/audio/', manifest.clips[id]?.file ?? '');
  }

  #clipBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    const cached = this.#clipCache.get(url);
    if (cached) {
      // Refresh recency (Map iteration order is insertion order).
      this.#clipCache.delete(url);
      this.#clipCache.set(url, cached);
      return cached;
    }
    const fetchClip = this.#opts.fetchClip ?? defaultFetchClip;
    const pending = fetchClip(url).then((data) => ctx.decodeAudioData(data));
    pending.catch(() => {
      if (this.#clipCache.get(url) === pending) this.#clipCache.delete(url);
    });
    this.#clipCache.set(url, pending);
    const limit = this.#opts.clipCacheSize ?? 160;
    while (this.#clipCache.size > limit) {
      const oldest = this.#clipCache.keys().next().value;
      if (oldest === undefined) break;
      this.#clipCache.delete(oldest);
    }
    return pending;
  }

  #playClips(line: Line, plan: LinePlan, loaded: { ids: ClipId[]; buffers: AudioBuffer[] }): void {
    const ctx = this.#ctx;
    const buses = this.#buses;
    if (!ctx || !buses) {
      this.#speak(line, plan);
      return;
    }
    line.phase = 'playing';
    this.#emit({
      type: 'line-start',
      lineId: line.id,
      ...(line.request.kind === 'key' ? { key: line.request.key } : {}),
      text: plan.text,
      voice: plan.voice,
      via: 'clips',
      clips: loaded.ids,
    });
    // A listener may have cancelled the line (stop(), or a new prompt) during that event.
    if (isDone(line)) return;
    if (loaded.buffers.length === 0) {
      this.#finish(line, 'done');
      return;
    }
    const lineGain = ctx.createGain();
    lineGain.connect(buses.voice);
    const rate = this.#settings.voiceRate;
    // Never overlap the fade-out of a line that was just cut off (06 §5).
    let t = Math.max(ctx.currentTime + LINE_START_DELAY_SEC, this.#voiceFreeAt);
    const sources = loaded.buffers.map((buffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.playbackRate.value = rate;
      s.connect(lineGain);
      s.start(t);
      t += buffer.duration / rate;
      return s;
    });
    sources.forEach((s, i) => {
      s.onended = () => {
        if (line.phase !== 'playing') return;
        const next = i + 1;
        if (next < sources.length) {
          this.#emit({
            type: 'clip-start',
            lineId: line.id,
            index: next,
            clip: loaded.ids[next] ?? '',
          });
        } else {
          lineGain.disconnect();
          this.#finish(line, 'done');
        }
      };
    });
    line.stopPlayback = () => {
      const now = ctx.currentTime;
      const fadeEnd = now + CANCEL_FADE_SEC;
      lineGain.gain.cancelScheduledValues(now);
      lineGain.gain.setValueAtTime(lineGain.gain.value, now);
      lineGain.gain.linearRampToValueAtTime(0, fadeEnd);
      for (const s of sources) {
        try {
          s.stop(fadeEnd);
        } catch {
          // Already stopped.
        }
      }
      this.#voiceFreeAt = Math.max(this.#voiceFreeAt, fadeEnd);
      this.#timers.setTimeout(() => lineGain.disconnect(), (CANCEL_FADE_SEC + 0.1) * 1000);
    };
    // Emitted only once cancellation can stop the sources: a listener may cancel here too.
    this.#emit({ type: 'clip-start', lineId: line.id, index: 0, clip: loaded.ids[0] ?? '' });
  }

  #speak(line: Line, plan: LinePlan): void {
    line.phase = 'playing';
    this.#emit({
      type: 'line-start',
      lineId: line.id,
      ...(line.request.kind === 'key' ? { key: line.request.key } : {}),
      text: plan.text,
      voice: plan.voice,
      via: 'speech',
      clips: [],
    });
    if (isDone(line)) return; // cancelled by a listener
    if (!this.#speech.available) {
      this.#warnOnce('audio: no on-device Web Speech voice; a line was skipped');
      this.#finish(line, 'done');
      return;
    }
    const start = () => {
      if (isDone(line)) return;
      const handle = this.#speech.speak(plan.spoken, {
        voice: plan.voice,
        rate: this.#settings.voiceRate,
        volume: this.#settings.volumes.voice,
      });
      line.stopPlayback = () => handle.cancel();
      void handle.done.then(() => {
        if (!isDone(line)) this.#finish(line, 'done');
      });
    };
    // Let a cut-off clip line finish its short fade before the voice starts (06 §5).
    const waitSec = this.#ctx ? this.#voiceFreeAt - this.#ctx.currentTime : 0;
    if (waitSec > 0) {
      const timer = this.#timers.setTimeout(start, Math.ceil(waitSec * 1000));
      line.stopPlayback = () => this.#timers.clearTimeout(timer);
    } else {
      start();
    }
  }

  #finish(line: Line, reason: 'done' | 'cancelled'): void {
    if (line.phase === 'done') return;
    const wasStarted = line.phase === 'playing';
    line.phase = 'done';
    if (reason === 'cancelled') line.stopPlayback?.();
    line.stopPlayback = null;
    if (wasStarted || reason === 'done') this.#emit({ type: 'line-end', lineId: line.id, reason });
    line.resolve();
    if (this.#current !== line) {
      this.#queue = this.#queue.filter((l) => l !== line);
      return;
    }
    this.#current = null;
    const next = this.#queue.shift();
    if (next) {
      this.#current = next;
      void this.#run(next);
    } else {
      this.#setDucked(false);
    }
  }

  // ---------- internals: context, buses, loading ----------

  #ensureContext(): AudioContext | null {
    if (this.#ctx) return this.#ctx;
    let ctx: AudioContext | null = null;
    try {
      ctx = (this.#opts.createContext ?? defaultCreateContext)();
    } catch (e) {
      this.#warnOnce(`audio: could not create an AudioContext (${String(e)})`);
    }
    if (!ctx) return null;
    this.#ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    // A soft safety limiter: transparent at normal levels, rounds off any stacked peaks.
    compressor.threshold.value = -10;
    compressor.knee.value = 8;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
    const master = ctx.createGain();
    master.connect(compressor);
    const voice = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    const duck = ctx.createGain();
    voice.connect(master);
    sfx.connect(master);
    music.connect(duck);
    duck.connect(master);
    this.#buses = { master, voice, sfx, music, duck };
    this.#applyGains(true);
    if (this.#ducked) duck.gain.value = DUCK_LEVEL;
    ctx.addEventListener('statechange', () => this.#syncState());
    // Hidden tabs throttle timers to ~1 Hz, which would starve the music scheduler into gaps:
    // fade music out while hidden and pick the track up again on return.
    const doc = (globalThis as { document?: Document }).document;
    if (doc) {
      const onVisibility = () => {
        this.#hidden = doc.visibilityState === 'hidden';
        this.#applyMusic();
      };
      doc.addEventListener('visibilitychange', onVisibility);
      this.#detach = () => doc.removeEventListener('visibilitychange', onVisibility);
    }
    return ctx;
  }

  #syncState(): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    const next: AudioState =
      ctx.state === 'running' ? 'running' : ctx.state === 'closed' ? 'unavailable' : 'locked';
    const before = this.#state;
    if (next === before) return;
    this.#setState(next);
    if (before === 'running') {
      // The OS suspended audio (e.g. Android backgrounded the tab): scheduled clips are frozen and
      // would never end, so settle every line now rather than leave callers waiting.
      this.cancelSpeech();
    }
    if (next === 'running') this.#applyMusic();
  }

  #setState(state: AudioState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.#emit({ type: 'state', state });
  }

  #applyGains(immediate = false): void {
    const ctx = this.#ctx;
    const buses = this.#buses;
    if (!ctx || !buses) return;
    const { volumes, musicEnabled } = this.#settings;
    const set = (g: GainNode, v: number) => {
      if (immediate) {
        g.gain.value = v;
        return;
      }
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.setTargetAtTime(v, now, 0.03);
    };
    set(buses.voice, volumes.voice);
    set(buses.sfx, volumes.sfx);
    set(buses.music, musicEnabled ? volumes.music : 0);
  }

  #setDucked(on: boolean): void {
    if (this.#ducked === on) return;
    this.#ducked = on;
    const ctx = this.#ctx;
    const duck = this.#buses?.duck;
    if (!ctx || !duck) return;
    const now = ctx.currentTime;
    duck.gain.cancelScheduledValues(now);
    duck.gain.setValueAtTime(duck.gain.value, now);
    if (on) duck.gain.setTargetAtTime(DUCK_LEVEL, now, 0.08);
    // Hold briefly after a line so back-to-back lines don't pump the music up and down.
    else duck.gain.setTargetAtTime(1, now + 0.3, 0.35);
  }

  #applyMusic(): void {
    const ctx = this.#ctx;
    const buses = this.#buses;
    if (!ctx || !buses || this.#state !== 'running') return;
    const want = this.#settings.musicEnabled && !this.#hidden ? this.#desiredMusic : null;
    if (!this.#music) {
      if (want === null) return;
      this.#music = new MusicPlayer(ctx, buses.music, { timers: this.#timers });
    }
    this.#music.play(want);
  }

  #loadNarration(): Promise<NarrationJson> {
    if (!this.#narration) {
      const source = this.#opts.narration;
      this.#narration = (typeof source === 'function' ? source() : Promise.resolve(source)).catch(
        (e: unknown) => {
          this.#warnOnce(`audio: narration.json failed to load (${String(e)})`);
          this.#narration = null; // retry on the next line
          return {};
        },
      );
    }
    return this.#narration;
  }

  #loadManifest(): Promise<AudioManifest | null> {
    if (!this.#manifest) {
      const source = this.#opts.manifest ?? null;
      this.#manifest = (typeof source === 'function' ? source() : Promise.resolve(source)).catch(
        (e: unknown) => {
          this.#warnOnce(`audio: audio manifest failed to load (${String(e)})`);
          return null;
        },
      );
    }
    return this.#manifest;
  }

  #emit(event: AudioEvent): void {
    for (const l of this.#listeners) {
      try {
        l(event);
      } catch (e) {
        this.#warnOnce(`audio: listener threw (${String(e)})`);
      }
    }
  }

  #warnOnce(message: string): void {
    if (this.#warned.has(message)) return;
    if (this.#warned.size > 500) this.#warned.clear();
    this.#warned.add(message);
    this.#warn(message);
  }
}

export function createAudioManager(opts: WebAudioManagerOptions): WebAudioManager {
  return new WebAudioManager(opts);
}

/**
 * Loads `manifest.json`. Resolves null, never rejects, when it is absent (a fresh checkout before
 * `pnpm narration:render`) or invalid, so narration falls back to Web Speech.
 */
export async function loadAudioManifest(
  url = '/audio/manifest.json',
  fetchImpl: typeof fetch = globalThis.fetch,
  warn: (message: string) => void = defaultWarn,
): Promise<AudioManifest | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      warn(`audio: no audio manifest at ${url} (HTTP ${res.status}); narration uses Web Speech`);
      return null;
    }
    const parsed = audioManifestSchema.safeParse(await res.json());
    if (!parsed.success) {
      warn(`audio: ${url} is not a valid audio manifest; narration uses Web Speech`);
      return null;
    }
    return parsed.data;
  } catch (e) {
    warn(`audio: could not load ${url} (${String(e)}); narration uses Web Speech`);
    return null;
  }
}

/** A function, so TypeScript re-reads `phase` after calls that may change it. */
function isDone(line: Line): boolean {
  return line.phase === 'done';
}

function defaultCreateContext(): AudioContext | null {
  const g = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
}

async function defaultFetchClip(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.arrayBuffer();
}

function defaultWarn(message: string): void {
  if (import.meta.env?.DEV) console.warn(message);
}

function joinUrl(base: string, file: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}${file.replace(/^\/+/, '')}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, timers: AudioTimers): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = timers.setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        timers.clearTimeout(handle);
        resolve(v);
      },
      (e: unknown) => {
        timers.clearTimeout(handle);
        reject(e);
      },
    );
  });
}
