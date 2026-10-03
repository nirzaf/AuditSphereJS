# T034 — Scoped document downloads and access receipts

## Identity

Task ID: T034
Requirement IDs: R006, R019, R052, R065, R067, R068
Implementing commits on `main`: `338eed9` (download implementation), `f69dfcc` (binary OpenAPI contract)
Status: DONE

## Intended and delivered outcome

An authenticated internal staff request streams only the requested immutable SharePoint/OneDrive version after a fresh active identity and engagement `ENGAGEMENT_READ` check. No provider URL, object reference, credential or redirect location is returned to the browser. Provider bytes are copied through a size/SHA-256 verifier into a private mode-0600 temporary file before HTTP response headers or bytes are sent. The response is attachment-only, `no-store`, `nosniff`, and includes content length, digest, immutable sequence and SHA-256 headers.

This endpoint does not yet serve client-portal downloads or report-release bundles; those records and their delivery workflow belong to later PBC/reporting tasks. A response-finished audit event means the server completed its HTTP response; it is not proof a human recipient received, opened or read the file.

## Files and contracts

- `packages/server/src/platform/graph-storage.ts`: streams the exact Graph version into a private destination while enforcing provider identity, repository folder, size and SHA-256. It repeats the current-item identity check after the current-version fallback.
- `packages/server/src/platform/storage.ts`: adds verified-to-file reads for Graph and local S3-compatible fixture storage.
- `packages/server/src/platform/document-downloads.ts`: resolves scoped metadata, requires current `ENGAGEMENT_READ`, stages verified bytes, sanitizes attachment names and records separate authorization/completion/abort/failure audit events against the exact version.
- `packages/server/src/platform/document-downloads-controller.ts`: implements `GET /api/v1/documents/:documentId/versions/:versionId/download`; response is a streamed attachment, never a provider URL.
- `apps/api/src/main.ts`, `packages/server/src/index.ts`: compose and export the route/service.
- `packages/contracts/openapi.json`: regenerated from the endpoint decorator.
- `apps/api/tests/document-download.integration.ts`: Testcontainers PostgreSQL and Fastify acceptance using a synthetic Graph adapter.
- `tests/live/m365-storage.acceptance.ts`: exercises the verified-to-file adapter against the designated real nonproduction SharePoint and OneDrive folders.
- `scripts/verify-task.mjs`, `package.json`: register `T034` and include its PostgreSQL route test in the full integration suite.
- Microsoft 365 readiness documents and redacted run evidence: record the provider-backed streaming check and its limitations.

No migration, shared transport-schema change or dependency change was needed. No generated source code was hand-edited.

## Dependency evidence

No dependency changes. Existing Node streams, filesystem, AWS SDK and Graph adapter are used.

## Decisions

