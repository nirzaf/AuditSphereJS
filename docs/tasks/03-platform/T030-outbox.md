# T030 — Implement a durable outbox with operation reconciliation

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `async` |
| Completion unit | One focused, reviewable change and its evidence |

> Current status: `IN_PROGRESS`. Durable Trial Balance dispatch, PostgreSQL/Redis recovery, invoice idempotency and the queued-versus-completed invariant are verified. AC2 remains open for report release because its owning workflow is not implemented yet (T129/T130).

## Outcome

Write typed outbox records in the same transaction as originating business state; include stable operation IDs and small versioned payloads.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T027 — Persist idempotent operation outcomes in PostgreSQL](../02-security/T027-idempotency.md)
- [T025 — Implement append-only audit writes with database permissions](../02-security/T025-audit-write.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R019** — Automatic receipt and dispatch; source lines `427-427`.
- **R031** — Five-folder engagement taxonomy; source lines `454-463`.
- **R061** — Critical confirmation blocks release and triggers holding letter; source lines `523-523`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R069** — D5 remaining 50% fee note; source lines `546-546`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/jobs and owning processors; apps/worker/; outbox records; tests

**Non-goals:** No network wait inside database transactions or exactly-once claims for external systems.

**Data or records:** outbox_events; background_operations; dispatch claims.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Write typed outbox records in the same transaction as originating business state; include stable operation IDs and small versioned payloads.
- [x] Claim dispatch batches with SKIP LOCKED/claim expiry and enqueue deterministic BullMQ job IDs.
- [x] Distinguish queued from completed; retain PostgreSQL operation state so lost Redis jobs can be discovered and re-enqueued.
- [x] Add a reconciliation scan for nonterminal operations and record unknown provider outcomes for manual resolution.

## Acceptance criteria and required tests

- [x] **AC1:** Crash before/after enqueue produces no lost durable intent.
- [ ] **AC2:** Re-delivery never creates a second invoice or release. Duplicate invoice delivery is covered by T027's PostgreSQL test; report-release delivery cannot yet be exercised because that operation does not exist (T129/T130).
- [x] **AC3:** Marking an outbox event dispatched does not falsely mark its business operation complete.

Exercise commit/enqueue gaps, retries, worker shutdown and recovery on real PostgreSQL/Redis.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T030
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
