# T138 — Verify archive deadlines, races and provider failure recovery

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 11-archive — Archive, retention and inspection |
| Owner area | `testing` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Run deadline, early-lock, stale-job, provider-timeout and missing-artifact scenarios.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T137 — Define controlled post-release corrections without rewriting history](T137-archive-corrections.md)
- [T135 — Implement partner-authorized early archive lock](T135-early-lock.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R024** — Portal upload freeze on final report release; source lines `434-434`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.
- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.
- **R072** — Timestamped immutable audit events; source lines `552-552`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Relevant test suites, representative fixtures and evidence; minimal associated fixes

**Non-goals:** Do not weaken source invariants to make a test pass or rewrite unrelated modules.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D31; also check the decision register for any other applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Run deadline, early-lock, stale-job, provider-timeout and missing-artifact scenarios.
- [ ] Attempt mutations through every API, background job, bulk endpoint and storage credentials.
- [ ] Verify uploading immediately before release/deadline cannot attach after freeze.
- [ ] Record real-provider retention evidence separately from local integration results.

## Acceptance criteria and required tests

- [ ] **AC1:** Every mutation path enforces freeze.
- [ ] **AC2:** Partial storage lock remains visible and retry-safe.
- [ ] **AC3:** Application read-only and provider retention assurance are reported separately.

Run exact documented scenarios on real selected services; record fixture sizes, versions and observed outcomes.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T138
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
