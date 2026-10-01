# P6-03 — Persisted risk bands with database-derived colour and Partner clearance

Status: DONE (persistence and clearance); owner assignment, planning gate and UI remain
Intent: Replace the pure band rule's lack of records with an append-only assessment series whose colour the database derives and validates, and require Partner clearance of the current red band.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `Application/Audit/RiskBandService.cs`, `Domain/Audit/MaterialityAndRiskBands.cs` (`RiskBandAssessment`, `RiskPartnerClearance`, `RiskOwnerAssignment`, `RiskBandRules`).
Destination commit and files: `packages/server/src/modules/governance/risk-service.ts`, `packages/server/src/modules/governance/risk-controller.ts`, `prisma/migrations/202610010014_risk_band_assessments/migration.sql`, `tests/risk.integration.ts`.
Existing T-task links: T059, T087; P6-01.
Dependencies: the pure `riskBand` rule from P6-01 and the capability model from WP6.
Scope: `RiskItem`, append-only `RiskBandAssessment`, append-only `RiskPartnerClearance`; band always derived by the pure rule; database check that rejects a stored band that disagrees with likelihood × magnitude and the flags; scores constrained to 1–3; clearance only for a red, current assessment; `RISK_MANAGE` and `RISK_PARTNER_CLEAR` capabilities; current-risk read model.
Non-goals: Risk owner assignment by staffing rank, risk routing into workprograms, planning approval gating fieldwork, and the UI.
Current behavior and invariants: the colour is never supplied by the caller. A fraud or significant risk is always red; otherwise likelihood × magnitude of 6+ is red, 3–4 amber, 1–2 green. The database enforces the same rule independently. A clearance attaches to one exact assessment and does not carry over to a newer one. Assessments and clearances are append-only.
Proposed contract / schema change: `createRiskSchema`, `assessRiskSchema`, `clearRiskSchema`; three tables plus check constraints and four triggers; two capabilities added to the grant check constraint.
Permission and transaction boundary: capability checks inside the transaction; the assessment/clearance and its audit event commit together.
Historical data / document impact: additive; changing an opinion creates a new assessment rather than editing one, so the earlier band and its clearance remain as history.
Implementation steps: as recorded in migration 202610010014, the service and the controller.
Relevant existing tests: `tests/materiality.test.ts` (the quoted band matrix).
Minimal additional acceptance tests: capability denial to create and clear; invalid scores rejected; green/amber/red/fraud derivation; database rejection of a wrong stored band; clearance denied for non-partner and non-red; duplicate clearance refused; a newer assessment supersedes a cleared one; append-only assessment and clearance mutations refused.
Commands actually executed: `pnpm exec prisma validate`; `pnpm exec prisma migrate deploy`; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`; `pnpm build:server`; `pnpm contracts:generate`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec tsx --test tests/risk.integration.ts`; `pnpm test:integration`.
Evidence and remaining blockers: `tests/risk.integration.ts` passed against PostgreSQL 18.6 for every case above. Known limitation: the current assessment is ordered by assessment time with an id tiebreak, so two assessments written in the same millisecond would order by id rather than insertion; a sequence column would remove that ambiguity. Remaining: owner assignment by minimum staffing rank, risk routing, planning approval and the UI.
Rollback / forward-recovery impact: additive history; a superseded band is reported as superseded rather than deleted.
Definition of done: met for band persistence and Partner clearance; owner assignment and the planning gate are separate tasks.
