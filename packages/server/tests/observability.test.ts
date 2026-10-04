import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentCorrelationId, createCorrelationId, runWithCorrelationId, validCorrelationId } from '../src/platform/observability/correlation.js';
import { OperationalMetrics } from '../src/platform/observability/metrics.js';
import { metricsAuthorized } from '../src/platform/observability/metrics-http.js';
import { safeLogFields } from '../src/platform/observability/logging.js';
import { Readiness } from '../src/platform/runtime.js';
import { db } from '../src/platform/db.js';

describe('operational observability', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps correlation IDs validated and available through asynchronous work', async () => {
    expect(validCorrelationId('request_123')).toBe(true);
    expect(validCorrelationId('bad/request')).toBe(false);
    expect(createCorrelationId('bad/request')).toMatch(/^[0-9a-f-]{36}$/i);
    const observed = await runWithCorrelationId('request_123', async () => {
      await Promise.resolve();
      return currentCorrelationId();
    });
    expect(observed).toBe('request_123');
    expect(currentCorrelationId()).toBeUndefined();
  });

  it('bounds metric labels and records latency, queue, provider and pool health', () => {
    const metrics = new OperationalMetrics(false);
    try {
      const privateId = 'c2b2e369-87a4-4a9d-a9d9-09840e4838c7';
      metrics.recordHttp('get', `/api/v1/engagements/${privateId}/imports`, 200, 23);
      metrics.recordHttp('GET', '/api/v1/system/version?email=private@example.test', 200, 4);
      metrics.recordQueueOutcome('tb-import', 'failed');
      metrics.setQueueSnapshot('tb-import', { waiting: 1, active: 2, delayed: 0, failed: 3, oldestWaitingAgeSeconds: 12 });
      metrics.recordProvider('graph', 'download', false);
      const rendered = metrics.render({ total: 5, idle: 2, waiting: 1, max: 10 });
      expect(rendered).toContain('route="/api/v1/engagements/:id/imports"');
      expect(rendered).toContain('auditsphere_http_request_duration_seconds');
      expect(rendered).toContain('auditsphere_queue_oldest_waiting_age_seconds');
      expect(rendered).toContain('auditsphere_queue_jobs_total{queue="tb-import",outcome="failed"} 1');
      expect(rendered).toContain('auditsphere_provider_requests_total{provider="graph",operation="download",outcome="failure"} 1');
      expect(rendered).toContain('auditsphere_database_pool_connections{state="waiting"} 1');
      expect(rendered).not.toContain(privateId);
      expect(rendered).not.toContain('private@example.test');
    } finally {
      metrics.close();
    }
  });

  it('requires an exact bearer token and fails closed on missing or malformed authorization', () => {
    const token = 't041-observability-test-token-value-0123456789';
    expect(metricsAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(metricsAuthorized(`Bearer ${token}x`, token)).toBe(false);
    expect(metricsAuthorized(`bearer ${token}`, token)).toBe(false);
    expect(metricsAuthorized(undefined, token)).toBe(false);
    expect(metricsAuthorized(`Bearer ${token}`, undefined)).toBe(false);
  });

  it('redacts credentials and evidence recursively while retaining safe correlation and error codes', () => {
    const fields = safeLogFields({
      event: 'queue.job_failed',
      correlationId: 'request_123',
      errorCode: 'ECONNRESET',
      context: { accessToken: 'secret-token', password: 'secret-password', evidenceBody: 'client evidence bytes', retry: 2 },
    });
    expect(fields).toEqual({
      event: 'queue.job_failed', correlationId: 'request_123', errorCode: 'ECONNRESET',
      context: { accessToken: '[REDACTED]', password: '[REDACTED]', evidenceBody: '[REDACTED]', retry: 2 },
    });
    expect(JSON.stringify(fields)).not.toContain('secret-token');
    expect(JSON.stringify(fields)).not.toContain('client evidence bytes');
  });

  it('reports PostgreSQL outages as unready and optional Redis outages as degraded with recovery actions', async () => {
    const metrics = new OperationalMetrics(false);
    const queryRaw = vi.fn().mockRejectedValue(Object.assign(new Error('private connection detail'), { code: 'ECONNREFUSED' }));
    const database = { $queryRaw: queryRaw } as unknown as typeof db;
    const redis = { ping: vi.fn().mockResolvedValue(false), close: vi.fn() };
    const readiness = new Readiness(database, metrics as never, redis);
    const result = await readiness.check();
    expect(result.status).toBe('unready');
    expect(result.dependencies).toEqual({ postgres: 'down', redis: 'down' });
    expect(result.alerts.map(item => item.code)).toEqual(['POSTGRES_UNAVAILABLE', 'REDIS_UNAVAILABLE']);
    expect(result.alerts.every(item => item.action.length > 20)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private connection detail');

    queryRaw.mockResolvedValue(1);
    const degraded = await readiness.check();
    expect(degraded.status).toBe('degraded');
    expect(degraded.alerts.map(item => item.code)).toEqual(['REDIS_UNAVAILABLE']);
    expect(degraded.alerts[0]?.action).toContain('durable');
    readiness.onModuleDestroy();
    metrics.close();
  });
});
