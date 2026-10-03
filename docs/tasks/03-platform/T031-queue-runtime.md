# T031 — Configure BullMQ workers for reliable retries and shutdown

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `async` |
| Completion unit | One focused, reviewable change and its evidence |

> Current status: `IN_PROGRESS`. Producer waits are bounded, worker Redis reconnects persist, failed jobs are retained with stable operation correlation, active parsers checkpoint BullMQ cancellation between bounded row batches, and real Redis tests cover killed-worker stalled recovery. Linux CI will verify the child-process SIGTERM drain; T030 must also reach `DONE` before this task can close under the dependency gate.

## Outcome

Use the peer-compatible @nestjs/bullmq/BullMQ pair with persisted noeviction Redis and bounded queue payloads.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T030 — Implement a durable outbox with operation reconciliation](T030-outbox.md)
- [T013 — Provision reproducible local data services and test containers](../01-foundation/T013-local-services.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R041** — Excel/CSV TB imports from source systems; source lines `487-489`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/jobs and owning processors; apps/worker/; outbox records; tests

**Non-goals:** No network wait inside database transactions or exactly-once claims for external systems.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** BullMQ; @nestjs/bullmq; compatible ioredis; Redis

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Use the peer-compatible @nestjs/bullmq/BullMQ pair with persisted noeviction Redis and bounded queue payloads.
- [x] Give producer calls fast failure and workers persistent reconnection; separate job retry limits from connection retry behavior.
- [x] Isolate CPU-heavy processors from the API; cap concurrency by tested resource budgets.
- [x] Handle stalled jobs, failed jobs, cancellation checkpoints and graceful SIGTERM without dropping durable work. BullMQ `cancelJob` aborts the processor signal; Trial Balance parsing checks between row batches and transaction rollback prevents partial rows. The integration test exercises a real SIGTERM drain on Linux and an equivalent callback path is covered by unit tests on Windows.

## Acceptance criteria and required tests

- [ ] **AC1:** Redis disconnect, worker kill and restart are recoverable in integration tests.
- [ ] **AC2:** A failed job is visible with correlation and safe replay controls.
- [ ] **AC3:** API latency does not stall during a synthetic CPU job.

Exercise commit/enqueue gaps, retries, worker shutdown and recovery on real PostgreSQL/Redis.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T031
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
