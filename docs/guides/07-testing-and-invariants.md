# Verification strategy and mandatory invariants

Run focused tests while editing and the full relevant gate before merge/release. Use PostgreSQL for decimal constraints, row locks, RLS if selected and transaction races; SQLite is not a substitute. Use actual Redis and the real target driver/adapter for queue and lease claims. Browser tests cover keyboard, multi-row selection, conflict handling and authorization, not just screenshots.

## Minimal useful layers

Pure calculation/state tests cover approved golden examples. Compiled Nest/Fastify tests cover DI, runtime schemas, authorization and HTTP results. Real-service tests cover database constraints, concurrent transactions, Redis and storage. Angular component tests use its supported builder. Playwright exercises complete role-separated user journeys and both failed and successful paths.

## Required invariant register

| ID | Invariant | What must be demonstrated | Owner tasks |
| :--- | :--- | :--- | :--- |
| INV-01 | Dual-key letter gate | No letter generation until commercial acceptance and the canonical partner risk sign-off both exist. | [T063](../tasks/05-commercial/T063-dual-key.md), [T065](../tasks/05-commercial/T065-letter.md) |
| INV-02 | Payment and portal gate | Both keys and cleared required advance must precede client activation; first reset still gates submission. | [T070](../tasks/06-billing-portal/T070-advance-billing.md), [T071](../tasks/06-billing-portal/T071-payments.md), [T073](../tasks/06-billing-portal/T073-portal-activation.md), [T020](../tasks/02-security/T020-portal-auth.md) |
| INV-03 | Scoped authority | A role or a valid foreign resource UUID does not grant client/engagement authority; preparer cannot dispatch externally. | [T021](../tasks/02-security/T021-authorization.md), [T158](../tasks/14-production/T158-security-review.md) |
| INV-04 | Exact financial values | Money/percent inputs are bounded decimals and exact across DB/API; approved rounding/zero behavior is preserved. | [T023](../tasks/02-security/T023-money-clock.md), [T086](../tasks/07-planning/T086-materiality-calculator.md) |
| INV-05 | Materiality lineage | Fieldwork uses the specifically approved planning/TB/materiality versions; edits cannot silently retain stale sign-off. | [T088](../tasks/07-planning/T088-planning-approval.md), [T089](../tasks/07-planning/T089-planning-change-impact.md) |
| INV-06 | Atomic batch conflict | One stale row prevents an all-or-nothing mapping batch from partially applying; retries do not duplicate changes. | [T049](../tasks/04-tb-proof/T049-batch-mapping.md) |
| INV-07 | Edit lease ownership | Only the holder may renew/release a lease; expiry never authorizes overwriting a newer DB version. | [T039](../tasks/03-platform/T039-leases.md), [T049](../tasks/04-tb-proof/T049-batch-mapping.md) |
| INV-08 | Import provenance | Reimports and formula handling never silently rewrite raw source values, confirmed mappings or historical finalization. | [T079](../tasks/07-planning/T079-tb-validation.md), [T081](../tasks/07-planning/T081-tb-finalize.md) |
| INV-09 | Review segregation | Submission/return/review enforce distinct responsibilities; return requires comments and approval targets an exact revision. | [T106](../tasks/08-fieldwork/T106-submit-workprogram.md), [T108](../tasks/09-review/T108-review-notes.md), [T109](../tasks/09-review/T109-rework.md), [T110](../tasks/09-review/T110-manager-clearance.md) |
| INV-10 | Sampling reproducibility | Approved method/parameters/population/seed can reproduce the selected items; unsupported cases block rather than guess. | [T098](../tasks/08-fieldwork/T098-sampling-population.md), [T099](../tasks/08-fieldwork/T099-sampling-mus.md), [T100](../tasks/08-fieldwork/T100-sampling-systematic.md), [T101](../tasks/08-fieldwork/T101-sampling-stratified.md) |
| INV-11 | Critical confirmations | Any critical unreturned required confirmation blocks release and produces one controlled holding-letter operation. | [T113](../tasks/09-review/T113-holding-letters.md), [T116](../tasks/09-review/T116-partner-clearance.md), [T128](../tasks/10-reporting/T128-bundle-validation.md) |
| INV-12 | Opinion authority and basis | Only assigned partner selects final opinion; modified type requires approved affected-FSLI/rationale rules. | [T118](../tasks/10-reporting/T118-opinion.md), [T120](../tasks/10-reporting/T120-report-basis.md) |
| INV-13 | Signed LOR and report | Approved signed-return policy and credential assurance are met before release; PNG appearance is not cryptographic proof. | [T123](../tasks/10-reporting/T123-lor-return.md), [T126](../tasks/10-reporting/T126-signing.md), [T128](../tasks/10-reporting/T128-bundle-validation.md) |
| INV-14 | Five-part release | All exact artifacts, approved evidence revisions and canonical fee note must validate before atomic release/freeze. | [T127](../tasks/10-reporting/T127-bundle-build.md), [T128](../tasks/10-reporting/T128-bundle-validation.md), [T129](../tasks/10-reporting/T129-release.md) |
| INV-15 | Upload freeze race | A presigned URL issued before freeze cannot attach new evidence afterward; finalize rechecks in the release barrier. | [T033](../tasks/03-platform/T033-upload-pipeline.md), [T075](../tasks/06-billing-portal/T075-pbc-upload.md), [T129](../tasks/10-reporting/T129-release.md) |
| INV-16 | Archive deadline | API/job writes stop at deadline or early lock even if external sealing fails; sealed state is not set prematurely. | [T131](../tasks/11-archive/T131-archive-deadline.md), [T134](../tasks/11-archive/T134-archive-seal.md), [T135](../tasks/11-archive/T135-early-lock.md) |
| INV-17 | Full-file archive | Manifest covers planning, raw TB, workpapers, evidence, approvals and final artifacts with exact object versions. | [T132](../tasks/11-archive/T132-archive-manifest.md), [T136](../tasks/11-archive/T136-archive-export.md), [T138](../tasks/11-archive/T138-archive-drill.md) |
| INV-18 | Append-only audit | Application identity cannot update/delete/truncate audit data; hash chain verifies under concurrent append. | [T025](../tasks/02-security/T025-audit-write.md), [T026](../tasks/02-security/T026-audit-chain.md) |
| INV-19 | True journal balance | Draft line changes/posting lock the journal; sums of lines balance and become immutable when posted. | [T067](../tasks/06-billing-portal/T067-journals.md), [T068](../tasks/06-billing-portal/T068-reversals.md) |
| INV-20 | Single billing source | One canonical milestone invoice/payment allocation drives AR and journals; retries cannot duplicate fee notes or receipts. | [T069](../tasks/06-billing-portal/T069-invoice-foundation.md), [T071](../tasks/06-billing-portal/T071-payments.md), [T125](../tasks/10-reporting/T125-final-fee.md), [T147](../tasks/12-practice/T147-ar-aging.md) |
| INV-21 | Rate snapshots | Historical time value does not change with a future rate; source charge-out margin is not relabeled actual ledger profit. | [T139](../tasks/12-practice/T139-rate-cards.md), [T140](../tasks/12-practice/T140-timesheets.md), [T143](../tasks/12-practice/T143-realization.md) |
| INV-22 | Durable operation recovery | Redis loss, process kill and enqueue gaps do not lose required intent or imply provider exactly-once delivery. | [T030](../tasks/03-platform/T030-outbox.md), [T031](../tasks/03-platform/T031-queue-runtime.md), [T160](../tasks/14-production/T160-failure-drills.md) |
| INV-23 | Realtime privacy | Room joins and broadcasts are scoped; client reconnection reloads current state and revocation is enforced. | [T038](../tasks/03-platform/T038-realtime.md), [T158](../tasks/14-production/T158-security-review.md) |
| INV-24 | Recoverable release | Restore preserves DB-object hash/version links, financial reconciliation and archive protection. | [T162](../tasks/14-production/T162-backup-restore.md), [T166](../tasks/14-production/T166-rolling-deploy.md) |

## Race-test protocol

Use independent database connections/principals and a deterministic barrier to arrange the conflicting operations. Assert both the HTTP/job outcomes and final rows/events. Do not simulate concurrency by calling two functions serially. Required pairs include batch edit/edit, TB finalize/remap, approval/child edit, journal posting/line change, release/upload finalize, archive deadline/background processor and double payment submit.

## Adverse fixtures

Keep missing/foreign resource IDs, wrong token audience, malformed decimal, huge body, zero/negative bases, duplicate CSV codes, XLSX formula cells, oversized compressed workbook, truncated upload, missing confirmation, unreturned signed LOR, failed signer, missing object version and unknown email result. Fixtures should be synthetic and contain no real client evidence.

## Evidence fields

Every gate records commit, lockfile hash, OS/CPU, image digest, relevant provider configuration without secrets, fixture identity, command, exit status, discovered test count, assertions and timings where applicable. A passed unit test does not certify provider retention, identity consent or load capacity. If a provider is not available, state BLOCKED rather than pass a mock as production proof.

## Regression scope

Tests must remain proportional. Reuse existing relevant suites. Avoid adding an entire abstraction or new runner for one regression. A feature with security/financial/concurrency changes must retain its negative tests even when a faster hotfix path is used.
