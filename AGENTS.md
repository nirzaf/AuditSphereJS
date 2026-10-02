# AuditSphereJS — agent entry point

NestJS 12 + Fastify 5 modular monolith, Angular 22 standalone SPA, one PostgreSQL 18 business database behind Prisma 7, one API process and one BullMQ worker, in a single pnpm workspace. Delivery is driven by the preserved v2.1 CURRENT requirements and the 171-task pack under `docs/tasks/`. This file is the index; depth lives in `docs/guides/`.

## Read in this order

1. [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) — what is built, what is presentation-only, what is still unverified.
2. The target task `docs/tasks/<phase>/T###-*.md` — outcome, allowed areas, non-goals, acceptance criteria and the exact `CURRENT.md` line ranges it must satisfy.
3. The owning module README `packages/server/src/modules/<module>/README.md` — purpose, owned records, exported facades, invariants, tests.
4. [docs/guides/04-architecture-contract.md](docs/guides/04-architecture-contract.md) — ownership table, mutation transaction, concurrency, financial and archive rules.
5. [docs/decisions/register.json](docs/decisions/register.json) — applicable decisions; recorded user decisions outrank earlier pending defaults.
6. [docs/guides/13-execution-ledger.md](docs/guides/13-execution-ledger.md) — task-by-task status, updated only after review.

Token budget: quote the `CURRENT.md` line ranges the task cites instead of loading the whole 41 KB file. Never edit `docs/requirements/CURRENT.md`; `pnpm verify:task -- T001` byte-compares it with `docs/sources/requirements-current.md`.

## Where things live

| Path | Role |
| :--- | :--- |
| `apps/api/src/main.ts`, `apps/worker/src/main.ts` | Process composition. The API wires controllers, global prefix, helmet, correlation id, log redaction, error filter and Swagger here; no business logic. |
| `apps/web/src/main.ts` | Angular bootstrap with lazy routes `''` workspace, `'portal'` client portal, `**` redirect. |
| `apps/web/src/module-catalog.ts`, `module-workspace.ts`, `line-editor.ts` | The five modules' workspace screens and the shared repeating-line editor; per-screen connectivity boundary in `docs/evidence/UI-MODULES.md`. |
| `packages/server/src/modules/<module>/` | Domain services plus `*-controller.ts` for `commercial`, `governance`, `fieldwork`, `reporting`, `practice`. |
| `packages/server/src/platform/` | Shared mechanisms: money, clock, unit of work, auth/authz, audit chain, leases, storage, repository, config, db, runtime. Flat files, not the nested `platform/<area>/` folders the guide 04 sketch shows. |
| `packages/server/src/worker.ts` | Outbox relay, queue consumer and import parsing behavior. |
| `packages/server/src/generated/prisma/` | Generated client and model types. Regenerate with `pnpm db:generate`; never hand-edit. |
| `packages/contracts/src/` | Browser-safe transport schemas, enums and generated types, including lifecycle commands. |
| `prisma/schema.prisma`, `prisma/migrations/` | Business truth and one ordered, reviewed migration history. |
| `tests/`, `scripts/`, `docs/` | Suites; boundary/verification/contract/compatibility tooling; requirements, guides, decisions, evidence, runbooks. |

There is no `infra/` directory. `Dockerfile`, `docker-compose.yml`, `.env.example`, `.env.production.example` and `scripts/setup-local.mjs` fill that role.

## Commands that exist

Bootstrap in order; compose refuses to start without generated credentials.

```
pnpm install --frozen-lockfile
pnpm setup:local      # writes ignored .env, prints nothing
pnpm infra:up         # postgres, redis (AOF/noeviction), rustfs
pnpm db:generate && pnpm db:migrate && pnpm db:roles && pnpm db:seed
pnpm dev              # api :3000, web :4200 proxying /api, worker
```

| Command | Use |
| :--- | :--- |
| `pnpm verify:affected` | Boundaries, typecheck, unit tests. Minimum before handing work back. |
| `pnpm verify:all` | Lint, typecheck, unit, integration, e2e. Release-candidate scope. |
| `pnpm verify:task -- T###` | The recorded checks for one task. |
| `pnpm lint`, `pnpm boundaries`, `pnpm build`, `pnpm build:server`, `pnpm typecheck` | ESLint, import rules, server `tsc -b` and the Angular production build. |
| `pnpm contracts:generate`, `contracts:check` | Canonical contracts and generated schemas; CI fails on drift. |
| `pnpm dependencies:check` | Advisory, engine, peer and license evidence. |
| `pnpm build:linux`, `smoke:linux` | Source-fingerprinted compatibility image and its runtime smoke. |
| `pnpm migration:inventory`, `migration:parity`, `migration:differential` | Legacy-finance parity harness under `docs/migration/`. |

## Which runner picks up which file

| Runner | Scope |
| :--- | :--- |
| Vitest (`pnpm test`, `test:unit`) | Only `tests/**/*.test.{ts,mjs}`, `apps/api/tests/**/*.test.ts`, `packages/server/tests/**/*.test.ts` per `vitest.config.ts`. |
| `ng test web` | `apps/web/src/*.spec.ts` through `@angular/build:unit-test`. |
| `node --import tsx --test` | The explicit `.integration.ts` list in `package.json`'s `test:integration`. Needs Docker for Testcontainers PostgreSQL. |
| Playwright (`pnpm test:e2e`) | `tests/e2e` against `http://127.0.0.1:4200`; live journeys self-skip without `RUN_LIVE_E2E=1`. |
| `pnpm test:m365:storage:live` | `tests/live/m365-storage.acceptance.ts`; real tenant credentials and never part of CI. |

