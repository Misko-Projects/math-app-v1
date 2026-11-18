#!/usr/bin/env node
// pnpm narration:render | narration:audition (07 §3). Build-time only: nothing here runs in the app.
//
//   pnpm narration:render [--dry-run] [--provider gemini|kokoro|stub] [--max-usd 5]
//                         [--mode auto|interactive|batch] [--concurrency 4] [--max-wait-min 240]
//                         [--out <dir>] [--format opus|wav] [--only <clip-id regex>]
//   pnpm narration:audition [--provider gemini|kokoro|stub] [--max-usd 0.5]
//
// The Gemini key comes from GEMINI_API_KEY, else from the user-owned secrets file
// ($MATH_APP_SECRETS or ~/.config/math-app-v1/secrets.env). It is never printed or logged.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { narrationJsonSchema } from '@number-island/shared';
import {
  loadVoicesConfig,
  modelFor,
  type ProviderId,
  providerSchema,
  type VoicesConfig,
} from './config';
import { costUsd, estimate, priceFor, SpendGuard } from './cost';
import {
  type AudioFormat,
  type Encoder,
  encodingOf,
  ensureFfmpeg,
  opusEncoder,
  wavEncoder,
} from './encode';
import { type PipelineReport, runPipeline } from './pipeline';
import { loadStyles } from './plan';
import { geminiRenderer } from './providers/gemini';
import { kokoroRenderer } from './providers/kokoro';
import { stubRenderer } from './providers/stub';
import type { Renderer, TtsRequest } from './providers/types';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const NARRATION_DIR = join(ROOT, 'packages/content/narration');
const NARRATION_JSON = join(ROOT, 'packages/content/dist/narration.json');
const AUDIO_DIR = join(ROOT, 'apps/web/public/audio');
const STATE_DIR = join(ROOT, 'tmp/narration/state');

/** Reads one key from a dotenv-style file (same syntax as scripts/secrets-link.mjs). */
export function readEnvKey(text: string, key: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m || m[1] !== key) continue;
    let value = (m[2] ?? '').trim();
    const q = value[0];
    if (q === '"' || q === "'") {
      const close = value.indexOf(q, 1);
      if (close < 0) continue;
      value = value.slice(1, close);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    return value || undefined;
  }
  return undefined;
}

export function secretsPath(env: NodeJS.ProcessEnv): string {
  const override = env.MATH_APP_SECRETS?.trim();
  if (override) return resolve(override.replace(/^~(?=$|\/)/, homedir()));
  return join(homedir(), '.config', 'math-app-v1', 'secrets.env');
}

export function geminiKey(env: NodeJS.ProcessEnv): string | undefined {
  const fromEnv = env.GEMINI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = secretsPath(env);
  if (!existsSync(file)) return undefined;
  return readEnvKey(readFileSync(file, 'utf8'), 'GEMINI_API_KEY');
}

const NO_KEY_HELP = [
  'No GEMINI_API_KEY found (live render pending a key). To render with Gemini:',
  '  1. Add GEMINI_API_KEY=<your billed key> to ~/.config/math-app-v1/secrets.env (mode 600),',
  '     or export GEMINI_API_KEY in this shell.',
  '  2. Run `pnpm narration:render --dry-run` to check the estimate, then `pnpm narration:render`.',
  'Or render locally without a key: NARRATION_PROVIDER=kokoro pnpm narration:render (see 07 §3).',
  'Until then the game speaks narration with on-device Web Speech.',
].join('\n');

interface Common {
  provider: ProviderId;
  config: VoicesConfig;
  format: AudioFormat;
  encoder: () => Encoder;
  renderer: () => Renderer | null;
}

