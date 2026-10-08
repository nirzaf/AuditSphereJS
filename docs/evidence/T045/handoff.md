# Task handoff

## Identity

Task ID: T045 — Implement bounded XLSX parsing and hostile-file limits
Requirement IDs: R041 (CURRENT.md lines 487-489)
Implementing commit/branch: uncommitted working tree on `main`
Status: IN_REVIEW — the recorded checks pass. Some checklist items are open, and the screened upload path is not yet wired. The ledger has not been changed, because review has not happened.

## Intended and delivered outcome

The fieldwork import worker now accepts an `.xlsx` workbook as well as CSV. Format is chosen by content: a ZIP container is read as a workbook, an OLE container is refused as encrypted or legacy, and anything else goes to the CSV path. A workbook is preflighted before ExcelJS sees it, and its single Trial Balance worksheet produces the same normalized rows, with the same validation messages and the same source line numbers, as the CSV twin.

Not delivered:

- **No user-facing upload accepts `.xlsx` yet.** The only accepted upload today is the JSON CSV path. Workbooks must go through the malware-screened staff upload pipeline (T033), which currently accepts only PDF and CSV. Extending that pipeline is a security-boundary change and needs a decision (see Review). Until then the workbook path is reachable only from the worker and tests.
- The cached-formula policy, the time bound and the isolated-process requirement remain open (see the checklist below).

Greenfield or existing: existing implementation. The CSV path and its behaviour are unchanged, except that its parse errors now go through the shared validation error type (T044).

## Files and contracts

- `packages/server/src/modules/fieldwork/workbook.ts` (new): ZIP preflight, the bounded ExcelJS reader, and format dispatch `parseTrialBalanceEvidence`.
- `packages/server/src/modules/fieldwork/parser.ts`: `MAX_ROWS`, `RowErrorCollector` and `rowFromRecord` are now exported so the workbook path shares one set of validation rules.
- `packages/server/src/modules/fieldwork/import-worker.ts`: parses through `parseTrialBalanceEvidence`.
- `packages/server/src/platform/storage.ts`: new `retrieveBytes`. `retrieve` decodes UTF-8, which corrupts binary files, so the worker's evidence loader (`packages/server/src/worker.ts`) now uses `retrieveBytes`. `storeBytes` and `retrieveBytes` are exported from `packages/server/src/index.ts`.
- `pnpm-workspace.yaml`: scoped override `exceljs>uuid: 11.1.1` with its advisory in a comment.
- `packages/server/package.json` and `pnpm-lock.yaml`: `exceljs` pinned to `4.4.0`.
- `packages/server/tests/workbook.test.ts` (new, 13 tests), `tests/xlsx-import.integration.ts` (new, PostgreSQL 18.6, 1 test).
- `scripts/verify-task.mjs` (T045 recipe) and `package.json` (`test:integration`).
- `docs/guides/02-compatibility-matrix.md`: ExcelJS row. `docs/evidence/T045/dependency-review.md`: review record.

No migration and no public API contract changed in this task. The T044 migration and contract changes are unchanged.

## Dependency evidence

`exceljs@4.4.0` (MIT, Node `>=8.3.0`, no peers) with about 200 transitive packages. A clean install audited two moderate `uuid` advisories, which the scoped override clears. `pnpm audit --prod --filter @auditsphere/server` then reports no known vulnerabilities. Full detail, including licenses, a `buffers` licence gap and the Linux smoke that is not yet run, is in [dependency-review.md](dependency-review.md).

## Decisions

- **Cached-formula policy: not decided.** The decision register has no spreadsheet policy. The reader rejects every formula cell with its source line and never evaluates or trusts a cached result. This is a conservative block, not an approved policy.
- **Sheet and header rules.** Exactly one worksheet is required. Header names must be exactly `code, name, current, prior` (any column order within the first 16 columns). Blank rows are skipped, as CSV blank lines are. These are fail-closed choices that have not been approved as policy.
- **Encrypted, legacy-binary, macro-enabled and multi-part workbooks are refused.** These are unsupported formats under the checklist, rather than defaults invented for a policy question.

## Executed verification

