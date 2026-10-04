# T019 identity boundary handoff — 2026-10-02

**Status:** IN_PROGRESS. This implementation closes the self-identity endpoint and inactive-local-user checks. It does not claim full identity/session acceptance.

## Change

- Added `User.active` with a PostgreSQL default of `true`; migration `202610020009_user_active` preserves all existing users as active until explicitly disabled.
- Applied the five reviewed pending migrations to the local development database (`202610020005` through `202610020009`); `prisma migrate status` reports the schema up to date.
- Refactored Entra and explicit development-fixture authentication through one local-user lookup. Entra identities still bind by `(tenantId, entraObjectId)`; inactive or unmapped users fail with 401.
- Added `GET /api/v1/me`, returning only local user ID, email and active status. Engagement routes still require an active membership and scoped capability; the self route does not grant engagement access.
- Added an Angular identity adapter token for testable MSAL integration, an authenticated-user indicator and MSAL full-page redirect sign-in/sign-out. The callback is processed on app startup before local identity lookup, and one interaction path is used consistently. Sign-out navigation reloads the application, clearing in-memory access and unsaved drafts.
- Added a real PostgreSQL 18.6/Testcontainers + Fastify boundary check for the self endpoint, disabled-user denial on self and engagement routes, foreign engagement denial, and read-only authentication being unable to issue a lifecycle command.
- Expanded signed-token tests for the wrong issuer. Existing tests also reject wrong audience, wrong delegated scope, foreign tenant, expiry and malformed input. The token fixture includes an administrator claim to ensure no directory-role privilege mapping is introduced.

## Verification

