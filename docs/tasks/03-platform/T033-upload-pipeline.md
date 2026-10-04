# T033 — Implement bounded upload initiation and finalize-time authorization

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `DONE` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `documents` |
| Completion unit | One focused, reviewable change and its evidence |

## Outcome

Create short-lived authorized upload sessions bound to user, engagement, category and maximum size.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T032 — Implement private object storage and immutable document versions](T032-storage-metadata.md)
- [T021 — Create explicit permission and segregation-of-duties checks](../02-security/T021-authorization.md)
- [T029 — Add CSRF, CORS, proxy and request-abuse controls](../02-security/T029-security-hardening.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R041** — Excel/CSV TB imports from source systems; source lines `487-489`.
- **R052** — Electronic evidence and PBC linking; source lines `504-505`.

Portal identity, temporary credentials and PBC item statuses are owned by T020/T073/T074/T075/T076. T033 owns the reusable staff upload transport and storage boundary only; T075 binds that boundary to a portal principal and PBC request. See the ownership correction in [guide 10](../../guides/10-corrections-to-prior-plan.md). This changes task ownership, not the source requirements.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/documents and storage; apps/worker/ composition; metadata migrations; tests

**Non-goals:** No overwriting evidence versions, untrusted executable templates or public storage credentials.

**Interface:** POST /documents/uploads; POST /documents/uploads/:id/finalize.

**Dependency focus:** Matched @fastify/multipart; storage SDK; bounded content-identification helper

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Create short-lived internal-staff upload sessions bound to user, engagement, category and maximum size.
- [x] Stream through Fastify multipart to the server-side provider adapter; keep Graph credentials and any preauthenticated upload URL inside the server boundary. Check actual byte size/type/hash before attaching it. Fastify bytes stream through a bounded validator into a private mode-0600 temporary file, then stream from disk to the provider; no full-file Buffer is assembled.
- [x] Recheck internal staff authorization, engagement state, immutable object reference and digest during finalize. A staff transfer that finishes after the engagement enters a state that blocks uploads cannot attach evidence. T075 must additionally recheck portal identity, membership, PBC request state and the portal upload freeze when it binds to this shared pipeline.
- [x] Abandon/reap uncommitted staging objects after a grace period. Persisted cleanup claims serialize sweepers with finalization, recover stale claims, and verify Graph folder, generated name, current version, etag, size and digest before recycle-bin deletion. The compiled long-running worker passed against ephemeral PostgreSQL 18.6 and digest-pinned Redis plus live Graph (SharePoint and OneDrive); two synthetic expired stages were recycled, both subsequent reads failed closed, and no row required review. Production database, backup, retention and legal-hold behavior remain outside this acceptance. See [worker-process evidence](../../evidence/T033/m365-upload-sweep-worker-2026-10-04.json), the [sweeper-function run](../../evidence/T033/m365-upload-sweep-2026-10-04.json) and the [adapter-level run](../../evidence/T033/m365-graph-cleanup-2026-10-04.json).
- [x] Enforce bounded hostile-file controls before storage metadata/provider writes. PDF/CSV content is screened through the digest-pinned ClamAV 1.5.4 service; detections and scanner outages fail closed. PDFs additionally run through bounded PDF.js parsing in a resource-limited worker; encrypted/malformed files, parser-visible active features, direct/escaped active PDF names, files over 500 pages, and files over 10,000 annotations are rejected. Worker initialization is bounded to 10 seconds; reading and inspecting a file is bounded to five seconds. Ten focused tests cover passive files, marker-like visible text/comments/hex strings, encryption, JavaScript, URI actions, attachments, malformed content, compressed catalog/indirect actions, and page/annotation resource caps. This is a defined screening boundary, not a guarantee that every malicious file or viewer-specific behavior is detected. See [original PDF policy evidence](../../evidence/T033/pdf-policy-2026-10-04.md) and [compressed indirect-object follow-up](../../evidence/T033/pdf-compressed-indirect-2026-10-04.md).

## Acceptance criteria and required tests

- [x] **AC1:** A staff upload transferred before an engagement workflow freeze cannot become attached evidence after the state changes to disallow uploads.
- [x] **AC2:** Spoofed MIME/content, oversized or mismatched payloads, and another staff actor's transfer or finalization fail without attaching evidence. Portal cross-client completion remains an explicit T075 acceptance criterion.
- [x] **AC3:** An initiated/interrupted transfer remains unfinalized and creates no document/version record; PostgreSQL integration test asserts this.

AC1, AC2 (internal staff scope), and AC3 pass under the accepted task boundary. T075 owns portal identity, membership, PBC request/source-version binding, cross-client completion denial, and the portal freeze at final report release. T064 owns category-folder provisioning. Neither downstream task changes this task's staff upload acceptance.

Live provider acceptance: the Graph `deleteStaged` adapter passed against only the designated synthetic SharePoint and OneDrive folders (2/2, zero failures/skips). A separate acceptance invoked `sweepUnreferencedUploads` against ephemeral PostgreSQL 18.6 and the same designated provider folders (1/1, zero skips), then the compiled long-running worker repeated the flow using ephemeral PostgreSQL and Redis. Two synthetic expired rows transitioned to `CLEANED`, provider reads failed closed, and no review-required rows remained. This does not exercise production databases, backup, retention or legal-hold operations. See [worker-process evidence](../../evidence/T033/m365-upload-sweep-worker-2026-10-04.json), [worker-function evidence](../../evidence/T033/m365-upload-sweep-2026-10-04.json) and [adapter evidence](../../evidence/T033/m365-graph-cleanup-2026-10-04.json).

Test real/emulated storage behavior, boundary failures and immutable hash/version references; provider-specific assurance requires real-provider evidence.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T033
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions. The staff upload task is complete; portal/PBC behavior, folder provisioning and production operations remain with T075, T064 and release/operations tasks respectively.
