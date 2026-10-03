# T021 authorization handoff — 2026-10-03

## Identity

Task ID: T021
Requirement IDs: R003–R006, R029, R081
Implementing commit/branch: uncommitted working-tree changes on `main`
Status: DONE (shared authorization foundation only; feature-specific controls remain open in their owner tasks)

## Intended and delivered outcome

The API resolves internal staff authority from an active user, that user's exact engagement membership and per-engagement role, a current explicit scoped capability grant, and the owning command's state/version checks. CLIENT authentication remains on the separate `PortalUser` boundary. Global ADMIN does not acquire business authority by role elevation; Practice capabilities are limited to BILLING; PREPARER cannot use partner approval commands. Transactional staff assignment and revocation routes require an APPROVER membership and exact engagement-scoped `TEAM_ASSIGNMENT_MANAGE` grant; they enforce active targets and role ceilings, reject self-changes, require a finite future expiry and reason, write audit records, and use idempotency receipts. This completes the shared authorization foundation. Resource-specific preparer/workprogram assignment, outbound communication checks and final-release authorization remain required in T091/T106, T037/T062/T076/T112 and T129/T130; those product requirements remain open until their owning tasks pass.

## Files and contracts

- `packages/server/src/platform/authorization.ts` defines the engagement role ceilings and evaluates membership, scope, grant status and capability together.
- `packages/server/src/platform/auth.ts` returns only active, scoped internal engagements under the effective membership role.
- `packages/server/src/modules/governance/lifecycle.ts` rechecks command-specific roles within lifecycle mutation transactions.
- `packages/server/src/modules/practice/ledger.ts` requires the exact firm engagement membership and BILLING authority for Practice commands.
- `packages/server/src/platform/staff-access.ts` implements transactional assignment/revocation, target role-ceiling checks, audit events, and safe command-receipt replay; `identity-controller.ts` exposes the Fastify routes.
- `packages/contracts/src/index.ts`, generated `packages/contracts/schema.json`, `authorization.ts`, and migration `202610030002_team_assignment_capability` define and constrain `TEAM_ASSIGNMENT_MANAGE` and assignment/revoke request contracts.
- `prisma/schema.prisma` and `prisma/migrations/202610030001_staff_authority_matrix/migration.sql` persist and constrain `Membership.role`, backfilling existing membership roles from the user role.
- `tests/staff-access.integration.ts` and `apps/api/tests/auth-boundary.integration.ts` verify service and actual HTTP route behavior; authorization, lifecycle, Practice and Fastify fixtures were updated for per-engagement roles.
- `scripts/verify-task.mjs` records the T021 recipe including contract drift, assignment-command and route-boundary checks; `package.json` includes the new integration test in the full integration command.
- `docs/decisions/register.json`, `docs/decisions/T002-business-defaults.md`, this task, the execution ledger and implementation status record D12 and the remaining scope.

No dependency or browser contract was added for T021. No generated Prisma source was hand-edited.

## Dependency evidence

No dependency changes. Existing compatibility and dependency evidence remains in `docs/guides/02-compatibility-matrix.md` and `docs/guides/03-library-register.md`.

## Decisions

D12 is recorded as a user-delegated engineering implementation default in `docs/decisions/register.json`. It does not assert independent professional certification. No external professional sign-off is claimed.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T021` | Server build, contract drift, PostgreSQL authorization/lifecycle/materiality/review/adjustment/team access, and Fastify route boundary | Passed; contract check plus all seven focused integration checks passed, each discovering 1 test (exit 0) | Current run, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server and test typechecks, Angular production build, Vitest | Passed; boundaries passed, 18 test files and 82 tests passed (exit 0) | Current run, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundaries | Passed (exit 0); 4 existing unused-eslint-disable warnings remain in `visual-prototype-simulation/worker/worker-configuration.d.ts` | Current run, 2026-10-03 |
| `git diff --check` | Working-tree whitespace | Passed (exit 0); Git emitted only its Windows LF-to-CRLF advisory | Current run, 2026-10-03 |
| `pnpm test:integration` | Full PostgreSQL integration set including staff-access test | Prior run passed 23/23 before the staff-access suite was added; the full suite was not rerun after that addition. Focused T021 recipe and `verify:affected` were rerun and passed. | History, 2026-10-03 |
| D12 register JSON parse | `docs/decisions/register.json` | Passed; valid JSON | Current run, 2026-10-03 |

The user reported being logged in. No Microsoft Graph/storage operation or browser acceptance is claimed: built-in browser automation refused inspection of the localhost tab under its URL policy.

## Acceptance criteria

- **AC1:** Covered by integration tests denying PREPARER lifecycle approval, self materiality approval, own review-note resolution and own adjustment posting. Other owning commands retain their own reviewer/partner and separation-of-duty checks.
- **AC2:** Covered by tests for an otherwise capable partner whose membership/grant applies to one engagement, followed by denial on a different engagement, including direct use-case authorization. Expiry and revocation are also tested.
- **AC3:** Covered at the Fastify boundary and directly in command-level integration tests; hiding or rendering an Angular control cannot bypass server authorization.

The tested role is engagement-level (`Membership.role`), not a global User role; an ADMIN user cannot be elevated to business authority by an engagement assignment. These checks require exact scoped grants and do not make role labels alone authoritative.

## Recovery and authorization

The migration is additive: it adds a defaulted membership role, backfills it from existing user roles, then constrains allowed role values. Testcontainers applies the reviewed migration to an isolated PostgreSQL test database. No production database was migrated or repaired. Rollback of source code would not reverse an already-applied migration; production rollback/data repair would require its own reviewed operation. No merge or deployment authorization is included here.

## Review and next task

Reviewer: Codex evidence review; no independent reviewer assigned.
Review result: T021's shared authorization acceptance criteria, including the role matrix, exact scope, mutation-time authorization and relevant segregation-of-duties denials, pass the expanded task recipe. Browser acceptance and an operator UI for managing assignments were not verified and are outside this task's shared-kernel criteria.
Open product requirements: T091/T106 must enforce preparer ownership at workprogram instances; T037/T062/T076/T112 must enforce outbound communication limits; T129/T130 must enforce partner final-release authority. These remain in the requirement map and this T021 closure does not claim them complete.
Next task by dependency order: T022, now that T021's shared authorization foundation is closed; follow `docs/guides/01-execution-order.md` for subsequent work.

