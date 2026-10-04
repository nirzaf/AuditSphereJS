import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { readConfiguration } from '../../../packages/server/src/platform/config.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/auditsphere';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
const metricsToken = 't041-api-metrics-scrape-token-0123456789';
process.env.OBSERVABILITY_METRICS_TOKEN = metricsToken;
const { AppModule, configureApiHttp, createFastifyAdapter } = await import('../src/main.js');

describe('NestJS/Fastify API shell', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), { logger: false });
    await configureApiHttp(app, readConfiguration());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app?.close());

  it('serves the versioned API and unprefixed liveness route with a validated correlation ID', async () => {
    const server = app.getHttpAdapter().getInstance();
    const version = await server.inject({ method: 'GET', url: '/api/v1/system/version', headers: { 'x-correlation-id': 'acceptance_123' } });
    expect(version.statusCode).toBe(200);
    expect(version.json()).toEqual({ service: 'auditsphere-api', version: '0.1.0' });
    expect(version.headers['x-correlation-id']).toBe('acceptance_123');

    const live = await server.inject({ method: 'GET', url: '/health/live', headers: { 'x-correlation-id': 'bad/value' } });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok', service: 'auditsphere-api' });
    expect(live.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('publishes bounded Prometheus metrics only to an authorized scrape request', async () => {
    const server = app.getHttpAdapter().getInstance();
    const denied = await server.inject({ method: 'GET', url: '/health/metrics' });
    expect(denied.statusCode).toBe(401);
    const allowed = await server.inject({ method: 'GET', url: '/health/metrics', headers: { authorization: `Bearer ${metricsToken}` } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['content-type']).toContain('text/plain');
    expect(allowed.headers['cache-control']).toBe('no-store');
    expect(allowed.body).toContain('auditsphere_http_requests_total');
    expect(allowed.body).toContain('auditsphere_database_pool_connections');
    expect(allowed.body).not.toContain(metricsToken);
  });

  it('rejects malformed and oversized JSON before a business route executes', async () => {
    const server = app.getHttpAdapter().getInstance();
    const url = '/api/v1/engagements/00000000-0000-4000-8000-000000000002/imports';
    const malformed = await server.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: '{"filename":' });
    expect(malformed.statusCode).toBe(400);

    const oversized = await server.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: `{"csv":"${'x'.repeat(16 * 1024 * 1024)}"}` });
    expect(oversized.statusCode).toBe(413);
  });
});
