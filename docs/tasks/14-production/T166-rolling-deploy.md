# T166 — Rehearse rolling deployment, realtime reconnect and worker drains

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 14-production — Production verification, migration and release |
| Owner area | `infrastructure` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Implement staging deployment with expand-first migrations and compatibility between old/new processes.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T165 — Build immutable API, web and worker release artifacts](T165-deployment-artifacts.md)
- [T160 — Prove outage recovery and durable-operation reconciliation](T160-failure-drills.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R024** — Portal upload freeze on final report release; source lines `434-434`.
- **R046** — Concurrent FSLI work without lost updates; source lines `497-497`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** infra/; CI workflows; scripts/; deployment/test documentation

**Non-goals:** Do not expose secrets to PR code or execute production deployment without separate authorization.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Implement staging deployment with expand-first migrations and compatibility between old/new processes.
- [ ] Drain API traffic, reconnect sockets and stop workers at safe boundaries; shared-state auth must not rely on local process memory.
- [ ] Verify sticky-session or WebSocket-only proxy configuration for the selected Socket.IO transport.
- [ ] Run affected-feature smoke checks and capture rollback to the previous application artifact.

## Acceptance criteria and required tests

- [ ] **AC1:** Rolling update preserves authorization and version-conflict behavior.
- [ ] **AC2:** Inflight jobs complete or recover without duplicates.
- [ ] **AC3:** Rollback instructions explicitly exclude automatic undo of data migrations.

Execute isolated environment/container smoke checks; record versions, logs, image identities and actual recovery results.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T166
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
