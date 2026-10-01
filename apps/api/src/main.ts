import 'reflect-metadata';
import 'dotenv/config';
import { Controller, Get, Module, Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { FieldworkController, InternalGuard, RuntimeModule, Readiness, readConfiguration } from '@auditsphere/server';
@Controller('health') class HealthController { constructor(private readonly readiness: Readiness) {} @Get() health() { return { status: 'ok', service: 'auditsphere-api' }; } @Get('ready') ready() { return this.readiness.check(); } }
@Controller('identity') class IdentityController {
  @Get('config') config() {
    if (process.env.AUTH_PROVIDER !== 'entra' && process.env.NODE_ENV !== 'production') return { provider: 'development' };
    return { provider: 'entra', tenantId: process.env.M365_TENANT_ID, clientId: process.env.ENTRA_BROWSER_CLIENT_ID, scopes: [process.env.ENTRA_BROWSER_API_SCOPE], redirectUri: process.env.ENTRA_BROWSER_REDIRECT_URI };
  }
}
@Catch() class Errors implements ExceptionFilter { catch(error: unknown, host: ArgumentsHost) { const status = error instanceof HttpException ? error.getStatus() : 500; const req = host.switchToHttp().getRequest(); host.switchToHttp().getResponse().status(status).send({ error: { code: status, message: status === 500 ? 'Internal server error' : (error as HttpException).getResponse(), correlationId: req.id } }); if (status === 500) console.error(error); } }
@Module({ imports: [RuntimeModule], controllers: [HealthController, IdentityController, FieldworkController], providers: [InternalGuard] }) class AppModule {}
async function main() {
  const config = readConfiguration();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ bodyLimit: 16 * 1024 * 1024, logger: true }));
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new Errors()); app.enableShutdownHooks();
  app.enableCors({ origin: config.WEB_ORIGIN });
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('AuditSphere').setVersion('0.1').addBearerAuth().build()));
  await app.listen(config.PORT, config.HOST);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
