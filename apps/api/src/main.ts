import 'reflect-metadata';
import 'dotenv/config';
import { ApiDefaultResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  Controller, Get, Module,
  SerializeOptions, StandardSchemaSerializerInterceptor, UseInterceptors,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CommercialController, PracticeLedgerController, PracticeRatesController, AuditController, FieldworkController, DocumentLinksController, DocumentDownloadsController, DocumentUploadsController, GovernanceController, PublicationController, TaxonomyController, MaterialityController, RiskController, ReviewNoteController, AdjustmentController, InternalGuard, InternalIdentityGuard, InternalIdentityController, PortalAuthController, RuntimeModule, Readiness, readConfiguration } from '@auditsphere/server';
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
  ready() { return this.readiness.check(); }
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
@Module({ imports: [RuntimeModule], controllers: [HealthController, SystemController, IdentityController, InternalIdentityController, PortalAuthController, DocumentUploadsController, DocumentDownloadsController, FieldworkController, DocumentLinksController, PublicationController, TaxonomyController, MaterialityController, RiskController, ReviewNoteController, AdjustmentController, GovernanceController, AuditController, PracticeLedgerController, PracticeRatesController, CommercialController], providers: [InternalGuard, InternalIdentityGuard] })
export class AppModule {}

export function createOpenApiDocument(app: NestFastifyApplication) {
  return SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('AuditSphere').setVersion('0.1').addBearerAuth().build());
}

export async function configureApiHttp(app: NestFastifyApplication, config = readConfiguration()): Promise<void> {
  await configureHttpSecurity(app, config);
  if (config.NODE_ENV !== 'production') SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
}

export async function main() {
  const config = readConfiguration();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter());
  await configureApiHttp(app, config);
  await app.get(Readiness).check();
  await app.listen(config.PORT, config.HOST);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
