// On-device Web Speech (02 §5.5, 07 §3): the fallback for lines whose clips are missing, and
// `sayText` for Glim's free-text AI lines (07 §2, text mode). There is never a cloud TTS call at
// runtime. Speech synthesis is not routed through Web Audio, so the manager ducks music around it
// separately.
import type { NarrationVoice } from '@number-island/shared';

export interface SpeakOptions {
  voice: NarrationVoice;
  /** 0.8–1.2 (FamilySettings.voiceRate). */
  rate: number;
  /** 0–1 (the voice volume). */
  volume: number;
}

export interface SpeechHandle {
  /** Settles when the line ends, fails or is cancelled. Never rejects. */
  done: Promise<void>;
  cancel(): void;
}

export interface SpeechBackend {
  /** True when a line can be spoken on-device right now (an on-device English voice exists). */
  readonly available: boolean;
  speak(text: string, opts: SpeakOptions): SpeechHandle;
  /** Silence everything this backend is saying. */
  cancel(): void;
  /** Call synchronously inside a user gesture so later speech is allowed (Chrome, Android). */
  prime(): void;
  /** Release listeners on the global synthesizer. */
  dispose?(): void;
}

export interface VoiceChoice {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rateScale: number;
}

/** Novelty voices some systems ship (macOS): never for children's narration. */
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|ralph|fred|grandma|grandpa|rocko|shelley|sandy|eddy|flo|reed)\b/i;
/** On-device voices that tend to sound warm and natural, best first (macOS, Windows, Android). */
const PREFERRED = [
  /samantha/i,
  /microsoft (aria|jenny|ava|emma|michelle)/i,
  /microsoft zira/i,
  /karen|moira|tessa|serena/i,
  /english.*(united states|us)/i,
];

function score(v: SpeechSynthesisVoice): number {
  // On-device only (02 §5.5, 07 §3): a remote voice (e.g. Chrome's "Google US English") sends
  // the text to a cloud service, so it is never chosen.
  if (!v.localService) return -1000;
  let s = 0;
  const lang = v.lang.toLowerCase().replace('_', '-');
  if (lang === 'en-us') s += 40;
  else if (lang.startsWith('en-')) s += 25;
  else if (lang.startsWith('en')) s += 20;
  else return -1000;
  if (NOVELTY.test(v.name)) return -1000;
  const rank = PREFERRED.findIndex((re) => re.test(v.name));
  if (rank >= 0) s += 30 - rank * 3;
  if (/natural|neural|enhanced|premium/i.test(v.name)) s += 8;
  return s;
}

/**
 * Picks the narrator, the guide and Glim voices from the device's on-device English voices; null when
 * there are none, and then nothing is spoken. Glim (the lantern-robot helper, 07 §7) gets a
 * different voice from the narrator when one exists, and a higher, slightly brisker delivery
 * either way, so children can always tell an AI line from the narrator.
 */
export function pickVoices(
  voices: readonly SpeechSynthesisVoice[],
): Record<NarrationVoice, VoiceChoice> {
  const ranked = voices
    .map((v) => ({ v, s: score(v) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
  const narrator = ranked[0] ?? null;
  const glim = ranked.find((v) => v !== narrator && v.name !== narrator?.name) ?? narrator;
  const glimShared = glim === narrator;
  return {
    narrator: { voice: narrator, pitch: 1, rateScale: 0.95 },
    guide: { voice: narrator, pitch: 1.25, rateScale: 1.02 },
    glim: { voice: glim, pitch: glimShared ? 1.5 : 1.3, rateScale: 1.04 },
  };
}

export interface WebSpeechOptions {
  synth?: SpeechSynthesis | null;
  Utterance?: typeof SpeechSynthesisUtterance | null;
  /** Safety net for engines that never fire `end` (some Android builds). */
  timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
}

/** The browser's speechSynthesis, or an unavailable backend when the platform has none. */
export function createWebSpeech(opts: WebSpeechOptions = {}): SpeechBackend {
  const synth = opts.synth !== undefined ? opts.synth : (globalThis.speechSynthesis ?? null);
  const Utterance =
    opts.Utterance !== undefined ? opts.Utterance : (globalThis.SpeechSynthesisUtterance ?? null);
  const timers = opts.timers ?? globalThis;
  if (!synth || !Utterance) return unavailableSpeech;

  let choices = pickVoices(synth.getVoices());
  // Chrome loads voices asynchronously and announces them with `voiceschanged`.
  const onVoicesChanged = () => {
    choices = pickVoices(synth.getVoices());
  };
  synth.addEventListener?.('voiceschanged', onVoicesChanged);
  const active = new Set<() => void>();
  /** The current choices, re-read once if the voice list was still empty. */
  const current = () => {
    if (!choices.narrator.voice) choices = pickVoices(synth.getVoices());
    return choices;
  };

  return {
    get available() {
      return current().narrator.voice !== null;
    },
    speak(text, { voice, rate, volume }) {
      let settle: () => void = () => {};
      const done = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const trimmed = text.trim();
      const choice = current()[voice];
      // No on-device voice: never hand the text to the browser's default (possibly cloud) voice.
      if (trimmed === '' || !choice.voice) {
        settle();
        return { done, cancel: () => {} };
      }
      const u = new Utterance(trimmed);
      u.voice = choice.voice;
      u.lang = choice.voice.lang;
      u.pitch = choice.pitch;
      u.rate = clamp(rate, 0.5, 2) * choice.rateScale;
      u.volume = clamp(volume, 0, 1);

      let finished = false;
      // ~170 ms per word at rate 1, generously padded: only a stuck engine ever reaches it.
      const words = trimmed.split(/\s+/).length;
      const limitMs = 4000 + (words * 400) / Math.max(0.5, u.rate);
      const finish = () => {
        if (finished) return;
        finished = true;
        timers.clearTimeout(timer);
        active.delete(cancel);
        settle();
      };
      const cancel = () => {
        if (finished) return;
        finish();
        // Cancelling a single queued utterance is not possible in Web Speech; this backend only
        // ever has one line in flight, so cancelling everything is equivalent.
        synth.cancel();
      };
      // A stuck engine that never fires `end`: cancel it too, so it can't talk over the next line.
      const timer = timers.setTimeout(cancel, limitMs);
      u.onend = finish;
      u.onerror = finish;
      active.add(cancel);
      synth.speak(u);
      // Chrome can leave the queue paused after a tab switch; nudge it.
      if (synth.paused) synth.resume();
      return { done, cancel };
    },
    cancel() {
      for (const c of [...active]) c();
      synth.cancel();
    },
    prime() {
      // A silent utterance spoken during the gesture grants speech for the rest of the session.
      const local = current().narrator.voice;
      if (!local) return;
      const u = new Utterance(' ');
      u.voice = local;
      u.volume = 0;
      synth.speak(u);
    },
    dispose() {
      synth.removeEventListener?.('voiceschanged', onVoicesChanged);
    },
  };
}

const unavailableSpeech: SpeechBackend = {
  available: false,
  speak: () => ({ done: Promise.resolve(), cancel: () => {} }),
  cancel: () => {},
  prime: () => {},
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}
