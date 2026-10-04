# T145 handoff — Firm trial balance

## Identity

Task ID: T145
Requirement IDs: R078 (firm trial balance portion)
Implementing commit/branch: task changes and evidence delivered together on `main`
Status: DONE

## Intended and delivered outcome

This existing Practice module now provides a real, read-only firm trial balance for a selected accounting period. The API reads one repeatable PostgreSQL snapshot, aggregates only posted Practice firm journals using PostgreSQL NUMERIC, returns opening balances, period debit/credit movement and closing balances, and fails closed if totals do not reconcile. Drafts and client audit adjustments are excluded. Account drill-down includes all posted account history through period end, flags opening-history rows, and preserves reversal lineage; its full history reconciles to the row's closing amount. The export is deterministic CSV over the returned report snapshot and includes its SHA-256 identifier.

Monthly profit/loss and accounts-receivable aging remain owned by T146/T147. No Practice permission was added, no Microsoft tenant permission or folder grant changed, and no deployment occurred.

## Files and contracts

- `packages/server/src/modules/practice/trial-balance.ts`: authorized firm report and paginated history queries, decimal reconciliation and snapshot hash.
- `packages/server/src/modules/practice/ledger-controller.ts`, `packages/server/src/index.ts`: add the protected trial-balance and account-history GET routes/services.
- `packages/contracts/src/index.ts`, `packages/contracts/schema.json`, `packages/contracts/openapi.json`: query, report, totals, account-row and history-entry contracts; history identifies opening-balance lines.
- `apps/web/src/practice-trial-balance.ts`, `.html`, `.css`: real Angular report screen, period selector, totals, account drill-down, paging and deterministic CSV export.
- `apps/web/src/module-workspace.ts`, `module-workspace.html`, `module-catalog.ts`: mount and describe the API-backed Practice report screen.
- `prisma/schema.prisma`, `prisma/migrations/202610050001_firm_trial_balance_indexes/migration.sql`: period, posted-journal date and firm/journal/account indexes for report access.
- `tests/practice-trial-balance.integration.ts`: PostgreSQL financial, reversal, draft, history and permission invariants.
- `apps/web/src/practice-trial-balance.spec.ts`: API contract response, detail, stable escaped CSV and authorization-denied component checks.
- `tests/practice-ledger.integration.ts`: stabilize the concurrency assertion by selecting journal line position rather than depending on unspecified row order.
- `scripts/verify-task.mjs`, `package.json`: T145 recipe, PostgreSQL integration registration and focused Angular command.
- Practice/web READMEs, UI module evidence, task checklist, implementation status and execution ledger record ownership and acceptance.

No dependency changes; no new package or lockfile update. `docs/requirements/CURRENT.md` remains unchanged.

## Dependency evidence

No dependency changes. The Angular 22 workspace's pinned Angular CLI MCP best-practice guidance was consulted before UI edits using the repository fallback because the MCP `get_best_practices` call returned an unsupported response. The new standalone component uses signal state, native Angular control flow, typed contracts, semantic tables, accessible labels and status text. Angular build and component tests passed.

## Decisions

No new D01–D12 policy decision. QAR follows the existing Practice ledger contract. This work does not assert professional or statutory accounting acceptance.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm db:generate` | Prisma 7.10 client from reviewed schema | Passed, exit 0 | Local run, 2026-10-05 |
| `pnpm contracts:generate` | Canonical Zod JSON schemas | Passed, exit 0 | Local run, 2026-10-05 |
| `pnpm build:server` | Prisma generation and TypeScript server build | Passed, exit 0 | Local run, 2026-10-05 |
| `pnpm openapi:generate` and recipe `contracts:check` | API decorators, runtime contracts, JSON Schema and OpenAPI | Passed, exit 0 | `pnpm verify:task -- T145` |
| `pnpm verify:task -- T144` | PostgreSQL 18.6 ledger (1/1), receipt integration with synthetic Graph/ClamAV (1/1), API security (5/5), Angular expense (5/5) | Passed, exit 0 | Local run, 2026-10-05; see [T144 handoff](../T144/handoff.md) |
| `pnpm verify:task -- T145` | PostgreSQL 18.6 fixture plus Angular report test | Passed, exit 0; integration 1/1, Angular 2/2 | Local run, 2026-10-05 |
| `pnpm verify:affected` | Import boundaries, server/test TypeScript, Angular production build and Vitest | Passed, exit 0; 30 files, 137 tests | Local run, 2026-10-05 |
| `pnpm lint` | ESLint and module-boundary checker | Passed, exit 0 | Local run, 2026-10-05 |
| `pnpm test:e2e` | Playwright workspace and module journeys | Passed, exit 0; 10 passed, 2 live-only tests skipped | Local run, 2026-10-05 |
| Built-in browser `http://localhost:4200/?module=Practice&view=statements` | Signed-in `auditp0-staff@easyguide.onmicrosoft.com`, existing synthetic engagement | Real Firm trial balance view rendered. API returned `PRACTICE_READ is not granted`; this expected fail-closed boundary was visible in the UI. No grant or record changed. | Browser verification, 2026-10-05 |

## Acceptance criteria

- AC1: PostgreSQL integration asserts opening debits and credits both equal 100, period debits and credits both equal 40, and closing debits and credits both equal 125 for the fixture.
- AC2: It pages through all posted cash history (including the 100 opening journal) and uses `Decimal6` to prove debits less credits equal the displayed 125 closing balance; account access outside the firm is 404.
- AC3: It includes a prior-period opening journal and a current-period reversal pair, excludes an unposted draft, verifies exact expected values and confirms repeated reads produce a stable snapshot hash.
- Denied paths: unassigned actor is denied, out-of-firm account is not found, the live Staff Fixture receives the expected 403 without `PRACTICE_READ`.

## Recovery and authorization

The report is read-only and computes from a repeatable database snapshot. No data migration touching business rows or posting was run; the reviewed migration adds indexes only. No provider calls or external storage side effects occur. The browser test confirms the current grant boundary; positive live authorized browser acceptance remains outside the available fixture because its account does not have a firm-wide Practice grant.

## Review and next task

Reviewer: Codex evidence review, 2026-10-05
Review result: DONE for T145's scoped acceptance criteria.
Open blockers: none within T145. Positive browser acceptance with a firm-wide Practice test principal is still a separately authorized environment gate.
Next task by dependency order: T146 — monthly firm profit/loss (or continue the open overall implementation backlog).
