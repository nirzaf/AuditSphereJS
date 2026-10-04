import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { apiProblemSchema } from '@auditsphere/contracts';
import { ApiProblemExceptionFilter } from './problem-filter.js';
import { BODY_LIMIT_BYTES, RATE_LIMIT_WINDOW_MS, rateLimitPolicyFor, requestEnvelopeViolation, requestRateLimitPolicies } from './security-controls.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { performance } from 'node:perf_hooks';
import { operationalMetrics } from '@auditsphere/server';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers[\'x-api-key\']',
  '**.authorization',
  '**.cookie',
  '**.password',
  '**.secret',
  '**.token',
  '**.access_token',
  '**.refresh_token',
  '**.accessToken',
  '**.refreshToken',
  '**.client_secret',
  '**.clientSecret',
  '**.secret_key',
  '**.privateKey',
  '**.evidence',
  '**.evidenceBody',
  '**.evidenceBytes',
  '**.document',
  '**.documentBody',
  '**.documentBytes',
  '**.payload',
  'req.url',
  'req.body',
  'res.headers[\'set-cookie\']',
];

export function createRequestId(request: Pick<IncomingMessage, 'headers'>): string {
  const incoming = request.headers[CORRELATION_ID_HEADER];
  return typeof incoming === 'string' && SAFE_CORRELATION_ID.test(incoming) ? incoming : randomUUID();
}

export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: false,
    requestIdHeader: false,
    genReqId: createRequestId,
    logger: { redact: { paths: REDACTED_LOG_PATHS, censor: '[REDACTED]' } },
  });
}

export async function configureHttpSecurity(app: NestFastifyApplication, config: { NODE_ENV: string; WEB_ORIGIN: string }): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: config.NODE_ENV === 'production' });
  await app.register(multipart, { limits: { fileSize: 15_000_000, files: 1, fields: 0, parts: 1 } });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/{*splat}'] });
  app.useGlobalFilters(new ApiProblemExceptionFilter());
  app.enableShutdownHooks();
  const fastify = app.getHttpAdapter().getInstance();
  const requestStartedAt = new WeakMap<object, number>();
  fastify.addHook('onRequest', async request => { requestStartedAt.set(request, performance.now()); });
  fastify.addHook('onResponse', async (request, reply) => {
    operationalMetrics.recordHttp(
      request.method,
      request.routeOptions.url,
      reply.statusCode,
      performance.now() - (requestStartedAt.get(request) ?? performance.now()),
    );
  });
  await app.register(rateLimit, {
    global: false,
    max: requestRateLimitPolicies.general.max,
    timeWindow: RATE_LIMIT_WINDOW_MS,
    skipOnError: false,
  });
  const limiters = new Map(Object.values(requestRateLimitPolicies).map(policy => [
    policy.key,
    fastify.createRateLimit({ max: policy.max, timeWindow: RATE_LIMIT_WINDOW_MS }),
  ]));
  fastify.addHook('onRequest', async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
    const violation = requestEnvelopeViolation(request.method, request.raw.url ?? '', request.headers);
    if (violation) {
      return reply.code(violation.status).send(apiProblemSchema.parse({ error: {
        code: violation.code, status: violation.status, message: violation.message, correlationId: request.id,
      } }));
    }
    const policy = rateLimitPolicyFor(request.method, request.routeOptions.url ?? request.raw.url ?? '');
    const limiter = limiters.get(policy.key);
    if (!limiter) throw new Error('HTTP rate-limit policy is not configured');
    const result = await limiter(request);
    if (!result.isAllowed && result.isExceeded) {
      reply.header('retry-after', String(result.ttlInSeconds));
      reply.header('x-ratelimit-limit', String(policy.max));
      reply.header('x-ratelimit-remaining', '0');
      return reply.code(429).send(apiProblemSchema.parse({ error: {
        code: 'TOO_MANY_REQUESTS', status: 429, message: 'Request rate limit exceeded.', correlationId: request.id,
      } }));
    }
    reply.header('x-ratelimit-limit', String(policy.max));
    reply.header('x-ratelimit-remaining', String(result.isAllowed ? policy.max : result.remaining));
    reply.header('x-ratelimit-reset', String(result.isAllowed ? 0 : result.ttlInSeconds));
  });
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
}
