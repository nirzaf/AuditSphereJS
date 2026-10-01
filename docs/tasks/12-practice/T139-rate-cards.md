# T139 — Implement effective-dated staff charge-out rates

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 12-practice — Practice analytics and bookkeeping reports |
| Owner area | `practice` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Seed the required Partner 1000, Manager 750, Supervisor/Senior 500 and Associate/Junior 200 QAR/hour defaults.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T066 — Create the firm chart of accounts and accounting-period controls](../06-billing-portal/T066-accounts-periods.md)
- [T021 — Create explicit permission and segregation-of-duties checks](../02-security/T021-authorization.md)
- [T023 — Implement decimal, accounting-date and deterministic clock primitives](../02-security/T023-money-clock.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R073** — Role charge-out rates: 1000/750/500/200 QAR; source lines `560-564`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/practice/; apps/web features/practice; owned journals/billing/rates; tests

**Non-goals:** Practice is the sole posting owner; client audit AJEs never silently enter the firm ledger.

**Data or records:** rate_cards; staff_grade assignments.
**Screen or user interaction:** Rate-card administration.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Seed the required Partner 1000, Manager 750, Supervisor/Senior 500 and Associate/Junior 200 QAR/hour defaults.
- [ ] Keep job grade/rate identity separate from the four access personas; REVIEWER is not one universal rate.
- [ ] Permit authorized future rate revisions with nonoverlapping effective dates.
- [ ] Persist the applied rate in each time entry so later rates do not recalculate history.

## Acceptance criteria and required tests

- [ ] **AC1:** All four required defaults are represented exactly.
- [ ] **AC2:** Overlapping effective rates are rejected.
- [ ] **AC3:** Historical entries retain their original rate snapshot.

Run real-PostgreSQL decimal, posting, reversal, allocation and reconciliation tests relevant to this change.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T139
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
