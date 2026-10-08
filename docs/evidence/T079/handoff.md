# Task handoff

## Identity

Task ID: T079 — Validate TB balance, account identity and period controls
Requirement IDs: R041 (CURRENT.md lines 487-489)
Implementing commit/branch: `main` (commit follows this handoff)
Status: IN_REVIEW — acceptance criteria AC1–AC3 are proven. Three checklist items are open (listed below). The ledger has not been changed, because review has not happened.

## Intended and delivered outcome

Most of T079's rules were already enforced in code: exact six-place decimal balances, duplicate codes rejected per batch, bounded numerics, and balanced finalization. No test proved them end to end on PostgreSQL. This task adds that proof, and it checks the golden fixture's totals against its manifest.

Not delivered (checklist items still open):

- **Required-account policy.** No approved list of required accounts exists, so none is enforced. Blocked on a decision.
- **Statutory period identity and grouped duplicates.** Current and prior periods are not checked for statutory identity, and there is no confirmed grouping of duplicate codes. Both need policy decisions.
- **Warnings separated from blockers.** Parse errors are blockers, and no advisory warning category exists. A warning channel is not yet designed.

## Files and contracts

- `tests/tb-validation.integration.ts` (new): PostgreSQL 18.6 test.
- `scripts/verify-task.mjs` (T079 recipe) and `package.json` (`test:integration`).

No migration, contract or API change.

## Dependency evidence

No dependency changes.

## Decisions

Open and needed before the remaining items: the required-account list; the statutory period rule; the grouped-duplicate confirmation rule; the warning-versus-blocker categories. None has been assumed.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T079` (build:server, trial-balance-csv, tb-validation-rules) | Vitest parser 8 of 8; PostgreSQL 18.6 test with the golden 5,000-row CSV and an unbalanced fixture | exit 0 | local run |
| `pnpm verify:affected` | boundaries, typechecks, Angular build, all Vitest | exit 0; 32 files, 160 of 160 tests | local run |
| `pnpm lint` | ESLint and import boundaries | exit 0 | local run |

## Acceptance criteria

- **AC1 — an unbalanced import cannot finalize.** A two-row import that sums to 0.01 is fully mapped and then refused with 400 ("must balance to zero"). Its status stays MAPPING_REQUIRED. A reviewer's finalization is also refused for a viewer (covered in T050).
- **AC2 — an identical code in another batch is never merged.** A sibling batch with account 100 is staged, and the golden batch's statement summary is unchanged. Cross-client isolation of the same code is covered by the T042 seed test.
- **AC3 — source-to-normalized totals reconcile in the golden fixture.** The staged 5,000 rows match the manifest exactly: debits and credits per period, net zero in both periods, the 2,500 negative current rows and the 2,500 zero-prior rows.

Failure paths covered: unbalanced finalization and the viewer finalization refusal. The duplicate-code refusal is covered by the parser test suite.

## Recovery and authorization

A refused finalization changes nothing (asserted). No production data was touched.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: the four policy decisions listed above.
Next eligible task by dependency order: T081 (finalize as an immutable version), then T078 and T080.
Stop after this task; do not implement the next one without assignment.

## Addendum — DN-04 / D16: statutory period and validation policies (2026-10-08)

The owner decided all four DN-04 questions as recommended. No required-account list. The statutory period is stored on the engagement (`Engagement.period`, migration `202610080004_engagement_period`) and snapshotted on each Trial Balance import when it is staged (`TbImport.engagementPeriod`). Finalization refuses an engagement with no recorded period and refuses an import whose snapshot differs from the current period. The duplicate-engagement check now compares name and period, as its message always said; before this change it compared the name alone and the period was never stored. Duplicate account codes stay refused. Only unbalanced periods and unmapped accounts block finalization.

Verified: `tests/tb-statutory-period.integration.ts` (PostgreSQL 18.6, 1 of 1): no-period refusal, restaged import, changed-period refusal, restored-period finalization, and the name-and-period duplicate policy. The existing finalization tests (`tb-validation`, `tb-finalize-versions`, `tb-statement-summary`) record `FY2026` on their engagements and pass (3 of 3).
