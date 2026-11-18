// The render pipeline (07 §3): plan every clip, skip clips whose content-hashed file already exists,
// estimate and cap the spend, render the rest, encode to Opus, then write
// `apps/web/public/audio/manifest.json` (02 §5.5).
//
// Idempotent: a re-run with unchanged content renders nothing; changed text renders only the
// changed clips. Resumable: every finished clip is written as it arrives, so an interrupted run
// keeps its work, and batch jobs resume from the provider's saved ledger.
//
// Only a complete run (unfiltered, nothing failed, nothing pending, no abort) publishes a manifest
// of exactly the current plan and prunes clip files nothing references. Any other run keeps every
// previous manifest entry whose file still exists for clips it has no new file for, and prunes
// nothing, so a partial or failed run never removes working audio.
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  type AudioManifest,
  audioManifestSchema,
  type NarrationJson,
  type NarrationStyle,
} from '@number-island/shared';
import type { ProviderId, VoicesConfig } from './config';
import { costUsd, type Estimate, estimate, priceFor, type RenderMode, SpendGuard } from './cost';
import type { Encoder } from './encode';
import { CLIP_FILE, type ClipJob, planClips } from './plan';
import type { Renderer, TtsRequest } from './providers/types';

/** A renderer-owned temporary file: a clip name plus `.partial` (written, then renamed). */
const PARTIAL_FILE = /^[0-9a-f]{16}\.(ogg|wav)\.partial$/;

/** Interactive calls below this many clips, the Batch API from here up (07 §3). */
export const BATCH_THRESHOLD = 200;

export interface PipelineOptions {
  narration: NarrationJson;
  styles: ReadonlyMap<string, NarrationStyle>;
  config: VoicesConfig;
  provider: ProviderId;
  /** Null for a dry run without a provider (e.g. no API key). */
  renderer: Renderer | null;
  encoder: Encoder;
  outDir: string;
  stateDir: string;
  mode: RenderMode | 'auto';
  maxUsd: number;
  concurrency: number;
  maxWaitMs: number;
  dryRun: boolean;
  /** Render only clips whose id matches (others keep their files; nothing is pruned). */
  only?: RegExp;
  /** Drop unconfirmed batch submissions that cannot be found (operator flag). */
  abandonUnconfirmedBatches?: boolean;
  now?: number;
  log?: (message: string) => void;
}

export interface PipelineReport {
  provider: ProviderId;
  model: string;
  mode: RenderMode;
  /** Clips the content needs. */
  total: number;
  /** Clips already rendered (their file exists). */
  cached: number;
  /** Missing clips left alone because they do not match `only`. */
  skipped: number;
  /** Clip files to render at the start of the run (clips sharing a file count once). */
  toRender: number;
  estimate: Estimate;
  maxUsd: number;
  /** Clip files rendered and written by this run. */
  rendered: number;
  failed: { id: string; error: string }[];
  /** Clip files neither rendered nor failed (spend cap, or batch jobs still running). */
  pending: number;
  /** Measured cost of this run, from the provider's token usage. */
  spentUsd: number;
  manifest: AudioManifest | null;
  /** True when the manifest is exactly the current plan (see the file comment). */
  complete: boolean;
  /** Previous manifest entries kept because this run was not complete. */
  kept: number;
  pruned: string[];
  aborted: string | null;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineReport> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? Date.now();
  const { jobs } = planClips({
    narration: opts.narration,
    styles: opts.styles,
    config: opts.config,
    provider: opts.provider,
    encoding: opts.encoder,
  });
  const model = opts.renderer?.model ?? modelName(opts);
  const previous = readManifest(join(opts.outDir, 'manifest.json'));
  const knownDurations = new Map<string, number>();
  for (const clip of Object.values(previous?.clips ?? {})) {
    knownDurations.set(clip.file, clip.durationMs);
  }

  const missing = jobs.filter((j) => !existsSync(join(opts.outDir, j.file)));
  const selected = missing.filter((j) => !opts.only || opts.only.test(j.id));
  // Clips with the same voice, style and text share one file: render each file once.
  const todo = [...new Map(selected.map((j) => [j.file, j])).values()];
  // Only Gemini has a batch API; local providers always render one clip at a time.
  const mode: RenderMode =
    opts.provider !== 'gemini'
      ? 'interactive'
      : opts.mode === 'auto'
        ? todo.length < BATCH_THRESHOLD
          ? 'interactive'
          : 'batch'
        : opts.mode;
  const price = priceFor(opts.provider, model, now);
  const est = estimate(todo, price, mode);
  const report: PipelineReport = {
    provider: opts.provider,
    model,
    mode,
    total: jobs.length,
    cached: jobs.length - missing.length,
    skipped: missing.length - selected.length,
    toRender: todo.length,
    estimate: est,
    maxUsd: opts.maxUsd,
    rendered: 0,
    failed: [],
    pending: 0,
    spentUsd: 0,
    manifest: null,
    complete: false,
    kept: 0,
    pruned: [],
    aborted: null,
  };
  if (opts.dryRun || !opts.renderer) return report;
  if (est.usd > opts.maxUsd) {
    report.aborted = `estimated $${est.usd.toFixed(4)} exceeds --max-usd ${opts.maxUsd}`;
    report.pending = todo.length;
    return report;
  }

