# T040 task handoff

## Identity

| Field | Value |
| :--- | :--- |
| Task ID | T040 |
| Requirement IDs | R030, R061, R070 |
| Implementing commit/branch | `ec8db41ecef8a3668c124a127a35ab180b82fff8` on `main` |
| Status | DONE |

## Intended and delivered outcome

Implemented reusable durable deadline infrastructure. A source workflow can persist a scoped idempotent deadline in PostgreSQL; bounded scanners claim due rows with `FOR UPDATE SKIP LOCKED` and atomically create deterministic background-operation/outbox identities. The worker rescans after downtime, relays into a separate BullMQ queue, and runs registered informational or enforcement handlers with completion in the same PostgreSQL transaction. PostgreSQL remains authoritative; Redis holds only dispatch jobs.

This closes the platform infrastructure task, not the owning business workflows. No statutory milestone, client confirmation or archive handler is registered here. T084/T112/T113 own their reminder workflows and T131 owns the actual 60-day archive state transition. The generic enforcement handler is document-agnostic and the integration fixture proves it runs without a PDF/document prerequisite.

## Files and contracts

- `prisma/schema.prisma` and migration `202610040008_durable_deadline_scanner`: scoped `ScheduledDeadline` records, state/payload constraints, a due index and a scoped unique outbox relation.
- `packages/server/src/platform/scheduler.ts`: strict schedule validation, idempotent content comparison, cancellation before queueing, bounded due scanning and a retry-safe handler processor.
- `packages/server/src/platform/outbox.ts`: versioned deadline envelopes, stable IDs, dispatch to the dedicated queue and stale-operation recovery.
- `packages/server/src/worker.ts`: a 15-second bounded scanner, separate producer/consumer, injected clock, safe logging and graceful shutdown.
- `packages/server/src/platform/scheduler-role-grants.ts` and `packages/server/scripts/provision-local-roles.ts`: least-privilege API/worker permissions; the API can create/update schedules and insert outbox rows, while the worker scans deadlines and inserts/updates operation/outbox rows. Neither receives DELETE on scheduler history.
- `tests/scheduler.integration.ts`, `packages/server/tests/scheduler.test.ts`, `tests/outbox.integration.ts`, package integration list, CI shard, and `scripts/verify-task.mjs`: focused contracts, database/Redis acceptance, task recipe and CI coverage.
- Platform README, T040 task checklist, implementation status and execution ledger record the design and evidence. Prisma client was regenerated; generated files are not hand-edited. No runtime dependency or lockfile changed.

## Dependency evidence

No dependencies added or updated. `pnpm-lock.yaml` is unchanged; SHA-256: `B8596C71EAA2F8804B6CAD1946B768E280C5D28BAB48DDF88D695D5AFD5AC996`.

Verified fixture/tool versions: Node.js 24.19.0, pnpm 12.8.1, TypeScript 6.0.3, Prisma 7.10.0, PostgreSQL 18.6 (digest-pinned), Redis 8.10 (digest `6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee`), Testcontainers 12.2.0 and Docker Engine 29.8.1. No tenant credentials or provider configuration were used.

## Decisions

D09 is `APPROVED_IMPLEMENTATION_DEFAULT` by user delegation. This task does not calculate an engagement's archive deadline or authorize retention behavior; T131 consumes this scheduler and implements the approved archive transition. No new professional-methodology or provider decision was assumed.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T040` | Server build, generated Prisma client, contracts/OpenAPI, scheduler unit/integration, scheduler-role script typecheck, outbox recovery, boundaries and CI shard policy | PASS, exit 0; 3/3 scheduler unit tests, 1/1 PostgreSQL/Redis scheduler integration, 1/1 PostgreSQL/Redis outbox integration | Local command output, 2026-10-04 |
| `pnpm verify:affected` | Boundaries, server and test TypeScript, Angular production build, Vitest | PASS, exit 0; 29 files and 130 tests | Local command output, 2026-10-04 |
| `pnpm lint` | ESLint and module/browser boundaries | PASS, exit 0 | Local command output, 2026-10-04 |
| `git diff --check` | Final T040 diff | PASS, exit 0 | Local command output, 2026-10-04 |
| [GitHub Actions Build and test](https://github.com/nirzaf/AuditSphereJS/actions/runs/37224218687) | Exact implementation commit `ec8db41`; static, unit, all integration shards, e2e, Linux compatibility/image gate and public asset publishing | PASS; every job completed successfully | Hosted run, 2026-10-04 |
| [Verified public web build](https://github.com/nirzaf/AuditSphereJS/releases/tag/build-ec8db41ecef8a3668c124a127a35ab180b82fff8) | `web.tar.gz` and `web-SHA256SUMS`; prerelease asset only, no deployment | Published; archive SHA-256 `8c2aa9ae8c573a9941406dda0b639931e271bb2a1e146b6a630717e6c3a0aaf4` | GitHub prerelease, 2026-10-04 |

## Acceptance criteria

- **AC1:** A schedule one millisecond after the initial fixed clock remains `SCHEDULED`, then a later scan catches it up. A separate missing-Redis-job/stale-running claim is reconstructed from PostgreSQL and completed after recovery.
- **AC2:** Two concurrent scans, each bounded to one row, claim two due rows exactly once. The operation, outbox and BullMQ IDs are deterministic from the persisted deadline UUID.
- **AC3:** `FixedClock` covers one millisecond before, exactly at and one millisecond after a due instant. The exact-boundary row is eligible; the later row stays pending until time advances.
- A reminder handler fails once and retries successfully; an enforcement handler commits while the engagement has zero documents, proving no PDF prerequisite. A changed request under the same idempotency key conflicts; cancellation only affects a still-scheduled row. PostgreSQL privilege probes confirm the intended API/worker scheduler permissions and denied deletes.
- A graceful worker close drains the active enforcement handler before shutting down. PostgreSQL/Redis tests also cover lost enqueue acknowledgements and stable-ID retries.

## Recovery and authorization

The migration is additive. A scheduler failure leaves either the original `SCHEDULED` row or a durable queued/failed operation; it does not partially complete handler database writes. Queue publication is at-least-once and stable job IDs suppress duplicate effects. A missing registered handler fails closed as `DEADLINE_HANDLER_UNAVAILABLE`. Source rollback does not remove scheduled records; any database repair is separate work. No live M365 permission, credential, external provider or deployment action occurred.

## Review and next task

| Field | Value |
| :--- | :--- |
| Reviewer | Codex self-review |
| Review result | Acceptance assertions, scoped relation/migration, runtime grants and queue recovery reviewed; all recorded local gates pass. |
| Open blockers | Domain-specific milestone, confirmation and archive handlers remain with T084, T112/T113 and T131; the platform worker intentionally registers no business deadline handlers until those tasks land. |
| Next eligible task by dependency order | T041 — operational metrics, redaction and dependency health. |
| Stop rule | Stop after this task; do not implement the next feature without assignment. |
