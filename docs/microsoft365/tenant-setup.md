# Configure a Microsoft 365 tenant

Last reviewed: 2026-10-02. Use a nonproduction tenant or isolated test repositories for acceptance. Reuse the [existing registrations](current-tenant.md) when working in easyguide; do not recreate them blindly.

## Administrator access

Use an authorized tenant administrator for app registration/consent and a site administrator for repository setup. Staff sign-in later uses ordinary assigned staff identities. Complete password, MFA and device authentication interactively.

PowerShell 7 with `Microsoft.Graph.Authentication` 2.40.0 was used for the verified setup. Install the module from PSGallery if absent:

```powershell
Install-Module Microsoft.Graph.Authentication -RequiredVersion 2.40.0 -Scope CurrentUser -Repository PSGallery
Import-Module Microsoft.Graph.Authentication
$tenantId = '<tenant UUID>'
Connect-MgGraph -TenantId $tenantId -Scopes 'Application.ReadWrite.All','DelegatedPermissionGrant.ReadWrite.All','AppRoleAssignment.ReadWrite.All','Sites.FullControl.All' -UseDeviceCode -ContextScope Process -NoWelcome
$context = Get-MgContext
if ($context.TenantId -ne $tenantId) { throw 'Wrong tenant' }
$context | Select-Object Account,TenantId,ContextScope,Scopes
```

