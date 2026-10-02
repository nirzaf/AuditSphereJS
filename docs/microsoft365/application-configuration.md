# Configure AuditSphereJS for Microsoft 365

Last reviewed: 2026-10-02. Variable names below are checked against `.env.production.example`, `platform/config.ts`, `platform/entra.ts` and `platform/repository.ts`.

## Identity and storage variables

Use a private local environment file or server secret manager. Preserve database/Redis configuration. Never place a server secret in Angular assets, committed examples, screenshots or CI artifacts.

| Variable | Value / meaning |
| --- | --- |
| `AUTH_PROVIDER` | `entra` |
| `DEV_AUTH_ENABLED` | `false`; production also rejects any `DEV_AUTH_TOKEN` |
| `M365_TENANT_ID` | Intended tenant UUID; shared by staff identity and storage |
| `ENTRA_API_AUDIENCE` | API application/client UUID for the selected v2 access token |
| `ENTRA_API_SCOPE` | `access_as_user` |
| `ENTRA_BROWSER_CLIENT_ID` | SPA application/client UUID |
| `ENTRA_BROWSER_API_SCOPE` | `api://<API client UUID>/access_as_user` |
| `ENTRA_BROWSER_REDIRECT_URI` | Exact SPA redirect, locally `http://localhost:4200` |
| `WEB_ORIGIN` | Matching frontend origin; production requires HTTPS |
| `STORAGE_PROVIDER` | `graph` |
| `M365_CLIENT_ID` | Separate storage application/client UUID, not the SPA/API UUID |
| `M365_CLIENT_SECRET` | Storage credential value from private configuration |
| `SHAREPOINT_DRIVE_ID`, `SHAREPOINT_FOLDER_ID` | Verified evidence fixture drive/folder |
| `ONEDRIVE_DRIVE_ID`, `ONEDRIVE_FOLDER_ID` | Verified working-file fixture drive/folder |

The production startup validator currently requires all four drive/folder variables. However, production repository resolution requires an active PostgreSQL `ClientRepository` binding for the exact `firmId`, `clientId`, `purpose` and `provider='graph'`. Migration `202610020007_repository_scope` adds a composite foreign key so the stored firm and client must belong together; the PostgreSQL integration test verifies a mismatched pair is rejected. Migration `202610020008_role_grant_scope_fks` applies the same firm/client/engagement hierarchy checks to scoped authorization grants, and its Testcontainers fixture rejects a client or engagement paired with a different owner tuple. Environment folders are a development fallback only; setting them does not provision production clients. Use `purpose='evidence'` for SharePoint and `purpose='working'` for OneDrive. Client repository provisioning/admin UI is not a completed workflow; do not assume setting tenant configuration creates those records. These schema checks do not prove live SharePoint/OneDrive acceptance or provision a tenant repository.

The server reads environment configuration at startup and caches provider clients. Restart affected API/worker processes after identity or credential changes. Loading the acceptance harness's environment file does not change the separately running API.

The Angular SPA uses MSAL full-page redirect login and logout with authorization code + PKCE. `restoreSession()` awaits `handleRedirectPromise()` before any interactive request and then checks the returned account through `/api/v1/me`. Do not combine popup and redirect interactions in this app. A redirect to Entra can succeed while `/api/v1/me` still returns 401 when the immutable tenant/object identity is not mapped to an active local `User`; do not resolve that denial by granting a business role implicitly.

## Staff assignment

Map the intended staff identity to `User.tenantId` and `User.entraObjectId`, using the immutable Entra object ID, not email alone. Add membership for the intended engagement and current scoped role grants, including `ENGAGEMENT_READ`; mutations need their own capabilities. Tenant Global Administrator status does not create local partner, reviewer or finance authority.

The backend validates tenant, v2 issuer, audience, RS256 signature, expiry and delegated API scope before looking up the local user. It binds `(tenantId, entraObjectId)` to an active local `User`; setting `User.active=false` immediately denies `/api/v1/me` and engagement routes with 401. The authenticated user's self endpoint returns only local ID, email and active status. Engagement routes additionally require local membership and current scoped grants; missing membership or grant returns 403. Directory administrator claims do not grant local partner, reviewer or finance authority. Use a bounded nonproduction identity fixture for acceptance. The full live SPA-to-API assignment journey remains pending; no self-service provisioning screen is claimed.

## Private credentials

The current Graph adapter uses OAuth client credentials with a client secret. Certificate/managed-identity support must be implemented and verified before selecting it for this application; their availability in Graph PowerShell does not mean the runtime adapter supports them.

For local acceptance, `.env.m365.acceptance` is ignored by Git and restricted to the current Windows user. Verify without displaying its contents:

```powershell
git check-ignore .env.m365.acceptance
Get-Acl -LiteralPath .env.m365.acceptance | Select-Object Owner,AreAccessRulesProtected,AccessToString
```

The existing short-lived credential expires on **2026-10-08 at 22:16:16 UTC**. Rotate through the storage app only; update the private file directly and retain the value outside terminal output/history. Record the new expiry and verification date in [the inventory](current-tenant.md). Use a deployment secret manager for an eventual production environment. No production deployment is currently requested.

## Acceptance-only variables

The live harness uses distinct folder variables so a normal application environment cannot accidentally select its repositories:

```dotenv
M365_ACCEPTANCE_NONPRODUCTION=1
M365_TENANT_ID=<tenant UUID>
M365_CLIENT_ID=<storage client UUID>
M365_CLIENT_SECRET=<private value; never commit>
M365_ACCEPTANCE_SHAREPOINT_DRIVE_ID=<verified test drive>
M365_ACCEPTANCE_SHAREPOINT_FOLDER_ID=<verified test folder>
M365_ACCEPTANCE_ONEDRIVE_DRIVE_ID=<verified test drive>
M365_ACCEPTANCE_ONEDRIVE_FOLDER_ID=<verified test folder>
```

Supply the path using `M365_ACCEPTANCE_ENV_FILE`. The harness uses dotenv without overriding pre-existing process variables; run from a clean shell or remove conflicting M365 variables before selecting a tenant. Keep secrets and preauthenticated download URLs out of evidence and public build assets.
