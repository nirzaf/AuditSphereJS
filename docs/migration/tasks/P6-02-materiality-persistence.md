# P6-02 — Persisted, version-bound materiality assessment

Status: DONE (persistence, approval, staleness); risk-band persistence, clearance records and UI remain
Intent: Persist the pure materiality calculation against an exact published accounting version and taxonomy, require a separate approver, and invalidate an approval when a newer accepted balance version exists.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Audit/MaterialityEngineService.cs`, `Domain/Audit/MaterialityAndRiskBands.cs` (`MaterialityCalculation`, `MaterialityCalculationStates`), and the staleness behaviour asserted in `PlanningResourcesAndMaterialityTests`.
Destination commit and files: `packages/server/src/modules/governance/materiality-service.ts`, `packages/server/src/modules/governance/materiality-controller.ts`, `prisma/migrations/202610010012_materiality_assessment/migration.sql`, `prisma/migrations/202610010013_publication_mapping_lineage/migration.sql`, `tests/materiality-persistence.integration.ts`.
Existing T-task links: T085–T089; P6-01.
Dependencies: P6-01 calculator, WP9 publication, MIG-009-01 taxonomy and mapping approval.
Scope: `MaterialityAssessment` bound to a publication and a taxonomy version with an input hash; benchmark lines derived from the published rows using the taxonomy recorded at publication; `MATERIALITY_MANAGE` to calculate and `MATERIALITY_APPROVE` to approve; self-approval refused; a newer publication marks the assessment stale and blocks approval; approved assessments are frozen and never deleted; the publication now records the exact mapping approval it bound.
Non-goals: Risk-band assessment persistence, Partner clearance records, planning approval gating fieldwork, UI, and firm-specific methodology edits.
Current behavior and invariants: a non-positive benchmark fails closed, out-of-policy rates are rejected before persistence, and an assessment cannot be approved by its own calculator. The database enforces status/approval consistency, positive amounts, percent ranges, hash shape and the benchmark vocabulary.
Proposed contract / schema change: `calculateMaterialitySchema`, `approveMaterialitySchema`; new table plus check constraints and a freeze trigger; `BalancePublication.mappingApprovalId`; two new capabilities.
Permission and transaction boundary: capability checks inside the transaction; the engagement row is locked; the assessment, audit event and idempotency receipt commit together.
Historical data / document impact: assessments are additive history; an approved assessment is never rewritten or deleted.
Implementation steps: as recorded in migrations 0012/0013, the service, the controller and the publication lineage change.
Relevant existing tests: `tests/publication.integration.ts` (updated to approve a mapping first), `tests/materiality.test.ts`.
Minimal additional acceptance tests: no-publication rejection; benchmark derivation from published rows with the tax exclusion; capability denial; out-of-policy rejection; self-approval refusal; stale approval after a newer publication; recalculation and approval; frozen approved row and no deletion.
Commands actually executed: `pnpm exec prisma validate`; `pnpm exec prisma migrate deploy`; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; `pnpm build:server`; `pnpm contracts:generate`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec tsx --test tests/materiality-persistence.integration.ts`; `pnpm test:integration`.
Evidence and remaining blockers: `tests/materiality-persistence.integration.ts` passed against PostgreSQL 18.6 for every case above. Remaining: risk-band assessments and Partner clearance, planning approval that unlocks fieldwork from an approved current assessment, and the UI.
Rollback / forward-recovery impact: additive; a superseded assessment stays as history and is reported stale rather than edited.
Definition of done: met for version-bound materiality with segregation of duties and staleness; planning approval and risk-band persistence are separate tasks.
