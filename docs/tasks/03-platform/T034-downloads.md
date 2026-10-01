# T034 — Implement scoped document downloads and delivery receipts

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `documents` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Provide authorized download endpoints or short-lived presigned URLs after a fresh scope check.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T032 — Implement private object storage and immutable document versions](T032-storage-metadata.md)
- [T021 — Create explicit permission and segregation-of-duties checks](../02-security/T021-authorization.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.
- **R019** — Automatic receipt and dispatch; source lines `427-427`.
- **R052** — Electronic evidence and PBC linking; source lines `504-505`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R067** — D3 LOR export, management signing and re-upload; source lines `544-544`.
- **R068** — D4 correspondence and confirmation trail; source lines `545-545`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/documents and storage; apps/worker/ composition; metadata migrations; tests

**Non-goals:** No overwriting evidence versions, untrusted executable templates or public storage credentials.

**Interface:** GET /documents/:id/versions/:versionId/download.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Provide authorized download endpoints or short-lived presigned URLs after a fresh scope check.
- [ ] Use attachment disposition for untrusted content and safe filename encoding.
- [ ] Track access separately from document creation and report release; generating a URL is not proof of client delivery.
- [ ] Provide hash/version metadata for regulator exports and browser integrity display.

## Acceptance criteria and required tests

- [ ] **AC1:** Another client cannot obtain a download URL.
- [ ] **AC2:** Expired/changed access is handled according to the approved short-link policy.
- [ ] **AC3:** Audit history identifies the exact version downloaded.

Test real/emulated storage behavior, boundary failures and immutable hash/version references; provider-specific assurance requires real-provider evidence.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T034
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
