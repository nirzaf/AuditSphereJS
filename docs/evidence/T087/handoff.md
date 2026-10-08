# Task handoff

## Identity

Task ID: T087 — Risk colours and mandatory review routing
Requirement IDs: per the task card (docs/tasks/)
Implementing commit/branch: main, the commit that adds this handoff
Status: IN_REVIEW (ledger). This handoff records the recipe added for the DoD recipe rule; it is not an acceptance review.

## Intended and delivered outcome

Adds the recorded verification recipe in `scripts/verify-task.mjs` for T087, so `pnpm verify:task -- T087` runs the checks this task depends on. Colour derivation, append-only risk assessments and the RISK_PARTNER_CLEAR gate are exercised. Routing into workprograms (ledger note: remaining) is not covered. The colour rule is the open correction STE-JS-03 in the index.

## Files and contracts

- `scripts/verify-task.mjs`: the T087 recipe.
- No migration, contract or dependency change for this entry.

## Decisions

Recipe rule: docs/07-definition-of-done-additions.md item 1 (proposed). Adoption is owner-pending; the recipe was added because the current AGENTS.md requires one per task.

## Executed verification

| Command | Actual result |
| :--- | :--- |
| `pnpm verify:task -- T087` (build:server, contracts:check, risk (tests/risk.integration.ts)) | exit 0 on 2026-10-08 |

## Acceptance criteria

Not re-reviewed here. The recipe proves the listed tests run and pass; it does not prove the card's acceptance criteria against a reviewer's reading.

## Recovery and authorization

No data or migration change. No merge or deployment is authorized by this handoff.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: independent review of the card acceptance criteria.
Next eligible task by dependency order: not assigned.

## Verification addendum (2026-10-08)

This addendum supersedes the stale limitations above about the broad stale/invalidation assertion and the not-regenerated differential report. `tests/risk.integration.ts` now asserts the exact invalidated-materiality refusal because this fixture explicitly supersedes the Trial Balance and creates a `MaterialityInvalidation`; it does not claim to test the separate stale-publication branch. `pnpm migration:differential` regenerated the output: 53 checks, 50 matches, 0 differences and 3 `SUPERSEDED` cases (including the former risk-band matrix). `pnpm verify:task -- T087` passed with exit 0, including Testcontainers PostgreSQL integration. `pnpm verify:affected` passed on retry: 33 files / 176 tests. The first restricted run hit Windows loopback `EACCES` in three tests; the authorized retry succeeded. The recorded prior unit test result and the independent-review limitation remain unchanged.
Stop after this task; do not implement the next one without assignment.

## Correction STE-JS-03: risk colour from balance against TE and PM (2026-10-08)

Finding 4 of `docs/00-index.md` section 3 (CURRENT section 4, line 198). The colour came from likelihood times magnitude, which CURRENT does not define. It is corrected as follows.

- The colour is computed from the absolute balance of the named account in the latest published trial balance, against the approved materiality's tolerable error (TE) and planning materiality (PM). Boundaries follow the approved D05 default (`docs/decisions/T003-methodology-defaults.md`): GREEN iff |balance| < TE; AMBER iff TE <= |balance| < PM; RED iff |balance| >= PM. A significant estimate or fraud risk forces RED regardless of amount, which covers the "high inherent risk" override in the card.
- The rule version is `STE-RISK-BAND-2026.2`. Rows written under `STE-RISK-BAND-2026.1` keep their recorded scores and stay valid under that version (`risk_band_derivation_check` branches on the version).
- The service refuses an assessment when no materiality is approved, when the approved materiality is invalidated, when it is stale against the latest publication, or when the account is not in the published rows. The caller cannot supply a balance, TE or PM.

Changed files:
- `prisma/migrations/202610080008_risk_colour_balance_t087/migration.sql` (new): nullable likelihood and magnitude; balance, TE, PM, account and materiality columns; the derivation check per rule version; an input check for the new version.
- `prisma/schema.prisma`: `RiskBandAssessment` gained the balance fields and a relation to `MaterialityAssessment`.
- `packages/server/src/modules/governance/materiality.ts`: `riskBand(inputs, significant, fraudRisk)`.
- `packages/server/src/modules/governance/risk-service.ts`: `assessRiskBand` reads the published balance and the approved materiality.
- `packages/contracts/src/index.ts`: `assessRiskSchema` now takes `accountCode`, `significant` and `fraudRisk`; the result schema carries the balance figures. `packages/contracts/schema.json` and `openapi.json` regenerated.
- `apps/web/src/module-workspace.ts`: the assessment form collects an account code instead of likelihood and magnitude.
- `tests/materiality.test.ts`, `tests/risk.integration.ts`: rewritten for the new rule, boundaries, staleness and the database constraints.
- `fixtures/characterization/materiality.json`: the `risk-band-matrix` case is annotated `supersededBy` and is no longer asserted. The legacy record is kept.

Executed verification:

| Command | Actual result |
| :--- | :--- |
| `pnpm db:generate`, `pnpm contracts:generate`, `pnpm build:server`, `pnpm openapi:generate`, `pnpm contracts:check` | Contracts match runtime definitions; OpenAPI matches API decorators. The first `contracts:generate` ran before the rebuild and wrote the old schema, so it was re-run after the build. |
| `pnpm exec tsc -p tsconfig.tests.json --noEmit` | Exit 0 |
| `pnpm exec vitest run tests/materiality.test.ts` | 14 passed (14) |
| `node --import tsx --test tests/risk.integration.ts` | pass 1, fail 0 (PostgreSQL 18.6 in Testcontainers) |
| `pnpm lint` | `LINT_EXIT=0` |
| `pnpm verify:affected` | `AFFECTED_EXIT=0`; Test Files 33 passed (33); Tests 176 passed (176) |
| `pnpm verify:task -- T087` | Exit 0; contracts check passed; risk integration pass 1, fail 0 |

Limitations:
- The stale-materiality assertion accepts either "stale" or "invalidated"; the test does not distinguish them.
- `docs/migration/inventory/differential.json` still records `risk-band-matrix` as MATCH from the legacy rule. It was not regenerated.
- AC1 (boundary colours) and AC2 (high inherent risk) are covered by the unit and integration tests above. AC3 (junior cannot satisfy red manager execution) rests on the existing `minimumRiskOwnerRank` rule and the owner-rank checks in the integration test. No reviewer has read the card's acceptance criteria against this change.

Reviewer: pending independent review
Review result: pending
Open blockers: independent review of the card acceptance criteria.
Next eligible task by dependency order: not assigned.
