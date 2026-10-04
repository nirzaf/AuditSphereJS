# T035 — Prove a constrained HTML-to-PDF worker on the target image

| Field | Value |
| :--- | :--- |
| Initial status | `NOT_STARTED` |
| Execution class | `CORE` |
| Phase | 03-platform — Durable jobs, documents and realtime |
| Owner area | `documents` |
| Completion unit | One focused, reviewable change and its evidence |

> Current status: `DONE`. The pinned Playwright/Chromium renderer, immutable `DocumentVersion` provenance writer, rechecked caller-supplied workflow authorization, Moby-derived default-deny Chromium seccomp profile and resource-constrained target-image smoke all pass the recorded task checks. The rendered-document writer remains a platform capability; future reporting commands must provide their own authorization guard. Real SharePoint/OneDrive adapter behavior is separately verified against synthetic tenant folders in T156. Production host/kernel acceptance remains a release gate, not a claim made by this task. The reviewed runtime profile is documented in [the PDF worker seccomp runbook](../../runbooks/pdf-worker-seccomp.md).

## Outcome

Use one reviewed Chromium renderer through Playwright or the selected equivalent, with exact browser/image matching.

## Required context and prerequisites

Read [root agent rules](../../AGENTS.md), this task, the owning module README when it exists, and the exact relevant source ranges in [the preserved CURRENT requirements](../../sources/requirements-current.md). Do not load every task into the agent context.

- [T031 — Configure BullMQ workers for reliable retries and shutdown](T031-queue-runtime.md)
- [T032 — Implement private object storage and immutable document versions](T032-storage-metadata.md)
- [T004 — Approve signature, archival and engagement-type policies](../00-readiness/T004-records-decisions.md)

A dependency must be `DONE`, or an optional/conditional dependency must have an explicitly approved `NOT_APPLICABLE` disposition. All domain implementation also requires [the executable compatibility gate](../01-foundation/T017-compatibility-smoke.md) to pass. Policy-dependent behavior stays blocked until its applicable decisions are approved.

## Source requirements

- **R010** — Brief quotation and 50/50 payment terms; source lines `399-401`.
- **R011** — Comprehensive proposal with all five content blocks; source lines `402-407`.
- **R014** — Engagement-type letter templates; source lines `415-419`.
- **R019** — Automatic receipt and dispatch; source lines `427-427`.
- **R065** — D1 report and audited financial statements; source lines `541-542`.
- **R066** — D2 deficiency-impact-recommendation management letter; source lines `543-543`.
- **R067** — D3 LOR export, management signing and re-upload; source lines `544-544`.
- **R068** — D4 correspondence and confirmation trail; source lines `545-545`.
- **R069** — D5 remaining 50% fee note; source lines `546-546`.

These are coverage identifiers added by this pack; they do not alter the source specification. Review [policy/source conflicts](../../guides/05-decisions-and-source-conflicts.md) when wording overlaps.

## Scope and implementation boundary

**Allowed areas:** packages/server/src/platform/documents and storage; apps/worker/ composition; metadata migrations; tests

**Non-goals:** No overwriting evidence versions, untrusted executable templates or public storage credentials.

Use existing owned records/contracts first. Add a migration or public endpoint only when the task steps require it; record the exact files in the handoff.

**Dependency focus:** Playwright/Chromium or approved renderer; no duplicate PDF runtime

Use [the compatibility policy](../../guides/02-compatibility-matrix.md) and [the complete library register](../../guides/03-library-register.md). Newly introduced or updated packages need published engine/peer/license/advisory review and an executable smoke check before use. Exact lockfile versions, not this task's prose, control installation.

**Applicable decisions:** Check the decision register for any applicable unresolved policy; do not invent a default.

## Implementation checklist

- [x] Use the pinned Playwright 1.58.2 Chromium renderer; the target image installs the browser from that exact package version.
- [x] Render version-identified templates with escaped scalar data; disable JavaScript and abort every browser resource request.
- [x] Bound template/data bytes, output size, page count and render duration; package Noto/Liberation fonts in the target image and launch Chromium with its sandbox enabled.
- [x] Run the renderer with a reviewed default-deny seccomp profile and container-level capability, filesystem, network, process, memory and CPU restrictions.
- [x] Persist a completed PDF as an immutable `DocumentVersion` with verified byte digest, provider identity and checked renderer/template/data snapshot hashes; recheck the owning workflow authorization before storage and inside the final metadata transaction.

## Acceptance criteria and required tests

- [x] **AC1:** Golden quotation and multi-page report fixtures render without missing fonts or truncated sections. The Windows integration extracts tested text from both files; the target image resolves Noto Sans and successfully renders the PDF smoke fixture.
- [x] **AC2:** An injected external-resource URL cannot access metadata/internal services. A local HTTP metadata canary receives zero requests.
- [x] **AC3:** Renderer failure cannot mark a document ready. Invalid template data rejects before the publish callback runs.

Test real/emulated storage behavior, boundary failures and immutable hash/version references; provider-specific assurance requires real-provider evidence.

Test both the successful change and the denied/failure path. Keep the test set proportional to the task; use the actual PostgreSQL engine for financial constraints, locking and concurrent-write claims.

## Failure, rollback and recovery

Fail without a partial successful business state. Keep committed history and evidence immutable; return a clear error or a durable recoverable operation. Source/code rollback does not undo database migrations, financial postings, signed files or external side effects. Any production data repair is a separately authorized operation.

## Verification and handoff

Once [the verification command contract](../01-foundation/T015-commands.md) exists, run the exact task check:

```bash
pnpm verify:task -- T035
```

Before that script exists, record the actual available compile/test/review commands instead. The command above is a **target repository script to implement**, not a claim that an application is included in this ZIP. A verification run must not pass with zero intended tests.

Record changed files, migrations/contracts, exact command output, fixture versions, unresolved decisions and limitations using [the handoff template](../../templates/task-handoff.md). Update [the execution ledger](../../guides/13-execution-ledger.md) only after review. Do not merge or deploy from this task without separate authorization.

**Stop when:** the scoped outcome and all acceptance criteria are proven. Do not continue into the next feature or add unrelated abstractions.
