# T139 handoff — effective-dated staff charge-out rates

## Identity

Task ID: T139  
Requirement IDs: R073  
Implementing commit/branch: Uncommitted shared working tree; no task-isolated commit  
Status: DONE

## Intended and delivered outcome

Implemented effective-dated QAR rate cards for six professional grades at the four required rates, separate from engagement access personas. Authorized users can read administration data, schedule versioned non-overlapping rate revisions, and assign effective-dated staff grades. PostgreSQL stores immutable time-entry grade, rate and half-even charge-out snapshots so later rate changes cannot recalculate historical values.

This completes the T139 data, API and rate-administration screen scope. The daily time-entry, correction and approval workflows remain T140/T141. The repository is an existing application. The overall product and its remaining task backlog are not complete.

## Files and contracts

T139 implementation footprint:

- `prisma/schema.prisma`, `prisma/migrations/202610030007_practice_rate_cards/migration.sql`, and `prisma/seed.ts`: three Practice records, supporting keys/indexes, default rates and database range/history/snapshot guards.
- `packages/contracts/src/index.ts`, `packages/contracts/schema.json`, and `packages/contracts/openapi.json`: grade/rate/assignment schemas and generated API descriptions.
- `packages/server/src/modules/practice/rates.ts`, `packages/server/src/modules/practice/rates-controller.ts`, `packages/server/src/modules/practice/README.md`, and `packages/server/src/index.ts`; `apps/api/src/main.ts`: use cases, exports and guarded API composition.
- `apps/web/src/practice-rates.ts`, `apps/web/src/practice-rates.spec.ts`, `apps/web/src/module-catalog.ts`, `apps/web/src/module-workspace.ts`, `apps/web/src/module-workspace.html`, and `apps/web/src/styles.css`: connected Practice screen and navigation.
- `packages/server/tests/practice-rates.test.ts`, `tests/practice-rates.integration.ts`, and `apps/api/tests/practice-rates-api.integration.ts`: unit, real-PostgreSQL persistence and Nest/Fastify API checks.
- `package.json` and `scripts/verify-task.mjs`: focused browser test command and recorded T139 recipe.
- `docs/tasks/12-practice/T139-rate-cards.md`, `docs/guides/13-execution-ledger.md`, `docs/evidence/UI-MODULES.md`, `docs/IMPLEMENTATION-STATUS.md`, and this handoff: status and acceptance evidence.

The migration is additive. The overall shared worktree contains other in-progress task changes and is not isolated as a T139 commit; the list above identifies the T139 footprint only. No production deployment or production data repair was performed.

## Dependency evidence

No dependency changes. The repository-pinned Node.js and pnpm versions were used. PostgreSQL persistence tests ran against Testcontainers PostgreSQL 18.6. No new package requires compatibility or license review.

## Decisions

- D07 charge-out metric and D12 authority/segregation implementation defaults are `APPROVED_IMPLEMENTATION_DEFAULT` in `docs/decisions/register.json` under the user's delegated decision.
- The job-grade field does not alter `User.role` or `Membership.role`. Rate reads require `PRACTICE_READ`; rate and grade mutations require `PRACTICE_MANAGE`, current firm/engagement scope, expected history version, audit and idempotency.
- No tenant Graph, SharePoint, OneDrive or signing permission is required for T139.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T139` | Current server build, shared contracts/OpenAPI, Practice rate unit tests, PostgreSQL 18.6 persistence/API/ledger tests, and Angular component tests | PASS, exit 0; rate unit 3/3, rate persistence 1/1, API route 1/1, ledger 1/1, API contract 1/1, Angular 4/4 | Command rerun on 2026-10-03; recipe is in `scripts/verify-task.mjs` |
| `pnpm verify:affected` | Import boundaries, server and test typechecks, Angular production build and repository Vitest suite | PASS, exit 0; 22 test files / 96 tests; Angular production build passed | Command rerun on 2026-10-03 |
| Built-in browser `http://localhost:4200/?module=Practice&view=rates` | Existing Entra Staff Fixture `auditp0-staff@easyguide.onmicrosoft.com`, mapped as PREPARER with one synthetic engagement | Active identity and assigned engagement confirmed. Rate administration correctly returned its firm-wide Practice permission denial. No browser business mutation was submitted. | Live browser inspection on 2026-10-03; authorized rate-administrator success path is not claimed |

The Angular CLI MCP project and Angular 22 best-practice guidance were consulted before the UI work. The screen uses standalone/OnPush, signals, typed reactive forms, shared transport schemas and accessible labels. It does not use Signal Forms; typed reactive forms suit the multi-field administrative commands here.

## Acceptance criteria

- **AC1 — PASS:** PostgreSQL seed and service tests verify Partner 1000, Manager 750, Supervisor/Senior 500, Associate/Junior 200 QAR/hour. Rate and grade values are distinct from access roles.
- **AC2 — PASS:** Service and database exclusion trigger reject overlapping half-open effective intervals; real-PostgreSQL test covers the denial path.
- **AC3 — PASS:** A persisted time-value snapshot records the effective grade/rate and exact half-even value. Tests revise later rate history and verify the earlier snapshot is unchanged; database triggers reject update/delete.
- API tests verify authorized access, scope/permission denial, stable idempotent replay, overlap conflict and that assigning a grade does not change an access role.
- Live browser testing confirms the identity warning is gone after fresh sign-in with the existing mapped Staff Fixture. That PREPARER lacks the separate firm-wide Practice grant, so the UI reports the expected denial; no broader grant was added.

## Recovery and authorization

The migration adds tables and constraints without rewriting existing business records. Code rollback would not remove the applied database migration; any future removal must preserve created history and be handled as a separately reviewed migration. No merge, deployment, external provider write or production data change was authorized or performed.

## Review and next task

Reviewer: Codex evidence review (not an independent reviewer)  
Review result: Acceptance criteria, implementation boundaries and current recipe output reviewed; all T139 criteria have executable evidence.  
Open blockers: Live rate administration by a firm-authorized account is not browser-verified; daily time entry and approval are outside T139.  
Next eligible task by dependency order: T140 — Record daily hours by engagement, phase and FSLI.  
Stop after this task; do not implement the next feature without assignment.
