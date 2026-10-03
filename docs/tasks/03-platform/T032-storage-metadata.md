# T032 — Implement private SharePoint/OneDrive storage and immutable document versions

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `DONE` — scoped immutable SharePoint/OneDrive provider versions, Trial Balance version pinning, and an authorized idempotent engagement/Trial Balance evidence-link workflow pass PostgreSQL, API-contract, affected-project and current non-production provider-boundary checks. Upload sessions are T033; binary downloads and access receipts are T034; PBC attachment is T075; five-folder provisioning is T064; broader tenant retention and failure-matrix acceptance remains T156/release scope. |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `documents` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create document/version/link records with scope, category, original name, provider reference, size, digest and provider version ID. Use the user-selected server-side Graph adapter for SharePoint evidence and OneDrive working files; RustFS remains a local S3-compatible test fixture only.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T018 — Implement firm, client and engagement ownership constraints](../02-security/T018-scope-model.md)
- [T024 — Share one transaction across module-owned business operations](../02-security/T024-transaction-context.md)
- [T006 — Select deployment targets, storage and external-provider boundaries](../00-readiness/T006-deployment-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R031** — Five-folder engagement taxonomy; source lines `454-463`.
- **R052** — Electronic evidence and PBC linking; source lines `504-505`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R071** — Early/manual or timed permanent application read-only state; source lines `551-551`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/documents and storage; apps/worker/ composition; metadata migrations; tests

**Non-goals:** No overwriting evidence versions, untrusted executable templates or public storage credentials.

**Data or records:** documents; document_versions; document_links; upload_sessions.

**Dependency focus:** Reuse the server-only Microsoft Graph storage adapter and scoped repository bindings. Do not add an S3 production adapter or presigner; RustFS is only for local adapter and worker tests.

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Persist scoped `Document` and append-only `DocumentVersion` metadata for the Trial Balance upload, including category, size, digest and immutable provider version identity; bind each import to the exact document version.
- [x] Add scoped immutable document-link records and workflow for engagement and Trial Balance evidence; PBC request targets remain dependent on T074/T075 and their owning model/upload contract.
- [x] Bind Graph operations to the configured client repository drive/folder for SharePoint and OneDrive. Opaque references retain the repository folder and reject a different-folder read before Graph access; filenames are validated before provider paths are constructed.
- [x] In the Trial Balance upload path, stage bytes before the database transaction, append a new immutable version, and mark the object referenced only with the import/version transaction.
- [x] Complete the authorized metadata/link workflow for engagement and Trial Balance targets: listing requires scoped read authority; create/revoke recheck write authority, pin exact versions, record audit/idempotency evidence and redact provider references. Binary downloads and access receipts are T034.
- [x] Keep provider credentials, Graph access tokens and preauthenticated download URLs server-side. Live T156 evidence verifies exact-version/hash behavior and HTTP 403 for writes outside each selected SharePoint/OneDrive acceptance folder.

## Acceptance criteria and required tests

- [x] **AC1 (scoped version/link records):** PostgreSQL composite foreign keys reject a Trial Balance import or `DocumentLink` linked to a document/version/import from another engagement. PBC linking awaits its owning request model in T074/T075.
- [x] **AC2 (Trial Balance upload):** Updating a scoped document appends a version and preserves the prior digest; stale and cross-engagement versions fail, concurrent writers cannot both advance the head, and the worker loads the exact pinned reference.
- [x] **AC3:** Graph credentials and preauthenticated URLs stay server-side; opaque references bind exact drive, repository folder, item, version, digest and size; a foreign-folder read is denied before Graph access. Current nonproduction SharePoint and OneDrive acceptance verifies exact-version/hash isolation and rejects writes outside each selected folder with HTTP 403. See the dated [T156 provider evidence](../../evidence/T156/live-storage-2026-10-03-f6f0f539.json) and [tenant permission inventory](../../microsoft365/current-tenant.md). Browser binary upload/download and delivery receipts belong to T033/T034; PBC uploads to T075. Broader expiry, revocation/recovery, throttling, retention, legal-hold and unknown-outcome checks remain in T156 and production release gates.

Test real/emulated storage behavior, boundary failures and immutable hash/version references; provider-specific assurance requires real-provider evidence.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T032
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.

Completion evidence: [T032 handoff](../../evidence/T032/handoff.md). This task closes the storage/version/link foundation for its owned scope. It does not claim the separate upload-session, binary-download, PBC, five-folder provisioning, full M365 release-gate, retention/legal-hold or production hosting tasks are complete.
