#!/usr/bin/env node
// Import-boundary lint (02 §2, §7), run by `pnpm lint` after Biome.
//
// Direction: shared ← content ← engine ← ui ← web;  shared, engine ← api;  shared, content, engine ← tools/*.
// shared, content and engine are pure: no React, Dexie or browser globals. shared and engine also avoid
// Node built-ins (they run in browsers and Workers). engine and content never call Math.random, and
// engine never calls Date.now (randomness and time come in as parameters).
//
// Biome's noRestrictedImports/noRestrictedGlobals give in-editor feedback for the same rules; this
// script is the authoritative check because it also understands the package graph and relative paths.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCOPE = '@number-island/';

/** @typedef {{ dir: string; allowed: string[]; pure?: boolean; noNode?: boolean; noRandom?: boolean; noClock?: boolean }} PackageRule */

/** @type {Record<string, PackageRule>} */
export const RULES = {
  shared: { dir: 'packages/shared', allowed: [], pure: true, noNode: true },
  content: { dir: 'packages/content', allowed: ['shared'], pure: true, noRandom: true },
  engine: {
    dir: 'packages/engine',
    allowed: ['shared', 'content'],
    pure: true,
    noNode: true,
    noRandom: true,
    noClock: true,
  },
  ui: { dir: 'packages/ui', allowed: ['shared', 'content', 'engine'] },
  web: { dir: 'apps/web', allowed: ['shared', 'content', 'engine', 'ui'] },
  api: { dir: 'apps/api', allowed: ['shared', 'engine'] },
  narration: { dir: 'tools/narration', allowed: ['shared', 'content', 'engine'] },
  'content-check': { dir: 'tools/content-check', allowed: ['shared', 'content', 'engine'] },
  e2e: { dir: 'e2e', allowed: ['shared'] },
};

const PURE_FORBIDDEN_MODULES = [
  /^react(\/.*)?$/,
  /^react-dom(\/.*)?$/,
  /^dexie(\/.*)?$/,
  /^dexie-react-hooks$/,
];
const BROWSER_GLOBALS = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'location',
  'self',
  'HTMLElement',
  'requestAnimationFrame',
]);
const NODE_BUILTINS = new Set([
  'fs',
  'path',
  'os',
  'crypto',
  'child_process',
  'http',
  'https',
  'net',
  'url',
  'util',
  'stream',
  'buffer',
  'process',
  'worker_threads',
]);

/** Map a module specifier (bare or resolved path) to a workspace package key, if it is one. */
function workspacePackageOf(specifier, fromFile, root) {
  if (specifier.startsWith(SCOPE)) {
    const name = specifier.slice(SCOPE.length).split('/')[0] ?? '';
    return name in RULES ? name : null;
  }
  if (specifier.startsWith('.') && fromFile) {
    const target = resolve(dirname(fromFile), specifier);
    return packageOfPath(target, root);
  }
  return null;
}

/** Which package directory contains this absolute path. */
export function packageOfPath(absPath, root) {
  const rel = relative(root, absPath).split(sep).join('/');
  for (const [key, rule] of Object.entries(RULES)) {
    if (rel === rule.dir || rel.startsWith(`${rule.dir}/`)) return key;
  }
  return null;
}

/**
 * Check one source file. Returns human-readable violations.
 * @param {string} pkg package key in RULES
 * @param {string} fileName absolute path (used for relative-import resolution and messages)
 * @param {string} source file contents
 * @param {string} root repo root
 */
