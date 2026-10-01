# T011 — Configure Prisma and PostgreSQL with explicit pool limits

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 01-foundation — Workspace and executable foundation |
| Owner area | `database` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create the version-appropriate Prisma configuration, explicit generated-client output and PostgreSQL driver adapter.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T008 — Make backend ESM builds and decorator injection testable](T008-esm.md)
- [T006 — Select deployment targets, storage and external-provider boundaries](../00-readiness/T006-deployment-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** prisma/ configuration and reviewed migrations; packages/server/ owning persistence; integration tests

**Non-goals:** No production db push, destructive cleanup, unscoped reads or unrelated schema changes.

**Data or records:** firm; users skeleton; engagements skeleton; Prisma configuration.

**Dependency focus:** Prisma/client/adapter-pg; pg; @types/pg

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Create the version-appropriate Prisma configuration, explicit generated-client output and PostgreSQL driver adapter.
- [ ] Pin CLI, client and adapter to the same selected Prisma release family; set pool maximums and connection/query timeouts for API and workers.
- [ ] Separate migration, application and reporting database roles; enable verified TLS outside local development.
- [ ] Create a minimal firm/engagement fixture schema and a migration smoke test against PostgreSQL 18.6 or the approved replacement.

## Acceptance criteria and required tests

- [ ] **AC1:** An empty database migrates and round-trips a NUMERIC value without precision loss.
- [ ] **AC2:** API plus worker connection budgets stay below the server limit.
- [ ] **AC3:** Runtime credentials cannot perform DDL.

Use the selected real PostgreSQL image and runtime grants. Test migration, rollback behavior, precision and race cases.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T011
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
