// The render pipeline (07 §3): plan every clip, skip clips whose content-hashed file already exists,
// estimate and cap the spend, render the rest, encode to Opus, then write
// `apps/web/public/audio/manifest.json` (02 §5.5).
//
// Idempotent: a re-run with unchanged content renders nothing; changed text renders only the
// changed clips. Resumable: every finished clip is written as it arrives, so an interrupted run
// keeps its work, and batch jobs resume from the provider's saved ledger.
//
// Only a complete run (unfiltered, nothing failed, nothing pending, no abort) publishes a manifest
// of exactly the current plan and deletes clip and partial files nothing references. Any other run
// keeps every previous manifest entry whose file still exists for clips it has no new file for
// (and, when filtered, for every clip it did not select), and deletes nothing, so a partial or
// failed run never removes or swaps working audio.
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
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
  /**
   * Lock held from planning through pruning, so two renders into the same output directory (in any
   * format) never interleave. Default: `<stateDir>/render.lock`.
   */
  lockFile?: string;
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
  if (opts.dryRun || !opts.renderer) return plannedRun(opts);
  const lock = opts.lockFile ?? join(opts.stateDir, 'render.lock');
  mkdirSync(dirname(lock), { recursive: true });
  let fd: number;
  try {
    fd = openSync(lock, 'wx');
  } catch {
    const report = await plannedRun({ ...opts, dryRun: true });
    report.aborted = `another narration render is writing ${opts.outDir}. If none is running, delete ${lock}`;
    report.pending = report.toRender;
    return report;
  }
  try {
    return await plannedRun(opts);
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
}

async function plannedRun(opts: PipelineOptions): Promise<PipelineReport> {
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
  const manifestFile = join(opts.outDir, 'manifest.json');
  const previous = readManifest(manifestFile);
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
  // Requests a saved provider job already covers cost nothing new, so they are left out.
  let alreadyPaid = new Set<string>();
  let ledgerError: string | null = null;
  try {
    alreadyPaid =
      opts.renderer?.covered?.(
        todo.map((j) => ({
          id: j.hash,
          text: j.text,
          voiceName: j.voiceName,
          styleText: j.styleText,
        })),
        opts.stateDir,
        { abandonUnconfirmedBatches: opts.abandonUnconfirmedBatches },
      ) ?? alreadyPaid;
  } catch (e) {
    ledgerError = e instanceof Error ? e.message : String(e);
  }
  const est = estimate(
    todo.filter((j) => !alreadyPaid.has(j.hash)),
    price,
    mode,
  );
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
  if (ledgerError) {
    report.aborted = ledgerError;
    report.pending = todo.length;
    return report;
  }
  if (opts.dryRun || !opts.renderer) return report;
  if (existsSync(manifestFile) && !previous) {
    // Without the previous manifest a partial run could not keep its entries: refuse rather than
    // risk dropping working audio.
    report.aborted = `${manifestFile} exists but cannot be read; fix or delete it, then re-run`;
    report.pending = todo.length;
    return report;
  }
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
  // Every clip now has its file, so no saved provider work is needed any more.
  if (report.complete) opts.renderer.clearSaved?.(opts.stateDir, log);

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
    // A filtered run never changes the entry of a clip it did not select, even when another cached
    // file for it exists (for example after its text was changed back).
    const unselected = opts.only !== undefined && !opts.only.test(j.id);
    if (unselected && clips[j.id]) continue;
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
  // Write then rename, so an interrupted run never leaves a truncated manifest.
  writeFileSync(`${manifestFile}.tmp`, canonicalJson(manifest));
  renameSync(`${manifestFile}.tmp`, manifestFile);
  report.manifest = manifest;

  const referenced = new Set(Object.values(clips).map((c) => c.file));
  for (const name of readdirSync(opts.outDir).sort()) {
    // Only a complete run deletes anything, leftover partial files included.
    if (!report.complete) break;
    if ((CLIP_FILE.test(name) && !referenced.has(name)) || PARTIAL_FILE.test(name)) {
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
