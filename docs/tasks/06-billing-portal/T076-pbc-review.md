# T076 — Implement auditor review and mandatory rejection reasons

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 06-billing-portal — Billing foundation and PBC portal |
| Owner area | `portal` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Allow authorized staff to mark an item Under Review and approve or reject the exact submitted version.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T075 — Attach and re-upload evidence through PBC request controls](T075-pbc-upload.md)
- [T021 — Create explicit permission and segregation-of-duties checks](../02-security/T021-authorization.md)
- [T038 — Implement authenticated Socket.IO rooms and safe reconnects](../03-platform/T038-realtime.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R022** — PBC item statuses; source lines `432-432`.
- **R023** — Mandatory rejection reason; source lines `433-433`.
- **R081** — Preparer has no external communication or sign-off rights; source lines `61-61`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/portal or owning PBC service; apps/web features/pbc-portal; tests

**Non-goals:** Keep external identities and scope separate; never relax upload freeze to complete a happy-path demo.

**Interface:** PBC review approve/reject commands.
**Screen or user interaction:** Internal review panel; client status/rejection display.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Allow authorized staff to mark an item Under Review and approve or reject the exact submitted version.
- [ ] Require substantive rejection text visible to the client and record reviewer/version/time.
- [ ] Rejected items allow a new upload version rather than deletion.
- [ ] Prevent stale review approval if a newer client version was submitted concurrently.

## Acceptance criteria and required tests

- [ ] **AC1:** Rejection without a reason fails.
- [ ] **AC2:** Client sees the correct rejection reason immediately after refresh/event.
- [ ] **AC3:** A stale version approval returns conflict.

Test first-reset/payment gates, cross-client denial, rejection reasons and in-flight upload/freeze races.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T076
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
