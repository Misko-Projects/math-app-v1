import type { AudioManifest } from '@number-island/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AudioEvent,
  type AudioTimers,
  CANCEL_FADE_SEC,
  createAudioManager,
  DUCK_LEVEL,
  LINE_START_DELAY_SEC,
  LOAD_TIMEOUT_MS,
  loadAudioManifest,
  type WebAudioManagerOptions,
} from './AudioManager';
import { MusicPlayer } from './music/player';
import type { SpeakOptions, SpeechBackend } from './speech';
import {
  asAudioContext,
  FakeAudioContext,
  type FakeAudioContextOptions,
  type FakeBufferSource,
  type FakeCompressor,
  type FakeGainNode,
  fakeEncodedClip,
} from './testing/fakeAudioContext';
import {
  fixtureClipDurations,
  fixtureManifest,
  narrationFixture,
} from './testing/narrationFixture';

// ---------- harness ----------

class FakeSpeech implements SpeechBackend {
  available = true;
  primed = 0;
  cancels = 0;
  readonly lines: { text: string; opts: SpeakOptions; finish: () => void; cancelled: boolean }[] =
    [];
  speak(text: string, opts: SpeakOptions) {
    let finish: () => void = () => {};
    const done = new Promise<void>((r) => {
      finish = r;
    });
    const line = { text, opts, finish, cancelled: false };
    this.lines.push(line);
    return {
      done,
      cancel: () => {
        line.cancelled = true;
        finish();
      },
    };
  }
  cancel() {
    this.cancels += 1;
  }
  prime() {
    this.primed += 1;
  }
}

/** Timers that never fire on their own (the music scheduler and fade cleanups stay inert). */
type TestTimers = AudioTimers & {
  pending: Map<number, { fn: () => void; ms: number }>;
  /** Runs every pending timeout once (newly scheduled ones wait for the next call). */
  fireAll(): void;
};

function inertTimers(): TestTimers {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    pending,
    setTimeout: (fn, ms) => {
      const id = next++;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
    setInterval: () => 0,
    clearInterval: () => {},
    fireAll() {
      const due = [...pending.values()];
      pending.clear();
      for (const t of due) t.fn();
    },
  };
}

const durations = fixtureClipDurations();

interface Setup {
  ctx: FakeAudioContext;
  speech: FakeSpeech;
  warnings: string[];
  events: AudioEvent[];
  fetched: string[];
  timers: TestTimers;
  contextsCreated: () => number;
  manager: ReturnType<typeof createAudioManager>;
}

