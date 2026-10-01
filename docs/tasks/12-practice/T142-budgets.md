# T142 — Implement engagement phase budgets and actual-hour comparisons

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 12-practice — Practice analytics and bookkeeping reports |
| Owner area | `practice` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Store budget hours by engagement phase/grade and approved budget versions.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T084 — Implement statutory-relative milestone planning](../07-planning/T084-milestones.md)
- [T141 — Approve time corrections and period submission](T141-time-approval.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R076** — Budget versus actual phase hours; source lines `569-569`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/practice/; apps/web features/practice; owned journals/billing/rates; tests

**Non-goals:** Practice is the sole posting owner; client audit AJEs never silently enter the firm ledger.

**Data or records:** engagement_budgets; budget_lines.
**Screen or user interaction:** Budget versus actual dashboard.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Store budget hours by engagement phase/grade and approved budget versions.
- [ ] Aggregate actual time without double-counting corrections or drafts excluded by policy.
- [ ] Provide variance tables and drill-down into underlying time entries.
- [ ] Separate schedule/capacity estimates from actual financial values.

## Acceptance criteria and required tests

- [ ] **AC1:** Phase totals reconcile to included time entries.
- [ ] **AC2:** Budget revision does not overwrite the earlier approved budget.
- [ ] **AC3:** Zero-budget variance has explicit display semantics.

Run real-PostgreSQL decimal, posting, reversal, allocation and reconciliation tests relevant to this change.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T142
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
