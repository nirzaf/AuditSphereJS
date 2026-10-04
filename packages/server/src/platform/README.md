# Shared platform records and services

The platform owns cross-module mechanisms and shared records: identity and authorization, transaction context, immutable audit events, durable operations/outbox delivery, storage repositories, document metadata and versions, and security controls. Business modules may use these records only through the platform's explicit services; they do not write another module's owned tables.

## Documents and rendered PDFs

`Document` is engagement-scoped metadata and `DocumentVersion` is the append-only byte snapshot. The platform stores provider-specific references server-side, verifies SHA-256 and size metadata, stages bytes through `StoredObject`, and records finalization in the same PostgreSQL transaction as the document version and audit event. External object-store calls always happen outside database transactions. Unreferenced output remains tracked for the bounded cleanup sweep if finalization fails.

`persistRenderedPdfVersion` accepts only a bounded, hash-verified `PdfArtifact` from the pinned Playwright/Chromium renderer. Its caller must supply the owning workflow's authorization guard. The guard runs before the storage write and again in the transaction that attaches the immutable version. Persisted JSON provenance contains renderer and browser versions, template identity/hash, canonical data-snapshot hash, page count, and blocked-resource count; it never stores the source data snapshot itself. The current helper creates draft deliverables under `04_Drafts & Deliverables`. It does not issue, sign, release, or archive reports; those actions remain owned by Reporting workflows.

## Versioned firm templates and approved assets

`DocumentTemplate` stores firm template identity and optimistic revision; `DocumentTemplateVersion` and the approval/activation ledgers are append-only. Template content uses a closed set of text/list/artwork blocks and an explicit variable allow-list. The Reporting workspace sends structured preview values to the server; raw HTML or executable template code is rejected, and missing values produce actionable validation errors. Ordinary engagement readers see only an exact approved active version. The `DOCUMENT_TEMPLATE_MANAGE` capability is partner-role bounded and every write rechecks the engagement scope inside its transaction.

`FirmApprovedAssetVersion` binds scanned bytes to SHA-256, content type, size, provider version and a separate firm-private repository. Signature and seal categories accept PNG/JPEG image appearance only; they are not cryptographic PDF signatures. Templates bind exact stored, approved artwork versions, and activation rechecks those exact links. A template update appends a new version; existing rendered `DocumentVersion` bytes and provenance remain unchanged. Upload staging is swept in bounded worker passes and database triggers preserve upload identity and append-only decision history. Production requires a provisioned `FirmRepository` with purpose `template-assets-private`; no client evidence, working-file or practice folder fallback is permitted.

## Required invariants

- Deadline intent is committed to PostgreSQL in the source workflow transaction. A bounded `FOR UPDATE SKIP LOCKED` scan atomically moves due rows into deterministic background-operation and outbox identities; missed rows are recovered by later scans after a restart. Redis queue insertion is at-least-once and never owns deadline state.
- The API database role may read/create/update scheduled rows and read/insert outbox rows; the worker role may select/insert/update deadline, background-operation and outbox rows. Neither runtime role receives DELETE on deadline or operation history.
- Every deadline is explicitly `INFORMATIONAL` or `ENFORCEMENT`. Registered handlers receive that classification and execute database changes in the operation-completion transaction. External delivery must create separate durable outbox intent. A handler must not rely on a rendered PDF or successful document generation to enforce archive state.
- Reuse a scoped idempotency key only for identical schedule content. A changed due instant, payload, event type or classification requires a new revision key; queued or terminal deadlines are immutable history and cannot be cancelled.
- PostgreSQL owns metadata truth; Redis leases and queues never authorize or replace database state.
- Mutations recheck caller authority in their transaction, bind document/version rows to the same engagement, append audit, and use optimistic/append-only semantics where applicable.
- Graph production storage requires an explicit client-to-evidence repository binding. Local S3-compatible storage is limited to non-production fixtures.
- A `DocumentVersion` and its render provenance are immutable. New bytes create another version; approved artifacts are never overwritten.
- Failed renders create no stored object. Failed post-storage authorization or metadata commits leave an unreferenced, tracked object for cleanup and create no `DocumentVersion`.
