# Task handoff

## Identity

Task ID: T043 — Implement import-batch staging and source-document provenance
Requirement IDs: R041 (CURRENT.md lines 487-489)
Implementing commit/branch: uncommitted working tree on `main` (not committed; see the commit status note in the chat)
Status: IN_REVIEW — the recorded checks pass; independent review has not happened and the ledger has not been changed to DONE.

## Intended and delivered outcome

Each staged Trial Balance row now records the exact source line it was read from and the untrimmed raw cell text, separately from the normalized decimal amounts. PostgreSQL enforces that provenance is either fully present or absent, and blocks later changes to staged source values. Mapping still updates `fsli` and `version` only. The import status contract now exposes the nine states the database already allowed.

Not changed: the Trial Balance upload path, the outbox/queue flow, finalization, the row response allowlist (the API still does not return `sourceLine` or `rawValues`), and the Angular UI.

Greenfield or existing: existing implementation. The T043 checklist items for XLSX provenance and multi-period/entity staging remain open (XLSX is owned by T045).

## Files and contracts

- `prisma/schema.prisma` — `TbRow.sourceLine Int?` and `TbRow.rawValues Json? @db.JsonB` added; the model block was realigned.
- `prisma/migrations/202610080001_tb_row_source_provenance/migration.sql` — new migration. Adds both nullable columns; `TbRow_source_provenance_check` requires both NULL or `sourceLine >= 2` with `rawValues` present; trigger `staged_source_values_immutable` raises on UPDATE of `position`, `importId`, `code`, `name`, `current`, `prior`, `sourceLine` or `rawValues`. DELETE and INSERT are unaffected, so retry replacement still works. Existing rows are untouched and keep both columns NULL.
- `packages/server/src/modules/fieldwork/parser.ts` — `TrialBalanceRow` gains `sourceLine` and `rawValues`. `parseTrialBalance` now uses csv-parse `info` line numbers, matching the stream parser (it previously assumed `index + 2`).
- `packages/server/tests/parser.test.ts` — exact-match expectations updated for the new fields.
- `packages/contracts/src/index.ts` — `trialBalanceImportSchema.status` widened from five to nine states.
- `packages/contracts/schema.json`, `packages/contracts/openapi.json` — regenerated with `contracts:generate` and `openapi:generate`; `contracts:check` passes.
- `tests/tb-staging.integration.ts` — new PostgreSQL 18.6 integration test (see below).
- `scripts/verify-task.mjs` — T043 recipe added, plus the `trial-balance-staging` integration mapping.
- `package.json` — `tests/tb-staging.integration.ts` added to `test:integration`.
- `packages/server/src/modules/fieldwork/README.md` — provenance and immutability paragraph.

Migrations: one additive migration, reversible in practice by dropping the trigger, function, check and columns. No data is rewritten. No audit, permission, state-machine or module-boundary rule changed.

Source-line semantics: `sourceLine` is csv-parse's `info.lines` at record end. It is exact for single-line records, which is what the test covers. Records containing embedded newlines are not tested and should be treated as unverified.

## Dependency evidence

No dependency changes.

## Decisions

No applicable D01–D12 decision was changed or newly approved. The status vocabulary follows the existing database CHECK and the lifecycle list in the T043 task, not a new policy default.

## Executed verification

