# T144 handoff — Practice expense and withdrawal journal entry

## Identity

Task ID: T144
Requirement IDs: R077
Implementing commit/branch: `81f40bd` on `main`; CI follow-up recorded below
Status: DONE

## Intended and delivered outcome

This is an existing implementation. The Practice Operating expenses screen is connected to a real server command. Staff with firm-wide Practice authority can load the firm chart and open periods, enter one of the six R077 categories, explicitly select accounts, create a balanced journal draft, and post through the existing approved-policy and period gates. A liability counterpart represents an unpaid obligation; an asset counterpart represents cash at recognition. Partner withdrawal requires an explicitly selected equity or partner-current liability debit with an asset counterpart and cannot use an expense debit.

At this handoff's initial checkpoint, the expense record did not yet link immutable receipt document versions. The 2026-10-04 follow-up below adds the firm-private repository boundary, immutable receipt version pinning and settlement controls. The live browser acceptance account has only the previously authorized ENGAGEMENT_READ grant, so Practice commands correctly deny it; no new Practice grant was created.

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
- Receipt document-version attachment is implemented by the 2026-10-04 firm-private receipt-version increment below.

## Recovery and authorization

No data migration or production posting was run. Failed validation creates no journal. Posted history is preserved; corrections use the canonical exact reversal. Commit/push is limited to explicitly staged source/docs paths. Deployment remains unauthorized and is not part of this work.

## Review and next task

Reviewer: Codex evidence review, 2026-10-05
Review result: DONE for scoped task criteria. Live Graph and authorized browser acceptance remain unverified external gates.
Open blockers: none within T144. Live Graph acceptance still needs an administrator-provisioned `practice-private` folder/grant and an authorized firm-wide Practice test identity.
Next eligible task by dependency order: T145 — firm trial balance.

## 2026-10-04 settlement increment

This follow-up implements the previously open settlement requirement. Expense recognition remains an immutable record linked to its original journal. A posted liability may be paid through a distinct balanced journal debiting the recorded liability and crediting an active asset account. The command requires both firm-wide Practice posting and management grants, records the settlement link immutably, and reports settled/outstanding balances. A transaction lock and database trigger prevent concurrent payments from exceeding the outstanding obligation. Reversing a settlement releases that amount; reversing a recognition is denied until its active settlements are reversed.

