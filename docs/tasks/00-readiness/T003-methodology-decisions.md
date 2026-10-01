# T003 — Approve numerical, sampling and professional-judgment specifications

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 00-readiness — Requirements, decisions and compatibility |
| Owner area | `planning` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Define decimal scales, QAR rounding, signed-balance display, zero-PY variance and equality-at-TE/PM behavior as proposed engineering policies.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T001 — Preserve the requirements and inspect the implementation starting point](T001-baseline.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R032** — PBT materiality benchmark 5%-10%; source lines `468-469`.
- **R033** — Revenue benchmark 0.5%-2%; source lines `470-470`.
- **R034** — Assets benchmark 0.5%-1%; source lines `471-471`.
- **R035** — Equity/net-assets benchmark 1%-2%; source lines `472-472`.
- **R036** — Planning materiality formula; source lines `473-474`.
- **R037** — TE/performance-materiality range; source lines `475-475`.
- **R038** — SAD/trivial threshold range; source lines `476-476`.
- **R039** — Practical rounding within +/-5%; source lines `477-477`.
- **R040** — Green/Amber/Red stratification and required reviewers; source lines `478-481`.
- **R049** — Monetary Unit Sampling; source lines `503-503`.
- **R050** — Systematic Random Sampling; source lines `503-503`.
- **R051** — Stratified Attribute Sampling; source lines `503-503`.
- **R054** — Analytical review and mandatory going-concern checklist; source lines `507-507`.
- **R058** — AJEs, unadjusted differences, SAD/PM and estimates in SRM; source lines `517-517`.
- **R075** — Contracted fee minus charge-out-value calculation; source lines `565-567`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** docs/requirements/; docs/architecture/; docs/decisions/; dependency evidence

**Non-goals:** Planning only: no production commands or application behavior changes.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D05,D06,D07

## Implementation checklist

- [ ] Define decimal scales, QAR rounding, signed-balance display, zero-PY variance and equality-at-TE/PM behavior as proposed engineering policies.
- [ ] Obtain audit-methodology approval for rounding PM/TE/SAD, negative or zero benchmarks, risk overrides and clearly-trivial treatment; do not present percentage defaults as universal ISA rules.
- [ ] Specify the three sampling algorithms, population rules, sample-size inputs and golden examples before implementing calculators.
- [ ] Preserve the source charge-out metric; separately label that it is not necessarily actual payroll-cost profit.

## Acceptance criteria and required tests

- [ ] **AC1:** Approved golden examples cover boundary, zero, negative and rounding cases.
- [ ] **AC2:** Each sampling method has inputs, selection/evaluation rules and independently checked expected output.
- [ ] **AC3:** Missing professional approval blocks only the affected calculation feature.

Review source hashes, approvals, evidence links and unresolved blockers. No fabricated test output.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T003
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
