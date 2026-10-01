# T018 — Implement firm, client and engagement ownership constraints

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `identity` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Model one firm boundary initially with explicit firm_id on tenant-owned roots, client entities and engagement membership.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T017 — Freeze the executable compatibility baseline before domain work](../01-foundation/T017-compatibility-smoke.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R001** — No per-file licensing caps; capacity remains bounded by infrastructure; source lines `42-45`.
- **R002** — Five connected business modules; source lines `68-129`.
- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.
- **R008** — Holdings, subsidiaries and affiliates; source lines `393-393`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/auth and authorization; identity tables; apps/web auth; tests

**Non-goals:** No automatic partner privileges from system administrator or external directory roles.

**Data or records:** firms; clients; engagements; memberships; scoped foreign keys.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Model one firm boundary initially with explicit firm_id on tenant-owned roots, client entities and engagement membership.
- [ ] Use composite ownership keys/foreign keys where cross-client references could be created; UUID unpredictability is not authorization.
- [ ] Provide scoped query helpers for API and worker use cases without an unscoped bypass.
- [ ] Add cross-firm, cross-client and cross-engagement negative fixtures.

## Acceptance criteria and required tests

- [ ] **AC1:** A valid UUID from another engagement cannot be read or attached.
- [ ] **AC2:** Worker queries require an explicit authorized scope.
- [ ] **AC3:** No artificial per-file quota is added.

Test valid/invalid/expired credentials and cross-firm/client/engagement access through actual API boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T018
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
