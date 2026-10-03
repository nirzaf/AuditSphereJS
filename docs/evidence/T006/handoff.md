# T006 deployment and provider-boundary handoff — 2026-10-03

**Status:** `DONE` for the user-authorized non-production build and public-asset scope. Production readiness remains gated and has not been accepted.

## Explicit selections and current baseline

- User-selected internal identity and integration: Microsoft Entra ID and Microsoft Graph.
- User-selected file repositories: SharePoint for evidence/released files and OneDrive for Business for working files. Production code requires the Graph storage provider; the browser receives no Graph app credential or preauthenticated provider URL.
- RustFS is a local S3-compatible fixture only. Its presence in Compose does not make it a production provider.
- Signature: approved image signature and firm-seal artwork only; no cryptographic PDF signature or certificate provider is claimed.
- User instruction: do not deploy; create public assets only. Therefore no production host, registry, region, managed PostgreSQL or Redis service is selected or provisioned.
- Microsoft Graph is the selected identity/notification integration provider, as requested. Outbound mail remains disabled until its separate tenant permission and recipient policy are accepted under T037; this decision records a provider boundary and does not grant tenant permissions or send mail.
- Local compatibility baseline recorded in `Dockerfile` and `docker-compose.yml`: Node 24 Bookworm Slim build image, PostgreSQL 18.6, Redis 8.10 and a digest-pinned RustFS fixture. These local pins are not production-service acceptance.
- Capacity proof remains the 5k/25k/50k Trial Balance slice. T051's measured resource and latency budgets are not yet available.

## Evidence and remaining acceptance

- [D11](../../decisions/register.json) records the user-selected Entra/Graph/SharePoint/OneDrive boundary. [D08](../../decisions/D08-image-signature.md) records image artwork only.
- The production configuration in `packages/server/src/platform/config.ts` requires Entra and Graph storage and refuses the `local-s3` fixture. `pnpm verify:task -- T006` passed on 2026-10-03 (server build and config tests, 3/3), including a regression assertion that local RustFS/S3 is rejected when `NODE_ENV=production`; this is a code boundary, not evidence of a deployed target.
- [Microsoft 365 tenant evidence](../../microsoft365/current-tenant.md) records non-production SharePoint and OneDrive acceptance checks and their limits. The checks do not establish production region, legal hold, retention, backup or disaster recovery.
- No deployment or tenant mutation was performed for T006. No dependency was added or upgraded in this decision-recording change. `pnpm verify:affected` was run on 2026-10-03; boundaries and builds passed and 82 unit tests passed (exit 0). The T006 task recipe now exists and runs the server build plus production configuration checks; these do not close the outstanding production decisions.
- Scope disposition: production-host, region, backup/recovery, production repository residency/retention, production service-license and measured SLO decisions are not applicable to the authorized no-deployment build. They remain mandatory release gates before any later deployment; no production readiness is claimed. T051 owns measured workload limits.
- Still required before any production deployment decision: named operations/security/records owners; host and data-service topology/region; TLS; backup and restore tests; RPO/RTO; production SharePoint/OneDrive residency and retention/legal-hold evidence; approved outbound notification permission and recipient policy; and measured 5k/25k/50k workload limits.

The user's explicit no-deployment instruction is honored without fabricating production defaults or claiming production readiness. The scope disposition closes the architecture/provider-selection task only; it does not waive or satisfy the release gates listed above.
