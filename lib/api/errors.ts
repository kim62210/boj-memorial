import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'FORBIDDEN_NICKNAME'
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'UNAVAILABLE';

export interface ApiError {
  detail: string;
  code: ErrorCode;
  fields?: Record<string, string>;
}

export function errorResponse(
  error: ApiError,
  status: number,
  init: ResponseInit = {},
): NextResponse {
  return NextResponse.json(error, { ...init, status });
}

export function badRequest(
  detail: string,
  code: ErrorCode = 'BAD_REQUEST',
): NextResponse {
  return errorResponse({ detail, code }, 400);
}

export function validationError(zodErr: ZodError): NextResponse {
  const fields: Record<string, string> = {};
  for (const issue of zodErr.issues) {
    const path = issue.path.join('.') || '_';
    fields[path] = issue.message;
  }
  return errorResponse(
    { detail: 'Request validation failed', code: 'VALIDATION_FAILED', fields },
    400,
  );
}

export function rateLimited(seconds: number): NextResponse {
  return errorResponse(
    { detail: `Rate limit exceeded. Retry in ${seconds}s.`, code: 'RATE_LIMITED' },
    429,
    { headers: { 'Retry-After': String(seconds) } },
  );
}

export function internalError(): NextResponse {
  return errorResponse({ detail: 'Internal server error', code: 'INTERNAL' }, 500);
}

export function unavailable(detail = 'Service unavailable'): NextResponse {
  return errorResponse({ detail, code: 'UNAVAILABLE' }, 503);
}
