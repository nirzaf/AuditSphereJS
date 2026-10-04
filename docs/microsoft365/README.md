# Microsoft 365 configuration

Last reviewed: 2026-10-04. These guides describe the current AuditSphereJS implementation and its nonproduction tenant setup.

- [Tenant and app setup](tenant-setup.md): administrator sign-in, Entra registrations, consent and selected-folder grants.
- [Application configuration](application-configuration.md): environment variables, credentials and local user/repository assignments.
- [Verification and troubleshooting](verification-and-troubleshooting.md): live tests, credential rotation and known failure cases.
- [Current tenant inventory](current-tenant.md): existing acceptance resources and verified/pending results.
- [Permission boundary](permission-matrix.md): approved delegated/application permissions, resource scope and disabled optional capabilities.

Microsoft Entra authenticates staff; PostgreSQL controls business access. The browser SPA calls our API. A separate server application accesses SharePoint evidence and OneDrive working files through Graph. The SPA has no storage credential. RustFS is a local test fixture. Report signing uses image artwork and version-bound approval under [D08](../decisions/D08-image-signature.md); Microsoft 365 eSignature is excluded.

## Keeping these guides current

When changing Entra registration, consent, redirect, token validation, Graph permission, repository provisioning, credential handling, environment keys or live test behavior, update the affected guide in the same change. Update the inventory's verification date only after checking its resources; record the check and any pending acceptance in [T156 evidence](../evidence/T156/tenant-readiness.md). Record credential expiry and configuration location, never values.

Separate instructions for a new tenant from observations of the current tenant. Preserve previous test evidence and add new results; configuration progress does not close acceptance tasks. Check links and examples against the implementation and official Microsoft documentation. This is a change-driven maintenance rule, not a scheduled tenant-monitoring job.
