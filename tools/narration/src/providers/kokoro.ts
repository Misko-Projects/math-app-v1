// The `kokoro` provider (07 §3): the Apache-2.0 Kokoro-82M model via kokoro-js (ONNX in Node). No
// external calls at render time; the model downloads from Hugging Face on first local use, and never
// in CI. Select it with NARRATION_PROVIDER=kokoro (or --provider kokoro).
//
// kokoro-js is not a dependency of this package: it pulls in onnxruntime and transformers.js
// (hundreds of MB) that every install, CI included, would otherwise download. Add it when switching:
//   pnpm --filter @number-island/narration add kokoro-js
import { pcmToWav } from '../audio';
import type { Renderer } from './types';

interface KokoroAudio {
  audio: Float32Array;
  sampling_rate: number;
}
interface KokoroTts {
  generate(text: string, opts: { voice: string }): Promise<KokoroAudio>;
}
interface KokoroModule {
  KokoroTTS: {
    from_pretrained(model: string, opts: { dtype: string; device: string }): Promise<KokoroTts>;
  };
}

export const KOKORO_INSTALL = 'pnpm --filter @number-island/narration add kokoro-js';

/** Float samples in [-1, 1] → 16-bit PCM WAV. */
export function floatToWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const data = new Uint8Array(samples.length * 2);
  const view = new DataView(data.buffer);
  samples.forEach((s, i) => {
    view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true);
  });
  return pcmToWav({ sampleRate, channels: 1, data });
}

export function kokoroRenderer(opts: {
  model: string;
  env?: NodeJS.ProcessEnv;
  load?: () => Promise<KokoroModule>;
}): Renderer {
  const env = opts.env ?? process.env;
  // A variable specifier keeps TypeScript from requiring the optional package's types.
  const specifier = 'kokoro-js';
  const load = opts.load ?? (() => import(specifier) as Promise<KokoroModule>);
  return {
    provider: 'kokoro',
    model: opts.model,
    async render(requests, ctx) {
      if (env.CI) {
        throw new Error('Kokoro never runs in CI (it downloads a model); use --provider stub.');
      }
      let mod: KokoroModule;
      try {
        mod = await load();
      } catch {
        throw new Error(`kokoro-js is not installed. Add it with: ${KOKORO_INSTALL}`);
      }
      ctx.log(`narration: loading ${opts.model} (downloads once on first use)…`);
      const tts = await mod.KokoroTTS.from_pretrained(opts.model, { dtype: 'q8', device: 'cpu' });
      for (const r of requests) {
        try {
          const out = await tts.generate(r.text, { voice: r.voiceName });
          await ctx.onResult({ id: r.id, ok: true, wav: floatToWav(out.audio, out.sampling_rate) });
        } catch (e) {
          await ctx.onResult({
            id: r.id,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    },
  };
}
