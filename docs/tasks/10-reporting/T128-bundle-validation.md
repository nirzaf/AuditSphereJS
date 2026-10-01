# T128 — Validate final package completeness and current approval lineage

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 10-reporting — Reporting and controlled release |
| Owner area | `reporting` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Check artifact hashes, signatures, correct client/period, current opinion/SRM/TB lineage and all release blockers.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T127 — Build the mandatory five-part deliverable package asynchronously](T127-bundle-build.md)
- [T116 — Implement mandatory Red-area review and partner SRM clearance](../09-review/T116-partner-clearance.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R066** — D2 deficiency-impact-recommendation management letter; source lines `543-543`.
- **R067** — D3 LOR export, management signing and re-upload; source lines `544-544`.
- **R068** — D4 correspondence and confirmation trail; source lines `545-545`.
- **R069** — D5 remaining 50% fee note; source lines `546-546`.
- **R061** — Critical confirmation blocks release and triggers holding letter; source lines `523-523`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/reporting/; apps/web features/reporting; owned snapshots and worker processors; tests

**Non-goals:** Use Practice final-fee facade; no stale SRM release, silent re-signing or partial bundle exposure.

**Interface:** GET package readiness; validate package action.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Check artifact hashes, signatures, correct client/period, current opinion/SRM/TB lineage and all release blockers.
- [ ] Verify signed LOR policy and all critical confirmations again.
- [ ] Produce an immutable readiness manifest and a useful blocker list.
- [ ] Distinguish document generation success from audit-release authorization.

## Acceptance criteria and required tests

- [ ] **AC1:** Wrong-client, stale or corrupted artifact prevents READY/approval.
- [ ] **AC2:** A newly reopened note/confirmation invalidates readiness.
- [ ] **AC3:** Every required release assertion has a negative test.

Test version-bound gates, evidence/signature identity, failure recovery and portal/archival boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T128
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
