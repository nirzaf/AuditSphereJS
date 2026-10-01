# T058 — Implement recurring-client continuance and prior-year checks

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 05-commercial — Commercial and acceptance onboarding |
| Owner area | `governance` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Load prior-year engagement and current unpaid-fee facts through owner queries.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T056 — Implement acceptance and continuance questionnaire templates](T056-risk-templates.md)
- [T057 — Implement new-client risk review and independence evidence](T057-acceptance.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R026** — Recurring client continuance checks; source lines `444-445`.
- **R027** — Partner risk acceptance blocks operational planning; source lines `446-446`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/governance/; apps/web features/governance; owned data; related tests

**Non-goals:** Preserve approved method/template versions and require professional decisions for undefined rules.

**Screen or user interaction:** Continuance review and prior-year comparison.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Load prior-year engagement and current unpaid-fee facts through owner queries.
- [ ] Record management/shareholding changes, new facilities, litigation and fraud/regulatory matters as a delta review.
- [ ] Preserve prior review snapshots while creating the current-year review.
- [ ] Require current partner approval; prior-year clearance cannot unlock a new engagement.

## Acceptance criteria and required tests

- [ ] **AC1:** Prior fees and current-year changes are visible and traceable.
- [ ] **AC2:** Current engagement cannot reuse a prior approval token.
- [ ] **AC3:** Missing prior-year data is explicit rather than filled with assumptions.

Use approved numerical/checklist examples; test unauthorized sign-off, stale inputs and transition gates.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T058
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
