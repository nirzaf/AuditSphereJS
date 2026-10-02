# T018 scope model handoff — 2026-10-02

**Status:** IN_PROGRESS. This slice closes implicit-scope gaps in membership, trial-balance jobs, repository bindings and authorization grants. It does not claim full T018 acceptance.

## Change

- Added `firmId` and `clientId` to each Membership. Migration `202610020005_scoped_memberships` backfills those values from the owning Engagement, makes them required, and replaces the single-column engagement FK with a composite `(firmId, clientId, engagementId)` FK.
- Added a composite `(firmId, clientId)` foreign key for `ClientRepository` in migration `202610020007_repository_scope`; PostgreSQL now prevents a repository mapping from combining a client's UUID with another firm's ID.
- Added firm, composite firm/client and composite firm/client/engagement foreign keys to `RoleGrant` in migration `202610020008_role_grant_scope_fks`. The scope check still permits firm-level, client-level or engagement-level grants, while PostgreSQL prevents a real client or engagement from being paired with another owner's tuple.
- Trial-balance upload outbox records now preserve the engagement ownership tuple. Migration `202610020006_scoped_tb_import_events` upgrades outstanding legacy events. Queue validation rejects payloads containing only an import UUID, and worker reads, claims, document reads, completion and failure updates filter on the explicit scope tuple.
- The database integration fixture proves a firm-B/client-B membership cannot attach to a firm-A engagement. Existing staged-import cross-firm denial remains covered. The Fastify lifecycle route returns 403 for foreign reads and commands, and verifies a denied command leaves foreign state and transition history unchanged. The worker payload test accepts a complete scope and rejects an unscoped legacy payload.
- The per-client repository integration fixture proves a mismatched firm/client pair is rejected by PostgreSQL.
- The authorization integration fixture proves mismatched firm/client and firm/client/engagement grants are rejected by PostgreSQL while valid grants at all three scope levels continue to authorize as expected.

## Verification

- `pnpm verify:task -- T018` — passed on 2026-10-02, including the rerun after adding the foreign lifecycle-command denial; generated Prisma client/build, 2 scoped-job tests, PostgreSQL membership/import constraints, per-client repository constraints, authorization grant scope constraints, and Fastify read/write authorization-boundary assertions.
- `pnpm verify:affected` — passed on 2026-10-02; module boundaries, Prisma/server and Angular production builds, TypeScript checks, and 69 unit tests.
- `pnpm lint` — passed on 2026-10-02.
- `git diff --check` — passed on 2026-10-02.

## Remaining acceptance

- The protected lifecycle read and command boundaries are tested; the command denial leaves foreign state and transition history unchanged. Membership attachment is covered by the PostgreSQL composite-FK negative fixture; no separate membership-management HTTP workflow currently exists to test.
- The broader tenant-root review is recorded in [the 2026-10-02 ownership review](tenant-root-review-2026-10-02.md). It found additional gaps in module-owned cross-links; the required follow-up migrations and negative database fixtures must be completed by the respective table owners before T018 can be accepted.
- The existing scope-bootstrap migration documents that synthetic bootstrap scope is development-only; there is no production database or reviewed identity map in this environment. The production identity mapping procedure remains open.
- No deployment or live Microsoft acceptance was performed by this change.
