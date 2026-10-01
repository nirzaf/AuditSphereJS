# Governance
Purpose: own firm/client/engagement lifecycle commands, materiality, risk and the governance domain described in the architecture plan.
Owned use cases: guarded engagement lifecycle commands; pure materiality/risk-band rules; persisted version-bound materiality assessments with segregated approval; persisted risk bands with database-derived colour and Partner clearance. Wider acceptance/continuance/activation and risk owner assignment are still pending.
Owned tables: EngagementTransition, MaterialityAssessment (append-only, frozen when approved), RiskItem, RiskBandAssessment (append-only), RiskPartnerClearance (append-only). Engagement itself is platform-scoped ownership.
Public services: applyLifecycleCommand, lifecycleHistory, permittedCommands; deriveBenchmark, validateMateriality, calculateMateriality, riskBand, riskRoute; calculateMaterialityAssessment, approveMaterialityAssessment, latestMaterialityAssessment; createRisk, assessRiskBand, clearRiskBand, currentRisks.
Published events: none yet; audit events and history rows are written in the same transaction.
Consumed events: none.
Allowed dependencies: platform services (db, authorization, decimal6) and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations.
State transitions: lifecycle commands are named and the target state is derived; `nextState()` is presentation-only. Materiality and risk are append-only series whose approval/clearance binds one exact record.
Critical invariants: scoped authorization re-checked inside write transactions, optimistic expected versions, required command evidence, append-only history and audit, idempotent replay; materiality binds an exact published version and taxonomy version, the calculator cannot approve their own assessment, a newer publication makes it stale; a risk colour is derived and independently re-validated by the database, and only the current red band can be cleared by a Partner-capable user.
Relevant tests: tests/lifecycle.integration.ts, tests/materiality.test.ts, tests/materiality-persistence.integration.ts, tests/risk.integration.ts (real PostgreSQL where state is involved).

Functional source: docs/requirements/CURRENT.md (unchanged v2.1). Decision defaults: docs/decisions/register.json. Production evidence and task completion remain separate from this module scaffold.