  mkdirSync(opts.outDir, { recursive: true });
  // Requests are identified by the clip file's content hash (see TtsRequest.id).
  const byHash = new Map<string, ClipJob>(todo.map((j) => [j.hash, j]));
  const done = new Set<string>();
  const requests: TtsRequest[] = todo.map((j) => ({
    id: j.hash,
    text: j.text,
    voiceName: j.voiceName,
    styleText: j.styleText,
  }));
  const guard = new SpendGuard(opts.maxUsd);
  if (todo.length > 0) {
    log(`narration: rendering ${todo.length} clip(s) with ${opts.provider} (${mode})…`);
    try {
      await opts.renderer.render(requests, {
        mode,
        concurrency: opts.concurrency,
        stateDir: opts.stateDir,
        maxWaitMs: opts.maxWaitMs,
        complete: !opts.only,
        abandonUnconfirmedBatches: opts.abandonUnconfirmedBatches,
        log,
        estimateUsd: (rs, m) => estimate(rs, price, m ?? mode).usd,
        reserve: (ids, usd, o) => guard.reserve(ids, usd, o),
        onResult: async (outcome) => {
          const job = byHash.get(outcome.id);
          if (!job || done.has(outcome.id)) return true;
          done.add(outcome.id);
          const billing = outcome.billing ?? mode;
          guard.settle(outcome.id, outcome.usage ? costUsd(price, billing, outcome.usage) : 0);
          report.spentUsd = guard.spentUsd;
          if (!outcome.ok) {
            report.failed.push({ id: job.id, error: outcome.error });
            return true;
          }
          try {
            const encoded = await opts.encoder.encode(outcome.wav);
            knownDurations.set(job.file, opts.encoder.durationMs(encoded));
            // Write then rename, so an interrupted run never leaves a truncated clip that a
            // re-run would mistake for a finished one.
            const path = join(opts.outDir, job.file);
            writeFileSync(`${path}.partial`, encoded);
            renameSync(`${path}.partial`, path);
            report.rendered += 1;
            if (report.rendered % 50 === 0) {
              log(`narration: ${report.rendered}/${todo.length} rendered`);
            }
            return true;
          } catch (e) {
            report.failed.push({ id: job.id, error: e instanceof Error ? e.message : String(e) });
            return false;
          }
        },
      });
    } catch (e) {
      // Keep everything already written; the manifest below still lists it.
      report.aborted = e instanceof Error ? e.message : String(e);
    }
  }
  report.pending = todo.length - done.size;
  report.complete =
    !opts.only && !report.aborted && report.failed.length === 0 && report.pending === 0;

  const clips: AudioManifest['clips'] = {};
  if (!report.complete) {
    for (const [id, old] of Object.entries(previous?.clips ?? {})) {
      if (existsSync(join(opts.outDir, old.file))) clips[id] = old;
    }
  }
  let fresh = 0;
  for (const j of jobs) {
    const path = join(opts.outDir, j.file);
    if (!existsSync(path)) continue;
    let durationMs = knownDurations.get(j.file);
    if (durationMs === undefined) {
      durationMs = opts.encoder.durationMs(new Uint8Array(readFileSync(path)));
      knownDurations.set(j.file, durationMs);
    }
    if (clips[j.id]?.file !== j.file) fresh += 1;
    clips[j.id] = { file: j.file, durationMs };
  }
  if (!report.complete) report.kept = Object.keys(clips).length - fresh;
  const manifest = buildManifest(clips);
  writeFileSync(join(opts.outDir, 'manifest.json'), canonicalJson(manifest));
  report.manifest = manifest;

  const referenced = new Set(Object.values(clips).map((c) => c.file));
  for (const name of readdirSync(opts.outDir).sort()) {
    const stale = report.complete && CLIP_FILE.test(name) && !referenced.has(name);
    if (stale || PARTIAL_FILE.test(name)) {
      rmSync(join(opts.outDir, name));
      report.pruned.push(name);
    }
  }
  return report;
}

function modelName(opts: PipelineOptions): string {
  if (opts.provider === 'stub') return 'stub-1';
  return opts.config[opts.provider].model;
}

export function readManifest(file: string): AudioManifest | null {
  if (!existsSync(file)) return null;
  try {
    const parsed = audioManifestSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Sorted clips plus a `version` derived from them, so an unchanged render writes identical bytes. */
export function buildManifest(clips: AudioManifest['clips']): AudioManifest {
  const sorted: AudioManifest['clips'] = {};
  for (const id of Object.keys(clips).sort()) {
    const c = clips[id];
    if (c) sorted[id] = { file: c.file, durationMs: c.durationMs };
  }
  const version = createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
  return { version, clips: sorted };
}

/** One clip per line keeps diffs of the committed manifest readable. */
export function canonicalJson(manifest: AudioManifest): string {
  const lines = Object.entries(manifest.clips).map(
    ([id, c]) =>
      `    ${JSON.stringify(id)}: { "file": ${JSON.stringify(c.file)}, "durationMs": ${c.durationMs} }`,
  );
  const body = lines.length ? `{\n${lines.join(',\n')}\n  }` : '{}';
  return `{\n  "version": ${JSON.stringify(manifest.version)},\n  "clips": ${body}\n}\n`;
}
