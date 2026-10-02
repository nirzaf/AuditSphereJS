# AuditSphereJS
NestJS 12 + Fastify 5 · Angular 22/CDK · PostgreSQL 18 · Prisma 7 · BullMQ 6

Implementation follows the supplied architecture's first sprint. See docs/IMPLEMENTATION-STATUS.md for the remaining product scope.

## Run locally
Use Node 24 and pnpm 12.8.1. Docker Desktop must be running.
```
pnpm install
pnpm setup:local
# Creates local credentials in ignored .env without printing them.
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:roles
pnpm db:seed
pnpm dev
```
Open http://127.0.0.1:4200 and enter your local token. Upload a UTF-8 CSV with headers `code,name,current,prior`; balances are signed decimals and each period must sum to zero before finalization.
The seed's technical engagement is explicitly a development fixture. Microsoft Entra API token validation and MSAL browser sign-in are implemented. Production requires tenant configuration and explicitly assigned users; live tenant acceptance is pending.
API health: http://127.0.0.1:3000/health and readiness at http://127.0.0.1:3000/health/ready. Health routes stay unprefixed; every other route is under `/api/v1`. Swagger: http://127.0.0.1:3000/api/docs (non-production only).

## Verify
```
pnpm verify:affected
pnpm build
pnpm test:e2e
```
Production file storage uses Microsoft Graph with SharePoint evidence libraries and OneDrive working files. RustFS with a pinned digest remains a local development fixture. See docs/architecture/microsoft365-storage.md. Local dependency credentials in `.env.example` are development-only. Services bind to loopback. Never expose this environment publicly.

For tenant registration, selected-folder permissions, application variables and ongoing maintenance, see [the Microsoft 365 configuration guides](docs/microsoft365/README.md).

Angular development uses the workspace-pinned [Angular CLI MCP server and standards](docs/architecture/angular-mcp.md), configured in `.codex/config.toml`.

For live integration checks with the environment running:
```
pnpm exec tsx tests/integration/leases.ts
pnpm exec tsx tests/integration/local-slice.ts
$env:RUN_LIVE_E2E='1'
pnpm test:e2e
```
The integration benchmark creates development import fixtures and records timings in docs/benchmarks-local.json.
The v2.1 CURRENT source is preserved at docs/requirements/CURRENT.md; tasks and acceptance evidence are tracked under docs/.
