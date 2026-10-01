# T131 — Persist signature-based deadlines and enforce due read-only state

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 11-archive — Archive, retention and inspection |
| Owner area | `reporting` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Store the authoritative signature instant and calculate the approved 60-calendar-day deadline once.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T130 — Track delivery and expose final downloads without false completion](../10-reporting/T130-release-delivery.md)
- [T040 — Implement durable deadline scanning and maintenance claims](../03-platform/T040-scheduler.md)
- [T004 — Approve signature, archival and engagement-type policies](../00-readiness/T004-records-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.
- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/reporting/; apps/web features/reporting; owned snapshots and worker processors; tests

**Non-goals:** Use Practice final-fee facade; no stale SRM release, silent re-signing or partial bundle exposure.

**Data or records:** archive_lock_due_at; editing_frozen_at; sealing status.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D09

## Implementation checklist

- [ ] Store the authoritative signature instant and calculate the approved 60-calendar-day deadline once.
- [ ] Enforce deadline/read-only checks on every audit-content mutation independently of scheduler availability.
- [ ] Queue archive sealing at the due time; incomplete manifests cause an incident and a sealing-pending status, not continued ordinary editing.
- [ ] Distinguish portal upload freeze at release from full engagement audit-content freeze.

## Acceptance criteria and required tests

- [ ] **AC1:** Before/at/after deadline tests use an injected clock.
- [ ] **AC2:** Scheduler downtime cannot allow overdue editing.
- [ ] **AC3:** Re-sign/re-delivery cannot silently reset the original deadline.

Test version-bound gates, evidence/signature identity, failure recovery and portal/archival boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T131
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
