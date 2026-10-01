# T049 — Implement atomic batch mapping with expected versions

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 04-tb-proof — Trial Balance technical proof |
| Owner area | `fieldwork` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Accept at most the approved batch bound of row ID, expectedVersion and target FSLI; reject duplicate row IDs.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T048 — Add keyboard editing, selection, clipboard and local undo](T048-grid-keyboard.md)
- [T024 — Share one transaction across module-owned business operations](../02-security/T024-transaction-context.md)
- [T027 — Persist idempotent operation outcomes in PostgreSQL](../02-security/T027-idempotency.md)
- [T039 — Implement owner-safe advisory edit leases](../03-platform/T039-leases.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R042** — Historical FSLI mapping memory; source lines `490-490`.
- **R046** — Concurrent FSLI work without lost updates; source lines `497-497`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/fieldwork/; apps/web features/fieldwork; owned data and tests

**Non-goals:** Keep imported evidence immutable; no unapproved sampling formulas, floating-point financial truth or hidden last-write-wins.

**Data or records:** Versioned staged mappings; durable operation result.
**Interface:** POST /tb-imports/:id/actions/batch-map.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Accept at most the approved batch bound of row ID, expectedVersion and target FSLI; reject duplicate row IDs.
- [ ] Authorize each row and lock/update in stable order within one transaction.
- [ ] Return all conflicts without partial mutation when any expected version is stale; persist idempotent result and audit changes.
- [ ] Merge response versions into Angular while preserving unrelated local dirty cells.

## Acceptance criteria and required tests

- [ ] **AC1:** Two editors racing one row yield one success and one conflict without lost data.
- [ ] **AC2:** A stale row makes the all-or-nothing batch roll back.
- [ ] **AC3:** Retrying the same request after a lost response returns the original outcome.

Run relevant deterministic rule tests, real PostgreSQL race/lineage tests and the affected browser/editor flow.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T049
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