Additional changed files: `prisma/schema.prisma`; migration `prisma/migrations/202610040002_practice_expense_settlements/migration.sql`; generated `packages/contracts/schema.json` and `packages/contracts/openapi.json`; `packages/contracts/src/index.ts`; Practice service/controller/response/facade and README; `apps/web/src/practice-expenses.ts`, its component test and module catalog; `apps/api/tests/contracts.integration.ts`; `tests/practice-ledger.integration.ts`; `tests/e2e/modules.spec.ts`; and the T144 checklist/ledger/handoff.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T144` | Contracts/OpenAPI, PostgreSQL 18.6 settlement and concurrency integration, Angular expense component | Passed, exit 0; PostgreSQL 1/1, Angular 4/4 | 2026-10-04 local output |
| `pnpm verify:affected` | Boundaries, server/test typecheck, Angular production build, Vitest | Passed, exit 0; 25 files, 114 tests | 2026-10-04 local output |
| `pnpm lint` | ESLint and module boundaries | Passed, exit 0; zero errors, four existing warnings in excluded `visual-prototype-simulation/worker/worker-configuration.d.ts` | 2026-10-04 local output |
| `pnpm test:e2e` | Full Playwright module suite including expense recognition and settlement flow | Passed, exit 0; 10 passed, 2 live-only tests skipped | 2026-10-04 local output |

The browser journey stubs the API; settlement correctness and concurrency are exercised against PostgreSQL integration fixtures. The tenant account still lacks firm-wide Practice grants, so no live protected Practice browser workflow was performed. No credential, tenant permission, or external storage configuration changed.

The first CI run for this increment, [37178795280](https://github.com/nirzaf/AuditSphereJS/actions/runs/37178795280), exposed an outdated exact-response assertion that omitted the new `expenses` field. The fixture was corrected in follow-up commit `386a3c7`. Full local `pnpm verify:all` then passed, and [CI run 37179374570](https://github.com/nirzaf/AuditSphereJS/actions/runs/37179374570) passed `verify:all`, `contracts:check`, dependency audit, Linux image build/smoke, and publication of the labelled public web-assets artifact. This artifact publication is not application deployment.

At this historical checkpoint receipt-version attachment remained open; it was implemented in the 2026-10-04 firm-private receipt-version increment below.

## 2026-10-04 firm-private receipt-version increment

Implemented expense receipts as a separate firm-private object workflow. PostgreSQL now owns a `FirmRepository` purpose binding plus append-only `PracticeExpenseReceipt` metadata and versioned `PracticeExpenseReceiptUploadSession` state. A receipt row is composite-scoped to its firm and expense. The API requires current `PRACTICE_READ`/`PRACTICE_MANAGE`, a fresh idempotency key, PDF/JPEG/PNG signatures within 15 MB, malware scanning, private staging, immutable provider version/hash/size, and an append-only audit event. The Angular Operating Expenses view can attach/list receipts. The worker sweeps expired staged sessions without changing the financial journal. Production uses only an explicitly configured `practice-private` Graph repository; it fails closed and never falls back to client evidence or working-file folders. Non-production local acceptance uses RustFS.

The first receipt integration run found Prisma could not deserialize the PostgreSQL `void` return from an advisory-lock query. The lock was kept and its result is now selected as a boolean, following the already-used Practice locking pattern. The exact T144 verification recipe then passed:

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T144` | Server build, generated contracts/OpenAPI, Practice ledger integration (PostgreSQL 18.6), receipt upload integration (PostgreSQL 18.6 plus synthetic Graph and ClamAV endpoints), API-security route test and Angular expense component test | Passed, exit 0; ledger 1/1, receipt 1/1, API security 5/5, Angular 5/5 | 2026-10-04 local output |

Receipt integration proves malformed content rejection, firm-private repository resolution, exact Graph version pinning, safe response metadata without provider identifiers, immutable receipt metadata, idempotent replay without a duplicate Graph write, authorization denial without provider I/O, and compatibility with canonical journal posting. The Graph endpoint and scanner are controlled synthetic test services; this is not live Microsoft 365 acceptance. Current tenant grants cover only its two pre-existing synthetic acceptance folders. No `practice-private` folder or folder grant was created, no Practice grant was added to the Staff Fixture, and no credential or client file was read or changed. Production Graph configuration and browser acceptance of the protected Practice workflow remain blocked on an explicitly provisioned firm-private repository/folder grant and authorized test identity capability.

Changed areas include the Practice Prisma models and migration `202610040003_practice_expense_receipts`, API/service/worker and local-role wiring, receipt response contract/OpenAPI, the Practice expense Angular panel, focused integration/UI/security tests, verification recipe, task checklist, module README and Microsoft 365 boundary documentation. `docs/requirements/CURRENT.md` remains untouched; no dependency was added. No deployment occurred.

## 2026-10-05 task acceptance review

All four implementation checklist items and AC1–AC3 are complete. `pnpm verify:task -- T144` was rerun on 2026-10-05 and passed: server build, contract/OpenAPI check, PostgreSQL 18.6 ledger integration (1/1), PostgreSQL 18.6 receipt integration with synthetic Graph/ClamAV endpoints (1/1), API security tests (5/5), and Angular expense tests (5/5). The first rerun exposed an order-dependent test assertion that read `raced.lines[0]` although the database query has no ordering; the assertion now selects journal line `position === 0`, and the exact recipe passes.

Credentialed Microsoft Graph acceptance is not claimed. The tenant still lacks the dedicated `practice-private` folder grant and the Staff Fixture still lacks firm-wide Practice access. Browser denial is expected and no access was widened. Provider-backed folder acceptance remains an explicit separate integration/release gate; it does not leave T144's scoped implementation criteria incomplete.
