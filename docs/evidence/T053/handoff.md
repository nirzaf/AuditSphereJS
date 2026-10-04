# T053 handoff — contact roles and routing preferences

Status: `IN_REVIEW` (independent review pending). Contacts carry MANAGING_DIRECTOR/CFO_FD/AUDIT_LIAISON roles with one primary contact per role (partial unique index); document categories map deterministically to roles (`documentCategoryRole` in contracts; `packages/server/src/modules/commercial/contacts.ts`).

- AC1: PROPOSAL/ENGAGEMENT_LETTER/DELIVERABLE route to the MD/GM, INVOICE/RECEIPT to the CFO/FD, PBC/CONFIRMATION to the audit liaison (proven).
- AC2: a missing primary recipient blocks dispatch with an explicit error instead of choosing any email (proven).
- AC3: a captured recipient snapshot survives later contact edits unchanged (proven).

Commands: `pnpm verify:task -- T053`.
