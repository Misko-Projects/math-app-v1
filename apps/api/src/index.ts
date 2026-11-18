import { type HealthResponse, healthResponseSchema } from '@number-island/shared';
import { Hono } from 'hono';
import type { AppBindings, Env } from './env';
import { API_VERSION, CONTENT_VERSION } from './version';

/** True when the key for the configured provider is present. Never exposes the value. */
function hasKeyFor(provider: string, env: Env): boolean {
  switch (provider) {
    case 'openai':
      return Boolean(env.OPENAI_API_KEY);
    case 'anthropic':
      return Boolean(env.ANTHROPIC_API_KEY);
    default:
      return false;
  }
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export const app = new Hono<AppBindings>().basePath('/api');

app.get('/health', (c) => {
  const body: HealthResponse = healthResponseSchema.parse({
    ok: true,
    version: API_VERSION,
    contentVersion: CONTENT_VERSION,
    ai: {
      feedback: hasKeyFor(c.env.AI_FEEDBACK_PROVIDER, c.env),
      vision: hasKeyFor(c.env.AI_VISION_PROVIDER, c.env),
      summary: hasKeyFor(c.env.AI_SUMMARY_PROVIDER, c.env),
    },
  });
  c.header('Cache-Control', 'no-store');
  return c.json(body);
});

app.notFound((c) => c.json(errorBody('not_found', 'Unknown API route.'), 404));

// Errors never leak stacks or internals (08 §2). Details go to the local console only.
app.onError((err, c) => {
  console.error('Unhandled API error:', err.name);
  return c.json(errorBody('internal', 'Something went wrong.'), 500);
});

export default app;
