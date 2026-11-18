import type { ApiErrorBody, ApiErrorCode } from '@number-island/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// 08 §2: errors are `{ error: { code, message } }` with stable codes; never a stack trace.

const STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  validation_failed: 400,
  unsupported_media_type: 415,
  payload_too_large: 413,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  setup_closed: 409,
  invalid_credentials: 401,
  invalid_pin: 401,
  pair_code_invalid: 400,
  pair_code_expired: 410,
  device_revoked: 401,
  unknown_family: 403,
  internal: 500,
};

export function statusFor(code: ApiErrorCode): ContentfulStatusCode {
  return STATUS[code];
}

export function errorBody(code: ApiErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** Thrown by handlers and middleware; `app.onError` renders it. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;
  readonly headers: Record<string, string>;

  constructor(code: ApiErrorCode, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
    this.headers = headers;
  }
}

/**
 * A short, safe description of a Zod failure: paths and messages only, never input values.
 * At most three issues, so a 500-event push cannot produce a huge error body.
 */
export function describeZodError(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): string {
  const parts = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(body)';
    return `${path}: ${issue.message}`;
  });
  const more = error.issues.length > 3 ? ` (+${error.issues.length - 3} more)` : '';
  return parts.join('; ') + more;
}
