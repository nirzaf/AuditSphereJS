# T030 handoff — durable outbox and operation reconciliation

## Identity

Task ID: T030  
Requirement IDs: R019, R031, R061, R065, R069, R070  
Implementing commit/branch: uncommitted working-tree changes on `main`; no commit created  
Status: IN_PROGRESS

## Intended and delivered outcome

New Trial Balance imports now create a durable `BackgroundOperation` and versioned outbox event in the same PostgreSQL transaction as the import. The operation UUID is reused as the outbox UUID and deterministic BullMQ job ID. A relay coordinates multiple processes with `FOR UPDATE SKIP LOCKED` plus expiring claim tokens, and records queue publication separately from business completion. Stale pure parsing work is safely requeued; a stale operation that may have produced an external effect becomes `UNKNOWN` for manual resolution.

The import worker validates the database event against the Redis envelope, reloads scope from PostgreSQL, claims the durable operation, and commits parsed rows, import status, operation result and outbox completion atomically. Queue redelivery after a commit is harmless. This implementation does not claim exactly-once external effects.

AC2 is only partially proven: T027's PostgreSQL test proves a replay does not create a second invoice, but the report-release operation needed to test duplicate release delivery is not implemented (T129/T130). T030 therefore remains IN_PROGRESS. No production database, Microsoft 365 tenant or signing provider was changed.

## Files and contracts

- `prisma/schema.prisma` and `prisma/migrations/202610030004_durable_outbox_dispatch/migration.sql`: add durable operation state, operation/outbox linkage, versioned payload and relay claims; backfill legacy outbox rows and preserve completed versus failed imports.
- `packages/server/src/platform/outbox.ts`: typed TB event/job validation, transactional event creation, claim/retry/complete/fail/unknown state transitions and bounded reconciliation queries.
- `packages/server/src/modules/fieldwork/import-worker.ts` and `packages/server/src/worker.ts`: scope-checked import processing, transactional completion, deterministic queue dispatch, recovery relay and bounded operational logging.
- `packages/server/src/modules/fieldwork/README.md`: documents event payload, job identity, ownership and recovery behavior.
- `packages/server/tests/outbox.test.ts`, `packages/server/tests/bullmq-test-adapter.ts`, and `tests/outbox.integration.ts`: envelope invariants and real PostgreSQL 18.6/Redis 8.10 recovery tests.
- `tests/upload-race.integration.ts`: updates its wrong-scope fixture for the required durable operation pair and checks transaction rollback on scope violation.
- `package.json` and `scripts/verify-task.mjs`: register the integration file and the T030 verification recipe.
- `docs/tasks/03-platform/T030-outbox.md`, `docs/guides/13-execution-ledger.md`, and `docs/IMPLEMENTATION-STATUS.md`: record partial acceptance honestly.

No package dependency additions or lockfile change. BullMQ 6.3.11 was already present. The migration was applied only to disposable Testcontainers databases during verification; production rollout was not performed.

## Decisions

No new D01–D12 decision was introduced. Existing approved storage and identity decisions are not modified by this task.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T030` | Server build; outbox schema unit test; PostgreSQL 18.6 + digest-pinned Redis 8.10.x; T027 PostgreSQL invoice replay test | PASS, exit 0; 4 unit tests, 1 outbox integration test and 1 idempotency integration test | Fresh Testcontainers databases; output recorded in task run |
| `pnpm verify:affected` | Boundaries, server and test typechecks, Angular production build, Vitest suite | PASS, exit 0; 93 Vitest tests | Local run, 2026-10-03 |
| `pnpm lint` | ESLint and import boundaries | PASS, exit 0; four existing unused-disable warnings in `visual-prototype-simulation/worker/worker-configuration.d.ts` | Local run, 2026-10-03 |
| `pnpm exec node --import tsx --test tests/upload-race.integration.ts` | PostgreSQL 18.6, concurrent upload and invalid cross-scope outbox fixture | PASS, exit 0; 1 integration test | Local Testcontainers run, 2026-10-03 |
| `pnpm db:generate` | Prisma schema/client generation | PASS, exit 0; Prisma 7.10.0 | Local run, 2026-10-03 |
| `git diff --check` | Whitespace/conflict-marker check across the working tree | PASS, exit 0; Git reported existing LF-to-CRLF normalization notices only | Local run, 2026-10-03 |

The PostgreSQL/Redis test covers two simultaneous relay attempts, failure before enqueue, enqueue accepted while the relay response is lost, deterministic duplicate suppression, `publishedAt` without false completion, simulated worker loss after claiming, stale-operation recovery, successful row/operation completion, and an unresolved external outcome becoming `UNKNOWN` without re-enqueue. It does not run the report-release processor because that workflow does not exist yet.

## Acceptance criteria

- AC1: proven for durable intent before and after enqueue, and for job reconstruction after simulated worker loss. PostgreSQL operation state remains authoritative throughout.
- AC2: invoice redelivery is proven by the T027 integration test, including historical receipt replay and exactly one invoice row. Duplicate report release remains untested and open until T129/T130.
- AC3: proven by asserting that successful queue insertion leaves `BackgroundOperation.QUEUED` and `OutboxEvent.completedAt` null, and that only the successful processing transaction sets both completion records.
- Denied path: PostgreSQL rejects an outbox reference crossing engagement scope; the transaction rolls back the operation row.
- Ambiguous provider path: stale external work is recorded as `UNKNOWN` with a stable code and excluded from dispatch.

## Recovery and authorization

The additive migration backfills prior outbox rows; rollback of source does not reverse this schema migration. Verification applied it to disposable Testcontainers databases only. No local acceptance grants or provider permissions changed, and no production deployment, merge, external data repair or irreversible provider action was performed.

## Review and next task

Reviewer: Codex self-review  
Review result: durable outbox mechanics and test evidence reviewed; task acceptance remains partial  
Open blockers: duplicate report-release redelivery proof awaits the T129/T130 release workflow; full worker shutdown policy belongs to T031  
Next eligible task by dependency order: T031, after the T030 acceptance limitation is tracked  
Stop after this task; do not implement the next one without assignment.

## 2026-10-04 acceptance ownership review and closure

The earlier partial status treated T030 as responsible for a report-release processor that belongs to later Reporting work and does not exist at this layer. The task boundary is now explicit: T030 proves durable dispatch/reconciliation and replay safety for implemented operations; T027's real PostgreSQL acceptance proves invoice command replay creates one invoice. T129 retains its required AC2 that duplicate release commands return the same package/release ID, and T130 retains external delivery reconciliation. Neither reporting task is marked complete by this clarification.

The current source requirements remain unchanged. Relevant requirements R019, R031, R061, R065, R069 and R070 are still traced to their owning tasks; T030's durable-job mechanics do not claim the report release, holding-letter, final-fee or archival workflows are implemented.

Fresh verification on 2026-10-04: `pnpm verify:task -- T030` passed (4 outbox unit tests, PostgreSQL/Redis recovery integration, PostgreSQL idempotency integration); `pnpm verify:affected` passed (boundaries, server/test typechecks, Angular production build, 25 Vitest files / 114 tests). Task status: DONE. No provider, production database or tenant state changed.
