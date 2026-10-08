# Task handoff

## Identity

Task ID: T086 — Calculate PM, TE, SAD and manager rounding
Requirement IDs: R036 (planning materiality formula), R037 (TE range, lines 475), R038 (SAD range, line 476), R039 (practical rounding within plus or minus 5 %, line 477)
Implementing commit/branch: `main`, the commit that contains this handoff
Status: IN_REVIEW

## Intended and delivered outcome

Calculate planning materiality (PM) and derive tolerable error (TE) and the SAD threshold from it, on the `Decimal6` primitive with half-to-even rounding. Manager rounding may move PM by at most 5 % of the computed value. The calculator refuses out-of-range percentages and non-positive bases. The computed (raw) and applied PM are both stored, so the rounding is visible and bounded.

This is an existing-implementation change to the governance module.

Not delivered: the Angular preview that mirrors the formulas (card checklist item 52). The Angular module is presentation-only and does not calculate materiality.

## Files and contracts

- `packages/server/src/modules/governance/materiality.ts`: `calculateMateriality` (PM, TE, SAD, raw and rounded PM), `roundingPolicyMessage` (the exact ±5 % test), `materialityInputHash` with prefix `materiality.v2`, binding the normalization, the applied value and the policy.
- `packages/server/src/modules/governance/materiality-service.ts`: refuses rounding outside the limit before persistence.
- Migration `prisma/migrations/202610080005_materiality_dn07/`: CHECK `materiality_rounding_check` (`raw IS NULL OR (raw > 0 AND ABS(planning − raw) * 100 <= raw * 5)`), so every writer is bound by the limit.
- `packages/contracts/src/index.ts`: `roundedPlanningMateriality` on the calculation input and `rawPlanningMateriality` on the assessment.
- Tests: `tests/materiality.test.ts` (12 tests), `tests/materiality-persistence.integration.ts` (1 test, many steps). `scripts/verify-task.mjs` gains the T086 recipe.

No unrelated change. The migration is shared with T085 and is additive. No dependency changes; the lockfile is unchanged.

## Dependency evidence

No dependency changes. `pnpm-lock.yaml` is unchanged; SHA-256 `0fce85b5559c504fb084b1acfa6b080de5f95c68b9f75afb6b3449db08acbfb1`.

## Decisions

- D19 (DN-07), owner-approved 2026-10-08: CURRENT TE (50–75 % of PM) and SAD (3–5 % of PM) ranges; manager rounding limited to plus or minus 5 %.
- D05 (numeric boundaries and rounding): the calculation order follows it.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T086` | Prisma generate, `tsc -b`, contracts check, materiality unit, materiality PostgreSQL | exit 0 | Contract schemas and OpenAPI match; unit 12 of 12; persistence 1 of 1 on PostgreSQL 18.6 (33.9 s) |
| `pnpm exec vitest run tests/materiality.test.ts` | Unit file | 12 of 12 passed | Includes the rounding boundary (21,000 accepted; 21,000.000001 refused) and the zero-denominator refusal |
| `pnpm verify:affected` | Full suite (see T085 for the timing failure and rerun) | exit 0 on the rerun | 32 of 32 files; 167 of 167 tests |
| `pnpm lint` | ESLint and boundaries | exit 0 | Boundaries passed |

## Acceptance criteria

- **AC1 (approved golden calculations pass exactly).** `tests/materiality.test.ts` reproduces the quoted revenue-driven figures and the CURRENT rounding example: computed PM 20,000 rounded to 21,000 gives TE 15,750 and SAD 1,050, all to six places. Status: met.
- **AC2 (out-of-range percentages and rounding beyond the limit fail).** Rate, TE and SAD ranges are refused at and just outside their boundaries. Rounding of 21,000.000001 and of 22,000 against a computed 20,000 is refused in code; the persistence test refuses a rounded 60,000 through the service; `materiality_rounding_check` refuses an out-of-limit raw insert. Status: met.
- **AC3 (zero denominator never yields Infinity, NaN or a false approval).** `calculateMateriality` throws for a zero benchmark, and `roundingPolicyMessage` refuses a zero computed PM. The database check also requires `raw > 0`. The zero case is proven in code; no separate database insert test covers it. Status: met in code, partly proven in the database.

## Recovery and authorization

A refused calculation writes nothing. The migration is additive, and a code rollback does not drop its CHECK. No merge, deployment or production data repair is authorized by this handoff.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: none for the recorded checks. The Angular formula preview (checklist item 52) remains open.
Next eligible task by dependency order: not assigned. The next NOT_STARTED ledger row is T090; this handoff does not check its dependencies.
Stop after this task; do not implement the next one without assignment.
