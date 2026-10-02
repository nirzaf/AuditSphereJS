# T013 — Provision reproducible local data services and test containers

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `IN_REVIEW` — PostgreSQL/Redis/Mailpit Testcontainers and image-digest checks pass; T006 deployment and backup/recovery decisions remain open |
| Execution class | `CORE` |
| Phase | 01-foundation — Workspace and executable foundation |
| Owner area | `infrastructure` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create dependency-only local Compose services for PostgreSQL, queue Redis, object storage emulator and test mail sink.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T006 — Select deployment targets, storage and external-provider boundaries](../00-readiness/T006-deployment-decisions.md)
- [T011 — Configure Prisma and PostgreSQL with explicit pool limits](T011-database.md)
- [T012 — Add typed configuration and secret-safe environment separation](T012-configuration.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. The following domain tasks cannot begin until [the executable compatibility gate](T017-compatibility-smoke.md) passes. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** infra/; CI workflows; scripts/; deployment/test documentation

**Non-goals:** Do not expose secrets to PR code or execute production deployment without separate authorization.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Docker/Compose; Testcontainers; approved data-service images

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Create dependency-only local Compose services for PostgreSQL, queue Redis, object storage emulator and test mail sink.
- [ ] Pin images by version and capture immutable digests in release evidence; keep volumes isolated by project/test run.
- [ ] Configure Redis persistence and noeviction; do not use an eviction cache configuration for queues.
- [ ] Create Testcontainers helpers using the actual PostgreSQL and Redis lines selected for production.

## Acceptance criteria and required tests

- [ ] **AC1:** Local startup and teardown are documented and repeatable without deleting user data.
- [ ] **AC2:** Concurrent test runs use isolated databases/buckets.
- [ ] **AC3:** Redis and PostgreSQL versions are asserted by smoke tests.

Execute isolated environment/container smoke checks; record versions, logs, image identities and actual recovery results.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T013
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.

## Current partial evidence

`pnpm verify:task -- T013` passed on 2026-10-02: the PostgreSQL 18.6 Testcontainers integration asserts its actual `server_version`; two concurrently started Redis 8.10 Testcontainers instances assert distinct mapped ports, actual Redis 8.10.x version, `noeviction` and AOF enabled; and a digest-pinned Mailpit container accepts a synthetic SMTP message without external delivery. Compose and test containers now pin all three Linux/amd64 images by version and immutable digest. See [the focused evidence](../../evidence/T013/testcontainers-2026-10-02.md). T013 remains in review because T006 production-region and backup/recovery decisions remain open.

Local startup and non-destructive shutdown instructions are in the [local services runbook](../../runbooks/local-services.md).
