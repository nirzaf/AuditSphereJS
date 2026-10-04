# T035 handoff — constrained HTML-to-PDF renderer

## Identity

Task ID: T035
Requirement IDs: R010, R011, R014, R019, R065, R066, R067, R068, R069
Implementing commit/branch: in progress on `main`
Status: DONE (hosted CI and nonproduction asset publication passed)

## Intended and delivered outcome

Added a server-only renderer using the repository's pinned Playwright 1.58.2 and matching Chromium. The renderer requires a versioned template identity and SHA-256, escapes scalar data placeholders, disables page JavaScript, denies every browser resource request, enables Chromium's sandbox, bounds input/output/page count/time, inspects the generated PDF, and returns its bytes, hash, and renderer/template/data provenance. A publish callback runs only after successful render and inspection.

No reporting template catalog, report-release authorization, provider write, production DocumentVersion, signature, or client-facing endpoint was added. The current Fieldwork-owned `DocumentVersion` needs a workflow-owned writer and renderer/template/data provenance persistence; that boundary remains open for review with T036/reporting owners. The artifact metadata is present in memory but is not yet persisted to an immutable business document version, so T035 remains IN_PROGRESS. The production runtime also needs a least-privilege seccomp profile that permits Chromium user namespaces; the isolated target-image smoke used `seccomp=unconfined` with no network and 1 GiB/1 CPU limits.

## Files and contracts

- `packages/server/src/platform/pdf-renderer.ts`: bounded renderer, escaped template substitution, network denial, PDF inspection and provenance output.
- `packages/server/src/index.ts`: exports the server-side rendering API for worker composition; no browser transport export.
- `packages/server/tests/pdf-renderer.integration.ts`: actual Chromium tests for quote/report fixtures, page extraction, escaping, resource denial and publish failure.
- `scripts/pdf-render-smoke.mjs`: target-image smoke records the renderer/browser/font/hash/runtime identity without storing document content.
- `scripts/verify-task.mjs` and `package.json`: record T035's unit/integration, Linux image build and renderer smoke checks; include the real-browser integration in `verify:all`.
- `Dockerfile`: installs Noto Core/Liberation fonts, installs the browser into a shared read-only runtime path, runs as the unprivileged `node` user, and makes the sandbox available.
- `docs/tasks/03-platform/T035-pdf-runtime.md`, `docs/guides/03-library-register.md`, and `docs/guides/13-execution-ledger.md`: current scope and status.

No npm dependency or lockfile change. Playwright 1.58.2 and pdfjs-dist 6.4.299 were already pinned. The Docker image now includes OS font packages and a non-root runtime configuration.

## Decisions

T004 is DONE and its D03/D08/D09/D10 implementation defaults apply. No new business policy was inferred. No Microsoft 365 tenant, Graph permission, production service or external provider was changed.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T035` (renderer step) | Windows x64; installed Playwright 1.58.2 Chromium; quotation and four-section report fixtures | PASS, 3/3 integration checks; quotation text and terms extract correctly, report sections and conclusion survive, resource canary receives 0 requests, invalid render never calls publisher | Local actual-browser run, 2026-10-04 |
| `pnpm verify:task -- T035` | Server build, actual Playwright/Chromium renderer tests, source-fingerprinted Linux image build, Noto font resolution, non-root renderer smoke with 1 GiB / 1 CPU / no network | PASS; 3/3 renderer integration tests; image rendered a one-page PDF with Playwright 1.58.2 / Chromium 145.0.7632.6 as uid 1000 | [Latest Linux renderer evidence](linux-render-smoke-2026-10-04-r2.json); [prior run](linux-render-smoke-2026-10-04.json) |
| `pnpm verify:affected` | Boundaries, server/test types, Angular production build, Vitest | PASS; 25 files / 114 tests | Local run, 2026-10-04 |
| `pnpm lint` | ESLint and import boundaries | PASS; zero errors; 4 pre-existing unused-disable warnings under excluded prototype source | Local run, 2026-10-04 |
| `git diff --check` | Current tracked diff | PASS; only Git's existing LF-to-CRLF notices | Local run, 2026-10-04 |

## Acceptance criteria

- AC1: Windows actual Chromium renders the quotation and multi-page report without truncating tested text; the target image resolves Noto Sans and renders successfully.
- AC2: A renderer fixture injects a loopback metadata URL. Browser routing aborts it and a local HTTP canary observes zero requests.
- AC3: An invalid/missing template value rejects before the immutable-version publisher callback is called.
- Immutable-version checklist item remains open: provenance is available on the artifact, but the worker does not yet commit a `DocumentVersion` with that provenance. No task is marked complete from the artifact-only test.

## Recovery and authorization

Render errors are returned without invoking the publication callback. The renderer does not write storage or alter business records. Browser pages run without JavaScript, network requests are aborted, and the process must run in the separate worker container. Container-level memory/CPU deployment limits and provider retention are downstream production gates. No migration or data repair occurred.

## Review and next task

Reviewer: Codex self-review in progress
Review result: Windows browser checks and target Linux image smoke pass; immutable storage integration remains open
Open blockers: least-privilege production seccomp profile for user namespaces, and an approved ownership path for persisting rendered provenance in an immutable document version
Next eligible task by dependency order: T035 completion; T036 template catalog follows after T035 is DONE
Stop after this task; do not implement the next one without assignment.

## CI follow-up — 2026-10-04

The GitHub Actions run for `c3fe250` exposed a timing race in the Linux Chromium resource-denial assertion: PDF rendering began after `DOMContentLoaded`, before Chromium consistently scheduled the injected image request. The renderer now waits for the page `load` event; routed resources are aborted, so the page proceeds without granting network access. This also ensures document resources have settled before PDF capture.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm exec node --import tsx --test packages/server/tests/pdf-renderer.integration.ts` (3 consecutive runs) | Windows x64 Playwright Chromium; quotation, multi-page report and loopback metadata fixtures | PASS; 3/3 checks on each run; loopback listener received 0 requests and blocked-resource count was recorded | Local actual-browser runs, 2026-10-04 |
| `pnpm verify:task -- T035` | Server build, Chromium integration tests, rebuilt source-fingerprinted Linux image and constrained PDF smoke | PASS; renderer checks 3/3; Linux smoke rendered one page with Chromium 145.0.7632.6 as uid 1000; 1 GiB / 1 CPU / no network | Local run, 2026-10-04 |
| `pnpm verify:affected` | Boundaries, server/test types, Angular production build, Vitest | PASS; 25 files / 115 tests | Local run, 2026-10-04 |
| `git diff --check` | Current tracked diff | PASS | Local run, 2026-10-04 |

