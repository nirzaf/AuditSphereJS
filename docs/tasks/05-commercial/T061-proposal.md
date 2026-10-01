# T061 — Implement the comprehensive proposal document

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 05-commercial — Commercial and acceptance onboarding |
| Owner area | `commercial` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Assemble firm profile/history/registrations, partner/team CVs, industry credentials, audit methodology and fee/milestone sections.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T060 — Implement the brief quotation and fee-term model](T060-quote.md)
- [T036 — Build versioned document templates and approved assets](../03-platform/T036-template-catalog.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R011** — Comprehensive proposal with all five content blocks; source lines `402-407`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/commercial/; apps/web features/commercial; owned data; related contracts/tests

**Non-goals:** Use Governance acceptance and Practice billing facades; never add duplicate canonical approvals or ledgers.

**Screen or user interaction:** Comprehensive proposal builder and PDF preview.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Assemble firm profile/history/registrations, partner/team CVs, industry credentials, audit methodology and fee/milestone sections.
- [ ] Select only approved asset versions and maintain their source IDs in the proposal snapshot.
- [ ] Provide section-level preview/editing for authorized staff without enabling arbitrary template execution.
- [ ] Generate a paginated professional document in the existing PDF worker.

## Acceptance criteria and required tests

- [ ] **AC1:** All five required proposal content blocks appear in the output.
- [ ] **AC2:** Missing team CV or required registration is reported before dispatch.
- [ ] **AC3:** Regeneration of the same snapshot retains semantic content and provenance.

Run relevant command/API/UI tests including role restrictions, state gates, versioning and duplicate requests.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T061
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
