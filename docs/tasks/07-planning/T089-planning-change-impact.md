# T089 — Handle new TB/materiality versions after sign-off safely

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 07-planning — Production Trial Balance and planning |
| Owner area | `governance` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create an explicit supersede/reassess command rather than editing approved versions.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T088 — Approve version-bound planning and unlock fieldwork](T088-planning-approval.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R036** — Planning materiality formula; source lines `473-474`.
- **R042** — Historical FSLI mapping memory; source lines `490-490`.
- **R058** — AJEs, unadjusted differences, SAD/PM and estimates in SRM; source lines `517-517`.
- **R059** — Partner review of Red areas and SRM; source lines `518-518`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/governance/; apps/web features/governance; owned data; related tests

**Non-goals:** Preserve approved method/template versions and require professional decisions for undefined rules.

**Interface:** Planning supersede and impact-preview actions.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D18 (DN-06): superseding a finalized version invalidates the approvals that cite it. Invalidation is append-only (`MaterialityInvalidation`), and the planning gate refuses an invalidated approval.

## Implementation checklist

- [ ] Create an explicit supersede/reassess command rather than editing approved versions.
- [ ] Identify affected FSLIs, risk routing, sampling, workprogram conclusions and SRM/report snapshots.
- [ ] Mark approvals stale and reopen only the necessary workflow stages with reasons.
- [ ] Prevent changes to frozen released/archived evidence except the approved controlled correction path.

## Acceptance criteria and required tests

- [ ] **AC1:** Changed TB version invalidates downstream version-bound approvals.
- [ ] **AC2:** Unaffected historical evidence stays readable.
- [ ] **AC3:** Archived engagement rejects normal reassessment mutations.

Use approved numerical/checklist examples; test unauthorized sign-off, stale inputs and transition gates.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T089
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