| Command | Result |
| --- | --- |
| `pnpm verify:task -- T019` | Passed locally; Entra suite and PostgreSQL/Fastify identity boundary tests passed, including the real PostgreSQL session-revocation cutoff test. |
| `pnpm verify:affected` | Passed locally after the redirect change; boundaries, server/test typechecks, Angular build and 70 unit tests. |
| `pnpm lint` | Passed locally; ESLint and module/browser boundaries. |
| Angular MCP `web:test` | Current change passed; 34/34 across six files, including redirect response handling, local identity lookup and redirect API selection. |
| Angular MCP `web:build` | Current change passed; build output at `dist/web`. |
| GitHub Actions | The latest pushed baseline workflow [37020194478](https://github.com/nirzaf/AuditSphereJS/actions/runs/37020194478) passed on `79191e01c3478da86bdc4b5bd99842ef6e966631`: `verify:all`, contract checks, dependency audit, Linux build/smoke, packaged artifact and public web-assets job all passed. It predates this uncommitted redirect change. |

## Acceptance and limits

- AC1: Wrong audience, issuer, expiry, tenant, scope and malformed credential denial is covered by signed-token unit tests.
- AC2: A locally inactive identity receives 401 on the self and engagement API boundaries.
- AC3: A valid authenticated identity with membership and read-only `ENGAGEMENT_READ` receives 403 for a lifecycle command; engagement state remains unchanged.
- Live browser check on 2026-10-02: the Entra redirect round-trip returned to the app and removed the popup `timed_out`; `/api/v1/me` then returned the expected 401 message `Active internal identity is required`. This tenant account has no active local identity mapping. No user, membership or role was created, and no engagement records were read.
- Still open: acceptance with a mapped staff identity and engagement grants, plus browser-initiated session revocation. T018 ownership constraints are complete. A successful Entra authentication alone does not establish local authorization.
- No credentials, tokens or tenant secrets are included. No deployment or tenant permission change was performed.

## Server-side revocation update — 2026-10-02

- Added reviewed migration `202610020010_identity_session_revocation`. It creates an identity-owned append-only cutoff table; PostgreSQL rejects update and delete. The API role receives only SELECT/INSERT.
- `POST /api/v1/me/revoke-sessions` is available only with Entra authentication and appends a cutoff one whole second after the current token timestamp, ensuring tokens already issued during that second are revoked. Static development credentials receive 409 and do not create an event.
- Each Entra-authenticated request validates the signed token first, binds the immutable tenant/object identity to an active local user, then checks the newest persisted cutoff against token `iat`. Old tokens return 401; tokens issued at/after the cutoff work. This revokes all existing API access tokens for that mapped user.
- `pnpm verify:task -- T019` passed after the change: signed Entra unit tests; a real PostgreSQL Testcontainers test for old-token rejection, post-cutoff token acceptance and append-only enforcement; and Fastify tests for the Entra-only endpoint and disabled/foreign/read-only access boundaries.
- Remaining: live mapped-user SPA acceptance and browser-initiated revocation acceptance in the configured tenant. No tenant permission, credential or application registration was changed.

## Operator-managed identity binding — 2026-10-02

- Added `pnpm identity:map:entra` for an operator to bind an explicitly selected existing active local user to an immutable `(tenantId, entraObjectId)` identity. The default is read-only dry-run; `--apply` requires an exact existing UUID pair and the requested tenant must match `M365_TENANT_ID`.
- The service refuses unknown/inactive users, conflicting or partial mappings, and identities already claimed by another user. The conditional PostgreSQL update and unique constraint prevent competing identity claims; exact replay is idempotent.
- Mapping changes no local role and creates no membership, capability grant or business record. These remain separate reviewed authorization steps.
- Added a PostgreSQL 18.6/Testcontainers test for dry-run inspection behavior, successful bind and replay, inactive/missing/mapped/claimed identity denials, zero implicit authorization, UUID validation and concurrent uniqueness.
- Not run against the live tenant: the administrator identity remains unmapped and no live user assignment or grant was created. The SPA still returns 401 until an explicitly authorized test principal is selected and separately assigned synthetic engagement access.
- `pnpm verify:task -- T019` passed after this change: server compile, Entra token suite (1/1), PostgreSQL session-revocation integration (1/1), PostgreSQL identity mapping integration (1/1) and Fastify identity boundary integration (1/1).
- The identity mapping integration now launches the actual CLI: default invocation is verified to leave the row unmapped; `--apply` is verified to set only tenant/object IDs and leave the local role, memberships and grants unchanged. The first CLI check caught and fixed an argument-parser defect before the passing run.
- `pnpm verify:affected` passed: module/browser boundaries, server and test TypeScript checks, Angular production build, and 81 unit tests across 18 files. `pnpm lint` passed, including ESLint and module/browser boundaries.
- `pnpm verify:task -- T018` passed against PostgreSQL 18.6 and Fastify: scoped job tests (3/3), ownership constraints (1/1), repository lineage (1/1), grant scope (1/1), and foreign-engagement boundary (1/1).
- `pnpm test:integration` and `pnpm verify:all` were not run as full-suite commands in this increment. No GitHub Actions run is claimed until this change is pushed and the workflow completes.
- T019 stays `IN_PROGRESS`; full interactive acceptance still needs an authorized mapped test principal and synthetic engagement grant. No live identity was mapped, and no engagement scope was created.

## Live storage deleted-item verification — 2026-10-02

- `pnpm verify:task -- T156` passed live against the configured nonproduction SharePoint and OneDrive folders (2/2, zero failed or skipped). In each provider, the test uploaded and read a unique synthetic file, confirmed immutable-version recovery after an external same-size edit, verified a write outside the selected folder was denied (403), deleted only its own file, and verified the accepted version read failed closed (404).
- No prior acceptance files were touched. Tenant permissions, app registrations, credentials and business records were unchanged. Token expiry, consent revocation, throttling and ambiguous upload outcomes remain open; the storage subset does not close T156 or T019 live identity acceptance.

## Authorized engagement discovery and shell gate — 2026-10-03

- Added authenticated `GET /api/v1/me/engagements`. It returns only minimal engagement labels for which PostgreSQL has both the caller's membership and an active, in-scope `ENGAGEMENT_READ` grant; revoked or expired grants disappear on the next read. The query reveals no unassigned or cross-firm engagement identifiers.
- Replaced the Entra engagement UUID text box with an explicit selector populated by that endpoint. The app no longer seeds the Entra flow with a development fixture UUID. Changing selection clears visible imports, rows, summaries and unsaved mappings.
- Gated Fieldwork and Practice screens while identity or assignments are unresolved. Signed-out, loading, unmapped and no-assignment states now explain the next step without issuing a business-data request or rendering raw authorization JSON. Practice still requires its separate firm-wide Practice capability after engagement read access.
- Added a PostgreSQL 18.6/Fastify boundary assertion that the selector returns only the user's granted engagement, excludes a membership without `ENGAGEMENT_READ`, excludes a foreign engagement, and removes an engagement immediately after grant revocation.
- Live tenant acceptance remains open: the current tenant administrator is still unmapped, and no local assignment or grant was created. The implementation and synthetic integration test do not represent mapped-user browser acceptance.
- `pnpm verify:task -- T019` passed on 2026-10-03: TypeScript/server build, signed-token checks, PostgreSQL 18.6 session-revocation integration, identity-mapping integration and the Fastify identity boundary integration (1/1 each; zero skips).
- `pnpm verify:affected` passed on 2026-10-03: module/browser boundaries, server and test typechecks, Angular build and 81 Vitest tests across 18 files. Angular CLI MCP `web:test` passed 47/47, and Angular CLI MCP `web:build` passed.
- Built-in browser smoke on `http://localhost:4200/?module=Practice&view=ledger` showed the signed-out access gate. The ledger component and its controls were absent; no fixture engagement ID or raw authorization response appeared. An initial 502 from the local API proxy recovered to HTTP 200 for identity configuration during the same session; the UI now has a dedicated fail-closed error state for future identity-configuration outages.

## Built-in browser route smoke — 2026-10-03

- Navigated all 37 module views: 6 Commercial, 6 Governance, 9 Fieldwork, 10 Reporting and 6 Practice. Each URL changed to the canonical module/view pair.
- Every protected view remained behind the staff-identity gate. No engagement records or business mutation controls appeared, and the browser console reported no warnings or errors.
- The Microsoft sign-in controls were exercised from the Fieldwork workspace. No separate Microsoft tab was observed; the browser remained on the app and the existing unmapped-staff identity message remained visible. This did not establish an authenticated session or live workflow acceptance.
- A read-only PostgreSQL aggregate check found zero local users, active users, Entra mappings, memberships and role grants. No user, identity mapping, engagement, permission grant, tenant setting or business record was created or changed.
- T019 remains `IN_PROGRESS`; mapped-user browser acceptance and browser-initiated revocation still require an approved nonproduction principal and assignment.

## Test-account boundary check — 2026-10-03

- The user-designated existing account is identified in the supplied tenant-roster screenshot as **Client X**. The same roster separately lists a **Staff Fixture** account.
- Client X is not an internal staff principal and must not be mapped to a local `PREPARER` user or granted staff capabilities. Entra directory presence alone does not create local identity, membership, or authorization.
- No local identity, client portal principal, engagement, membership, grant, password or invitation was created. The supplied account was not entered into the browser or authenticated.
- These earlier findings are superseded by the dedicated staff acceptance setup recorded below. Client X remains untouched and unmapped.

## Dedicated staff acceptance setup — 2026-10-03

- The supplied tenant roster distinguishes Client X from the separate Staff Fixture. I verified the Staff Fixture record in Entra as an enabled member and used its immutable object identity; Client X was not selected or mapped.
- In the repository's local development PostgreSQL database, created one `PREPARER` user, a synthetic firm and client, and one engagement in the valid initial `LEAD_INGESTION` state. Added one membership and exactly one active, engagement-scoped `ENGAGEMENT_READ` grant. No write capability, second grant, portal account or non-synthetic client record was created.
- Mapped the existing local user to the Staff Fixture through `pnpm exec tsx packages/server/scripts/map-entra-identity.ts` after a successful dry run. The mapping CLI changed only the Entra tenant/object identity columns. The local seed and mapping used the migration role against the loopback development database `auditsphere`; the application's local API remains configured for the same tenant and registered SPA.
- The first interactive attempt reused the browser's currently signed-in tenant administrator and correctly failed the local mapping check. The SPA now sends MSAL `prompt=select_account` for user-initiated sign-in, with a regression assertion. The built-in browser account chooser then allowed “Use another account”; after selecting the Staff Fixture UPN, Entra reached its password step.
- The account owner must enter the password and complete any MFA. No password, MFA value, authorization response or token is recorded here. The browser is left at that password step. Live SPA acceptance is not complete until the owner finishes sign-in and the browser verifies the active local identity plus the single authorized engagement.
- Verification: Angular CLI MCP `web:test` passed 47/47; Angular CLI MCP `web:build` passed. `pnpm verify:affected` passed with exit code 0: boundaries, server/test typecheck, Angular build and 82 tests across 18 files. The live browser assertion remains pending user-operated authentication.

## Post-mapping browser recheck — 2026-10-03

- Re-ran `pnpm verify:affected` on the current working tree based on commit `a1a39ad63bf2c268c6944fae29104195feae5116`: boundaries passed, server and test typechecks passed, Angular production build passed, and Vitest passed 82/82 tests across 18 files.
- Using the built-in browser, clicked through all 37 Commercial, Governance, Fieldwork, Reporting and Practice screens. Every screen resolved to its expected module/view route. Since the Staff Fixture has not completed interactive sign-in, each protected screen remained at the staff identity gate; no engagement records or mutation controls were exposed.
- The Microsoft sign-in tab remains on the password prompt for the dedicated Staff Fixture. The account owner must enter the password and complete any MFA. No credential or token was entered or recorded by the test operator. The authenticated `/api/v1/me` identity, assigned engagement selector, read-only data views and denied-mutation behavior remain unverified in the browser.
- This is route/access-gate smoke evidence only. It does not complete T019 or establish live SPA acceptance; browser-initiated session revocation remains open as well.

## Authenticated staff browser acceptance — 2026-10-03

- The earlier sign-in returned to the app without an active account because the SPA processed the MSAL redirect from the workspace component after Angular startup. Redirect handling now runs through `provideAppInitializer` before initial routing. The API app manifest was inspected read-only and already specifies `requestedAccessTokenVersion: 2`, matching the server's v2 issuer validation; no Entra app setting, permission or consent was changed.
- Local authentication initially failed because the runtime PostgreSQL role lacked access to the `IdentitySessionRevocation` table. Applied the outstanding reviewed migration `202610020022_commercial_onboarding` with `pnpm db:migrate`, then ran `pnpm db:roles` to provision the existing least-privilege grant. The API role can now query the table; it contained zero revocations. No application data was modified by the browser test.
- Using the built-in browser, selected the dedicated Staff Fixture account. The SPA returned to the workspace showing the mapped PREPARER identity and exactly one authorized engagement: Synthetic Browser Acceptance Client / Synthetic Browser Acceptance Engagement. The selector was produced by `/api/v1/me/engagements`; no token or authorization response was inspected or recorded.
- Selected the synthetic engagement and exercised real read paths: Trial Balance imports loaded successfully with zero imports; Governance Materiality and Reporting Review Notes each loaded zero engagement records; Commercial Quotes & Proposals loaded zero proposals. No upload, approval, posting or other business mutation was submitted.
- Further read-only browser checks found zero Risk records, zero taxonomy versions and zero adjustment journals; lifecycle history was empty and the server reported the authoritative stage `LEAD_INGESTION` with `OPEN_PROPOSAL` as the available next command. Published balances reported no accepted balance version. Audit integrity returned one record marked `Valid: Yes`, with read-only review. The transition review button was not submitted.
- Practice `GET` was correctly denied because this account has no firm-wide Practice grant and showed no ledger data. The observed server error text did not match the UI's previous capability-specific error pattern; the Practice screen now explains the required firm-wide permission. No Practice grant was added.
- Verification on 2026-10-03: `pnpm verify:task -- T019` passed (3 focused PostgreSQL/Fastify checks); `pnpm verify:affected` passed (boundaries, typecheck, production builds, 82/82 Vitest tests); Angular CLI MCP `web:test` passed 48/48; Angular CLI MCP `web:build` passed. The Practice denial-message regression is included in the 48 Angular tests.
- The live SPA identity, engagement selector and read-only route checks are accepted for this nonproduction Staff Fixture. T019 remains `IN_PROGRESS` while browser-initiated session-revocation acceptance is open; that endpoint was not invoked because it revokes the mapped user's previously issued API tokens. No tenant permissions, app registrations, Graph grants, SharePoint data or client records changed.

## Browser-initiated session revocation closure — 2026-10-03

### Identity and outcome

- Task: T019; requirements R003–R005.
- Outcome: app sign-out now calls the protected `POST /api/v1/me/revoke-sessions` with the current Entra access token before clearing SPA identity, engagement data and drafts, then starts MSAL logout. If server revocation fails, local state still clears and the UI reports the failure. The cutoff applies to AuditSphere API tokens issued before it; it does not revoke the Microsoft account or global refresh-token session.

### Files and contracts

- `apps/web/src/identity.ts`: added the self-revocation request through the existing Entra token adapter.
- `apps/web/src/workspace.ts`: calls revocation before local cleanup and MSAL logout; success and failure are reported distinctly.
- `apps/web/src/identity.spec.ts` and `apps/web/src/workspace-auth.spec.ts`: cover bearer request shape, denied API response, ordering, local cleanup and the unconfirmed-revocation path.
- `docs/tasks/02-security/T019-internal-auth.md`, `docs/guides/13-execution-ledger.md`, `docs/evidence/UI-MODULES.md`, `docs/IMPLEMENTATION-STATUS.md` and `docs/microsoft365/`: record the acceptance. No schema, API contract, dependency or tenant permission changed.

### Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| Angular CLI MCP `run_target web:test` via `node scripts/angular-mcp.mjs` | Angular 22 SPA and auth specs | Passed: 7 files, 51 tests | Run output, 2026-10-03 |
| Angular CLI MCP `run_target web:build` via `node scripts/angular-mcp.mjs` | Angular 22 application build | Passed; output at `dist/web` | Run output, 2026-10-03 |
| `pnpm verify:task -- T019` | Entra validation plus PostgreSQL session cutoff, identity mapping and Fastify boundary | Passed; all recorded focused checks passed | Run output, 2026-10-03 |
| `pnpm verify:affected` | Import boundaries, server/test typechecks, Angular build, Vitest | Passed: 18 files, 82 tests | Run output, 2026-10-03 |
| `pnpm lint` | ESLint and module/browser boundaries | Passed; four existing unused-disable warnings in untouched `visual-prototype-simulation/worker/worker-configuration.d.ts` | Run output, 2026-10-03 |
| `git diff --check` | Current working tree | Passed with no whitespace errors | Run output, 2026-10-03 |
| Built-in browser Staff Fixture sign-out | Mapped nonproduction PREPARER and synthetic engagement | Returned to the signed-out workspace; local aggregate check found exactly one `IdentitySessionRevocation` row for the fixture | Browser and PostgreSQL, 2026-10-03 |

### Acceptance and boundaries

- AC1–AC4 are covered by the existing Entra and PostgreSQL/Fastify tests recorded above; the real PostgreSQL cutoff test rejects prior tokens and accepts tokens issued after the cutoff.
- Live browser sign-in, scoped engagement discovery, Trial Balance import read, Materiality read, lifecycle state read, Proposal read, Review Notes read and Audit Integrity verification succeeded. The Workprograms preparation form's repeating step was added and removed without submission or persistence. Practice ledger returned its expected denial because the fixture has no firm-wide Practice grant.
- No CSV, proposal, lifecycle command, approval, journal, payment or client record was created. No Entra registration, tenant permission, Graph grant, SharePoint/OneDrive content or credential changed. The only database write from the browser closure was the intended append-only revocation record for the mapped test user.
- No package, migration or runtime contract was added. Failure to record the cutoff remains visible while local state is cleared.

### Review and next task

- Status: DONE after the recorded task checks and live browser acceptance.
- Open blockers for T019: none. Broader Microsoft 365 expiry, throttling, storage and provider acceptance remain under T156 and are not implied by this task.
- Next eligible dependency task: T021, subject to its own acceptance matrix and verification recipe.

## Local database migration follow-up — 2026-10-03

- The Fieldwork workspace screenshot showed the signed-in Staff Fixture account could not load assigned engagements and displayed an internal server error. The local database was missing the additive staff-authority/team-assignment migrations needed by the current membership and grant query. Applied the pending migrations with `pnpm db:migrate`; `pnpm exec prisma migrate status` now reports all 43 migrations applied.
- Read-only query through `readableInternalEngagements` now returns exactly one assigned synthetic engagement for `auditp0-staff@easyguide.onmicrosoft.com`, with one active membership and one active `ENGAGEMENT_READ` grant.
- `pnpm verify:task -- T019` passes the Entra session, identity mapping and Fastify identity-boundary checks. The development API and Angular server are running; `GET /health/live` returns `ok` and `GET /` returns HTTP 200.
- This follow-up did not inspect or reuse the browser's bearer token and does not claim a post-migration visual browser confirmation. No tenant permissions or business records were changed.

## Cached Entra token retry follow-up — 2026-10-03

- Outcome: authenticated SPA requests now perform one retry after HTTP 401 using MSAL silent acquisition with `forceRefresh: true`, retaining the active account and configured API scopes. This lets a newly signed-in session recover when MSAL initially returns a cached token invalidated by the app-level revocation cutoff. A second 401 still fails closed and produces guidance to verify the designated staff account and immutable local Entra mapping.
- Updated paths: `apps/web/src/api-client.ts`, `identity.ts`, `workspace.ts`, `module-workspace.ts`, `practice.ts`; regression coverage in `api-client.spec.ts`, `identity.spec.ts` and `practice.spec.ts`; Microsoft 365 setup, tenant and troubleshooting guides.
- Identity boundary check: local Staff Fixture remains active as `PREPARER`, tenant-matched, with one membership and one scoped `ENGAGEMENT_READ` grant. Its stored cutoff is from 2026-10-03 02:37 UTC and predates the current check. `/health/ready` and `/api/v1/identity/config` return successfully. No bearer token was read or recorded and no account authority was expanded.
- Verification: Angular CLI MCP `web:test` passed 58/58; Angular CLI MCP `web:build` passed to `dist/web`; `pnpm verify:affected` passed (boundaries, server and test typechecks, Angular build and 84/84 Vitest tests).
- Browser state: the built-in localhost tab was reloaded and showed the signed-out gate. Post-change Entra token acceptance is pending the user completing sign-in as `auditp0-staff@easyguide.onmicrosoft.com`; the user's password/MFA remain user-operated. This is not a new claim of live identity acceptance.

## Identity-boundary verification environment correction — 2026-10-03

- The T019 Fastify boundary fixture now sets `AUTH_PROVIDER=development` explicitly alongside its one-test-only development token. Before this correction, the local `.env` could select `entra`, making the integration fixture send a development token through the Entra verifier and fail with 401 before exercising `/me` or `/me/engagements`.
- `pnpm verify:task -- T019` passed after the correction, including the PostgreSQL identity-mapping, session-revocation and Fastify identity-boundary checks. `pnpm verify:affected` passed (boundaries, server/test typechecks, Angular build and 84 Vitest tests); `pnpm lint` passed with four existing unused-disable warnings in the untouched visual prototype declarations; `git diff --check` passed.
- The built-in browser currently shows the signed-out gate. The Staff Fixture's live post-change Entra sign-in remains unverified until the user completes the Microsoft sign-in; no bearer token was inspected or recorded.

## Live Staff Fixture identity recheck — 2026-10-03

- From the signed-out app, the Microsoft account picker offered the existing Staff Fixture. Selecting it returned to the SPA with the active internal identity label and authorized-engagement selector populated.
- The selector contained the one synthetic Browser Acceptance engagement. Selecting it moved the app into that engagement; no identity-mapping error appeared.
- The Practice workspace then displayed the existing firm-wide Practice permission requirement. No Practice grant was added and no ledger data was loaded.
- A read-only PostgreSQL check confirmed the Staff Fixture is active with role PREPARER, its immutable Entra object ID is mapped under the API's configured tenant, and it has one membership and one current scoped ENGAGEMENT_READ grant.
- This verifies the fresh sign-in and mapping path. The browser started signed out, so it does not exercise the expired cached-token/forced-refresh branch. The user's password, MFA and token contents were not inspected. Client X remains unmapped as an internal staff identity.

## Assignment error and browser state recheck — 2026-10-03

- The active Staff Fixture remains mapped to the configured Entra tenant as an active PREPARER with one membership and one current scoped `ENGAGEMENT_READ` grant. A read-only query through the API's Prisma runtime connection returned exactly the synthetic Browser Acceptance engagement.
- `GET /health/ready`, `GET /api/v1/identity/config`, and the same identity configuration through the Angular `/api` proxy returned HTTP 200. `pnpm verify:task -- T019` passed the Entra validation, session cutoff, identity mapping and Fastify identity/assignment boundary checks.
- In the built-in browser, the older open tab retained an identity-configuration failure screen; a fresh tab loaded the correct Entra sign-in gate without that API error. The fresh tab has its own MSAL session and is awaiting user-operated sign-in as `auditp0-staff@easyguide.onmicrosoft.com`; no password, MFA or access token was handled. No new post-sign-in visual acceptance is claimed.
- The reported assignment 500 did not reproduce in the PostgreSQL-backed Fastify route test or the direct runtime query. Refresh the older tab, then select the Staff Fixture account. If a fresh staff sign-in still returns an error, capture the displayed HTTP status/correlation ID and check the API log without copying a bearer token.
## API error reference visibility — 2026-10-03

- Browser API failures now retain the server `correlationId` as a safe reference. Generic assignment failures display it, and the actionable 401 identity message includes it when the server supplies one; bearer tokens and request bodies remain hidden.
- Verification after this change: Angular CLI MCP `web:test` 9 files / 61 tests; `web:build` passed; `pnpm verify:task -- T019` passed all recorded Entra and Fastify identity checks; `pnpm verify:affected` passed (21 Vitest files / 93 tests); `pnpm lint` passed with the same four unrelated warnings; `git diff --check` passed.
- Current browser state is the fresh Fieldwork Trial Balance sign-in gate, which has loaded identity configuration successfully. A new-tab Entra roundtrip is not claimed until the user completes sign-in.

## Cached staff identity restoration gate — 2026-10-03

- Reproduced a refresh timing issue in the built-in browser: the mapped Staff Fixture was briefly rendered as signed out while MSAL was restoring its cached account; a subsequent observation confirmed the same account and its scoped synthetic engagement. This was a presentation race, not a missing local identity mapping or grant.
- The workspace now holds its sign-in control and protected screens behind an explicit `sessionRestoring` signal until `/api/v1/me` confirms the cached account. A regression test holds restoration pending and verifies the sign-in action stays hidden, then confirms the mapped user appears after resolution.
- Verification: Angular tests passed (10 files / 66 tests), Angular production build passed, `pnpm verify:task -- T019` passed its Entra/session, PostgreSQL identity-mapping, and Fastify identity-boundary checks, and `pnpm verify:affected` passed (boundaries, server/test typechecks, Angular build, 22 Vitest files / 97 tests). Targeted ESLint passed. `git diff --check` returned 0; Git printed only existing LF-to-CRLF working-copy notices.
- After a page refresh in the built-in browser, `auditp0-staff@easyguide.onmicrosoft.com` was restored, and the one assigned Synthetic Browser Acceptance engagement appeared. The Practice screen continued to request its separate firm-wide Practice permission, as intended. No user, membership, grant, tenant permission, or business record was changed.

## Selected engagement status clarification — 2026-10-04

- The built-in browser was already signed in as the mapped Staff Fixture and listed the assigned Synthetic Browser Acceptance engagement. Selecting it and loading Trial Balance imports succeeded; the page reported `Connected. Upload a CSV or open an existing import.` and returned the empty synthetic import list. The reported “could not confirm an active staff identity” error was not present.
- This exposed misleading helper text that continued to say “Choose an engagement” after the user selected one. The shell now reports “Engagement selected” when `workspaceAccess()` confirms the selected item is in the server-provided assignment list; Practice continues to show its separate firm-wide grant requirement.
- No credentials, tokens, business data, tenant permissions or grants were read or changed. This browser check proves the mapped staff and assigned-engagement read path for the existing synthetic fixture only.
