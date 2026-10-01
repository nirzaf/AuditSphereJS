# Live Microsoft 365 readiness — 2026-10-02

The user explicitly requires live Microsoft 365 acceptance and authorized inspection through the built-in browser. The signed-in Microsoft 365 admin center and Entra portal were reached successfully. This proves the administrator browser session only; it does not prove the application's authentication or storage flow.

Read-only inspection found an existing **AuditSphere P0** registration with delegated `User.Read`, delegated `Sites.Selected` and application `Sites.Selected` consent. Its overview has no redirect URI and no Application ID URI, so it is not configured for this Angular SPA's API-scoped access token. Its pre-existing credential was not retrieved, rotated or reused. Other AuditSphereOps registrations were not modified. No new app, credential, permission, consent, sharing policy, billing configuration or external message was created.

After read-only inspection, the user confirmed **“Register this acceptance API.”** The single-tenant **AuditSphereJS Acceptance API** registration was created and verified in the portal, with no credential or Graph permission grant. Its Application ID URI was set to its own `api://<application-id>` identifier. This is configuration progress, not application authentication acceptance. Screenshots are retained locally in ignored `test-results/entra-api-created.png` and `test-results/entra-registration-review.png`.

The remaining setup is the API's admin-consented delegated `access_as_user` scope, an **AuditSphereJS Acceptance Web** public SPA registration with `http://127.0.0.1:4200` as its development redirect, and a separate **AuditSphereJS Acceptance Storage** service registration. Storage should use selected-resource permissions and explicit grants only for the designated SharePoint and OneDrive nonproduction repositories. Do not grant tenant-wide Files.ReadWrite.All or Sites.ReadWrite.All to the runtime app. Confirm the exact target repositories and selected permission support before applying a grant. New security-sensitive access requires action-time confirmation under the browser tool's confirmation policy. New credential entry is user-operated.

Repository configuration currently has no live tenant/client credentials or drive bindings. Local app roles are separate from Entra administration. A test staff identity needs a reviewed local identity mapping and scoped grants. Application tests must cover own-repository writes/version downloads, external current-version changes, cross-client denial, token expiry and denied/revoked access. Record actual provider failures and hashes without tokens, credentials or preauthenticated download URLs. Read-only administration is not T156 acceptance.

Signing-provider scope was removed by the user's subsequent image-signature instruction; see [D08](../../decisions/D08-image-signature.md). No Microsoft 365 eSignature transaction is authorized or required.

## Executable storage roundtrip

`pnpm test:m365:storage:live` is an opt-in real-provider roundtrip, excluded from ordinary unit/CI tests. Supply a private file location in `M365_ACCEPTANCE_ENV_FILE`, the existing `M365_TENANT_ID`, `M365_CLIENT_ID` and `M365_CLIENT_SECRET`, and these explicit nonproduction bindings:

```text
M365_ACCEPTANCE_NONPRODUCTION=1
M365_ACCEPTANCE_SHAREPOINT_DRIVE_ID=<designated test drive>
M365_ACCEPTANCE_SHAREPOINT_FOLDER_ID=<designated test folder>
M365_ACCEPTANCE_ONEDRIVE_DRIVE_ID=<designated test drive>
M365_ACCEPTANCE_ONEDRIVE_FOLDER_ID=<designated test folder>
```

It creates one uniquely named synthetic text fixture in each designated folder, retains the files, and checks exact version bytes and SHA-256 with the production Graph adapter. It does not delete files, send messages or modify permissions. Redacted results go to ignored `test-results/m365-live/`; missing opt-in/configuration fails instead of reporting skipped acceptance. A local run without configuration was verified to fail at the nonproduction opt-in assertion before any provider request. `pnpm verify:affected` and lint passed, including the harness's typecheck. The harness has not been run against the tenant. Passing it proves only the two storage roundtrips; the wider T156 failure/revocation and Entra login matrix remains pending.

During readiness review, the adapter was corrected to use Graph's documented version `id` and `size`; `driveItemVersion` has no `eTag`. The upload item's eTag is retained as provenance. The selected version is downloaded and SHA-256 checked before returning a successful upload reference, preventing a same-size external edit from winning the version-lookup race unnoticed. Unit fixtures now match the documented API shape. Source: [driveItemVersion](https://learn.microsoft.com/en-us/graph/api/resources/driveitemversion?view=graph-rest-1.0).
