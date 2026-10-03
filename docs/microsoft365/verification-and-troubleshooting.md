# Verify and maintain Microsoft 365 configuration

Last reviewed: 2026-10-03. Run from the repository root with the project's Node 24 and pinned pnpm. Use only designated nonproduction folders.

## Live storage acceptance

```powershell
$env:M365_ACCEPTANCE_ENV_FILE = '.env.m365.acceptance'
pnpm verify:task -- T156
Remove-Item Env:M365_ACCEPTANCE_ENV_FILE
```

The private file must contain `M365_ACCEPTANCE_NONPRODUCTION=1` and the [acceptance variables](application-configuration.md). The harness creates a unique synthetic text file in each folder, validates its bytes/hash, changes that fixture's current bytes and reads the original accepted version. It also attempts a synthetic drive-root write, which must be denied with HTTP 403. It then deletes only its own uniquely named fixture and checks that reading its accepted version either remains byte-exact or fails closed with provider 404. Earlier acceptance files are not modified. A wrongly broad permission could allow the test-only root file to be created and cause the test to fail; inspect and correct the grant rather than treating it as success.

Expected result: 2 tests passed, 0 failures, 0 skipped. Redacted results are written under ignored `test-results/m365-live/`. Copy reviewed redacted summaries into `docs/evidence/T156/`; include tested commit, UTC time, hashes, deleted-item outcome, assertions and remaining gaps. Do not copy tokens, secrets or download URLs. Ordinary CI/unit tests do not run this credentialed harness.

Most recent rerun: 2026-10-03 local time, tested commit `829dfef871315a48cdb29fa0610103bcbc9ad1a6`, 2 passed / 0 failed / 0 skipped. Both designated repositories passed outside-folder 403, exact-version reads, synthetic external edit isolation and deleted-item fail-closed checks. See [per-run evidence](../evidence/T156/live-storage-2026-10-03-829dfef.json). The remaining T156 checks are still open.

## Staff sign-in acceptance

Start the API with Entra variables and development authentication disabled. Open the frontend on the registered `http://localhost:4200` origin and complete MSAL redirect sign-in interactively. A user-initiated sign-in requests `prompt=select_account`; choose the intended staff account or “Use another account” when the browser has an unrelated SSO session. On return, MSAL processes the authorization response in `provideAppInitializer` before Angular Router startup, then restores the selected account and checks `GET /api/v1/me`; the UI does not load engagement data automatically. A disabled or unmapped identity returns 401. Check that an assigned user can read only its intended engagement and an unassigned user/cross-engagement request is denied. Confirm approved mutations require their scoped capabilities. Sign-out uses the matching redirect interaction, and the app clears its in-memory token and engagement drafts/data on navigation; this does not revoke an already issued access token server-side. A local PostgreSQL/Fastify test covers the self endpoint, inactive-user denial and denial of a lifecycle command to a user with read-only access. Angular MCP unit tests cover the UI session outcomes. The dated nonproduction Staff Fixture sign-in, engagement selection and scoped read results are recorded below. An admin-center login, API consent or storage roundtrip alone does not prove this flow. Browser-initiated session revocation and the wider acceptance matrix remain pending.

Current nonproduction handoff (2026-10-03): the existing Staff Fixture identity is mapped to a local `PREPARER` record and one synthetic `LEAD_INGESTION` engagement. It has one engagement membership and one scoped `ENGAGEMENT_READ` grant; no mutation capability was granted. The built-in browser reached that account's password step after selecting “Use another account.” The account owner must enter the password and complete MFA; do not store either in the repository or test evidence. No authenticated SPA response or workflow acceptance is claimed until the browser returns and displays the assigned engagement.

Browser recheck (2026-10-03): `pnpm verify:affected` passed on the current working tree (82/82 tests, server/type checks and Angular production build). The built-in browser exercised all 37 module screens and verified each module/view route while unauthenticated; all remained behind the staff identity gate and exposed no engagement data. The Staff Fixture sign-in is still at the password prompt, so `/api/v1/me`, assigned-engagement discovery and authenticated read/denial behavior have not yet been browser-accepted. This route sweep is not live identity acceptance.

