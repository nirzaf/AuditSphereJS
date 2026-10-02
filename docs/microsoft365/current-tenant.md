# Current acceptance tenant inventory

Last verified: 2026-10-02 through Entra/SharePoint administration and authenticated Microsoft Graph PowerShell. This is a dated nonproduction inventory, not a claim that future tenant state is unchanged. Identifiers below are configuration metadata, not credentials.

| Resource | Current value |
| --- | --- |
| Tenant | easyguide |
| Tenant ID | `4de3e6fd-51aa-4ba7-b2c5-82106d2e45f0` |
| API client ID | `f265881a-a7ca-4fd6-8df5-a8888e16c4c9` |
| API application object ID | `e99afba8-fcc3-4933-912d-273638a5adca` |
| API service principal | `0bf3b46e-ce87-47b4-bffd-af4e349fb46e` |
| API URI | `api://f265881a-a7ca-4fd6-8df5-a8888e16c4c9` |
| API scope / token version | `access_as_user`, admin-consent-only, enabled / `2` |
| SPA client ID | `4e9a9c59-b77c-462d-8b3a-9c812cb7d695` |
| SPA application object ID | `5ab7be06-ea82-4cb0-9035-bbea79bab41a` |
| SPA service principal | `7dc2bb43-20bf-47a5-ab3f-524b8917b916` |
| SPA redirect | `http://localhost:4200` |
| SPA consent | Own API delegated `access_as_user`, `AllPrincipals`; no Graph storage grants |
| Storage client ID | `54e66184-bcf5-4c66-a511-7ee29d89fac8` |
| Storage application object ID | `ea064a11-ff43-4c82-97a1-4b27bf7451e3` |
| Storage service principal | `60f00546-625e-41de-bc55-ecca66bb2e7a` |
| Runtime Graph role | Application `Files.SelectedOperations.Selected`, consented |
| SharePoint site | [AuditSphereJS Acceptance](https://easyguide.sharepoint.com/sites/AuditSphereJSAcceptance) |
| Site configuration | Team site without M365 group; external sharing Off; English; Riyadh UTC+3 |
| SharePoint drive | `b!31_jm9WUoUKkmoRz7s_ihiJxCD9t0e9LuuFI8dLjCjy91YkBscTnQIQTioP6BB_U` |
| SharePoint folder | `01IJRKWFWJCTUXPBSS7JAY2QLN3F7IRBFI` |
| OneDrive drive | `b!w-lGUUDsR0Od33rZBKS0orSh4hYVzFlJlQ1pRnCvXJcYjXAsoZHBSqS-UKW_BARX` |
| OneDrive folder | `01EB7DBFXYCUUQQI7HDJAIWKK3LOHCHGS4` |
| Folder name / grants | `AuditSphereJS-Acceptance` in both drives; storage app `write` on each folder |
| Local private configuration | `.env.m365.acceptance` in repository root; Git-ignored; current Windows user only |
| Acceptance credential expiry | `2026-10-08T22:16:16Z` |

Only synthetic fixtures belong in these repositories. The existing unrelated AuditSphere P0/AuditSphereOps registrations and their credentials were not reused or changed. No outbound mail permission, sending action, Microsoft 365 eSignature setup or production deployment is part of this configuration.

## Verified and pending

Verified: correct administrative tenant, API scope/SPA consent, API v2 configuration, storage selected-role consent, both folder grants, exact upload/download bytes, preserved accepted version after same-size external edit, and HTTP 403 on writes outside each folder. Two real-provider tests passed with zero skipped tests; [redacted evidence](../evidence/T156/live-storage-2026-10-02.json) retains hashes and limitations.

Pending: live SPA-to-API sign-in with local assignment, token expiry, grant revocation/recovery, throttling, client-bound application workflow acceptance, retention/records-policy acceptance and the full T156 matrix. These resources do not imply production readiness. Update this section when new evidence is obtained, with date, tested commit and test scope.

Application behavior rechecked 2026-10-02: the API now records an append-only local revocation cutoff when an authenticated user calls `POST /api/v1/me/revoke-sessions`. Entra API requests compare the validated token `iat` to the latest cutoff and reject tokens issued before it; later-issued tokens are accepted. This is local application behavior verified with signed-token and PostgreSQL/Fastify integration tests, not a Microsoft tenant grant or live SPA acceptance. The endpoint revokes all existing API access tokens for that mapped local user and may require a fresh sign-in/token acquisition.

Live storage revalidated 2026-10-02 at commit `d301c78e4185a852aa3d14d9f4c8dd32fd722d57`: SharePoint and OneDrive roundtrip, external-edit version isolation and selected-folder 403 checks passed (2/2, no skips); see [dated acceptance evidence](../evidence/T156/live-storage-2026-10-02-d301c78.json). This does not close pending live identity acceptance, Microsoft Graph grant revocation, throttling or the full T156 checks.

Interactive SPA check on 2026-10-02: the registered `http://localhost:4200` redirect completed successfully with the redirect-based MSAL client. The application then returned 401 from `/api/v1/me` because the tenant object is not mapped to an active local user. No tenant configuration or permission was changed; this check does not close mapped-user, engagement-grant or workflow acceptance.
