# T002 — Resolve workflow and billing ambiguities without changing the source silently

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 00-readiness — Requirements, decisions and compatibility |
| Owner area | `planning` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Record D01-D12 from the decision register, with source references, proposed interpretation, owner and status.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T001 — Preserve the requirements and inspect the implementation starting point](T001-baseline.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R010** — Brief quotation and 50/50 payment terms; source lines `399-401`.
- **R020** — Isolated portal and temporary credentials; source lines `428-430`.
- **R024** — Portal upload freeze on final report release; source lines `434-434`.
- **R027** — Partner risk acceptance blocks operational planning; source lines `446-446`.
- **R067** — D3 LOR export, management signing and re-upload; source lines `544-544`.
- **R069** — D5 remaining 50% fee note; source lines `546-546`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.
- **R080** — Advance must clear before client portal activation; source lines `588-592`.
- **R082** — Client closure restriction conflicts with released-bundle download path; source lines `64-64;324-328`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** docs/requirements/; docs/architecture/; docs/decisions/; dependency evidence

**Non-goals:** Planning only: no production commands or application behavior changes.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D01,D02,D03,D04

## Implementation checklist

- [ ] Record D01-D12 from the decision register, with source references, proposed interpretation, owner and status.
- [ ] Resolve the final-50% trigger: quotation says draft report while release workflow says final bundle. Define one invoice business key regardless of trigger.
- [ ] Resolve portal closure versus continued downloads, and signed LOR return versus upload freeze.
- [ ] Resolve acceptance-before-letter versus the later governance module: one review record, referenced twice, not two independent approvals.
- [ ] Keep affected production transitions blocked until their decisions are approved; permit unrelated foundation work.

## Acceptance criteria and required tests

- [ ] **AC1:** Each conflict remains visible with both source references.
- [ ] **AC2:** No unapproved default is represented as a requirement.
- [ ] **AC3:** Automated gate tests can distinguish pending policy from an ordinary validation failure.

Review source hashes, approvals, evidence links and unresolved blockers. No fabricated test output.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T002
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
