# T024 handoff — shared transaction context

## Identity

- Task ID: T024
- Requirement IDs: R002 (CURRENT.md 68–129), R012 (409–412), R013 (409–413), R017 (423–425), R072 (552), R079 (584–624)
- Implementing commit/branch: `main`; uncommitted worktree changes
- Status: DONE

## Intended and delivered outcome

Module-owned write facades can join one explicit PostgreSQL unit of work passed by their caller. Standalone commands still open their own bounded interactive transaction. Nested commands share the caller's transaction client, parent Engagement locks are acquired before aggregate reads, transient database conflicts are retried within a fixed bound, and post-commit callbacks run only after commit. No global mutable transaction context was introduced.

This is an existing implementation. It does not change the five-module requirements, lifecycle rules, persistence schema, browser contracts or product workflows. Storage/network operations remain outside database transactions.

## Files and contracts

- `packages/server/src/platform/unit-of-work.ts` adds optional transaction isolation and `withUnitOfWork`, retaining bounded retries, explicit scope, lock helper and after-commit behavior.
- `packages/server/src/index.ts` exports the unit-of-work API and affected command facades.
- Commercial proposal commands; Governance lifecycle, risk and materiality commands; Fieldwork import/mapping/finalization, taxonomy, publication and adjustment commands; Practice invoices and firm-ledger commands; and Reporting review-note commands accept and reuse an optional explicit `UnitOfWork`.
- Risk, taxonomy and adjustment commands now acquire the Engagement lock before reading or writing their aggregates. Existing Engagement-first locks in the other migrated write facades remain in place.
- `tests/unit-of-work.integration.ts` exercises rollback across real Commercial and Governance facades and retry of a real Commercial command. `tests/adjustments.integration.ts` proves Fieldwork adjustment writes join and roll back with a caller transaction.
- `scripts/verify-task.mjs` runs the unit-of-work, commercial onboarding, risk, taxonomy and adjustment PostgreSQL suites for T024. The Fieldwork README now lists its adjustment integration suite.
- `docs/IMPLEMENTATION-STATUS.md` and `docs/guides/13-execution-ledger.md` record the reviewed outcome.

No Prisma migration, generated contract, browser API contract or dependency was added or changed for T024. No unrelated working-tree files are included in this task handoff; the shared checkout has other unrelated in-flight changes and they remain uncommitted.

## Dependency evidence

No dependency changes. Verified runtime: Node.js v24.19.0, pnpm 12.8.1, Prisma 7.10.0, and PostgreSQL Testcontainers image `postgres:18.6`. Existing compatibility evidence is recorded under T017; no package was introduced.

## Decisions

No D01–D12 product or professional-policy decision changes this transaction-plumbing task. No provider credential, production data or external service was used.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T024` | Server build; PostgreSQL 18.6 Testcontainers fixtures for unit-of-work, commercial onboarding, risk, taxonomy and fieldwork adjustments | PASS; all five integration test processes reported 1/1, and task recipe exited 0 | Current local verification run, 2026-10-03 |
| `pnpm verify:affected` | Boundaries, server build, test TypeScript check, Angular production build, Vitest | PASS; 18 files, 82 tests; Angular production build completed | Current local verification run, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundary checker | PASS; 0 errors; 4 unused-disable warnings in the unrelated `visual-prototype-simulation/worker/worker-configuration.d.ts` | Current local verification run, 2026-10-03 |
| `git diff --check` | Changed tracked files | PASS; Git emitted line-ending conversion notices only | Current local verification run, 2026-10-03 |

The focused transaction integration uses a fresh PostgreSQL 18.6 Testcontainers database. It checks failure rollback after real module writes, a retryable `P2034` followed by exactly one real Commercial proposal and receipt, generic retry/non-retry handling, nested same-scope work, and deferred callbacks. The adjustment integration checks caller-context rollback and denied capability behavior. Commercial, risk and taxonomy suites check their successful and denied business paths.

## Acceptance criteria

- **AC1 — rollback:** A forced failure after Commercial proposal and Governance risk writes leaves no proposal, risk, audit row or command receipt. A separate Fieldwork adjustment failure leaves no journal or audit row. Deferred work is not run on rollback.
- **AC2 — shared transaction:** Production facades receive the same explicit scope from `runUnitOfWork`; they use `withUnitOfWork` rather than opening independent transactions. The induced cross-module rollback proves both facades participate in the caller's commit boundary.
- **AC3 — retry without duplication:** A real proposal command is retried after a synthetic `P2034`. The attempt count is two and the database contains exactly one proposal and one idempotency receipt for the key.
- **Denied/failure behavior:** Existing PostgreSQL acceptance tests reject ungranted Commercial, Governance risk and Fieldwork adjustment commands; validation failures are not retried.
- **Boundaries:** No network, PDF, storage or notification wait was moved inside a PostgreSQL transaction. Fieldwork upload bytes are handled before the database unit of work.

## Recovery and authorization

All affected commands are database-transactional; a failed command leaves no partial committed state. No migration or production data repair was needed. No merge, push, deployment or external provider action was performed or authorized by this handoff.

## Review and next task

Reviewer: Codex self-review

Review result: The T024 acceptance and dependency gates were checked against the task, implementation and executed tests. This does not claim an independent external review.

Open blockers: The authenticated browser session could not be used for UI acceptance because the embedded browser rejected the localhost URL under its URL policy; this is outside T024's server transaction acceptance.

Next eligible task by dependency order: T025 audit-write independent review/follow-through.

Stop after this task; do not implement the next one without assignment.
