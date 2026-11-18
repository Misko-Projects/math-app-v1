import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isInside, resolveInside } from './serve-static.mjs';

function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'ni-static-')));
  const root = join(base, 'site');
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'assets', 'app.js'), 'x');
  // a sibling whose name starts with the root's name, and a secret outside the root
  mkdirSync(join(base, 'site-secrets'));
  writeFileSync(join(base, 'site-secrets', 'key.txt'), 'secret');
  writeFileSync(join(base, 'outside.txt'), 'secret');
  symlinkSync(join(base, 'outside.txt'), join(root, 'link.txt'));
  return { base, root };
}

describe('serve-static containment', () => {
  it('serves files and directory indexes inside the root', () => {
    const { root } = fixture();
    expect(resolveInside(root, '/assets/app.js')).toBe(join(root, 'assets', 'app.js'));
    expect(resolveInside(root, '/')).toBe(join(root, 'index.html'));
  });

  it('refuses traversal, prefix siblings and symlinks that leave the root', () => {
    const { root } = fixture();
    expect(resolveInside(root, '/../outside.txt')).toBeNull();
    expect(resolveInside(root, '/%2e%2e/outside.txt')).toBeNull();
    expect(resolveInside(root, '/../site-secrets/key.txt')).toBeNull();
    expect(resolveInside(root, '/link.txt')).toBeNull();
    expect(resolveInside(root, '/%E0%A4%A')).toBeNull();
    expect(resolveInside(root, '/missing.js')).toBeNull();
  });

  it('answers null (404) instead of throwing when the root does not exist', () => {
    const { base } = fixture();
    expect(resolveInside(join(base, 'not-built-yet'), '/index.html')).toBeNull();
  });

  it('compares paths by segment, not by string prefix', () => {
    expect(isInside('/a/site', '/a/site/x')).toBe(true);
    expect(isInside('/a/site', '/a/site-secrets/x')).toBe(false);
    expect(isInside('/a/site', '/a/site/..foo')).toBe(true);
  });
});
