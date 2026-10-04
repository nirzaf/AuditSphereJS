# T144 handoff — Practice expense and withdrawal journal entry

## Identity

Task ID: T144
Requirement IDs: R077
Implementing commit/branch: `81f40bd` on `main`; CI follow-up recorded below
Status: IN_PROGRESS

## Intended and delivered outcome

This is an existing implementation. The Practice Operating expenses screen is connected to a real server command. Staff with firm-wide Practice authority can load the firm chart and open periods, enter one of the six R077 categories, explicitly select accounts, create a balanced journal draft, and post through the existing approved-policy and period gates. A liability counterpart represents an unpaid obligation; an asset counterpart represents cash at recognition. Partner withdrawal requires an explicitly selected equity or partner-current liability debit with an asset counterpart and cannot use an expense debit.

The task is not complete: the expense record does not yet link immutable receipt document versions. Existing storage metadata is engagement-scoped and client-repository-bound; using it for firm payroll/partner records without a firm-private repository would place confidential files in a client context. A separate settlement journal and immutable expense-settlement link were added in the 2026-10-04 increment below. The live browser acceptance account has only the previously authorized ENGAGEMENT_READ grant, so Practice commands correctly deny it; no new Practice grant was created.

## Files and contracts

- `packages/contracts/src/index.ts`: added the expense category enum and validated draft command contract.
- `packages/contracts/schema.json`, `packages/contracts/openapi.json`: regenerated canonical schema and OpenAPI documents, including `POST /api/v1/engagements/{engagementId}/practice/expenses/drafts`.
- `packages/server/src/modules/practice/ledger.ts`: added authorized, audited, idempotent expense draft creation and, in the follow-up below, separately posted expense settlement using decimal strings, open-period locking, active same-firm account checks and category/account classification rules.
- `packages/server/src/modules/practice/ledger-controller.ts`, `packages/server/src/index.ts`: expose the protected route/service through Practice.
- `apps/web/src/practice-expenses.ts`: connected chart/period loader, validated category form, journal draft and post action.
- `apps/web/src/module-workspace.ts`, `apps/web/src/module-workspace.html`: route the Practice expense screen to the new component.
- `apps/web/src/practice-expenses.spec.ts`: browser component tests for exact decimal submission, account filtering and explicit authorization denial.
- `tests/practice-ledger.integration.ts`: PostgreSQL tests all six expense categories, canonical posting/reversal, partner withdrawal classification and negative-amount denial.
- `scripts/verify-task.mjs`, `package.json`: add the T144 verification recipe and focused Angular test command.
- `docs/decisions/T003-methodology-defaults.md`, Practice README, web README, task ledger and task checklist: document the delegated D07 implementation default and outstanding requirements.

No migration or dependency change. `docs/requirements/CURRENT.md` remains unchanged. No tenant permissions, external storage, production data or deployment were changed.

## Dependency evidence

No dependency changes. Angular CLI MCP workspace guidance and Angular v22 Forms documentation were consulted. The template uses Angular Forms validation (`ngNativeValidate`) and the existing pinned standalone/Signals application conventions. No live document-provider call is part of this slice.

## Decisions

D07 is approved by the user's explicit delegation to approve D01–D12 defaults. The implementation requires explicit account selection and never derives account identity from the category label. This is an engineering default, not professional or jurisdiction-specific accounting acceptance.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T144` | Build, canonical contracts/OpenAPI, PostgreSQL 18.6 practice ledger integration, Angular v22 component test | Passed, exit 0; PostgreSQL 1/1, Angular 3/3 | 2026-10-04 local output |
| `pnpm verify:affected` | Boundaries, server/tests typecheck, Angular production build, Vitest | Passed, exit 0; 25 files, 114 tests | 2026-10-04 local output |
| `pnpm lint` | ESLint and module boundaries | Passed, exit 0; zero errors, four existing warnings in the untracked `visual-prototype-simulation/worker/worker-configuration.d.ts` | 2026-10-04 local output |
| `pnpm test:e2e` | Browser module coverage and expense draft/post journey | Passed, exit 0; 10 passed, 2 live-only tests skipped | 2026-10-04 local output |

