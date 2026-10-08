# Task handoff

## Identity

Task ID: T089 — Handle new TB/materiality versions after sign-off safely
Requirement IDs (card): R036, R042, R058, R059, R079
Implementing commit/branch: `main`, the commit that contains this handoff
Status: IN_REVIEW

## Intended and delivered outcome

Superseding a finalized Trial Balance version invalidates the approved materiality assessments that cite it. The invalidation is an append-only record (`MaterialityInvalidation`); the approved assessment is not rewritten. The planning gate and the readiness summary count only live approvals of the active version, and a superseded version can neither be approved nor carry a new calculation (D18).

This handoff covers only the DN-06 part of T089. The earlier staleness work (a newer published version marks prior assessments stale, recorded in the migration P6-02 record) is not re-verified here.

Not delivered: formal invalidation notices, downstream-plan staleness beyond the planning gate, and the T082 dashboard, which is not started.

## Files and contracts

- `prisma/migrations/202610080006_tb_supersession_dn06/migration.sql`: adds `SUPERSEDED` to the import status CHECK; the partial unique index `TbImport_one_active_finalized_key`; the widened `protect_finalized_rows` trigger; the append-only `MaterialityInvalidation` table with a guard trigger (only an approved assessment of a superseded version can be invalidated). The migration refuses to apply while any engagement has more than one finalized version.
- `prisma/schema.prisma`: `MaterialityInvalidation` and its relations.
- `packages/server/src/modules/fieldwork/service.ts` and `controller.ts`: finalization refuses a second active version; the `supersede` command and route.
- `packages/server/src/modules/governance/materiality-service.ts`: calculation and approval refuse a superseded version; the latest and list views report `invalidated`.
- `packages/server/src/modules/governance/lifecycle.ts`: the START_FIELDWORK gate counts only approvals without an invalidation record.
- `packages/server/src/modules/commercial/engagements.ts`: readiness reports the active version only.
- `packages/contracts/src/index.ts`, `schema.json`, `openapi.json`: `supersedeSchema`, `trialBalanceSupersededSchema`, and `invalidated` on the materiality view.
- Tests: `tests/tb-supersession.integration.ts` (new); `tests/materiality-persistence.integration.ts`, `tests/publication.integration.ts`, `tests/lifecycle.integration.ts`, `tests/tb-finalize-versions.integration.ts`, `tests/tb-statutory-period.integration.ts`, `tests/xlsx-import.integration.ts`, `apps/api/tests/contracts.integration.ts` updated for the new rule.
- `scripts/verify-task.mjs`: T089 recipe (new; the task previously had none); T081 recipe includes `tb-supersession`.
- `package.json`: `test:integration` includes `tests/tb-supersession.integration.ts`.

No unrelated change. The migration is additive except the CHECK replacement and the trigger replacement, both of which keep existing rows valid.

## Dependency evidence

No dependency changes. `pnpm-lock.yaml` is unchanged; SHA-256 `0fce85b5559c504fb084b1acfa6b080de5f95c68b9f75afb6b3449db08acbfb1`.

## Decisions

- D18 (DN-06), owner-approved 2026-10-08: at most one active finalized version per engagement; a new version is finalized only after an explicit, audited supersede command invalidates the approvals that cite the old version.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T089` (build:server, contracts:check, materiality-persistence, tb-supersession) | Real PostgreSQL 18.6 containers | exit 0 | persistence 1 of 1 (23.5 s); tb-supersession 1 of 1 (25.4 s) |
| `pnpm verify:affected` | Boundaries, typecheck, Angular build, unit | exit 0 | 32 of 32 files; 167 of 167 tests |
| `pnpm lint` | ESLint and boundaries | exit 0 | Boundaries passed |
| Other finalization integration tests, one run per file | tb-finalize-versions, publication, lifecycle, tb-statutory-period, tb-validation, xlsx-import, adjustments, tb-statement-summary, acceptance-cases, apps/api contracts | all passed | `publication` was re-run after a test-only import fix and passed 1 of 1 |

The first run of the ten-file batch failed one file with a missing import in the test; it was corrected and re-run, not excluded.

## Acceptance criteria

- **AC1 — changed TB version invalidates downstream version-bound approvals.** `tests/tb-supersession.integration.ts` shows that superseding the published version writes one `MaterialityInvalidation` for the approved assessment, leaves the assessment row unchanged, makes the latest view report `invalidated: true`, and refuses a new calculation on the superseded publication. A record cannot be created for a live approval, and an existing record cannot be rewritten. Status: met for materiality; sampling and the SRM are not yet built.
- **AC2 — unaffected historical evidence stays readable.** `tests/tb-finalize-versions.integration.ts` shows that the superseded version's statement summary and rows are unchanged. Publication history is not re-read in this change. Status: partly proven.
- **AC3 — archived engagement rejects normal reassessment mutations.** Not covered by this change. Status: not proven.

Denied and failure paths covered: finalizing a second active version (service and database), a stale version or a short reason on supersession, superseding a non-active version, publishing a superseded version, rewriting a superseded version's rows, a second supersession, and a direct invalidation of a live approval.

## Recovery and authorization

A refused supersession changes nothing (the status and version are checked in the same transaction). The migration refuses to apply over duplicate active versions and names the engagement to fix. No merge, deployment or production data repair is authorized by this handoff.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: invalidation notices and downstream-plan staleness; AC3 unproven.
Next eligible task by dependency order: not assigned.
Stop after this task; do not implement the next one without assignment.
