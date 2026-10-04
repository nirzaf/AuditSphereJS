# T040 — Implement durable deadline scanning and maintenance claims

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `async` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Persist deadlines in PostgreSQL; run a bounded scanner with single-claim logic rather than relying only on delayed Redis jobs.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T031 — Configure BullMQ workers for reliable retries and shutdown](T031-queue-runtime.md)
- [T023 — Implement decimal, accounting-date and deterministic clock primitives](../02-security/T023-money-clock.md)
- [T030 — Implement a durable outbox with operation reconciliation](T030-outbox.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R030** — Statutory milestone scheduling; source lines `452-452`.
- **R061** — Critical confirmation blocks release and triggers holding letter; source lines `523-523`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** `packages/server/src/platform/` shared services (flat files); `apps/worker/`; outbox records; least-privilege database role provisioning; tests

**Non-goals:** No network wait inside database transactions or exactly-once claims for external systems.

**Data or records:** scheduled business deadlines; maintenance claim metadata.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Persist deadlines in PostgreSQL; run a bounded scanner with single-claim logic rather than relying only on delayed Redis jobs.
- [x] Enqueue idempotent operations with deterministic IDs and re-scan after downtime.
- [x] Distinguish informational reminders from state-changing enforcement.
- [x] Keep archive-state enforcement independent of successful PDF generation; the generic enforcement handler is document-agnostic, while T131 owns actual archive state transitions.

## Acceptance criteria and required tests

- [x] **AC1:** Missed schedules are caught up after restart.
- [x] **AC2:** Two scheduler replicas cannot create duplicate deadline effects.
- [x] **AC3:** Clock-controlled tests cover before, at and after a deadline.

Exercise commit/enqueue gaps, retries, worker shutdown and recovery on real PostgreSQL/Redis.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T040
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
