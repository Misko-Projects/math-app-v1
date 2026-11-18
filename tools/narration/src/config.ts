// narration/voices.yaml (07 §3): provider, model, voice per character, style text, audition lines.
import { readFileSync } from 'node:fs';
import { type NarrationVoice, narrationStyleSchema } from '@number-island/shared';
import { parse } from 'yaml';
import { z } from 'zod';

export const PROVIDERS = ['gemini', 'kokoro', 'stub'] as const;
export type ProviderId = (typeof PROVIDERS)[number];
export const providerSchema = z.enum(PROVIDERS);

const voiceMap = z.object({ narrator: z.string(), pip: z.string(), glim: z.string() }).strict();
const providerConfig = z.object({ model: z.string().min(1), voices: voiceMap }).strict();

/**
 * A style key: a 03 §8.2 `style`, `clip` for clip-set words (`num.*`, `noun.*`, …) or `end` for
 * the sentence-final `num.*.end` clips.
 */
export const styleKeySchema = z.union([narrationStyleSchema, z.literal('clip'), z.literal('end')]);
export type StyleKey = z.infer<typeof styleKeySchema>;

export const voicesConfigSchema = z
  .object({
    provider: providerSchema,
    gemini: providerConfig,
    kokoro: providerConfig,
    styles: z
      .object({
        warm: z.string(),
        excited: z.string(),
        calm: z.string(),
        playful: z.string(),
        clip: z.string(),
        end: z.string(),
      })
      .strict(),
    audition: z
      .object({
        candidates: z.array(z.string()).min(1),
        kokoroCandidates: z.array(z.string()).min(1),
        lines: z.array(z.object({ text: z.string().min(1), style: narrationStyleSchema })).min(1),
      })
      .strict(),
  })
  .strict();
export type VoicesConfig = z.infer<typeof voicesConfigSchema>;

export function loadVoicesConfig(file: string): VoicesConfig {
  const parsed = voicesConfigSchema.safeParse(parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(`${file} is not a valid voices file: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** The voice name for a narration character under a provider (`stub` reuses the Gemini names). */
export function voiceName(
  config: VoicesConfig,
  provider: ProviderId,
  voice: NarrationVoice,
): string {
  return (provider === 'kokoro' ? config.kokoro : config.gemini).voices[voice];
}

/** The model id recorded in clip hashes. */
export function modelFor(config: VoicesConfig, provider: ProviderId): string {
  if (provider === 'stub') return 'stub-1';
  return config[provider].model;
}
