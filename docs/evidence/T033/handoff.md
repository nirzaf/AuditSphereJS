# T033 — bounded upload sessions (partial handoff)

## Identity

Task ID: T033  
Requirement IDs: R020, R022, R041, R052  
Implementing commit/branch: uncommitted changes on `main`  
Status: IN_PROGRESS

## Intended and delivered outcome

Implemented a staff-only, short-lived upload-session flow for Fieldwork Execution. A session binds its authenticated staff actor, engagement scope, approved Fieldwork category, filename, declared content type/size, optional expected SHA-256, and expiry. The Fastify endpoint accepts one multipart file with a 15,000,000-byte bound. Only PDF and CSV are accepted; the service checks observed filename, MIME, size, signature/UTF-8, and digest before writing through the server-side storage adapter. Bytes are tracked as unreferenced `StoredObject` data first. A separate finalization transaction locks the engagement and upload session, rechecks `FIELDWORK_WRITE` and state, then creates the scoped `Document`/immutable `DocumentVersion`, marks the stored object referenced, finalizes the session, and appends an audit event. Same-actor finalization retries return the original result without adding another document. Initiated sessions that expire are marked EXPIRED by the existing cleanup worker; stale unreferenced local objects use the existing grace-period sweep.

This is not full T033 acceptance. Portal/PBC uploads are not available, so portal freeze cannot yet be proven. Fastify multipart now streams through a validating transform into a private mode-0600 temporary file, then streams that file to Graph or the S3-compatible provider; the service does not concatenate the whole upload in memory. Persisted `UPLOADING`/`PENDING`/`CLEANING` states and an atomic cleanup claim serialize finalization against stale-object cleanup. Graph cleanup verifies the generated file identity, selected client folder, current version, etag, byte length and SHA-256 before issuing Graph delete (recoverable recycle-bin behavior). Unsupported XLSX/XLSM content types are rejected before a session is stored; encrypted PDF detection, active-content inspection and malware scanning are not implemented.

## Files and contracts

- `prisma/schema.prisma`, `prisma/migrations/202610030010_document_upload_sessions/migration.sql`, and `prisma/migrations/202610030011_stored_object_cleanup_claims/migration.sql`: scoped session persistence, foreign keys, status/content/size checks, guarded transitions and recoverable cleanup claims.
- `packages/contracts/src/index.ts`, `packages/contracts/schema.json`, and `packages/contracts/openapi.json`: canonical initialization, session, receipt and finalize transport schemas and generated API description.
- `packages/server/src/platform/document-uploads.ts`, `document-uploads-controller.ts`, `storage.ts`, `graph-storage.ts`, and `modules/fieldwork/uploads.ts`: private disk spool, bounded streaming validation, provider stream, guarded finalize and claimed cleanup.
- `apps/api/src/main.ts`, `http-security.ts`, `security-controls.ts`, `apps/api/package.json`: route composition, Fastify multipart limits and the one permitted multipart request path.
- `apps/api/tests/multipart-plugin.integration.ts`, `apps/api/tests/document-upload.integration.ts`, `tests/graph-storage.test.ts`, `tests/upload-race.integration.ts`, `tests/security-hardening.test.ts`, `package.json`, `scripts/verify-task.mjs`: repeatable plugin, HTTP, Graph cleanup, race, PostgreSQL and transport policy tests/recipe.
- `docs/guides/03-library-register.md`, `docs/tasks/03-platform/T033-upload-pipeline.md`, and Fieldwork README: dependency and scope record.

## Dependency evidence

Added exact `@fastify/multipart@10.1.2` under `apps/api`; license is MIT and the dependency metadata gate passed. The package is exercised with the pinned Fastify `5.12.5` adapter. The 10.1.0 aborted-upload advisory and selected patched version are recorded in the library register and [multipart adapter evidence](multipart-adapter-2026-10-03.md). The prior hosted T017 run predates this lockfile change; full compatibility revalidation must run on the updated lockfile before the compatibility baseline is current again.

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
| `pnpm verify:affected` (final rerun) | Boundaries, server/tests typecheck, Angular production build and Vitest | Exit 0; 22 files, 99 tests passed; production web build emitted `dist/web` | Task-run output, 2026-10-03 |
| `pnpm exec eslint packages/server/src/platform/document-uploads.ts packages/server/src/platform/storage.ts packages/server/src/platform/graph-storage.ts packages/server/src/modules/fieldwork/uploads.ts packages/server/src/modules/fieldwork/service.ts tests/graph-storage.test.ts tests/upload-race.integration.ts apps/api/tests/document-upload.integration.ts` | Changed upload, storage and integration-test files | Exit 0 | Task-run output, 2026-10-03 |
| `pnpm db:migrate` | Local development PostgreSQL schema only; preserves existing rows | Exit 0; applied additive `202610030011_stored_object_cleanup_claims` | Prisma migration output, 2026-10-03 |

## Acceptance criteria

- **AC1 — OPEN:** Internal staff finalize rechecks authorization and `FIELDWORK_EXECUTION` state after bytes arrive. The portal/PBC client identity, membership and upload freeze model is absent; therefore the required client portal freeze scenario is not implemented or claimed.
- **AC2 — PARTIAL:** MIME spoof, mismatched size, nonmember initiation/session ownership and Fastify oversize limits are denied. Cross-client portal upload completion is not implemented/tested because PBC requests own that authorization boundary.
- **AC3 — PARTIAL:** An interrupted INITIATED session creates no `Document` or `DocumentVersion`; finalization locks and verifies the `StoredObject` row and cleanup state. Aged unreferenced stages are claimed and cleaned, including safe Graph recycle-bin cleanup; direct provider failure injection and live Graph cleanup acceptance remain open.

## Recovery and authorization

The migration is additive. No production database was changed; integration tests apply the ordered migration chain to disposable PostgreSQL 18.6 containers. Provider writes are external to the finalization transaction; unreferenced writes are tracked before storage I/O. Production Graph deletion is not automated. No merge, deployment, tenant permission change or provider cleanup was performed.

## Review and next task

Reviewer: pending independent review.  
Review result: T033 remains IN_PROGRESS.  
Open blockers: portal/PBC upload authorization and freeze recheck (PBC task T075); T064 category folder bindings; encrypted/active content inspection and malware scanning; live Graph staging-cleanup acceptance; direct provider failure injection; complete negative-path/API acceptance; repeat T017 hosted compatibility check with the changed lockfile.
Next eligible task: continue T033 until these criteria are implemented or an approved dependency boundary assigns portal uploads to T075 with an explicit task-pack correction.
