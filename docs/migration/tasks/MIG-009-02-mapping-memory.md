# MIG-009-02 — Approved-mapping memory with provenance

Status: DONE (client-scoped memory and read-only suggestions); allocations and package layouts remain
Intent: Remember the approved taxonomy code for each client account and offer it for later imports, so a mapping decision is informed by prior approvals and every suggestion names its source.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Accounting/MappingMemoryService`, approved-mapping records in `Infrastructure/Persistence/AuditSphereDbContext.Accounting.cs`.
Destination commit and files: `packages/server/src/modules/fieldwork/taxonomy.ts`, `packages/server/src/modules/fieldwork/taxonomy-controller.ts`, `prisma/migrations/202610010017_mapping_memory/migration.sql`, `tests/taxonomy.integration.ts`.
Existing T-task links: T046, T080, MIG-009-01.
Dependencies: MIG-009-01 taxonomy and mapping approval.
Scope: `MappingMemoryEntry` keyed by (firm, client, account code); written inside the mapping-approval transaction for the newly approved rows; a read-only `suggestMappings` that returns a suggested code plus the source approval, application count and last-approved time, or an explicit reason when no suggestion applies.
Non-goals: Allocation rules, statement layouts, package review/checkpoint/release, corrections workflow, and any UI.
Current behavior and invariants: memory is derived only from an approved mapping, so it can always cite an approval. Suggestions never write a mapping. A remembered code that is not in the currently approved taxonomy is reported as `MEMORY_NOT_IN_TAXONOMY` rather than offered. An already-mapped row is reported as such.
Proposed contract / schema change: new table with text/count check constraints; no request-body contract (the endpoint is a scoped read).
Permission and transaction boundary: suggestions require `FIELDWORK_WRITE` in the engagement scope; memory is written in the same transaction as the approval, audit event and receipt, using a single `INSERT … ON CONFLICT DO UPDATE`.
Historical data / document impact: memory is a derived projection and can be rebuilt from approvals; it is not evidence by itself.
Implementation steps: as recorded in migration 202610010017, the approval upsert and the suggestion query.
Relevant existing tests: `tests/taxonomy.integration.ts`.
Minimal additional acceptance tests: memory is written once per approved account; a later import gets both remembered codes with their source approval; an unknown account has no suggestion; capability denial; a retired code is reported rather than offered; an already-mapped row is reported.
Commands actually executed: `pnpm exec prisma validate`; `pnpm exec prisma migrate deploy`; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; `pnpm build:server`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec tsx --test tests/taxonomy.integration.ts`; `pnpm test:integration`.
Evidence and remaining blockers: the taxonomy suite passed against PostgreSQL 18.6 with all memory and suggestion cases. Remaining: a corrections workflow, allocation rules, firm-wide (cross-client) memory if the methodology approves it, and the mapping UI that would consume suggestions.
Rollback / forward-recovery impact: additive; memory can be dropped and rebuilt because approvals remain the source of truth.
Definition of done: met for client-scoped memory and suggestions; allocations and packages are separate tasks.
