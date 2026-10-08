# Module UI coverage

Verified 2026-10-04; recounted 2026-10-08 from the table below: 39 workspaces across five modules; 14 connected views and 25 preparation-only views (the earlier summary said 38, 11 and 27, which did not match the table). Preparation forms keep memory-only drafts and cannot approve, bill, send, sign, release or archive records.

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
| Reporting | Document templates | Server-backed version catalog, controlled preview, partner-capability-gated asset/version approval and activation |
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
| Practice | Rate cards & staff grades | Dedicated API-backed rate/grade administration; requires firm-wide Practice permission |
| Practice | Time & utilization | Session-only preparation; persistence and execution pending |
| Practice | Engagement profitability | Session-only preparation; persistence and execution pending |
| Practice | Billing & receivables | Session-only preparation; persistence and execution pending |
| Practice | Operating expenses | API-backed expense drafts/posting, liability settlements and immutable firm-private receipt attachment; requires firm-wide Practice grants |
| Practice | Firm financial reports | API-backed firm trial balance and monthly Profit & Loss with comparison, paginated journal-source drill-down, snapshot metadata export; AR aging remains pending |

## Verification

Document-template workspace — 2026-10-04: the new Reporting screen loads the shared Zod-validated catalog from the selected engagement, previews only the selected version's allowed variables and renders block text through Angular interpolation (no HTML injection). Only the API's `canManage` result exposes draft/version/asset controls; every mutation still rechecks `DOCUMENT_TEMPLATE_MANAGE` in PostgreSQL. The focused Angular suite passes 4/4. The T036 task recipe covers compiler/golden fixture tests, PostgreSQL 18.6 + fake Graph acceptance, PDF worker checks and Angular component tests. Changing engagement or staff session immediately clears catalog data, draft values and selected artwork. In the built-in browser, the mapped Staff Fixture selected its synthetic engagement and loaded the empty catalog; it saw no draft, asset metadata or manager control. The local migration and restricted-role grants were applied. Live Graph acceptance for these firm assets is pending a dedicated `template-assets-private` folder binding and selected-folder grant; the two existing client-folder grants are not reused.

Practice receipt UI update — 2026-10-04: Operating Expenses now lists receipt metadata per expense and accepts PDF/JPEG/PNG files up to 15 MB with visible upload status and validation. The focused Angular suite passes 5/5 and `pnpm verify:task -- T144` passes its PostgreSQL receipt integration. The live browser identity is the mapped Staff Fixture and resolves successfully, but its only business grant remains the scoped ENGAGEMENT_READ grant; the Practice UI therefore correctly stays behind the firm-wide Practice permission gate. The real Graph folder binding is also pending an administrator-provisioned `practice-private` folder grant. No identity or permission was widened for this UI check.

Monthly firm Profit & Loss — 2026-10-05: Practice now mounts a real API-backed statement screen with current/comparison accounting-month parameters, income/expense totals, mapped account rows, paged posted journal-source detail, stale-snapshot protection and CSV export of the report parameters, database as-of time and content hash. Focused Angular component and shell tests pass. The built-in browser renders this route; the Staff Fixture receives the expected `PRACTICE_READ` denial because it has no firm-wide Practice grant, so the browser run verifies the protected boundary rather than live report data. PostgreSQL 18.6 integration verifies report results, Trial Balance reconciliation and the full detail workflow; see [T146 handoff](../evidence/T146/handoff.md).

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

## Simulation prototype workspace - removed 2026-10-03

The in-memory simulation workspace ported from `visual-prototype-simulation/` (React) was removed from `apps/web` on 2026-10-03 after the real server-backed implementation of the same onboarding spine landed: versioned proposals, the dual-key gate, the immutable engagement letter and advance invoices are now live PostgreSQL-backed behavior behind guarded lifecycle commands (`docs/evidence/T069/handoff.md`). The four Commercial screens connect to the real API. No simulation code, styles, specs or routes remain in `apps/web`; the reference prototype directory itself was left untouched as source material.

## Retired simulation URL compatibility - 2026-10-03

