# Module UI coverage

Verified 2026-10-02. 37 workspaces across five modules; 10 connected views and 27 preparation-only views. Preparation forms keep memory-only drafts and cannot approve, bill, send, sign, release or archive records.

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
| Fieldwork | Audit adjustments | Protected records, reviewed submission and repeating line editor |
| Fieldwork | External confirmations | Session-only preparation; persistence and execution pending |
| Fieldwork | Taxonomy & mapping approval | Protected records, reviewed submission and repeating line editor |
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
- Angular component tests: 18 passed (10 workspace, 8 repeating-line editor), including the multi-line adjustment submission.
- Playwright affected UI suite: 9 passed, including all screens at 390 px without page overflow, browser history/draft clearing, server authorization error presentation, protected journal line review/version binding, server-advertised lifecycle commands, logo/palette and portal isolation. API interception uses synthetic fixtures.
- Desktop/mobile screenshots inspected locally. No live Microsoft 365 acceptance, full workflow UAT or deployment was performed for this milestone.

## Repeating line editor (2026-10-02)

`apps/web/src/line-editor.ts` provides the shared repeating-line editor used by the adjustment and
taxonomy workspaces: add/remove rows between a per-screen minimum and 500 lines, per-field required
and six-decimal money validation, `submitted`-driven error reveal, and a rebuild only when the
engagement/screen scope key changes. Rows are tracked by control identity, and the owning workspace
receives `{rows, valid}` and refuses to submit while the lines are incomplete. Both workspaces remain
session-only presentation: nothing is persisted until the reviewed submission passes server
authorization, and the server keeps sole authority over balance, approval and versioning.

## Remaining limitations

The 27 preparation workflows need owner-domain persistence, commands, durable evidence and professional approval before functional acceptance. The client portal remains disabled without authentication. The repeating line editor covers journal and taxonomy lines only; other repeating structures (workprogram steps, confirmations, evidence links) still use single-record forms. The taxonomy workspace creates a version but does not expose the taxonomy approval or the per-import mapping approval actions, so those remain API-only. Lifecycle UI exposes only commands returned by the existing server; it does not implement the remaining commercial/release/archive transitions. Signature/deliverable/archive preparation does not render, sign, release or lock files. Legacy Angular any/template-driven forms, full accessibility audits and per-feature lazy loading remain open.
