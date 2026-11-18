import { env, exports } from 'cloudflare:workers';
import { healthResponseSchema } from '@number-island/shared';
import { describe, expect, it } from 'vitest';

import { app } from '../src/index';

describe('GET /api/health', () => {
  it('reports ok with no AI keys configured (through the Worker entrypoint)', async () => {
    const res = await exports.default.fetch('http://island.test/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = healthResponseSchema.parse(await res.json());
    expect(body).toEqual({
      ok: true,
      version: '0.0.0',
      contentVersion: 'dev',
      ai: { feedback: false, vision: false, summary: false },
    });
  });

  it('reports which AI features have keys, never the key values', async () => {
    const res = await app.request(
      '/api/health',
      {},
      {
        ...env,
        OPENAI_API_KEY: 'sk-test-openai-not-real',
        ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
      },
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('not-real');
    expect(healthResponseSchema.parse(JSON.parse(text)).ai).toEqual({
      feedback: true,
      vision: true,
      summary: true,
    });
  });

  it('maps each feature to its configured provider key', async () => {
    const res = await app.request(
      '/api/health',
      {},
      {
        ...env,
        OPENAI_API_KEY: 'sk-test-openai-not-real',
      },
    );
    const body = healthResponseSchema.parse(await res.json());
    // Feedback and summary use OpenAI; vision uses Claude (07 §0), whose key is absent.
    expect(body.ai).toEqual({ feedback: true, vision: false, summary: true });
  });
});

describe('unknown routes', () => {
  it('returns the JSON error shape with 404 for unknown /api paths', async () => {
    const res = await exports.default.fetch('http://island.test/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: expect.any(String) },
    });
  });

  it('returns 404 for the wrong method on a known path', async () => {
    const res = await exports.default.fetch('http://island.test/api/health', { method: 'POST' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});
