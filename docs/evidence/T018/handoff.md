# T018 scope model handoff — 2026-10-02

**Status:** IN_PROGRESS. This slice closes implicit-scope gaps in membership, trial-balance jobs, repository bindings and authorization grants. It does not claim full T018 acceptance.

## Change

- Added `firmId` and `clientId` to each Membership. Migration `202610020005_scoped_memberships` backfills those values from the owning Engagement, makes them required, and replaces the single-column engagement FK with a composite `(firmId, clientId, engagementId)` FK.
- Added a composite `(firmId, clientId)` foreign key for `ClientRepository` in migration `202610020007_repository_scope`; PostgreSQL now prevents a repository mapping from combining a client's UUID with another firm's ID.
- Added firm, composite firm/client and composite firm/client/engagement foreign keys to `RoleGrant` in migration `202610020008_role_grant_scope_fks`. The scope check still permits firm-level, client-level or engagement-level grants, while PostgreSQL prevents a real client or engagement from being paired with another owner's tuple.
- Migration `202610020019_scoped_outbox_rows` makes firm, client and engagement required OutboxEvent columns, backfills `tb.import` scope from its owning TbImport, binds every event to Engagement, and binds `tb.import` to its exact import. Redis jobs carry only the durable outbox UUID; the worker reloads the authoritative tuple from PostgreSQL and scopes reads, claims, document reads, completion and failure updates from that row. The migration fails closed when a legacy event cannot be mapped to an owner.
- The database integration fixture proves a firm-B/client-B membership cannot attach to a firm-A engagement. Existing staged-import cross-firm denial remains covered. The Fastify lifecycle route returns 403 for foreign reads and commands, and verifies a denied command leaves foreign state and transition history unchanged. Import-job contract tests validate the scope tuple loaded from PostgreSQL, and queue-envelope tests accept only a UUID rather than caller-supplied scope. The upload-race PostgreSQL test verifies outbox scope columns and rejects a `tb.import` row whose engagement differs from its import.
- The per-client repository integration fixture proves a mismatched firm/client pair is rejected by PostgreSQL.
- The authorization integration fixture proves mismatched firm/client and firm/client/engagement grants are rejected by PostgreSQL while valid grants at all three scope levels continue to authorize as expected.
- Governance migration `202610020011_risk_assignment_scope` adds a composite foreign key from each risk-owner assignment's `(assessmentId, riskId)` to the corresponding pair on `RiskBandAssessment`. A real PostgreSQL integration case rejects an assignment that pairs risk A with a valid assessment belonging to risk B. This migration is Governance-owned and does not modify platform or Fieldwork tables.
- Fieldwork migration `202610020012_fieldwork_scope_keys` adds real Firm ownership to TaxonomyVersion and composite keys for publications/taxonomies. Governance migration `202610020013_materiality_lineage_scope` then binds `MaterialityAssessment` to the exact `(firmId, clientId, engagementId, publicationId)` tuple and same-firm `(firmId, taxonomyVersionId)` tuple. The materiality PostgreSQL integration test rejects a valid publication from a different engagement and a valid taxonomy from a different firm.
- Fieldwork migration `202610020014_fieldwork_mapping_lineage_scope` adds the composite import key, binds each MappingApproval to its exact firm/client/engagement import and same-firm taxonomy, binds each publication to its exact-scope import, and binds a referenced approval to the same engagement. The taxonomy PostgreSQL integration test rejects a valid import from another engagement and a valid taxonomy from another firm; the publication integration test rejects a foreign-scope import and a valid approval from another engagement.
- Practice migration `202610020015_practice_reversal_scope` replaces the ID-only reversal foreign key with `(firmId,reversalOf) → (firmId,id)`. The PostgreSQL practice-ledger integration test confirms a draft cannot reference a valid journal from another firm; existing constraints already bind journal periods and line accounts to the same firm.
- Fieldwork migration `202610020016_fieldwork_document_scope` adds a real Engagement FK and composite key to Document, binds each TbImport to a document in its same engagement, and binds an optional StoredObject document reference to the same engagement. The repository PostgreSQL integration test rejects orphan documents and mismatched import/object document references.
- Fieldwork migration `202610020017_fieldwork_mapping_memory_scope` binds mapping memory to a real firm/client and its source approval to that exact client. The taxonomy PostgreSQL integration test rejects a foreign client tuple and a valid source approval belonging to another firm/client.
- Platform migration `202610020018_platform_audit_scope` binds AuditEvent and AuditChainHead to Engagement, binds each AuditChainRecord to the same engagement as its immutable event, and binds CommandReceipt to its engagement. PostgreSQL tests reject orphan audit events/heads, cross-engagement chain records and orphan receipts.

## Verification

