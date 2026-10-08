# T081 — Finalize an immutable TB version through real business gates

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 07-planning — Production Trial Balance and planning |
| Owner area | `fieldwork` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Replace proof-only wiring with operational planning and assigned-user guards.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T080 — Implement approved mapping memory and corrections](T080-mapping-memory.md)
- [T049 — Implement atomic batch mapping with expected versions](../04-tb-proof/T049-batch-mapping.md)
- [T028 — Implement guarded engagement transitions and state history](../02-security/T028-workflow-kernel.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R041** — Excel/CSV TB imports from source systems; source lines `487-489`.
- **R042** — Historical FSLI mapping memory; source lines `490-490`.
- **R043** — P/L top and B/S bottom dashboard; source lines `491-492`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/fieldwork/; apps/web features/fieldwork; owned data and tests

**Non-goals:** Keep imported evidence immutable; no unapproved sampling formulas, floating-point financial truth or hidden last-write-wins.

**Data or records:** tb_versions; engagement_accounts; mapping snapshots.
**Interface:** POST /tb-imports/:id/actions/finalize.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D16 (DN-04): finalization refuses a missing or changed statutory period. D18 (DN-06): at most one active finalized version per engagement; a new version is finalized only after an explicit, audited supersede command invalidates the approvals that cite the old version.

## Implementation checklist

- [ ] Replace proof-only wiring with operational planning and assigned-user guards.
- [ ] Commit immutable TB snapshot, mapped account balances, mapping versions and aggregate identity in one controlled operation.
- [ ] On subsequent imports create a new candidate version; finalization requires explicit supersession and identifies affected approvals.
- [ ] Persist reconciled totals and exact document/mapping sources.

## Acceptance criteria and required tests

- [ ] **AC1:** Finalization cannot bypass onboarding/planning authorization.
- [ ] **AC2:** A new TB version leaves the previous version queryable.
- [ ] **AC3:** Concurrent finalize commands select at most one active version.

Run relevant deterministic rule tests, real PostgreSQL race/lineage tests and the affected browser/editor flow.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T081
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
