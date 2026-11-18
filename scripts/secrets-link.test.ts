import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkSecrets, parseEnv, secretsPath } from './secrets-link.mjs';

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'ni-secrets-'));
}

describe('secrets:link', () => {
  it('does not fail and writes nothing when the secrets file is missing', () => {
    const dir = scratch();
    const target = join(dir, '.dev.vars');
    const logs: string[] = [];
    const result = linkSecrets({
      env: { MATH_APP_SECRETS: join(dir, 'nope.env') },
      target,
      log: (m) => logs.push(m),
    });
    expect(result.status).toBe('missing');
    expect(() => statSync(target)).toThrow();
    expect(logs.join('\n')).toContain('skipping');
  });

  it('writes only Worker keys, mode 600, and never logs values', () => {
    const dir = scratch();
    const source = join(dir, 'secrets.env');
    writeFileSync(
      source,
      [
        '# comment',
        'export OPENAI_API_KEY="sk-open #not-a-comment"',
        "ANTHROPIC_API_KEY='sk-ant'",
        'GEMINI_API_KEY=gm-secret',
        'UNRELATED=1',
      ].join('\n'),
    );
    const target = join(dir, '.dev.vars');
    const logs: string[] = [];
    const result = linkSecrets({
      env: { MATH_APP_SECRETS: source },
      target,
      log: (m) => logs.push(m),
    });
    expect(result.status).toBe('written');
    expect(result.keys).toEqual(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']);
    const written = readFileSync(target, 'utf8');
    expect(written).toContain('OPENAI_API_KEY="sk-open #not-a-comment"');
    expect(written).toContain('ANTHROPIC_API_KEY="sk-ant"');
    expect(written).not.toContain('GEMINI');
    expect(written).not.toContain('UNRELATED');
    expect(statSync(target).mode & 0o777).toBe(0o600);
    const allLogs = logs.join('\n');
    expect(allLogs).not.toContain('sk-open');
    expect(allLogs).not.toContain('sk-ant');
  });

  it('honours MATH_APP_SECRETS and defaults to ~/.config/math-app-v1/secrets.env', () => {
    expect(secretsPath({ MATH_APP_SECRETS: '/x/y.env' })).toBe('/x/y.env');
    expect(secretsPath({})).toMatch(/\.config\/math-app-v1\/secrets\.env$/);
  });

  it('parses dotenv lines', () => {
    const env = parseEnv('A=1\n# c\nexport B = two # trailing\nC="q # kept"\nbad line\n');
    expect(Object.fromEntries(env)).toEqual({ A: '1', B: 'two', C: 'q # kept' });
  });

  it('ends a quoted value at its closing quote, ignoring a trailing comment', () => {
    const env = parseEnv(
      [
        'OPENAI_API_KEY="sk-abc" # personal key',
        "ANTHROPIC_API_KEY='sk-ant' #note",
        'BROKEN="unterminated',
      ].join('\n'),
    );
    expect(Object.fromEntries(env)).toEqual({
      OPENAI_API_KEY: 'sk-abc',
      ANTHROPIC_API_KEY: 'sk-ant',
    });
  });
});
