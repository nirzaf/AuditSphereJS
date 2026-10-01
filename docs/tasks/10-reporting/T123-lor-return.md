# T123 — Receive and verify signed management representation before freeze

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 10-reporting — Reporting and controlled release |
| Owner area | `reporting` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Link the signed client return to the issued LOR and record signatory/date verification by authorized staff.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T122 — Generate D3 LOR for client letterhead and signature](T122-lor-draft.md)
- [T075 — Attach and re-upload evidence through PBC request controls](../06-billing-portal/T075-pbc-upload.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R067** — D3 LOR export, management signing and re-upload; source lines `544-544`.
- **R024** — Portal upload freeze on final report release; source lines `434-434`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/reporting/; apps/web features/reporting; owned snapshots and worker processors; tests

**Non-goals:** Use Practice final-fee facade; no stale SRM release, silent re-signing or partial bundle exposure.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D03,D08

## Implementation checklist

- [ ] Link the signed client return to the issued LOR and record signatory/date verification by authorized staff.
- [ ] Reject a return for another period/client and preserve any rejected version.
- [ ] Enforce the approved release gate without opening generic uploads after freeze.
- [ ] For exceptions use a specifically authorized controlled channel defined by policy, not a hidden bypass.

## Acceptance criteria and required tests

- [ ] **AC1:** A signed return is traceable to the issued representation version.
- [ ] **AC2:** Wrong-period or unverifiable signatures cannot satisfy the gate.
- [ ] **AC3:** Freeze behavior remains consistent with the approved decision.

Test version-bound gates, evidence/signature identity, failure recovery and portal/archival boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T123
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
