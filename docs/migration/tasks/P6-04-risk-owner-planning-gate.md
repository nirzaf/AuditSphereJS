# P6-04 — Risk owner assignment and the planning gate

Status: DONE (owner assignment and the fieldwork planning gate)
Intent: Record who responds to a risk, constrained by the band's minimum staffing rank and by clearance of a red band; and stop fieldwork starting from an unapproved or stale plan.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Audit/RiskBandService.cs` (`AssignOwnerAsync`, `MinimumOwnerRank`), `Domain/Audit/MaterialityAndRiskBands.cs` (`RiskOwnerAssignment`), and `PlanningResourcesAndMaterialityTests` (owner-rank and staleness assertions).
Destination commit and files: `packages/server/src/modules/governance/risk-service.ts`, `packages/server/src/modules/governance/lifecycle.ts`, `prisma/migrations/202610010015_risk_owner_assignment/migration.sql`, `tests/risk.integration.ts`, `tests/lifecycle.integration.ts`.
Existing T-task links: T059, T087, T088, T089; P6-03.
Dependencies: P6-03 risk bands, P6-02 materiality persistence, the lifecycle command kernel.
Scope: `RiskOwnerAssignment` bound to the current band assessment with the owner's staffing level; minimum-rank rule (green any, amber senior, red manager); red bands must be Partner-cleared before assignment; a user cannot assign a risk to themselves; the database independently enforces the minimum rank by trigger. `START_FIELDWORK` now requires an approved materiality assessment bound to the latest published version.
Non-goals: Risk routing into workprograms and procedures, an assignment UI, and firm-specific rank vocabularies.
Current behavior and invariants: an assignment always binds the current assessment, so a superseded assessment's owner does not own the new band. An unapproved plan or a plan bound to an older publication blocks fieldwork with an explicit conflict.
Proposed contract / schema change: `assignRiskOwnerSchema`, `staffingLevelNames`; new table plus a staffing check and two triggers; no schema change for the planning gate.
Permission and transaction boundary: `RISK_MANAGE` to assign; the assignment verifies the current assessment and any required clearance inside the transaction. The lifecycle gate reads the current publication and latest approved assessment inside the command transaction.
Historical data / document impact: assignments are append-only history; a new band needs a new assignment.
Implementation steps: as recorded in migration 202610010015, the risk service/controller and the lifecycle evidence predicate.
Relevant existing tests: `tests/risk.integration.ts`, `tests/lifecycle.integration.ts`, `tests/materiality-persistence.integration.ts`.
Minimal additional acceptance tests: owner below the band's rank refused; self-assignment refused; red without clearance refused; successful assignment of a cleared red band; database trigger refuses a low-rank insert; assignment bound to a superseded assessment is not shown as current; fieldwork refused without an approved plan and refused when the plan is stale.
Commands actually executed: `pnpm exec prisma validate`; `pnpm exec prisma migrate deploy`; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; `pnpm build:server`; `pnpm contracts:generate`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec tsx --test tests/risk.integration.ts tests/lifecycle.integration.ts`; `pnpm test:integration`.
Evidence and remaining blockers: both updated tests pass against PostgreSQL 18.6. PostgreSQL forbids a subquery in a CHECK constraint, so the band-to-rank relation is enforced by a `BEFORE INSERT` trigger instead; the migration was corrected and re-applied after that error. Remaining: routing risks into workprograms, owner assignment UI, and the same staleness gate for later lifecycle steps.
Rollback / forward-recovery impact: additive; a superseded assignment remains as history.
Definition of done: met for owner assignment and the fieldwork planning gate.
