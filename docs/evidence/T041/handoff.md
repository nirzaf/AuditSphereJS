# T041 handoff — operational observability

## Identity

Task ID: T041

Requirement IDs: R002, R072

Implementing commit/branch: `main` (commit pending)
Status: DONE

## Intended and delivered outcome

HTTP requests receive a validated correlation ID and establish it in async context. The ID is carried into audit writes, Trial Balance and scheduled-deadline operation/outbox records, BullMQ payloads and worker execution, then into Graph, RustFS/S3 and ClamAV provider operations. PostgreSQL remains authoritative. API and worker expose authenticated Prometheus metrics with bounded labels for API latency, queue outcomes/backlog age, dependencies, event-loop delay and PostgreSQL pool occupancy. PostgreSQL failure is unready; optional Redis failure is degraded with recovery guidance. Legacy v1 queue messages remain readable and derive correlation from their stable outbox ID.

No business workflow, provider permission, dependency or production deployment was added. `.zcodeignore` was present as unrelated untracked content and was left untouched. `visual-prototype-simulation/` is excluded from this task and all intended commit paths.

## Files and contracts

- `.env.example`, `.env.production.example`, `scripts/setup-local.mjs`, `packages/server/src/platform/config.ts` — generated metrics-token configuration, host/port settings, production requirement and silent local credential setup.
- `apps/api/src/http-security.ts`, `apps/api/src/main.ts`, `apps/api/tests/shell.test.ts` — correlation request IDs, Fastify redaction/latency hooks, readiness response and bearer-protected `/health/metrics`.
- `packages/server/src/platform/observability/{correlation,logging,metrics,metrics-http}.ts`, `packages/server/src/index.ts` — async correlation context, log-field sanitization, bounded Prometheus collector, constant-time scrape-token check and server exports.
- `packages/server/src/platform/runtime.ts`, `packages/server/src/platform/db.ts`, `packages/server/src/platform/realtime/redis-transport.ts` — PostgreSQL/Redis readiness, database pool metrics, safe dependency alerts and Redis realtime degradation.
- `packages/server/src/platform/audit.ts`, `packages/server/src/platform/outbox.ts`, `packages/server/src/platform/scheduler.ts`, `packages/server/src/worker.ts` — request-to-operation/outbox/job/worker correlation and queue health metrics.
- `packages/server/src/platform/graph-storage.ts`, `packages/server/src/platform/storage.ts`, `packages/server/src/platform/clamav.ts` — correlated Graph, RustFS/S3-compatible and scanner calls with allow-listed provider outcomes and safe recovery logs.
- `packages/server/src/platform/README.md`, `docs/tasks/03-platform/T041-platform-observability.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/guides/13-execution-ledger.md` — operating invariants, task scope, status and reviewed completion record.
- `packages/contracts/src/index.ts`, `packages/contracts/schema.json`, `packages/contracts/openapi.json` — readiness contract and generated schema/OpenAPI updates.
- `prisma/schema.prisma`, `prisma/migrations/202610040009_operational_observability/migration.sql` — nullable, checked correlation columns on durable operation/outbox/deadline records and an outbox correlation index.
- `scripts/verify-task.mjs`, `packages/server/tests/observability.test.ts`, `packages/server/tests/outbox.test.ts`, `packages/server/tests/scheduler.test.ts`, `packages/server/tests/rustfs-isolation.integration.ts`, `tests/config.test.ts`, `tests/document-version.integration.ts`, `tests/graph-storage.test.ts`, `tests/outbox.integration.ts` — the recorded task recipe and invariant/provider/integration coverage.

The migration only adds nullable correlation fields and an index. Existing rows remain valid; legacy queue envelopes use their stable outbox UUID. No direct dependency or lockfile changes.

## Dependency evidence

No dependency changes. Native `AsyncLocalStorage`, `perf_hooks`, Fastify/Pino redaction, PostgreSQL pool metrics and the existing Redis/BullMQ/Graph/RustFS/ClamAV adapters are used. No OpenTelemetry exporter was added.

## Decisions