Environment note: `pnpm` is not on the shell PATH on this machine. Commands were run through `corepack pnpm@12.8.1`, the version pinned in `package.json`. For `verify:affected` and `lint`, a `pnpm.cmd` shim forwarding to that corepack command was prepended to PATH in the scratchpad, because the scripts re-invoke `pnpm` through cmd.exe.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm build:server` (`prisma generate && tsc -b`) | Generated Prisma client 7.10.0 | exit 0 | Local run |
| `pnpm contracts:generate`, `pnpm openapi:generate`, `pnpm contracts:check` | Canonical Zod schemas and Nest decorators | all exit 0; "Contract schemas match runtime definitions", "OpenAPI matches API decorators" | Local run |
| `pnpm verify:task -- T043` | Recipe: build:server, contracts:check, trial-balance-csv, api-contracts, trial-balance-staging | exit 0, final line `T043: recorded checks passed` | Local run, log in scratchpad |
| — trial-balance-csv (Vitest `packages/server/tests/parser.test.ts`) | Parser unit tests | 1 file, 6 of 6 passed | Local run |
| — api-contracts (`apps/api/tests/contracts.integration.ts`) | Nest/Fastify contract fixture on PostgreSQL | 1 of 1 passed | Local run |
| — trial-balance-staging (`tests/tb-staging.integration.ts`) | Fresh `postgres:18.6` Testcontainers DB, migrations deployed, `local-s3` storage | 1 of 1 passed (~34 s) | Local run |
| `pnpm verify:affected` | Boundaries, server/test typechecks, Angular production build, all Vitest | exit 0; 31 files, 145 of 145 tests passed | Local run |
| `pnpm lint` | ESLint + import boundaries | exit 0; "Module and browser import boundaries passed" | Local run |
| `git diff --check` | Whitespace | exit 0 (only git line-ending notices for CRLF conversion) | Local run |

Discovered counts are the counts reported by the runners above. No intended test was skipped.

## Acceptance criteria

- **AC1 — re-import creates a new batch without altering historical balances.** The test uploads `tb-2026.csv`, processes it, snapshots its rows (code, amounts, fsli, sourceLine, rawValues, version), then uploads changed content as a new version of the same document. The second batch is a new `TbImport` with 3 rows and is processed. The first batch's rows are deep-equal to the snapshot, and its status and row count are unchanged.
- **AC2 — retried staging does not multiply rows.** (a) Identical content resolves to the existing batch, and no second batch or row is created. (b) A batch that already has rows from an earlier attempt is reprocessed; after processing it has exactly its 3 parsed rows, the stale rows are gone, and the other batch's rows are unchanged. (c) A parse failure after the first 1,000-row chunk has been written rolls back the whole staging transaction: 0 rows remain, the batch is `QUEUED` with the error, and the operation is `QUEUED` for retry.
- **AC3 — the imported source file and row can be traced from any staged balance.** Account `200` is recorded at `sourceLine` 3. Its `rawValues` equal the untrimmed source cells. The batch's `documentVersionId` points to a version with the batch's SHA-256 and document ID. The stored bytes for that version, split by line, have line 3 beginning with `200,`. Every row staged by the change has a non-null `sourceLine`.
- **Immutability (supporting):** updating a staged `current` value raises "Staged trial-balance source values are immutable", while updating `fsli`/`version` succeeds.

Denied and failure paths covered: the mid-stream parse failure (rollback), and the immutability rejection. The authorization-denied path is not tested in this change; it is covered by the existing upload and authorization tests.

## Recovery and authorization

A failed parse still rolls back all staged rows in its transaction, and the retry policy is unchanged. The migration does not repair or backfill legacy rows: they keep `sourceLine` and `rawValues` NULL and must not be presented as traceable. No production data was touched. No merge, deployment or migration to a shared database has been authorized or performed.

## Limitations

- **Status states:** the database CHECK already allowed UPLOADED, VALIDATING, READY_TO_FINALIZE and FINALIZING; the contract now exposes them. No code path currently writes UPLOADED, VALIDATING, READY_TO_FINALIZE or FINALIZING. The batch moves QUEUED → PARSING → MAPPING_REQUIRED (or FAILED). Writing the remaining states belongs to the finalization work (T049/T081) and is not claimed here.
- **Traceability is not exposed over the API.** `sourceLine` and `rawValues` are server-side only; the row response allowlist is unchanged. AC3 is proven at the service and database level.
- **Storage:** tested with `local-s3` only. The Graph/SharePoint download path for the same lineage is not exercised here.
- **Embedded newlines in quoted CSV fields** are not covered by a test, so their `sourceLine` is unverified.
- **Legacy rows** staged before this migration are not traceable.
- **XLSX provenance and multi-period/entity staging** remain open (T045 and later).
- The integration test runs the real worker transaction against PostgreSQL, but it calls the processor directly with a job-shaped object rather than through BullMQ. Queue delivery is covered by the existing outbox and queue-runtime tests, which were not rerun.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers: none for the recorded checks; the limitations above need reviewer acceptance.
Next eligible task by dependency order: T044 (IN_REVIEW, background CSV parser) is the next open item in the TB chain; T045 (XLSX) is NOT_STARTED after it.
Stop after this task; do not implement the next one without assignment.

## Addendum — validation failure path (2026-10-08)

T044 changed the failure behaviour the staging test asserts. A duplicate or malformed row is now a permanent `TrialBalanceValidationError`: the import is FAILED on its first attempt, the operation fails with `TB_IMPORT_INVALID`, and the source line is recorded in `TbImportRowError`. Earlier text in this handoff that describes that failure as requeued is superseded. The retry-based assertions for transient failures are unchanged in intent. `pnpm verify:task -- T043` was rerun after the change and passed (6 parser tests, api-contracts 1 of 1, staging 1 of 1). T043 remains IN_REVIEW.
