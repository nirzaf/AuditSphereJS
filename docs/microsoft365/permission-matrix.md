# Microsoft 365 permission boundary

Reviewed: 2026-10-04. This is the approved nonproduction integration scope for AuditSphereJS, based on the user's Entra ID, Microsoft Graph, SharePoint and OneDrive selections. It does not authorize production tenant changes or blanket administrator consent.

| Surface | Runtime permission | Resource boundary | Status |
| --- | --- | --- | --- |
| Browser SPA | Delegated `api://<AuditSphere API client ID>/access_as_user` only | AuditSphere API; no Graph scopes in browser | Enabled for the acceptance tenant |
| AuditSphere API identity | Validates the API access token, then maps `(tenant ID, Entra object ID)` to an active local user | Local staff mapping, membership and scoped capability grant decide business access | Enabled; Entra directory roles do not create AuditSphere authority |
| Server file storage | Application `Files.SelectedOperations.Selected` | Explicit `write` grants on the two synthetic acceptance folders only; SharePoint for engagement evidence and OneDrive for working files. No `practice-private` folder grant exists yet. | Enabled for those nonproduction folders only; firm-private Practice receipt storage remains unconfigured |
| Graph mail | None currently consented. The planned adapter requires application `Mail.Send` on a separate mail-only app registration and a dedicated sender mailbox | Only recipients captured from active, verified client contact-role records; no directory lookup or inbox read | Implemented behind `NOTIFICATION_PROVIDER=disabled` by default. Live sends remain unavailable until the separate app, least-privilege review and permission consent are completed. A Graph 202 response means accepted by Graph, not delivered to the recipient. |
| Graph directory lookup/sync | None | No tenant-wide user/group read | Disabled; identity mapping is administrator-managed locally |
| Runtime SharePoint site/folder provisioning | None | No site, list, or tenant administration permission | Disabled; setup is an administrator-operated procedure, not an API capability |
| Graph change notifications/webhooks | None | No Graph subscriptions or webhook callbacks; reads remain explicit adapter requests for selected file IDs | Disabled; no change-notification permission or subscription resource is approved |

The storage application registration requests only the selected permission above. Consent alone grants no access to a drive item; administrators separately grant that app `write` on each approved folder. Never add `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `Mail.Send`, `User.Read.All`, or `Directory.Read.All` for convenience. Mail.Send is a separate unresolved tenant permission and must never be added to the file-storage registration. The admin consent is a distinct security-sensitive action; this code change does not authorize it.

When the optional Graph storage adapter is not selected, local nonproduction `STORAGE_PROVIDER=local-s3` uses the RustFS-compatible S3 fixture and does not acquire a Graph token or call Microsoft Graph. Production requires the Graph provider; disabling that requirement is not a supported production configuration. The SPA's API permission and local database authorization remain separate from storage access. Do not add Graph subscription/webhook permissions for convenience.

Acceptance account/app IDs, folder bindings, credential location, verification dates and known limits are tracked in [the current tenant inventory](current-tenant.md). Secret values must never be recorded here. Directory synchronization, tenant provisioning, change notifications, production retention and production service acceptance remain out of scope until their owning tasks approve them.
