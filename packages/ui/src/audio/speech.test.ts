import { describe, expect, it, vi } from 'vitest';
import { createWebSpeech, pickVoices } from './speech';

const voice = (name: string, lang: string, localService = true) =>
  ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

describe('pickVoices (on-device only, 07 §3)', () => {
  it('picks a natural on-device en-US narrator and gives Glim a different, higher voice', () => {
    const voices = [
      voice('Zarvox', 'en-US'),
      voice('Thomas', 'fr-FR'),
      voice('Daniel', 'en-GB'),
      voice('Google US English', 'en-US', false),
      voice('Samantha', 'en-US'),
    ];
    const v = pickVoices(voices);
    expect(v.narrator.voice?.name).toBe('Samantha');
    expect(v.glim.voice?.name).toBe('Daniel');
    expect(v.glim.pitch).toBeGreaterThan(v.narrator.pitch);
    expect(v.pip.pitch).toBeGreaterThan(v.narrator.pitch);
  });

  it('never picks a remote (cloud) voice, even when it is the only English one', () => {
    const v = pickVoices([
      voice('Google US English', 'en-US', false),
      voice('Microsoft Aria Online (Natural)', 'en-US', false),
    ]);
    expect(v.narrator.voice).toBeNull();
    expect(v.glim.voice).toBeNull();
    expect(v.pip.voice).toBeNull();
  });

  it('keeps Glim distinct by pitch when the device has a single English voice', () => {
    const v = pickVoices([voice('Daniel', 'en-GB'), voice('Thomas', 'fr-FR')]);
    expect(v.narrator.voice?.name).toBe('Daniel');
    expect(v.glim.voice?.name).toBe('Daniel');
    expect(v.glim.pitch).toBeGreaterThanOrEqual(1.5);
  });

  it('never picks novelty or non-English voices', () => {
    const v = pickVoices([voice('Bubbles', 'en-US'), voice('Anna', 'de-DE')]);
    expect(v.narrator.voice).toBeNull();
    expect(v.glim.voice).toBeNull();
  });
});

class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  pitch = 1;
  rate = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function fakeSynth(voices: SpeechSynthesisVoice[]) {
  const spoken: FakeUtterance[] = [];
  const listeners = new Set<() => void>();
  const synth = {
    paused: false,
    getVoices: () => voices,
    speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
    cancel: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn((_type: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_type: string, fn: () => void) => listeners.delete(fn)),
  };
  return { synth, spoken, listeners };
}

const backend = (synth: ReturnType<typeof fakeSynth>['synth']) =>
  createWebSpeech({
    synth: synth as unknown as SpeechSynthesis,
    Utterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
  });

describe('createWebSpeech', () => {
  it('reports unavailable when the platform has no speechSynthesis', () => {
    const s = createWebSpeech({ synth: null, Utterance: null });
    expect(s.available).toBe(false);
  });

  it('speaks with the chosen voice, rate and volume and settles on end', async () => {
    const { synth, spoken } = fakeSynth([voice('Samantha', 'en-US'), voice('Karen', 'en-AU')]);
    const s = backend(synth);
    const h = s.speak('Hi! I am Glim.', { voice: 'glim', rate: 1.1, volume: 0.5 });
    const u = spoken[0];
    expect(u?.voice?.name).toBe('Karen');
    expect(u?.rate).toBeCloseTo(1.1 * 1.04);
    expect(u?.volume).toBe(0.5);
    expect(u?.pitch).toBeCloseTo(1.3);
    u?.onend?.();
    await expect(h.done).resolves.toBeUndefined();
  });

  it('with only remote voices, is unavailable and never hands text to the browser', async () => {
    const { synth, spoken } = fakeSynth([voice('Google US English', 'en-US', false)]);
    const s = backend(synth);
    expect(s.available).toBe(false);
    await s.speak('A parent message', { voice: 'narrator', rate: 1, volume: 1 }).done;
    s.prime();
    expect(synth.speak).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(0);
  });

  it('picks up voices that load later (voiceschanged)', () => {
    const voices: SpeechSynthesisVoice[] = [];
    const { synth, listeners } = fakeSynth(voices);
    const s = backend(synth);
    expect(s.available).toBe(false);
    voices.push(voice('Samantha', 'en-US'));
    for (const fn of listeners) fn();
    expect(s.available).toBe(true);
  });

  it('settles on cancel', async () => {
    const { synth } = fakeSynth([voice('Samantha', 'en-US')]);
    const s = backend(synth);
    const cancelled = s.speak('one two', { voice: 'narrator', rate: 1, volume: 1 });
    cancelled.cancel();
    await expect(cancelled.done).resolves.toBeUndefined();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('a stuck engine is cancelled natively when the watchdog fires', async () => {
    vi.useFakeTimers();
    try {
      const { synth } = fakeSynth([voice('Samantha', 'en-US')]);
      const s = backend(synth);
      const stuck = s.speak('three four', { voice: 'narrator', rate: 1, volume: 1 });
      let settled = false;
      void stuck.done.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(settled).toBe(true);
      expect(synth.cancel).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('primes with a silent utterance on a local voice and ignores empty text', async () => {
    const { synth, spoken } = fakeSynth([voice('Samantha', 'en-US')]);
    const s = backend(synth);
    s.prime();
    expect(spoken[0]?.volume).toBe(0);
    expect(spoken[0]?.voice?.name).toBe('Samantha');
    await s.speak('   ', { voice: 'narrator', rate: 1, volume: 1 }).done;
    expect(spoken).toHaveLength(1);
  });

  it('dispose removes its voiceschanged listener', () => {
    const { synth, listeners } = fakeSynth([voice('Samantha', 'en-US')]);
    const a = backend(synth);
    const b = backend(synth);
    expect(listeners.size).toBe(2);
    a.dispose?.();
    b.dispose?.();
    expect(listeners.size).toBe(0);
  });
});
