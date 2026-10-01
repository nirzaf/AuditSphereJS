# WP1 — Baseline reconciliation and executed evidence

Date: 2026-10-01 (session), host Windows x64, working tree of `nirzaf/AuditSphereJS`.
This record separates **what was executed** from what remains repository-reported. No command in
this file is a plan; every command under "Executed" was actually run on this working tree.

## Environment actually used

| Item | Value |
| --- | --- |
| Host Node | `v24.19.0` (repository engine range `>=24.15.0 <25`) |
| Package manager | `pnpm 12.8.1` via corepack |
| PostgreSQL | `postgres:18.6` container, port 127.0.0.1:5432 (healthy) |
| Redis | `redis:8.10`, AOF + noeviction, port 127.0.0.1:6379 (healthy) |
| Object storage | `rustfs/rustfs` local fixture, port 127.0.0.1:9000 (healthy) |
| Pinned Linux image Node | 24.21.0 — **not** rebuilt or rerun in this session |

## Executed commands and results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Lockfile up to date; 1001 entries pass supply-chain policy |
| `pnpm boundaries` | Module and browser import boundaries passed |
| `pnpm contracts:check` | Contract schemas match runtime definitions |
| `pnpm dependencies:check` | Printed every direct dependency with license and engine range |
| `pnpm typecheck` | `build:server` + tests `tsc` + `ng build web` (256.53 kB initial) passed |
| `pnpm test` | 5 files, 16 tests passed |
| `pnpm test:unit` | Vitest 16 passed; Angular component 2 passed |
| `pnpm test:integration` | 3 passed, including Testcontainers PostgreSQL 18.6 migrate + six-decimal NUMERIC round-trip and firm/client scope denials |
| `pnpm test:e2e` | 3 passed, 1 skipped (live import requires `RUN_LIVE_E2E`) |
| `pnpm verify:task -- T001` | Passed: requirements bytes equal source, 82 coverage IDs |
| `pnpm verify:task -- T007/T008/T012/T015/T019/T032` | Each recorded recipe passed |
| `pnpm exec tsx packages/server/tests/database-roles.ts` | Runtime DDL denied; report writes and API audit deletion denied by grants |
| `pnpm exec prisma migrate status` | 6 reviewed migrations applied; database schema up to date |
| `pnpm db:seed` | Development fixture seeded (firm, client, engagement, membership) |

## Migrations added by this work

| Migration | Purpose |
| --- | --- |
| `202610010005_monetary_precision` | `TbRow.current/prior` widened from `numeric(20,2)` to `numeric(28,6)` |
| `202610010006_scope_model` | `Firm`, `Client`; `Engagement.firmId`; `TbImport` firm/client scope with compound foreign keys |

Applying `202610010006_scope_model` on the existing development database created one explicitly
named `Scope bootstrap firm`/client for the pre-scope validation rows. That backfill is for
development rows only; a production migration must use a reviewed identity map (MIG-016).

## Findings that changed a status or a file

1. **Precision truncation confirmed and removed.** Source migrations declare `numeric(19,6)` 445
   times; the destination was `Decimal(20,2)`. Fixed in migration 5 plus the runtime money contract.
2. **No firm/client scope existed.** A caller that knew an engagement id could attach data to any
   engagement. Fixed in migration 6 and proved by two foreign-key denial assertions.
3. **Prisma drift found in `OutboxEvent.completedAt`.** Migration 4 created `timestamptz` while the
   schema declared a naive timestamp. The schema now uses `@db.Timestamptz`, so `prisma migrate diff`
   reports no remaining timestamp drift without altering stored values.
4. **Two raw-SQL foreign keys stay outside the ORM on purpose.**
   `document_engagement_fk` and `import_document_fk` (migration 2) are database-level protections the
   Prisma schema does not model. `prisma migrate diff` therefore always proposes dropping them.
   They must not be dropped; this is recorded so a future reviewer does not treat the diff as drift
   to "fix".
5. **New tables are not automatically accessible.** The local role provisioner grants per table, so
   `Firm` and `Client` had to be added to the explicit grant list. A migration that adds a table
   without updating that list produces a runtime permission error rather than silent access.
6. **CI workflow permission (not changed).** `.github/workflows/ci.yml` sets workflow-level
   `permissions: contents: write`, which is broader than the single release step needs. Recorded as
   a T016 review gap; no hosted pipeline was executed to verify a change.

## Task ledger reconciliation (T001–T017)

Statuses were changed only where an acceptance command was actually executed in this session.
"IN_REVIEW" means the artifact exists but at least one acceptance criterion was not demonstrated.

| Task | Status | Basis |
| --- | --- | --- |
| T001 | DONE | `verify:task -- T001` passed |
| T002 | IN_REVIEW | D01–D12 approved with source lines; an automated pending-policy gate was not demonstrated |
| T003 | IN_REVIEW | D05/D06 defaults recorded; boundary/rounding/sampling golden fixtures do not exist yet (WP03) |
| T004 | IN_REVIEW | D08/D09/D10 approved; runtime separation of deadline, read-only, retention and legal hold is not implemented |
| T005 | DONE | `dependencies:check` rerun; T005 evidence present |
| T006 | IN_REVIEW | D11 records providers; region/backup ownership and image digest were not established here |
| T007 | DONE | `verify:task -- T007` passed |
| T008 | DONE | `verify:task -- T008` passed |
| T009 | IN_REVIEW | Compiled Nest/Fastify context verified; oversized-payload and startup-failure paths have no recipe and were not rerun |
| T010 | DONE | Angular production build, component tests and 3 browser tests passed |
| T011 | DONE | Testcontainers migrate + NUMERIC round-trip; database role denials passed |
| T012 | DONE | `verify:task -- T012` passed |
| T013 | IN_REVIEW | Compose services healthy and Testcontainers isolates databases; version-asserting smoke was not rerun |
| T014 | DONE | Unit, integration and browser runners all passed and detect a broken DI token |
| T015 | DONE | `verify:task -- T015` passed; an unknown task id fails closed |
| T016 | IN_REVIEW | Frozen-lockfile install verified locally; hosted CI and workflow permissions not verified |
| T017 | BLOCKED | Local gates pass, but `build:linux`/`smoke:linux` were not rerun; T017 evidence remains repository-reported |

## Not done here

No deployment, no production data migration, no Microsoft tenant operation, no provider acceptance,
no load/capacity qualification, no cutover, no professional or legal approval. The Linux
compatibility image and hosted CI are not verified by this record.
