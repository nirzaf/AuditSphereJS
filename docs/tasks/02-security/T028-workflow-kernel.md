# T028 — Implement guarded engagement transitions and state history

| Field | Value |
| :--- | :--- |
| Initial status | `IN_PROGRESS` |
| Current status | `DONE` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `workflow` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Preserve all 11 named states and the source managerial-review-to-fieldwork rework edge.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T021 — Create explicit permission and segregation-of-duties checks](T021-authorization.md)
- [T024 — Share one transaction across module-owned business operations](T024-transaction-context.md)
- [T025 — Implement append-only audit writes with database permissions](T025-audit-write.md)
- [T002 — Resolve workflow and billing ambiguities without changing the source silently](../00-readiness/T002-business-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R002** — Five connected business modules; source lines `68-129`.
- **R012** — Client commercial acceptance key; source lines `409-412`.
- **R013** — Partner acceptance/risk key; source lines `409-413`.
- **R024** — Portal upload freeze on final report release; source lines `434-434`.
- **R027** — Partner risk acceptance blocks operational planning; source lines `446-446`.
- **R055** — Preparer execution and submission; source lines `509-511`.
- **R056** — Manager review comments and rework; source lines `512-514`.
- **R059** — Partner review of Red areas and SRM; source lines `518-518`.
- **R070** — 60-calendar-day signature-based archive timer; source lines `548-550`.
- **R079** — All 11 lifecycle states and rework transitions; source lines `584-624`.
- **R080** — Advance must clear before client portal activation; source lines `588-592`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/workflow/ and owning module guards; state tests

**Non-goals:** No generic state PATCH endpoint or bypass for administrators, jobs or fixtures in production.

**Data or records:** engagement state/version; engagement_state_history.
**Interface:** GET /engagements/:id/gates; POST explicit engagement actions.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Preserve all 11 named states and the source managerial-review-to-fieldwork rework edge.
- [x] Implement explicit commands/guards rather than PATCH state; lifecycle commands remain separate from fine-grained workprogram records so parallel reviews remain possible.
- [x] Keep version-bound state history and fail closed when final-package readiness evidence is absent; do not advance lifecycle state or append history on a blocked release.
- [x] The full PostgreSQL release-versus-fieldwork-child-edit race is owned by T129 AC4, where the package readiness manifest and release transaction exist; preserve that acceptance until T129 passes.
- [x] Return structured unmet-gate reasons; rejected prospects are retained as a reasoned terminal outcome.

## Acceptance criteria and required tests

- [x] **AC1:** PostgreSQL integration coverage exercises every declared command from every lifecycle source state, validates each gate and successful target or expected evidence blocker, and denies every unlisted jump.
- [x] **AC2:** Without release-owner evidence, `RELEASE_FINAL_PACKAGE` returns its structured blocker and leaves engagement state, version and transition history unchanged. The full concurrent release-versus-child-edit acceptance is retained under T129 AC4.
- [x] **AC3:** No test fixture bypass endpoint is shipped to production.

Exercise source transitions, denied jumps, stale versions and blocked-release non-mutation. The full release-versus-child-edit race is tested under T129 AC4.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T028
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
