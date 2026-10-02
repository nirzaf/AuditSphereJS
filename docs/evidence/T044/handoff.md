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
