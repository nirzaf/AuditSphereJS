# T024 — Share one transaction across module-owned business operations

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `platform` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Provide a small unit-of-work/transaction context passed to module-owned facades, not a global mutable transaction singleton.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T011 — Configure Prisma and PostgreSQL with explicit pool limits](../01-foundation/T011-database.md)
- [T022 — Implement canonical runtime contracts and generated browser types](T022-api-contracts.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.
- **R012** — Client commercial acceptance key; source lines `409-412`.
- **R013** — Partner acceptance/risk key; source lines `409-413`.
- **R017** — 50% advance invoice alongside letter; source lines `423-425`.
- **R072** — Timestamped immutable audit events; source lines `552-552`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/ relevant capability; packages/contracts/; related tests

**Non-goals:** Add the minimum shared mechanism; do not centralize every business rule in a platform service.

**Data or records:** Transaction context; lock-order documentation.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Provide a small unit-of-work/transaction context passed to module-owned facades, not a global mutable transaction singleton.
- [ ] Define lock ordering and bounded retry for retryable PostgreSQL conflicts; never retry validation failures.
- [ ] Ensure domain changes, audit inserts and required outbox/operation rows commit or roll back together.
- [ ] Forbid network/PDF/storage waits inside database transactions.

## Acceptance criteria and required tests

- [ ] **AC1:** An induced failure after the first write rolls back the entire command.
- [ ] **AC2:** Nested module calls use the same connection/transaction.
- [ ] **AC3:** Retry cannot duplicate a business identifier.

Run focused unit plus real-service integration tests for affected contracts, transactions and failure behavior.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T024
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
