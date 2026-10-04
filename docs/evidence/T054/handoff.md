# T054 handoff — lead stages and proposal-entry workflow

Status: `IN_REVIEW` (independent review pending). Leads record PHONE/WHATSAPP/EMAIL/WEB/REFERRAL sources with a manual profile form and a gated progression NEW → PROFILED → PROPOSAL_ENTRY (`packages/server/src/modules/commercial/leads.ts`).

- AC1: an incomplete profile cannot advance — the command names the missing required fields (proven).
- AC2: a duplicate submission stays visible as its own lead linked by `duplicateOfId`; no implicit merging (proven).
- AC3: lead intake creates no engagement, no role grants and no memberships, and never moves an engagement state (proven).

Commands: `pnpm verify:task -- T054`. Lead-to-engagement conversion and the connected leads/entities screens remain open.
