# T136 — Export regulator inspection packages with hash verification

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 11-archive — Archive, retention and inspection |
| Owner area | `reporting` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create a read-only export of manifest, metadata, approvals, audit events and permitted evidence files.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T134 — Finalize archive state only after sealing evidence verifies](T134-archive-seal.md)
- [T034 — Implement scoped document downloads and delivery receipts](../03-platform/T034-downloads.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R053** — Physical evidence file/box/shelf references; source lines `506-506`.
- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.
- **R072** — Timestamped immutable audit events; source lines `552-552`.
- **R078** — Firm TB, monthly P/L and client AR aging; source lines `578-578`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/reporting/; apps/web features/reporting; owned snapshots and worker processors; tests

**Non-goals:** Use Practice final-fee facade; no stale SRM release, silent re-signing or partial bundle exposure.

**Interface:** Inspection export request/status/download.
**Screen or user interaction:** Archive inspection view.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Create a read-only export of manifest, metadata, approvals, audit events and permitted evidence files.
- [ ] Verify source hashes while assembling and include physical-reference index.
- [ ] Enforce role/scope and redact fields according to approved inspection policy.
- [ ] Audit the export request without modifying the sealed source snapshot.

## Acceptance criteria and required tests

- [ ] **AC1:** Export verifier detects a missing or changed source object.
- [ ] **AC2:** Unauthorized users cannot request regulator packages.
- [ ] **AC3:** Export content maps back to the frozen manifest.

Test version-bound gates, evidence/signature identity, failure recovery and portal/archival boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T136
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
