# Microsoft 365 storage selection

The user selected Microsoft Entra ID for internal identity, Microsoft Graph for integrations, and SharePoint plus OneDrive for file storage on 2026-10-01. This supersedes the earlier RustFS production choice.

SharePoint document libraries own durable engagement evidence. OneDrive for Business is available for working files through the same drive adapter. PostgreSQL remains authoritative for business state and authorization. Graph drive IDs, item IDs, eTags and SHA-256 digests are persisted in opaque server-only document references. Downloads reject external changes or hash mismatches; Graph tokens are never forwarded to preauthenticated download URLs. This detects tampering but does not establish regulatory retention or an immutable Microsoft 365 records policy.

Set STORAGE_PROVIDER=graph and the M365/SHAREPOINT/ONEDRIVE variables in .env.example using a server app registration and explicitly provisioned drive/folder access. Store its secret in the deployment secret manager. Configure library versioning, retention and permission boundaries in the tenant and verify them before production acceptance. The current bounded CSV transport is below Graph's 250 MB single-upload ceiling; general large-file ingestion needs upload sessions before acceptance.

RustFS remains a local development test fixture for existing technical tests. Production rejects this adapter. On 2026-10-02, the acceptance tenant's storage app was configured with application `Files.SelectedOperations.Selected` and explicit write grants on two isolated folders. Live SharePoint/OneDrive roundtrips, accepted-version preservation after external edits and outside-folder write denial passed. Entra application sign-in and wider tenant acceptance remain pending. No outbound mail was sent. See [tenant setup and maintenance](../microsoft365/README.md) and [T156 evidence](../evidence/T156/tenant-readiness.md).

Implementation references: [upload content](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0), [download content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0).
