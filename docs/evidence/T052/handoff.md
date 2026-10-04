# T052 handoff — client legal profiles and organizational hierarchy

Status: `IN_REVIEW` (independent review pending). Clients carry legal name, Tax ID, legal form, address and ACTIVE/SUSPENDED/ARCHIVED status; the hierarchy is a self-referencing parent link with a bounded cycle walk in the service and a self-parenting CHECK in the database (`packages/server/src/modules/commercial/directory.ts`, migration `202610040010_commercial_crm`).

- AC1: an organizational cycle is rejected (`tests/commercial-crm.integration.ts`).
- AC2: similar legal names remain distinct clients — no implicit merging (proven).
- AC3: editing the address never rewrites the issued-letter snapshot, which pins the client name at issuance and is immutable (proven over the full dual-key letter flow).

Commands: `pnpm verify:task -- T052`. UI wiring of the entities screen to the real directory API remains open.