Environment note: pnpm 12.8.1 is installed globally (set up earlier in this session).

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm build:server` | Prisma client 7.10.0, `tsc -b` | exit 0 | local run |
| `pnpm verify:task -- T045` | build, parser unit, workbook unit, staging and validation integrations, workbook integration | exit 0. Vitest `parser.test.ts` 8 of 8; `workbook.test.ts` 13 of 13; `tb-staging` 1 of 1; `tb-validation-progress` 1 of 1; `xlsx-import` 1 of 1 on PostgreSQL 18.6 | local run |
| `pnpm verify:task -- T044` | recorded T044 recipe (rerun after the worker change) | exit 0; 8 of 8 | local run |
| `pnpm verify:task -- T043` | recorded T043 recipe (rerun after the worker change) | exit 0; 8 of 8 | local run |
| Processor-related integration suites: `outbox`, `queue-runtime`, `document-version`, `upload-race` | PostgreSQL 18.6 and Redis 8.10 Testcontainers | 4 of 4 passed | local run |
| `pnpm verify:affected` | boundaries, server and test typechecks, Angular build, all Vitest | exit 0; 32 files, 160 of 160 tests | local run |
| `pnpm lint` | ESLint and import boundaries | exit 0 | local run |
| `git diff --check` | whitespace | exit 0 | local run |
| `pnpm audit --prod --filter @auditsphere/server` | production tree | `No known vulnerabilities found` | local run |

Performance, measured on the development machine: the 50,000-row workbook parsed in 3.75 s with about 348 MB peak RSS, against 0.95 s and about 364 MB for CSV. These are not production SLO evidence.

## Acceptance criteria

- **AC1 — golden workbook maps to the same normalized result as CSV.** `workbook.test.ts` compares all 5,000 rows of `balance-5000.xlsx` with `balance-5000.csv` (code, name, canonical six-place balances, source line). `xlsx-import.integration.ts` stages both into PostgreSQL and asserts identical `TbRow` snapshots. Note: numeric cells come back from ExcelJS as doubles, so their `rawValues` are the shortest decimal text, not the file's original text (see limitations).
- **AC2 — a corrupt or excessive-expansion workbook fails safely within limits.** Tested: truncated archive, random bytes with a ZIP signature, a 64 MiB+1 part whose directory declares it small (real inflation capped at the limit), a directory that under-declares the true size, a directory that disagrees with its content, an unsafe part name, encrypted parts, macro parts and macro content types. The PostgreSQL test shows terminal FAILED with `TB_IMPORT_INVALID`, zero staged rows, and no retry. The large case is refused without inflating the whole part.
- **AC3 — a workbook retry never changes an already finalized batch.** The integration test finalizes an imported batch, redelivers its workbook job, and asserts the rows and status are unchanged. A second check shows that a queued job for a finalized batch completes without reading its evidence.

Denied and failure paths covered: all rejection cases above, formula cells, unexpected columns, multiple worksheets and bad headers.

## Checklist status

- Reviewed library in the worker, with pinned transitive dependencies: **partly done**. ExcelJS runs in the fieldwork import worker process. It is not yet in a separately isolated CPU/document worker. The transitive `uuid` is pinned. Other transitive packages are pinned only by the lockfile.
- Worksheet and header rows, blank rows, formula policy and unsupported formats: **partly done**. Rules are defined as above. The formula policy is open pending a decision.
- Size, row, column, string and execution-time bounds: **partly done**. Enforced: decompressed size (64 MiB, by real inflation), 50,000 rows, 16 columns, and the existing 80/300-character string limits. Not enforced: a time bound. ExcelJS load cannot be interrupted, so a slow but in-limit workbook has no explicit time cap beyond the job's own lifetime. The compressed size is the evidence size, which is not capped in the reader itself.
- Raw values and parse provenance; no formula execution or fetch: **partly done**. Source line and raw cell values are stored. Numeric raw text is not preserved, because ExcelJS returns doubles. The sheet name is not stored. No formula is evaluated, and no code path fetches an external resource, but that was not separately tested.

## Recovery and authorization

A failed workbook parse rolls back its staging transaction, as the CSV path does. Terminal validation records row errors in the same transaction. No production data was touched. No merge, deployment or new upload route has been authorized.

## Review and next task

Reviewer: pending independent review
Review result: pending
Open blockers:
1. Decision needed: how `.xlsx` reaches the import. Option A (recommended): extend the malware-screened staff upload pipeline (T033) to accept `.xlsx` with the same ZIP preflight, so every workbook is ClamAV-scanned before storage. Option B: add an unscreened JSON upload for workbooks. Option B conflicts with the T033 screening rule, so it is not recommended.
2. Decision needed: the cached-formula policy (currently rejected).
3. Linux compatibility image smoke for ExcelJS (T017 image), and the `buffers` licence check.
4. T043 and T044 are IN_REVIEW, so their dependencies are not yet DONE.
5. Time bound and isolated worker process, per the open checklist items.

Next eligible task by dependency order: T046 (mapping suggestions, IN_REVIEW). Stop after this task; do not implement the next one without assignment.

## Addendum — DN-01 / D13: screened workbook route (2026-10-08)

The owner decided DN-01 as option A. The T033 screened staff upload now accepts `.xlsx` (content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) in the Trial Balance category only, and the workbook is handed to the ZIP preflight after the ClamAV scan and before any object is stored. The preflight moved from `fieldwork/workbook.ts` to `platform/workbook-archive.ts` so the platform does not depend on a business module; the reader converts its rejections back into file-level validation errors.

A stored Trial Balance document version is imported with `POST /engagements/:engagementId/imports/from-document` (`importFromDocument`). It pins the exact version, is idempotent on content, and uses the same outbox and worker as CSV. The worker dispatches by content, so a stored workbook and a stored CSV stage through one path.

Migration `202610080003_document_upload_workbook_type` allows the content type and enforces in PostgreSQL that a workbook is declared only in the Trial Balance category.

### Verification (addendum)

| Command / test | Result |
| :--- | :--- |
| `pnpm verify:task -- T045` (now includes `xlsx-document-upload`) | exit 0 |
| `pnpm verify:task -- T033` (includes `document-upload` and `xlsx-document-upload`) | exit 0 |
| `tests/xlsx-document-upload.integration.ts` (PostgreSQL 18.6, ClamAV stub) | 1 of 1: screened upload → finalize → pinned import equals CSV twin row for row (5,000 rows, source lines and balances); idempotent re-import; macro, infected and legacy-container uploads refused with the session FAILED and no stored object or document; fieldwork documents refused for import; reader denied |
| `pnpm verify:affected` | exit 0; 32 files, 160 of 160 tests |
| `pnpm lint`, `pnpm contracts:check` | exit 0 |

The formula policy (DN-02) remains open, so formula cells are still rejected.

## Addendum — DN-02 / D14: cached formula values (2026-10-08)

The owner decided DN-02 as option B. A workbook formula cell now contributes its cached result, and its formula text is kept in the row raw values under `formulas`. Nothing is evaluated. A formula with no usable cached result (or an error value) is refused with its source line. The reader and the parser share the same record rules, so the decision applies identically to every row.

Verified by `packages/server/tests/workbook.test.ts` (22 of 22 with the parser suite): a cached formula is accepted with its text kept, an uncached formula is refused with its source line, and the golden fixtures are unchanged. The fixtures contain no formulas.

Limitation: a row warning for formula cells is represented by the stored formula text in provenance. The product has no warning channel yet (the warnings-versus-blockers decision is still open under T079), so the formula is recorded, not surfaced.

## Addendum — B07 timing measurement and D29 (2026-10-08)

The isolated deterministic fixture suite was rerun with Node 24.19.0 on the Windows 11 development machine: `pnpm exec vitest run tests/tb-fixtures.test.mjs --reporter=verbose` passed 8/8. CSV parse-and-oracle cases took 280 ms for 5,000 rows, 1,496 ms for 25,000 rows and 2,778 ms for 50,000 rows. The complete file took 27.96 seconds (transform/import 26.17 seconds, tests 5.91 seconds; overall duration also includes process startup). The 25k/50k tests now have explicit 15-second budgets, over five times the largest observed case, while the 5k case retains the default. This is a local test budget, not a production performance claim.

D29 approves a provisional 60-second worker kill ceiling based on SPK-01's 16.616-second worst measured workbook. The target deployment image has not been selected under T006, so no target-image timing is claimed and T045 remains IN_REVIEW. No task status changed.