The shell now canonicalizes unsupported query parameters with `replaceUrl`: opening `/?module=Simulation&view=simulation` resolves to `/?module=Fieldwork&view=trial-balance` and renders the real Trial Balance workspace. The built-in browser confirmed the canonical address, five real business-module selectors and absence of the prototype banner. The route regression test and five-module/no-demo test pass as part of 39 Angular component tests; `pnpm verify:affected` passes the production server/web builds, boundaries and 81 Vitest tests. No login was performed by this check; the page correctly remains behind the internal sign-in gate and no engagement data is loaded without an assigned identity. This verifies route compatibility and UI boundaries only, not full prototype workflow parity or live-user acceptance.

## Authenticated browser acceptance — 2026-10-03

The Staff Fixture signed in through the built-in browser after redirect handling moved to Angular's app initializer, before initial router navigation. The mapped PREPARER saw exactly one assigned synthetic engagement and selected it. Trial Balance imports, Governance Materiality and Risk records, Reporting Review Notes and Commercial proposals all completed their read requests with zero records. The lifecycle view showed authoritative `LEAD_INGESTION`, empty history and the server-provided `OPEN_PROPOSAL` next command; no transition was submitted. Taxonomy and adjustment lists were empty, published balances had no accepted version, and Audit Integrity showed a valid read-only record. Practice ledger access returned 403 as designed because the account has no firm-wide Practice grant; the UI now names that missing permission accurately. No business mutation was submitted. This is live identity and scoped read-path evidence for the synthetic account, not workflow UAT or proof that the 27 preparation-only screens are server-backed. `pnpm verify:affected` passed 82/82 Vitest tests; Angular CLI MCP tests passed 48/48 and its build passed. Browser session revocation remains unverified.

## Practice authorization error presentation - 2026-10-03

The Practice ledger no longer renders nested API error objects as raw JSON. HTTP 401 now explains that the sign-in is inactive and directs the user to reconnect or confirm their AuditSphere assignment; HTTP 403 reports the missing firm-wide Practice permission. Failed loads keep ledger data empty. A regression test uses the same nested NestJS 401 envelope shown in the browser and asserts the message is readable and contains no raw `statusCode` object. Angular tests pass 40/40; `pnpm verify:affected` passes boundaries, server and Angular builds, typechecks and 81 Vitest tests. The live tenant user remains unmapped, so no business data or firm-wide permission was granted during this check.

## Authenticated built-in-browser acceptance — 2026-10-03

Using the mapped Staff Fixture and its one synthetic engagement, the browser loaded Trial Balance imports (0), Materiality records (0), lifecycle state (`LEAD_INGESTION`, server-provided `OPEN_PROPOSAL` command), Commercial proposals (0), Review Notes (0), and Audit Integrity (valid, read-only). Workprograms remains a session-only preparation screen; adding and removing a procedure line made no server request. Practice ledger returned the expected missing firm-wide grant message. Browser sign-out recorded one local `IdentitySessionRevocation` row and returned to the signed-out workspace. No business command or file upload was submitted. See the [T019 handoff](T019/handoff.md).

## Internal identity and Practice access guidance - 2026-10-03

The Entra sign-in state is now set only after `/api/v1/me` confirms an active local identity; a rejected identity stays signed out. The 401 message directs the user to retry sign-in and then have an administrator verify the local Entra mapping. The workspace explains that protected modules need engagement assignment and scoped permission, while Practice additionally needs firm-wide Practice permission. Practice 403 feedback distinguishes a missing engagement assignment from a missing firm-wide Practice capability, and 401 feedback no longer exposes nested API JSON. The built-in browser on `http://localhost:4200/?module=Practice&view=ledger` showed the updated identity guidance and no ledger records. Angular CLI MCP tests pass 43/43 and the Angular build passes. This remains a UI/auth-boundary improvement: the current tenant account still has no verified local identity mapping, membership or Practice grant, so live Practice access remains blocked.

## Five-module browser route smoke — 2026-10-03

In a fresh built-in-browser pass, the sidebar opened Commercial (`leads`), Governance (`acceptance`), Fieldwork (`trial-balance`), Reporting (`reviews`) and Practice (`ledger`); each route query and workspace heading matched its module, and each showed its expected module-specific view tabs. The app returned to the normal Entra sign-in gate with no engagement data exposed. API readiness and `/api/v1/identity/config` returned HTTP 200, and the response validated against the shared identity schema. The Microsoft sign-in tab currently requires the Staff Fixture password again, so this pass confirms route navigation and fail-closed signed-out rendering only; it does not repeat the authenticated workflow checks above. No record or permission was changed.

