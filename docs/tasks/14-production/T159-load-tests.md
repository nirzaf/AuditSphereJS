# T159 — Measure full-stack load and resource budgets

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 14-production — Production verification, migration and release |
| Owner area | `testing` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Run approved mixed workloads: TB parsing, grid edits, review queries, portal uploads and PDF workers concurrently.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T157 — Run the complete source lifecycle through real application boundaries](T157-full-journey.md)
- [T051 — Measure the TB slice and freeze its interaction contract](../04-tb-proof/T051-tb-proof-gate.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R001** — No per-file licensing caps; capacity remains bounded by infrastructure; source lines `42-45`.
- **R041** — Excel/CSV TB imports from source systems; source lines `487-489`.
- **R043** — P/L top and B/S bottom dashboard; source lines `491-492`.
- **R046** — Concurrent FSLI work without lost updates; source lines `497-497`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Relevant test suites, representative fixtures and evidence; minimal associated fixes

**Non-goals:** Do not weaken source invariants to make a test pass or rewrite unrelated modules.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Run approved mixed workloads: TB parsing, grid edits, review queries, portal uploads and PDF workers concurrently.
- [ ] Record API p95/p99, browser responsiveness, event-loop lag, memory, queue age and database connections.
- [ ] Use representative concurrency from stakeholder capacity assumptions, not invented users-per-second guarantees.
- [ ] Fix measured bottlenecks first; rerun deterministic correctness checks after performance changes.

## Acceptance criteria and required tests

- [ ] **AC1:** Approved workload meets signed-off latency/resource budgets.
- [ ] **AC2:** Batch conflicts and financial totals remain correct under load.
- [ ] **AC3:** No unbounded payload or query path emerges.

Run exact documented scenarios on real selected services; record fixture sizes, versions and observed outcomes.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T159
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
