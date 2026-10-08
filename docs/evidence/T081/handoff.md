# Task handoff

## Identity

Task ID: T081 — Finalize an immutable TB version through real business gates
Requirement IDs: R041 (CURRENT.md lines 487-489)
Implementing commit/branch: `main` (commit follows this handoff)
Status: IN_REVIEW — AC2 and AC3 are proven for the existing finalization command. AC1 and the supersession checklist item are open, because they need a rule that has not been decided. The ledger has not been changed.

## Intended and delivered outcome

Finalization already marks an import FINALIZED with a version guard, an audit event, and an engagement row lock (`finalize` in `packages/server/src/modules/fieldwork/service.ts`). This task proves the concurrency and queryability behaviour the acceptance criteria require. It adds no new command and changes no behaviour.

Not delivered (checklist items still open):

- **Supersession.** The checklist requires that a later import creates a candidate version and that finalizing it requires explicit supersession of the earlier one, identifying affected approvals. The code does not do this. Two imports in one engagement can both be FINALIZED, and the test shows this happens. A rule for "one active version" has not been decided, so none is assumed.
- **Immutable snapshot in one operation.** Finalization sets a status. The mapping versions and the aggregate identity are not committed as a separate immutable snapshot. The publication module stores the published rows separately.
- **Planning and assigned-user guards (AC1).** Finalization requires `FIELDWORK_FINALIZE`, which the role matrix grants to REVIEWER and APPROVER only, and the engagement must be in FIELDWORK_EXECUTION. Planning state and assignment checks belong to the planning workstream (T088) and are not part of this test.

## Files and contracts

- `tests/tb-finalize-versions.integration.ts` (new): PostgreSQL 18.6 test.
- `scripts/verify-task.mjs` (T081 recipe) and `package.json` (`test:integration`).

No migration, contract or API change.

## Dependency evidence

No dependency changes.

## Decisions

Open: the supersession rule. Options include forbidding a second active finalized version per engagement, or requiring an explicit supersede command that names the earlier version and its approvals. This needs a decision before the checklist can be closed.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T081` | PostgreSQL 18.6, two balanced mapped imports, concurrent finalize pair | exit 0; 1 of 1 passed | local run |
| `pnpm verify:affected` | boundaries, typechecks, Angular build, all Vitest | exit 0; 32 files, 160 of 160 tests | local run |
| `pnpm lint` | ESLint and import boundaries | exit 0 | local run |

## Acceptance criteria

- **AC2 — a new TB version leaves the previous version queryable.** After a second batch is finalized, the first batch's statement summary and its row set (codes, balances, FSLIs and source lines) are identical to before.
- **AC3 — concurrent finalize commands select at most one version.** Two concurrent finalize commands for the same batch and version: one succeeds, one is refused with 409, and exactly one `TB_FINALIZED` audit event is written. A later stale finalize is refused and does not move the version.
- **AC1 — not proven.** The test uses the reviewer grant and FIELDWORK_EXECUTION state. The planning and assigned-user guards are not implemented in this path.

## Recovery and authorization

A refused finalization changes nothing (asserted). No production data was touched.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: the supersession rule (decision); planning and assigned-user guards (T088 dependency).
Next eligible task by dependency order: T080 (mapping memory and corrections, IN_REVIEW).
Stop after this task; do not implement the next one without assignment.

## Addendum — DN-04 / D16: statutory period at finalization (2026-10-08)

Finalization now refuses a missing statutory period and refuses an import staged for a different period (see the T079 addendum and `tests/tb-statutory-period.integration.ts`). Supersession (DN-06) is still open, so AC1 and the supersession item remain open.

## Addendum — DN-06 / D18: supersession of finalized versions (2026-10-08)

At most one finalized Trial Balance version is active per engagement. Finalization refuses a second version while one is active, in the service and in PostgreSQL (partial unique index `TbImport_one_active_finalized_key`). A new `supersede` command (`packages/server/src/modules/fieldwork/service.ts`, route `POST …/:id/supersede` in `controller.ts`) requires `FIELDWORK_FINALIZE`, the engagement state, the expected version and a reason of at least ten characters. It moves the active version to `SUPERSEDED`, records each approved materiality assessment that cites it as an append-only `MaterialityInvalidation`, and writes a `TB_SUPERSEDED` audit event.

A superseded version stays immutable: the `protect_finalized_rows` trigger now covers `SUPERSEDED` as well as `FINALIZED`. It cannot be published, and it cannot carry a new materiality calculation or approval. Its statement summary stays readable and unchanged.

Evidence: `pnpm verify:task -- T081` exit 0 (`tests/tb-finalize-versions.integration.ts` 1 of 1, rewritten so a later batch is finalized only after the earlier one is superseded; `tests/tb-supersession.integration.ts` 1 of 1 on PostgreSQL 18.6). The other finalization tests were updated the same way: `tests/publication.integration.ts`, `tests/lifecycle.integration.ts`, `tests/tb-statutory-period.integration.ts`, `tests/xlsx-import.integration.ts` and `tests/materiality-persistence.integration.ts`; all passed in the ten-file integration run, and `tests/publication.integration.ts` was re-run on its own after a test-only import fix.

AC1 (single-winner finalization under concurrency) is still proven by the concurrency section of `tests/tb-finalize-versions.integration.ts`. The supersession item is now implemented. Remaining open: the planning and assigned-user guards (T088 dependency).
