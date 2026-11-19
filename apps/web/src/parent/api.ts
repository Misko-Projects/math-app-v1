// The parent-area API calls (08 §2), validated with the shared route schemas (02 §5.7). Same
// origin, so the parent session cookie (`ni_parent`, Path=/api) travels by itself; device routes
// send the device token as a Bearer token. Every mutating call sends JSON (08 §3: CSRF rule).

import {
  type ApiErrorCode,
  apiErrorBodySchema,
  apiRoutes,
  type HealthResponse,
  type PairCompleteRequest,
  type PairCompleteResponse,
  type PairStartResponse,
  type ParentSessionResponse,
  type SetupRequest,
  type SetupResponse,
} from '@number-island/shared';

export type ApiFailure = ApiErrorCode | 'network' | 'bad_response';

export class ApiError extends Error {
  constructor(
    readonly code: ApiFailure,
    readonly status: number,
    message: string,
    /** From `Retry-After` on a 429 (08 §3). */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** A route's call: method, path, optional JSON body and Bearer token; parses the response. */
async function call<T>(
  fetchImpl: FetchLike,
  route: { method: string; path: string; response: Schema<T> },
  opts: { body?: unknown; token?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (route.method !== 'GET') headers['content-type'] = 'application/json';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetchImpl(route.path, {
      method: route.method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      ...(route.method !== 'GET' ? { body: JSON.stringify(opts.body ?? {}) } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (e) {
    throw new ApiError('network', 0, `could not reach the island server: ${String(e)}`);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Handled below: a non-JSON body is a bad response (or an error with no body).
  }
  if (!res.ok) {
    const err = apiErrorBodySchema.safeParse(json);
    const retry = Number(res.headers.get('retry-after'));
    throw new ApiError(
      err.success ? err.data.error.code : 'bad_response',
      res.status,
      err.success ? err.data.error.message : `HTTP ${res.status}`,
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }
  const parsed = route.response.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('bad_response', res.status, `unexpected answer from ${route.path}`);
  }
  return parsed.data;
}

export interface ParentApi {
  health(signal?: AbortSignal): Promise<HealthResponse>;
  setup(body: SetupRequest): Promise<SetupResponse>;
  /** Device-authenticated PIN check → a 10-minute parent session cookie (08 §2). */
  pin(deviceToken: string, pin: string): Promise<ParentSessionResponse>;
  logout(): Promise<void>;
  pairStart(): Promise<PairStartResponse>;
  pairComplete(body: PairCompleteRequest): Promise<PairCompleteResponse>;
}

export function createParentApi(fetchImpl?: FetchLike): ParentApi {
  const f: FetchLike = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  return {
    health: (signal) => call(f, apiRoutes.health, signal ? { signal } : {}),
    setup: (body) => call(f, apiRoutes.setup, { body }),
    pin: (token, pin) => call(f, apiRoutes.pin, { token, body: { pin } }),
    logout: async () => {
      await call(f, apiRoutes.logout);
    },
    pairStart: () => call(f, apiRoutes.pairStart),
    pairComplete: (body) => call(f, apiRoutes.pairComplete, { body }),
  };
}

/** A parent-readable sentence for a failed call (inline copy: parent area, 02 §7). */
export function describeApiError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (e.code) {
    case 'network':
      return 'Can’t reach your Number Island server. Check that it is running and that this device is on the same Wi-Fi.';
    case 'rate_limited': {
      const mins = e.retryAfterSeconds ? Math.max(1, Math.ceil(e.retryAfterSeconds / 60)) : null;
      return mins
        ? `Too many tries. Please wait about ${mins} minute${mins === 1 ? '' : 's'} and try again.`
        : 'Too many tries. Please wait a few minutes and try again.';
    }
    case 'setup_closed':
      return 'This server already has a family. Join it with a code from a parent device instead.';
    case 'pair_code_invalid':
      return 'That code didn’t match. Check the 6 digits on the parent device and try again.';
    case 'pair_code_expired':
      return 'That code has expired. Make a new one on the parent device.';
    case 'invalid_pin':
      return 'That PIN isn’t right.';
    case 'unauthorized':
    case 'invalid_credentials':
      return 'The grown-up check has expired. Please unlock the parent area again.';
    case 'device_revoked':
      return 'This device was removed from the family. Pair it again with a code.';
    case 'validation_failed':
    case 'bad_request':
      return `The server didn’t accept that: ${e.message}`;
    default:
      return 'The island server had a problem. Please try again in a moment.';
  }
}
