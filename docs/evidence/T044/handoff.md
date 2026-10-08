# T044 handoff — bounded Trial Balance CSV parsing

## Identity

Task ID: T044  
Requirement IDs: R041  
Implementing commit/branch: pending commit on `main`  
Status: IN_REVIEW

## Intended and delivered outcome

The Fieldwork worker validates Trial Balance CSV records as an async stream and writes validated rows in batches of at most 1,000 within the existing scoped PostgreSQL transaction. CSV header/encoding/quoted-value rules are explicit; account codes remain strings; monetary inputs use the shared decimal schema; malformed values include source-line context. The storage adapter still returns a bounded payload (currently capped at 15 MB) before parsing, and duplicate detection retains a set of account codes. This change does not claim end-to-end object-storage streaming, durable per-row error records, cancellation/progress checkpoints, or spreadsheet-export formula policy.

## Files and contracts

- `packages/server/src/modules/fieldwork/parser.ts`: streaming parser, strict row checks, source-line errors, 50,000-row limit, and bounded chunk writer.
- `packages/server/src/worker.ts`: uses the stream/chunk writer while preserving the existing scoped transaction and import state update.
- `packages/server/src/index.ts`: exports the parser and chunk helper.
- `packages/server/tests/parser.test.ts`: CSV edge cases, malformed inputs, 50,000-row stream, and chunk-boundary behavior.
- `scripts/verify-task.mjs`: records T044's targeted verification recipe.
- `packages/server/src/modules/fieldwork/README.md`, this task, execution ledger and this handoff: module behavior and evidence status.

No schema migration, public API contract or dependency was changed.

## Dependency evidence

No dependency changes. The implementation uses the already-installed `csv-parse` package.

## Decisions

No professional-policy behavior was introduced. Formula-like export handling remains unresolved because this parser does not export spreadsheet files.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm exec vitest run packages/server/tests/parser.test.ts` | Parser unit tests: BOM/CRLF/quoted comma/leading zero, bad headers/rows/numbers, 50,000-row stream and chunk sizes | PASS, 5 tests | Local test output, 2026-10-02 |
| `pnpm build:server` | Prisma client generation and TypeScript project build | PASS, exit 0 | Local command output, 2026-10-02 |
| `pnpm verify:task -- T044` | Recorded build plus parser test recipe | PASS, build and 5 parser tests | Local command output, 2026-10-02 |
| `pnpm verify:affected` | Module boundaries, server and Angular type/build plus unit suite | PASS, 16 test files / 76 tests | Local command output, 2026-10-02 |
| `pnpm lint` | ESLint and module boundaries | PASS, exit 0 | Local command output, 2026-10-02 |
| `git diff --check` | Patch whitespace validation | PASS, exit 0; Git reported only line-ending normalization warnings | Local command output, 2026-10-02 |

## Acceptance criteria

AC1, AC2 and AC3 have focused unit evidence in the parser test file. This does not establish real PostgreSQL worker correctness, browser/editor acceptance, cancellation/progress behavior, or overall T044 completion. T043 is IN_REVIEW, T031 and T017 are not complete; therefore T044 remains IN_REVIEW.

## Recovery and authorization

Row deletion, chunk inserts, import state update and outbox completion remain inside the pre-existing PostgreSQL transaction; parse or insert failures roll that transaction back. No production data repair was performed. User authorized direct pushes to `main`; deployment remains outside scope.

## Review and next task

Reviewer: pending  
Review result: pending  
Open blockers: T043, T031, T017; PostgreSQL worker integration; cancellation/progress and durable error detail; browser flow; formula/export policy.  
Next eligible task by dependency order: close outstanding T043/T031/T017 prerequisites, then complete T044 acceptance review.

## Increment 2 — row-error records, progress checkpoints and terminal validation (2026-10-08)

Implemented the two open checklist items that do not depend on a policy decision:

- **Durable, source-line row errors.** `parseTrialBalanceStream` and `parseTrialBalance` now collect every row-level defect with its source line instead of stopping at the first one. Collection is capped at 100 errors (`MAX_ROW_ERRORS`), so a hostile file cannot grow the list without bound. Each rejection is a `TrialBalanceValidationError` carrying `rowErrors`. Migration `202610080002_tb_import_row_errors_and_progress` adds the append-only `TbImportRowError` table, bound to its import by a composite foreign key, unique per `(importId, sourceLine)`, with a trigger that blocks UPDATE and DELETE. The worker writes these rows in the same transaction as the FAILED status.
- **Validation is terminal.** A permanent input defect is no longer retried three times. The operation fails with the stable code `TB_IMPORT_INVALID`, and redelivery of the same job changes nothing. Transient failures (hash mismatch, database errors, cancellation) keep their previous retry behaviour.
- **Progress checkpoints.** After each committed 1,000-row chunk, the worker records the number of rows staged on `background_operations.progressRows`. The write uses its own connection, so the value survives the rollback of the staging transaction. Progress is advisory: a failed checkpoint does not fail the import. Cancellation was already cooperative (T031) and is now exercised together with the checkpoint.
- **Grants.** `scripts/provision-local-roles.ts` grants the worker role `INSERT` on `TbImportRowError` and nothing wider.

Not implemented, by design: the formula-like export hazard item stays open. The decision register has no approved export or formula policy, and this parser does not write spreadsheet files, so no default was invented.

### Verification (this increment)

| Command / test | Result | Evidence |
| :--- | :--- | :--- |
| `pnpm build:server` (`prisma generate && tsc -b`) | exit 0 | local run |
| `pnpm verify:task -- T044` (build, parser unit, staging integration, validation integration) | exit 0; parser 8 of 8 (`packages/server/tests/parser.test.ts`), `tests/tb-staging.integration.ts` 1 of 1, `tests/tb-validation-progress.integration.ts` 1 of 1 on PostgreSQL 18.6 | local run |
| `pnpm verify:affected` | exit 0; 31 files, 147 of 147 Vitest tests; boundaries and typechecks pass | local run |
| `pnpm lint` | exit 0; import boundaries pass | local run |
| `git diff --check` | exit 0 | local run |

New PostgreSQL assertions cover: three distinct defects recorded at lines 3, 4 and 5 with the first message as the summary; zero staged rows after rejection; one attempt and terminal `TB_IMPORT_INVALID`; no duplicate evidence on redelivery; 150 defects capped at 100 records; cancellation at the boundary after the first chunk leaving `progressRows` = 1,000 while the staging rolls back to zero rows.

### Remaining T044 items and blockers

- Formula-like export hazard policy: open, awaiting an approved decision.
- The worker role's grants are verified by inspection of the provisioner, not by running the worker as that role; the tests run as the migration owner.
- Row errors are stored but not yet exposed through an API or UI.
- T043 remains IN_REVIEW, so T044's dependency on it is not yet DONE. T044 stays IN_REVIEW.

## Addendum — DN-03 / D15: formula-like export text (2026-10-08)

The owner decided DN-03 as option A. The Practice trial balance and profit and loss CSV exports now protect text cells that begin with =, +, -, @, tab or carriage return by prefixing an apostrophe. Amount and count cells are never altered, and each exporter names its amount columns explicitly. The shared helper is `apps/web/src/csv-export.ts`, covered by `apps/web/src/csv-export.spec.ts` (3 of 3).

Verified: `pnpm verify:task -- T044`, `T145` and `T146` (exit 0); the Practice trial balance and profit and loss specs (existing assertions unchanged); `pnpm verify:affected` (161 tests); `pnpm lint`; `pnpm build` (Angular production build).
