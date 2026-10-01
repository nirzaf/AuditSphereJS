# T012 — Add typed configuration and secret-safe environment separation

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 01-foundation — Workspace and executable foundation |
| Owner area | `platform` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Validate configuration from environment with one schema and explicit development/test/production modes.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T009 — Bootstrap NestJS with the matched Fastify adapter](T009-api-shell.md)
- [T011 — Configure Prisma and PostgreSQL with explicit pool limits](T011-database.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/ relevant capability; packages/contracts/; related tests

**Non-goals:** Add the minimum shared mechanism; do not centralize every business rule in a platform service.

**Data or records:** Environment schema; sample env; secret-provider interface.

**Dependency focus:** Zod; selected Nest configuration helper only if necessary

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Validate configuration from environment with one schema and explicit development/test/production modes.
- [ ] Isolate database, Redis, object-storage, signing and provider credentials; never put them in Angular environment files.
- [ ] Fail closed for missing production authentication/provider configuration; development bypasses are test-only.
- [ ] Add example configuration with placeholders but no usable credentials and a redaction test.

## Acceptance criteria and required tests

- [ ] **AC1:** Invalid production configuration stops startup.
- [ ] **AC2:** Test modes cannot be enabled accidentally in a production build.
- [ ] **AC3:** Logs and error responses do not expose connection strings or tokens.

Run focused unit plus real-service integration tests for affected contracts, transactions and failure behavior.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T012
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
