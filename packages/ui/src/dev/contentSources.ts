// Dev-only (Storybook Content Browser, 03 §10.1 step 9). Bundles the YAML content sources as raw
// strings and compiles them in the browser with the same compiler as `pnpm content:build`, so the
// browser never depends on a built `packages/content/dist/` (CI's visual job builds Storybook
// without running content:build). Never import this from the package index or the web app.
import {
  type CompileResult,
  type ContentFiles,
  compileContent,
  type Diagnostic,
} from '@number-island/content';
import { initContent } from '@number-island/engine';

const PREFIX = '../../../content/';

// The same selection as `readContentFiles` in packages/content/src/fs.ts: every .yaml/.yml/.txt
// under the source directories, plus the root files. Vite needs literal globs.
const dirFiles = import.meta.glob<string>(
  '../../../content/{skills,templates,lessons,misconceptions,narration,game,standards}/**/*.{yaml,yml,txt}',
  { query: '?raw', import: 'default', eager: true },
);
const rootFiles = import.meta.glob<string>(
  '../../../content/{contexts,graph,outlines,retired}.yaml',
  { query: '?raw', import: 'default', eager: true },
);

/** The content sources keyed by posix path relative to `packages/content`, sorted. */
export function contentFiles(): ContentFiles {
  const all = { ...dirFiles, ...rootFiles };
  const out: Record<string, string> = {};
  for (const path of Object.keys(all).sort()) {
    if (!path.startsWith(PREFIX)) continue;
    out[path.slice(PREFIX.length)] = all[path] as string;
  }
  return out;
}

export interface BrowserContent {
  result: CompileResult;
  /** Compile time in ms (logged, never rendered: the visual snapshot must stay stable). */
  ms: number;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

let cached: BrowserContent | null = null;

/**
 * Compiles the bundled sources once and binds the engine to the result (`initContent`). Later
 * calls return the cached result. Compilation takes ~100 ms, so callers may run it synchronously.
 */
export function browserContent(): BrowserContent {
  if (cached) return cached;
  const start = performance.now();
  const result = compileContent(contentFiles());
  const ms = performance.now() - start;
  if (result.content) {
    const { templates, narration, misconceptions } = result.content;
    initContent({ templates, narration, misconceptions });
  }
  cached = {
    result,
    ms,
    errors: result.diagnostics.filter((d) => d.severity === 'error'),
    warnings: result.diagnostics.filter((d) => d.severity !== 'error'),
  };
  return cached;
}
