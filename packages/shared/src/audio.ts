import { z } from 'zod';
import { assertType, type Equals } from './internal/type-assert';
import type { NarrationKey } from './items';
import { narrationKeySchema } from './items';

// 02 §5.5 audio. The AudioManager is implemented in packages/ui/src/audio.

/** Sound-effect id. 05 §12 describes the sounds but names no ids yet, so this stays open. */
export type SfxId = string;
/** Music track id (05 §12: island loop, per-workshop loops, festival and sunset themes). */
export type MusicId = string;
/** Narration clip id; resolves to a file through the audio manifest. */
export type ClipId = string;

export const sfxIdSchema = z.string().min(1);
export const musicIdSchema = z.string().min(1);
export const clipIdSchema = z.string().min(1);

/** One part of an AI phrase-bank line: a pre-rendered phrase (`ph.*` key) or a composed number. */
export type PhrasePart = { id: string } | { number: number };
export const phrasePartSchema = z.union([
  z.object({ id: narrationKeySchema }),
  z.object({ number: z.number() }),
]);
assertType<Equals<z.infer<typeof phrasePartSchema>, PhrasePart>>(true);

export interface AudioManager {
  unlock(): Promise<void>; // call on first user gesture
  say(key: NarrationKey, vars?: Record<string, string | number>): Promise<void>; // stitches clips
  sayPhrases(parts: ({ id: string } | { number: number })[]): Promise<void>; // AI phrase-bank lines (pre-rendered clips)
  sayText(text: string, opts?: { voice?: 'glim' | 'narrator' }): Promise<void>; // on-device Web Speech only (no cloud TTS)
  sfx(id: SfxId): void;
  music(track: MusicId | null): void;
  stop(): void;
  setVolumes(v: { voice: number; sfx: number; music: number }): void;
}

/** `apps/web/public/audio/manifest.json`, produced by tools/narration (A02). */
export interface AudioManifest {
  version: string;
  clips: Record<ClipId, { file: string; durationMs: number }>;
}

export const audioManifestSchema = z.object({
  version: z.string().min(1),
  clips: z.record(
    clipIdSchema,
    z.object({ file: z.string().min(1), durationMs: z.number().nonnegative() }),
  ),
});
assertType<Equals<z.infer<typeof audioManifestSchema>, AudioManifest>>(true);
