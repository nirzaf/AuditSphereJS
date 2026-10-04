# T146 handoff — Monthly firm Profit and Loss

## Identity

- Task ID: T146
- Requirement IDs: R078 (monthly firm P&L portion)
- Implementing commit/branch: delivered on `main`
- Status: DONE

## Intended and delivered outcome

Practice now serves a real, read-only monthly firm Profit and Loss statement from posted Practice journals. It classifies accounts using the firm chart's `INCOME` and `EXPENSE` kinds, uses accounting dates and PostgreSQL NUMERIC aggregates, computes signed income/expense/net totals, supports an explicitly selected comparison month, and exposes paged journal-source drill-down with reversal lineage. A changed mapped posting alters the report hash and makes old detail requests return 409 so detail cannot silently disagree with the displayed report.

CSV export includes reporting and comparison months, PostgreSQL as-of time, currency, the content snapshot SHA-256, account rows, posted source counts and totals. No report, financial journal or authorization rows are mutated by a read/export. Partner drawings and other equity/liability/asset movements are excluded by account kind; charge-out analytics remain separate under D07. No dependency or database migration was added. The preserved requirements source is unchanged.

## Files and contracts

- `packages/server/src/modules/practice/profit-loss.ts`: firm-authorized, repeatable-read monthly aggregation, stable content hash, and checked paged journal sources.
- `packages/server/src/modules/practice/ledger-controller.ts`, `packages/server/src/index.ts`: protected API routes and public service exports.
- `packages/contracts/src/index.ts`, `packages/contracts/schema.json`, `packages/contracts/openapi.json`: month/comparison query, report, totals, row, and source-detail contracts and OpenAPI output.
- `apps/web/src/practice-profit-loss.ts`, `.html`, `.css`, `.spec.ts`: Angular report controls, totals, table, comparison, source paging, stale handling and CSV export.
- `apps/web/src/module-catalog.ts`, `module-workspace.ts`, `module-workspace.html`, `module-workspace.spec.ts`: Practice navigation, component mounting and shell coverage.
- `tests/practice-profit-loss.integration.ts`: real PostgreSQL financial reconciliation, posting, reversal, dates, withdrawal/balance-sheet exclusion, comparison, authorization and stale-source checks.
- `scripts/verify-task.mjs`, `package.json`, `.github/workflows/ci.yml`: exact T146 recipe, focused web checks, integration registration and CI shard registration.
- `packages/server/src/modules/practice/README.md`, `apps/web/README.md`, `docs/evidence/UI-MODULES.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/tasks/12-practice/T146-firm-pl.md`, `docs/guides/13-execution-ledger.md`: current architecture, screen and task evidence.

## Dependency evidence

No dependency changes. The Angular 22 pinned CLI MCP discovered the `web` project; its native guidance calls returned an unsupported response, so the repository fallback `node scripts/angular-mcp.mjs` supplied project discovery, best practices and version-22 documentation. The new component uses the existing standalone/signal/native-control-flow patterns and typed Zod transport contracts.

## Decisions

D07 is the applicable approved implementation default. The existing firm chart `kind` is the P&L statement mapping: only `INCOME` and `EXPENSE` accounts are included. The implementation does not relabel charge-out contribution as payroll profit and does not infer jurisdiction-specific chart mappings or tax treatment. No professional accounting certification is claimed.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T146` | PostgreSQL 18.6 report integration (1/1), P&L Angular tests (2/2), Practice workspace tests (23/23); build and contract/OpenAPI checks | Passed, exit 0 | Local run, 2026-10-05 |
| `pnpm verify:affected` | boundaries, server/test typechecks, Angular production build, Vitest | Passed, exit 0; 30 files, 137 tests | Local run, 2026-10-05 |
| `pnpm lint` | ESLint and module boundaries | Passed, exit 0 | Local run, 2026-10-05 |
| `pnpm test:e2e` | Playwright module/workspace journeys | Passed, exit 0; 10 passed, 2 live-only skipped | Local run, 2026-10-05 |
| `node scripts/verify-ci-workflow.mjs` | Integration test sharding and CI invariants | Passed, exit 0 | Local run, 2026-10-05 |
| `git diff --check` | Whitespace and patch formatting | Passed, exit 0 | Local run, 2026-10-05 |
| Built-in browser `http://localhost:4200/?module=Practice&view=profit-loss` | Signed-in Staff Fixture, existing synthetic engagement | Monthly P&L screen mounted and API endpoint returned expected 403 `PRACTICE_READ` denial. No live data displayed; no grant or record changed. | Browser check, 2026-10-05 |

## Acceptance criteria

- AC1: The PostgreSQL fixture compares monthly income and expense account movement with each mapped account's firm Trial Balance movement for both current and comparison months.
- AC2: Posted partner withdrawals and asset/liability balance movements are present in the fixture but absent from P&L rows and totals. Charge-out analytics are not read as ledger postings.
- AC3: The fixture's journals are posted after their accounting month; they still appear in the selected month. Drafts are excluded. The report filters on `PracticeJournal.accountingDate`.
- Denied/failure paths: unassigned staff cannot read the report; an identical comparison month and an invalid calendar month fail query validation; changed posted sources make old drill-down hashes return 409.
- Deterministic export context: the same report parameters and posted chart content produce the same hash, and the CSV carries parameters plus the database as-of timestamp.

## Recovery and authorization

This report adds no migration and has no durable side effect to roll back. It is a read-only PostgreSQL repeatable-read query. No tenant permission, local grant, external provider, business record, deployment or release was changed. The signed-in browser identity has only engagement-scoped `ENGAGEMENT_READ`; positive live Practice report viewing remains unverified until an authorized firm-wide `PRACTICE_READ` test principal is available.

## Review and next task

- Reviewer: Codex evidence review, 2026-10-05
- Review result: DONE for T146's scoped code and automated acceptance criteria.
- Open blockers: live positive browser access is an environment authorization limitation, not a T146 code acceptance failure.
- Next eligible task by dependency order: T147 — allocated-payment accounts-receivable aging.
