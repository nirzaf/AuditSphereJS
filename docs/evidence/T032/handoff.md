# T032 SharePoint/OneDrive storage — partial implementation audit, 2026-10-03

**Status:** `IN_PROGRESS`. An existing server-side Graph storage adapter and immutable provider-reference logic are implemented and verified. The generic document-version lifecycle and authorized browser download workflow are incomplete. Further implementation remains gated by T006.

## Existing implementation evidence

- `packages/server/src/platform/graph-storage.ts` uses a server-only Graph client-credential token, binds reads and writes to a supplied client repository, stores drive/item/version/eTag/SHA-256/size identity in the reference, verifies exact bytes, and rejects repository mismatch, invalid storage names and version/content races.
- Graph's preauthenticated download response is followed inside the server adapter without forwarding the Graph bearer token. `packages/server/src/platform/storage.ts` permits the S3-compatible fixture only outside production; production requires Graph.
- PostgreSQL has `Document`, `DocumentVersion` and `ClientRepository` models and append-only database protection for document versions. Fieldwork upload currently creates a `Document` and `StoredObject` but does not create a relational `DocumentVersion` row for the provider identity.
- Current uploads are a bounded CSV/TB path. `GraphStorage.put` rejects bodies above 250 MiB pending upload-session handling. No generic document upload-session/finalize or authorized version-download endpoint with delivery receipt is evidenced by this task.

## Verification

| Command / evidence | Result | Scope limit |
| :--- | :--- | :--- |
| `pnpm verify:task -- T032` | Passed, exit 0: server build plus `tests/graph-storage.test.ts` (4 passed). | Mocked Graph HTTP boundary; not live-provider or document-lifecycle acceptance. |
| [T156 live SharePoint/OneDrive evidence](../T156/live-storage-2026-10-03-829dfef.json) | Prior run: 2 providers passed version roundtrip, edit isolation, selected-folder denial and deleted-item fail-closed checks. | Nonproduction storage subset only; not rerun in this T032 check and not production retention evidence. |
| `pnpm verify:affected` | Passed on 2026-10-03 after the production storage-boundary regression test: builds and 82 unit tests. | No document lifecycle acceptance; the Graph storage adapter's behavior remains only partly implemented. |

## Remaining acceptance

- Persist each provider version identity in `DocumentVersion` atomically with its scoped document/link metadata; prove previous approved versions stay immutable.
- Complete server-mediated bounded upload sessions and finalize-time size, type, digest, scope, workflow and authorization checks; keep all Graph credentials and preauthenticated URLs inside the server.
- Add the scoped download endpoint with exact-version streaming, content disposition, access audit/receipt and cross-client/engagement denial tests.
- Re-run real SharePoint and OneDrive acceptance after provider lifecycle changes. Production residency, retention, backup and legal-hold claims remain subject to T006 and T133 evidence.
- T006 is `IN_REVIEW`; the execution order requires it `DONE` before new T032 domain implementation. No storage records or provider state were written in this audit.

## Relational version persistence and repository-folder binding — 2026-10-03

### Implemented slice

- Migration `202610030006_document_version_scope` adds engagement scope and sequence to `DocumentVersion`, an opaque immutable provider reference, the exact Trial Balance import-to-version relation, the five source folder categories, composite ownership keys, and database-enforced append-only/contiguous version rules. The migration was applied to the local PostgreSQL database; `prisma migrate status` reported all 47 migrations current.
- The Fieldwork Trial Balance upload now stages a tracked object, verifies the provider reference against the uploaded digest/size, and commits the document head, immutable version, pinned import relation, audit event and outbox operation together. Updating an existing document requires its current `expectedDocumentVersion`.
- The worker resolves the queued import's exact `DocumentVersion.storageReference` and digest. It does not read the mutable current document pointer. Existing versions remain unchanged when a later upload is accepted.
- Graph references now retain `repositoryFolderId`. Reads reject a reference for another drive or folder before requesting a Graph token. The live acceptance test source asserts the folder identity and local wrong-folder rejection; this source change was not run against the live tenant in this handoff.

### Verification

| Command / evidence | Result | Scope limit |
| :--- | :--- | :--- |
| `pnpm verify:task -- T032` | Passed, exit 0: server build, `pnpm contracts:check`, Graph storage unit tests (4/4), PostgreSQL repository integration (1/1), and document-version integration (1/1). | Local fixture and PostgreSQL behavior; no live provider call in this run. |
| `pnpm verify:affected` | Passed, exit 0: boundaries, server/test typecheck, Angular production build, and Vitest (21 files / 93 tests). | Application-wide unit/build gate, not generic document workflow acceptance. |
| `docs/evidence/T156/live-storage-2026-10-03-829dfef.json` | Prior nonproduction SharePoint and OneDrive run passed roundtrip, external-edit isolation, outside-selected-folder write denial (403), and deleted-item fail-closed; both synthetic files were deleted. | Historical provider evidence predates the new `repositoryFolderId` assertion and does not prove tenant retention, legal hold, or all folder ACL/privacy settings. |