- D02: portal release/download window remains bound to the approved archive deadline. This endpoint currently serves internal staff only and does not imply the later client-portal workflow is implemented.
- D12: each request requires an active internal identity, exact engagement membership and current scoped read grant. No role label alone authorizes a read.
- The endpoint issues no bearer-like short link. Expired authentication is rejected by the existing internal identity guard; grants are evaluated again on each HTTP request, so revoked access cannot reuse an earlier download URL. No short-link policy or reusable link token was introduced.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| `pnpm verify:task -- T034` | Server build plus PostgreSQL 18.6 / Fastify download endpoint, synthetic client and Graph bytes | Passed, 1 integration test / 1 assertion group, exit 0 | Local run, 2026-10-03 UTC; command output recorded in task execution |
| `pnpm verify:affected` | Import boundaries, server/test typechecks, Angular production build and Vitest suite | Passed, 22 files / 99 tests, exit 0 | Local run, 2026-10-03 UTC |
| `pnpm lint` | Repository ESLint and boundary checker | Passed, 0 errors; 4 existing unused-disable warnings remain under `visual-prototype-simulation/`, exit 0 | Local run, 2026-10-03 UTC |
| `pnpm openapi:generate` | API decorator-derived OpenAPI | Passed; tracked OpenAPI artifact updated | Local run, 2026-10-03 UTC |
| `pnpm contracts:check` | Canonical contracts and generated OpenAPI | Passed, schemas and OpenAPI match runtime, exit 0 | Local run, 2026-10-03 UTC |
| `node --import tsx --test apps/api/tests/contracts.integration.ts` | Generated OpenAPI media-type schemas, including binary document downloads | Passed, 1/1 test, exit 0 | Local run, 2026-10-04 UTC |
| `pnpm verify:affected` | Import boundaries, server/test typechecks, Angular production build and Vitest suite | Passed, 22 files / 99 tests, exit 0 | Local run, 2026-10-04 UTC |
| `pnpm verify:task -- T034` | Server build plus PostgreSQL 18.6 / Fastify download endpoint, synthetic client and Graph bytes | Passed, 1 integration test / 1 assertion group, exit 0 | Local run, 2026-10-04 UTC |
| `pnpm openapi:generate` and `pnpm contracts:check` | API decorator-derived OpenAPI and canonical contracts | Passed; binary response schema generated and checked, exit 0 | Local run, 2026-10-04 UTC |
| GitHub Actions run [37154389028](https://github.com/nirzaf/AuditSphereJS/actions/runs/37154389028) | Commit `f69dfcc`; full CI, Linux image/runtime smoke, and public web-asset job | Passed, all steps/jobs green | Hosted run, 2026-10-04 UTC |
| `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm verify:task -- T156` | Live current-version-to-private-file read in selected synthetic SharePoint and OneDrive folders, external edit, root denial and deletion fail-closed check | Passed, 2 tests / 0 failures / 0 skipped, exit 0 | Redacted [2026-10-04 run evidence](../T156/live-storage-2026-10-04-streaming.json); live credential remains private and ignored |
| `git diff --check` | Working-tree changes | Passed, exit 0 (Git reported only expected LF-to-CRLF checkout notices) | Local run, 2026-10-04 Riyadh time |

## Acceptance criteria

- AC1: a user scoped only to another client receives the same 404 as a missing document; the browser receives neither a download URL nor Graph reference. Missing version also returns 404.
- AC2: no short-lived or reusable bearer URL is issued. Every request authenticates and re-evaluates the current engagement read grant; test revokes the grant and confirms a subsequent request receives 404. Expired bearer rejection is covered by the existing identity guard, not a new download-specific token.
- AC3: `DOCUMENT_VERSION_DOWNLOAD_AUTHORIZED` and `DOCUMENT_VERSION_DOWNLOAD_RESPONSE_FINISHED` identify the exact `DocumentVersion` id and sequence. Corrupted provider bytes generate `DOCUMENT_VERSION_DOWNLOAD_FAILED` and a 500 before binary transfer. An interrupted HTTP response records `DOCUMENT_VERSION_DOWNLOAD_RESPONSE_ABORTED`.
- Provider content is streamed to a private spool and verified before sending. Live SharePoint and OneDrive storage checks exercise the actual adapter; the Fastify route test uses synthetic Graph responses. Live end-to-end API download against Microsoft Graph plus a production client repository remains unverified.
- The HTTP response completion event is transport evidence only; it does not certify recipient receipt. Portal download and final-package dispatch remain open in their owning task scopes.

## Recovery and authorization

The endpoint creates no durable artifact and makes no storage writes. Failed provider reads remove their private spool and return no file bytes. Successful and abandoned response spools are removed after the HTTP response finishes or closes. The Fastify integration asserts normal completion and the provider hash-failure path; a real client-aborted socket was not injected. Provider version metadata is append-only; no database repair or tenant/permission change was made. Live acceptance touched only uniquely named synthetic files in the two authorized test folders and removed those files.

## Review and next task

Reviewer: Codex evidence review
Review result: Implementation, authorization and failure-path tests, generated binary OpenAPI schema, provider adapter evidence, and full hosted CI were reviewed; all T034 acceptance criteria pass.
Open blockers: client-portal and report-release delivery are separate incomplete tasks; T156 remains partial for token expiry, consent revocation/recovery, throttling, retention and unknown provider outcomes.
Next eligible task by dependency order: T035, subject to its task prerequisites.