- Hosted run [37028621620](https://github.com/nirzaf/AuditSphereJS/actions/runs/37028621620) failed in `tests/materiality-persistence.integration.ts` after the document-scope migration exposed a stale fixture that reused another engagement's document. The fixture now creates a document for its second engagement; the complete local integration suite passes with two concurrent test files.

- `pnpm verify:task -- T018` — passed on 2026-10-02, including the rerun after the Fieldwork document/mapping-memory migrations; generated Prisma client/build, scoped-job tests, PostgreSQL membership/import constraints, per-client repository constraints, authorization grant scope constraints, and Fastify read/write authorization-boundary assertions.
- `pnpm verify:affected` — passed after the platform audit/receipt constraints on 2026-10-02; module boundaries, Prisma/server and Angular production builds, TypeScript checks, and 70 unit tests.
- `pnpm verify:affected` — passed after scoped outbox migration 019 on 2026-10-02; module boundaries, Prisma/server and Angular production builds, TypeScript checks, and 71 unit tests.
- `pnpm lint` — passed after the platform audit/receipt migration on 2026-10-02.
- Full PostgreSQL integration suite — passed all 17 tests across 16 files with `--test-concurrency=1` after starting the repository's PostgreSQL, Redis and RustFS compose services with `pnpm infra:up`. An initial run before local infrastructure was started had Docker 502 and connection-refused failures; the clean serialized rerun passed.
- `git diff --check` — passed on 2026-10-02.
- `pnpm exec prisma validate`, `pnpm exec prisma generate`, and `pnpm build:server` — passed after migration `202610020019_scoped_outbox_rows`.
- `pnpm exec node --import tsx --test tests/upload-race.integration.ts` — passed on PostgreSQL 18.6/Testcontainers; confirms persisted outbox scope, cross-engagement FK rejection, and valid uploads under separate engagements.
- `pnpm lint` and `pnpm migration:parity` — passed on 2026-10-02; parity inventory contains 38 rows (15 partial, 23 not started).
- `pnpm exec prisma validate` and `pnpm exec prisma generate` — passed after Fieldwork, Practice and platform audit/receipt lineage changes.
- `node --import tsx --test tests/risk.integration.ts` — passed on PostgreSQL 18.6/Testcontainers, including the new cross-risk assessment assignment denial.
- `node --import tsx --test tests/materiality-persistence.integration.ts` — passed on PostgreSQL 18.6/Testcontainers, including Fieldwork/Governance scope migrations and cross-engagement publication / cross-firm taxonomy denials.
- `node --import tsx --test tests/taxonomy.integration.ts` — passed on PostgreSQL 18.6/Testcontainers with cross-engagement import and cross-firm taxonomy approval denials.
- `node --import tsx --test tests/publication.integration.ts` — passed on PostgreSQL 18.6/Testcontainers with cross-engagement import and mapping-approval lineage denials.
- `node --import tsx --test tests/practice-ledger.integration.ts` — passed on PostgreSQL 18.6/Testcontainers with cross-firm reversal denial and existing ledger invariants.
- `node --import tsx --test tests/repository.integration.ts` — passed on PostgreSQL 18.6/Testcontainers with orphan-document and cross-engagement trial-balance/stored-object document denials.
- `node --import tsx --test tests/taxonomy.integration.ts` — passed on PostgreSQL 18.6/Testcontainers with cross-client mapping-memory and cross-firm source-approval denials.
- `node --import tsx --test tests/audit-chain.integration.ts` — passed on PostgreSQL 18.6/Testcontainers with orphan-event/head and cross-engagement chain-record denials.
- `node --import tsx --test tests/unit-of-work.integration.ts` — passed on PostgreSQL 18.6/Testcontainers with orphan command-receipt denial and existing transaction invariants.

## Identity mapping procedure and scope regression — 2026-10-02

- The operator-managed Entra mapping service and `pnpm identity:map:entra` CLI now provide a reviewed production mapping procedure. It binds only an existing active local user to an immutable tenant/object ID, defaults to dry-run, rejects conflicting or inactive identities, and never creates memberships or role grants. Its PostgreSQL concurrency and least-privilege tests are recorded in [T019 evidence](../T019/handoff.md).
- `pnpm verify:task -- T018` passed on `41de138997374ac53f7e0d8d2ff31394e74b4c96`: Prisma/server build, scoped job tests (3/3), PostgreSQL firm/client scope (1/1), repository lineage (1/1), authorization grants (1/1), and Fastify foreign-scope boundary (1/1).
- The local app database still has no user or engagement, so no production identity was mapped. No membership, role grant, tenant permission, or business record was created. Live mapped-user acceptance remains separate under T019; R008 organization hierarchy remains assigned to T052. T018 stays `IN_PROGRESS` until an authorized identity-map acceptance is available.

## Remaining acceptance

- The protected lifecycle read and command boundaries are tested; the command denial leaves foreign state and transition history unchanged. Membership attachment is covered by the PostgreSQL composite-FK negative fixture; no separate membership-management HTTP workflow currently exists to test.
- The broader tenant-root review is recorded in [the 2026-10-02 ownership review](tenant-root-review-2026-10-02.md). Fieldwork mapping, document and storage lineage; Practice reversal lineage; and platform audit/receipt scope now have owner-specific constraints. The mapping procedure is implemented; actual identity mapping remains an external acceptance dependency. R008 organization hierarchy remains assigned to T052.
- The existing scope-bootstrap migration documents that synthetic bootstrap scope is development-only. There is no production database or live mapped identity in this environment.
- No deployment or live Microsoft acceptance was performed by this change.
