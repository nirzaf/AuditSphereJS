# T164 — Rehearse legacy import and reconciliation in isolation

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CONDITIONAL` |
| Phase | 14-production — Production verification, migration and release |
| Owner area | `migration` |
| Completion unit | One focused, reviewable change and its evidence |

> Conditional on a real legacy system being in migration scope. Greenfield work needs an approved `NOT_APPLICABLE` record, not invented migration results.

## Outcome

Build repeatable import scripts only for the approved legacy mapping and run in a disposable target.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T163 — Inventory legacy data and map it without authorizing a rewrite](T163-migration-inventory.md)
- [T162 — Perform PostgreSQL and object-store restore drills](T162-backup-restore.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.
- **R041** — Excel/CSV TB imports from source systems; source lines `487-489`.
- **R058** — AJEs, unadjusted differences, SAD/PM and estimates in SRM; source lines `517-517`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R072** — Timestamped immutable audit events; source lines `552-552`.
- **R078** — Firm TB, monthly P/L and client AR aging; source lines `578-578`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Dedicated migration tools; mapping/reconciliation evidence; isolated target tests

**Non-goals:** Read source only until explicit cutover authorization; do not remove a working system to satisfy a plan.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Build repeatable import scripts only for the approved legacy mapping and run in a disposable target.
- [ ] Preserve source IDs/hashes and original approvals as historical provenance; do not fabricate new signatures.
- [ ] Reconcile counts, financial totals, evidence hashes and state transitions.
- [ ] Produce cutover delta/freeze and rollback plans without executing production writes.

## Acceptance criteria and required tests

- [ ] **AC1:** Import is repeatable with no duplicate identities or postings.
- [ ] **AC2:** Source and target totals/counts reconcile or list explicit exceptions.
- [ ] **AC3:** All migration output retains source provenance.

Rehearse against isolated data, reconcile counts/hashes/totals and capture explicit approved exceptions.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T164
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
