# T031 handoff — BullMQ worker reliability

## Identity

Task ID: T031
Status: IN_PROGRESS
Implementation head at handoff: local changes on `main`; commit is pending repository gates.

## Delivered

- Added `packages/server/src/platform/queue-runtime.ts` to validate Redis URL schemes and create distinct producer/worker ioredis policies. Producers use one command retry, disabled offline queuing and a one-second connection timeout; workers use `maxRetriesPerRequest: null`, offline queuing and capped persistent reconnect backoff.
- Wrapped BullMQ `Queue.add` with a 1.5-second deadline. BullMQ can wait for its connection before settling `add`; a timeout releases the durable outbox claim promptly. If Redis accepted an enqueue whose response was delayed, the stable operation UUID/job ID makes the next outbox pass idempotent.
- Retained failed BullMQ records up to seven days/1,000 jobs, pruned completed jobs at one day/5,000, capped parsing concurrency at one, and configured lock renewal/stalled-job recovery and three exponential attempts.
- Added stable safe error-code logging and operation UUID correlation without logging payloads or raw error messages.
- Made SIGINT/SIGTERM invoke one idempotent shutdown path. It stops timers, awaits in-flight relay/sweep work, waits for BullMQ's active job to close at a transaction boundary, then closes queue, database and Nest context.
- Added the worker process contract in `apps/worker/README.md`, a live Redis integration test, four unit checks, and the `T031` verification recipe.

## Verification evidence

`pnpm verify:task -- T031` passed: server build, queue runtime unit tests (4/4), live Redis queue runtime integration (1/1), and PostgreSQL 18.6/Redis 8.10.x durable-outbox recovery integration (1/1). The queue integration verifies a bounded unavailable-Redis publish, a client disconnect and automatic worker/producer reconnection, bounded retained failed jobs with operation correlation, same-ID duplicate suppression, and an HTTP event loop responding while a child worker performs a two-second CPU-bound task. The outbox integration covers durable dispatch across worker loss and reconstruction.

`pnpm verify:affected` passed: boundaries, server/test TypeScript checks, Angular production build, and Vitest (24 files / 106 tests). `pnpm lint` passed with zero errors and four existing unused-disable warnings under the excluded `visual-prototype-simulation/worker/worker-configuration.d.ts`. `git diff --check` passed; the only output was Git's existing LF-to-CRLF normalization notices.

## Open acceptance

- No business workflow currently defines or authorizes a background-operation cancellation command. Therefore a user-driven cancellation checkpoint is not invented in the generic worker; T031 remains partial until its owning workflow supplies that contract.
- Integration simulates Redis connection loss and exercises persisted outbox worker-loss recovery. A direct SIGTERM child-process drain and a true expired-lock stalled-job recovery scenario are not yet separately asserted.
- T030 remains `IN_PROGRESS` for duplicate report-release delivery until T129/T130 implements release. The current T030 implementation and invoice idempotency prerequisite are in place, but its documented status is retained rather than bypassed.
- No live production service or provider was changed. No database migration or package dependency was added.
