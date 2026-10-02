import 'reflect-metadata';
import 'dotenv/config';
import { Controller, Get, Module, Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { PracticeLedgerController, AuditController, FieldworkController, GovernanceController, PublicationController, TaxonomyController, MaterialityController, RiskController, ReviewNoteController, AdjustmentController, InternalGuard, InternalIdentityGuard, InternalIdentityController, RuntimeModule, Readiness, readConfiguration } from '@auditsphere/server';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const BODY_LIMIT_BYTES = 16 * 1024 * 1024;
const CORRELATION_ID_HEADER = 'x-correlation-id';
const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers[\'x-api-key\']',
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

@Controller('health') class HealthController { constructor(private readonly readiness: Readiness) {} @Get(['', 'live']) health() { return { status: 'ok', service: 'auditsphere-api' }; } @Get('ready') ready() { return this.readiness.check(); } }
@Controller('system') class SystemController { @Get('version') version() { return { service: 'auditsphere-api', version: '0.1.0' }; } }
@Controller('identity') class IdentityController {
  @Get('config') config() {
    if (process.env.AUTH_PROVIDER !== 'entra' && process.env.NODE_ENV !== 'production') return { provider: 'development' };
    return { provider: 'entra', tenantId: process.env.M365_TENANT_ID, clientId: process.env.ENTRA_BROWSER_CLIENT_ID, scopes: [process.env.ENTRA_BROWSER_API_SCOPE], redirectUri: process.env.ENTRA_BROWSER_REDIRECT_URI };
  }
}
@Catch() class Errors implements ExceptionFilter { catch(error: unknown, host: ArgumentsHost) { const status = error instanceof HttpException ? error.getStatus() : 500; const req = host.switchToHttp().getRequest(); host.switchToHttp().getResponse().status(status).send({ error: { code: status, message: status === 500 ? 'Internal server error' : (error as HttpException).getResponse(), correlationId: req.id } }); if (status === 500) req.log.error({ err: error }, 'Unhandled API exception'); } }
@Module({ imports: [RuntimeModule], controllers: [HealthController, SystemController, IdentityController, InternalIdentityController, FieldworkController, PublicationController, TaxonomyController, MaterialityController, RiskController, ReviewNoteController, AdjustmentController, GovernanceController, AuditController, PracticeLedgerController], providers: [InternalGuard, InternalIdentityGuard] })
export class AppModule {}

export async function configureApiHttp(app: NestFastifyApplication, config = readConfiguration()): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: config.NODE_ENV === 'production' });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/{*splat}'] });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().addHook('onRequest', async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
  });
  app.enableCors({ origin: config.WEB_ORIGIN });
  if (config.NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('AuditSphere').setVersion('0.1').addBearerAuth().build()));
}

async function main() {
  const config = readConfiguration();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter());
  await configureApiHttp(app, config);
  await app.get(Readiness).check();
  await app.listen(config.PORT, config.HOST);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
