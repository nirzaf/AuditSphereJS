# Live Microsoft 365 readiness — 2026-10-02

The user explicitly requires live Microsoft 365 acceptance and authorized inspection through the built-in browser. The signed-in Microsoft 365 admin center and Entra portal were reached successfully. This proves the administrator browser session only; it does not prove the application's authentication or storage flow.

Initial read-only inspection found an existing **AuditSphere P0** registration with delegated `User.Read`, delegated `Sites.Selected` and application `Sites.Selected` consent. Its overview has no redirect URI and no Application ID URI, so it is not configured for this Angular SPA's API-scoped access token. Its pre-existing credential was not retrieved, rotated or reused. Other AuditSphereOps registrations were not modified.

After read-only inspection, the user confirmed **“Register this acceptance API.”** The single-tenant **AuditSphereJS Acceptance API** registration was created and verified in the portal, with no credential or Graph permission grant. Its Application ID URI was set to its own `api://<application-id>` identifier. This is configuration progress, not application authentication acceptance. Screenshots are retained locally in ignored `test-results/entra-api-created.png` and `test-results/entra-registration-review.png`.

The user subsequently approved the API scope and SPA setup, then explicitly approved API-only admin consent. Graph PowerShell verified an `AllPrincipals` grant from **AuditSphereJS Acceptance Web** to **AuditSphereJS Acceptance API**, for `access_as_user` only. The public SPA redirect is `http://localhost:4200`: the portal rejected HTTP on the numeric loopback hostname. The API's `requestedAccessTokenVersion` was changed to `2` and re-read successfully, preserving its enabled scope. This matches the backend's v2 issuer validation; it does not establish a successful application login.

At the user's request, administration switched to **Microsoft.Graph.Authentication PowerShell 2.40.0**, using `Invoke-MgGraphRequest` and device authentication with `ContextScope Process`. The signed-in account and tenant were verified before mutations. Session tokens were not extracted from the browser or written to the repository. The administrative session's scopes are distinct from the runtime application's selected permissions.

The user authorized creation of a SharePoint site if needed. A dedicated nonproduction **AuditSphereJS Acceptance** team site without a Microsoft 365 group was created at `https://easyguide.sharepoint.com/sites/AuditSphereJSAcceptance`, with external sharing Off. Graph resolved its Documents drive. A new `AuditSphereJS-Acceptance` folder was created there and in the verified administrator's business OneDrive. A separate single-tenant **AuditSphereJS Acceptance Storage** app was created requesting only application `Files.SelectedOperations.Selected`; explicit `write` application grants were created and their returned identities verified on those two folders. No tenant-wide runtime Files.ReadWrite.All or Sites.ReadWrite.All permission was requested. Folder-level grants are supported by [Microsoft's selected-permission API](https://learn.microsoft.com/en-us/graph/api/driveitem-post-permissions?view=graph-rest-1.0).

After the user completed the second device sign-in, PowerShell consented and re-read the storage app's sole Graph application role, `Files.SelectedOperations.Selected`. A seven-day acceptance credential was generated and written directly to ignored `.env.m365.acceptance`, with inheritance disabled and FullControl restricted to the current Windows user. No secret value was printed or committed. It expires at `2026-10-08T22:16:16Z`; this is a nonproduction acceptance credential. Screenshots of the created site and SPA remain in ignored `test-results/`.

The private storage acceptance configuration contains live service credentials and the two test drive bindings. This does not configure the separately running application's Entra login or provision production client repository records. Local app roles are separate from Entra administration. A test staff identity needs a reviewed local identity mapping and scoped grants. Application tests must cover own-repository writes/version downloads, external current-version changes, cross-client denial, token expiry and denied/revoked access. Record actual provider failures and hashes without tokens, credentials or preauthenticated download URLs. Read-only administration is not T156 acceptance. See the maintained [configuration guides](../../microsoft365/README.md).

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

It creates one uniquely named synthetic text fixture in each designated folder, retains the files, and checks exact version bytes and SHA-256 with the production Graph adapter. It then changes only that fixture's current bytes through a separate Graph request, verifies the previously accepted version remains readable, and asserts that a synthetic write at the drive root is denied with HTTP 403. It does not delete files, send messages or modify permissions. Redacted results go to ignored `test-results/m365-live/`; missing opt-in/configuration fails instead of reporting skipped acceptance.

The real tenant run passed **2 tests, 0 failures, 0 skipped** on 2026-10-02. Both repositories passed initial exact-version roundtrip, same-size external-current-edit isolation and outside-folder write denial. The initial live run failed both downloads with HTTP 400 and exposed the current-version API restriction described below; the adapter was corrected before the passing runs. This is partial T156 evidence. Entra SPA sign-in, token expiry, consent revocation, throttling, full business authorization and the wider failure matrix remain pending.

During readiness review, the adapter was corrected to use Graph's documented version `id` and `size`; `driveItemVersion` has no `eTag`. The upload item's eTag is retained as provenance. The selected version is downloaded and SHA-256 checked before returning a successful upload reference, preventing a same-size external edit from winning the version-lookup race unnoticed. Unit fixtures now match the documented API shape. Source: [driveItemVersion](https://learn.microsoft.com/en-us/graph/api/resources/driveitemversion?view=graph-rest-1.0).

Live verification also exposed that `/versions/{id}/content` cannot download the current version. On HTTP 400, the adapter uses current-item content only after verifying that the newest version is the referenced version and the current id/eTag/size match the stored reference. It re-checks the current item after download and always checks byte count and SHA-256. Historical references never fall back to current content when the current version differs. Unit tests cover changed eTag, historical fallback refusal and an edit during download. Source: [download a driveItemVersion](https://learn.microsoft.com/en-us/graph/api/driveitemversion-get-contents?view=graph-rest-1.0).

## Live storage revalidation — 2026-10-02

At commit `d301c78e4185a852aa3d14d9f4c8dd32fd722d57`, `pnpm verify:task -- T156` passed **2 tests, 0 failures, 0 skipped** against the configured synthetic SharePoint and OneDrive folders. Both results confirm exact byte/hash roundtrip, accepted-version preservation after a synthetic same-size external edit, and HTTP 403 when attempting a write outside the selected folder. Redacted per-run hashes and timestamps are in [the dated evidence record](live-storage-2026-10-02-d301c78.json). The harness retains its synthetic files. Entra SPA sign-in, token expiry, consent revocation, throttling, Graph notifications and full T156 acceptance remain pending.

The exact task command now wraps the enabled storage acceptance subset: with `M365_ACCEPTANCE_ENV_FILE` pointing to the ignored private configuration, run `pnpm verify:task -- T156`. The 2026-10-02 evidence above comes from that verifier invocation.
