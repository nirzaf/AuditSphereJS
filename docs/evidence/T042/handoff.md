# T042 handoff — deterministic Trial Balance fixtures

## Identity

Task ID: T042
Requirement IDs: R041, R042, R043, R044, R046
Implementing commit/branch: `main` (closeout commit contains this record)
Status: DONE

## Intended and delivered outcome

Added a deterministic synthetic fixture pack for 5,000, 25,000 and 50,000 rows in both CSV and XLSX, plus duplicate-account, malformed-row and known-unbalanced CSV cases. The balanced profiles include zero prior-year values, negative amounts, known debit and credit totals, and account-prefix FSLI outcome counts. All 10 generated outputs, including their manifest, are 5,381,703 bytes; the XLSX containers use fixed archive metadata and are byte-stable on regeneration.

Added a test-only PostgreSQL seed for two different synthetic clients, each with an authorized `FIELDWORK_EXECUTION` engagement. `NODE_ENV` must be `test`; grants are exact engagement scope. The integration imports the same source account code into each isolated engagement and confirms one client's staff cannot read or write the other client's engagement. No production seed, route, data model or permission was added.

## Files and contracts

- `fixtures/trial-balance/generator.mjs`, `fixtures/trial-balance/README.md`, and `fixtures/trial-balance/generated/`: deterministic integer-cent generator/oracle, CSV/XLSX writer, exceptions, expected totals and SHA-256 manifest.
- `scripts/generate-tb-fixtures.mjs`: explicit regeneration and byte-for-byte `--check` mode.
- `tests/tb-fixtures.test.mjs`: verifies CSV parser outcomes, exact debit/credit/net totals, FSLI group counts, exception hashes, oracle rejection and XLSX ZIP/Open XML entries/row counts.
- `tests/factories/tb-engagement-seed.ts` and `tests/tb-fixtures.integration.ts`: test-only, exact-scope seed plus PostgreSQL 18.6 client-boundary proof.
- `scripts/verify-task.mjs` and `package.json`: T042's recorded recipe and CI integration discovery.
- `packages/server/src/modules/fieldwork/README.md`: fixture ownership and limits.
- `docs/evidence/T042/fixture-profile-2026-10-05.json`: immutable fixture digests and reference machine profile; no timing claim.

No migrations, runtime API behavior, package dependencies, external permissions or client data changed. The task does not implement XLSX ingestion or the browser editor; T045 owns XLSX parsing and T047/T048 own the interactive grid. There was no affected browser screen in this fixture-only task.

## Dependency evidence

No dependency changes. All generation uses Node's built-in crypto, zlib and filesystem APIs; the test seed uses already-approved Prisma, Vitest, Testcontainers and PostgreSQL.

## Decisions

No new D01–D12 decision. All records are synthetic and the test-only seed refuses to run unless `NODE_ENV=test`.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T042` | Server build, fixture regeneration check, fixture unit tests, PostgreSQL 18.6 scope seed | Passed; deterministic files 10/10, fixture tests 8/8, scope integration 1/1 | Local output, 2026-10-05 |
| `pnpm verify:affected` | Boundaries, server/test TypeScript, Angular production build, Vitest | Passed; 31 files / 145 tests | Local output, 2026-10-05 |
| `pnpm lint` | ESLint and module/browser boundaries | Passed | Local output, 2026-10-05 |
| `git diff --check` | Task diff | Passed; Git emitted only CRLF normalization notices | Local output, 2026-10-05 |

## Acceptance criteria

- AC1: `node scripts/generate-tb-fixtures.mjs --check` regenerates and byte-compares every expected file. Unit tests confirm each digest, byte count, CSV row count and totals, and verify workbook ZIP checksums, relationships, worksheet dimensions and row counts.
- AC2: `unbalanced.csv` parses as CSV but fails `assertBalanced` with the non-zero integer-cent net. Duplicate and invalid-money fixtures fail the real shared Trial Balance parser.
- AC3: Names and figures are synthetic. The PostgreSQL factory checks `NODE_ENV=test`, uses synthetic email domains, and adds no production endpoint. Cross-client same-code records remain isolated by separate imports and engagement-scoped authority.

The hardware details and fixture digests are recorded in `fixture-profile-2026-10-05.json`. Runtime performance timings are intentionally not asserted here; T051 owns measured ingestion and interaction profiles.

## Recovery and authorization

All fixtures can be regenerated from the checked-in deterministic generator. No database migration or external effect is involved. Generated files are checked into source control to make downstream parser/editor work reproducible.

## Review and next task

Reviewer: Codex self-review
Review result: AC1–AC3 pass; package and CI integration test discovery are registered.
Open blockers: T045 XLSX parser, T046 mapping suggestions/history, and the later row-editor workflow remain open.
Next eligible work: T043 after its T033 and T024 prerequisites are confirmed DONE; otherwise continue the dependency-ready task order.
