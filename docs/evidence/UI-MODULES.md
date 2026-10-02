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
| Fieldwork | Taxonomy & mapping approval | Protected records, reviewed submission, repeating line editor and read-only mapping suggestions |
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
- Angular component tests: 26 passed (18 module workspace, 6 repeating-line editor, 2 shell), including multi-line submission, immutable approval routes, draft restoration and error-summary focus.
- Prior milestone Playwright affected UI suite: 9 passed, including all screens at 390 px without page overflow, browser history/draft clearing, server authorization error presentation, protected journal line review/version binding, server-advertised lifecycle commands, logo/palette and portal isolation. API interception uses synthetic fixtures.
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

The 27 preparation workflows need owner-domain persistence, commands, durable evidence and professional approval before functional acceptance. The client portal remains disabled without authentication. The repeating editor now covers journal/taxonomy lines and preparation rows for workprogram steps, evidence, confirmations and proposed team assignments. The taxonomy workspace now creates versions, exposes immutable version approval, binds import mapping approval to the selected approved taxonomy and reviews per-import mapping suggestions read-only with approval provenance. Lifecycle UI exposes only commands returned by the existing server; it does not implement the remaining commercial/release/archive transitions. Signature/deliverable/archive preparation does not render, sign, release or lock files. Legacy Angular any/template-driven forms, full accessibility audits and per-feature lazy loading remain open.

## Additional UI verification - 2026-10-02

Taxonomy and mapping approval actions now use engagement-scoped server routes. Structured drafts survive module navigation, and Clear draft resets both header values and lines. Line edits invalidate an existing submission review. Rebuilt line controls update their rendered identities. Workprogram, evidence, confirmation and team forms now support repeated preparation rows without writing business records. Invalid submissions focus an announced summary, with links to invalid header fields and associated inline errors.

## Mapping suggestion provenance view - 2026-10-02

The taxonomy workspace now completes its approval boundary: approved taxonomy version rows expose "Approve import mapping" and a read-only "Review mapping suggestions" action. The suggestion view loads `GET /engagements/:id/imports/:importId/suggestions?taxonomyVersionId=:id` for the selected approved version, shows remembered / already-mapped / unresolved counts, and renders each staged account with a plain-language status (remembered from an approved mapping, already mapped, no remembered mapping, remembered code is not in the approved taxonomy) plus its provenance: source approval ID, times applied and last-approved time. The view issues only a GET request, records no decision, and never writes a mapping; mapping changes remain the set-based mapping editor plus `MAPPING_APPROVE`. No new server contract or schema was needed.

Verification for the mapping-suggestion increment: boundaries, server build, test typecheck, Angular production build, `contracts:check`, vitest (67 tests) and Angular component tests (28 at that increment) passed. The suggestion-view tests verify an exact scoped read-only GET, provenance/reason rendering, and failure handling without recording a decision. The pinned Angular CLI MCP supplied Angular 22 guidance through `scripts/angular-mcp.mjs` after native guidance/search calls returned an unexpected response type.

Built-in browser walkthrough — 2026-10-02: all **37** catalog workspaces were opened across Commercial (6), Governance (6), Fieldwork (9), Reporting (10) and Practice (6); each displayed its expected page title. On Taxonomy & mapping approval, unauthenticated “Load records” returned the sign-in gate and zero records. The Entra redirect round-trip completed and returned to the application without the previous popup `timed_out`; `/api/v1/me` then rejected the tenant account with `Active internal identity is required`. This confirms the account is not mapped to an active local user; no local user, membership or role grant was created, and no engagement records were loaded. Browser acceptance is therefore partial, not complete. No console errors were observed before the redirect. This is live route/auth-boundary evidence, not workflow UAT.

After the identity and Governance ownership changes, `pnpm verify:affected` passed with all 70 tests and the Angular build; `pnpm lint` and `git diff --check` passed. The focused risk integration also passed against PostgreSQL 18.6/Testcontainers. UI navigation and component tests do not establish the remaining preparation workflows' persistence, professional approval, live provider acceptance or end-to-end business acceptance.
