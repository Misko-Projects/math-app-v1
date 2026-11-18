// Extracts every clip to render from the content build (07 §3, 03 §8.4):
//
// - each non-blank, spoken static segment of every narration.json line becomes the clip `<key>#<i>`,
//   the same ids the compiler writes into `clips` (punctuation-only segments such as the "?" after a
//   slot carry no audio; the AudioManager skips them);
// - each `num.*` clip also gets its sentence-final variant `num.<n>.end#0` (03 §8.3), which the
//   AudioManager plays when a number ends the sentence;
// - the clip sets voices.yaml lists under `voiceClipSets` are rendered again in Pip's and Glim's
//   own voices as `pip:<clip id>` and `glim:<clip id>` (02 §5.5), so their lines stitch numbers in
//   their own voice. The AudioManager falls back to the narrator's clip for anything else.
//
// Clip file names are content hashes of (provider, model, voice, style, text) plus the encoding
// settings, so a re-run renders only new or changed clips.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from '@number-island/content';
import {
  type ClipId,
  type NarrationJson,
  type NarrationStyle,
  type NarrationVoice,
  narrationStyleSchema,
  voiceClipId,
} from '@number-island/shared';
import { parse } from 'yaml';
import {
  CLIP_SET_NAMESPACES,
  modelFor,
  type ProviderId,
  type StyleKey,
  type VoicesConfig,
  voiceName,
} from './config';
import { isSpoken, speakSymbols, tidy } from './spoken';

/** One clip to render. */
export interface ClipJob {
  id: ClipId;
  /** The words to speak (already in spoken form). */
  text: string;
  voice: NarrationVoice;
  style: StyleKey;
  /** Provider voice name (e.g. `Sulafat`). */
  voiceName: string;
  /** Provider delivery text for the style. */
  styleText: string;
  /** 16 hex characters of sha256(provider, model, voice, style, text, encoding). */
  hash: string;
  /** File name under the output directory. */
  file: string;
}

/** A file the renderer owns in the output directory (it may prune these). */
export const CLIP_FILE = /^[0-9a-f]{16}\.(ogg|wav)$/;

const CLIP_SETS: ReadonlySet<string> = new Set(CLIP_SET_NAMESPACES);

/**
 * True for clip-set words (03 §8.1), stitched into lines at runtime. They render in the brisk
 * `clip` style so "twenty-three" comes out as one word with no pause inside it.
 */
export function isClipSet(key: string): boolean {
  return CLIP_SETS.has(key.slice(0, key.indexOf('.')));
}

/** The characters (besides the narrator) that get their own copy of a clip set (voices.yaml). */
function extraVoicesFor(config: VoicesConfig, key: string): NarrationVoice[] {
  const ns = key.slice(0, key.indexOf('.'));
  return (['pip', 'glim'] as const).filter((v) =>
    (config.voiceClipSets[v] as readonly string[]).includes(ns),
  );
}

/** `num.<n>`, `num.hundred`, `num.thousand` and `num.million` have a sentence-final `.end` clip. */
export function hasEndVariant(key: string): boolean {
  return /^num\.(\d+|hundred|thousand|million)$/.test(key);
}

/** Reads the 03 §8.2 `style` of every authored line (narration.json does not carry it). */
export function loadStyles(narrationDir: string): Map<string, NarrationStyle> {
  const styles = new Map<string, NarrationStyle>();
  for (const name of readdirSync(narrationDir).sort()) {
    if (!name.endsWith('.yaml') || name === 'voices.yaml') continue;
    const data: unknown = parse(readFileSync(join(narrationDir, name), 'utf8'));
    if (!data || typeof data !== 'object') continue;
    for (const [key, entry] of Object.entries(data)) {
      const style = narrationStyleSchema.safeParse((entry as { style?: unknown } | null)?.style);
      if (style.success) styles.set(key, style.data);
    }
  }
  return styles;
}

export function clipHash(parts: {
  provider: ProviderId;
  model: string;
  voiceName: string;
  styleText: string;
  text: string;
  encoding: string;
}): string {
  const payload = JSON.stringify([
    parts.provider,
    parts.model,
    parts.voiceName,
    parts.styleText,
    parts.text,
    parts.encoding,
  ]);
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export interface PlanInput {
  narration: NarrationJson;
  styles: ReadonlyMap<string, NarrationStyle>;
  config: VoicesConfig;
  provider: ProviderId;
  /** Clip file extension and encoding tag (encode.ts `encodingOf`). */
  encoding: { ext: string; tag: string };
}

export interface Plan {
  jobs: ClipJob[];
  /** Static clip ids that carry no audio (punctuation-only segments). */
  silent: ClipId[];
}

/** Plans every clip of the content build, sorted by clip id. Throws if ids drift from the compiler. */
export function planClips({ narration, styles, config, provider, encoding }: PlanInput): Plan {
  const model = modelFor(config, provider);
  const jobs: ClipJob[] = [];
  const silent: ClipId[] = [];
  const job = (id: string, text: string, voice: NarrationVoice, style: StyleKey): ClipJob => {
    const name = voiceName(config, provider, voice);
    const styleText = config.styles[style];
    const hash = clipHash({
      provider,
      model,
      voiceName: name,
      styleText,
      text,
      encoding: encoding.tag,
    });
    return { id, text, voice, style, voiceName: name, styleText, hash, file: hash + encoding.ext };
  };

  for (const key of Object.keys(narration).sort()) {
    const entry = narration[key];
    if (!entry) continue;
    const authoredSay = entry.say !== undefined;
    const { segments, errors } = parseLine(entry.say ?? entry.text);
    if (errors.length > 0) throw new Error(`${key}: ${errors.join('; ')}`);
    const voice = entry.voice ?? 'narrator';
    const style: StyleKey = styles.get(key) ?? (isClipSet(key) ? 'clip' : 'warm');

    const expected = entry.clips.filter((c) => !c.startsWith('$'));
    const firstJob = jobs.length;
    const ids: string[] = [];
    // Whether a slot or a non-blank segment comes earlier in the line (A01's `followsContent`).
    let contentBefore = false;
    for (const segment of segments) {
      if (segment.kind === 'slot') {
        contentBefore = true;
        continue;
      }
      if (segment.text.trim() === '') continue;
      const id = `${key}#${ids.length}`;
      ids.push(id);
      const follows = contentBefore;
      contentBefore = true;
      if (!isSpoken(segment.text, follows)) {
        silent.push(id);
        continue;
      }
      const words = tidy(authoredSay ? segment.text : speakSymbols(segment.text));
      jobs.push(job(id, words, voice, style));
    }
    if (ids.join('\n') !== expected.join('\n')) {
      throw new Error(
        `${key}: planned clips [${ids.join(', ')}] differ from narration.json [${expected.join(', ')}]; rebuild content (pnpm content:build)`,
      );
    }

    if (hasEndVariant(key)) {
      const words = tidy(entry.say ?? entry.text).replace(/[.!?]*$/, '.');
      jobs.push(job(`${key}.end#0`, words, voice, 'end'));
    }

    // Clip sets listed in `voiceClipSets` again in Pip's and Glim's voices (02 §5.5, 03 §8.3).
    if (isClipSet(key)) {
      const own = jobs.slice(firstJob);
      for (const extra of extraVoicesFor(config, key)) {
        if (extra === voice) continue;
        for (const j of own) jobs.push(job(voiceClipId(j.id, extra), j.text, extra, j.style));
      }
    }
  }

  jobs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { jobs, silent };
}
