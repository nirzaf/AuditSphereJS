import type { ApiProblemCode } from '@auditsphere/contracts';

export const BODY_LIMIT_BYTES = 16 * 1024 * 1024;
export const MAX_REQUEST_URL_LENGTH = 8 * 1024;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export const requestRateLimitPolicies = {
  credentials: { key: 'credentials', max: 8 },
  uploads: { key: 'uploads', max: 20 },
  expensiveReads: { key: 'expensive-reads', max: 60 },
  general: { key: 'general', max: 180 },
} as const;

export type RequestRateLimitPolicy = (typeof requestRateLimitPolicies)[keyof typeof requestRateLimitPolicies];
export type RequestEnvelopeViolation = { status: 400 | 415; code: Extract<ApiProblemCode, 'BAD_REQUEST' | 'UNSUPPORTED_MEDIA_TYPE'>; message: string };

type RequestHeaders = {
  'content-length'?: string | string[];
  'content-type'?: string | string[];
  'transfer-encoding'?: string | string[];
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hasRequestBody(headers: RequestHeaders): boolean {
  const length = headerValue(headers['content-length']);
  return (length !== undefined && Number(length) !== 0) || headerValue(headers['transfer-encoding']) !== undefined;
}

function isSupportedJsonContentType(value: string | undefined): boolean {
  if (!value) return false;
  const [mediaType, ...parameters] = value.split(';');
  if (mediaType.trim().toLowerCase() !== 'application/json') return false;
  return parameters.every(parameter => /^\s*charset\s*=\s*(?:"utf-8"|utf-8)\s*$/i.test(parameter));
}

function isAuthorizedMultipartRoute(method: string, url: string, value: string | undefined): boolean {
  return method.toUpperCase() === 'PUT'
    && /^\/api\/v1\/documents\/uploads\/[0-9a-f-]{36}\/content(?:\?.*)?$/i.test(url)
    && /^multipart\/form-data\s*;\s*boundary=(?:"[^"]{1,200}"|[^;\s]{1,200})(?:\s*;.*)?$/i.test(value ?? '');
}

/** Restrict raw query/filter input before Fastify parses it; endpoint schemas apply tighter field bounds. */
export function requestEnvelopeViolation(method: string, url: string, headers: RequestHeaders): RequestEnvelopeViolation | null {
  if (url.length > MAX_REQUEST_URL_LENGTH) {
    return { status: 400, code: 'BAD_REQUEST', message: 'Request URL exceeds the allowed length.' };
  }
  if (!hasRequestBody(headers)) return null;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    return { status: 400, code: 'BAD_REQUEST', message: 'Request bodies are not allowed for this method.' };
  }
  const contentType = headerValue(headers['content-type']);
  if (!isSupportedJsonContentType(contentType) && !isAuthorizedMultipartRoute(method, url, contentType)) {
    return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Request bodies must use application/json.' };
  }
  return null;
}

/** Per-IP policies keep credential, upload and expensive-read budgets independent. */
export function rateLimitPolicyFor(method: string, routeUrl: string): RequestRateLimitPolicy {
  const verb = method.toUpperCase();
  const path = routeUrl.split('?', 1)[0].replace(/\/$/, '') || '/';
  if (verb === 'POST' && /\/portal\/auth\/(?:login|logout|first-password|invitations\/redeem|password-reset(?:\/complete)?)$/.test(path)) {
    return requestRateLimitPolicies.credentials;
  }
  if (['POST', 'PUT', 'PATCH'].includes(verb) && /\/(?:imports|uploads)(?:\/|$)|\/upload(?:-completion|s?)(?:\/|$)/.test(path)) {
    return requestRateLimitPolicies.uploads;
  }
  if (verb === 'GET' && /\/(?:rows|suggestions|summary|adjusted-balances|audit-chain|audit-events)$/.test(path)) {
    return requestRateLimitPolicies.expensiveReads;
  }
  return requestRateLimitPolicies.general;
}
