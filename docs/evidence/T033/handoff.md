# T033 — bounded staff upload sessions (implementation handoff)

## Identity

Task ID: T033  
Requirement IDs: R041, R052
Implementing commits on `main`: prior upload implementation; malware-scanning follow-up `caf8aa7`
Status: DONE

## Intended and delivered outcome

Implemented a staff-only, short-lived upload-session flow for Fieldwork Execution. A session binds its authenticated staff actor, engagement scope, approved Fieldwork category, filename, declared content type/size, optional expected SHA-256, and expiry. The Fastify endpoint accepts one multipart file with a 15,000,000-byte bound. Only PDF and CSV are accepted; the service checks observed filename, MIME, size, signature/UTF-8, and digest, then streams the private spool through ClamAV before writing through the server-side storage adapter. Detected malware and scanner outages fail the session before a storage row or provider write. Bytes that pass scanning are tracked as unreferenced `StoredObject` data first. A separate finalization transaction locks the engagement and upload session, rechecks `FIELDWORK_WRITE` and state, then creates the scoped `Document`/immutable `DocumentVersion`, marks the stored object referenced, finalizes the session, and appends an audit event. Same-actor finalization retries return the original result without adding another document. Initiated sessions that expire are marked EXPIRED by the existing cleanup worker; stale unreferenced local objects use the existing grace-period sweep.

T033 owns the internal staff upload transport and storage boundary. The portal identity, PBC request binding, client freeze and cross-client upload controls are assigned to T075, which consumes this shared pipeline; the task-pack ownership correction is recorded in [guide 10](../../guides/10-corrections-to-prior-plan.md), without changing the source requirements. Fastify multipart streams through a validating transform into a private mode-0600 temporary file; ClamAV reads bounded 64 KiB frames from disk, then the service streams the same file to Graph or the S3-compatible provider without assembling the upload in memory. Persisted `UPLOADING`/`PENDING`/`CLEANING` states and an atomic cleanup claim serialize finalization against stale-object cleanup. Graph cleanup verifies the generated file identity, selected client folder, current version, etag, byte length and SHA-256 before issuing Graph delete (recoverable recycle-bin behavior); the adapter's guarded deletion was live-tested in the designated synthetic SharePoint and OneDrive folders (see dated evidence below). Unsupported XLSX/XLSM content types are rejected before a session is stored. The defined bounded screening policy is ClamAV signature scanning plus resource-limited PDF.js checks for explicit active-content classes, malformed/encrypted input and resource caps; these controls do not prove full PDF grammar or viewer safety.

## Files and contracts

- `prisma/schema.prisma`, `prisma/migrations/202610030010_document_upload_sessions/migration.sql`, and `prisma/migrations/202610030011_stored_object_cleanup_claims/migration.sql`: scoped session persistence, foreign keys, status/content/size checks, guarded transitions and recoverable cleanup claims.
- `packages/contracts/src/index.ts`, `packages/contracts/schema.json`, and `packages/contracts/openapi.json`: canonical initialization, session, receipt and finalize transport schemas and generated API description.
- `packages/server/src/platform/document-uploads.ts`, `document-uploads-controller.ts`, `storage.ts`, `graph-storage.ts`, and `modules/fieldwork/uploads.ts`: private disk spool, bounded streaming validation, provider stream, guarded finalize and claimed cleanup.
- `apps/api/src/main.ts`, `http-security.ts`, `security-controls.ts`, `apps/api/package.json`: route composition, Fastify multipart limits and the one permitted multipart request path.
- `apps/api/tests/multipart-plugin.integration.ts`, `apps/api/tests/document-upload.integration.ts`, `tests/graph-storage.test.ts`, `tests/upload-race.integration.ts`, `tests/security-hardening.test.ts`, `package.json`, `scripts/verify-task.mjs`: repeatable plugin, HTTP, Graph cleanup, race, PostgreSQL and transport policy tests/recipe.
- `docs/guides/03-library-register.md`, `docs/tasks/03-platform/T033-upload-pipeline.md`, and Fieldwork README: dependency and scope record.

## Dependency evidence

Added exact `@fastify/multipart@10.1.2` under `apps/api`; license is MIT and the dependency metadata gate passed. The package is exercised with the pinned Fastify `5.12.5` adapter. The 10.1.0 aborted-upload advisory and selected patched version are recorded in the library register and [multipart adapter evidence](multipart-adapter-2026-10-03.md). The full T017 check passed locally against the updated lockfile and Linux image; dated versions, hashes, suite totals and limitations are recorded in [T017 recheck evidence](../T017/local-run-2026-10-04.md). Hosted CI still verifies each pushed revision.

