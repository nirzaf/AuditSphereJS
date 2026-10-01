# T051 — Measure the TB slice and freeze its interaction contract

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 04-tb-proof — Trial Balance technical proof |
| Owner area | `gate` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Run upload, parse, grid navigation, batch save, conflict and aggregation tests on all three synthetic sizes.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T050 — Prove finalization and FSLI aggregation on synthetic data](T050-tb-summary-proof.md)
- [T014 — Wire minimal backend, Angular and browser test runners](../01-foundation/T014-test-runners.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R041** — Excel/CSV TB imports from source systems; source lines `487-489`.
- **R042** — Historical FSLI mapping memory; source lines `490-490`.
- **R043** — P/L top and B/S bottom dashboard; source lines `491-492`.
- **R044** — CY/PY balances and percentage variance; source lines `493-493`.
- **R046** — Concurrent FSLI work without lost updates; source lines `497-497`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Compatibility/proof scripts; evidence documents; fixes limited to failing prerequisite scope

**Non-goals:** Do not proceed on an unverified library or mask incompatibility using forced peers/suppressed tests.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Run upload, parse, grid navigation, batch save, conflict and aggregation tests on all three synthetic sizes.
- [ ] Record p50/p95 latency, memory, event-loop lag, query counts and dataset/hardware identities.
- [ ] Test two clients, two editors, a worker restart and Redis outage during editing.
- [ ] Compare measured results with approved budgets; revise only the demonstrated bottleneck before approving reuse.

## Acceptance criteria and required tests

- [ ] **AC1:** Benchmark evidence contains measured values, not promised frame rates.
- [ ] **AC2:** Correctness/isolation tests pass at the largest approved size.
- [ ] **AC3:** No business workflow bypass introduced for the proof reaches production.

Run every stated gate in the intended target; BLOCKED is the correct result when evidence is missing.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T051
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