function common(values: { provider?: string; format?: string }, env: NodeJS.ProcessEnv): Common {
  const config = loadVoicesConfig(join(NARRATION_DIR, 'voices.yaml'));
  const provider = providerSchema.parse(
    values.provider ?? env.NARRATION_PROVIDER ?? config.provider,
  );
  const format = values.format ?? 'opus';
  if (format !== 'opus' && format !== 'wav') throw new Error(`--format must be opus or wav`);
  return {
    provider,
    config,
    format,
    encoder: () => (format === 'wav' ? wavEncoder : opusEncoder(ensureFfmpeg(env))),
    renderer: () => {
      if (provider === 'stub') return stubRenderer();
      if (provider === 'kokoro') return kokoroRenderer({ model: config.kokoro.model, env });
      const apiKey = geminiKey(env);
      return apiKey ? geminiRenderer({ apiKey, model: config.gemini.model }) : null;
    },
  };
}

function number(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}

const usd = (n: number) => `$${n.toFixed(4)}`;

export function formatReport(r: PipelineReport, dryRun: boolean): string {
  const lines = [
    `narration:render${dryRun ? ' (dry run)' : ''}: provider ${r.provider}, model ${r.model}, mode ${r.mode}`,
    `  clips: ${r.total} needed, ${r.cached} already rendered, ${r.toRender} to render${r.skipped ? `, ${r.skipped} not selected by --only` : ''}`,
    `  estimate: ~${Math.round(r.estimate.audioSeconds)} s of audio, ${r.estimate.outputTokens} output + ${r.estimate.inputTokens} input tokens → ${usd(r.estimate.usd)} (cap ${usd(r.maxUsd)})`,
  ];
  if (!dryRun) {
    lines.push(
      `  rendered: ${r.rendered}, failed: ${r.failed.length}, pending: ${r.pending}, pruned: ${r.pruned.length}`,
      `  actual cost (from token usage): ${usd(r.spentUsd)}`,
    );
    if (r.manifest)
      lines.push(
        `  manifest: ${Object.keys(r.manifest.clips).length} clips, version ${r.manifest.version}`,
      );
    for (const f of r.failed.slice(0, 10)) lines.push(`  failed ${f.id}: ${f.error}`);
    if (r.failed.length > 10) lines.push(`  … and ${r.failed.length - 10} more failures`);
  }
  if (r.aborted) {
    lines.push(`  aborted: ${r.aborted}${r.rendered === 0 ? '. Nothing rendered.' : ''}`);
  }
  return lines.join('\n');
}

async function render(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean', default: false },
      provider: { type: 'string' },
      'max-usd': { type: 'string' },
      mode: { type: 'string', default: 'auto' },
      concurrency: { type: 'string' },
      'max-wait-min': { type: 'string' },
      out: { type: 'string' },
      format: { type: 'string' },
      only: { type: 'string' },
    },
  });
  const c = common(values, env);
  const dryRun = values['dry-run'] ?? false;
  const mode = values.mode;
  if (mode !== 'auto' && mode !== 'interactive' && mode !== 'batch') {
    throw new Error('--mode must be auto, interactive or batch');
  }
  if (!existsSync(NARRATION_JSON)) {
    throw new Error(`${relative(ROOT, NARRATION_JSON)} is missing; run pnpm content:build first`);
  }
  const narration = narrationJsonSchema.parse(JSON.parse(readFileSync(NARRATION_JSON, 'utf8')));
  // The stub never writes over the committed audio unless --out says so.
  const outDir = resolve(
    values.out ?? (c.provider === 'stub' ? join(ROOT, 'tmp/narration/stub') : AUDIO_DIR),
  );
  const renderer = dryRun ? null : c.renderer();
  const report = await runPipeline({
    narration,
    styles: loadStyles(NARRATION_DIR),
    config: c.config,
    provider: c.provider,
    renderer,
    // A dry run never needs ffmpeg: planning only needs the extension and the encoding tag.
    encoder: dryRun || !renderer ? { ...wavEncoder, ...encodingOf(c.format) } : c.encoder(),
    outDir,
    stateDir: STATE_DIR,
    mode,
    maxUsd: number(values['max-usd'], '--max-usd', 5),
    concurrency: Math.max(1, Math.floor(number(values.concurrency, '--concurrency', 4))),
    maxWaitMs: number(values['max-wait-min'], '--max-wait-min', 240) * 60_000,
    dryRun,
    only: values.only ? new RegExp(values.only) : undefined,
    log: (m) => console.log(m),
  });
  console.log(formatReport(report, dryRun || !renderer));
  if (!renderer && c.provider === 'gemini' && !geminiKey(env)) {
    console.log(NO_KEY_HELP);
    return 0;
  }
  if (!dryRun && renderer) console.log(`  output: ${relative(ROOT, outDir) || '.'}`);
  return report.aborted || report.failed.length > 0 ? 1 : 0;
}

