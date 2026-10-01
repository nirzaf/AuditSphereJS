# T102 — Capture sample exceptions and controlled procedure conclusions

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 08-fieldwork — Workprograms, evidence and sampling |
| Owner area | `fieldwork` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Attach test outcomes/evidence to selected items without changing the original sample.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T099 — Implement Monetary Unit Sampling using approved golden examples](T099-sampling-mus.md)
- [T100 — Implement Systematic Random Sampling](T100-sampling-systematic.md)
- [T101 — Implement Stratified Attribute Sampling](T101-sampling-stratified.md)
- [T094 — Link exact digital evidence versions to workpaper steps](T094-evidence-digital.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R049** — Monetary Unit Sampling; source lines `503-503`.
- **R050** — Systematic Random Sampling; source lines `503-503`.
- **R051** — Stratified Attribute Sampling; source lines `503-503`.
- **R055** — Preparer execution and submission; source lines `509-511`.
- **R058** — AJEs, unadjusted differences, SAD/PM and estimates in SRM; source lines `517-517`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/fieldwork/; apps/web features/fieldwork; owned data and tests

**Non-goals:** Keep imported evidence immutable; no unapproved sampling formulas, floating-point financial truth or hidden last-write-wins.

**Data or records:** sample_results; exception links.
**Screen or user interaction:** Sample testing results and exceptions.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Attach test outcomes/evidence to selected items without changing the original sample.
- [ ] Record exceptions, observed differences, projected results only under approved method and reviewer commentary.
- [ ] Link material issues to audit adjustments or review notes via explicit actions.
- [ ] Invalidate completion when required sampled items remain untested.

## Acceptance criteria and required tests

- [ ] **AC1:** Untested mandatory sample items block submission.
- [ ] **AC2:** An exception cannot vanish by replacing the sample population.
- [ ] **AC3:** Projection calculations match approved method fixtures.

Run relevant deterministic rule tests, real PostgreSQL race/lineage tests and the affected browser/editor flow.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T102
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
