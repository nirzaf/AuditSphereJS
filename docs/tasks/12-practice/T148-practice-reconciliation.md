# T148 — Reconcile all firm reports and audit financial adjustments

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 12-practice — Practice analytics and bookkeeping reports |
| Owner area | `testing` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Run a golden ledger dataset with advances, final invoices, partial settlements, expense journals, reversals and period close.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T147 — Implement allocated-payment accounts-receivable aging](T147-ar-aging.md)
- [T146 — Implement monthly firm Profit and Loss reporting](T146-firm-pl.md)
- [T143 — Implement source profitability and realization views with correct labels](T143-realization.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R017** — 50% advance invoice alongside letter; source lines `423-425`.
- **R018** — Payment settlement and transaction reference; source lines `426-426`.
- **R069** — D5 remaining 50% fee note; source lines `546-546`.
- **R073** — Role charge-out rates: 1000/750/500/200 QAR; source lines `560-564`.
- **R074** — Daily hours by engagement/phase/FSLI; source lines `335-339`.
- **R075** — Contracted fee minus charge-out-value calculation; source lines `565-567`.
- **R076** — Budget versus actual phase hours; source lines `569-569`.
- **R077** — Rent, salaries, benefits, end of service, withdrawals, petty cash; source lines `571-577`.
- **R078** — Firm TB, monthly P/L and client AR aging; source lines `578-578`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Relevant test suites, representative fixtures and evidence; minimal associated fixes

**Non-goals:** Do not weaken source invariants to make a test pass or rewrite unrelated modules.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Run a golden ledger dataset with advances, final invoices, partial settlements, expense journals, reversals and period close.
- [ ] Reconcile firm TB/P/L/AR and compare charge-out metric separately.
- [ ] Verify no client AJE appears in firm journals and no invoice is issued twice across draft/final report paths.
- [ ] Preserve evidence of balance and immutability checks using the real database engine.

## Acceptance criteria and required tests

- [ ] **AC1:** All report totals reconcile to source journals and allocations.
- [ ] **AC2:** Cross-ledger contamination tests fail closed.
- [ ] **AC3:** Period-close/concurrent-posting tests pass.

Run exact documented scenarios on real selected services; record fixture sizes, versions and observed outcomes.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T148
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