## Effective-dated Practice rates and staff grades — 2026-10-03

Practice now has an API-backed rate-card and staff-grade screen. The server seeds the six grade defaults at the required four QAR amounts, permits authorized versioned future revisions with non-overlapping half-open intervals, and keeps grade identity separate from membership access roles. PostgreSQL stores immutable time-value snapshots after validating the assigned staff member, engagement, effective grade/rate, duration and half-even charge-out value. Time capture and approval screens remain pending under T140/T141.

Angular CLI MCP guidance was consulted; the screen is standalone/OnPush with signal state, typed reactive forms, shared contracts, accessible labels and explicit loading/error states. `pnpm verify:task -- T139` passed, including 4 Angular tests. `pnpm verify:affected` passed with 22 Vitest files / 96 tests and the Angular production build.

In the built-in browser, the existing `auditp0-staff@easyguide.onmicrosoft.com` Staff Fixture now confirms as an active local PREPARER and returns its one synthetic assigned engagement, resolving the earlier active-staff identity warning after a fresh sign-in. The Rate cards & staff grades screen returns the designed firm-wide Practice permission denial for this PREPARER. No permission, grant or business record was changed; successful live rate administration remains unverified.

Firm financial reports update — 2026-10-05: the Practice Firm trial balance view now calls the protected PostgreSQL-backed report API, displays opening/period/closing totals and account lines, and provides paginated history plus a deterministic CSV export. PostgreSQL and Angular tests pass. The built-in browser authenticated as the existing Staff Fixture and loaded the view; its `PRACTICE_READ` request received the intended 403 because the account has only engagement-scoped `ENGAGEMENT_READ`. No permission was added. Live positive Practice access remains unverified.

## Identity configuration recovery - 2026-10-04

The workspace now offers an in-app **Retry API connection** action after its initial identity-configuration request fails. Retrying re-fetches `/api/v1/identity/config`, restores the existing Entra session when available, and keeps protected data hidden until normal identity and engagement checks succeed. The browser investigation found the original tab still displaying an earlier unavailable state while API readiness and both direct and proxied identity-config requests returned HTTP 200; a fresh built-in-browser tab rendered the normal signed-out gate. No sign-in, identity, grant or business-data mutation occurred in this check. Angular tests pass 71/71, including fail-closed outage handling and recovery on retry. This UI recovery does not treat identity 401s as valid staff mappings; those still require the existing server-side identity check.

## Practice P&L responsive usability refinement — 2026-10-05

The report period controls now use mobile-first stacked fields, readable helper text and 44 px inputs/buttons; totals progress from a compact phone layout to two/three columns; and the report header explicitly clears the shared shell's fixed-height header style. Scrollable statement and source tables announce horizontal scrolling on small screens and remain keyboard focusable. Validation and API failures use an assertive alert, successful updates use a polite status, and 401/403/409 responses provide recovery guidance while preserving the server correlation ID. The duplicated empty-state load action was removed. Shared engagement-selection controls also wrap between 761–900 px, fixing the tablet-width shell overflow discovered during browser QA.

Verification: `pnpm verify:task -- T146` passed (PostgreSQL report test 1/1, P&L tests 3/3, Practice workspace tests 23/23, contract/OpenAPI checks); `pnpm verify:affected` passed (30 Vitest files, 137 tests); all Angular tests passed (15 files, 88 tests); production build and lint passed. In the built-in browser, the real P&L view was inspected at 320, 390, 768, 900 and 1280 px: no page-level horizontal overflow and period controls stayed 44 px high. The current Staff Fixture received the expected `PRACTICE_READ` denial; the new alert explains the required firm permission and shows its reference ID. No permission or business data changed, so positive live report-data rendering remains unverified.

## Shared workspace responsive navigation — 2026-10-05