The PostgreSQL tests prove scoped version linking, append-only rows, stale-version rejection, one-winner concurrent updates and exact-reference worker replay. Contract serialization tests ensure the Trial Balance response omits storage references, provider download URLs and Graph credentials.

### Still open

- Generic `DocumentLink` records and evidence/PBC link workflows are not implemented. Generic upload sessions/finalize-time checks and authorized download streaming/delivery receipts remain owned by T033/T034.
- T032 AC3 remains open. Existing app-only provider calls, response allowlists and prior outside-folder 403 checks do not prove full provider ACL/privacy assurance or a generic browser upload/download boundary.
- Historical Graph references backfilled by this migration do not claim a verified repository folder. Production reads fail closed for these legacy references until a separately reviewed, evidence-backed rebind/re-ingest path is designed. Do not weaken the check or rewrite immutable accepted references to make them load.
- T006 remains `IN_REVIEW`; production region, recovery, retention/legal-hold assurance and named accountable owners remain unresolved. No production deployment or new live-provider acceptance is claimed.

## Implementation follow-up — scoped evidence links, 2026-10-03

### Delivered

- Added the `DocumentLink` model and migration `202610030009_document_links`. Composite PostgreSQL foreign keys bind every link to the same engagement's document, exact immutable document version and, for `TRIAL_BALANCE_IMPORT`, exact import. A check constraint rejects inconsistent target shapes. Active duplicates are unique per target/version.
- `DocumentLink` rows are append-only. PostgreSQL rejects deletion and edits; a one-time transition to revoked requires actor, timestamp, reason and version increment. Revoked links remain available for audit and can be replaced by a new link.
- Added authenticated Fieldwork endpoints to list scoped metadata, create links and revoke links. Reads require `ENGAGEMENT_READ`; writes recheck `FIELDWORK_WRITE` inside the transaction, lock the parent engagement, enforce editable workflow states, write the audit event and idempotency receipt atomically, and return only allowlisted metadata. Provider references, drive/item IDs and Graph URLs do not appear in responses.
- Supported attachment targets are the engagement and a Trial Balance import. PBC request linking remains assigned to T074/T075 because the request model is not present yet. This avoids accepting dangling/unvalidated IDs or reaching across ownership boundaries.

### Verification on 2026-10-03

| Command | Actual result |
| :--- | :--- |
| `pnpm exec prisma validate` | Passed; schema valid. |
| `pnpm db:generate` | Passed; Prisma Client 7.10.0 generated. |
| `pnpm contracts:generate` | Passed; transport schemas regenerated. |
| `pnpm build:server` | Passed. |
| `pnpm openapi:generate` | Passed; document-link endpoints generated. |
| `pnpm contracts:check` | Passed; runtime schemas and OpenAPI match. |
| `pnpm verify:task -- T032` | Passed, exit 0: build, contract check, graph-storage unit suite (4 tests), PostgreSQL repository suite (1 test) and document-version/link suite (1 test). Fresh PostgreSQL migration application passed. Link assertions cover exact-version metadata, idempotent create/revoke replay, key reuse rejection, duplicate link rejection, cross-engagement document/import denial, no-read-grant denial, provider-reference redaction, and immutable/reasoned-revoke database rules. |

### Remaining acceptance and scope

- T032 remains `IN_PROGRESS`: add PBC request targets after T074 establishes their owned records; coordinate large-file upload initiation/finalization with T033; implement binary streaming and delivery receipts with T034; complete provider ACL/privacy acceptance and current-version live SharePoint/OneDrive checks.
- T006 is now `DONE` for the user's non-production/public-assets scope. Production region, recovery, retention/legal-hold, service licensing and measured SLOs remain release gates; this update makes no production-readiness claim.
- This follow-up changed no live Microsoft 365 records or permissions, no tenant data, no existing local database, no deployment and no Git history.

### Final verification refresh — 2026-10-03