No T041-specific pending D01–D12 policy decision applies. User-selected Microsoft Entra/Graph and SharePoint/OneDrive provider decisions remain unchanged.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T041` | Exact task recipe: server build, generated contract/OpenAPI checks, configuration, observability, API security/shell, outbox/scheduler contracts, Graph storage, PostgreSQL + Redis outbox, RustFS integration and boundaries | PASS, exit 0; 36 focused Vitest tests, PostgreSQL/Redis outbox integration 1/1, RustFS integration 1/1 | Terminal output in this task; test image pins in test sources |
| PostgreSQL/Redis trace inside T041 recipe | PostgreSQL 18.6 Testcontainer and Redis 8.10 immutable test image | PASS; same correlation ID asserted from request command context through persisted operation/outbox/job, worker context and completed operation | `tests/outbox.integration.ts` |
| RustFS trace inside T041 recipe | Two isolated RustFS Testcontainers using the repository-pinned RustFS image | PASS; object upload/read/delete exercised under an async correlation context; provider health/metrics asserted | `packages/server/tests/rustfs-isolation.integration.ts` |
| `pnpm verify:affected` | Boundary checks, server and test TypeScript, Angular production build, Vitest | PASS, exit 0; 137 Vitest tests; Angular production bundle generated | Build/test output in this task |
| `pnpm lint` | ESLint and module/browser boundaries | PASS, exit 0 | Command output in this task |
| `pnpm contracts:generate`, `pnpm openapi:generate`, `pnpm contracts:check` | Runtime schemas and API decorator contract | PASS; generated artifacts match | Command output in this task |
| `pnpm setup:local` | Existing ignored local `.env` | PASS; added missing observability settings without printing credentials | Safe command output in this task |
| `git diff --check` | Reviewed T041 diff | PASS, exit 0; Git reported the repository's existing LF-to-CRLF working-copy notices | Command output in this task |

The exact task recipe discovered and passed: config 6/6; observability 5/5; API security 5/5; API shell 3/3; outbox contract 4/4; scheduler contract 3/3; Graph storage 10/10; two real-service integration cases 1/1 each. API shell verified metrics authorization failure and success, no-store text response and generated metrics. Unit assertions cover redaction, fixed-cardinality metric labels, correlation validation, and PostgreSQL-unready/Redis-degraded recovery actions.

## Acceptance criteria

- **AC1 PASS:** The PostgreSQL + Redis integration starts a scoped operation inside a known correlation context; the durable operation/outbox/job preserve it, the worker observes it, and the completed operation retains it. API shell tests independently prove validated request correlation and the protected metrics route. Graph and RustFS provider tests exercise correlation context and provider request IDs.
- **AC2 PASS:** Fastify/Pino redacts request URLs, bodies and credential/evidence fields; the recursive structured-log sanitizer test proves token/password/evidence values are replaced. Provider/worker failures log only safe correlation IDs, allow-listed error codes and actionable recovery text. No secret or evidence payload is placed in metric labels or emitted by setup commands.
- **AC3 PASS:** Readiness tests prove PostgreSQL outage returns `unready`, while a healthy database and failed Redis returns `degraded`; both include safe, actionable recovery guidance. Provider and queue failure paths record bounded metrics and dependency transitions.

Limitations: metrics are process-local counters/gauges and reset on restart; an external Prometheus-compatible collector must scrape the authenticated endpoints. Live Microsoft Graph tenant acceptance was not repeated because it is not required by T041; Graph HTTP behavior is unit-tested and RustFS is exercised against real isolated containers. No deployment or provider permission changes occurred.

## Recovery and authorization

The schema change is additive and existing records remain readable. Previous v1 BullMQ messages without `correlationId` remain accepted using the outbox UUID, avoiding a queue flush or forced coordinated restart. Redis is optional for readiness; queued intents stay durable in PostgreSQL for retry. No production migration, data repair, merge or deployment was performed. The existing user instruction authorizes regular direct pushes to `main`; CI will be checked after push.

## Review and next task

Reviewer: Codex implementation review

Review result: All T041 acceptance criteria checked against code and tests; focused task, affected, lint and diff checks pass.

Open blockers: Hosted Actions for the implementation commit is pending push; live M365 provider acceptance is outside T041.

Next eligible task by dependency order: T042 — build deterministic Trial Balance fixtures and a test-only engagement seed.
Stop after this task; do not implement the next feature without assignment.

## CI failure follow-up — 2026-10-04

The first hosted run for the observability implementation (`38ac6990cbedffb444cb013e51959bb7b204cfbb`, [Actions run 37228375653](https://github.com/nirzaf/AuditSphereJS/actions/runs/37228375653)) passed static, unit, e2e, image and one integration shard. Two integration shards exposed the same test-isolation regression: importing `operationalMetrics` from the `@auditsphere/server` root barrel in `apps/api/src/http-security.ts` eagerly loaded the database module before document upload/download tests pointed it at their Testcontainers database. Their fixed development-fixture UUID then collided with the already seeded local application database.

Correction: the server package now exports the side-effect-free metrics module at `@auditsphere/server/observability/metrics`, and the API security layer imports that narrow entry point instead of the server barrel. Production HTTP metrics behavior is unchanged. The observed regression was reproduced before the fix and both document integration tests passed after it.

| Follow-up command | Actual result |
| :--- | :--- |
| `pnpm exec node --import tsx --test apps/api/tests/document-download.integration.ts` | PASS, 1/1; disposable PostgreSQL container and full authorized/denied download path |
| `pnpm exec node --import tsx --test apps/api/tests/document-upload.integration.ts` | PASS, 1/1; disposable PostgreSQL container, malware scanner fixture and full upload/finalization path |
| `pnpm verify:task -- T041` | PASS, exit 0; full recorded recipe including PostgreSQL/Redis outbox, RustFS isolation and boundaries |
| `pnpm verify:affected` | PASS, exit 0; server/test typecheck, Angular production build and 137 unit tests |
| `pnpm lint` | PASS, exit 0 |
| `git diff --check` | PASS, exit 0 |

Hosted Actions for the correction is pending push; the successful result will be appended after the run completes. `.zcodeignore` remains unrelated untracked content and was not staged. `visual-prototype-simulation/` remains excluded.
