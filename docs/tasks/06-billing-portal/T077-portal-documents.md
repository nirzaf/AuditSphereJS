# T077 — Expose permitted commercial documents and audit portal isolation

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 06-billing-portal — Billing foundation and PBC portal |
| Owner area | `portal` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Expose issued invoices, receipts, holding letters and later released bundles through category-specific permissions.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T076 — Implement auditor review and mandatory rejection reasons](T076-pbc-review.md)
- [T072 — Generate and route immutable receipt vouchers](T072-receipts.md)
- [T034 — Implement scoped document downloads and delivery receipts](../03-platform/T034-downloads.md)
- [T002 — Resolve workflow and billing ambiguities without changing the source silently](../00-readiness/T002-business-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.
- **R019** — Automatic receipt and dispatch; source lines `427-427`.
- **R024** — Portal upload freeze on final report release; source lines `434-434`.
- **R067** — D3 LOR export, management signing and re-upload; source lines `544-544`.
- **R082** — Client closure restriction conflicts with released-bundle download path; source lines `64-64;324-328`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/portal or owning PBC service; apps/web features/pbc-portal; tests

**Non-goals:** Keep external identities and scope separate; never relax upload freeze to complete a happy-path demo.

**Screen or user interaction:** Portal commercial-document list and access-state page.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D02,D03

## Implementation checklist

- [ ] Expose issued invoices, receipts, holding letters and later released bundles through category-specific permissions.
- [ ] Implement approved post-release download and closure-access policy without conflating upload freeze and login termination.
- [ ] Add portal boundary tests across routes, APIs, document URLs and Socket.IO rooms.
- [ ] Record access changes and remove sensitive cached views on logout.

## Acceptance criteria and required tests

- [ ] **AC1:** Another client cannot access any commercial/evidence object by guessed ID.
- [ ] **AC2:** Post-release access follows the approved policy exactly.
- [ ] **AC3:** Internal workpaper links never appear in portal downloads.

Test first-reset/payment gates, cross-client denial, rejection reasons and in-flight upload/freeze races.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T077
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
