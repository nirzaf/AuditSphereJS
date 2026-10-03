# T013 local services and container isolation handoff — 2026-10-03

## Identity

Task ID: T013  
Requirement IDs: R002  
Implementing branch: `main` (shared worktree; no commit created)  
Status: DONE for the user-authorized non-production scope

## Intended and delivered outcome

The existing Compose stack provides PostgreSQL, queue Redis, RustFS and Mailpit. The runbook documents startup, non-destructive stop, named-volume preservation and isolated disposable Testcontainers. The verification recipe directly checks concurrent PostgreSQL and RustFS isolation in addition to PostgreSQL version/scope, Redis durability and local SMTP capture.

No production host, provider account, tenant permission, production database, production storage or persistent Compose volume was modified. Production readiness remains gated separately; the T006 no-deployment disposition permits only this local/non-production foundation to close.

## Files and contracts

- `tests/local-services.integration.ts` — starts two PostgreSQL 18.6 containers concurrently with the same database name, asserts distinct mapped ports and verifies each database retains only its own marker; retains Redis durability/version and Mailpit SMTP checks.
- `packages/server/tests/rustfs-isolation.integration.ts` — starts two containers of the existing digest-pinned RustFS image, proves same-named synthetic buckets and object keys have independent content, and confirms invalid credentials are rejected. Fixture objects and buckets are removed in `finally`.
- `scripts/verify-task.mjs` — adds the RustFS isolation test to the T013 recipe.
- `package.json` — includes the RustFS integration test in the explicit full integration runner; no dependency versions changed.
- `docs/tasks/00-readiness/T006-deployment-decisions.md`, `docs/evidence/T006/handoff.md` — record the user's no-deployment scope and preserve production readiness gates.
- `docs/tasks/01-foundation/T013-local-services.md`, `docs/guides/13-execution-ledger.md` — record scoped completion and link this evidence.
- `docker-compose.yml`, `docs/runbooks/local-services.md` — existing local service configuration and non-destructive lifecycle instructions were verified, not changed.

No database migration, API contract, public route or business record changed. The existing `@aws-sdk/client-s3` dependency was reused; no dependency changes were made.

## Dependency evidence

No dependency changes. RustFS is pinned to the existing SHA-256 image digest in Compose and Testcontainers; PostgreSQL, Redis and Mailpit use the existing immutable image pins. `docker compose config -q` passed.

## Decisions

- D11 provider boundary follows the user selections: Entra/Graph, SharePoint evidence, OneDrive working files, RustFS as the local S3-compatible fixture, and image signature artwork only.
- The user explicitly instructed “no need to deploy just create public assets.” Production host/region, recovery, retention, production service-license and measured SLO evidence are therefore not fabricated or accepted; they remain predeployment gates. Graph outbound notification delivery stays disabled pending T037 permission and recipient-policy acceptance.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T006` | Server production configuration boundary | Passed; 4 tests | Command output, 2026-10-03 |
| `pnpm verify:task -- T013` | PostgreSQL 18.6; two concurrent PostgreSQL instances; Redis 8.10; digest-pinned Mailpit; two digest-pinned RustFS instances | Passed; 5 tests across the database-version, local-services and RustFS steps; no skips | Command output, 2026-10-03 |
| `docker compose config -q` | Local Compose configuration | Passed; exit 0 | Command output, 2026-10-03 |
| `docker compose ps --format json` | Persistent local PostgreSQL, Redis, RustFS and Mailpit services | All four containers reported running; PostgreSQL and Redis healthy. No volumes were stopped, reset or removed. | Read-only command output, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server/test TypeScript checks, Angular production build and Vitest | Passed; 96 tests; exit 0 | Command output, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundaries | Passed; 0 errors and 4 warnings in untouched prototype declaration files | Command output, 2026-10-03 |
| `pnpm exec ng test web --watch=false` | Angular browser/component tests | Passed; 65 tests | Command output, 2026-10-03 |
| `git diff --check` on changed task/code files | Patch whitespace | Passed; exit 0 (Git reported repository CRLF normalization notices) | Command output, 2026-10-03 |

## Acceptance criteria

- **AC1:** `docs/runbooks/local-services.md` documents `pnpm infra:up`, `docker compose stop`, persistence semantics and a warning against `down --volumes`. Compose validates, and the disposable test containers are stopped in `finally`; existing local services were observed running without changing their volumes.
- **AC2:** Two simultaneous PostgreSQL test containers use the same database name and different mapped ports and preserve distinct markers. Two simultaneous RustFS instances independently store the same bucket/object names with different bodies. Two Redis containers are independently mapped. The tests clean up all synthetic objects, buckets and disposable containers.
- **AC3:** PostgreSQL reports the selected 18.6 version line; both Redis containers report 8.10.x, `maxmemory-policy=noeviction` and AOF enabled.
- Failure behavior: PostgreSQL command exits are asserted; RustFS rejects a deliberately invalid synthetic secret; SMTP only targets the disposable capture sink. Cleanup paths run in `finally` blocks.

## Recovery and authorization

Testcontainers use disposable containers and dynamic ports. Persistent Compose data is preserved by the documented `stop` path; there was no destructive cleanup or service restart. No deployment, external delivery or Entra/Graph permission change was performed.

## Review and next task

Reviewer: Codex implementation review  
Review result: Acceptance assertions and cleanup paths reviewed; focused and affected verification passed.  
Open blockers: Production readiness remains gated under T006; this handoff does not accept production topology, recovery, retention, licensing or SLOs.  
Next eligible task by dependency order: T032 is eligible now that T006, T018 and T024 are DONE; T031 remains blocked until T030 is DONE.
