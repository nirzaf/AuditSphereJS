import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const mode = process.argv[2];
if (!['generate', 'check'].includes(mode)) throw new Error('Expected generate or check');
const apiPath = resolve('apps/api/dist/main.js');
if (!existsSync(apiPath)) throw new Error('Compiled API missing; run pnpm build:server before generating/checking OpenAPI');
const requireApi = createRequire(resolve('apps/api/package.json'));
const { NestFactory } = requireApi('@nestjs/core');
const { FastifyAdapter } = requireApi('@nestjs/platform-fastify');

// The API module creates its database client when imported; keep this document build independent
// of local secrets and avoid connecting to PostgreSQL while scanning controller metadata.
process.env.NODE_ENV ??= 'test';
process.env.SERVICE_NAME ??= 'auditsphere-openapi';
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@127.0.0.1:5432/auditsphere_openapi';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';

const { AppModule, createOpenApiDocument } = await import(pathToFileURL(apiPath).href);
const app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });
try {
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/{*splat}'] });
  await app.init();
  const document = createOpenApiDocument(app);
  const output = JSON.stringify(document, null, 2) + '\n';
  const target = 'packages/contracts/openapi.json';
  if (mode === 'generate') writeFileSync(target, output);
  else if (readFileSync(target, 'utf8') !== output) throw new Error('OpenAPI drift: run pnpm openapi:generate');
  console.log(`OpenAPI ${mode === 'check' ? 'matches API decorators' : 'generated from API decorators'}`);
} finally {
  await app.close();
}
