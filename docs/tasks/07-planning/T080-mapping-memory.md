# T080 — Implement approved mapping memory and corrections

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 07-planning — Production Trial Balance and planning |
| Owner area | `fieldwork` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Persist client-specific rule confirmations and historical mapping provenance.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T079 — Validate TB balance, account identity and period controls](T079-tb-validation.md)
- [T046 — Implement deterministic mapping suggestions with provenance](../04-tb-proof/T046-mapping-prototype.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R042** — Historical FSLI mapping memory; source lines `490-490`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/fieldwork/; apps/web features/fieldwork; owned data and tests

**Non-goals:** Keep imported evidence immutable; no unapproved sampling formulas, floating-point financial truth or hidden last-write-wins.

**Screen or user interaction:** Mapping review and rule history.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D17 (DN-05, resolved 2026-10-08): mapping memory is client-scoped only. Firm-global suggestions are not offered until a separate firm approval exists, and every suggestion names its source approval.

## Implementation checklist

- [ ] Persist client-specific rule confirmations and historical mapping provenance.
- [ ] Allow authorized manual correction and a preview of impacted staged rows.
- [ ] Keep firm-global rules separately approved and never leak source client details.
- [ ] Changing a rule affects future suggestions, not finalized past TBs.

## Acceptance criteria and required tests

- [ ] **AC1:** Prior-year mapping is suggested with a traceable origin.
- [ ] **AC2:** Revised rule does not alter a historical engagement.
- [ ] **AC3:** Manual override requires authorization and audit reason when configured.

Run relevant deterministic rule tests, real PostgreSQL race/lineage tests and the affected browser/editor flow.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T080
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
