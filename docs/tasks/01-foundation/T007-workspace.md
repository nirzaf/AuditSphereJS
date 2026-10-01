# T007 — Create a minimal pnpm workspace with explicit package ownership

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 01-foundation — Workspace and executable foundation |
| Owner area | `foundation` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create apps/api, apps/web, apps/worker, packages/server, packages/contracts and packages/testing.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T005 — Review every direct dependency and reconcile version evidence](../00-readiness/T005-dependency-review.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Root workspace files; apps/ composition; packages/ build/test config; affected tests

**Non-goals:** Do not implement unrelated business screens or add a monorepo orchestration framework.

**Data or records:** Workspace manifests, package exports and pnpm lockfile.

**Dependency focus:** Node; pnpm; TypeScript

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Create apps/api, apps/web, apps/worker, packages/server, packages/contracts and packages/testing.
- [ ] Put reusable backend modules in packages/server; API and worker compose these exports, and neither imports the other application entrypoint.
- [ ] Define package exports and workspace dependencies; add no generic repository framework or build orchestrator.
- [ ] Pin the selected Node and pnpm versions in checked-in tooling files; commit the initial lockfile.

## Acceptance criteria and required tests

- [ ] **AC1:** A clean checkout resolves workspace package imports without filesystem aliases into another app.
- [ ] **AC2:** The web dependency graph cannot import packages/server or Prisma.
- [ ] **AC3:** Exact direct dependency pins and packageManager are present.

Run pnpm typecheck, affected builds and the task-specific smoke tests; prove generated/compiled runtime works.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T007
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
