# Task execution ledger

**Initial state:** no task is implemented. Update this file in the working repository as each task is reviewed. Evidence links should point to actual commits, test artifacts and decision approvals. Do not change a task to DONE because it was planned or a file was generated.

| ID | Task | Class | Status | Implementation/test evidence | Reviewer / decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T001 | [Preserve the requirements and inspect the implementation starting point](../tasks/00-readiness/T001-baseline.md) | GATE | NOT_STARTED | — | — |
| T002 | [Resolve workflow and billing ambiguities without changing the source silently](../tasks/00-readiness/T002-business-decisions.md) | GATE | NOT_STARTED | — | — |
| T003 | [Approve numerical, sampling and professional-judgment specifications](../tasks/00-readiness/T003-methodology-decisions.md) | GATE | NOT_STARTED | — | — |
| T004 | [Approve signature, archival and engagement-type policies](../tasks/00-readiness/T004-records-decisions.md) | GATE | NOT_STARTED | — | — |
| T005 | [Review every direct dependency and reconcile version evidence](../tasks/00-readiness/T005-dependency-review.md) | GATE | NOT_STARTED | — | — |
| T006 | [Select deployment targets, storage and external-provider boundaries](../tasks/00-readiness/T006-deployment-decisions.md) | GATE | NOT_STARTED | — | — |
| T007 | [Create a minimal pnpm workspace with explicit package ownership](../tasks/01-foundation/T007-workspace.md) | CORE | NOT_STARTED | — | — |
| T008 | [Make backend ESM builds and decorator injection testable](../tasks/01-foundation/T008-esm.md) | CORE | NOT_STARTED | — | — |
| T009 | [Bootstrap NestJS with the matched Fastify adapter](../tasks/01-foundation/T009-api-shell.md) | CORE | NOT_STARTED | — | — |
| T010 | [Create the Angular standalone shell and accessible layouts](../tasks/01-foundation/T010-angular-shell.md) | CORE | NOT_STARTED | — | — |
| T011 | [Configure Prisma and PostgreSQL with explicit pool limits](../tasks/01-foundation/T011-database.md) | CORE | NOT_STARTED | — | — |
| T012 | [Add typed configuration and secret-safe environment separation](../tasks/01-foundation/T012-configuration.md) | CORE | NOT_STARTED | — | — |
| T013 | [Provision reproducible local data services and test containers](../tasks/01-foundation/T013-local-services.md) | CORE | NOT_STARTED | — | — |
| T014 | [Wire minimal backend, Angular and browser test runners](../tasks/01-foundation/T014-test-runners.md) | CORE | NOT_STARTED | — | — |
| T015 | [Expose predictable agent verification and dependency-boundary commands](../tasks/01-foundation/T015-commands.md) | CORE | NOT_STARTED | — | — |
| T016 | [Create clean-install CI and supply-chain checks](../tasks/01-foundation/T016-ci.md) | CORE | NOT_STARTED | — | — |
| T017 | [Freeze the executable compatibility baseline before domain work](../tasks/01-foundation/T017-compatibility-smoke.md) | GATE | NOT_STARTED | — | — |
| T018 | [Implement firm, client and engagement ownership constraints](../tasks/02-security/T018-scope-model.md) | CORE | NOT_STARTED | — | — |
| T019 | [Implement the selected internal identity adapter and session boundary](../tasks/02-security/T019-internal-auth.md) | CORE | NOT_STARTED | — | — |
| T020 | [Implement separate portal authentication and first-reset gate](../tasks/02-security/T020-portal-auth.md) | CORE | NOT_STARTED | — | — |
| T021 | [Create explicit permission and segregation-of-duties checks](../tasks/02-security/T021-authorization.md) | CORE | NOT_STARTED | — | — |
| T022 | [Implement canonical runtime contracts and generated browser types](../tasks/02-security/T022-api-contracts.md) | CORE | NOT_STARTED | — | — |
| T023 | [Implement decimal, accounting-date and deterministic clock primitives](../tasks/02-security/T023-money-clock.md) | CORE | NOT_STARTED | — | — |
| T024 | [Share one transaction across module-owned business operations](../tasks/02-security/T024-transaction-context.md) | CORE | NOT_STARTED | — | — |
| T025 | [Implement append-only audit writes with database permissions](../tasks/02-security/T025-audit-write.md) | CORE | NOT_STARTED | — | — |
| T026 | [Add concurrent-safe audit hash chains and checkpoints](../tasks/02-security/T026-audit-chain.md) | CORE | NOT_STARTED | — | — |
| T027 | [Persist idempotent operation outcomes in PostgreSQL](../tasks/02-security/T027-idempotency.md) | CORE | NOT_STARTED | — | — |
| T028 | [Implement guarded engagement transitions and state history](../tasks/02-security/T028-workflow-kernel.md) | CORE | NOT_STARTED | — | — |
| T029 | [Add CSRF, CORS, proxy and request-abuse controls](../tasks/02-security/T029-security-hardening.md) | CORE | NOT_STARTED | — | — |
| T030 | [Implement a durable outbox with operation reconciliation](../tasks/03-platform/T030-outbox.md) | CORE | NOT_STARTED | — | — |
| T031 | [Configure BullMQ workers for reliable retries and shutdown](../tasks/03-platform/T031-queue-runtime.md) | CORE | NOT_STARTED | — | — |
| T032 | [Implement private object storage and immutable document versions](../tasks/03-platform/T032-storage-metadata.md) | CORE | NOT_STARTED | — | — |
| T033 | [Implement bounded upload initiation and finalize-time authorization](../tasks/03-platform/T033-upload-pipeline.md) | CORE | NOT_STARTED | — | — |
| T034 | [Implement scoped document downloads and delivery receipts](../tasks/03-platform/T034-downloads.md) | CORE | NOT_STARTED | — | — |
| T035 | [Prove a constrained HTML-to-PDF worker on the target image](../tasks/03-platform/T035-pdf-runtime.md) | CORE | NOT_STARTED | — | — |
| T036 | [Build versioned document templates and approved assets](../tasks/03-platform/T036-template-catalog.md) | CORE | NOT_STARTED | — | — |
| T037 | [Implement role-routed notifications and auditable outbound dispatch](../tasks/03-platform/T037-notifications.md) | CORE | NOT_STARTED | — | — |
| T038 | [Implement authenticated Socket.IO rooms and safe reconnects](../tasks/03-platform/T038-realtime.md) | CORE | NOT_STARTED | — | — |
| T039 | [Implement owner-safe advisory edit leases](../tasks/03-platform/T039-leases.md) | CORE | NOT_STARTED | — | — |
| T040 | [Implement durable deadline scanning and maintenance claims](../tasks/03-platform/T040-scheduler.md) | CORE | NOT_STARTED | — | — |
| T041 | [Add operational metrics, redaction and dependency health](../tasks/03-platform/T041-platform-observability.md) | CORE | NOT_STARTED | — | — |
| T042 | [Build deterministic TB fixtures and a test-only engagement seed](../tasks/04-tb-proof/T042-tb-fixtures.md) | CORE | NOT_STARTED | — | — |
| T043 | [Implement import-batch staging and source-document provenance](../tasks/04-tb-proof/T043-tb-staging.md) | CORE | NOT_STARTED | — | — |
| T044 | [Implement bounded CSV parsing in a background worker](../tasks/04-tb-proof/T044-csv-parser.md) | CORE | NOT_STARTED | — | — |
| T045 | [Implement bounded XLSX parsing and hostile-file limits](../tasks/04-tb-proof/T045-xlsx-parser.md) | CORE | NOT_STARTED | — | — |
| T046 | [Implement deterministic mapping suggestions with provenance](../tasks/04-tb-proof/T046-mapping-prototype.md) | CORE | NOT_STARTED | — | — |
| T047 | [Build a virtualized Angular TB grid with bounded data windows](../tasks/04-tb-proof/T047-grid-shell.md) | CORE | NOT_STARTED | — | — |
| T048 | [Add keyboard editing, selection, clipboard and local undo](../tasks/04-tb-proof/T048-grid-keyboard.md) | CORE | NOT_STARTED | — | — |
| T049 | [Implement atomic batch mapping with expected versions](../tasks/04-tb-proof/T049-batch-mapping.md) | CORE | NOT_STARTED | — | — |
| T050 | [Prove finalization and FSLI aggregation on synthetic data](../tasks/04-tb-proof/T050-tb-summary-proof.md) | CORE | NOT_STARTED | — | — |
| T051 | [Measure the TB slice and freeze its interaction contract](../tasks/04-tb-proof/T051-tb-proof-gate.md) | GATE | NOT_STARTED | — | — |
| T052 | [Implement client legal profiles and organizational hierarchy](../tasks/05-commercial/T052-client-directory.md) | CORE | NOT_STARTED | — | — |
| T053 | [Implement contact roles and routing preferences](../tasks/05-commercial/T053-contacts.md) | CORE | NOT_STARTED | — | — |
| T054 | [Implement lead stages and proposal-entry workflow](../tasks/05-commercial/T054-lead-pipeline.md) | CORE | NOT_STARTED | — | — |
| T055 | [Create engagement identity and reusable lifecycle queries](../tasks/05-commercial/T055-engagement-record.md) | CORE | NOT_STARTED | — | — |
| T056 | [Implement acceptance and continuance questionnaire templates](../tasks/05-commercial/T056-risk-templates.md) | CORE | NOT_STARTED | — | — |
| T057 | [Implement new-client risk review and independence evidence](../tasks/05-commercial/T057-acceptance.md) | CORE | NOT_STARTED | — | — |
| T058 | [Implement recurring-client continuance and prior-year checks](../tasks/05-commercial/T058-continuance.md) | CORE | NOT_STARTED | — | — |
| T059 | [Authorize and record the partner risk key](../tasks/05-commercial/T059-partner-risk.md) | CORE | NOT_STARTED | — | — |
| T060 | [Implement the brief quotation and fee-term model](../tasks/05-commercial/T060-quote.md) | CORE | NOT_STARTED | — | — |
| T061 | [Implement the comprehensive proposal document](../tasks/05-commercial/T061-proposal.md) | CORE | NOT_STARTED | — | — |
| T062 | [Dispatch proposals and record client acceptance of an exact version](../tasks/05-commercial/T062-proposal-dispatch.md) | CORE | NOT_STARTED | — | — |
| T063 | [Implement the atomic dual-key gate](../tasks/05-commercial/T063-dual-key.md) | CORE | NOT_STARTED | — | — |
| T064 | [Provision the five-folder engagement taxonomy idempotently](../tasks/05-commercial/T064-directories.md) | CORE | NOT_STARTED | — | — |
| T065 | [Generate partner-authorized engagement letters](../tasks/05-commercial/T065-letter.md) | CORE | NOT_STARTED | — | — |
| T066 | [Create the firm chart of accounts and accounting-period controls](../tasks/06-billing-portal/T066-accounts-periods.md) | CORE | NOT_STARTED | — | — |
| T067 | [Implement draft journals and balanced posting transactions](../tasks/06-billing-portal/T067-journals.md) | CORE | NOT_STARTED | — | — |
| T068 | [Implement journal reversal and controlled period close](../tasks/06-billing-portal/T068-reversals.md) | CORE | NOT_STARTED | — | — |
| T069 | [Implement canonical invoices, numbering and billing ownership](../tasks/06-billing-portal/T069-invoice-foundation.md) | CORE | NOT_STARTED | — | — |
| T070 | [Issue the advance invoice alongside the approved letter](../tasks/06-billing-portal/T070-advance-billing.md) | CORE | NOT_STARTED | — | — |
| T071 | [Record payments, allocations and cleared-advance gate](../tasks/06-billing-portal/T071-payments.md) | CORE | NOT_STARTED | — | — |
| T072 | [Generate and route immutable receipt vouchers](../tasks/06-billing-portal/T072-receipts.md) | CORE | NOT_STARTED | — | — |
| T073 | [Activate the PBC workspace only after all onboarding gates](../tasks/06-billing-portal/T073-portal-activation.md) | CORE | NOT_STARTED | — | — |
| T074 | [Create scoped PBC requests and the portal dashboard](../tasks/06-billing-portal/T074-pbc-requests.md) | CORE | NOT_STARTED | — | — |
| T075 | [Attach and re-upload evidence through PBC request controls](../tasks/06-billing-portal/T075-pbc-upload.md) | CORE | NOT_STARTED | — | — |
| T076 | [Implement auditor review and mandatory rejection reasons](../tasks/06-billing-portal/T076-pbc-review.md) | CORE | NOT_STARTED | — | — |
| T077 | [Expose permitted commercial documents and audit portal isolation](../tasks/06-billing-portal/T077-portal-documents.md) | CORE | NOT_STARTED | — | — |
| T078 | [Promote import proof into a configurable production column-mapping flow](../tasks/07-planning/T078-tb-column-mapping.md) | CORE | NOT_STARTED | — | — |
| T079 | [Validate TB balance, account identity and period controls](../tasks/07-planning/T079-tb-validation.md) | CORE | NOT_STARTED | — | — |
| T080 | [Implement approved mapping memory and corrections](../tasks/07-planning/T080-mapping-memory.md) | CORE | NOT_STARTED | — | — |
| T081 | [Finalize an immutable TB version through real business gates](../tasks/07-planning/T081-tb-finalize.md) | CORE | NOT_STARTED | — | — |
| T082 | [Complete split financial statement dashboard and drill-down](../tasks/07-planning/T082-fsli-dashboard.md) | CORE | NOT_STARTED | — | — |
| T083 | [Implement team assignment, availability and capacity calendar](../tasks/07-planning/T083-scheduling.md) | CORE | NOT_STARTED | — | — |
| T084 | [Implement statutory-relative milestone planning](../tasks/07-planning/T084-milestones.md) | CORE | NOT_STARTED | — | — |
| T085 | [Implement TB-linked benchmark selection and normalization](../tasks/07-planning/T085-materiality-benchmarks.md) | CORE | NOT_STARTED | — | — |
| T086 | [Calculate PM, TE, SAD and manager rounding](../tasks/07-planning/T086-materiality-calculator.md) | CORE | NOT_STARTED | — | — |
| T087 | [Implement risk colors and mandatory review routing](../tasks/07-planning/T087-risk-classification.md) | CORE | NOT_STARTED | — | — |
| T088 | [Approve version-bound planning and unlock fieldwork](../tasks/07-planning/T088-planning-approval.md) | CORE | NOT_STARTED | — | — |
| T089 | [Handle new TB/materiality versions after sign-off safely](../tasks/07-planning/T089-planning-change-impact.md) | CORE | NOT_STARTED | — | — |
| T090 | [Build versioned standard workprogram templates](../tasks/08-fieldwork/T090-workprogram-templates.md) | CORE | NOT_STARTED | — | — |
| T091 | [Instantiate engagement workprograms from approved snapshots](../tasks/08-fieldwork/T091-workprogram-instances.md) | CORE | NOT_STARTED | — | — |
| T092 | [Implement the workprogram procedure editor](../tasks/08-fieldwork/T092-step-editor.md) | CORE | NOT_STARTED | — | — |
| T093 | [Add ad-hoc procedures with provenance and review impact](../tasks/08-fieldwork/T093-adhoc-steps.md) | CORE | NOT_STARTED | — | — |
| T094 | [Link exact digital evidence versions to workpaper steps](../tasks/08-fieldwork/T094-evidence-digital.md) | CORE | NOT_STARTED | — | — |
| T095 | [Capture physical evidence file, box and shelf references](../tasks/08-fieldwork/T095-evidence-physical.md) | CORE | NOT_STARTED | — | — |
| T096 | [Implement comparative analytical-review templates](../tasks/08-fieldwork/T096-analytical-review.md) | CORE | NOT_STARTED | — | — |
| T097 | [Implement the mandatory going-concern assessment workflow](../tasks/08-fieldwork/T097-going-concern.md) | CORE | NOT_STARTED | — | — |
| T098 | [Define immutable sampling populations and execution records](../tasks/08-fieldwork/T098-sampling-population.md) | CORE | NOT_STARTED | — | — |
| T099 | [Implement Monetary Unit Sampling using approved golden examples](../tasks/08-fieldwork/T099-sampling-mus.md) | CORE | NOT_STARTED | — | — |
| T100 | [Implement Systematic Random Sampling](../tasks/08-fieldwork/T100-sampling-systematic.md) | CORE | NOT_STARTED | — | — |
| T101 | [Implement Stratified Attribute Sampling](../tasks/08-fieldwork/T101-sampling-stratified.md) | CORE | NOT_STARTED | — | — |
| T102 | [Capture sample exceptions and controlled procedure conclusions](../tasks/08-fieldwork/T102-sampling-results.md) | CORE | NOT_STARTED | — | — |
| T103 | [Implement audit adjustment proposals separate from the firm ledger](../tasks/08-fieldwork/T103-adjustment-drafts.md) | CORE | NOT_STARTED | — | — |
| T104 | [Approve client audit adjustments and derive adjusted balances](../tasks/08-fieldwork/T104-adjustment-approval.md) | CORE | NOT_STARTED | — | — |
| T105 | [Track unadjusted differences and significant estimates](../tasks/08-fieldwork/T105-differences-register.md) | CORE | NOT_STARTED | — | — |
| T106 | [Submit a complete version-bound workpackage for review](../tasks/08-fieldwork/T106-submit-workprogram.md) | CORE | NOT_STARTED | — | — |
| T107 | [Implement the reviewer inbox and version-aware inspection](../tasks/09-review/T107-review-inbox.md) | CORE | NOT_STARTED | — | — |
| T108 | [Implement inline review notes and resolution lifecycle](../tasks/09-review/T108-review-notes.md) | CORE | NOT_STARTED | — | — |
| T109 | [Return workpackages with mandatory comments and reassignment](../tasks/09-review/T109-rework.md) | CORE | NOT_STARTED | — | — |
| T110 | [Clear completed workprograms without self-review or stale evidence](../tasks/09-review/T110-manager-clearance.md) | CORE | NOT_STARTED | — | — |
| T111 | [Implement all required third-party confirmation categories](../tasks/09-review/T111-confirmation-register.md) | CORE | NOT_STARTED | — | — |
| T112 | [Dispatch, remind and verify confirmation responses](../tasks/09-review/T112-confirmation-dispatch.md) | CORE | NOT_STARTED | — | — |
| T113 | [Enforce critical confirmation blockers and holding-letter idempotency](../tasks/09-review/T113-holding-letters.md) | CORE | NOT_STARTED | — | — |
| T114 | [Compile the SRM from authoritative versioned module queries](../tasks/09-review/T114-srm-snapshot.md) | CORE | NOT_STARTED | — | — |
| T115 | [Approve the manager recommendation and submit SRM to partner](../tasks/09-review/T115-srm-manager.md) | CORE | NOT_STARTED | — | — |
| T116 | [Implement mandatory Red-area review and partner SRM clearance](../tasks/09-review/T116-partner-clearance.md) | CORE | NOT_STARTED | — | — |
| T117 | [Verify the complete preparer-manager-partner rejection loop](../tasks/09-review/T117-review-e2e.md) | GATE | NOT_STARTED | — | — |
| T118 | [Implement the partner-only four-way opinion workflow](../tasks/10-reporting/T118-opinion.md) | CORE | NOT_STARTED | — | — |
| T119 | [Assemble audited financial-statement snapshots for D1](../tasks/10-reporting/T119-financial-statements.md) | CORE | NOT_STARTED | — | — |
| T120 | [Render correct opinion-specific report sections and partner preview](../tasks/10-reporting/T120-report-basis.md) | CORE | NOT_STARTED | — | — |
| T121 | [Implement D2 deficiencies, impacts and recommendations](../tasks/10-reporting/T121-management-letter.md) | CORE | NOT_STARTED | — | — |
| T122 | [Generate D3 LOR for client letterhead and signature](../tasks/10-reporting/T122-lor-draft.md) | CORE | NOT_STARTED | — | — |
| T123 | [Receive and verify signed management representation before freeze](../tasks/10-reporting/T123-lor-return.md) | CORE | NOT_STARTED | — | — |
| T124 | [Compile D4 management correspondence and confirmation history](../tasks/10-reporting/T124-correspondence-trail.md) | CORE | NOT_STARTED | — | — |
| T125 | [Issue or reuse the final 50% invoice at the approved milestone](../tasks/10-reporting/T125-final-fee.md) | CORE | NOT_STARTED | — | — |
| T126 | [Implement approved partner signature and seal controls](../tasks/10-reporting/T126-signing.md) | CORE | NOT_STARTED | — | — |
| T127 | [Build the mandatory five-part deliverable package asynchronously](../tasks/10-reporting/T127-bundle-build.md) | CORE | NOT_STARTED | — | — |
| T128 | [Validate final package completeness and current approval lineage](../tasks/10-reporting/T128-bundle-validation.md) | CORE | NOT_STARTED | — | — |
| T129 | [Release the package and freeze uploads atomically](../tasks/10-reporting/T129-release.md) | CORE | NOT_STARTED | — | — |
| T130 | [Track delivery and expose final downloads without false completion](../tasks/10-reporting/T130-release-delivery.md) | CORE | NOT_STARTED | — | — |
| T131 | [Persist signature-based deadlines and enforce due read-only state](../tasks/11-archive/T131-archive-deadline.md) | CORE | NOT_STARTED | — | — |
| T132 | [Create complete archive manifests including working papers](../tasks/11-archive/T132-archive-manifest.md) | CORE | NOT_STARTED | — | — |
| T133 | [Apply and verify production object-version retention controls](../tasks/11-archive/T133-object-retention.md) | CORE | NOT_STARTED | — | — |
| T134 | [Finalize archive state only after sealing evidence verifies](../tasks/11-archive/T134-archive-seal.md) | CORE | NOT_STARTED | — | — |
| T135 | [Implement partner-authorized early archive lock](../tasks/11-archive/T135-early-lock.md) | CORE | NOT_STARTED | — | — |
| T136 | [Export regulator inspection packages with hash verification](../tasks/11-archive/T136-archive-export.md) | CORE | NOT_STARTED | — | — |
| T137 | [Define controlled post-release corrections without rewriting history](../tasks/11-archive/T137-archive-corrections.md) | CORE | NOT_STARTED | — | — |
| T138 | [Verify archive deadlines, races and provider failure recovery](../tasks/11-archive/T138-archive-drill.md) | GATE | NOT_STARTED | — | — |
| T139 | [Implement effective-dated staff charge-out rates](../tasks/12-practice/T139-rate-cards.md) | CORE | NOT_STARTED | — | — |
| T140 | [Record daily hours by engagement, phase and FSLI](../tasks/12-practice/T140-timesheets.md) | CORE | NOT_STARTED | — | — |
| T141 | [Approve time corrections and period submission](../tasks/12-practice/T141-time-approval.md) | CORE | NOT_STARTED | — | — |
| T142 | [Implement engagement phase budgets and actual-hour comparisons](../tasks/12-practice/T142-budgets.md) | CORE | NOT_STARTED | — | — |
| T143 | [Implement source profitability and realization views with correct labels](../tasks/12-practice/T143-realization.md) | CORE | NOT_STARTED | — | — |
| T144 | [Record the required operating expense and withdrawal categories](../tasks/12-practice/T144-operating-expenses.md) | CORE | NOT_STARTED | — | — |
| T145 | [Implement the firm trial balance with opening and period movement](../tasks/12-practice/T145-firm-trial-balance.md) | CORE | NOT_STARTED | — | — |
| T146 | [Implement monthly firm Profit and Loss reporting](../tasks/12-practice/T146-firm-pl.md) | CORE | NOT_STARTED | — | — |
| T147 | [Implement allocated-payment accounts-receivable aging](../tasks/12-practice/T147-ar-aging.md) | CORE | NOT_STARTED | — | — |
| T148 | [Reconcile all firm reports and audit financial adjustments](../tasks/12-practice/T148-practice-reconciliation.md) | GATE | NOT_STARTED | — | — |
| T149 | [Approve optional Microsoft 365 tenant integration scope](../tasks/13-microsoft365/T149-m365-policy.md) | OPTIONAL | NOT_STARTED | — | — |
| T150 | [Verify MSAL and Graph packages against the selected Angular/Node stack](../tasks/13-microsoft365/T150-m365-compatibility.md) | OPTIONAL | NOT_STARTED | — | — |
| T151 | [Implement internal Entra single sign-on and local role mapping](../tasks/13-microsoft365/T151-m365-sso.md) | OPTIONAL | NOT_STARTED | — | — |
| T152 | [Implement Graph mail with bounded permissions and unknown-outcome handling](../tasks/13-microsoft365/T152-m365-mail.md) | OPTIONAL | NOT_STARTED | — | — |
| T153 | [Implement staff lookup or synchronization without privilege escalation](../tasks/13-microsoft365/T153-m365-directory.md) | OPTIONAL | NOT_STARTED | — | — |
| T154 | [Implement optional SharePoint workspace provisioning behind storage boundaries](../tasks/13-microsoft365/T154-m365-sharepoint.md) | OPTIONAL | NOT_STARTED | — | — |
| T155 | [Implement optional Graph change notifications and reconciliation](../tasks/13-microsoft365/T155-m365-webhooks.md) | OPTIONAL | NOT_STARTED | — | — |
| T156 | [Run tenant-consent, throttling and revocation integration tests](../tasks/13-microsoft365/T156-m365-release-gate.md) | OPTIONAL | NOT_STARTED | — | — |
| T157 | [Run the complete source lifecycle through real application boundaries](../tasks/14-production/T157-full-journey.md) | GATE | NOT_STARTED | — | — |
| T158 | [Review authentication, object access and output security end-to-end](../tasks/14-production/T158-security-review.md) | GATE | NOT_STARTED | — | — |
| T159 | [Measure full-stack load and resource budgets](../tasks/14-production/T159-load-tests.md) | GATE | NOT_STARTED | — | — |
| T160 | [Prove outage recovery and durable-operation reconciliation](../tasks/14-production/T160-failure-drills.md) | GATE | NOT_STARTED | — | — |
| T161 | [Tune queries and migrations using production-shaped data](../tasks/14-production/T161-database-tuning.md) | GATE | NOT_STARTED | — | — |
| T162 | [Perform PostgreSQL and object-store restore drills](../tasks/14-production/T162-backup-restore.md) | GATE | NOT_STARTED | — | — |
| T163 | [Inventory legacy data and map it without authorizing a rewrite](../tasks/14-production/T163-migration-inventory.md) | CONDITIONAL | NOT_STARTED | — | — |
| T164 | [Rehearse legacy import and reconciliation in isolation](../tasks/14-production/T164-migration-rehearsal.md) | CONDITIONAL | NOT_STARTED | — | — |
| T165 | [Build immutable API, web and worker release artifacts](../tasks/14-production/T165-deployment-artifacts.md) | GATE | NOT_STARTED | — | — |
| T166 | [Rehearse rolling deployment, realtime reconnect and worker drains](../tasks/14-production/T166-rolling-deploy.md) | GATE | NOT_STARTED | — | — |
| T167 | [Create the source-controlled hotfix and incident-repair workflow](../tasks/14-production/T167-hotfix-runbook.md) | GATE | NOT_STARTED | — | — |
| T168 | [Conduct role-based UAT and professional-policy sign-off](../tasks/14-production/T168-uat.md) | GATE | NOT_STARTED | — | — |
| T169 | [Complete the production readiness and dependency recheck](../tasks/14-production/T169-release-review.md) | GATE | NOT_STARTED | — | — |
| T170 | [Execute only an explicitly authorized release or migration cutover](../tasks/14-production/T170-production-cutover.md) | GATE | NOT_STARTED | — | — |
| T171 | [Deliver operating documentation and a verified requirements closure report](../tasks/14-production/T171-handover.md) | GATE | NOT_STARTED | — | — |

## Status rules

Use NOT_STARTED, IN_PROGRESS, IN_REVIEW, DONE or BLOCKED. Optional/conditional tasks may be NOT_APPLICABLE with a named approved reason. All required core/gate tasks need evidence. No user-facing release should describe untested optional features as available or production-ready.