async function setup(
  opts: Partial<WebAudioManagerOptions> & { ctx?: FakeAudioContextOptions; locked?: boolean } = {},
): Promise<Setup> {
  const ctx = new FakeAudioContext(opts.ctx);
  const speech = new FakeSpeech();
  const warnings: string[] = [];
  const events: AudioEvent[] = [];
  const fetched: string[] = [];
  const timers = inertTimers();
  let created = 0;
  const manager = createAudioManager({
    narration: narrationFixture,
    manifest: fixtureManifest([], ['num.23.end#0']),
    createContext: () => {
      created += 1;
      return asAudioContext(ctx);
    },
    fetchClip: async (url) => {
      fetched.push(url);
      const id = url.replace(/^\/audio\//, '').replace(/\.opus$/, '');
      return fakeEncodedClip(id, durations.get(id) ?? 0.45);
    },
    speech,
    timers,
    warn: (m) => warnings.push(m),
    ...opts,
  });
  manager.subscribe((e) => events.push(e));
  if (!opts.locked) await manager.unlock();
  return {
    ctx,
    speech,
    warnings,
    events,
    fetched,
    timers,
    contextsCreated: () => created,
    manager,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

function buses(ctx: FakeAudioContext) {
  const compressor = ctx.nodesOfKind<FakeCompressor>('compressor')[0];
  const gains = ctx.nodesOfKind<FakeGainNode>('gain');
  const master = gains.find((g) => compressor && g.outputs.has(compressor));
  if (!master || !compressor) throw new Error('no master bus');
  const intoMaster = gains.filter((g) => g.outputs.has(master));
  const music = gains.find((g) => intoMaster.some((d) => g.outputs.has(d)));
  const duck = intoMaster.find((g) => music?.outputs.has(g));
  const [voice, sfx] = intoMaster.filter((g) => g !== duck);
  if (!voice || !sfx || !music || !duck) throw new Error('bus graph not as expected');
  return { compressor, master, voice, sfx, music, duck };
}

/** Clip sources in creation order (excludes the one-sample unlock kick). */
function clipSources(ctx: FakeAudioContext): FakeBufferSource[] {
  return ctx.bufferSources().filter((s) => s.buffer?.label !== undefined);
}

function labels(sources: readonly FakeBufferSource[]): string[] {
  return sources.map((s) => s.buffer?.label ?? '?');
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- tests ----------

describe('unlock (06 §5)', () => {
  it('stays silent before unlock and says why in dev', async () => {
    const { manager, ctx, speech, warnings } = await setup({ locked: true });
    expect(manager.state).toBe('locked');
    await manager.say('p.count.how-many');
    manager.sfx('chime');
    expect(ctx.bufferSources()).toHaveLength(0);
    expect(speech.lines).toHaveLength(0);
    expect(warnings).toEqual(['audio: narration requested before unlock(); nothing played']);
  });

  it('resumes the context, primes speech once and reports running', async () => {
    const { manager, ctx, speech, events } = await setup();
    expect(manager.state).toBe('running');
    expect(ctx.resumeCalls).toBe(1);
    expect(events).toContainEqual({ type: 'state', state: 'running' });
    await manager.unlock();
    expect(speech.primed).toBe(1);
    expect(ctx.resumeCalls).toBe(1);
  });

  it('stays locked when the browser refuses to resume', async () => {
    const { manager } = await setup({ ctx: { refuseResume: true } });
    expect(manager.state).toBe('locked');
  });

  it('without Web Audio, narration still works through Web Speech', async () => {
    const speech = new FakeSpeech();
    const manager = createAudioManager({
      narration: narrationFixture,
      createContext: () => null,
      speech,
      timers: inertTimers(),
      warn: () => {},
    });
    await manager.unlock();
    expect(manager.state).toBe('unavailable');
    const done = manager.say('p.count.how-many');
    await flush();
    expect(speech.lines.map((l) => l.text)).toEqual(['How many fish?']);
    speech.lines[0]?.finish();
    await done;
  });

  it('cancels narration when the OS suspends audio, and reports locked', async () => {
    const { manager, ctx, events } = await setup();
    let settled = false;
    void manager.say('p.count.how-many').then(() => {
      settled = true;
    });
    await flush();
    ctx.simulateState('suspended');
    await flush();
    expect(manager.state).toBe('locked');
    expect(settled).toBe(true);
    expect(events).toContainEqual({ type: 'state', state: 'locked' });
    expect(events).toContainEqual({ type: 'line-end', lineId: 1, reason: 'cancelled' });
  });
});

describe('clip stitching', () => {
  it('schedules clips gaplessly in speaking order, with the .end variant when present', async () => {
    const { manager, ctx, events } = await setup();
    const t0 = ctx.currentTime;
    const done = manager.say('tp.ADD.08.t1.prompt', { a: 7, b: 23 });
    await flush();
    const sources = clipSources(ctx);
    expect(labels(sources)).toEqual([
      'tp.ADD.08.t1.prompt#0',
      'num.7#0',
      'tp.ADD.08.t1.prompt#1',
      'num.23.end#0',
      'tp.ADD.08.t1.prompt#2',
    ]);
    let expected = t0 + LINE_START_DELAY_SEC;
    for (const s of sources) {
      expect(s.startedAt).toBeCloseTo(expected, 9);
      expected += s.buffer?.duration ?? 0;
    }
    expect(events.find((e) => e.type === 'line-start')).toMatchObject({
      key: 'tp.ADD.08.t1.prompt',
      via: 'clips',
      text: 'Fill the shell to make ten. How many is 7 + 23?',
    });

    let settled = false;
    void done.then(() => {
      settled = true;
    });
    ctx.advanceTo(expected - 0.01);
    await flush();
    expect(settled).toBe(false);
    ctx.advanceTo(expected + 0.01);
    await flush();
    expect(settled).toBe(true);
    expect(
      events.filter((e) => e.type === 'clip-start').map((e) => e.type === 'clip-start' && e.index),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(events.at(-1)).toMatchObject({ type: 'line-end', reason: 'done' });
  });

  it('falls back to the plain number clip when the .end variant was not rendered', async () => {
    const { manager, ctx } = await setup({ manifest: fixtureManifest() });
    void manager.say('ls.CNT.03.w1.s3', { n: 8 });
    await flush();
    expect(labels(clipSources(ctx))).toEqual([
      'ls.CNT.03.w1.s3#0',
      'num.8#0',
      'ls.CNT.03.w1.s3#1',
      'num.8#0',
      'ls.CNT.03.w1.s3#2',
    ]);
  });

  it('skips a missing punctuation-only clip instead of falling back', async () => {
    const { manager, ctx, speech } = await setup({
      manifest: fixtureManifest(['tp.ADD.08.t1.prompt#2']),
    });
    void manager.say('tp.ADD.08.t1.prompt', { a: 2, b: 5 });
    await flush();
    expect(labels(clipSources(ctx))).toEqual([
      'tp.ADD.08.t1.prompt#0',
      'num.2#0',
      'tp.ADD.08.t1.prompt#1',
      'num.5#0',
    ]);
    expect(speech.lines).toHaveLength(0);
  });

  it('scales playback and spacing by the voice rate', async () => {
    const { manager, ctx } = await setup();
    manager.configure({ voiceRate: 1.2 });
    void manager.say('p.add.what-is', { a: 3, b: 4 });
    await flush();
    const sources = clipSources(ctx);
    expect(sources.every((s) => s.playbackRate.value === 1.2)).toBe(true);
    const [first, second] = sources;
    expect((second?.startedAt ?? 0) - (first?.startedAt ?? 0)).toBeCloseTo(
      (first?.buffer?.duration ?? 0) / 1.2,
      9,
    );
  });

  it('decodes each clip file once', async () => {
    const { manager, ctx, fetched } = await setup();
    const a = manager.say('p.count.how-many');
    await flush();
    ctx.advance(5);
    await a;
    void manager.say('p.count.how-many');
    await flush();
    expect(fetched.filter((u) => u === '/audio/p.count.how-many#0.opus')).toHaveLength(1);
    expect(clipSources(ctx)).toHaveLength(2);
  });
});

describe('cancel and queue semantics (06 §5)', () => {
  it('a new line cancels the current one with a short fade', async () => {
    const { manager, ctx, events } = await setup();
    let firstDone = false;
    void manager.say('game.pip.welcome').then(() => {
      firstDone = true;
    });
    await flush();
    const [first] = clipSources(ctx);
    ctx.advance(0.3);
    void manager.say('p.count.how-many');
    await flush();
    expect(firstDone).toBe(true);
    expect(first?.stoppedAt).toBeCloseTo(0.3 + CANCEL_FADE_SEC, 9);
    const firstLineGain = [...(first?.outputs ?? [])][0] as FakeGainNode;
    expect(firstLineGain.gain.events.at(-1)).toEqual({
      type: 'linear',
      value: 0,
      time: 0.3 + CANCEL_FADE_SEC,
    });
    expect(labels(clipSources(ctx))).toEqual(['game.pip.welcome#0', 'p.count.how-many#0']);
    expect(events.filter((e) => e.type === 'line-end')).toEqual([
      { type: 'line-end', lineId: 1, reason: 'cancelled' },
    ]);
  });

  it('feedback waits for the prompt to finish instead of cutting it off', async () => {
    const { manager, ctx } = await setup();
    const prompt = manager.say('p.count.how-many');
    await flush();
    const feedback = manager.say('fb.correct.1');
    await flush();
    expect(labels(clipSources(ctx))).toEqual(['p.count.how-many#0']);
    expect(clipSources(ctx)[0]?.stoppedAt).toBeNull();
    ctx.advance(2);
    await prompt;
    await flush();
    expect(labels(clipSources(ctx))).toEqual(['p.count.how-many#0', 'fb.correct.1#0']);
    ctx.advance(2);
    await feedback;
  });

  it('AI lines (phrases and text) queue behind deterministic feedback', async () => {
    const { manager, ctx, speech } = await setup();
    void manager.say('fb.retry');
    void manager.sayPhrases([{ id: 'ph.look-at-the-empty-boxes' }]);
    void manager.sayText('Look at the top row.');
    await flush();
    expect(labels(clipSources(ctx))).toEqual(['fb.retry#0']);
    ctx.advance(2);
    await flush();
    expect(labels(clipSources(ctx))).toEqual(['fb.retry#0', 'ph.look-at-the-empty-boxes#0']);
    expect(speech.lines).toHaveLength(0);
    ctx.advance(2);
    await flush();
    expect(speech.lines.map((l) => [l.text, l.opts.voice])).toEqual([
      ['Look at the top row.', 'glim'],
    ]);
  });

  it('a new prompt also drops queued feedback', async () => {
    const { manager, ctx } = await setup();
    void manager.say('p.count.how-many');
    const fb = manager.say('fb.correct.1');
    await flush();
    void manager.say('game.pip.welcome');
    await fb; // settles (cancelled) without ever playing
    await flush();
    ctx.advance(5);
    await flush();
    expect(labels(clipSources(ctx))).toEqual(['p.count.how-many#0', 'game.pip.welcome#0']);
  });

  it('cancels a line that is still loading', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { manager, ctx } = await setup({
      fetchClip: async (url) => {
        await gate;
        const id = url.replace(/^\/audio\//, '').replace(/\.opus$/, '');
        return fakeEncodedClip(id, 1);
      },
    });
    const first = manager.say('game.pip.welcome');
    await flush();
    void manager.say('p.count.how-many');
    await first;
    release();
    await flush();
    expect(labels(clipSources(ctx))).toEqual(['p.count.how-many#0']);
  });

  it('stop() silences narration, speech and music', async () => {
    const { manager, speech } = await setup({ manifest: null });
    const line = manager.say('p.count.how-many');
    await flush();
    manager.music('island');
    manager.stop();
    await line;
    expect(speech.lines[0]?.cancelled).toBe(true);
    expect(speech.cancels).toBeGreaterThan(0);
    expect(manager.musicTrack).toBeNull();
    expect(manager.speaking).toBe(false);
  });
});

describe('ducking', () => {
  it('ducks music while a clip line plays and restores it after', async () => {
    const { manager, ctx } = await setup();
    const { duck } = buses(ctx);
    expect(duck.gain.value).toBe(1);
    const line = manager.say('p.count.how-many');
    await flush();
    expect(duck.gain.lastTarget()).toBe(DUCK_LEVEL);
    ctx.advance(3);
    await line;
    expect(duck.gain.lastTarget()).toBe(1);
    const restore = duck.gain.events.at(-1);
    expect(restore).toMatchObject({ type: 'target', value: 1 });
  });

  it('stays ducked across queued lines and ducks for Web Speech too', async () => {
    const { manager, ctx, speech } = await setup({ manifest: null });
    const { duck } = buses(ctx);
    void manager.say('p.count.how-many');
    void manager.say('fb.correct.1');
    await flush();
    expect(duck.gain.lastTarget()).toBe(DUCK_LEVEL);
    speech.lines[0]?.finish();
    await flush();
    expect(duck.gain.lastTarget()).toBe(DUCK_LEVEL);
    speech.lines[1]?.finish();
    await flush();
    expect(duck.gain.lastTarget()).toBe(1);
  });
});

describe('Web Speech fallback (02 §5.5)', () => {
  it('uses Web Speech for every line when there is no manifest', async () => {
    const { manager, ctx, speech, warnings } = await setup({ manifest: null });
    void manager.say('tp.ADD.08.t1.prompt', { a: 7, b: 3 });
    await flush();
    expect(clipSources(ctx)).toHaveLength(0);
    expect(speech.lines.map((l) => l.text)).toEqual([
      'Fill the shell to make ten. How many is seven plus three?',
    ]);
    expect(speech.lines[0]?.opts).toEqual({ voice: 'narrator', rate: 1, volume: 1 });
    expect(warnings).toContain('audio: no audio manifest; narration falls back to Web Speech');
  });

  it('treats a manifest that fails to load like a missing one', async () => {
    const { manager, speech } = await setup({
      manifest: () => Promise.reject(new Error('404')),
    });
    void manager.say('game.pip.welcome');
    await flush();
    expect(speech.lines.map((l) => [l.text, l.opts.voice])).toEqual([
      ["Welcome back! Let's build something today.", 'pip'],
    ]);
  });

  it('falls back for the whole line when one spoken clip is missing', async () => {
    const { manager, ctx, speech, warnings } = await setup({
      manifest: fixtureManifest(['num.7#0']),
    });
    void manager.say('tp.ADD.08.t1.prompt', { a: 7, b: 3 });
    await flush();
    expect(clipSources(ctx)).toHaveLength(0);
    expect(speech.lines).toHaveLength(1);
    expect(warnings).toContain('audio: clip "num.7#0" is missing; using Web Speech');
  });

  it('falls back when a clip cannot be fetched or decoded', async () => {
    const failing = await setup({
      fetchClip: () => Promise.reject(new Error('offline')),
    });
    void failing.manager.say('p.count.how-many');
    await flush();
    expect(failing.speech.lines.map((l) => l.text)).toEqual(['How many fish?']);

    const corrupt = await setup({ ctx: { decodeFails: () => true } });
    void corrupt.manager.say('p.count.how-many');
    await flush();
    expect(corrupt.speech.lines.map((l) => l.text)).toEqual(['How many fish?']);
  });

  it('falls back when a slot cannot be composed from clips', async () => {
    const { manager, speech } = await setup();
    void manager.say('req.dock.needs-planks', { who: 'shelly', n: 2, item: 'rope' });
    await flush();
    expect(speech.lines.map((l) => l.text)).toEqual(['Shelly needs two rope for the boat.']);
  });

  it('sayText speaks with Glim by default, or the narrator on request', async () => {
    const { manager, speech } = await setup();
    void manager.sayText('Look at the empty boxes.');
    await flush();
    speech.lines[0]?.finish();
    await flush();
    void manager.sayText('Count them with me.', { voice: 'narrator' });
    await flush();
    expect(speech.lines.map((l) => l.opts.voice)).toEqual(['glim', 'narrator']);
  });

  it('applies voice rate and volume to Web Speech', async () => {
    const { manager, speech } = await setup({ manifest: null });
    manager.configure({ voiceRate: 0.8, volumes: { voice: 0.6 } });
    void manager.say('p.count.how-many');
    await flush();
    expect(speech.lines[0]?.opts).toEqual({ voice: 'narrator', rate: 0.8, volume: 0.6 });
  });

  it('warns once about an unknown key and plays nothing', async () => {
    const { manager, ctx, speech, warnings } = await setup();
    await manager.say('p.not-a-key');
    await manager.say('p.not-a-key');
    expect(clipSources(ctx)).toHaveLength(0);
    expect(speech.lines).toHaveLength(0);
    expect(warnings.filter((w) => w.includes('p.not-a-key'))).toHaveLength(1);
  });
});

describe('volumes, music switch and SFX', () => {
  it('maps volumes onto the buses and silences music when it is switched off', async () => {
    const { manager, ctx } = await setup();
    const b = buses(ctx);
    expect([b.voice.gain.value, b.sfx.gain.value, b.music.gain.value]).toEqual([1, 0.8, 0.5]);
    manager.setVolumes({ voice: 0.7, sfx: 0.2, music: 0.4 });
    expect([b.voice.gain.lastTarget(), b.sfx.gain.lastTarget(), b.music.gain.lastTarget()]).toEqual(
      [0.7, 0.2, 0.4],
    );
    manager.applyFamilySettings({
      music: false,
      volumes: { voice: 1, sfx: 1, music: 0.9 },
      voiceRate: 3,
    });
    expect(b.music.gain.lastTarget()).toBe(0);
    expect(manager.settings.voiceRate).toBe(1.2);
  });

  it('plays known SFX into the sfx bus and ignores unknown ones', async () => {
    const { manager, ctx, warnings } = await setup();
    const { sfx } = buses(ctx);
    const before = ctx.nodes.length;
    manager.sfx('chime');
    const created = ctx.nodes.slice(before);
    expect(created.length).toBeGreaterThan(0);
    expect(created.some((n) => n.reaches(sfx))).toBe(true);
    manager.sfx('buzzer');
    expect(warnings).toContain('audio: unknown sfx "buzzer"');
  });

  it('does not stack the same SFX fired twice in one instant', async () => {
    const { manager, ctx } = await setup();
    manager.sfx('pop');
    const after1 = ctx.nodes.length;
    manager.sfx('pop');
    expect(ctx.nodes.length).toBe(after1);
    ctx.advance(0.1);
    manager.sfx('pop');
    expect(ctx.nodes.length).toBeGreaterThan(after1);
  });

  it('starts a requested track once unlocked, and not while music is off', async () => {
    const { manager, ctx } = await setup({ locked: true });
    manager.music('island');
    expect(ctx.nodes).toHaveLength(1); // only the destination: nothing built before unlock
    await manager.unlock();
    const { music } = buses(ctx);
    const reachesMusic = () =>
      ctx.nodes.some((n) => n !== music && n.kind !== 'destination' && n.reaches(music));
    expect(reachesMusic()).toBe(true);
    manager.music('no-such-track');
    expect(manager.musicTrack).toBe('island');
  });

  it('silences the track while music is switched off and resumes it after', async () => {
    const play = vi.spyOn(MusicPlayer.prototype, 'play');
    const { manager } = await setup();
    manager.music('festival');
    manager.configure({ musicEnabled: false });
    manager.configure({ musicEnabled: true });
    expect(play.mock.calls.map((c) => c[0])).toEqual(['festival', null, 'festival']);
    expect(manager.musicTrack).toBe('festival');
  });

  it('pauses music while the page is hidden (timers are throttled there)', async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', doc);
    try {
      const play = vi.spyOn(MusicPlayer.prototype, 'play');
      const { manager } = await setup();
      manager.music('island');
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
      expect(play.mock.calls.map((c) => c[0])).toEqual(['island', null, 'island']);
      await manager.dispose();
      play.mockClear();
      doc.dispatchEvent(new Event('visibilitychange'));
      expect(play).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('no overlap when a line cuts in (06 §5)', () => {
  it('starts the replacement clips only after the outgoing fade', async () => {
    const { manager, ctx } = await setup();
    // Warm the cache so the replacement is ready instantly.
    const warm = manager.say('p.count.how-many');
    await flush();
    ctx.advance(5);
    await warm;
    void manager.say('game.pip.welcome');
    await flush();
    ctx.advance(0.2);
    void manager.say('p.count.how-many'); // cuts in with the clock held still
    await flush();
    const [, old, replacement] = clipSources(ctx);
    const fadeEnd = ctx.currentTime + CANCEL_FADE_SEC;
    expect(old?.stoppedAt).toBeCloseTo(fadeEnd, 9);
    expect(replacement?.startedAt ?? 0).toBeGreaterThanOrEqual(fadeEnd - 1e-9);
  });

  it('delays a Web Speech replacement until the fade has finished', async () => {
    const { manager, ctx, speech, timers } = await setup({
      manifest: fixtureManifest(['p.count.how-many#0']),
    });
    void manager.say('game.pip.welcome');
    await flush();
    ctx.advance(0.2);
    timers.pending.clear();
    void manager.say('p.count.how-many'); // its clip is missing: Web Speech
    await flush();
    expect(speech.lines).toHaveLength(0);
    const delays = [...timers.pending.values()].map((t) => t.ms);
    const fadeMs = CANCEL_FADE_SEC * 1000;
    expect(delays.some((ms) => ms >= fadeMs && ms <= fadeMs + 1)).toBe(true);
    timers.fireAll();
    expect(speech.lines.map((l) => l.text)).toEqual(['How many fish?']);
  });
});

describe('listeners that cancel', () => {
  it('a line cancelled from its own line-start never starts its clips', async () => {
    const { manager, ctx } = await setup();
    manager.subscribe((e) => {
      if (e.type === 'line-start') manager.cancelSpeech();
    });
    const line = manager.say('p.count.how-many');
    await flush();
    await line;
    expect(clipSources(ctx)).toHaveLength(0);
    expect(manager.speaking).toBe(false);
  });

  it('a line cancelled from clip-start never sounds: unstarted clips stop before they start', async () => {
    const { manager, ctx } = await setup();
    manager.subscribe((e) => {
      if (e.type === 'clip-start') manager.stop();
    });
    const line = manager.say('tp.ADD.08.t1.prompt', { a: 1, b: 2 });
    await flush();
    await line;
    const sources = clipSources(ctx);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.stoppedAt).not.toBeNull();
      expect(s.stoppedAt ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(s.startedAt ?? 0);
    }
  });

  it('a clip already playing still fades out when cancelled', async () => {
    const { manager, ctx } = await setup();
    void manager.say('tp.ADD.08.t1.prompt', { a: 1, b: 2 });
    await flush();
    ctx.advance(0.5); // the first clip is playing; the rest are still in the future
    manager.cancelSpeech();
    const [playing, ...future] = clipSources(ctx);
    expect(playing?.stoppedAt).toBeCloseTo(0.5 + CANCEL_FADE_SEC, 9);
    for (const s of future) {
      expect(s.stoppedAt ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(s.startedAt ?? 0);
    }
  });

  it('a speech line cancelled from line-start is never spoken', async () => {
    const { manager, speech } = await setup({ manifest: null });
    manager.subscribe((e) => {
      if (e.type === 'line-start') manager.cancelSpeech();
    });
    await manager.say('p.count.how-many');
    expect(speech.lines).toHaveLength(0);
  });
});

describe('stalled loading is bounded', () => {
  it('a clip that never arrives falls back to Web Speech, lets feedback run, and is retried', async () => {
    let calls = 0;
    const { manager, ctx, speech, timers } = await setup({
      fetchClip: (url) => {
        calls += 1;
        if (calls === 1) return new Promise<ArrayBuffer>(() => {}); // stalls forever
        const id = url.replace(/^\/audio\//, '').replace(/\.opus$/, '');
        return Promise.resolve(fakeEncodedClip(id, 0.5));
      },
    });
    const { duck } = buses(ctx);
    const prompt = manager.say('p.count.how-many');
    void manager.say('fb.correct.1');
    await flush();
    expect([...timers.pending.values()].some((t) => t.ms === LOAD_TIMEOUT_MS)).toBe(true);
    timers.fireAll();
    await flush();
    expect(speech.lines.map((l) => l.text)).toEqual(['How many fish?']);
    speech.lines[0]?.finish();
    await prompt;
    await flush();
    // Feedback advanced (its clip loads normally) and plays as clips.
    expect(labels(clipSources(ctx))).toEqual(['fb.correct.1#0']);
    ctx.advance(5);
    await flush();
    expect(duck.gain.lastTarget()).toBe(1);
    // Retrying the stalled prompt fetches afresh instead of joining the stalled request.
    void manager.say('p.count.how-many');
    await flush();
    expect(labels(clipSources(ctx))).toEqual(['fb.correct.1#0', 'p.count.how-many#0']);
  });

  it('a manifest that never arrives falls back to Web Speech', async () => {
    const { manager, speech, timers } = await setup({
      manifest: () => new Promise(() => {}),
    });
    void manager.say('p.count.how-many');
    await flush();
    expect(speech.lines).toHaveLength(0);
    timers.fireAll();
    await flush();
    expect(speech.lines.map((l) => l.text)).toEqual(['How many fish?']);
  });
});

describe('dispose is terminal', () => {
  it('ignores narration and unlock afterwards, even with speech available', async () => {
    const { manager, speech, contextsCreated, warnings } = await setup();
    await manager.dispose();
    const before = warnings.length;
    await manager.say('p.count.how-many');
    await manager.sayText('Hello');
    await manager.sayPhrases([{ id: 'ph.you-have' }]);
    await manager.unlock();
    manager.sfx('chime');
    manager.music('island');
    expect(speech.lines).toHaveLength(0);
    expect(contextsCreated()).toBe(1);
    expect(manager.state).toBe('unavailable');
    expect(warnings.length).toBe(before);
  });
});

describe('review round 2 hardening', () => {
  it('a line-end listener cannot restart narration while dispose() runs', async () => {
    const { manager, speech } = await setup({ manifest: null });
    void manager.say('p.count.how-many');
    await flush();
    let requested: Promise<void> | null = null;
    manager.subscribe((e) => {
      if (e.type === 'line-end') requested = manager.sayText('Are you still there?');
    });
    await manager.dispose();
    await flush();
    expect(requested).not.toBeNull();
    await requested;
    expect(speech.lines.map((l) => l.text)).toEqual(['How many fish?']);
    expect(manager.speaking).toBe(false);
  });

  it('a delayed Web Speech start that throws settles the line and lets feedback run', async () => {
    const { manager, ctx, speech, timers } = await setup({
      manifest: fixtureManifest(['p.count.how-many#0']),
    });
    const { duck } = buses(ctx);
    void manager.say('game.pip.welcome');
    await flush();
    ctx.advance(0.2);
    timers.pending.clear();
    vi.spyOn(speech, 'speak').mockImplementationOnce(() => {
      throw new Error('synthesis-failed');
    });
    const prompt = manager.say('p.count.how-many'); // Web Speech, delayed by the fade
    void manager.say('fb.correct.1');
    await flush();
    timers.fireAll(); // the fade timer: speak() throws
    await prompt;
    await flush();
    expect(labels(clipSources(ctx)).at(-1)).toBe('fb.correct.1#0');
    ctx.advance(5);
    await flush();
    expect(duck.gain.lastTarget()).toBe(1);
  });

  it('asks the narration loader again after a stalled first request', async () => {
    let calls = 0;
    const { manager, ctx, timers } = await setup({
      narration: () => {
        calls += 1;
        return calls === 1 ? new Promise(() => {}) : Promise.resolve(narrationFixture);
      },
    });
    const first = manager.say('p.count.how-many');
    await flush();
    timers.fireAll();
    await first;
    void manager.say('p.count.how-many');
    await flush();
    expect(calls).toBe(2);
    expect(labels(clipSources(ctx))).toEqual(['p.count.how-many#0']);
  });

  it('asks the manifest loader again after a stalled first request', async () => {
    let calls = 0;
    const { manager, ctx, speech, timers } = await setup({
      manifest: () => {
        calls += 1;
        return calls === 1 ? new Promise(() => {}) : Promise.resolve(fixtureManifest());
      },
    });
    void manager.say('p.count.how-many');
    await flush();
    timers.fireAll();
    await flush();
    speech.lines[0]?.finish();
    await flush();
    void manager.say('p.count.how-many');
    await flush();
    expect(calls).toBe(2);
    expect(labels(clipSources(ctx))).toEqual(['p.count.how-many#0']);
  });

  it('a line that is only a "?" blank needs its clip ("what number")', async () => {
    const { manager, ctx, speech } = await setup({ manifest: fixtureManifest(['p.blank#0']) });
    void manager.say('p.blank');
    await flush();
    expect(clipSources(ctx)).toHaveLength(0);
    expect(speech.lines.map((l) => l.text)).toEqual(['what number']);
  });
});

describe('spoken math symbols need their clips (03 §8.4)', () => {
  it.each([['p.add.what-is#0'], ['p.add.what-is#1']])(
    'falls back to Web Speech when %s ("plus" / "equals what number") is missing',
    async (missing) => {
      const { manager, ctx, speech } = await setup({ manifest: fixtureManifest([missing]) });
      void manager.say('p.add.what-is', { a: 3, b: 4 });
      await flush();
      expect(clipSources(ctx)).toHaveLength(0);
      expect(speech.lines.map((l) => l.text)).toEqual(['three plus four equals what number']);
    },
  );
});

describe('loadAudioManifest', () => {
  const response = (status: number, body: unknown) =>
    ({ ok: status < 400, status, json: async () => body }) as Response;

  it('parses a valid manifest', async () => {
    const manifest: AudioManifest = {
      version: 'v1',
      clips: { 'a#0': { file: 'a.opus', durationMs: 10 } },
    };
    const fetchImpl = vi.fn(async () => response(200, manifest));
    await expect(loadAudioManifest('/audio/manifest.json', fetchImpl, () => {})).resolves.toEqual(
      manifest,
    );
  });

  it('resolves null for a missing or invalid manifest, with a warning', async () => {
    const warnings: string[] = [];
    const warn = (m: string) => warnings.push(m);
    await expect(
      loadAudioManifest('/m.json', async () => response(404, null), warn),
    ).resolves.toBeNull();
    await expect(
      loadAudioManifest('/m.json', async () => response(200, { nope: 1 }), warn),
    ).resolves.toBeNull();
    await expect(
      loadAudioManifest('/m.json', () => Promise.reject(new Error('offline')), warn),
    ).resolves.toBeNull();
    expect(warnings).toHaveLength(3);
  });
});