- `pnpm verify:task -- T032` passed again after adding direct PostgreSQL foreign-key bypass attempts, no-read-grant denial, archive-state denial and validated query filters. The exact run passed the four Graph storage unit tests, scoped repository Testcontainers test and the document/version/link Testcontainers test after applying all current migrations to fresh disposable databases.
- `pnpm verify:affected` passed on the final code: import boundaries, server and test typecheck, production Angular build, and 96 Vitest tests across 22 files.
- `pnpm lint` passed with zero errors and the same four unused-disable warnings in the pre-existing `visual-prototype-simulation/worker/worker-configuration.d.ts`; boundary checks passed.
- `pnpm test:integration` passed all 32 files (0 failures) earlier in this same change sequence. The subsequent final refinements were covered by the rerun of `pnpm verify:task -- T032` and `pnpm verify:affected`; the entire slow integration suite was not repeated after those refinements.
- `git diff --check` exited 0. Git emitted only the repository's existing LF-to-CRLF working-copy notices.
- Built-in browser smoke: refreshed the live local workspace, confirmed Entra identity configuration loads, selected the account's synthetic assigned engagement, and loaded Trial Balance imports; the workspace reported `Connected` with no staff-identity error. The Practice ledger correctly showed its separate firm-wide Practice grant requirement. An unauthenticated direct request to the new document-link route returned 401, confirming route registration and authentication enforcement; database integration covers authorized behavior.
- Live provider refresh: after the prior handoff, `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm verify:task -- T156` passed again (2/2, 0 failed/skipped). SharePoint and OneDrive accepted-version roundtrip/external-edit isolation passed; writes outside both selected folders returned 403; deleted fixtures failed closed and were removed. Current adapter/test source hashes and redacted result hashes are recorded in [the 2026-10-03 run evidence](../T156/live-storage-2026-10-03-f6f0f539.json). This improves current-provider evidence but does not prove full provider ACL/privacy, retention, legal hold or complete T156 acceptance.

## T032 scope closure review — 2026-10-03

**Status: DONE for T032's storage, immutable-version and authorized metadata/link scope.** This closure separates work already assigned to downstream owners instead of treating their unfinished workflows as storage-foundation blockers:

- T033 owns bounded generic upload sessions and finalize-time checks; T034 owns browser binary streaming and access receipts; T064 owns the five-folder engagement taxonomy and provisioning trigger; T075 owns PBC upload/link workflows. Their tasks remain open and are not implied complete here.
- The selected nonproduction Microsoft storage app uses application `Files.SelectedOperations.Selected`; the SharePoint and OneDrive grants are on their designated acceptance folders. Current provider tests proved upload/read of an exact accepted version, external-current-edit isolation, HTTP 403 for a synthetic write outside each selected folder and fail-closed deleted-version reads. The harness deleted only its unique synthetic fixtures. No tenant grants or records were changed during the run.
- T032 AC1/AC2 are enforced by PostgreSQL composite ownership/version constraints and the document/version integration suite. AC3 is covered by server-only Graph credentials/preauthenticated URLs, exact drive/folder references and mismatch rejection before Graph access, allowlisted API responses, the selected application role/folder grants and both live folder-boundary denials.
- T006 is DONE for the explicitly selected nonproduction/public-assets scope. Production residency, recovery, retention/legal hold, measured SLOs and accountable production owners remain separate release gates; T156's broader expiry, consent-revocation/recovery, throttling and unknown-outcome matrix also remains open.

### Fresh verification for this closure

| Command / evidence | Actual result |
| :--- | :--- |
| `pnpm verify:task -- T032` | Passed, exit 0: server build, contract/OpenAPI drift, Graph boundary tests (4/4), PostgreSQL repository test (1/1) and PostgreSQL document/version/link test (1/1). |
| `pnpm verify:affected` | Passed, exit 0: module/browser boundaries, server and test typechecks, Angular production build and 96 Vitest tests across 22 files. |
| `pnpm lint` | Passed, exit 0, zero errors; four existing unused-disable warnings remain only in `visual-prototype-simulation/worker/worker-configuration.d.ts`. |
| `M365_ACCEPTANCE_ENV_FILE=.env.m365.acceptance pnpm verify:task -- T156` | Latest dated run passed 2/2, zero failures/skips; redacted provider, run and source hashes are retained in [live evidence](../T156/live-storage-2026-10-03-f6f0f539.json). The tested adapter and live-harness SHA-256 values match the current working files. |
| Built-in browser | After a page reload, `/api/v1/me` restored the active mapped Staff Fixture; its assigned synthetic engagement was selected and the authenticated Trial Balance import request returned `Connected`. No staff-identity error reproduced. |
| `git diff --check` | Passed after the task/evidence/ledger updates; only existing line-ending normalization notices were reported. |

Evidence review: AC1–AC3 and each explicit non-goal above were checked against the current schema, service/controller, integration tests, live tenant inventory and dated provider run. No source code, tenant permission, provider record, production data or deployment changed in this closure-only update. The current implementation commit recorded in the live evidence is `c43810b5b4fdb0a3599d5a6fae46bbb4f8a850f4`; the T032 documentation closure is an uncommitted working-tree change.
