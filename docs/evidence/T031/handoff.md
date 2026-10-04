# T031 handoff — BullMQ worker reliability

## Identity

Task ID: T031
Status: IN_PROGRESS
Implementation head at handoff: local changes on `main`; hosted CI for this increment is pending push.

## Delivered

- Added `packages/server/src/platform/queue-runtime.ts` to validate Redis URL schemes and create distinct producer/worker ioredis policies. Producers use one command retry, disabled offline queuing and a one-second connection timeout; workers use `maxRetriesPerRequest: null`, offline queuing and capped persistent reconnect backoff.
- Wrapped BullMQ `Queue.add` with a 1.5-second deadline. BullMQ can wait for its connection before settling `add`; a timeout releases the durable outbox claim promptly. If Redis accepted an enqueue whose response was delayed, the stable operation UUID/job ID makes the next outbox pass idempotent.
- Retained failed BullMQ records up to seven days/1,000 jobs, pruned completed jobs at one day/5,000, capped parsing concurrency at one, and configured lock renewal/stalled-job recovery and three exponential attempts.
- Added stable safe error-code logging and operation UUID correlation without logging payloads or raw error messages.
- Made SIGINT/SIGTERM invoke one idempotent shutdown path. It stops timers, awaits in-flight relay/sweep work, waits for BullMQ's active job to close at a transaction boundary, then closes queue, database and Nest context.
- Added an additive PostgreSQL migration and model field for terminal `CANCELLED` background operations. BullMQ's per-job `AbortSignal` is checked at each 1,000-row parsing boundary; abort rolls back the interactive transaction, leaves no partial rows, and closes the outbox operation without retry.
- Added the worker process contract in `apps/worker/README.md`, a live Redis integration test, four unit checks, and the `T031` verification recipe.

## Verification evidence

`pnpm verify:task -- T031` passed: server build, queue runtime policy unit tests (4/4), parser unit tests (6/6), real Redis queue runtime integration (1/1), and PostgreSQL 18.6/Redis 8.10.x durable-outbox recovery integration (1/1). The queue integration verifies a bounded unavailable-Redis publish, a client disconnect and automatic worker/producer reconnection, bounded retained failed jobs with operation correlation, same-ID duplicate suppression, actual expired-lock recovery after killing a worker process, and an HTTP event loop responding while a child worker performs a two-second CPU-bound task. On Linux the same integration sends SIGTERM to a worker child and verifies the active job drains before shutdown; this Windows host skips OS SIGTERM delivery and separately tests the registered shutdown callback. The outbox integration covers durable dispatch across worker loss and reconstruction, including cancellation of a 50,000-row import with transaction rollback and no partial rows.

`pnpm verify:affected` passed: boundaries, server/test TypeScript checks, Angular production build, and Vitest (24 files / 107 tests). `pnpm lint` passed with zero errors and four existing unused-disable warnings under the excluded `visual-prototype-simulation/worker/worker-configuration.d.ts`. `git diff --check` passed; the only output was Git's existing LF-to-CRLF normalization notices.

Hosted GitHub Actions run [37163095493](https://github.com/nirzaf/AuditSphereJS/actions/runs/37163095493) passed on commit `d9a360d16a84ce199f2141dcfec2d107c3b96808`, including the Linux SIGTERM integration path, `pnpm verify:all`, contract checks, dependency audit, Linux runtime image smoke, and public web asset publication. The generated nonproduction [web asset release](https://github.com/nirzaf/AuditSphereJS/releases/tag/build-d9a360d16a84ce199f2141dcfec2d107c3b96808) contains `web.tar.gz` and `web-SHA256SUMS`.

## Open acceptance

- No public cancellation endpoint is exposed; an owning workflow must define its authorization surface before one is added.
- No live production service or provider was changed. One additive PostgreSQL migration was added; no package dependency was added.

## 2026-10-04 dependency review and closure

T030 is now reviewed as DONE for the generic outbox and operations implemented at that layer. T129 still owns duplicate release-command idempotency; T130 owns outbound delivery reconciliation. Those are workflow-specific acceptance items and do not keep the queue-runtime prerequisite open.

Fresh `pnpm verify:task -- T031` passed on 2026-10-04: queue policy tests (4/4), parser tests (6/6), live Redis runtime integration, and PostgreSQL/Redis durable-outbox recovery integration. `pnpm verify:affected` passed (25 Vitest files / 114 tests), and hosted Linux CI run [37163095493](https://github.com/nirzaf/AuditSphereJS/actions/runs/37163095493) previously verified actual child-process SIGTERM drain. Task status: DONE. No live production service or provider changed.
