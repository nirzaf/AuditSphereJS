# T018 scope model handoff — 2026-10-02

**Status:** IN_PROGRESS. This slice closes the implicit-scope gaps in internal membership and trial-balance background jobs. It does not claim full T018 acceptance.

## Change

- Added `firmId` and `clientId` to each Membership. Migration `202610020005_scoped_memberships` backfills those values from the owning Engagement, makes them required, and replaces the single-column engagement FK with a composite `(firmId, clientId, engagementId)` FK.
- Added a composite `(firmId, clientId)` foreign key for `ClientRepository` in migration `202610020007_repository_scope`; PostgreSQL now prevents a repository mapping from combining a client's UUID with another firm's ID.
- Trial-balance upload outbox records now preserve the engagement ownership tuple. Migration `202610020006_scoped_tb_import_events` upgrades outstanding legacy events. Queue validation rejects payloads containing only an import UUID, and worker reads, claims, document reads, completion and failure updates filter on the explicit scope tuple.
- The database integration fixture proves a firm-B/client-B membership cannot attach to a firm-A engagement. Existing staged-import cross-firm denial remains covered. The Fastify lifecycle route returns 403 for a valid foreign engagement UUID, and the worker payload test accepts a complete scope and rejects an unscoped legacy payload.
- The per-client repository integration fixture proves a mismatched firm/client pair is rejected by PostgreSQL.

## Verification

- `pnpm verify:task -- T018` — passed; generated Prisma client/build, 2 scoped-job tests, PostgreSQL membership/import constraints, per-client repository constraints, and a Fastify authorization-boundary integration test.
- `pnpm verify:affected` — passed; import boundaries, server and Angular production builds, TypeScript checks, and 69 unit tests.
- `git diff --check` — passed.

## Remaining acceptance

- The protected lifecycle read boundary is tested; add an equivalent mutation/attachment endpoint assertion as those application workflows become available.
- Review broader tenant-owned root coverage and the production identity mapping procedure. The existing scope-bootstrap migration documents that synthetic bootstrap scope is development-only; there is no production database or reviewed identity map in this environment.
- No deployment or live Microsoft acceptance was performed by this change.