A test file outside these globs is never executed, so name new tests for the runner that owns them.

## Non-negotiable rules

Domain and data:
- Read docs/requirements/CURRENT.md and the target module README before business changes.
- Keep business rules in domain services, never controllers or Angular components.
- Do not mutate another module's owned tables. Do not hand-edit generated code.

Money and time:
- Use decimal strings and Prisma Decimal for money. Never JavaScript monetary arithmetic.

Authority, concurrency and audit:
- Every protected mutation needs engagement scope and workflow authorization.
- Every editable aggregate needs optimistic versions. Never overwrite approved artifacts.
- Audit events are append-only. Never update/delete posted journals; reverse them.
- PostgreSQL owns business truth. Redis leases are advisory.

Process and evidence:
- Heavy parsing and rendering belong in workers. Use explicit reviewed migrations.
- Run pnpm verify:affected. Add meaningful invariant tests and record evidence honestly.
- Do not deploy, publish or claim functional acceptance from scaffold tests alone.
- Keep docs/microsoft365/*.md current in the same change when modifying tenant configuration, Entra/Graph integrations, permissions, repository bindings, credentials or their acceptance tests. Record verification dates and limitations; never document secret values.
- For Angular work, use the workspace-pinned Angular CLI MCP server: call list_projects and get_best_practices before changes, search_documentation for version-specific APIs, and run affected Angular build/tests. If native MCP tools are unavailable, use scripts/angular-mcp.mjs. Follow Angular 22 guidance, including default standalone/OnPush, signal inputs/state, native control flow, typed boundaries and accessible templates. Record remaining deviations honestly; MCP guidance is not functional acceptance.

## Traps

- `pnpm verify:task` has no fallback. An ID absent from the recipe map in `scripts/verify-task.mjs` throws `Task T### has no recorded verification recipe. It cannot be verified.` Implementing a task means adding its recipe in the same change, and it must run through pnpm.
- Cross-module access is permitted only through `../<module>/public.js` (`scripts/check-boundaries.mjs`). No `public.ts` facade exists yet, so reaching a sibling module requires creating that facade in the same change. Browser code may import nothing matching `@auditsphere/server`, `@prisma/` or `packages/server`.
- Health routes are excluded from the `api/v1` global prefix: `/health`, `/health/live`, `/health/ready`. Everything else is `/api/v1/...`, `/api/docs` exists only outside production, and Angular emits to `dist/web/browser` (what CI packages). `dev:web` proxies `/api`, so browser code uses relative paths.
- `docs/evidence/<T###>/` and `docs/benchmarks-local.json` are measured history. Append; never overwrite a prior result or reuse an older pass on a new build.
- Node `>=24.15.0 <25` and `pnpm@12.8.1` are pinned by `engines`, `packageManager` and `.node-version`. No new package without `docs/guides/02-compatibility-matrix.md` and `docs/guides/03-library-register.md` review.
- Docker socket and `host.docker.internal` failures on Windows: `docs/runbooks/docker-windows-sockets.md`.

## When I need

| Need | Start at |
| :--- | :--- |
| Decimal or accounting-date behavior | `packages/server/src/platform/decimal6.ts`, `clock.ts` |
| Scope, grants or capability checks | `packages/server/src/platform/authorization.ts`, `auth.ts`, `entra.ts` |
| Engagement state transitions | `packages/server/src/modules/governance/lifecycle.ts` |
| Immutable audit or checkpoints | `packages/server/src/platform/audit-chain.ts` |
| Edit leases and fencing | `packages/server/src/platform/leases.ts`, `tests/integration/leases.ts` |
| One-transaction command or deferred work | `packages/server/src/platform/unit-of-work.ts` |
| Queue, outbox or lost-job recovery | `packages/server/src/worker.ts`, `packages/server/tests/outbox-recovery.ts` |
| Evidence bytes, SharePoint or OneDrive | `packages/server/src/platform/storage.ts`, `graph-storage.ts`, `docs/microsoft365/` |
| Firm ledger, periods, reversals | `packages/server/src/modules/practice/ledger.ts` |
| Requirement coverage or mandatory invariants | `docs/guides/06-requirements-traceability.md`, `docs/guides/07-testing-and-invariants.md` |
| Legacy finance feature parity | `docs/migration/epics.md`, `docs/migration/destination-status.json` |
| CI, release automation and plan corrections | `.github/workflows/ci.yml`, `docs/runbooks/github-actions.md`, `docs/guides/10-corrections-to-prior-plan.md` |

## Definition of done

- Task acceptance criteria checked against real code, with that task's `pnpm verify:task -- T###` plus `pnpm verify:affected` executed.
- Evidence appended in `docs/evidence/<T###>/handoff.md` using `docs/templates/task-handoff.md`: changed files, migrations and contracts, exact commands and output, fixture versions, unresolved decisions, limitations.
- Contracts, lint and boundaries re-checked after any contract or import change, and the ledger updated only after review; a green scaffold test is not functional acceptance.
- No merge, deploy, data reset or irreversible provider action without separate authorization. CI verifies and publishes a labelled non-production web asset and deploys nothing; release stays gated by `docs/guides/09-release-checklist.md`.
