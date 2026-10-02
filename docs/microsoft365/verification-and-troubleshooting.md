# Verify and maintain Microsoft 365 configuration

Last reviewed: 2026-10-02. Run from the repository root with the project's Node 24 and pinned pnpm. Use only designated nonproduction folders.

## Live storage acceptance

```powershell
$env:M365_ACCEPTANCE_ENV_FILE = '.env.m365.acceptance'
pnpm verify:task -- T156
Remove-Item Env:M365_ACCEPTANCE_ENV_FILE
```

The private file must contain `M365_ACCEPTANCE_NONPRODUCTION=1` and the [acceptance variables](application-configuration.md). The harness creates and retains a unique synthetic text file in each folder, validates its bytes/hash, changes that fixture's current bytes and reads the original accepted version. It also attempts a synthetic drive-root write, which must be denied with HTTP 403. A wrongly broad permission could allow that test-only root file to be created and cause the test to fail; inspect and correct the grant rather than treating it as success. There is no automatic file deletion.

Expected result: 2 tests passed, 0 failures, 0 skipped. Redacted results are written under ignored `test-results/m365-live/`. Copy reviewed redacted summaries into `docs/evidence/T156/`; include tested commit, UTC time, hashes, assertions and remaining gaps. Do not copy tokens, secrets or download URLs. Ordinary CI/unit tests do not run this credentialed harness.

## Staff sign-in acceptance

Start the API with Entra variables and development authentication disabled. Open the frontend on the registered `http://localhost:4200` origin and complete MSAL redirect sign-in interactively. On return, MSAL processes the authorization response before restoring the cached account and checking `GET /api/v1/me`; the UI does not load engagement data automatically. A disabled or unmapped identity returns 401. Check that an assigned user can read only its intended engagement and an unassigned user/cross-engagement request is denied. Confirm approved mutations require their scoped capabilities. Sign-out uses the matching redirect interaction, and the app clears its in-memory token and engagement drafts/data on navigation; this does not revoke an already issued access token server-side. A local PostgreSQL/Fastify test covers the self endpoint, inactive-user denial and denial of a lifecycle command to a user with read-only access. Angular MCP unit tests cover the UI session outcomes. These checks do not replace interactive Entra/browser acceptance. An admin-center login, API consent or storage roundtrip does not prove this flow. Record actual outcomes before closing T151/T156; the live SPA-to-API journey and server-side revocation behavior remain pending.

## Failure diagnosis

| Symptom | Checks / response |
| --- | --- |
| Wrong tenant or account in PowerShell | Check `Get-MgContext`; disconnect and sign in to the intended tenant before mutations |
| Redirect mismatch | Match SPA platform and exact URI; current local setup uses `localhost:4200` |
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

Latest execution: commit `d301c78e4185a852aa3d14d9f4c8dd32fd722d57`, 2026-10-02, **2 passed / 0 failed / 0 skipped**. The per-run redacted records are in [T156 evidence](../evidence/T156/live-storage-2026-10-02-d301c78.json); older evidence is retained separately.
