# T037 — Implement role-routed notifications and auditable outbound dispatch

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `notifications` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create recipient snapshots using MD/GM, CFO/FD and audit-liaison routing; validate addresses against authorized contact roles.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T030 — Implement a durable outbox with operation reconciliation](T030-outbox.md)
- [T031 — Configure BullMQ workers for reliable retries and shutdown](T031-queue-runtime.md)
- [T021 — Create explicit permission and segregation-of-duties checks](../02-security/T021-authorization.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R009** — Role-based contact and communication routing; source lines `394-397`.
- **R019** — Automatic receipt and dispatch; source lines `427-427`.
- **R023** — Mandatory rejection reason; source lines `433-433`.
- **R061** — Critical confirmation blocks release and triggers holding letter; source lines `523-523`.
- **R081** — Preparer has no external communication or sign-off rights; source lines `61-61`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/notifications/; provider adapter; message records; tests

**Non-goals:** No preparer external-dispatch rights or assumption that a queued message was delivered.

**Data or records:** notifications; outbound_messages; delivery_attempts.
**Interface:** Scoped notification inbox and retry/reconciliation controls.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Create recipient snapshots using MD/GM, CFO/FD and audit-liaison routing; validate addresses against authorized contact roles.
- [ ] Support in-app status and one approved email provider; keep actual sends out of transactions.
- [ ] Persist attempts and provider receipts, with UNKNOWN state for ambiguous timeouts; do not automatically replay an uncertain send.
- [ ] Prevent preparers from sending external communications; sanitize all provider logs.

## Acceptance criteria and required tests

- [ ] **AC1:** A receipt routes to CFO/FD and a PBC request to liaison in fixtures.
- [ ] **AC2:** Provider failure does not duplicate the business event.
- [ ] **AC3:** Preparer-triggered external send is rejected.

Test role-based recipients, retry deduplication, invalid provider configuration and ambiguous outcomes.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T037
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