The hosted rerun for `c3fe250` failed only at the same resource-denial assertion; the prior startup/config issue was resolved. The source fix above is awaiting its own hosted CI run. T035 remains IN_PROGRESS because its immutable `DocumentVersion` persistence and production seccomp acceptance gates remain open.

## Completion review — 2026-10-04

The earlier in-progress notes above describe intermediate states and are superseded by this completion review. T035 is now DONE for its scoped renderer/runtime outcome. Production deployment-host/kernel acceptance remains a downstream release gate; the user has not selected a production target.

### Added immutable rendered-document persistence

- `packages/server/src/platform/rendered-documents.ts` persists a completed artifact as a new `Document` and immutable `DocumentVersion`, recording provider identity/version, exact SHA-256 and byte size, page count, and renderer/template/canonical-data provenance.
- The caller provides the owning workflow's authorization callback. It is checked before provider I/O and again while the engagement is locked inside the final PostgreSQL transaction. A failed second check leaves a tracked `PENDING` storage object for the existing cleanup path and creates no document/version.
- Migration `202610040006_rendered_pdf_provenance` adds a constrained JSONB provenance manifest. The integration test verifies the record, audit event, exact hashes, provider metadata, append-only database rejection, and revoked-authorization cleanup path using PostgreSQL 18.6 plus the synthetic Graph adapter.
- `packages/server/src/platform/README.md` documents ownership; the Fieldwork README now points to the platform document/version boundary.

### Reviewed runtime isolation

The target-image smoke now uses `config/seccomp-chromium.json`, derived from pinned Moby profile commit `2ceae35d351c156cb5a8efc0fdc4a08cf94569d8`. The checker confirms the source baseline and the only three reviewed Chromium namespace-sandbox additions. The smoke runs as uid 1000 with no network, a read-only image root, bounded tmpfs mounts, all capabilities dropped, no-new-privileges, a 128-process limit, 1 GiB memory and 1 CPU. Production kernel/AppArmor/orchestrator behavior remains to be tested against the eventual deployment host.

### Verification evidence

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T035` | Windows Playwright 1.58.2/Chromium renderer fixtures; PostgreSQL 18.6 document/version integration with synthetic Graph adapter; pinned seccomp verification; rebuilt source-fingerprinted Linux image and constrained smoke | PASS; 3/3 Chromium checks, 1/1 PostgreSQL integration, seccomp check passed, smoke passed; renderer Playwright 1.58.2 / Chromium 145.0.7632.6, Noto Sans, one page, 14,260 bytes, uid 1000 | [Fresh run record](verification-2026-10-04-r3.json) |
| `pnpm verify:affected` | Import boundaries, server/test typechecks, Angular production build, Vitest | PASS; 25 test files / 115 tests | Local run 2026-10-04 |
| `pnpm lint` | ESLint and import boundaries | PASS; zero errors, existing ignored prototype declaration warnings only | Local run 2026-10-04 |
| `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm verify:task -- T156` | Real SharePoint and OneDrive storage adapters against designated synthetic folders | PASS; 2/2 live-provider checks, zero skips; exact-version byte/hash isolation and outside-folder write denial | [T156 redacted evidence](../T156/live-storage-2026-10-04-6ad456e8.json) |
| `git diff --check` | Reviewed T035 change set | PASS | Local run 2026-10-04 |
| GitHub Actions [run 37199010821](https://github.com/nirzaf/AuditSphereJS/actions/runs/37199010821) | Push commit `8dca5b52d37ebf101ad09503404fb04b35bdb38d` on `main` | PASS; full verification, T035, contract check, dependency audit, Linux build/runtime smoke, and public web asset publication all succeeded | [Verified nonproduction web release](https://github.com/nirzaf/AuditSphereJS/releases/tag/build-8dca5b52d37ebf101ad09503404fb04b35bdb38d) |

The live T156 checks validate the SharePoint/OneDrive storage adapter and selected-folder boundary. The PDF writer's database/provenance/failure semantics were verified through the PostgreSQL integration and synthetic Graph adapter; no production renderer caller, production provider credentials, deployment host or report-issuance authorization was added by T035. Reporting must continue to supply its own workflow authorization guard.

### Review disposition

All T035 checklist items and AC1–AC3 are satisfied. The renderer and writer are server-side platform capabilities only; report templates, release approvals, signatures and report delivery remain with their owning later tasks. The seccomp profile passed the actual constrained Linux image smoke locally and in hosted CI. Actions published the labelled prerelease web assets and performed no deployment. Next dependency-eligible task: T036, versioned document templates and approved assets.
