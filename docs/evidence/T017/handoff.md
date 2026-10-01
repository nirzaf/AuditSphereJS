# Compatibility and foundation handoff

Scope: continuation of the supplied task pack. Requirements remained unchanged. Microsoft Entra ID/Graph and SharePoint/OneDrive supersede earlier production storage choices. STE color tokens are exact; the supplied AVIF logo is copied without cropping or recoloring.

Commands/evidence: `pnpm verify:all` with RUN_LIVE_E2E=1 (local-verification.txt); fresh PostgreSQL Testcontainers migration (empty-database-test.txt); `pnpm build:linux` (linux-build.txt); `pnpm smoke:linux` (linux-smoke.json); registry engine/peer/license metadata and before/after advisories under ../T005; targeted database role and outbox reconstruction checks; existing large-import/lease integration tests.

Migrations: 202610010003_entra_identity and 202610010004_durable_import_outbox are additive and applied locally. Earlier migrations/data remain intact. Role provisioning is restricted to the named local database, and generated runtime credentials are only in ignored .env. Production TLS and least-privilege provisioning still require deployment verification.

Task review: executable foundation and technical slice evidence is not business acceptance. T017 remains in review until the source/lockfile/evidence freeze is recorded. T006 production region/retention/signing details, real Microsoft tenant acceptance, and the full professional-methodology/recovery gates remain outstanding. No hosted CI, production migration, external mail, signing, deployment, push or merge was performed.
