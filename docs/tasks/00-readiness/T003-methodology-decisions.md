# T003 — Approve numerical, sampling and professional-judgment specifications

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `DONE` |
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

- [x] Define decimal scales, QAR rounding, signed-balance display, zero-PY variance and equality-at-TE/PM behavior as approved implementation policies.
- [x] Record D05–D07 approval under the user's delegation; clearly distinguish it from external professional assurance and do not present percentage defaults as universal ISA rules.
- [x] Specify the three sampling algorithms, population rules, sample-size inputs, evaluation limits and hand-calculated golden examples before implementing calculators.
- [x] Preserve the source charge-out metric; label it as contracted-fee less charge-out value, not actual payroll-cost profit.

## Acceptance criteria and required tests

- [x] **AC1:** `docs/decisions/T003-methodology-golden.json` covers TE/PM/SAD equality, significant-risk override, zero/negative benchmark, QAR half-even display and zero-PY behavior.
- [x] **AC2:** The fixture covers inputs and selection rules for MUS, Systematic Random and Stratified Attribute; outputs are hand-calculated separately from runtime implementation and do not assert unimplemented code behavior.
- [x] **AC3:** User-delegated implementation approval is recorded. Independent professional acceptance remains a release/UAT gate; no current implementation is represented as independently certified.

Review source hashes, approvals, evidence links and unresolved blockers. No fabricated test output.

**Implementation evidence:** [T003 decision](../../decisions/T003-methodology-defaults.md), [golden fixture](../../decisions/T003-methodology-golden.json), and [handoff](../../evidence/T003/handoff.md). Runtime behavior remains incomplete as itemized in the decision record; downstream implementation tasks retain those gaps.

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
