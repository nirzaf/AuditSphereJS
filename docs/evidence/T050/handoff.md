# Task handoff

## Identity

Task ID: T050 — Prove finalization and FSLI aggregation on synthetic data
Requirement IDs: R041 (CURRENT.md lines 487-489)
Implementing commit/branch: `main` (commit follows this handoff)
Status: IN_REVIEW — the recorded checks pass. The engine-level differential comparison against the source calculators (WP03/MIG-003) is not part of this change, and the ledger has not been changed, because review has not happened.

## Intended and delivered outcome

Finalization and FSLI totals were already implemented (`finalize`, `aggregate`, the publication module). This task adds the statement-ordered summary the checklist asks for:

- `GET /engagements/:engagementId/imports/:id/statement-summary` returns profit and loss lines first, then balance sheet lines, in the contract FSLI order. Each line has current, prior, change, percentage, direction and count, and any unmapped balance is reported separately.
- All totals are summed by PostgreSQL and converted once to `Decimal6`. Variance uses the shared `Decimal6.variance` rule, so a zero prior base is `NO_BASE` with a null percentage.
- The response carries explicit `ROUTE_PENDING` placeholders for the accounts receivable and workpaper routes. It contains no account codes and no raw rows.

The original `GET :id/summary` route is unchanged, so the published contract and any existing consumer keep working.

Not delivered:

- A comparison of this summary with the source calculators (WP03/MIG-003). That needs the migration harness, which is separate work.
- Reading the summary from the immutable published balance version. It reads the finalized import's rows. The publication module already stores the immutable version, and wiring the summary to it is a later step.

## Files and contracts

- `packages/contracts/src/index.ts`: `trialBalanceStatementLineSchema`, `trialBalanceStatementSummarySchema` and their type, registered for generation. `packages/contracts/schema.json` and `openapi.json` regenerated.
- `packages/server/src/modules/fieldwork/service.ts`: `statementSummary`, and imports of `fslis` and `Decimal6`.
- `packages/server/src/modules/fieldwork/controller.ts`: new route with its Swagger and serializer schema.
- `packages/server/src/index.ts`: exports `statementSummary`.
- `tests/tb-statement-summary.integration.ts` (new).
- `scripts/verify-task.mjs` (T050 recipe, which includes `contracts:check` and the API contract suite) and `package.json`.

No migration. The statement split is a presentation rule in `service.ts` (`PROFIT_AND_LOSS_FSLIS`), and it does not change any stored value.

## Dependency evidence

No dependency changes.

## Decisions

The profit and loss split (Revenue and Operating expenses) is an implementation choice derived from the FSLI list. It is not an approved accounting policy. Any statement-classification policy change should update that set and the test together.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm build:server`, `contracts:generate`, `openapi:generate`, `contracts:check` | Generated schemas and OpenAPI | all exit 0 | local run |
| `pnpm verify:task -- T050` (contracts:check, api-contracts, tb-statement-summary) | API contract fixture; PostgreSQL 18.6 test on a balanced five-row fixture | exit 0; api-contracts 1 of 1; `tests/tb-statement-summary.integration.ts` 1 of 1 | local run |
| `pnpm verify:affected` | Boundaries, typechecks, Angular build, all Vitest | exit 0; 32 files, 160 of 160 tests | local run |
| `pnpm lint` | ESLint and import boundaries | exit 0 | local run |
| `git diff --check` | whitespace | exit 0 | local run |

## Acceptance criteria

- **AC1 — expected totals match the fixture.** The five-row fixture (balanced in both periods) produces exact per-FSLI values, for example Revenue −200.000000 / −160.000000 with change −40.000000 and percentage −25.000000. The P&L and balance sheet lines together balance to zero in each period.
- **AC2 — the dashboard request does not return the full raw TB.** The response is aggregates only: no `code`, `rowId` or `name` keys, no account code values, and at most one line per FSLI.
- **AC3 — prior-year zero uses the approved representation.** Trade receivables with a zero prior balance reports `NO_BASE` with a null percentage, never 0%.

Failure and denial paths: an unmapped balance is reported as `unmapped` and blocks finalization (400); a PREPARER cannot finalize (the role matrix grants `FIELDWORK_FINALIZE` only to REVIEWER and APPROVER); a viewer cannot finalize.

## Recovery and authorization

The summary is read-only and writes nothing. No production data was touched. No deployment or merge was performed.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: the WP03/MIG-003 differential comparison; reading from the immutable publication.
Next eligible task by dependency order: T051 (measurement gate), then T078–T081.
Stop after this task; do not implement the next one without assignment.