export function checkSource(pkg, fileName, source, root, opts = {}) {
  const baseRule = RULES[pkg];
  if (!baseRule) throw new Error(`unknown package ${pkg}`);
  // The import direction applies to every file in a package (src, scripts, configs). The purity
  // rules (React/Dexie/browser globals, Node built-ins, Math.random, Date.now) apply to runtime
  // code under src/ only: build scripts such as packages/engine/scripts/* legitimately run in Node.
  const runtime = opts.runtime ?? true;
  const rule = runtime
    ? baseRule
    : { dir: baseRule.dir, allowed: baseRule.allowed, pure: false, noNode: false };
  /** @type {string[]} */
  const violations = [];
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const declared = declaredNames(sf);
  const where = (node) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return `${relative(root, fileName)}:${line + 1}:${character + 1}`;
  };

  const checkSpecifier = (specifier, node) => {
    const target = workspacePackageOf(specifier, fileName, root);
    if (target && target !== pkg && !rule.allowed.includes(target)) {
      violations.push(
        `${where(node)} ${pkg} must not import ${target} ("${specifier}"); allowed: ${rule.allowed.join(', ') || 'nothing'} (02 §2)`,
      );
    }
    if (rule.pure && PURE_FORBIDDEN_MODULES.some((re) => re.test(specifier))) {
      violations.push(`${where(node)} ${pkg} is pure and must not import "${specifier}" (02 §2)`);
    }
    if (rule.noNode) {
      const bare = specifier.replace(/^node:/, '').split('/')[0] ?? '';
      if (specifier.startsWith('node:') || NODE_BUILTINS.has(bare)) {
        violations.push(
          `${where(node)} ${pkg} runs in browsers and Workers; it must not import "${specifier}"`,
        );
      }
    }
  };

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      checkSpecifier(node.moduleSpecifier.text, node);
    } else if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference;
      if (ts.isExternalModuleReference(ref) && ts.isStringLiteral(ref.expression)) {
        checkSpecifier(ref.expression.text, node);
      }
    } else if (ts.isCallExpression(node)) {
      const [arg] = node.arguments;
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isImport || isRequire) && arg && ts.isStringLiteralLike(arg))
        checkSpecifier(arg.text, node);
    } else if (ts.isImportTypeNode(node)) {
      const lit = node.argument;
      if (ts.isLiteralTypeNode(lit) && ts.isStringLiteral(lit.literal))
        checkSpecifier(lit.literal.text, node);
    }

    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const obj = node.expression.text;
      const prop = node.name.text;
      if (rule.noRandom && obj === 'Math' && prop === 'random') {
        violations.push(
          `${where(node)} ${pkg} must not call Math.random; use the seeded RNG (02 §7)`,
        );
      }
      if (rule.noClock && obj === 'Date' && prop === 'now') {
        violations.push(
          `${where(node)} ${pkg} must not call Date.now; pass time in as a parameter (02 §7)`,
        );
      }
      if (rule.pure && obj === 'globalThis' && BROWSER_GLOBALS.has(prop)) {
        violations.push(
          `${where(node)} ${pkg} is pure and must not use globalThis.${prop} (02 §2)`,
        );
      }
    }

    if (
      rule.pure &&
      ts.isIdentifier(node) &&
      BROWSER_GLOBALS.has(node.text) &&
      !declared.has(node.text) &&
      isGlobalReference(node)
    ) {
      violations.push(
        `${where(node)} ${pkg} is pure and must not use the browser global ${node.text} (02 §2)`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return violations;
}

/**
 * Every name the file binds itself (variables, parameters, functions, classes, imports, catch
 * bindings, type names). A browser-global name that the file declares anywhere refers to that
 * binding, not the global, so it is not flagged. This ignores shadowing scopes on purpose: it can
 * only under-report (a file that both declares `location` and uses the global elsewhere), never
 * reject ordinary local code; Biome's noRestrictedGlobals remains a second layer.
 */
function declaredNames(sf) {
  const names = new Set();
  const addBinding = (name) => {
    if (!name) return;
    if (ts.isIdentifier(name)) names.add(name.text);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) if (ts.isBindingElement(el)) addBinding(el.name);
    }
  };
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isImportClause(node) ||
      ts.isImportSpecifier(node) ||
      ts.isNamespaceImport(node) ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isTypeParameterDeclaration(node)
    ) {
      addBinding(node.name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** True when an identifier is a value/type reference, not a property name or a local declaration. */
function isGlobalReference(id) {
  const parent = id.parent;
  if (!parent) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
  if (ts.isQualifiedName(parent) && parent.right === id) return false;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isEnumMember(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === id
  )
    return false;
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isBindingElement(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isExportSpecifier(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent)) &&
    parent.name === id
  )
    return false;
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  return true;
}

const SOURCE_EXT = /\.(c|m)?(t|j)sx?$/;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.wrangler',
  'storybook-static',
  'test-results',
]);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (SOURCE_EXT.test(name) && !name.endsWith('.d.ts')) yield full;
  }
}

/** Declared workspace dependencies must also respect the direction. */
function checkManifest(pkg, root) {
  const rule = RULES[pkg];
  const manifestPath = join(root, rule.dir, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return [];
  }
  const deps = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  };
  return Object.keys(deps)
    .filter((name) => name.startsWith(SCOPE))
    .map((name) => name.slice(SCOPE.length))
    .filter((dep) => dep !== pkg && dep in RULES && !rule.allowed.includes(dep))
    .map(
      (dep) =>
        `${rule.dir}/package.json depends on ${SCOPE}${dep}, which ${pkg} must not use (02 §2)`,
    );
}

/** Every source file in a package directory, with whether it is runtime code (under src/). */
export function* packageFiles(root, pkg) {
  const rule = RULES[pkg];
  if (!rule) throw new Error(`unknown package ${pkg}`);
  const pkgDir = join(root, rule.dir);
  const srcDir = join(pkgDir, 'src');
  for (const file of walk(pkgDir)) {
    yield { file, runtime: file === srcDir || file.startsWith(`${srcDir}${sep}`) };
  }
}

/** Scan every file of every package: the direction everywhere, purity in src/. */
export function checkRepo(root) {
  /** @type {string[]} */
  const violations = [];
  for (const pkg of Object.keys(RULES)) {
    violations.push(...checkManifest(pkg, root));
    for (const { file, runtime } of packageFiles(root, pkg)) {
      violations.push(...checkSource(pkg, file, readFileSync(file, 'utf8'), root, { runtime }));
    }
  }
  return violations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const violations = checkRepo(root);
  if (violations.length > 0) {
    console.error(`Import-boundary violations (${violations.length}):`);
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }
  console.log('check-boundaries: all package imports follow 02 §2.');
}
