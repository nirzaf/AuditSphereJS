# T001 — Preserve the requirements and inspect the implementation starting point

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 00-readiness — Requirements, decisions and compatibility |
| Owner area | `planning` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Copy the supplied CURRENT requirements unchanged into docs/requirements/CURRENT.md; record its SHA-256 and source version.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- No earlier task. Begin with the supplied source documents.

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R001** — No per-file licensing caps; capacity remains bounded by infrastructure; source lines `42-45`.
- **R002** — Five connected business modules; source lines `68-129`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** docs/requirements/; docs/architecture/; docs/decisions/; dependency evidence

**Non-goals:** Planning only: no production commands or application behavior changes.

**Data or records:** docs/requirements/CURRENT.md; docs/architecture/starting-point.md.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Copy the supplied CURRENT requirements unchanged into docs/requirements/CURRENT.md; record its SHA-256 and source version.
- [ ] Inspect the target repository read-only and record whether work is greenfield, additive replacement, or migration from the stated .NET stack. Do not assume the prior plan describes deployed code.
- [ ] Assign the R001-R082 coverage IDs without changing source wording; inventory existing tests and reusable data contracts.
- [ ] Record explicit non-goals: no microservices, ERP runtime, forced rewrite, malware-scanning subsystem, or automatic tenant administration.

## Acceptance criteria and required tests

- [ ] **AC1:** Source hash matches the supplied file.
- [ ] **AC2:** A starting-point inventory identifies real files and unknowns rather than asserting implementation status.
- [ ] **AC3:** No existing code or data is removed.

Review source hashes, approvals, evidence links and unresolved blockers. No fabricated test output.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T001
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
