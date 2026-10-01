# T015 — Expose predictable agent verification and dependency-boundary commands

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 01-foundation — Workspace and executable foundation |
| Owner area | `foundation` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Implement the command contract from the guide: dev, build, typecheck, test:unit, test:integration, test:e2e, verify:task and verify:all.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T014 — Wire minimal backend, Angular and browser test runners](T014-test-runners.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Root workspace files; apps/ composition; packages/ build/test config; affected tests

**Non-goals:** Do not implement unrelated business screens or add a monorepo orchestration framework.

**Data or records:** Root package scripts; dependency rules; task-check configuration.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Implement the command contract from the guide: dev, build, typecheck, test:unit, test:integration, test:e2e, verify:task and verify:all.
- [ ] Make verify:task consume a task ID and run its recorded tests plus relevant compile/contract checks; use simple changed-path mapping, not a custom orchestration framework.
- [ ] Add lint rules prohibiting web-to-server imports, private cross-module mutations and direct app-entrypoint imports.
- [ ] Document exact commands and exit codes; commands must not reset non-test data.

## Acceptance criteria and required tests

- [ ] **AC1:** All documented commands exist and fail with nonzero exit on actual errors.
- [ ] **AC2:** A forbidden module import is caught.
- [ ] **AC3:** A task with missing test evidence cannot be marked verified.

Run pnpm typecheck, affected builds and the task-specific smoke tests; prove generated/compiled runtime works.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T015
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
