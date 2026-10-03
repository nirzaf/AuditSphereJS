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
