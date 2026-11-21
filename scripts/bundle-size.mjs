#!/usr/bin/env node
// pnpm bundle-size (09 §2): assert the 02 §6 JS budgets against the built web app.
//
// Reads budgets from bundle-budgets.json and the Vite manifest (apps/web/dist/.vite/manifest.json):
// - initial JS = every entry chunk plus its static imports, gzip-summed;
// - each workshop chunk = a dynamic entry under src/workshops/<id>/ plus the static imports it adds
//   beyond the initial JS.
// - the engine's item core (generators, state checkers, misconception rules) is not in the initial
//   JS (02 §6a): each of its three registries carries a marker string, and no initial file may
//   contain one. The chunk that holds them is reported with its size; it has no budget of its own.
// Time to interactive is reported as not measured here (02 §6: reported, not enforced).
// Exit 1 when a budget is exceeded, the item core is in the initial JS, or the build is missing.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const KB = 1024;

/**
 * The markers of the engine's item-core registries (packages/engine/src/items/install.ts,
 * `ITEM_CORE_MARKS`; bundle-size.test.ts keeps the two lists equal).
 */
export const ITEM_CORE_MARKS = [
  'number-island:item-core/generators',
  'number-island:item-core/state-checkers',
  'number-island:item-core/misconception-rules',
];

/**
 * @typedef {{ file: string; src?: string; isEntry?: boolean; isDynamicEntry?: boolean; imports?: string[]; dynamicImports?: string[]; css?: string[] }} ManifestChunk
 * @typedef {Record<string, ManifestChunk>} Manifest
 * @typedef {{ initialJsKbGzip: number; workshopChunkKbGzip: number; workshopSourcePattern: string }} Budgets
 */

/** Static-import closure of the given manifest keys. */
function closure(manifest, keys) {
  const seen = new Set();
  const stack = [...keys];
  while (stack.length > 0) {
    const key = /** @type {string} */ (stack.pop());
    if (seen.has(key)) continue;
    seen.add(key);
    for (const dep of manifest[key]?.imports ?? []) stack.push(dep);
  }
  return seen;
}

/**
 * @param {{ manifest: Manifest; budgets: Budgets; gzipSizeOf: (file: string) => number; textOf?: (file: string) => string }} input
 *   `textOf` reads a built file; with it the report also says where the item core is.
 */
