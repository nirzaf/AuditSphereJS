# T021 — Create explicit permission and segregation-of-duties checks

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 02-security — Identity, authorization and application controls |
| Owner area | `identity` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Implement a permission matrix combining principal kind, firm scope, engagement assignment, role and resource state.

**Current implementation status (2026-10-03): `DONE` for the shared authorization foundation.** The backend evaluates active staff identity, per-engagement membership role, exact engagement assignment, explicit scoped grants and command/resource-state policy inside server use cases. An API now assigns and revokes engagement team access under an explicit APPROVER plus scoped `TEAM_ASSIGNMENT_MANAGE` gate, with role-ceiling checks, future expiry, reason, audit and idempotency. Resource-specific controls remain requirements of their owning workflow tasks: preparer assignment to workprogram instances at [T091](../08-fieldwork/T091-workprogram-instances.md)/[T106](../08-fieldwork/T106-submit-workprogram.md), report-package release authority at [T129](../10-reporting/T129-release.md)/[T130](../10-reporting/T130-release-delivery.md), and outbound communication rights at T037/T062/T076/T112. Those tasks are still open; this status does not claim their behavior or overall product acceptance. The requirement map continues to assign R003/R005/R081 to those feature tasks.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T019 — Implement the selected internal identity adapter and session boundary](T019-internal-auth.md)
- [T020 — Implement separate portal authentication and first-reset gate](T020-portal-auth.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R003** — PREPARER responsibilities and assignment limits; source lines `59-61`.
- **R004** — REVIEWER responsibilities and boundaries; source lines `59-62`.
- **R005** — APPROVER authority and sign-offs; source lines `59-63`.
- **R006** — Isolated CLIENT portal and closure access; source lines `59-64`.
- **R029** — Engagement team roles; source lines `451-451`.
- **R081** — Preparer has no external communication or sign-off rights; source lines `61-61`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** `packages/server/src/platform/` identity, authorization and staff-access services; the Fastify identity/team controller; browser-safe contracts and generated schemas; `User`, `Membership` and `RoleGrant` Prisma schema/migrations; task verification recipes; identity/auth UI where needed; focused unit and PostgreSQL/Fastify integration tests.

**Non-goals:** No automatic partner privileges from system administrator or external directory roles.

**Data or records:** Role assignments and effective permission resolution.

**Dependency focus:** Reuse the dependencies already approved for this owner area; no new library is required merely to complete this task.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** D12

## Implementation checklist

- [x] Implement a permission matrix combining active internal principal, exact engagement membership and role, explicit capability grant, firm/client/engagement scope and the owning command's resource-state rule.
- [x] Apply the shared role/capability ceiling to existing mutation commands. PREPARER cannot access existing commercial proposal operations; self-approval, self-review and self-posting boundaries are checked inside their domain commands. Resource-specific workprogram assignment, final bundle release, and outbound message authorization stay with T091/T106, T129/T130 and T037/T062/T076/T112 respectively; they remain required product work and must use this foundation.
- [x] Separate the current ADMIN, BILLING, REVIEWER and APPROVER ceilings. Practice capabilities are BILLING-only; global ADMIN cannot be promoted into business authority; partner capabilities still require an explicit scoped grant. RoleGrant records grantor, reason, expiry and revocation.
- [x] Expose transactional engagement staff assignment and revocation routes. Require an assigned APPROVER with a scoped team-management grant, reject self-changes and inactive targets, enforce the target role ceiling, require finite expiry and reason, audit the change, and make retries idempotent.
- [x] Recheck applicable authority inside mutation use cases and command transactions; Fastify guards and UI visibility are not the sole authorization boundary.

## Acceptance criteria and required tests

- [x] **AC1:** A PREPARER cannot approve fieldwork start; own materiality approvals, review-note resolutions and adjustment postings remain denied by their domain commands. Tests exercise each denial on PostgreSQL.
- [x] **AC2:** A partner membership and grant for one engagement fail against another engagement, including through a direct use-case call.
- [x] **AC3:** Fastify and server use-case checks deny unauthorized commands independently of whether the Angular UI displays a control.

The focused recipe covers active/inactive identity, expired and revoked grants, cross-firm/client/engagement scope, role ceilings, self-approval/self-review/self-posting, assignment/revocation, idempotency and Fastify denial. Entra credential validation and browser sign-in are owned and evidenced by T019; feature-specific resource limits remain with the tasks listed above.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T021
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
