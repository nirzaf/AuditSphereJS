# Task handoff

## Identity

Task ID: T085 — Implement TB-linked benchmark selection and normalization
Requirement IDs: R032, R033, R034, R035 (CURRENT source lines 468–472), R036 (lines 473–474)
Implementing commit/branch: `main`, the commit that contains this handoff
Status: IN_REVIEW

## Intended and delivered outcome

Offer only the four CURRENT benchmarks (profit before tax, revenue, total assets, net assets), each with its CURRENT range, and derive each amount from the mapped trial balance. Profit before tax excludes the tax line. Normalized profit before tax is the tax-excluded figure plus recorded, approved adjustments that the pure calculator receives as inputs (D19). Normalization for any other benchmark is refused, and the adjustments are stored with their approver and reason.

This is an existing-implementation change to the governance module: it amends code from earlier commits and does not start a new module.

Not delivered: the benchmark-selection screen (source balances and percentage preview, card checklist item 54). The Angular catalog offers only the four benchmarks.

## Files and contracts

- `packages/server/src/modules/governance/materiality.ts`: pure calculator. `materialityBenchmarks` lists the four kinds. `deriveBenchmark` selects statement sections, excludes tax from profit before tax, and accepts normalization only for profit before tax. `validateMateriality` applies the CURRENT ranges.
- `packages/server/src/modules/governance/materiality-service.ts`: normalization approvals must come from an approver who holds `MATERIALITY_APPROVE` and is not the calculator; normalization for a non-profit-before-tax benchmark is refused; rounding is checked before persistence; `rawPlanningMateriality` and `normalizationAdjustments` are persisted.
- `packages/server/src/modules/governance/materiality-controller.ts`: the allowlisted view adds the raw planning materiality and the recorded adjustments.
- `packages/contracts/src/index.ts`: `materialityBenchmarkKinds` (four), `materialityHistoricalBenchmarkKinds` (read-only history), `normalizationAdjustmentSchema`, and the extended calculation and assessment schemas. `packages/contracts/schema.json` and `openapi.json` regenerated; `pnpm contracts:check` passes.
- `packages/server/src/index.ts`: exports `roundingPolicyMessage`, `practicalRoundingLimitPercent` and the `NormalizationAdjustment` type.
- `prisma/schema.prisma` and migration `prisma/migrations/202610080005_materiality_dn07/`: adds nullable `rawPlanningMateriality` and `normalizationAdjustments` to `MaterialityAssessment`, and the CHECK `materiality_normalization_check` (normalization only for PROFIT_BEFORE_TAX). The rounding CHECK is T086's.
- `apps/web/src/module-catalog.ts`: the benchmark choices show only the four; `TOTAL_EXPENSES`, `MAPPED_LINE` and the `destinationCode` field are removed.
- Tests: `tests/materiality.test.ts` (12 tests), `tests/materiality-persistence.integration.ts`. `scripts/verify-task.mjs` gains the T085 and T086 recipes.

No unrelated change. `fixtures/characterization/materiality.json` is unchanged: it records the source calculator, which is history, and D19 supersedes its benchmark list. The migration is additive.

## Dependency evidence

No dependency changes. `pnpm-lock.yaml` is unchanged; SHA-256 `0fce85b5559c504fb084b1acfa6b080de5f95c68b9f75afb6b3449db08acbfb1`.

## Decisions

- D19 (DN-07), owner-approved 2026-10-08: remove the two extra benchmarks; use the CURRENT ranges; normalize profit before tax only through recorded, approved adjustments supplied to the pure calculator; limit manager rounding of PM to plus or minus 5 %.
- D05 (numeric boundaries and rounding): the range checks follow it.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T085` | Prisma generate, `tsc -b`, contracts check, materiality unit, materiality PostgreSQL | exit 0 | Contract schemas and OpenAPI match; unit 12 of 12; persistence 1 of 1 on PostgreSQL 18.6 (34.1 s) |
| `pnpm exec vitest run tests/materiality.test.ts` | Unit file, no database | 12 of 12 passed | Includes the new endpoint and zero-denominator assertions |
| `pnpm verify:affected`, first run | Boundaries, Angular build, full vitest | failed: 1 test, 166 of 167 passed | `tests/tb-fixtures.test.mjs` "parses the 50000-row CSV" took 5105 ms against the 5000 ms timeout while the machine was loaded |
| `pnpm exec vitest run tests/tb-fixtures.test.mjs`, idle rerun | The same file | 8 of 8 passed | 9.08 s of test time |
| `pnpm verify:affected`, rerun | Boundaries, typecheck, Angular build, full vitest | exit 0 | 32 of 32 files; 167 of 167 tests |
| `pnpm lint` | ESLint and boundaries | exit 0 | Boundaries passed |

The first affected run failed on a timing assertion. It is not a functional failure, and the rerun passed. The test is still sensitive to load; this stage did not change it.

## Acceptance criteria

- **AC1 (benchmark ranges at their endpoints).** `tests/materiality.test.ts` accepts and rejects the CURRENT boundaries for profit before tax (5 and 10 %), revenue (0.5 and 2 %), total assets (0.5 and 1 %) and net assets (1 and 2 %). Each value just outside a range is refused. Status: met.
- **AC2 (selected benchmark reconciles to the retained snapshot).** `tests/materiality-persistence.integration.ts` asserts the stored benchmark amounts against the snapshot's mapped lines (REVENUE 2,000,000.000000; normalized PROFIT_BEFORE_TAX 1,100,000.000000) and binds the assessment to the published version. The unit test derives all four benchmarks from fixture mapped lines, but only REVENUE and normalized PROFIT_BEFORE_TAX are asserted against stored rows; TOTAL_ASSETS and NET_ASSETS are not asserted against a stored snapshot. Status: partly proven.
- **AC3 (unsupported normalization cannot silently change PM).** `deriveBenchmark` throws for normalization on a non-PBT benchmark. The service refuses it, refuses a self-approved or unauthorized approver, and the database CHECK `materiality_normalization_check` rejects a raw insert. The raw planning materiality is always kept. Status: met.

Denied and failure paths are covered: self-approval, an approver without authority, normalization on REVENUE, rounding of 60,000 against a computed 20,000, and the retired TOTAL_EXPENSES kind.

## Recovery and authorization

A refused calculation writes nothing: the calculation runs in one transaction, and the refusal tests confirm no assessment row is created. The migration is additive (two nullable columns and one CHECK), so a code rollback does not drop it. No merge, deployment or production data repair is authorized by this handoff.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: none for the recorded checks. The benchmark-selection screen (checklist item 54) remains open.
Next eligible task by dependency order: not assigned. The next NOT_STARTED ledger row is T090; this handoff does not check its dependencies.
Stop after this task; do not implement the next one without assignment.

## Addendum — API contract suite repaired (2026-10-08)

The DN-07 change made the materiality response require `rawPlanningMateriality`, `normalizationAdjustments` and (added with DN-06) `invalidated`. The API contract fixture `apps/api/tests/contracts.integration.ts` still returned the old shape, so `GET …/materiality-view` answered 500. Neither `verify:task -- T085` nor the affected suite runs that file, so the failure reached `main` in commit `d3e399b` unnoticed. The fixture and the schema are corrected in the DN-06 commit; `node --import tsx --test apps/api/tests/contracts.integration.ts` passes 1 of 1.