async function audition(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      provider: { type: 'string' },
      'max-usd': { type: 'string' },
      format: { type: 'string' },
    },
  });
  const c = common(values, env);
  const renderer = c.renderer();
  if (!renderer) {
    console.log(NO_KEY_HELP);
    return 0;
  }
  const candidates =
    c.provider === 'kokoro' ? c.config.audition.kokoroCandidates : c.config.audition.candidates;
  const requests: TtsRequest[] = candidates.flatMap((voice) =>
    c.config.audition.lines.map((line, i) => ({
      id: `${voice}-${i + 1}`,
      text: line.text,
      voiceName: voice,
      styleText: c.config.styles[line.style],
    })),
  );
  const maxUsd = number(values['max-usd'], '--max-usd', 0.5);
  const price = priceFor(c.provider, modelFor(c.config, c.provider), Date.now());
  const est = estimate(requests, price, 'interactive');
  console.log(
    `narration:audition: ${candidates.length} voices × ${c.config.audition.lines.length} lines with ${c.provider}; estimate ${usd(est.usd)} (cap ${usd(maxUsd)})`,
  );
  if (est.usd > maxUsd) {
    console.log('  aborted: the estimate exceeds --max-usd. Nothing rendered.');
    return 1;
  }
  const encoder = c.encoder();
  const outDir = join(ROOT, 'tmp/audition');
  mkdirSync(outDir, { recursive: true });
  const guard = new SpendGuard(maxUsd);
  const written: string[] = [];
  let failures = 0;
  await renderer.render(requests, {
    mode: 'interactive',
    concurrency: 4,
    stateDir: STATE_DIR,
    maxWaitMs: 0,
    log: (m) => console.log(m),
    estimateUsd: (rs) => estimate(rs, price, 'interactive').usd,
    reserve: (ids, e, o) => guard.reserve(ids, e, o),
    onResult: async (o) => {
      guard.settle(o.id, o.usage ? costUsd(price, 'interactive', o.usage) : 0);
      if (!o.ok) {
        failures += 1;
        console.log(`  failed ${o.id}: ${o.error}`);
        return;
      }
      const file = `${o.id}${encoder.ext}`;
      writeFileSync(join(outDir, file), await encoder.encode(o.wav));
      written.push(file);
    },
  });
  written.sort();
  const rows = candidates
    .map((voice) => {
      const cells = c.config.audition.lines
        .map((_, i) => `${voice}-${i + 1}${encoder.ext}`)
        .map((f) =>
          written.includes(f) ? `<td><audio controls src="${f}"></audio></td>` : '<td>—</td>',
        )
        .join('');
      return `<tr><th>${voice}</th>${cells}</tr>`;
    })
    .join('\n');
  const head = c.config.audition.lines.map((l) => `<th>${l.text}</th>`).join('');
  writeFileSync(
    join(outDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Narration audition</title>\n<table border="1" cellpadding="6"><tr><th>Voice</th>${head}</tr>\n${rows}\n</table>\n`,
  );
  console.log(
    `  wrote ${written.length} clips and index.html to ${relative(ROOT, outDir)}; actual cost ${usd(guard.spentUsd)}`,
  );
  console.log('  Pick voices, then record them in packages/content/narration/voices.yaml.');
  return failures > 0 ? 1 : 0;
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [command, ...rest] = argv;
  if (command === 'render') return render(rest, env);
  if (command === 'audition') return audition(rest, env);
  console.error('usage: cli.ts render|audition [options]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(`narration: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    },
  );
}