## CI follow-up

GitHub Actions run [37176596479](https://github.com/nirzaf/AuditSphereJS/actions/runs/37176596479) failed in browser E2E because the generic module test still expected the now server-backed Practice expenses page to display “Preparation only”. The follow-up removed stale preparation metadata and added a Playwright expense journey. The original fix passed CI in run [37177141406](https://github.com/nirzaf/AuditSphereJS/actions/runs/37177141406). The settlement increment's CI result will be recorded after push.

The PostgreSQL test uses Testcontainers and the pinned `postgres:18.6` fixture. The web test intercepts the API. Neither is live M365 storage acceptance. The browser confirmed the signed-in test account can read its synthetic engagement but receives the expected firm-wide Practice permission denial.

## Acceptance criteria

- AC1: all six categories are represented by the validated form and server enum; PostgreSQL integration creates each category.
- AC2: an expense draft is posted through the canonical journal service, exercising approved posting policy, active accounts, balance and open-period controls; test then applies an exact reversal.
- AC3: partner withdrawals post only with explicit EQUITY or LIABILITY partner-current debit and ASSET counterpart; a withdrawal using an EXPENSE debit is rejected; the category cannot choose an account.
- Remaining task requirement: receipt document-version attachment is not implemented, so the task stays IN_PROGRESS.

## Recovery and authorization

No data migration or production posting was run. Failed validation creates no journal. Posted history is preserved; corrections use the canonical exact reversal. Commit/push is limited to explicitly staged source/docs paths. Deployment remains unauthorized and is not part of this work.

## Review and next task

Reviewer: pending
Review result: pending
Open blockers: firm-private versioned receipt storage; live browser acceptance requires a separately authorized firm-wide Practice grant for the dedicated nonproduction test identity.
Next eligible task by dependency order: continue T144 until the receipt-version requirement is supported.

## 2026-10-04 settlement increment

This follow-up implements the previously open settlement requirement. Expense recognition remains an immutable record linked to its original journal. A posted liability may be paid through a distinct balanced journal debiting the recorded liability and crediting an active asset account. The command requires both firm-wide Practice posting and management grants, records the settlement link immutably, and reports settled/outstanding balances. A transaction lock and database trigger prevent concurrent payments from exceeding the outstanding obligation. Reversing a settlement releases that amount; reversing a recognition is denied until its active settlements are reversed.

Additional changed files: `prisma/schema.prisma`; migration `prisma/migrations/202610040002_practice_expense_settlements/migration.sql`; generated `packages/contracts/schema.json` and `packages/contracts/openapi.json`; `packages/contracts/src/index.ts`; Practice service/controller/response/facade and README; `apps/web/src/practice-expenses.ts`, its component test and module catalog; `apps/api/tests/contracts.integration.ts`; `tests/practice-ledger.integration.ts`; `tests/e2e/modules.spec.ts`; and the T144 checklist/ledger/handoff.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T144` | Contracts/OpenAPI, PostgreSQL 18.6 settlement and concurrency integration, Angular expense component | Passed, exit 0; PostgreSQL 1/1, Angular 4/4 | 2026-10-04 local output |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, Vitest | Passed, exit 0; 25 files, 114 tests | 2026-10-04 local output |
| `pnpm lint` | ESLint and module boundaries | Passed, exit 0; zero errors, four existing warnings in excluded `visual-prototype-simulation/worker/worker-configuration.d.ts` | 2026-10-04 local output |
| `pnpm test:e2e` | Full Playwright module suite including expense recognition and settlement flow | Passed, exit 0; 10 passed, 2 live-only tests skipped | 2026-10-04 local output |

The browser journey stubs the API; settlement correctness and concurrency are exercised against PostgreSQL integration fixtures. The tenant account still lacks firm-wide Practice grants, so no live protected Practice browser workflow was performed. No credential, tenant permission, or external storage configuration changed. CI for this increment is pending its push.

T144 remains `IN_PROGRESS`: receipt-version attachment is not implemented. Existing private document storage is engagement-scoped and is not suitable for confidential firm payroll or partner files without a firm-private repository boundary.
