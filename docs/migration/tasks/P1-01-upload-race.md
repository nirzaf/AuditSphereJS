# P1-01 — Duplicate-safe uploads and unreferenced-object tracking

Status: DONE
Intent: Make concurrent identical trial-balance uploads resolve to one authoritative import, and track stored objects so an interrupted or losing upload leaves a record for safe cleanup instead of untracked bytes.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Accounting/Intake` import receipts and the durable-operation store.
Destination commit and files: `packages/server/src/modules/fieldwork/service.ts`, `packages/server/src/modules/fieldwork/uploads.ts`, `packages/server/src/platform/storage.ts`, `packages/server/src/worker.ts`, `prisma/migrations/202610010016_stored_object_tracking/migration.sql`, `tests/upload-race.integration.ts`.
Existing T-task links: T033 (bounded upload initiation), T043 (staging provenance), T030 (durable outbox).
Dependencies: WP4 scope/authorization and the storage adapter.
Scope: a `StoredObject` row written before the bytes; upload marks it `REFERENCED` in the same transaction that creates the document and import; a uniqueness loss is caught and converted into the winning import plus a `DUPLICATE` object; `sweepUnreferencedUploads` removes `PENDING`/`DUPLICATE` objects after a grace period and is wired into the worker at a low frequency.
Non-goals: reconciling provider-side version history, deleting durable Graph evidence automatically, and an operator UI for the review queue.
Current behavior and invariants: before this change a losing concurrent upload returned a database error and left untracked bytes. Now one authoritative import exists, the winning evidence is retrievable, and the losers are recorded. `REFERENCED` objects are never selected by the sweep.
Proposed contract / schema change: new table with status/consistency check constraints; `removeObject` added to the storage adapter.
Permission and transaction boundary: the upload still re-checks `FIELDWORK_WRITE` inside the transaction; object tracking and the document/import/outbox/audit writes stay transactional; tracking is written outside the transaction so a crash between the byte write and the metadata commit is still recorded.
Historical data / document impact: evidence objects are never deleted while referenced. Graph evidence is reported for review rather than deleted.
Implementation steps: as recorded in migration 202610010016, the service change, the sweep function and the worker wiring.
Relevant existing tests: `tests/taxonomy.integration.ts` (duplicate handling in mapping).
Minimal additional acceptance tests: three concurrent identical uploads resolve to one import; exactly one referenced object and two duplicates; the winning evidence is readable; the sweep cleans only unreferenced objects; a distinct upload is never swept.
Commands actually executed: `pnpm exec prisma validate`; `pnpm exec prisma migrate deploy`; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; `pnpm build:server`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec tsx --test tests/upload-race.integration.ts`; `pnpm test:integration`.
Evidence and remaining blockers: `tests/upload-race.integration.ts` passed against PostgreSQL 18.6 with the local S3 fixture (the test needs the configured object-store fixture, which CI starts through `pnpm infra:up`). Remaining: an operator review queue for Graph objects, provider-side reconciliation, and the same treatment for XLSX and GL uploads.
Rollback / forward-recovery impact: additive. Cleaned objects are recorded rather than erased from history; the sweep is idempotent.
Definition of done: met for duplicate-safe uploads and safe cleanup of unreferenced objects.
