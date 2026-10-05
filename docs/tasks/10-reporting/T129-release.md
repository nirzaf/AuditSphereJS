# T129 — Release the package and freeze uploads atomically

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 10-reporting — Reporting and controlled release |
| Owner area | `reporting` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Lock the engagement/release barrier, recheck version-bound gates and finalize release against one readiness manifest.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T128 — Validate final package completeness and current approval lineage](T128-bundle-validation.md)
- [T028 — Implement guarded engagement transitions and state history](../02-security/T028-workflow-kernel.md)
- [T027 — Persist idempotent operation outcomes in PostgreSQL](../02-security/T027-idempotency.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R024** — Portal upload freeze on final report release; source lines `434-434`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R069** — D5 remaining 50% fee note; source lines `546-546`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.
- **R080** — Advance must clear before client portal activation; source lines `588-592`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/modules/reporting/; apps/web features/reporting; owned snapshots and worker processors; tests

**Non-goals:** Use Practice final-fee facade; no stale SRM release, silent re-signing or partial bundle exposure.

**Data or records:** release_events; portal_upload_frozen_at; release manifest.
**Interface:** POST /engagements/:id/packages/:id/actions/release.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [ ] Lock the engagement/release barrier, recheck version-bound gates and finalize release against one readiness manifest.
- [ ] In the same PostgreSQL transaction record release, upload freeze, billing association, audit event and outbound delivery intent.
- [ ] Do not require network/email success inside this transaction.
- [ ] Serialize upload-finalize and release checks so a previously issued upload URL cannot bypass freeze.

## Acceptance criteria and required tests

- [ ] **AC1:** Concurrent release and upload-finalize yield only an authorized consistent outcome.
- [ ] **AC2:** Duplicate release command returns the same package/release ID.
- [ ] **AC3:** Newly blocked fieldwork prevents release even if an earlier preview was ready.
- [ ] **AC4:** A PostgreSQL release racing with a fieldwork child-evidence mutation serializes against the engagement barrier and cannot release a stale readiness manifest. Verify both lock orderings; a rejected or stale release leaves no release event, invoice association, upload freeze, delivery intent or lifecycle advance.

Test version-bound gates, evidence/signature identity, failure recovery and portal/archival boundaries.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T129
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