These are administrative setup permissions, not permissions for the runtime app. Request only those needed for the operation. `ContextScope Process` limits the authentication context to this PowerShell process; existing consent on the Graph PowerShell application can still make other previously granted scopes visible. Use a dedicated administrative client if isolation of its consent is needed. End administration with `Disconnect-MgGraph`. See [Microsoft's authentication guidance](https://learn.microsoft.com/en-us/powershell/microsoftgraph/authentication-commands?view=graph-powershell-1.0).

## Register the API and browser apps

In Entra **App registrations**, configure three single-tenant apps with separate identities:

| App | Configuration | Permission |
| --- | --- | --- |
| AuditSphereJS Acceptance API | Application ID URI `api://<API client ID>`; requested access token version `2`; enabled admin-consent-only delegated scope `access_as_user` | Exposes our own API scope; no Graph storage permission |
| AuditSphereJS Acceptance Web | SPA platform; redirect `http://localhost:4200` for local acceptance; no client secret | Delegated `access_as_user` on our API, with tenant admin consent |
| AuditSphereJS Acceptance Storage | Server/service app; no browser redirect | Graph application `Files.SelectedOperations.Selected` |

Do not mix application object IDs, application/client IDs and service-principal IDs. Application updates address the application object; API audience and OAuth client configuration use client IDs. Consent connects service principals.

Configure SPA authorization code flow with PKCE through MSAL. This app uses full-page redirect login/logout and processes the response with `handleRedirectPromise()` on return; it does not use popup flows. Register the exact redirect used by the browser, and use HTTPS for the eventual production origin. The tested local registration uses `localhost`, not `127.0.0.1`. See [Microsoft's SPA configuration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-configuration).

Verify the API rather than assuming its manifest defaults:

```powershell
$apiObjectId = '<API application object ID>'
$api = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/applications/$apiObjectId"
$api.api | ConvertTo-Json -Depth 6
```

Its `requestedAccessTokenVersion` must be `2`; preserve existing scopes when updating it. Consent the SPA's own API scope independently of storage consent. A Graph access token or an ID token is not the API access token expected by this backend.

## Create repositories

Create a dedicated SharePoint team site without a Microsoft 365 group if a group is unnecessary. Set its owner, language and timezone; keep external sharing Off for acceptance. Enable/check document-library versioning. Create an isolated folder in its Documents library and an isolated working folder in a designated licensed user's OneDrive for Business. The current acceptance folders are named `AuditSphereJS-Acceptance`.

Resolve actual IDs; do not guess them:

```powershell
$site = Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/sites/<tenant>.sharepoint.com:/sites/<site-name>'
$drives = Invoke-MgGraphRequest -Method GET -Uri ('https://graph.microsoft.com/v1.0/sites/' + $site.id + '/drives')
$drives.value | Select-Object id,name,webUrl
$oneDriveOwnerId = '<intended user object ID>'
$oneDrive = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/users/$oneDriveOwnerId/drive"
$oneDrive | Select-Object id,driveType,webUrl
```

Select the intended library explicitly. For a genuinely new folder, POST to `/drives/{drive-id}/root/children` with this body; `fail` avoids overwriting an existing name:

```json
{"name":"AuditSphereJS-Acceptance","folder":{},"@microsoft.graph.conflictBehavior":"fail"}
```

## Consent and grant selected-folder access

Storage access requires both the Graph application-role consent and an explicit resource grant. Discover the Graph service principal (`appId` `00000003-0000-0000-c000-000000000000`) and its enabled application role named `Files.SelectedOperations.Selected`. Add that role to the storage registration's requested resource access, then consent it. The role assignment operation is:

```powershell
$storagePrincipalId = '<storage service-principal object ID>'
$graphPrincipalId = '<Microsoft Graph service-principal object ID>'
$selectedRoleId = '<discovered Files.SelectedOperations.Selected role ID>'
$body = @{principalId=$storagePrincipalId;resourceId=$graphPrincipalId;appRoleId=$selectedRoleId} | ConvertTo-Json
Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$storagePrincipalId/appRoleAssignments" -Body $body -ContentType 'application/json'
```

Inspect existing assignments first to avoid duplicate grants. See [Microsoft's app-role consent API](https://learn.microsoft.com/en-us/graph/api/serviceprincipal-post-approleassignments?view=graph-rest-1.0).

Grant `write` separately on each selected folder, using the storage **client ID** in the resource permission:

```powershell
$storageClientId = '<storage application/client ID>'
$driveId = '<verified drive ID>'
$folderId = '<verified folder item ID>'
$body = @{grantedToV2=@{application=@{id=$storageClientId}};roles=@('write')} | ConvertTo-Json -Depth 5
Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/drives/$driveId/items/$folderId/permissions" -Body $body -ContentType 'application/json'
```

Repeat only for the intended SharePoint and OneDrive folders. Folder grants break permission inheritance at that resource; review the resulting boundary. Do not give the runtime app tenant-wide `Files.ReadWrite.All`, `Sites.ReadWrite.All` or administrative scopes. References: [selected permissions](https://learn.microsoft.com/en-us/graph/permissions-selected-overview), [folder grant request](https://learn.microsoft.com/en-us/graph/api/driveitem-post-permissions?view=graph-rest-1.0).

For live T036 acceptance, use the existing nonproduction SharePoint site and create a second, sibling folder in its Documents library named `AuditSphereJS-Template-Assets-Acceptance`; do not place it inside the client acceptance folder. Use the same folder-level selected-permission request above with role `write` and the existing storage client ID. Verify the returned permission targets that exact application and folder before updating the private acceptance environment with `M365_ACCEPTANCE_TEMPLATE_ASSETS_DRIVE_ID` and `M365_ACCEPTANCE_TEMPLATE_ASSETS_FOLDER_ID`. The live check is opt-in and uses only a generated one-pixel PNG, verifies the exact version and folder boundary, then recycles only its own item:

```powershell
$env:M365_ACCEPTANCE_ENV_FILE = '.env.m365.acceptance'
pnpm test:m365:template-assets:live
```

The test writes redacted evidence under the ignored `test-results/m365-live/` directory. Do not commit the private environment file or provider tokens. Record only the drive/folder IDs and permission scope in [the current tenant inventory](current-tenant.md), plus the dated test evidence; no signature artwork or client content belongs in this acceptance folder.

Re-read app-role assignments and folder permissions, then proceed to [private application configuration](application-configuration.md) and [verification](verification-and-troubleshooting.md). App creation, consent and admin login alone are not application acceptance.
