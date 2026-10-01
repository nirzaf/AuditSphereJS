# T158 — Review authentication, object access and output security end-to-end

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `GATE` |
| Phase | 14-production — Production verification, migration and release |
| Owner area | `security` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Test object-level authorization across APIs, bulk commands, downloads, Socket.IO, jobs and optional integrations.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T157 — Run the complete source lifecycle through real application boundaries](T157-full-journey.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R003** — PREPARER responsibilities and assignment limits; source lines `59-61`.
- **R004** — REVIEWER responsibilities and boundaries; source lines `59-62`.
- **R005** — APPROVER authority and sign-offs; source lines `59-63`.
- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.
- **R020** — Isolated portal and temporary credentials; source lines `428-430`.
- **R024** — Portal upload freeze on final report release; source lines `434-434`.
- **R052** — Electronic evidence and PBC linking; source lines `504-505`.
- **R072** — Timestamped immutable audit events; source lines `552-552`.
- **R081** — Preparer has no external communication or sign-off rights; source lines `61-61`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** Relevant auth, transport, storage and output boundaries; negative tests

**Non-goals:** No new malware-scanning subsystem or unrelated identity rewrite; focus on required controls.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Test object-level authorization across APIs, bulk commands, downloads, Socket.IO, jobs and optional integrations.
- [ ] Exercise CSRF/CORS, token substitution, upload-file limits, template injection, stored XSS and secret redaction.
- [ ] Review privilege separation for migrations, application, workers, signers and storage lock operators.
- [ ] Track remediations with regression tests; no unresolved critical/high exploitable findings may pass release.

## Acceptance criteria and required tests

- [ ] **AC1:** Cross-firm/client/engagement attacks are denied.
- [ ] **AC2:** Dangerous template/file content cannot execute or exfiltrate resources.
- [ ] **AC3:** Security evidence names the tested build and environment.

Run negative API/browser/file fixtures, scope checks and secret-redaction assertions with the tested artifact.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T158
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
