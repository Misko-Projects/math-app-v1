import { type HealthResponse, healthResponseSchema } from '@number-island/shared';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createDb } from './db/client';
import type { AppBindings, Env } from './env';
import { ApiError, errorBody } from './lib/errors';
import { authRoutes } from './routes/auth';
import { backupRoutes } from './routes/backup';
import { childRoutes } from './routes/children';
import { deviceRoutes } from './routes/devices';
import { syncRoutes } from './routes/sync';
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

export const app = new Hono<AppBindings>().basePath('/api');

app.use(async (c, next) => {
  c.set('now', Date.now());
  c.set('db', createDb(c.env.DB));
  await next();
  // API responses carry family data or credentials: never cache them.
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

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
  return c.json(body);
});

app.route('/', authRoutes);
app.route('/', deviceRoutes);
app.route('/', syncRoutes);
app.route('/', backupRoutes);
app.route('/', childRoutes);

app.notFound((c) => c.json(errorBody('not_found', 'Unknown API route.'), 404));

// Errors never leak stacks or internals (08 §2). Details go to the local console only.
app.onError((err, c) => {
  if (err instanceof ApiError) {
    for (const [name, value] of Object.entries(err.headers)) c.header(name, value);
    return c.json(errorBody(err.code, err.message), err.status);
  }
  if (err instanceof HTTPException) {
    // Hono's own validation layer (for example a body that is not valid JSON).
    if (err.status === 413) {
      return c.json(errorBody('payload_too_large', 'The request body is too large.'), 413);
    }
    if (err.status < 500) {
      return c.json(errorBody('bad_request', 'The request could not be read.'), 400);
    }
  }
  console.error('Unhandled API error:', err.name);
  return c.json(errorBody('internal', 'Something went wrong.'), 500);
});

export default app;
