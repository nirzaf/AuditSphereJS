# AuditSphereJS
NestJS 12 + Fastify 5 · Angular 22/CDK · PostgreSQL 18 · Prisma 7 · BullMQ 6

Implementation follows the supplied architecture's first sprint. See docs/IMPLEMENTATION-STATUS.md for the remaining product scope.

## Run locally
Use Node 24 and pnpm 10. Docker Desktop must be running.
```
pnpm install
Copy-Item .env.example .env
# Replace DEV_AUTH_TOKEN with a random local token.
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```
Open http://127.0.0.1:4200 and enter your local token. Upload a UTF-8 CSV with headers `code,name,current,prior`; balances are signed decimals and each period must sum to zero before finalization.
The seed's technical engagement is explicitly a development fixture. Production authentication is not implemented; protected endpoints fail closed in production.
API health: http://127.0.0.1:3000/api/v1/health · Swagger: http://127.0.0.1:3000/api/docs

## Verify
```
pnpm verify:affected
pnpm build
pnpm test:e2e
```
Object storage uses RustFS with a pinned container digest. Local dependency credentials in `.env.example` are development-only. Services bind to loopback. Never expose this environment publicly.

For live integration checks with the environment running:
```
pnpm exec tsx tests/integration/leases.ts
pnpm exec tsx tests/integration/local-slice.ts
$env:RUN_LIVE_E2E='1'
pnpm test:e2e
```
The integration benchmark creates development import fixtures and records timings in docs/benchmarks-local.json.
The v2.1 CURRENT requirements file is still needed for business acceptance.