## Decisions

No new D01–D12 implementation default was introduced. The endpoint is internal staff-only and limited to the Fieldwork execution state. It does not grant client-portal upload access or add provider permissions.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T033` | Fresh Prisma 7.10 client/build, canonical Zod/OpenAPI checks, Fastify 5 multipart plugin, PostgreSQL 18.6 Testcontainers upload flow and actual Nest/Fastify HTTP routes | Exit 0; unit/security and multipart tests 2/2; PostgreSQL/API upload test 1/1; unauthorized upload 401, invalid multipart route 415, oversize declared file 400 | This handoff and task-run output, 2026-10-03 |
| `pnpm exec prisma validate` | Current Prisma schema | Exit 0 | Task-run output, 2026-10-03 |
| `pnpm dependencies:check` | Workspace package metadata and licenses | Exit 0; multipart `10.1.2 | MIT | {}` | [multipart adapter evidence](multipart-adapter-2026-10-03.md) |
| `node --import tsx --test tests/graph-storage.test.ts` | Streamed Graph upload, cleanup by exact reference/name, hash and version mismatch denial | Exit 0; 6 tests passed | Task-run output, 2026-10-03 |
| `node --import tsx --test tests/upload-race.integration.ts` | PostgreSQL 18.6 + RustFS concurrent identical Trial Balance uploads and stale-object sweep | Exit 0; 1 integration test passed | Task-run output, 2026-10-03 |
| `pnpm verify:task -- T033` (final rerun) | Fresh generated Prisma client, server compilation, contract/OpenAPI drift, Fastify multipart bounds and PostgreSQL 18.6 upload API/session/staging flow | Exit 0; multipart 2/2 and upload API/PostgreSQL integration 1/1; unsupported `.xlsm` creates no session | Task-run output, 2026-10-03 |
| `pnpm verify:task -- T033` (provider failure rerun) | PostgreSQL 18.6 upload flow with an injected Graph 503 | Exit 0; multipart 2/2 and upload API/PostgreSQL integration 1/1; provider rejection fails the session, creates no document/version and preserves the tracked staging outcome | Local run, 2026-10-04 UTC |
| `pnpm verify:task -- T033` (startup-handshake rerun) | Fresh server build, canonical contracts/OpenAPI, multipart, ClamAV unit and daemon checks, bounded PDF worker, PostgreSQL 18.6/Fastify upload flow | Exit 0; multipart 2/2, ClamAV unit 3/3, daemon 1/1, PDF inspection 10/10 and upload integration 1/1 | Local run, 2026-10-04 UTC |
| `pnpm verify:affected` (current combined tree) | Boundaries, server/test typechecks, Angular production build and Vitest | Exit 0; 30 test files and 137 tests passed; Angular production build passed | Local run, 2026-10-04 UTC |
| `pnpm verify:affected` (final rerun) | Boundaries, server/tests typecheck, Angular production build and Vitest | Exit 0; 22 files, 99 tests passed; production web build emitted `dist/web` | Task-run output, 2026-10-03 |
| `pnpm exec eslint packages/server/src/platform/document-uploads.ts packages/server/src/platform/storage.ts packages/server/src/platform/graph-storage.ts packages/server/src/modules/fieldwork/uploads.ts packages/server/src/modules/fieldwork/service.ts tests/graph-storage.test.ts tests/upload-race.integration.ts apps/api/tests/document-upload.integration.ts` | Changed upload, storage and integration-test files | Exit 0 | Task-run output, 2026-10-03 |
| `pnpm db:migrate` | Local development PostgreSQL schema only; preserves existing rows | Exit 0; applied additive `202610030011_stored_object_cleanup_claims` | Prisma migration output, 2026-10-03 |

## Acceptance criteria

- **AC1 — PASS:** The PostgreSQL upload integration stores a staff transfer, changes the engagement into a state that disallows uploads and proves finalization is denied without attaching a document.
- **AC2 — PASS (staff scope):** Unsupported XLSX/XLSM, spoofed PDF content, declared/actual size mismatch, oversize declarations, another staff actor's receive/finalize attempt and multipart limits are denied. Portal cross-client completion is assigned to T075.
- **AC3 — PASS:** An interrupted INITIATED session and an injected Graph 503 create no `Document` or `DocumentVersion`. The provider rejection marks the session failed and preserves the `UPLOADING` object row for the grace-period cleanup/reconciliation path. Finalization locks and verifies the `StoredObject` row and cleanup state. The adapter, sweeper function and worker process also passed designated synthetic SharePoint/OneDrive cleanup acceptance; production retention and recovery remain unverified.

## Recovery and authorization

The migration is additive. No production database was changed; integration tests apply the ordered migration chain to disposable PostgreSQL 18.6 containers. Provider writes are external to the finalization transaction; unreferenced writes are tracked before storage I/O. Production Graph deletion is not automated. No merge, deployment, tenant permission change or provider cleanup was performed.

## Review and next task

Reviewer: Codex implementation review.
Review result: Codex reviewed the implemented boundary, database authorization/finalization invariants, negative-path tests, current task acceptance criteria and exact verification recipe. AC1–AC3 pass for internal staff uploads. Independent professional/security review and production operations remain release gates; they are not claimed by this task handoff.
Adjacent work owned elsewhere: T075 portal/PBC identity, request binding, cross-client completion and release freeze; T064 category-folder provisioning; production database, retention, legal-hold and recovery acceptance. These remain open in their owner tasks and are not T033 staff-session acceptance blockers. The guarded Graph cleanup adapter, actual sweeper function and compiled worker process are live-accepted against designated synthetic folders using ephemeral PostgreSQL/Redis; production operations remain outside that evidence.
Next eligible work: T075 portal/PBC integration and T064 category-folder provisioning remain separately tracked; no T033 acceptance criteria remain open.

## ClamAV upload screening follow-up — 2026-10-03 22:34 UTC (2026-10-04 Asia/Riyadh)

- Outcome: a digest-pinned ClamAV 1.5.4 daemon now screens the private upload spool using bounded 64 KiB `INSTREAM` frames before `StoredObject` metadata or Graph/S3 provider writes. NUL-terminated replies are parsed without waiting for daemon socket closure. A signature detection marks the session `FAILED` and returns a client error; scanner connection/protocol/timeouts mark it `FAILED` and return service unavailable. Both paths fail closed.
- Runtime/configuration: Compose binds daemon TCP 3310 to host loopback only for local development. `.env.example` uses `127.0.0.1:3310`; production sample uses private Compose DNS `clamav:3310`, and production config requires explicit endpoint variables. The daemon container carries its own signature database; its healthcheck reports clamd readiness. The ClamAV image is GPLv2 and remains a separate service image, not copied into the application image. Network confidentiality/private routing and production resource sizing must be validated for the eventual hosting platform.
- Added/updated paths: `packages/server/src/platform/clamav.ts`, `document-uploads.ts`, `config.ts`, `docker-compose.yml`, `.env.example`, `.env.production.example`, `tests/clamav.integration.ts`, `packages/server/tests/clamav.test.ts`, `apps/api/tests/document-upload.integration.ts`, `package.json`, `scripts/verify-task.mjs`, compatibility/library guides, Fieldwork README, task text and implementation status.
- Tests: Vitest adapter tests exercise exact `zINSTREAM` request framing, multiple bounded chunks, clean NUL response, malware response and unavailable endpoint. The real daemon test scans benign content and the exact 68-byte EICAR marker. The PostgreSQL 18.6/Testcontainers upload test injects a scanner stub and proves a positive result fails the session with no `StoredObject`, `Document`, `DocumentVersion` or Graph write; an unavailable scanner also fails before storage. EICAR fixture reference: [EICAR test file specification](https://www.eicar.org/download-anti-malware-testfile/).
- Verification, executed 2026-10-03 22:34 UTC: `docker compose up -d --wait clamav` reported `Healthy`; `pnpm verify:task -- T033` passed (server build, contracts/OpenAPI drift, multipart 2/2, scanner unit 3/3, real ClamAV 1/1, PostgreSQL upload integration 1/1); `pnpm verify:affected` passed (boundaries, typechecks, Angular production build, Vitest 23 files/102 tests); `pnpm lint` passed with four existing unused-disable warnings in the excluded untracked visual-prototype declaration file; `docker compose config --quiet`, `git diff --check` and package JSON parse passed.
- Acceptance status: malware signature screening is implemented and tested but the combined hostile-file policy item remains open because encrypted-PDF rejection and active-content inspection are not implemented. ClamAV is a signature screening layer, not a guarantee that files are safe. AC1/AC2 remain partial for missing PBC/portal freeze ownership; AC3 remains passed. No live SharePoint/OneDrive upload or cleanup action, tenant permission, database migration or production system changed in this follow-up.

## Bounded PDF inspection follow-up — 2026-10-04

- Outcome: PDF uploads now pass ClamAV and then a bounded PDF.js parser in a resource-limited worker before any stored-object metadata or provider write. Encrypted/malformed input, parser-visible active features, and direct or escaped active PDF names outside literal strings/comments/hex strings fail the upload session. Failures return a client rejection or service unavailable and create no stored-object/provider side effect.
- Dependency: `pdfjs-dist@6.4.299`, Apache-2.0, Node `>=22.13.0 || >=24`, with exact integrity and advisory review in [PDF policy evidence](pdf-policy-2026-10-04.md). `pnpm audit --audit-level=moderate` reported no known vulnerabilities.
- Verification: `pnpm verify:task -- T033` passed (multipart 2/2, ClamAV unit 3/3, real daemon 1/1, PDF inspection 7/7, PostgreSQL/Fastify upload integration 1/1); `pnpm verify:affected` passed (24 Vitest files/107 tests, typechecks, boundaries and Angular production build); `pnpm lint` passed with four warnings from the excluded untracked visual-prototype declaration file. Package metadata review passed.
- Acceptance: T033 remains `IN_PROGRESS`. The lexical scan is defense-in-depth and the parser/API combination is not proven to detect every active feature hidden in compressed object streams or every external viewer behavior. Portal/PBC freeze and cross-client authorization, T064 category-folder binding and live Graph cleanup acceptance also remain open. AC3 remains passed; AC1 and portal-dependent AC2 remain partial.

## Compressed catalog-action fixture — 2026-10-04

- Outcome: added a PDF 1.5 adversarial fixture with a Flate-compressed object stream, xref stream, and catalog `/OpenAction` containing JavaScript. The existing PDF.js inspection rejects it. A passive compressed catalog containing the word `JavaScript` remains accepted, guarding against treating compressed visible text as an action.
- Verification: `pnpm verify:task -- T033` passed on 2026-10-04 (server build, contracts/OpenAPI, multipart 2/2, ClamAV unit 3/3, real ClamAV 1/1, PDF inspection 8/8, PostgreSQL/Fastify upload integration 1/1). `pnpm verify:affected` passed on this exact tree: 25 Vitest files/114 tests, module boundaries, typechecks and Angular production build.
- Acceptance: the compressed catalog-action path is now directly covered. T033 remains `IN_PROGRESS`: this fixture does not prove full coverage of all compressed PDF structures or viewer-specific behavior. Portal/PBC freeze and cross-client authorization, T064 category-folder binding, live Graph staging-cleanup acceptance and remaining API acceptance remain open. No live provider operations or tenant configuration changed.

## Live Graph staging cleanup — 2026-10-04

- Scope: `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm test:m365:storage:live`, using only the preconfigured synthetic nonproduction SharePoint and OneDrive acceptance folders. The private file was read by the existing harness and never printed or committed.
- Result: 2/2 provider tests passed, 0 failed and 0 skipped. For each provider the test uploaded a unique synthetic stage file, decoded its exact version/etag/hash identity, called the guarded `deleteStaged` adapter (which rechecks folder, current version and accepted bytes before an If-Match recycle-bin delete), then verified that reading that version fails closed with provider 404. Repeated cleanup in `finally` is idempotent for an already-missing item. The test also retained existing version roundtrip, external-edit isolation, outside-folder 403 and cleanup checks.
- Evidence: redacted hashes, byte counts, run identifier and cleanup result are in [the dated provider record](m365-graph-cleanup-2026-10-04.json). Both generated synthetic files were recycled; `fixtureRetained` is false.
- Limitation: this validates the live Graph adapter deletion path, not the production maintenance worker with credentialed PostgreSQL state. T033 remains `IN_PROGRESS` for portal/PBC freeze and cross-client acceptance, T064 folder binding, complete hostile-file policy/viewer acceptance and remaining API acceptance. No tenant permissions, app registrations, credentials or client content changed.

## Live PostgreSQL upload-sweeper acceptance — 2026-10-04

- Command: `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm test:m365:upload-cleanup:live`.
- Result: 1/1 test passed, zero skips. The test created an isolated PostgreSQL 18.6 Testcontainers database, two synthetic engagements and exact evidence-repository bindings to the preconfigured acceptance folders, then wrote one uniquely named synthetic Graph stage per provider and aged only those new `StoredObject` rows past the grace period. The real `sweepUnreferencedUploads` function claimed both rows, verified and recycled both exact provider versions, marked both rows `CLEANED`, returned zero review-required outcomes, and subsequent reads failed closed. A `finally` cleanup is idempotent and also covers partial test failure.
- Evidence: redacted row outcomes, file hashes and byte counts are in [the dated live record](m365-upload-sweep-2026-10-04.json). No provider IDs, credentials, tokens or client/personal data are recorded; both test files were recycled.
- Limitations: this invokes the production sweeper function with real Graph against a fresh ephemeral database, not the long-running worker process, persistent development DB or production database. It proves neither backup/retention/legal-hold behavior nor portal freeze/cross-client authorization. T033 remains `IN_PROGRESS` for those and the remaining hostile-file/API acceptance items.

## Compressed indirect PDF actions — 2026-10-04

- Added synthetic PDF 1.5/xref-stream cases with a JavaScript `/OpenAction` and a URI Link annotation stored in Flate-compressed indirect objects. Both are rejected by the bounded PDF.js inspection worker; the passive compressed-catalog text control remains accepted.
- `pnpm verify:task -- T033`: PASS, exit 0; PDF inspection 9/9, multipart 2/2, ClamAV unit 3/3, real-daemon clean/EICAR 1/1, PostgreSQL/Fastify upload 1/1.
- Fixture, runtime, lockfile hash and evidence limitations are recorded in [the compressed indirect-object verification](pdf-compressed-indirect-2026-10-04.md). The earlier measured PDF-policy report remains unchanged.
- This verifies the added object-stream cases only; broader PDF grammar, malformed cross-reference and viewer behavior remain open. T033 remains `IN_PROGRESS` for portal/PBC authorization and other task acceptance gates.

## PDF parser resource-cap regression — 2026-10-04

Added real PDF.js worker fixtures that exceed the configured 500-page and 10,000-annotation limits. Both are rejected by the bounded inspection worker while the existing valid-passive, active-content, compressed-object and malformed-file controls remain green. The fixtures are synthetic and never reach ClamAV storage metadata or a provider in the end-to-end denied-content checks.

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T033` | Server build, contract/OpenAPI drift, multipart, ClamAV, PDF.js worker policy, PostgreSQL 18.6/Fastify upload API | Passed, exit 0; multipart 2/2, ClamAV unit 3/3, real daemon 1/1, PDF inspection 10/10, upload API/PostgreSQL 1/1 | 2026-10-04 local output |

