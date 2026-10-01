# T039 — Implement owner-safe advisory edit leases

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `realtime` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Acquire expiring Redis leases atomically using random ownership tokens.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T038 — Implement authenticated Socket.IO rooms and safe reconnects](T038-realtime.md)
- [T027 — Persist idempotent operation outcomes in PostgreSQL](../02-security/T027-idempotency.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R046** — Concurrent FSLI work without lost updates; source lines `497-497`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/realtime/; apps/web realtime client; tests

**Non-goals:** Events are authorized hints; they do not replace database state or optimistic version checks.

**Interface:** POST /editing-leases; renew and release actions.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Acquire expiring Redis leases atomically using random ownership tokens.
- [ ] Compare tokens atomically when renewing or releasing; never delete a newly acquired replacement lease on stale release.
- [ ] Include scope in keys and authorize acquire/heartbeat/release; show owner and expiry in the client.
- [ ] Treat leases as advisory; do not call a random token a monotonic fencing number. Database versions remain mandatory.

## Acceptance criteria and required tests

- [ ] **AC1:** Old client cannot release another user's replacement lease.
- [ ] **AC2:** Expired lease never authorizes a stale database write.
- [ ] **AC3:** Redis outage disables presence gracefully without disabling database conflict checks.

Test auth/room isolation, lease ownership, reconnect and selected multi-replica transport behavior.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T039
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
