# Task handoff

## Identity

Task ID: T049 — Implement atomic batch mapping with expected versions
Requirement IDs: R041 (CURRENT.md lines 487-489)
Implementing commit/branch: `main` (commit follows this handoff)
Status: IN_REVIEW — the server behaviour and its recorded test pass. The conflict-listing and Angular merge items remain open, and the ledger has not been changed, because review has not happened.

## Intended and delivered outcome

Trial Balance batch mapping was already implemented in `mapBatch` (`packages/server/src/modules/fieldwork/service.ts`) and its contract (`mappingSchema`: 1–500 changes, unique row IDs). No test exercised it directly. This task adds the PostgreSQL proof of its acceptance criteria and registers the recipe. The server behaviour was not changed.

Not delivered:

- **Returning all conflicting rows.** A stale batch returns one generic 409 (`One or more rows changed; reload before saving`). It does not list which rows were stale.
- **Angular merge of response versions** while preserving unrelated dirty cells (checklist item 4). The mapping workspace is presentation-only today.
- **Stable lock order.** Mapping serializes on the engagement row lock (`SELECT … FOR UPDATE`), so two batches cannot deadlock on overlapping rows. The single `UPDATE` does not itself order rows.

## Files and contracts

- `tests/tb-batch-mapping.integration.ts` (new): PostgreSQL 18.6 test for the denied path, malformed input, AC1, AC2, AC3 and the successful batch.
- `scripts/verify-task.mjs`: T049 recipe and `tb-batch-mapping` integration mapping.
- `package.json`: test added to `test:integration`.

No migration, contract or API change.

## Dependency evidence

No dependency changes.

## Decisions

None applicable. Conflict reporting and the Angular merge are not policy decisions and remain open implementation items.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T049` (build:server, then `tests/tb-batch-mapping.integration.ts`) | Fresh `postgres:18.6` Testcontainers DB, migrations deployed, 3-row CSV | exit 0; 1 of 1 passed (~25 s) | local run |

## Acceptance criteria

- **AC1 — two editors racing one row: one success, one conflict, no lost data.** Two concurrent `mapBatch` calls with the same row and expected version 1 and different idempotency keys. Exactly one fulfils and the other rejects with 409 (`rows changed`). The row's version increments once to 2, and only the winner's FSLI is applied (the winner is read from its committed receipt).
- **AC2 — a stale row rolls the whole batch back.** A two-row batch where the second row's expected version is stale. The rejected batch leaves the first row unmapped, the batch version unchanged, and no `TB_MAPPED` audit event written.
- **AC3 — retrying after a lost response returns the original outcome.** Replaying the same key and body returns `{ saved: 1 }` without incrementing the row version, the batch version, or the audit trail. The same key with a different body is refused with 409.

Denied and failure paths: a reader without `FIELDWORK_WRITE` is refused and leaves every row unchanged; duplicate row IDs and empty batches are refused with 400 before the transaction.

## Recovery and authorization

A failed batch leaves no partial state (asserted). No production data was touched. No deployment or merge was performed.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: conflict listing (checklist item 3) and the Angular merge (item 4).
Next eligible task by dependency order: T050 (IN_REVIEW, finalization proof).
Stop after this task; do not implement the next one without assignment.
