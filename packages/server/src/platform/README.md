# Shared platform records and services

The platform owns cross-module mechanisms and shared records: identity and authorization, transaction context, immutable audit events, durable operations/outbox delivery, storage repositories, document metadata and versions, and security controls. Business modules may use these records only through the platform's explicit services; they do not write another module's owned tables.

## Documents and rendered PDFs

`Document` is engagement-scoped metadata and `DocumentVersion` is the append-only byte snapshot. The platform stores provider-specific references server-side, verifies SHA-256 and size metadata, stages bytes through `StoredObject`, and records finalization in the same PostgreSQL transaction as the document version and audit event. External object-store calls always happen outside database transactions. Unreferenced output remains tracked for the bounded cleanup sweep if finalization fails.

`persistRenderedPdfVersion` accepts only a bounded, hash-verified `PdfArtifact` from the pinned Playwright/Chromium renderer. Its caller must supply the owning workflow's authorization guard. The guard runs before the storage write and again in the transaction that attaches the immutable version. Persisted JSON provenance contains renderer and browser versions, template identity/hash, canonical data-snapshot hash, page count, and blocked-resource count; it never stores the source data snapshot itself. The current helper creates draft deliverables under `04_Drafts & Deliverables`. It does not issue, sign, release, or archive reports; those actions remain owned by Reporting workflows.

## Required invariants

- PostgreSQL owns metadata truth; Redis leases and queues never authorize or replace database state.
- Mutations recheck caller authority in their transaction, bind document/version rows to the same engagement, append audit, and use optimistic/append-only semantics where applicable.
- Graph production storage requires an explicit client-to-evidence repository binding. Local S3-compatible storage is limited to non-production fixtures.
- A `DocumentVersion` and its render provenance are immutable. New bytes create another version; approved artifacts are never overwritten.
- Failed renders create no stored object. Failed post-storage authorization or metadata commits leave an unreferenced, tracked object for cleanup and create no `DocumentVersion`.
