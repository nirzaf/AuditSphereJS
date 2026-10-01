# T041 — Add operational metrics, redaction and dependency health

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `observability` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Propagate correlation IDs across HTTP, outbox, worker, storage and provider operations.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T031 — Configure BullMQ workers for reliable retries and shutdown](T031-queue-runtime.md)
- [T040 — Implement durable deadline scanning and maintenance claims](T040-scheduler.md)
- [T038 — Implement authenticated Socket.IO rooms and safe reconnects](T038-realtime.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.
- **R072** — Timestamped immutable audit events; source lines `552-552`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/observability/; health/metrics; operational documentation

**Non-goals:** Do not log credentials or sensitive evidence bodies, or add unused telemetry stacks.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Built-in logging; optional version-reviewed OpenTelemetry packages

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Propagate correlation IDs across HTTP, outbox, worker, storage and provider operations.
- [ ] Record queue age, failures, event-loop lag, DB pool occupancy and API latency without high-cardinality personal labels.
- [ ] Provide readiness behavior for degraded optional services and actionable startup/queue alerts.
- [ ] Keep observability packages lightweight; use native Nest logging initially and add reviewed OpenTelemetry exporters only as required.

## Acceptance criteria and required tests

- [ ] **AC1:** A test job can be followed from command to outcome using one correlation ID.
- [ ] **AC2:** Tokens and sensitive evidence are absent from logs.
- [ ] **AC3:** Dependency outages produce actionable alerts rather than false success.

Verify correlation across API/job paths, redaction and realistic dependency-failure health behavior.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T041
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