export function measure({ manifest, budgets, gzipSizeOf, textOf }) {
  const jsFiles = (keys) => [
    ...new Set([...keys].map((k) => manifest[k]?.file).filter((f) => f?.endsWith('.js'))),
  ];
  const bytes = (files) => files.reduce((sum, f) => sum + gzipSizeOf(f), 0);

  const entryKeys = Object.keys(manifest).filter((k) => manifest[k]?.isEntry);
  const initialKeys = closure(manifest, entryKeys);
  const initialFiles = jsFiles(initialKeys);
  const initialBytes = bytes(initialFiles);

  const pattern = new RegExp(budgets.workshopSourcePattern);
  /** @type {Map<string, Set<string>>} */
  const byWorkshop = new Map();
  for (const [key, chunk] of Object.entries(manifest)) {
    const match = pattern.exec(chunk.src ?? key);
    if (!chunk.isDynamicEntry || !match) continue;
    const id = /** @type {string} */ (match[1]);
    const keys = byWorkshop.get(id) ?? new Set();
    for (const k of closure(manifest, [key])) if (!initialKeys.has(k)) keys.add(k);
    byWorkshop.set(id, keys);
  }

  const workshops = [...byWorkshop.entries()]
    .map(([id, keys]) => {
      const kb = bytes(jsFiles(keys)) / KB;
      return {
        id,
        kbGzip: kb,
        budgetKbGzip: budgets.workshopChunkKbGzip,
        ok: kb <= budgets.workshopChunkKbGzip,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const initial = {
    kbGzip: initialBytes / KB,
    budgetKbGzip: budgets.initialJsKbGzip,
    ok: initialBytes / KB <= budgets.initialJsKbGzip,
    files: initialFiles,
  };
  const itemCore = textOf
    ? locateItemCore({ files: jsFiles(Object.keys(manifest)), initialFiles, textOf, bytes })
    : undefined;
  return {
    initial,
    workshops,
    ...(itemCore ? { itemCore } : {}),
    ok: initial.ok && workshops.every((w) => w.ok) && (itemCore?.ok ?? true),
  };
}

/**
 * Where the item-core markers are. Ok when every marker is in a built file and none is in an
 * initial file. A marker in no file at all is a failure too: it means the check no longer sees
 * the item core, not that the item core is gone.
 */
function locateItemCore({ files, initialFiles, textOf, bytes }) {
  const initial = new Set(initialFiles);
  /** @type {string[]} */ const inInitial = [];
  /** @type {string[]} */ const missing = [];
  const lazyFiles = new Set();
  for (const mark of ITEM_CORE_MARKS) {
    const holders = files.filter((f) => textOf(f).includes(mark));
    if (holders.length === 0) missing.push(mark);
    for (const f of holders) {
      if (initial.has(f)) inInitial.push(`${mark} in ${f}`);
      else lazyFiles.add(f);
    }
  }
  return {
    files: [...lazyFiles].sort(),
    kbGzip: bytes([...lazyFiles]) / KB,
    inInitial,
    missing,
    ok: inInitial.length === 0 && missing.length === 0,
  };
}

function format(report) {
  const kb = (n) => `${n.toFixed(1)} KB`;
  const lines = [
    '| Bundle | gzip | budget | status |',
    '|---|---|---|---|',
    `| initial JS (${report.initial.files.length} files) | ${kb(report.initial.kbGzip)} | ${kb(report.initial.budgetKbGzip)} | ${report.initial.ok ? 'ok' : 'OVER'} |`,
    ...report.workshops.map(
      (w) =>
        `| workshop ${w.id} | ${kb(w.kbGzip)} | ${kb(w.budgetKbGzip)} | ${w.ok ? 'ok' : 'OVER'} |`,
    ),
  ];
  if (report.workshops.length === 0) lines.push('| (no workshop chunks yet) | | | |');
  if (report.itemCore) {
    const c = report.itemCore;
    const status = c.ok ? 'lazy' : c.inInitial.length > 0 ? 'IN INITIAL JS' : 'NOT FOUND';
    lines.push(
      `| engine item core (${c.files.length} files, loaded at boot) | ${kb(c.kbGzip)} | none | ${status} |`,
    );
  }
  lines.push(
    '',
    'Time to interactive: reported, not enforced (02 §6); not measured by this job yet (Q01 verifies it).',
  );
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const distArg = process.argv.indexOf('--dist');
  const dist =
    distArg > 0 ? resolve(process.argv[distArg + 1] ?? '') : join(root, 'apps', 'web', 'dist');
  const manifestPath = join(dist, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`bundle-size: ${manifestPath} not found. Run \`pnpm build\` first.`);
    process.exit(1);
  }
  const budgets = JSON.parse(readFileSync(join(root, 'bundle-budgets.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const report = measure({
    manifest,
    budgets,
    gzipSizeOf: (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length,
    textOf: (file) => readFileSync(join(dist, file), 'utf8'),
  });
  const table = format(report);
  console.log(table);
  writeFileSync(join(dist, 'bundle-size-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Bundle size\n\n${table}\n`);
  }
  if (report.itemCore && !report.itemCore.ok) {
    for (const where of report.itemCore.inInitial) {
      console.error(
        `bundle-size: the engine's item core is in the initial JS (${where}). The shell may import only @number-island/engine/shell statically (02 §6a).`,
      );
    }
    for (const mark of report.itemCore.missing) {
      console.error(
        `bundle-size: item-core marker ${mark} is in no built file; the check can no longer see the item core (02 §6a).`,
      );
    }
    process.exit(1);
  }
  if (!report.ok) {
    console.error('bundle-size: budget exceeded (02 §6).');
    process.exit(1);
  }
}
