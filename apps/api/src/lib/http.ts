import { zValidator } from '@hono/zod-validator';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { z } from 'zod';
import type { AppBindings } from '../env';
import { ApiError, describeZodError } from './errors';

// Request plumbing shared by every route: JSON-only mutations (08 §3 CSRF), body caps, validation
// with the shared Zod schemas (02 §5.7), and how the client's address and scheme are determined.

const LOOPBACK = /^(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

/** The direct peer is this machine: only then are proxy headers (the Vite dev proxy) trusted. */
function peerIsLoopback(c: Context): boolean {
  const peer = c.req.header('cf-connecting-ip');
  return peer === undefined || LOOPBACK.test(peer);
}

/**
 * The client's IP, for rate limiting. Cloudflare (and `wrangler dev`) set `CF-Connecting-IP`. In
 * local dev the peer is the Vite proxy on loopback, which appends the real client to
 * `X-Forwarded-For` (`xfwd`), so a loopback peer's last forwarded hop is used. A client can never
 * spoof it: off loopback the header is ignored, and the proxy appends the true peer last.
 */
export function clientIp(c: Context): string {
  const peer = c.req.header('cf-connecting-ip');
  if (peerIsLoopback(c)) {
    const forwarded = c.req.header('x-forwarded-for');
    const last = forwarded?.split(',').at(-1)?.trim();
    if (last) return last;
  }
  return peer ?? 'unknown';
}

/**
 * True when the browser reached us over HTTPS (08 §2: cookies are `Secure` iff so, which keeps
 * login working over `pnpm dev:lan` plain HTTP). Under `pnpm dev:https` the Vite proxy terminates
 * TLS and forwards `X-Forwarded-Proto: https` from loopback.
 */
export function requestIsHttps(c: Context): boolean {
  if (new URL(c.req.url).protocol === 'https:') return true;
  return peerIsLoopback(c) && c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https';
}

/** 08 §3 CSRF: every mutating request must declare `Content-Type: application/json`. */
export const requireJsonContentType: MiddlewareHandler<AppBindings> = async (c, next) => {
  const method = c.req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (type !== 'application/json') {
      throw new ApiError('unsupported_media_type', 'Send the request as application/json.');
    }
  }
  await next();
};

export const KB = 1024;
export const MB = 1024 * KB;

/** Rejects bodies over `maxSize` bytes with 413 `payload_too_large`. */
export function limitBody(maxSize: number): MiddlewareHandler<AppBindings> {
  return bodyLimit({
    maxSize,
    onError: () => {
      throw new ApiError('payload_too_large', `The request body is larger than ${maxSize} bytes.`);
    },
  });
}

/** Validates the JSON body with a shared schema; failures are 400 `validation_failed`. */
export function jsonBody<S extends z.ZodType>(schema: S) {
  return zValidator('json', schema, (result) => {
    if (!result.success) throw new ApiError('validation_failed', describeZodError(result.error));
  });
}

/** Validates path params with a shared schema; failures are 404 (an id that cannot exist). */
export function pathParams<S extends z.ZodType>(schema: S) {
  return zValidator('param', schema, (result) => {
    if (!result.success) throw new ApiError('not_found', 'No such resource.');
  });
}
