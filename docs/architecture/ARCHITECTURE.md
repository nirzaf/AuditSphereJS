# Architecture

Authoritative contract: [guide 04](../guides/04-architecture-contract.md). Module ownership and facades: `packages/server/src/modules/*/README.md`.

- Processes: Nest 12 + Fastify 5 API, Angular 22 SPA (staff workspace and isolated client portal), Nest application-context BullMQ worker.
- PostgreSQL 18 (Prisma 7) holds all business truth: scope, lifecycle, documents' metadata and versions, TB data, audit chain, outbox and deadlines.
- Evidence and generated documents: SharePoint (durable) and OneDrive (working files) through Microsoft Graph behind `platform/storage.ts`. RustFS is the S3-compatible fixture for local development and CI only.
- Redis 8 (AOF, noeviction): queues and advisory leases; never authoritative.
- Identity: Entra ID for staff (MSAL), separate portal principals with single-use credentials and forced first reset.
