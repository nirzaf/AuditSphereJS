# T033 — Implement bounded upload initiation and finalize-time authorization

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Current status | `IN_PROGRESS` |
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

- **R020** — Isolated portal and temporary credentials; source lines `428-430`.
- **R022** — PBC item statuses; source lines `432-432`.
- **R041** — Excel/CSV TB imports from source systems; source lines `487-489`.
- **R052** — Electronic evidence and PBC linking; source lines `504-505`.

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
- [ ] Recheck portal access, workflow state and source version during finalize, not only before issuing a URL. Internal staff authorization, engagement state, immutable object reference and digest are rechecked; the portal/PBC identity and source-version boundary is owned by the not-yet-implemented PBC flow.
- [x] Abandon/reap uncommitted staging objects after a grace period. Persisted cleanup claims serialize sweepers with finalization, recover stale claims, and verify Graph folder, generated name, current version, etag, size and digest before recycle-bin deletion.
- [ ] Complete hostile-file inspection under the approved file policy. PDF/CSV content is screened through the digest-pinned ClamAV 1.5.4 service before any object metadata or provider write; detections fail the session and scanner outages fail closed. PDFs additionally run through bounded PDF.js parsing in a resource-limited worker; encrypted/malformed files, parser-visible active features, and direct/escaped active PDF names are rejected before storage. Seven focused fixtures cover passive files, marker-like visible text/comments/hex strings, encryption, JavaScript, URI actions, annotations, attachments and malformed content. This remains defense-in-depth rather than a complete PDF grammar/viewer-safety proof; compressed-object-stream action coverage and the full approved policy remain open. See [dated PDF policy evidence](../../evidence/T033/pdf-policy-2026-10-04.md).

## Acceptance criteria and required tests

- [ ] **AC1:** An upload started before portal freeze cannot become new attached evidence after freeze.
- [ ] **AC2:** Spoofed MIME, oversized payload and cross-client upload completion fail.
- [x] **AC3:** An initiated/interrupted transfer remains unfinalized and creates no document/version record; PostgreSQL integration test asserts this.

AC1 remains open: finalization rechecks internal staff authorization and engagement state, but the portal/PBC workflow and client upload freeze are not implemented. AC2 is partial: tests cover unsupported XLSM MIME, PDF MIME spoofing, declared/actual size mismatch, nonmember access and bounded multipart limits; cross-client portal completion needs its owning PBC model. AC3 passes: interrupted sessions and an injected Graph 503 both remain unattached; provider failure creates no document/version and leaves the uncertain staging row tracked for cleanup/reconciliation.

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

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
