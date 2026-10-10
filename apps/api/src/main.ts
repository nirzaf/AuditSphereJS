import 'reflect-metadata';
import 'dotenv/config';
import { ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  Controller, Get, Inject, Module, Req, Res, ServiceUnavailableException,
  SerializeOptions, StandardSchemaSerializerInterceptor, UseInterceptors,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CommercialController, PracticeLedgerController, PracticeRatesController, PracticeFirmController, PracticeTimeEntryController, AuditController, FieldworkController, DocumentLinksController, DocumentDownloadsController, DocumentUploadsController, DocumentTemplatesController, GovernanceController, PublicationController, TaxonomyController, MaterialityController, RiskController, ReviewNoteController, AdjustmentController, NotificationController, InternalGuard, InternalIdentityGuard, InternalIdentityController, PortalAuthController, PortalProposalController, RealtimeModule, RuntimeModule, Readiness, installRealtimeRedisAdapter, readConfiguration, EditLeaseConnection, CorrelationContextInterceptor, OPERATIONAL_METRICS, databasePool } from '@auditsphere/server';
import type { OperationalMetrics } from '@auditsphere/server';
import { metricsAuthorized } from '@auditsphere/server';
import { apiProblemSchema, healthResponseSchema, identityConfigurationSchema, readinessResponseSchema, systemVersionSchema } from '@auditsphere/contracts';
import { configureHttpSecurity, createFastifyAdapter } from './http-security.js';
export { createFastifyAdapter, createRequestId } from './http-security.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

@ApiTags('Health') @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('health')
class HealthController {
  constructor(private readonly readiness: Readiness) {}

  @Get(['', 'live'])
  @ApiOkResponse({ standardSchema: healthResponseSchema })
  @SerializeOptions({ schema: healthResponseSchema })
  health() { return { status: 'ok', service: 'auditsphere-api' }; }

  @Get('ready')
  @ApiOkResponse({ standardSchema: readinessResponseSchema })
  @SerializeOptions({ schema: readinessResponseSchema })
  async ready() {
    const result = await this.readiness.check();
    if (result.status === 'unready') throw new ServiceUnavailableException({ code: 'DEPENDENCY_NOT_READY', message: 'A required service is unavailable.' });
    return result;
  }
}

@ApiExcludeController()
@Controller('health')
class MetricsController {
  constructor(@Inject(OPERATIONAL_METRICS) private readonly metrics: OperationalMetrics) {}

  @Get('metrics')
  metricsEndpoint(@Req() request: { headers: { authorization?: string } }, @Res() reply: { code(status: number): typeof reply; header(name: string, value: string): typeof reply; type(value: string): typeof reply; send(value?: string): unknown }) {
    const token = process.env.OBSERVABILITY_METRICS_TOKEN;
    if (!token) return reply.code(404).send();
    if (!metricsAuthorized(request.headers.authorization, token)) {
      return reply.code(401).header('www-authenticate', 'Bearer realm="auditsphere-metrics"').send();
    }
    const pool = databasePool;
    return reply.type('text/plain; version=0.0.4; charset=utf-8').header('cache-control', 'no-store').send(this.metrics.render({
      total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options.max ?? 0,
    }));
  }
}

@ApiTags('System') @ApiDefaultResponse({ standardSchema: apiProblemSchema }) @UseInterceptors(StandardSchemaSerializerInterceptor)
@Controller('system')
class SystemController {
  @Get('version')
  @ApiOkResponse({ standardSchema: systemVersionSchema })
  @SerializeOptions({ schema: systemVersionSchema })
  version() { return { service: 'auditsphere-api', version: '0.1.0' }; }
}
@ApiTags('Identity')
@ApiDefaultResponse({ standardSchema: apiProblemSchema })
@Controller('identity')
@UseInterceptors(StandardSchemaSerializerInterceptor)
class IdentityController {
  @Get('config')
  @ApiOkResponse({ standardSchema: identityConfigurationSchema })
  @SerializeOptions({ schema: identityConfigurationSchema })
  config() {
    if (process.env.AUTH_PROVIDER !== 'entra' && process.env.NODE_ENV !== 'production') return { provider: 'development' };
    return { provider: 'entra', tenantId: process.env.M365_TENANT_ID, clientId: process.env.ENTRA_BROWSER_CLIENT_ID, scopes: [process.env.ENTRA_BROWSER_API_SCOPE], redirectUri: process.env.ENTRA_BROWSER_REDIRECT_URI };
  }
}
@Module({ imports: [RuntimeModule, RealtimeModule], controllers: [HealthController, MetricsController, SystemController, IdentityController, InternalIdentityController, PortalAuthController, PortalProposalController, DocumentUploadsController, DocumentDownloadsController, DocumentTemplatesController, FieldworkController, DocumentLinksController, PublicationController, TaxonomyController, MaterialityController, RiskController, ReviewNoteController, AdjustmentController, NotificationController, GovernanceController, AuditController, PracticeLedgerController, PracticeRatesController, PracticeFirmController, PracticeTimeEntryController, CommercialController], providers: [InternalGuard, InternalIdentityGuard, EditLeaseConnection] })
export class AppModule {}

export function createOpenApiDocument(app: NestFastifyApplication) {
  return SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('AuditSphere').setVersion('0.1').addBearerAuth().build());
}

export async function configureApiHttp(app: NestFastifyApplication, config = readConfiguration()): Promise<void> {
  await configureHttpSecurity(app, config);
  app.useGlobalInterceptors(new CorrelationContextInterceptor());
  if (config.NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
}

export async function main() {
  const config = readConfiguration();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter());
  await installRealtimeRedisAdapter(app, config.REDIS_URL);
  app.enableShutdownHooks();
  await configureApiHttp(app, config);
  const readiness = await app.get(Readiness).assertRequired();
  if (readiness.status === 'degraded') console.error(JSON.stringify({ event: 'startup.degraded', service: 'auditsphere-api', dependencies: readiness.dependencies, alerts: readiness.alerts }));
  await app.listen(config.PORT, config.HOST);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
