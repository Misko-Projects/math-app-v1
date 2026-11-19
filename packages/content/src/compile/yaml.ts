import { isAlias, isMap, isNode, isPair, isScalar, LineCounter, parseDocument, visit } from 'yaml';
import type { z } from 'zod';
import { type Diagnostics, formatPath } from '../diagnostics';

// V01: every YAML file parses and matches its strict schema (03 §4.1 rules: no anchors, aliases or
// merge keys; keys starting with `_` are authoring metadata and are stripped; `_meta.status: draft`
// outside drafts/ is an error so unreviewed text never ships, 03 §10.3).

function lineOf(lc: LineCounter, offset: number | undefined): string {
  if (offset === undefined) return '';
  const { line, col } = lc.linePos(offset);
  return ` (line ${line}, col ${col})`;
}

/**
 * Successful parses by text. A text that parses cleanly reports no findings and gives the same
 * data whatever file it is in, so a recompile (the compiler tests and content-check compile the
 * catalog dozens of times, each a variant with one file edited) re-parses only the edited files.
 * Callers get a copy, so nothing can change a cached value. Bounded: the oldest entry is dropped.
 */
const PARSED = new Map<string, unknown>();
const PARSED_MAX = 512;

/** Parses YAML text into plain data, or reports V01 findings and returns undefined. */
export function parseYaml(file: string, text: string, diags: Diagnostics): unknown {
  if (PARSED.has(text)) return structuredClone(PARSED.get(text));
  const data = parseYamlUncached(file, text, diags);
  if (data !== undefined) {
    if (PARSED.size >= PARSED_MAX) PARSED.delete(PARSED.keys().next().value as string);
    PARSED.set(text, structuredClone(data));
  }
  return data;
}

function parseYamlUncached(file: string, text: string, diags: Diagnostics): unknown {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, uniqueKeys: true, merge: false });
  let ok = true;
  for (const e of doc.errors) {
    diags.error('V01', file, '', `YAML does not parse: ${e.message.split('\n')[0]}`);
    ok = false;
  }
  if (!ok) return undefined;
  visit(doc, {
    Node(_key, node) {
      if (isAlias(node)) {
        diags.error(
          'V01',
          file,
          '',
          `aliases (*${node.source}) are not allowed${lineOf(lc, node.range?.[0])}`,
        );
        ok = false;
      } else if (isNode(node) && node.anchor) {
        diags.error(
          'V01',
          file,
          '',
          `anchors (&${node.anchor}) are not allowed${lineOf(lc, node.range?.[0])}`,
        );
        ok = false;
      }
    },
    Pair(_key, pair) {
      if (isPair(pair) && isScalar(pair.key) && pair.key.value === '<<') {
        const range = isScalar(pair.key) ? pair.key.range : undefined;
        diags.error('V01', file, '', `merge keys (<<) are not allowed${lineOf(lc, range?.[0])}`);
        ok = false;
      }
    },
  });
  if (!ok) return undefined;
  if (doc.contents !== null && !isMap(doc.contents) && !isScalar(doc.contents)) {
    // Top-level sequences are allowed by YAML but no content file uses one.
  }
  return doc.toJS({ maxAliasCount: 0 });
}

/**
 * Removes keys starting with `_` (authoring metadata), reporting any `_meta.status: draft` as V01.
 * Returns a new value; the input is not modified.
 */
export function stripMeta(
  file: string,
  value: unknown,
  diags: Diagnostics,
  path: PropertyKey[] = [],
): unknown {
  if (Array.isArray(value)) return value.map((v, i) => stripMeta(file, v, diags, [...path, i]));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('_')) {
        if (
          k === '_meta' &&
          v !== null &&
          typeof v === 'object' &&
          (v as Record<string, unknown>).status === 'draft'
        ) {
          diags.error(
            'V01',
            file,
            formatPath([...path, k, 'status']),
            '`_meta.status: draft` is only allowed under drafts/ (03 §10.3); review and promote it first',
          );
        }
        continue;
      }
      out[k] = stripMeta(file, v, diags, [...path, k]);
    }
    return out;
  }
  return value;
}

/** Runs a Zod schema, reporting each issue as V01 with its path and expectation. */
export function parseWith<T extends z.ZodType>(
  file: string,
  schema: T,
  value: unknown,
  diags: Diagnostics,
  basePath: PropertyKey[] = [],
): z.infer<T> | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    diags.error('V01', file, formatPath([...basePath, ...issue.path]), describeIssue(issue));
  }
  return undefined;
}

function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `unknown key${issue.keys.length > 1 ? 's' : ''} ${issue.keys.map((k) => `'${k}'`).join(', ')} (keys must match the schema exactly; prefix authoring notes with _)`;
  }
  if (issue.code === 'invalid_union') {
    return 'does not match any allowed shape (see 03 §4 for this file type)';
  }
  return issue.message;
}

/**
 * Deep strictness for schemas we reuse from `packages/shared` (which strip unknown keys): reports
 * every key present in `input` but missing from the parsed `output` as an unknown key.
 */
export function reportStrippedKeys(
  file: string,
  input: unknown,
  output: unknown,
  diags: Diagnostics,
  path: PropertyKey[] = [],
): void {
  if (Array.isArray(input) && Array.isArray(output)) {
    input.forEach((v, i) => {
      reportStrippedKeys(file, v, output[i], diags, [...path, i]);
    });
    return;
  }
  if (
    input !== null &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    output !== null &&
    typeof output === 'object' &&
    !Array.isArray(output)
  ) {
    for (const [k, v] of Object.entries(input)) {
      if (!(k in output)) {
        diags.error('V01', file, formatPath([...path, k]), `unknown key '${k}'`);
        continue;
      }
      reportStrippedKeys(file, v, (output as Record<string, unknown>)[k], diags, [...path, k]);
    }
  }
}
