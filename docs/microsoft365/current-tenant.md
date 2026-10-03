# Current acceptance tenant inventory

Last verified: 2026-10-03 through Entra administration, SharePoint administration and authenticated Microsoft Graph PowerShell. This is a dated nonproduction inventory, not a claim that future tenant state is unchanged. Identifiers below are configuration metadata, not credentials.

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

Live storage revalidated again on 2026-10-02 at commit `b409b2a6bd3de5e1956ba192c5acb4ede4d117ac` using `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm verify:task -- T156`: SharePoint and OneDrive both passed version roundtrip, accepted-version preservation after a synthetic external edit, and selected-folder boundary denial (2/2, zero failures or skips). See [the current per-run evidence](../evidence/T156/live-storage-2026-10-02-b409b2a.json). The private acceptance file remains Git-ignored and ACL-restricted. No tenant settings or permissions changed. T156 remains incomplete; mapped staff sign-in, token expiry, consent revocation/recovery, throttling, deleted-item behavior and broader workflow acceptance remain pending.

Live storage revalidated on 2026-10-03 local time at commit `829dfef871315a48cdb29fa0610103bcbc9ad1a6` with the same acceptance command: both SharePoint and OneDrive passed exact-version roundtrip, external-edit isolation, selected-folder 403 denial and deleted-item fail-closed behavior (2 passed, 0 failed, 0 skipped). The test deleted only its own synthetic fixtures. See [the dated run evidence](../evidence/T156/live-storage-2026-10-03-829dfef.json). No tenant settings, permissions or credentials changed. This storage subset does not close T156's identity, expiry, revocation, throttling or unknown-outcome checks.

Interactive SPA check on 2026-10-02: the registered `http://localhost:4200` redirect completed successfully with the redirect-based MSAL client. The application then returned 401 from `/api/v1/me` because the tenant object is not mapped to an active local user. No tenant configuration or permission was changed; this check does not close mapped-user, engagement-grant or workflow acceptance.

Application identity-gate UI and authorization filter verified 2026-10-03: the SPA now waits for an active local identity, requests `GET /api/v1/me/engagements`, and exposes only PostgreSQL memberships with a current `ENGAGEMENT_READ` grant. Engagement workspace screens remain hidden until the user explicitly selects one of those results; Practice additionally checks its firm-wide capability. The built-in-browser check remained signed out; no live interactive sign-in was performed. This implementation does not change Entra registrations, delegated permissions, Graph grants or tenant data. The current acceptance administrator remains unmapped, so live mapped-user and Practice acceptance remain pending; local PostgreSQL/Fastify tests are not tenant acceptance evidence.

Built-in-browser follow-up on 2026-10-03: all 37 module views (6 Commercial, 6 Governance, 9 Fieldwork, 10 Reporting, 6 Practice) rendered their expected route labels while keeping engagement data and mutation controls hidden. The sign-in control returned to the Fieldwork gate with the same local identity-mapping error; no separate Microsoft page or authenticated workflow was observed. A read-only local database check found zero users, mappings, memberships or grants. No tenant configuration, permission, credential, identity mapping or business data changed. Live mapped-user acceptance remains pending.

Identity-mapping operator procedure reviewed 2026-10-02: the application now includes a dry-run-first CLI that binds only an explicitly selected existing active local user to the configured tenant and immutable Entra object ID. No live mapping was executed during this verification; the current tenant administrator remains unmapped, and no membership, role grant, tenant permission or engagement data was changed. Mapped-user SPA acceptance remains open until an explicitly authorized nonproduction user and bounded synthetic engagement scope are selected.

Deleted-item behavior rechecked on commit `9f6b9e0daa10a25129475e5e7aad53d881108a76` (2026-10-02) in the designated synthetic folders: the live acceptance harness created and externally edited one unique file in each of SharePoint and OneDrive, confirmed the outside-folder write denial, deleted only that file, then found the accepted version endpoint returned 404 on both providers. The application failed closed without returning bytes. The test artifacts were deleted; earlier retained acceptance fixtures were untouched. This proves selected-folder API behavior only, not retention, legal hold or archive sealing. See [the redacted run evidence](../evidence/T156/live-storage-delete-2026-10-02.json).

Tenant identity classification confirmed 2026-10-03 in the Entra user directory: the Client X account is a client persona and remains unmapped; the distinct Staff Fixture account is enabled and is the designated internal acceptance principal. The client portal continues to use its separate local invitation/password flow, not Entra SSO.

Dedicated staff acceptance setup, 2026-10-03: the local development database now has one `PREPARER` identity mapped to the Staff Fixture's immutable Entra identity, one synthetic firm/client/engagement at `LEAD_INGESTION`, one membership, and exactly one current `ENGAGEMENT_READ` grant scoped to that engagement. The identity was bound through the dry-run-first mapping CLI; local records were created only in the repository's development PostgreSQL database. The SPA's account-selection flow reached the Staff Fixture password step. Password and MFA entry remain user-operated, so successful browser authentication, engagement selection and workflow acceptance are pending. No tenant permissions, app registrations, Graph grants or client records were changed.