## Failure diagnosis

| Symptom | Checks / response |
| --- | --- |
| Wrong tenant or account in PowerShell | Check `Get-MgContext`; disconnect and sign in to the intended tenant before mutations |
| Redirect mismatch | Match SPA platform and exact URI; current local setup uses `localhost:4200` |
| SSO returns to the SPA but no account becomes active | Ensure `handleRedirectPromise()` finishes during `provideAppInitializer` before Angular Router's initial navigation; do not defer redirect processing until a feature component is created |
| MSAL popup `timed_out` | This SPA uses full-page redirect interaction; verify the registered SPA redirect exactly matches `http://localhost:4200`, allow the browser to return to the app, and inspect the returned Entra/API error. Do not switch between popup and redirect APIs in the same app. |
| API 401 | Check API access token, tenant, v2 issuer, API client-ID audience, expiry, delegated scope and local `User` mapping |
| API 403 | Check membership, active scoped `ENGAGEMENT_READ` and mutation capability; global tenant role is not local business authority |
| Graph authentication failure | Check storage client ID, tenant and credential value/expiry; do not use the secret's key ID as its value |
| Graph upload 403 in approved folder | Check application-role consent, folder application grant, intended drive/folder and current credentials; inspect propagation before changing access |
| Root write succeeds | Runtime access is broader than the selected folder; stop acceptance, inspect this app's grants and correct the boundary |
| Version-content HTTP 400 | Current-version content is unsupported there; the adapter guards a current-item download using version identity/eTag/size plus SHA-256 checks |
| Historical version 404/hash mismatch | Do not substitute current bytes. Investigate version retention or external modification and preserve the recorded reference |
| Missing client repository | Production needs an active per-client PostgreSQL binding; environment defaults do not authorize production clients |
| HTTP 429 or provider outage | Preserve failure evidence; throttling/retry/reconciliation acceptance is pending, so do not claim guaranteed recovery |

