# T039 handoff — owner-safe advisory edit leases

## Identity

Task ID: T039
Requirement IDs: R046, source `docs/sources/requirements-current.md:497`
Implementing commit/branch: this handoff commit on `main`
Status: DONE

## Intended and delivered outcome

Trial Balance rows now have engagement-, import- and row-scoped Redis advisory leases. Redis atomically acquires, renews and releases leases using random ownership tokens and a 60-second expiry. The fieldwork API authorizes lease status and mutation using the active engagement and `FIELDWORK_WRITE`; other viewers receive the owner's identity label and expiry but never its token. The Angular Trial Balance view shows owner/expiry, renews held leases and releases them on save, discard, navigation and component destruction. Redis presence failures are surfaced as unavailable without granting or removing write authority. PostgreSQL expected row versions remain the only conflict authority. No workflow lifecycle, financial posting, migration, external permission or tenant configuration was changed.

## Files and contracts

- `.github/workflows/ci.yml`: schedules the new integration test in the CI integration shard.
- `apps/api/tests/edit-leases.integration.ts`: PostgreSQL/Redis/HTTP integration acceptance.
- `apps/api/tests/realtime.integration.ts`: multi-replica lease/auth/reconnect coverage using the new row-scoped API.
- `apps/web/src/styles.css`, `apps/web/src/workspace.html`, `apps/web/src/workspace.spec.ts`, `apps/web/src/workspace.ts`: lease status, UI, best-effort heartbeat/release and regression coverage.
- `docs/guides/13-execution-ledger.md`: task status and evidence pointer.
- `docs/tasks/03-platform/T039-leases.md`: implementation and acceptance checklist.
- `package.json`: focused Angular test and integration test registrations.
- `packages/contracts/openapi.json`, `packages/contracts/schema.json`, `packages/contracts/src/index.ts`: holder/result contract and generated schema/OpenAPI.
- `packages/server/src/modules/fieldwork/README.md`, `packages/server/src/modules/fieldwork/controller.ts`, `packages/server/src/modules/fieldwork/service.ts`: guarded status and mutation routes and fieldwork lease rules.
- `packages/server/src/platform/leases.ts`: row-scoped atomic Redis scripts, ownership tokens, TTL, bounded Redis calls and graceful availability result.
- `packages/server/tests/leases.test.ts`: Redis failure unit coverage.
- `scripts/verify-task.mjs`: T039 task recipe, including both single- and multi-replica lease integrations.
- `tests/integration/leases.ts`: maintained row-scoped integration helper.
- No database migration or new/updated dependency.

## Dependency evidence

No dependency changes. Existing Redis 8.10.x and PostgreSQL 18.6 containers were used for integration evidence; no provider or tenant changes were made.

## Decisions

No pending D01–D12 decision applies to R046 row lease behavior. Existing authorization and PostgreSQL version checks remain authoritative.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T039` | Build and generated contracts; lease unit suite 2 tests; PostgreSQL 18.6 + Redis 8.10 lease integration and two-replica realtime integration; Angular workspace 11 tests; boundaries and CI workflow invariants | PASS, exit 0; lease integration 1/1, realtime integration 1/1, Angular 11/11 | Live Testcontainers and Fastify HTTP routes; output ended `T039: recorded checks passed` |
| `pnpm verify:affected` | Server build, test TypeScript, Angular production build, Vitest | PASS, exit 0; 28 files / 127 tests | Production bundle generated in `dist/web` |
| `pnpm lint` | ESLint and module/browser boundaries | PASS, exit 0 | `Module and browser import boundaries passed` |
| `git diff --check` | Tracked patch formatting | PASS, exit 0 | No whitespace errors; Git emitted only LF-to-CRLF advisories |

## Acceptance criteria

- **AC1 — passed:** a stale owner's release token is rejected after another user acquires the replacement lease; the replacement remains visible and owned by that user.
- **AC2 — passed:** Redis lease expiry was forced with `PEXPIRE`; the expired lease returned no owner and rejected its stale release. A stale PostgreSQL row version was independently rejected, both before and after lease Redis became unavailable. Lease tokens are not accepted by row mapping commands.
- **AC3 — passed:** stopping Redis returns `{ available: false, reason: REDIS_UNAVAILABLE }` for lease presence; an attempted stale mapping still fails on the PostgreSQL row version.

## Recovery and authorization

Leases are advisory and expire automatically after 60 seconds. Disconnected clients attempt best-effort release; a lost release leaves only the short-lived lease. No migration or production data repair is needed. No deployment, provider grant or external action was performed.

## Review and next task

Reviewer: Codex implementation review
Review result: AC1–AC3 matched to implementation and executed test evidence.
Open blockers: None for T039. Browser verification against a live M365 tenant is unrelated and was not performed.
Next eligible task by dependency order: T040, subject to assignment.
Stop after this task; do not implement the next one without assignment.
