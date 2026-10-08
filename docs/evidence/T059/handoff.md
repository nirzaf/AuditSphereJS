# T059 handoff — partner risk sign-off wired to the dual-key gate

Status: `IN_REVIEW` (independent review pending). Only RISK_PARTNER_CLEAR holders clear the current review version; the Key 2 gate now reads exactly that governance-recorded clearance and rejects a stale review version (PARTNER_RISK_CLEARANCE_STALE); AC1-3 proven.

Commands: `pnpm verify:task -- T059` (build:server + acceptance-cases integration suite, PostgreSQL 18.6 Testcontainers).

## Addendum — merge fixes (2026-10-08)

The T055–T059 merge (ef27ee5) brought the acceptance Key 2 rule into `main` without updating the CRM test or declaring response schemas. Two fixes followed: the four acceptance and identity routes now declare response schemas (`engagementIdentitySchema`, `acceptanceCaseCreatedSchema`, `acceptanceReviewStateSchema`, `acceptanceClearanceSchema`), and `tests/commercial-crm.integration.ts` records its Key 2 clearance through a completed acceptance review cleared by a second partner, as T059 requires. `apps/api/tests/contracts.integration.ts` and `tests/commercial-crm.integration.ts` pass again; the T053, T054 and T055–T059 recipes pass.
