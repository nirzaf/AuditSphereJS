# T033 — bounded upload sessions (partial handoff)

## Identity

Task ID: T033  
Requirement IDs: R020, R022, R041, R052  
Implementing commits on `main`: prior upload implementation; malware-scanning follow-up `caf8aa7`
Status: IN_PROGRESS

## Intended and delivered outcome

Implemented a staff-only, short-lived upload-session flow for Fieldwork Execution. A session binds its authenticated staff actor, engagement scope, approved Fieldwork category, filename, declared content type/size, optional expected SHA-256, and expiry. The Fastify endpoint accepts one multipart file with a 15,000,000-byte bound. Only PDF and CSV are accepted; the service checks observed filename, MIME, size, signature/UTF-8, and digest, then streams the private spool through ClamAV before writing through the server-side storage adapter. Detected malware and scanner outages fail the session before a storage row or provider write. Bytes that pass scanning are tracked as unreferenced `StoredObject` data first. A separate finalization transaction locks the engagement and upload session, rechecks `FIELDWORK_WRITE` and state, then creates the scoped `Document`/immutable `DocumentVersion`, marks the stored object referenced, finalizes the session, and appends an audit event. Same-actor finalization retries return the original result without adding another document. Initiated sessions that expire are marked EXPIRED by the existing cleanup worker; stale unreferenced local objects use the existing grace-period sweep.

This is not full T033 acceptance. Portal/PBC uploads are not available, so portal freeze cannot yet be proven. Fastify multipart streams through a validating transform into a private mode-0600 temporary file; ClamAV reads bounded 64 KiB frames from disk, then the service streams the same file to Graph or the S3-compatible provider without assembling the upload in memory. Persisted `UPLOADING`/`PENDING`/`CLEANING` states and an atomic cleanup claim serialize finalization against stale-object cleanup. Graph cleanup verifies the generated file identity, selected client folder, current version, etag, byte length and SHA-256 before issuing Graph delete (recoverable recycle-bin behavior). Unsupported XLSX/XLSM content types are rejected before a session is stored; encrypted PDF detection and active-content inspection remain unimplemented. ClamAV signature scanning is not a guarantee that a file is safe.

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
| `pnpm verify:affected` (final rerun) | Boundaries, server/tests typecheck, Angular production build and Vitest | Exit 0; 22 files, 99 tests passed; production web build emitted `dist/web` | Task-run output, 2026-10-03 |
| `pnpm exec eslint packages/server/src/platform/document-uploads.ts packages/server/src/platform/storage.ts packages/server/src/platform/graph-storage.ts packages/server/src/modules/fieldwork/uploads.ts packages/server/src/modules/fieldwork/service.ts tests/graph-storage.test.ts tests/upload-race.integration.ts apps/api/tests/document-upload.integration.ts` | Changed upload, storage and integration-test files | Exit 0 | Task-run output, 2026-10-03 |
| `pnpm db:migrate` | Local development PostgreSQL schema only; preserves existing rows | Exit 0; applied additive `202610030011_stored_object_cleanup_claims` | Prisma migration output, 2026-10-03 |

## Acceptance criteria

- **AC1 — OPEN:** Internal staff finalize rechecks authorization and `FIELDWORK_EXECUTION` state after bytes arrive. The portal/PBC client identity, membership and upload freeze model is absent; therefore the required client portal freeze scenario is not implemented or claimed.
- **AC2 — PARTIAL:** MIME spoof, mismatched size, nonmember initiation/session ownership and Fastify oversize limits are denied. Cross-client portal upload completion is not implemented/tested because PBC requests own that authorization boundary.
- **AC3 — PASS:** An interrupted INITIATED session and an injected Graph 503 create no `Document` or `DocumentVersion`. The provider rejection marks the session failed and preserves the `UPLOADING` object row for the grace-period cleanup/reconciliation path. Finalization locks and verifies the `StoredObject` row and cleanup state. Live Graph cleanup acceptance remains open.

