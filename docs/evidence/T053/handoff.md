# T053 handoff — contact roles and routing preferences

Status: `IN_REVIEW` (independent review pending). Contacts carry MANAGING_DIRECTOR/CFO_FD/AUDIT_LIAISON roles with one primary contact per role (partial unique index); document categories map deterministically to roles (`documentCategoryRole` in contracts; `packages/server/src/modules/commercial/contacts.ts`).

- AC1: PROPOSAL/ENGAGEMENT_LETTER/DELIVERABLE route to the MD/GM, INVOICE/RECEIPT to the CFO/FD, PBC/CONFIRMATION to the audit liaison (proven).
- AC2: a missing primary recipient blocks dispatch with an explicit error instead of choosing any email (proven).
- AC3: a captured recipient snapshot survives later contact edits unchanged (proven).

Commands: `pnpm verify:task -- T053`.

## Response contract and OpenAPI follow-up — 2026-10-05

Contact creation/list and routing snapshots now have explicit response schemas and generated OpenAPI success responses. List projections omit persistence-only firm/creator fields and serialize timestamps to ISO strings. `pnpm contracts:check`, `apps/api/tests/contracts.integration.ts` and the shared `tests/commercial-crm.integration.ts` passed; `pnpm verify:affected` passed with 30 Vitest files/137 tests and an Angular production build. Receipt dispatch wiring to T037 remains open, so T053 stays `IN_REVIEW`.
