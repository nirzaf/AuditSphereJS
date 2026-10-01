# MIG-009-01 — Versioned taxonomy and approved-mapping boundary

Status: DONE (taxonomy and mapping approval); mapping memory, layouts and packages remain
Intent: Replace seven fixed FSLI strings with a firm-scoped, versioned taxonomy, and record an approval that binds one import's mapped rows to an exact taxonomy version so a later row change cannot be published as if it were approved.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Accounting/Intake`, the approved-mapping and taxonomy records in `Infrastructure/Persistence/AuditSphereDbContext.Accounting.cs`, and `MappingMemoryService`.
Destination commit and files: `packages/server/src/modules/fieldwork/taxonomy.ts`, `packages/server/src/modules/fieldwork/taxonomy-controller.ts`, `prisma/migrations/202610010011_taxonomy_mapping_approval/migration.sql`, `packages/contracts/src/index.ts`.
Existing T-task links: T046, T049, T080; MIG-009.
Dependencies: WP4 scope, WP6 capabilities, WP9 publication.
Scope: `TaxonomyVersion` + `TaxonomyLine` with statement sections; `MappingApproval` bound to an exact taxonomy version and a digest of the mapped rows; create/approve/list commands; mapping approval; `currentMappingApproval` staleness check; publication now requires a current approval; `TAXONOMY_MANAGE` and `MAPPING_APPROVE` capabilities.
Non-goals: Historical mapping memory and deterministic suggestions, allocation rules, statement layouts, package review/checkpoint/release, and any UI.
Current behavior and invariants: an approved taxonomy version and its lines are immutable by database trigger, so a change is a new version. A mapping approval is append-only. An approval digest covers row id, mapped code and row version, so changing any mapped row makes the approval stale; re-approving is required before publication. A mapped value outside the taxonomy is rejected, never silently accepted.
Proposed contract / schema change: `createTaxonomySchema`, `approveMappingSchema`; new tables plus check constraints and three triggers; the grant capability check constraint extended.
Permission and transaction boundary: `TAXONOMY_MANAGE` for taxonomy creation/approval and `MAPPING_APPROVE` for the approval, both re-checked inside the transaction; the engagement row is locked; the approval, audit event and idempotency receipt commit together.
Historical data / document impact: taxonomy versions are additive; a retiring change must be a new version rather than an edit.
Implementation steps: as recorded in migration 202610010011, the taxonomy service and controller, and the publication guard.
Relevant existing tests: `tests/publication.integration.ts` (updated to approve a mapping before publishing).
Minimal additional acceptance tests: draft version numbering and duplicate-code rejection; capability denial; approved-version and approved-line immutability; a mapped value outside the taxonomy rejected; approval digest and current check; staleness after a row change; re-approval against a different taxonomy version; append-only approvals; order-independent digest.
Commands actually executed: `pnpm exec prisma validate`; `pnpm exec prisma migrate deploy`; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; `pnpm build:server`; `pnpm contracts:generate`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm test:integration`; `pnpm db:roles`; `pnpm db:seed`.
Evidence and remaining blockers: `tests/taxonomy.integration.ts` passed against PostgreSQL 18.6 for every case above, and the publication suite passes with the new mapping-approval gate. Remaining: mapping memory and suggestions, allocations, statement layouts, financial packages and the UI; and the taxonomy still uses the existing FSLI strings as codes rather than the source's short destination codes.
Rollback / forward-recovery impact: additive; approved taxonomies and approvals are historical evidence and are never rewritten.
Definition of done: met for the taxonomy and approval boundary; MIG-009 remains in progress for memory, layouts and packages.