Module navigation now wraps into a responsive grid instead of hiding workspace destinations in a horizontal strip. On phone widths, the five business modules use a two-column layout; engagement controls wrap without squeezing the signed-in identity; Trial Balance metric cards adapt from three columns to one as space narrows. Keyboard focus and the existing `aria-current` state remain intact.

In the built-in browser at 320, 390, 768, 1024 and 1440 px, all five module buttons and all eight Practice destinations remained visible, with no document or workspace-tab horizontal overflow. The browser session remains gated before firm Practice report data because the mapped Staff Fixture has no firm-wide `PRACTICE_READ` permission; no access grants or business records were changed. `pnpm verify:affected` passed (30 Vitest files, 137 tests, type checks and production build); Angular tests passed (15 files, 88 tests).

## Practice report navigation and responsive usability — 2026-10-05

The browser title now follows the active module and screen instead of remaining on the static Fieldwork title. The Monthly Profit & Loss route no longer repeats the shell's generic engagement-load status; its own report status is the single next-step prompt, and the unloaded view explains the statement scope and amount-to-source drill-down. No accounting, authorization or report behavior changed.

The built-in browser confirmed the Practice title and report guidance for the existing Staff Fixture. No report data was loaded: this identity still has no firm-wide `PRACTICE_READ` grant. A synthetic API-intercepted Playwright check passed at 320, 390, 768, 900 and 1280 px with no document overflow, 44 px report controls and a keyboard-focusable horizontal statement table. Angular CLI MCP 22.2.1 guidance was loaded through `scripts/angular-mcp.mjs` after native MCP guidance calls returned an unexpected response. `pnpm verify:affected` passed with 30 Vitest files / 137 tests, server/test typechecks, boundaries and production Angular build; Angular tests passed 89/89; the focused responsive Playwright test passed 1/1; `pnpm lint` and `git diff --check` passed.

## Cross-module responsive and form usability — 2026-10-05

The shell no longer repeats an engagement-selection prompt in its global status line; live status is reserved for active work or an actionable result. Forms now expose named controls, email fields use email autocomplete and validation, integer fields use numeric input behavior, and repeating-line controls have stable names. Trial Balance mapping has a keyboard-focusable horizontal scroll region, workflow guidance wraps at tablet widths, and nested panels no longer become competing scroll containers. Small template and account controls meet a 44 px touch target. The revised body text measures 4.77:1 on the canvas and 5.14:1 on white; the accent text measures 5.79:1 and 6.23:1 respectively. Invalid-character separators in the workflow UI were replaced with a readable middle dot.

The route matrix covered all 40 catalog screens at 320, 390, 768, 900, 1024, 1280 and 1440 px. Each viewport stayed within the page width; every visible mobile control met the 44 px target; preparation forms had named fields; and email fields advertised the email autocomplete token. The focused P&L check also passed at phone, tablet and desktop sizes. The built-in browser was inspected at tablet and desktop widths; no business data was loaded and no authorization or server records were changed.

Verification: the focused Playwright suite passed 7/7; Angular CLI MCP tests passed 15 files / 89 tests; `pnpm verify:affected` passed with 30 Vitest files / 137 tests, server/test typechecks, boundaries and the production Angular build; `pnpm lint` and `git diff --check` passed.

## Practice firm-context guidance — 2026-10-05

On firm-wide Practice screens, the engagement selector now reads “Firm context” and explains that an assigned engagement identifies the firm while the server separately enforces firm-wide Practice permission. The no-assignment and no-selection states use the same explanation, and the selector is associated with its live guidance for screen readers. A denied P&L read now says `PRACTICE_READ` is missing, directs the user to an administrator, and clarifies that selecting an engagement grants no authority. API authorization and report routes are unchanged.

Angular CLI MCP 22.2.1 tests pass (15 files / 90 tests); `pnpm verify:affected` passes (30 Vitest files / 137 tests, server/test typechecks, boundaries and production Angular build); lint passes. Focused P&L Playwright verification passes at 320, 390, 768, 900 and 1280 px; the cross-module responsive suite passes 6/6, including its 40-screen matrix at 320–1440 px. In the built-in browser, the signed-in Staff Fixture selected the existing synthetic engagement and loaded the real P&L endpoint; the server denied it with the expected firm-wide `PRACTICE_READ` message and no report data. No grants or business records changed.
