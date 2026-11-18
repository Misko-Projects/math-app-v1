// WAV → Ogg Opus with ffmpeg-static (07 §3: ~24 kbps mono, no system ffmpeg needed).
//
// ffmpeg-static's install script is not run by `pnpm i` (pnpm-workspace.yaml), so CI never
// downloads the binary. The first local encode runs that script once to fetch it.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { oggOpusDurationMs, wavDurationMs } from './audio';

export type AudioFormat = 'opus' | 'wav';

export interface Encoder {
  format: AudioFormat;
  /** File extension including the dot. */
  ext: string;
  /** Identifies the encoding settings; part of every clip hash, so changing them re-renders. */
  tag: string;
  encode(wav: Uint8Array): Promise<Uint8Array>;
  durationMs(encoded: Uint8Array): number;
}

/**
 * Trims leading and trailing silence so stitched clips (03 §8.4) sit together naturally, keeping a
 * short lead-in (30 ms) and tail (70 ms).
 */
export const TRIM_FILTER = [
  'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.03',
  'areverse',
  'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.07',
  'areverse',
].join(',');

/** ffmpeg arguments for one clip (stdin WAV → stdout Ogg Opus). Bit-exact so output is stable. */
export const OPUS_ARGS = [
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'wav',
  '-i',
  'pipe:0',
  '-af',
  TRIM_FILTER,
  '-ac',
  '1',
  '-ar',
  '48000',
  '-c:a',
  'libopus',
  '-b:a',
  '24k',
  '-application',
  'voip',
  '-map_metadata',
  '-1',
  '-fflags',
  '+bitexact',
  '-flags:a',
  '+bitexact',
  '-f',
  'ogg',
  'pipe:1',
];

export const OPUS_TAG = `opus-${createHash('sha256').update(OPUS_ARGS.join(' ')).digest('hex').slice(0, 8)}`;

/** What planning needs from an encoder (a dry run plans without ffmpeg). */
export function encodingOf(format: AudioFormat): Pick<Encoder, 'ext' | 'tag'> {
  return format === 'wav' ? { ext: '.wav', tag: 'wav' } : { ext: '.ogg', tag: OPUS_TAG };
}

/** Passes WAV through unchanged (tests and CI, where no ffmpeg binary is installed). */
export const wavEncoder: Encoder = {
  format: 'wav',
  ext: '.wav',
  tag: 'wav',
  encode: async (wav) => wav,
  durationMs: wavDurationMs,
};

export function opusEncoder(ffmpeg: string): Encoder {
  return {
    format: 'opus',
    ext: '.ogg',
    tag: OPUS_TAG,
    durationMs: oggOpusDurationMs,
    encode: (wav) =>
      new Promise((resolve, reject) => {
        const child = spawn(ffmpeg, OPUS_ARGS, { stdio: ['pipe', 'pipe', 'pipe'] });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout.on('data', (b: Buffer) => out.push(b));
        child.stderr.on('data', (b: Buffer) => err.push(b));
        child.on('error', reject);
        child.on('close', (code) => {
          const encoded = new Uint8Array(Buffer.concat(out));
          if (code === 0 && encoded.length > 0) resolve(encoded);
          else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().trim()}`));
        });
        child.stdin.on('error', () => {}); // a failed ffmpeg closes stdin early; 'close' reports it
        child.stdin.end(wav);
      }),
  };
}

/** Path of the ffmpeg-static binary, or null when the package is not installed. */
export function ffmpegStaticPath(): string | null {
  const require = createRequire(import.meta.url);
  try {
    return require('ffmpeg-static') as string | null;
  } catch {
    return null;
  }
}

/**
 * Returns a usable ffmpeg binary, downloading ffmpeg-static's binary on first local use. Never
 * downloads in CI. Throws with instructions when no binary is available.
 */
export function ensureFfmpeg(env: NodeJS.ProcessEnv = process.env): string {
  const bin = ffmpegStaticPath();
  if (!bin) throw new Error('ffmpeg-static is not installed; run `pnpm i`.');
  if (existsSync(bin)) return bin;
  if (env.CI) {
    throw new Error(
      'no ffmpeg binary, and CI never downloads one; use --provider stub --format wav',
    );
  }
  const require = createRequire(import.meta.url);
  const pkgDir = dirname(require.resolve('ffmpeg-static/package.json'));
  console.log('narration: downloading the ffmpeg-static binary (first local use only)…');
  const result = spawnSync(process.execPath, [join(pkgDir, 'install.js')], {
    cwd: pkgDir,
    stdio: 'inherit',
  });
  if (result.status !== 0 || !existsSync(bin)) {
    throw new Error(
      `could not download ffmpeg (exit ${result.status}). Retry, or run \`node ${join(pkgDir, 'install.js')}\` from ${pkgDir}.`,
    );
  }
  return bin;
}