## Recovery and authorization

The migration is additive. No production database was changed; integration tests apply the ordered migration chain to disposable PostgreSQL 18.6 containers. Provider writes are external to the finalization transaction; unreferenced writes are tracked before storage I/O. Production Graph deletion is not automated. No merge, deployment, tenant permission change or provider cleanup was performed.

## Review and next task

Reviewer: pending independent review.  
Review result: T033 remains IN_PROGRESS.  
Open blockers: portal/PBC upload authorization and freeze recheck (PBC task T075); T064 category folder bindings; encrypted/active content inspection and malware scanning; live Graph staging-cleanup acceptance; remaining negative-path/API acceptance. The updated lockfile compatibility check passed locally; hosted CI remains the per-push verification.
Next eligible task: continue T033 until these criteria are implemented or an approved dependency boundary assigns portal uploads to T075 with an explicit task-pack correction.

## ClamAV upload screening follow-up — 2026-10-03 22:34 UTC (2026-10-04 Asia/Riyadh)

- Outcome: a digest-pinned ClamAV 1.5.4 daemon now screens the private upload spool using bounded 64 KiB `INSTREAM` frames before `StoredObject` metadata or Graph/S3 provider writes. NUL-terminated replies are parsed without waiting for daemon socket closure. A signature detection marks the session `FAILED` and returns a client error; scanner connection/protocol/timeouts mark it `FAILED` and return service unavailable. Both paths fail closed.
- Runtime/configuration: Compose binds daemon TCP 3310 to host loopback only for local development. `.env.example` uses `127.0.0.1:3310`; production sample uses private Compose DNS `clamav:3310`, and production config requires explicit endpoint variables. The daemon container carries its own signature database; its healthcheck reports clamd readiness. The ClamAV image is GPLv2 and remains a separate service image, not copied into the application image. Network confidentiality/private routing and production resource sizing must be validated for the eventual hosting platform.
- Added/updated paths: `packages/server/src/platform/clamav.ts`, `document-uploads.ts`, `config.ts`, `docker-compose.yml`, `.env.example`, `.env.production.example`, `tests/clamav.integration.ts`, `packages/server/tests/clamav.test.ts`, `apps/api/tests/document-upload.integration.ts`, `package.json`, `scripts/verify-task.mjs`, compatibility/library guides, Fieldwork README, task text and implementation status.
- Tests: Vitest adapter tests exercise exact `zINSTREAM` request framing, multiple bounded chunks, clean NUL response, malware response and unavailable endpoint. The real daemon test scans benign content and the exact 68-byte EICAR marker. The PostgreSQL 18.6/Testcontainers upload test injects a scanner stub and proves a positive result fails the session with no `StoredObject`, `Document`, `DocumentVersion` or Graph write; an unavailable scanner also fails before storage. EICAR fixture reference: [EICAR test file specification](https://www.eicar.org/download-anti-malware-testfile/).
- Verification, executed 2026-10-03 22:34 UTC: `docker compose up -d --wait clamav` reported `Healthy`; `pnpm verify:task -- T033` passed (server build, contracts/OpenAPI drift, multipart 2/2, scanner unit 3/3, real ClamAV 1/1, PostgreSQL upload integration 1/1); `pnpm verify:affected` passed (boundaries, typechecks, Angular production build, Vitest 23 files/102 tests); `pnpm lint` passed with four existing unused-disable warnings in the excluded untracked visual-prototype declaration file; `docker compose config --quiet`, `git diff --check` and package JSON parse passed.
- Acceptance status: malware signature screening is implemented and tested but the combined hostile-file policy item remains open because encrypted-PDF rejection and active-content inspection are not implemented. ClamAV is a signature screening layer, not a guarantee that files are safe. AC1/AC2 remain partial for missing PBC/portal freeze ownership; AC3 remains passed. No live SharePoint/OneDrive upload or cleanup action, tenant permission, database migration or production system changed in this follow-up.
