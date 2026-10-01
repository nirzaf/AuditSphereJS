# Module UI coverage

Verified 2026-10-02. 36 workspaces across five modules; 9 connected views and 27 preparation-only views. Preparation forms keep memory-only drafts and cannot approve, bill, send, sign, release or archive records.

| Module | Workspace | Current UI boundary |
| --- | --- | --- |
| Commercial | Lead pipeline | Session-only preparation; persistence and execution pending |
| Commercial | Entities & contacts | Session-only preparation; persistence and execution pending |
| Commercial | Quotes & proposals | Session-only preparation; persistence and execution pending |
| Commercial | Dual-key onboarding | Session-only preparation; persistence and execution pending |
| Commercial | Engagement letters | Session-only preparation; persistence and execution pending |
| Commercial | Advance billing & receipts | Session-only preparation; persistence and execution pending |
| Governance | Acceptance & continuance | Session-only preparation; persistence and execution pending |
| Governance | Team & milestones | Session-only preparation; persistence and execution pending |
| Governance | Engagement directory | Session-only preparation; persistence and execution pending |
| Governance | Materiality | Protected records and reviewed submission |
| Governance | Risk register | Protected records and reviewed submission |
| Governance | Engagement lifecycle | Protected history and permitted versioned transitions |
| Fieldwork | Trial Balance | Existing dedicated API workspace |
| Fieldwork | Workprograms | Session-only preparation; persistence and execution pending |
| Fieldwork | Evidence register | Session-only preparation; persistence and execution pending |
| Fieldwork | Sampling | Session-only preparation; persistence and execution pending |
| Fieldwork | Analytical review & going concern | Session-only preparation; persistence and execution pending |
| Fieldwork | Audit adjustments | Protected records and reviewed submission |
| Fieldwork | External confirmations | Session-only preparation; persistence and execution pending |
| Fieldwork | Published balances | Protected records and reviewed submission |
| Reporting | Review notes | Protected records and reviewed submission |
| Reporting | Summary review memorandum | Session-only preparation; persistence and execution pending |
| Reporting | Audit opinion | Session-only preparation; persistence and execution pending |
| Reporting | Management letter | Session-only preparation; persistence and execution pending |
| Reporting | Representation letter | Session-only preparation; persistence and execution pending |
| Reporting | Correspondence trail | Session-only preparation; persistence and execution pending |
| Reporting | Partner signature & seal | Session-only preparation; persistence and execution pending |
| Reporting | Deliverable package | Session-only preparation; persistence and execution pending |
| Reporting | Compliance archive | Session-only preparation; persistence and execution pending |
| Reporting | Audit integrity | Protected inspection / record decisions where implemented |
| Practice | Firm ledger | Existing dedicated API workspace |
| Practice | Time & utilization | Session-only preparation; persistence and execution pending |
| Practice | Engagement profitability | Session-only preparation; persistence and execution pending |
| Practice | Billing & receivables | Session-only preparation; persistence and execution pending |
| Practice | Operating expenses | Session-only preparation; persistence and execution pending |
| Practice | Firm financial reports | Session-only preparation; persistence and execution pending |

## Verification

- Pinned Angular CLI MCP project discovery and Angular 22 best practices were read before changes; FormRecord documentation was searched. MCP build/test outcomes are recorded locally under ignored .angular/mcp.
- pnpm verify:affected: boundaries, TypeScript/server builds, Angular build and 60 invariant/unit tests passed.
- Angular component tests: 10 passed.
- Playwright affected UI suite: 9 passed, including all 36 screens at 390 px without page overflow, browser history/draft clearing, server authorization error presentation, protected journal line review/version binding, server-advertised lifecycle commands, logo/palette and portal isolation. API interception uses synthetic fixtures.
- Desktop/mobile screenshots inspected locally. No live Microsoft 365 acceptance, full workflow UAT or deployment was performed for this milestone.

## Remaining limitations

The 27 preparation workflows need owner-domain persistence, commands, durable evidence and professional approval before functional acceptance. The client portal remains disabled without authentication. The adjustment editor currently supports two-line entries, and expanded editing remains open. Lifecycle UI exposes only commands returned by the existing server; it does not implement the remaining commercial/release/archive transitions. Taxonomy/mapping approval administration still needs dedicated UI. Signature/deliverable/archive preparation does not render, sign, release or lock files. Legacy Angular any/template-driven forms, full accessibility audits and per-feature lazy loading remain open.
