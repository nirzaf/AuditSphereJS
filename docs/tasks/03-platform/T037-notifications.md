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

- [x] Implement MD/GM, CFO/FD and audit-liaison event routing; freeze only active, verified, consented role contacts into an immutable email snapshot. SQL validates snapshot role/address shape. Fixture-backed routing is proven; production contact lookup remains dependent on T053.
- [x] Support the in-app inbox and Microsoft Graph email adapter. PostgreSQL intent is created in the caller's business transaction; provider I/O runs only in the worker. Graph mail is disabled by default until a separate mail-only app registration and permission are approved.
- [x] Persist delivery attempts, Graph request correlation/receipts and append-only retry/reconciliation actions. Unknown outcomes and expired claims never auto-replay; retries require a definite failure and a reason.
- [x] Prevent preparer dispatch through role ceilings plus explicit scoped grants. Provider logs exclude recipient addresses, subject, body, bearer token, provider response body and credentials.

## Acceptance criteria and required tests

- [x] **AC1:** PostgreSQL acceptance proves payment receipt routes to CFO/FD, PBC requests to liaison, and deliverables to MD/GM.
- [x] **AC2:** Unique engagement/event keys prevent duplicate intent; provider failure leaves the same durable event for explicit retry.
- [x] **AC3:** Preparer-triggered external send is denied and creates no outbound row.

Test role-based recipients, retry deduplication, invalid provider configuration and ambiguous outcomes.

Downstream workflow integration: T053 owns the persisted client contact-role directory and will supply its authorized records to this server-side routing boundary. Live Microsoft 365 mail acceptance remains a global tenant gate: the adapter stays disabled until a dedicated Graph mail application, sender and separately reviewed/consented `Mail.Send` are available.

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
