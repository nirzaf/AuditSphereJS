# T038 — Implement authenticated Socket.IO rooms and safe reconnects

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `realtime` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Attach a matched Socket.IO gateway to the API topology and authorize room joins for each engagement/resource.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T021 — Create explicit permission and segregation-of-duties checks](../02-security/T021-authorization.md)
- [T022 — Implement canonical runtime contracts and generated browser types](../02-security/T022-api-contracts.md)
- [T031 — Configure BullMQ workers for reliable retries and shutdown](T031-queue-runtime.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R022** — PBC item statuses; source lines `432-432`.
- **R023** — Mandatory rejection reason; source lines `433-433`.
- **R046** — Concurrent FSLI work without lost updates; source lines `497-497`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/realtime/; apps/web realtime client; tests

**Non-goals:** Events are authorized hints; they do not replace database state or optimistic version checks.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Nest websocket/platform-socket.io; socket.io/client; optional Redis adapter

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Attach a matched Socket.IO gateway to the API topology and authorize room joins for each engagement/resource.
- [ ] Emit small versioned invalidations only after commit; never send restricted KYC/financial content to broad rooms.
- [ ] Reload authoritative versions after reconnect and revoke membership when access changes.
- [ ] For multiple replicas choose WebSocket-only transport or configure sticky sessions for polling; prove the selected proxy setup.

## Acceptance criteria and required tests

- [ ] **AC1:** Unauthorized room join fails for internal and portal identities.
- [ ] **AC2:** Lost/reordered events cause refresh rather than lost business state.
- [ ] **AC3:** Multi-replica reconnect works in the chosen transport mode.

Test auth/room isolation, lease ownership, reconnect and selected multi-replica transport behavior.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T038
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
