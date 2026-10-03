import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller, Get, HttpCode, Module, Post, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import { configureHttpSecurity, createFastifyAdapter } from '../src/http-security.js';
import { readConfiguration } from '../../../packages/server/src/platform/config.js';
import { BODY_LIMIT_BYTES } from '../src/security-controls.js';

class ProbeController {
  ip(request: FastifyRequest) { return { ip: request.ip }; }

  body(request: FastifyRequest) { return { accepted: request.body ?? null }; }

  secretError() { throw new Error('secret=private-test-value'); }
}

class CredentialLimitController {
  login() { return { accepted: true }; }
}

class ExpensiveRouteController {
  upload() { return { accepted: true }; }

  rows() { return { accepted: true }; }
}

class SecurityProbeModule {}
Controller('probe')(ProbeController);
Controller('portal/auth')(CredentialLimitController);
Controller('engagements/:engagementId')(ExpensiveRouteController);
const decorateMethod = (target: Function, method: string, ...decorators: MethodDecorator[]) => {
  const descriptor = Object.getOwnPropertyDescriptor(target.prototype, method)!;
  for (const decorator of decorators) decorator(target.prototype, method, descriptor);
};
decorateMethod(ProbeController, 'ip', Get('ip'));
Req()(ProbeController.prototype, 'ip', 0);
decorateMethod(ProbeController, 'body', Post('body'), HttpCode(200));
Req()(ProbeController.prototype, 'body', 0);
decorateMethod(ProbeController, 'secretError', Get('secret-error'));
decorateMethod(CredentialLimitController, 'login', Post('login'), HttpCode(200));
decorateMethod(ExpensiveRouteController, 'upload', Post('imports'), HttpCode(200));
decorateMethod(ExpensiveRouteController, 'rows', Get('imports/:importId/rows'));
Module({ controllers: [ProbeController, CredentialLimitController, ExpensiveRouteController] })(SecurityProbeModule);

test('API transport enforces exact CORS, JSON envelope limits, separate rate policies and untrusted proxy boundaries', { timeout: 30_000 }, async () => {
  const config = readConfiguration({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost/auditsphere_test',
    REDIS_URL: 'redis://localhost',
    WEB_ORIGIN: 'http://localhost:4200',
  });
  const app = await NestFactory.create<NestFastifyApplication>(SecurityProbeModule, createFastifyAdapter(), { logger: false });
  try {
    await configureHttpSecurity(app, config);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    const allowedPreflight = await fetch(`${base}/api/v1/probe/body`, { method: 'OPTIONS', headers: {
      origin: 'http://localhost:4200', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type',
    } });
    assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), 'http://localhost:4200');
    assert.equal(allowedPreflight.headers.get('access-control-allow-credentials'), 'true');
    const deniedPreflight = await fetch(`${base}/api/v1/probe/body`, { method: 'OPTIONS', headers: {
      origin: 'https://attacker.invalid', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type',
    } });
    assert.equal(deniedPreflight.headers.get('access-control-allow-origin'), 'http://localhost:4200');
    assert.notEqual(deniedPreflight.headers.get('access-control-allow-origin'), 'https://attacker.invalid', 'a hostile origin is never reflected in credentialed CORS headers');

    const badMediaType = await fetch(`${base}/api/v1/probe/body`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'raw input' });
    assert.equal(badMediaType.status, 415);
    assert.deepEqual((await badMediaType.json() as { error: { code: string } }).error.code, 'UNSUPPORTED_MEDIA_TYPE');
    const acceptedJson = await fetch(`${base}/api/v1/probe/body`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ accepted: true }) });
    assert.equal(acceptedJson.status, 200);

    const longQuery = await fetch(`${base}/api/v1/probe/ip?filter=${'x'.repeat(8 * 1024)}`);
    assert.equal(longQuery.status, 400);
    assert.equal((await longQuery.json() as { error: { code: string } }).error.code, 'BAD_REQUEST');

    const fastify = app.getHttpAdapter().getInstance();
    const oversized = await fastify.inject({ method: 'POST', url: '/api/v1/probe/body', headers: { 'content-type': 'application/json' }, payload: 'x'.repeat(BODY_LIMIT_BYTES + 1) });
    assert.equal(oversized.statusCode, 413, 'Fastify rejects request bodies above its explicit 16 MiB transport limit');

    const proxyProbe = await fetch(`${base}/api/v1/probe/ip`, { headers: { 'x-forwarded-for': '203.0.113.200' } });
    assert.notEqual((await proxyProbe.json() as { ip: string }).ip, '203.0.113.200', 'the API trusts zero proxy hops by default');

    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch(`${base}/api/v1/portal/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${attempt + 1}` }, body: '{}',
      });
      assert.equal(response.status, 200, `credential request ${attempt + 1} remains within the per-IP allowance`);
    }
    const credentialThrottle = await fetch(`${base}/api/v1/portal/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.201' }, body: '{}',
    });
    assert.equal(credentialThrottle.status, 429, 'changing forged forwarded IP values cannot bypass the credential bucket');
    const throttleProblem = await credentialThrottle.json() as { error: { code: string; status: number; message: string; correlationId?: string } };
    assert.deepEqual(throttleProblem.error, {
      code: 'TOO_MANY_REQUESTS', status: 429, message: 'Request rate limit exceeded.', correlationId: throttleProblem.error['correlationId'],
    });
    assert.ok(throttleProblem.error.correlationId);

    const upload = await fetch(`${base}/api/v1/engagements/${'00000000-0000-4000-8000-000000000001'}/imports`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(upload.status, 200, 'upload work uses its independent allowance');
    const expensiveRead = await fetch(`${base}/api/v1/engagements/${'00000000-0000-4000-8000-000000000001'}/imports/${'00000000-0000-4000-8000-000000000002'}/rows`);
    assert.equal(expensiveRead.status, 200, 'large-row reads use their own bounded allowance');

    const internalError = await fetch(`${base}/api/v1/probe/secret-error`, { headers: { authorization: 'Bearer test-secret' } });
    assert.equal(internalError.status, 500);
    const errorText = await internalError.text();
    assert.equal(errorText.includes('secret=private-test-value'), false);
    assert.equal(errorText.includes('test-secret'), false);
    assert.ok(internalError.headers.get('x-correlation-id'));
  } finally {
    await app.close();
  }
});
