# T070 — Issue the advance invoice alongside the approved letter

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 06-billing-portal — Billing foundation and PBC portal |
| Owner area | `commercial` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Issue 50% of the approved contracted fee through Billing using the letter/gate snapshot.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T069 — Implement canonical invoices, numbering and billing ownership](T069-invoice-foundation.md)
- [T065 — Generate partner-authorized engagement letters](../05-commercial/T065-letter.md)
- [T030 — Implement a durable outbox with operation reconciliation](../03-platform/T030-outbox.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R017** — 50% advance invoice alongside letter; source lines `423-425`.
- **R080** — Advance must clear before client portal activation; source lines `588-592`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/commercial/; apps/web features/commercial; owned data; related contracts/tests

**Non-goals:** Use Governance acceptance and Practice billing facades; never add duplicate canonical approvals or ledgers.

**Interface:** POST /engagements/:id/actions/issue-advance-package.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Issue 50% of the approved contracted fee through Billing using the letter/gate snapshot.
- [ ] Coordinate business records transactionally and document generation through durable jobs.
- [ ] Mark billing/document status accurately when rendering or sending is pending.
- [ ] Do not activate the portal merely because an invoice exists.

## Acceptance criteria and required tests

- [ ] **AC1:** EL/advance billing cannot bypass dual-key clearance.
- [ ] **AC2:** Rounding total across both milestones never exceeds the agreed fee.
- [ ] **AC3:** A render failure is visible without generating a duplicate invoice.

Run relevant command/API/UI tests including role restrictions, state gates, versioning and duplicate requests.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T070
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