T033 remains `IN_PROGRESS`: this strengthens the hostile-file bound evidence but does not prove every PDF grammar/viewer behavior, the portal/PBC upload-freeze boundary (T075), cross-client PBC completion, or the T064 category repository binding. No tenant, provider, database or live user permissions changed.

## Long-running worker cleanup recovery — 2026-10-04

The compiled `apps/worker/dist/main.js` now runs one cleanup pass at startup and repeats every ten minutes. Both fieldwork and Practice receipt sweepers still enforce their existing 60-minute grace periods and atomic database claims. Startup recovery means stale staging is not left behind until the first ten-minute timer after a worker restart.

The credentialed live acceptance started the actual worker process with an isolated PostgreSQL 18.6 database and digest-pinned Redis. It seeded two expired, uniquely named, nonproduction Graph stages in the designated SharePoint and OneDrive folders, then observed the worker transition both rows to `CLEANED`. Both provider reads failed closed afterward; there were zero `REVIEW_REQUIRED` rows. Redacted per-run hashes and limitations are recorded in [worker-process evidence](m365-upload-sweep-worker-2026-10-04.json).

`pnpm verify:task -- T033` passed after the worker change: server build, contracts/OpenAPI, multipart 2/2, ClamAV unit 3/3, live configured daemon clean/EICAR 1/1, PDF inspection 10/10, PostgreSQL/Fastify upload API 1/1. `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm test:m365:upload-cleanup:live` passed 1/1 against the isolated database, Redis and only the synthetic provider folders. Production-database operation, backups, retention and legal holds remain unverified. T033 remains open for the T075 portal/PBC upload-freeze path, T064 category folder binding, broader PDF grammar/viewer policy and remaining API acceptance.

## Addendum — workbook content type (D13, 2026-10-08)

The screened staff upload accepts `.xlsx` in the Trial Balance category, after the ClamAV scan and the ZIP preflight. The content type is checked by magic bytes (`PK`), extension and declared MIME, and PostgreSQL enforces it through migration `202610080003_document_upload_workbook_type`. Existing PDF and CSV behaviour is unchanged. Verified by `pnpm verify:task -- T033` (exit 0) and `tests/xlsx-document-upload.integration.ts`.
