# T054 handoff — lead stages and proposal-entry workflow

Status: `IN_REVIEW` (independent review pending). Leads record PHONE/WHATSAPP/EMAIL/WEB/REFERRAL sources with a manual profile form and a gated progression NEW → PROFILED → PROPOSAL_ENTRY (`packages/server/src/modules/commercial/leads.ts`).

- AC1: an incomplete profile cannot advance — the command names the missing required fields (proven).
- AC2: a duplicate submission stays visible as its own lead linked by `duplicateOfId`; no implicit merging (proven).
- AC3: lead intake creates no engagement, no role grants and no memberships, and never moves an engagement state (proven).

Commands: `pnpm verify:task -- T054`. Lead-to-engagement conversion and the connected leads/entities screens remain open.

## Response contract and OpenAPI follow-up — 2026-10-05

Lead create/list/profile/advance now have explicit response schemas and generated OpenAPI success responses. The list projection omits persistence-only firm/creator fields and serializes timestamps to ISO strings. `pnpm contracts:check`, `apps/api/tests/contracts.integration.ts` and the shared `tests/commercial-crm.integration.ts` passed; `pnpm verify:affected` passed with 30 Vitest files/137 tests and an Angular production build. Lead-to-engagement conversion and connected screens remain open, so T054 stays `IN_REVIEW`.
