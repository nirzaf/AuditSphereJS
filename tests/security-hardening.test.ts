import { describe, expect, it } from 'vitest';
import { paginationQuerySchema, trialBalanceRowsQuerySchema } from '@auditsphere/contracts';
import { ApiProblemExceptionFilter } from '../apps/api/src/problem-filter.js';
import { BODY_LIMIT_BYTES, MAX_REQUEST_URL_LENGTH, rateLimitPolicyFor, requestEnvelopeViolation, requestRateLimitPolicies } from '../apps/api/src/security-controls.js';

describe('HTTP security envelope', () => {
  it('rejects non-JSON request bodies, methods carrying a body, and oversized query strings', () => {
    expect(BODY_LIMIT_BYTES).toBe(16 * 1024 * 1024);
    expect(MAX_REQUEST_URL_LENGTH).toBe(8 * 1024);
    expect(requestEnvelopeViolation('POST', '/api/v1/probe', { 'content-length': '3', 'content-type': 'text/plain' }))
      .toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(requestEnvelopeViolation('GET', '/api/v1/probe', { 'content-length': '2', 'content-type': 'application/json' }))
      .toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(requestEnvelopeViolation('POST', '/api/v1/probe', { 'transfer-encoding': 'chunked', 'content-type': 'application/json; charset=utf-8' }))
      .toBeNull();
    expect(requestEnvelopeViolation('GET', `/api/v1/probe?filter=${'x'.repeat(8192)}`, {}))
      .toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(requestEnvelopeViolation('POST', '/api/v1/probe/logout', {})).toBeNull();
  });

  it('allows multipart bodies only for a bounded document upload content route', () => {
    const headers = { 'content-length': '400', 'content-type': 'multipart/form-data; boundary=----audit-sphere-boundary' };
    expect(requestEnvelopeViolation('PUT', '/api/v1/documents/uploads/9b139a57-847f-4963-9fd2-13b879a1760f/content', headers)).toBeNull();
    expect(requestEnvelopeViolation('POST', '/api/v1/documents/uploads', headers)).toMatchObject({ status: 415 });
    expect(requestEnvelopeViolation('PUT', '/api/v1/documents/uploads/not-a-uuid/content', headers)).toMatchObject({ status: 415 });
    expect(requestEnvelopeViolation('PUT', '/api/v1/documents/uploads/9b139a57-847f-4963-9fd2-13b879a1760f/content', { ...headers, 'content-type': 'multipart/form-data' })).toMatchObject({ status: 415 });
  });

  it('assigns independent, progressively bounded budgets to credentials, uploads, expensive reads and normal traffic', () => {
    expect(rateLimitPolicyFor('POST', '/api/v1/portal/auth/login').key).toBe('credentials');
    expect(rateLimitPolicyFor('POST', '/api/v1/portal/auth/invitations/redeem').key).toBe('credentials');
    expect(rateLimitPolicyFor('POST', '/api/v1/engagements/:engagementId/imports').key).toBe('uploads');
    expect(rateLimitPolicyFor('GET', '/api/v1/engagements/:engagementId/imports/:id/rows').key).toBe('expensive-reads');
    expect(rateLimitPolicyFor('GET', '/api/v1/engagements/:engagementId/lifecycle').key).toBe('general');
    expect(requestRateLimitPolicies.credentials.max).toBeLessThan(requestRateLimitPolicies.uploads.max);
    expect(requestRateLimitPolicies.uploads.max).toBeLessThan(requestRateLimitPolicies.expensiveReads.max);
    expect(requestRateLimitPolicies.expensiveReads.max).toBeLessThan(requestRateLimitPolicies.general.max);
  });

  it('keeps list filters and pagination bounded at the shared transport contract', () => {
    expect(paginationQuerySchema.safeParse({ offset: 1_000_001, limit: 200 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ offset: 0, limit: 201 }).success).toBe(false);
    expect(trialBalanceRowsQuerySchema.safeParse({ offset: 0, limit: 200, search: 'x'.repeat(101) }).success).toBe(false);
  });

  it('does not expose arbitrary internal error text in problem responses or error logs', () => {
    const secret = 'database-password=fixture-secret';
    const captured: { status: number; body: unknown; logs: string[] } = { status: 0, body: undefined, logs: [] };
    const request = { id: 'security-test-correlation', log: { error: (value: unknown) => captured.logs.push(JSON.stringify(value)) } };
    const response = {
      status(status: number) {
        captured.status = status;
        return { send(body: unknown) { captured.body = body; } };
      },
    };
    const host = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as never;

    new ApiProblemExceptionFilter().catch(new Error(secret), host);

    expect(captured.status).toBe(500);
    expect(JSON.stringify(captured.body)).not.toContain(secret);
    expect(captured.logs.join('\n')).not.toContain(secret);
    expect(JSON.stringify(captured.body)).toContain('security-test-correlation');
  });
});