Microsoft documents the [current-version content restriction](https://learn.microsoft.com/en-us/graph/api/driveitemversion-get-contents?view=graph-rest-1.0). The adapter permits only HTTPS SharePoint download redirects and does not forward the Graph bearer token to the preauthenticated URL.

## Credential and grant maintenance

Rotate the current acceptance credential before its inventory expiry: create a replacement on the storage app, store it directly in the restricted private file, restart any running service using it, and repeat live tests. After successful validation and confirming no other consumer uses the old credential, remove the old credential. Record new expiry and redacted evidence. Never rotate an unrelated app's existing secret.

Resource grants and app-role consent are independent. Before changing either, identify the exact storage principal and folder, inspect current grants, and record the intended access. Revocation testing should be bounded to this acceptance app/folders, record denial, restore only the same intended grant and verify recovery. This drill has not yet been performed.

Before reusing a folder for durable evidence, verify versioning, retention, ownership, sharing and client isolation. Hash/version checks detect substitution; they do not establish a regulatory records/retention policy. Keep acceptance fixtures separate from client records.

After any change, update [current-tenant.md](current-tenant.md), the relevant setup/configuration section, and [T156 evidence](../evidence/T156/tenant-readiness.md). Mark a check as pending when it was not executed. No recurring unattended administration or monitoring is configured by these guides.

Latest execution: commit `9f6b9e0daa10a25129475e5e7aad53d881108a76`, 2026-10-02, **2 passed / 0 failed / 0 skipped**. Both designated synthetic folders passed version roundtrip, external-edit isolation and outside-folder denial; this run deleted its own synthetic fixture and confirmed a 404 fail-closed response for its accepted-version read. See [redacted per-run evidence](../evidence/T156/live-storage-delete-2026-10-02.json). Earlier evidence is retained separately.

## Authenticated staff acceptance update — 2026-10-03

This update supersedes the earlier pending-password and unauthenticated-browser status above. In the built-in browser, the designated Staff Fixture completed Entra sign-in, `/api/v1/me` resolved to the active mapped PREPARER, and `/api/v1/me/engagements` exposed exactly its one synthetic `LEAD_INGESTION` engagement. Trial Balance imports, Materiality records, Review Notes and Commercial Proposals returned empty lists. Practice ledger access correctly returned 403 because no firm-wide Practice grant was assigned; the UI now displays that missing permission clearly. No write command, tenant permission change, Graph grant change or client record access was performed.

The API app registration was read-only checked and already requests v2 access tokens, matching server validation. The redirect callback now runs in Angular's async app initializer before Router startup. Local `pnpm db:migrate` applied the outstanding reviewed migration and `pnpm db:roles` restored the runtime role's least-privilege access to the session-revocation table; the table had no revocation records. `pnpm verify:task -- T019`, `pnpm verify:affected` (82/82 Vitest tests), Angular CLI MCP tests (48/48) and Angular CLI MCP build passed. No Entra registrations, permissions, credentials or SharePoint/OneDrive contents changed. Browser-initiated session revocation, token expiry, grant revocation/recovery, throttling, retention, client-bound workflow UAT and the broader T156 matrix remain pending. Earlier paragraphs recording the Staff Fixture at the password prompt remain historical; this dated acceptance supersedes them.

## Browser-initiated app-token revocation — 2026-10-03

The SPA Sign out action now calls the protected `/api/v1/me/revoke-sessions` endpoint using the active Entra bearer token, then clears local identity, engagement state and drafts before starting MSAL logout. The built-in browser returned to the signed-out workspace, and a local count confirmed one revocation record for the mapped Staff Fixture. The database cutoff invalidates previously issued AuditSphere API access tokens; it is not a Microsoft account logout or global refresh-token revocation. If the endpoint is unavailable, the app still clears local data and reports that the server could not confirm revocation. Unit, PostgreSQL cutoff, Fastify boundary, Angular sign-out and affected-project checks passed; see [T019 handoff](../evidence/T019/handoff.md#browser-initiated-session-revocation-closure--2026-10-03). Broader token-expiry, tenant-grant, throttling and storage-retention acceptance under T156 remains pending.

## Cached API token recovery — 2026-10-03

An API `401` can also mean the browser reused an Entra access token whose `iat` predates the app's persisted sign-out cutoff; the UI should not imply an unmapped identity before checking a fresh token. Internal identity, engagement-list, Fieldwork and Practice API requests now retry once with `acquireTokenSilent({ forceRefresh: true })` for the same active account and API scopes. The API still validates the refreshed token and checks the same local mapping, membership and grants. If the retry also receives `401`, access stays denied and the message asks the user to sign in with the designated Staff Fixture and have an administrator verify its local `(tenantId, entraObjectId)` mapping. No token, password or MFA data is displayed or logged by this recovery path.

Local state checked during this fix: the designated Staff Fixture is active with role `PREPARER`, its local tenant matches the configured API tenant, it has one membership and one scoped `ENGAGEMENT_READ` grant, and its existing revocation cutoff is earlier than the current check. The API readiness and identity configuration routes return successfully. Angular tests passed 58/58, the Angular CLI MCP build passed, and `pnpm verify:affected` passed (84/84 Vitest tests). The built-in browser is currently signed out after reload, so the refreshed-token roundtrip still needs user-operated sign-in; this is not post-change live identity acceptance.

## Staff identity error recheck — 2026-10-03

The user-visible “could not confirm an active staff identity” message was rechecked from a signed-out browser state. Selecting the already signed-in Staff Fixture account (auditp0-staff@easyguide.onmicrosoft.com) returned to AuditSphere with the active PREPARER identity and the single assigned synthetic engagement. Engagement selection succeeded. The local mapping is active and matches the API tenant; it has one membership and one current scoped ENGAGEMENT_READ grant. Client X (auditp0-client-x@easyguide.onmicrosoft.com) is a client persona, not the internal staff account, so the internal workspace must deny it. Practice can still be denied separately because it has no firm-wide Practice grant. The browser started signed out, so this confirms the fresh sign-in path and does not exercise stale-token forced refresh. If the error recurs while signed in as the Staff Fixture, record the displayed correlation ID and check the API's configured tenant, identity provider and local immutable object mapping without collecting the bearer token, password or MFA data.
