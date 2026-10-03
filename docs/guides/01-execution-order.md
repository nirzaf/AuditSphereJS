# Execution order and dependency graph

Numeric task order is a valid sequential implementation order. Each file also lists its direct prerequisites. Read the current task and dependency handoffs rather than loading the full pack.

## Execution rules

Begin with read-only baseline and policy records. Foundation tasks can progress while a professional decision is pending, but affected production behavior cannot. T017 is the mandatory shared compatibility barrier for every domain module. Basic helper smokes at T017 are not substitutes for later production feature tests.

Canonical billing is implemented early (T066–T072) so commercial payment and later reporting do not rely on an unfinished ledger. The three sampling methods each have their own files. A real cryptographic-signing provider, storage assurance and any enabled Microsoft integration require credentialed evidence, not just mocks.

## Optional and conditional tracks

T149–T156 are optional Microsoft 365 capabilities. If Microsoft is chosen for initial internal identity or mail, move the applicable integration/provider gate earlier after its prerequisites; the lower ordinal is not a reason to ship demo authentication. Unselected providers stay disabled. T163–T164 apply only to a real legacy migration. Record approved N/A for greenfield; T169 checks that disposition.

## Complete ordered index

### 00-readiness: Requirements, decisions and compatibility

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T001 | [Preserve the requirements and inspect the implementation starting point](../tasks/00-readiness/T001-baseline.md) | GATE | None |
| T002 | [Resolve workflow and billing ambiguities without changing the source silently](../tasks/00-readiness/T002-business-decisions.md) | GATE | T001 |
| T003 | [Approve numerical, sampling and professional-judgment specifications](../tasks/00-readiness/T003-methodology-decisions.md) | GATE | T001 |
| T004 | [Approve signature, archival and engagement-type policies](../tasks/00-readiness/T004-records-decisions.md) | GATE | T001 |
| T005 | [Review every direct dependency and reconcile version evidence](../tasks/00-readiness/T005-dependency-review.md) | GATE | T001 |
| T006 | [Select deployment targets, storage and external-provider boundaries](../tasks/00-readiness/T006-deployment-decisions.md) | GATE | T001, T004 |

### 01-foundation: Workspace and executable foundation

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T007 | [Create a minimal pnpm workspace with explicit package ownership](../tasks/01-foundation/T007-workspace.md) | CORE | T005 |
| T008 | [Make backend ESM builds and decorator injection testable](../tasks/01-foundation/T008-esm.md) | CORE | T007 |
| T009 | [Bootstrap NestJS with the matched Fastify adapter](../tasks/01-foundation/T009-api-shell.md) | CORE | T008 |
| T010 | [Create the Angular standalone shell and accessible layouts](../tasks/01-foundation/T010-angular-shell.md) | CORE | T007 |
| T011 | [Configure Prisma and PostgreSQL with explicit pool limits](../tasks/01-foundation/T011-database.md) | CORE | T008, T006 |
| T012 | [Add typed configuration and secret-safe environment separation](../tasks/01-foundation/T012-configuration.md) | CORE | T009, T011 |
| T013 | [Provision reproducible local data services and test containers](../tasks/01-foundation/T013-local-services.md) | CORE | T006, T011, T012 |
| T014 | [Wire minimal backend, Angular and browser test runners](../tasks/01-foundation/T014-test-runners.md) | CORE | T009, T010, T013 |
| T015 | [Expose predictable agent verification and dependency-boundary commands](../tasks/01-foundation/T015-commands.md) | CORE | T014 |
| T016 | [Create clean-install CI and supply-chain checks](../tasks/01-foundation/T016-ci.md) | CORE | T015, T005 |
| T017 | [Freeze the executable compatibility baseline before domain work](../tasks/01-foundation/T017-compatibility-smoke.md) | GATE | T016 |

### 02-security: Identity, authorization and application controls

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T018 | [Implement firm, client and engagement ownership constraints](../tasks/02-security/T018-scope-model.md) | CORE | T017 |
| T019 | [Implement the selected internal identity adapter and session boundary](../tasks/02-security/T019-internal-auth.md) | CORE | T018, T012 |
| T020 | [Implement separate portal authentication and first-reset gate](../tasks/02-security/T020-portal-auth.md) | CORE | T018, T012 |
| T021 | [Create explicit permission and segregation-of-duties checks](../tasks/02-security/T021-authorization.md) | CORE | T019, T020 |
| T022 | [Implement canonical runtime contracts and generated browser types](../tasks/02-security/T022-api-contracts.md) | CORE | T009, T010, T021 |
| T023 | [Implement decimal, accounting-date and deterministic clock primitives](../tasks/02-security/T023-money-clock.md) | CORE | T022, T003 |
| T024 | [Share one transaction across module-owned business operations](../tasks/02-security/T024-transaction-context.md) | CORE | T011, T022 |
| T025 | [Implement append-only audit writes with database permissions](../tasks/02-security/T025-audit-write.md) | CORE | T024, T021 |
| T026 | [Add concurrent-safe audit hash chains and checkpoints](../tasks/02-security/T026-audit-chain.md) | CORE | T025, T023 |
| T027 | [Persist idempotent operation outcomes in PostgreSQL](../tasks/02-security/T027-idempotency.md) | CORE | T024, T022 |
| T028 | [Implement guarded engagement transitions and state history](../tasks/02-security/T028-workflow-kernel.md) | CORE | T021, T024, T025, T002 |
| T029 | [Add CSRF, CORS, proxy and request-abuse controls](../tasks/02-security/T029-security-hardening.md) | CORE | T019, T020, T022 |

### 03-platform: Durable jobs, documents and realtime

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T030 | [Implement a durable outbox with operation reconciliation](../tasks/03-platform/T030-outbox.md) | CORE | T027, T025 |
| T031 | [Configure BullMQ workers for reliable retries and shutdown](../tasks/03-platform/T031-queue-runtime.md) | CORE | T030, T013 |
| T032 | [Implement private SharePoint/OneDrive storage and immutable document versions](../tasks/03-platform/T032-storage-metadata.md) | CORE | T018, T024, T006 |
| T033 | [Implement bounded upload initiation and finalize-time authorization](../tasks/03-platform/T033-upload-pipeline.md) | CORE | T032, T021, T029 |
| T034 | [Implement scoped document downloads and delivery receipts](../tasks/03-platform/T034-downloads.md) | CORE | T032, T021 |
| T035 | [Prove a constrained HTML-to-PDF worker on the target image](../tasks/03-platform/T035-pdf-runtime.md) | CORE | T031, T032, T004 |
| T036 | [Build versioned document templates and approved assets](../tasks/03-platform/T036-template-catalog.md) | CORE | T035 |
| T037 | [Implement role-routed notifications and auditable outbound dispatch](../tasks/03-platform/T037-notifications.md) | CORE | T030, T031, T021 |
| T038 | [Implement authenticated Socket.IO rooms and safe reconnects](../tasks/03-platform/T038-realtime.md) | CORE | T021, T022, T031 |
| T039 | [Implement owner-safe advisory edit leases](../tasks/03-platform/T039-leases.md) | CORE | T038, T027 |
| T040 | [Implement durable deadline scanning and maintenance claims](../tasks/03-platform/T040-scheduler.md) | CORE | T031, T023, T030 |
| T041 | [Add operational metrics, redaction and dependency health](../tasks/03-platform/T041-platform-observability.md) | CORE | T031, T040, T038 |

### 04-tb-proof: Trial Balance technical proof

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T042 | [Build deterministic TB fixtures and a test-only engagement seed](../tasks/04-tb-proof/T042-tb-fixtures.md) | CORE | T028, T023, T041 |
| T043 | [Implement import-batch staging and source-document provenance](../tasks/04-tb-proof/T043-tb-staging.md) | CORE | T042, T033, T024 |
| T044 | [Implement bounded CSV parsing in a background worker](../tasks/04-tb-proof/T044-csv-parser.md) | CORE | T043, T031 |
| T045 | [Implement bounded XLSX parsing and hostile-file limits](../tasks/04-tb-proof/T045-xlsx-parser.md) | CORE | T043, T031 |
| T046 | [Implement deterministic mapping suggestions with provenance](../tasks/04-tb-proof/T046-mapping-prototype.md) | CORE | T044, T045 |
| T047 | [Build a virtualized Angular TB grid with bounded data windows](../tasks/04-tb-proof/T047-grid-shell.md) | CORE | T046, T010, T022 |
| T048 | [Add keyboard editing, selection, clipboard and local undo](../tasks/04-tb-proof/T048-grid-keyboard.md) | CORE | T047 |
| T049 | [Implement atomic batch mapping with expected versions](../tasks/04-tb-proof/T049-batch-mapping.md) | CORE | T048, T024, T027, T039 |
| T050 | [Prove finalization and FSLI aggregation on synthetic data](../tasks/04-tb-proof/T050-tb-summary-proof.md) | CORE | T049, T023 |
| T051 | [Measure the TB slice and freeze its interaction contract](../tasks/04-tb-proof/T051-tb-proof-gate.md) | GATE | T050, T014 |

### 05-commercial: Commercial and acceptance onboarding

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T052 | [Implement client legal profiles and organizational hierarchy](../tasks/05-commercial/T052-client-directory.md) | CORE | T018, T051 |
| T053 | [Implement contact roles and routing preferences](../tasks/05-commercial/T053-contacts.md) | CORE | T052, T037 |
| T054 | [Implement lead stages and proposal-entry workflow](../tasks/05-commercial/T054-lead-pipeline.md) | CORE | T052, T028 |
| T055 | [Create engagement identity and reusable lifecycle queries](../tasks/05-commercial/T055-engagement-record.md) | CORE | T053, T054, T028 |
| T056 | [Implement acceptance and continuance questionnaire templates](../tasks/05-commercial/T056-risk-templates.md) | CORE | T055, T036 |
| T057 | [Implement new-client risk review and independence evidence](../tasks/05-commercial/T057-acceptance.md) | CORE | T056, T021 |
| T058 | [Implement recurring-client continuance and prior-year checks](../tasks/05-commercial/T058-continuance.md) | CORE | T056, T057 |
| T059 | [Authorize and record the partner risk key](../tasks/05-commercial/T059-partner-risk.md) | CORE | T057, T058, T025 |
| T060 | [Implement the brief quotation and fee-term model](../tasks/05-commercial/T060-quote.md) | CORE | T055, T036, T002 |
| T061 | [Implement the comprehensive proposal document](../tasks/05-commercial/T061-proposal.md) | CORE | T060, T036 |
| T062 | [Dispatch proposals and record client acceptance of an exact version](../tasks/05-commercial/T062-proposal-dispatch.md) | CORE | T061, T053, T037, T027 |
| T063 | [Implement the atomic dual-key gate](../tasks/05-commercial/T063-dual-key.md) | CORE | T062, T059, T024 |
| T064 | [Provision the five-folder engagement taxonomy idempotently](../tasks/05-commercial/T064-directories.md) | CORE | T059, T032, T030, T002 |
| T065 | [Generate partner-authorized engagement letters](../tasks/05-commercial/T065-letter.md) | CORE | T063, T064, T036, T004 |

### 06-billing-portal: Billing foundation and PBC portal

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T066 | [Create the firm chart of accounts and accounting-period controls](../tasks/06-billing-portal/T066-accounts-periods.md) | CORE | T023, T065, T003 |
| T067 | [Implement draft journals and balanced posting transactions](../tasks/06-billing-portal/T067-journals.md) | CORE | T066, T024, T025 |
| T068 | [Implement journal reversal and controlled period close](../tasks/06-billing-portal/T068-reversals.md) | CORE | T067 |
| T069 | [Implement canonical invoices, numbering and billing ownership](../tasks/06-billing-portal/T069-invoice-foundation.md) | CORE | T067, T027 |
| T070 | [Issue the advance invoice alongside the approved letter](../tasks/06-billing-portal/T070-advance-billing.md) | CORE | T069, T065, T030 |
| T071 | [Record payments, allocations and cleared-advance gate](../tasks/06-billing-portal/T071-payments.md) | CORE | T070, T027, T067 |
| T072 | [Generate and route immutable receipt vouchers](../tasks/06-billing-portal/T072-receipts.md) | CORE | T071, T035, T037 |
| T073 | [Activate the PBC workspace only after all onboarding gates](../tasks/06-billing-portal/T073-portal-activation.md) | CORE | T072, T020, T028, T064 |
| T074 | [Create scoped PBC requests and the portal dashboard](../tasks/06-billing-portal/T074-pbc-requests.md) | CORE | T073, T034 |
| T075 | [Attach and re-upload evidence through PBC request controls](../tasks/06-billing-portal/T075-pbc-upload.md) | CORE | T074, T033 |
| T076 | [Implement auditor review and mandatory rejection reasons](../tasks/06-billing-portal/T076-pbc-review.md) | CORE | T075, T021, T038 |
| T077 | [Expose permitted commercial documents and audit portal isolation](../tasks/06-billing-portal/T077-portal-documents.md) | CORE | T076, T072, T034, T002 |

### 07-planning: Production Trial Balance and planning

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T078 | [Promote import proof into a configurable production column-mapping flow](../tasks/07-planning/T078-tb-column-mapping.md) | CORE | T051, T077 |
| T079 | [Validate TB balance, account identity and period controls](../tasks/07-planning/T079-tb-validation.md) | CORE | T078, T023 |
| T080 | [Implement approved mapping memory and corrections](../tasks/07-planning/T080-mapping-memory.md) | CORE | T079, T046 |
| T081 | [Finalize an immutable TB version through real business gates](../tasks/07-planning/T081-tb-finalize.md) | CORE | T080, T049, T028 |
| T082 | [Complete split financial statement dashboard and drill-down](../tasks/07-planning/T082-fsli-dashboard.md) | CORE | T081, T023 |
| T083 | [Implement team assignment, availability and capacity calendar](../tasks/07-planning/T083-scheduling.md) | CORE | T055, T021 |
| T084 | [Implement statutory-relative milestone planning](../tasks/07-planning/T084-milestones.md) | CORE | T083, T040 |
| T085 | [Implement TB-linked benchmark selection and normalization](../tasks/07-planning/T085-materiality-benchmarks.md) | CORE | T081, T003 |
| T086 | [Calculate PM, TE, SAD and manager rounding](../tasks/07-planning/T086-materiality-calculator.md) | CORE | T085, T023 |
| T087 | [Implement risk colors and mandatory review routing](../tasks/07-planning/T087-risk-classification.md) | CORE | T086, T003 |
| T088 | [Approve version-bound planning and unlock fieldwork](../tasks/07-planning/T088-planning-approval.md) | CORE | T087, T084, T064, T028 |
| T089 | [Handle new TB/materiality versions after sign-off safely](../tasks/07-planning/T089-planning-change-impact.md) | CORE | T088 |

### 08-fieldwork: Workprograms, evidence and sampling

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T090 | [Build versioned standard workprogram templates](../tasks/08-fieldwork/T090-workprogram-templates.md) | CORE | T089, T036 |
| T091 | [Instantiate engagement workprograms from approved snapshots](../tasks/08-fieldwork/T091-workprogram-instances.md) | CORE | T090, T088 |
| T092 | [Implement the workprogram procedure editor](../tasks/08-fieldwork/T092-step-editor.md) | CORE | T091, T022, T039 |
| T093 | [Add ad-hoc procedures with provenance and review impact](../tasks/08-fieldwork/T093-adhoc-steps.md) | CORE | T092 |
| T094 | [Link exact digital evidence versions to workpaper steps](../tasks/08-fieldwork/T094-evidence-digital.md) | CORE | T092, T034, T076 |
| T095 | [Capture physical evidence file, box and shelf references](../tasks/08-fieldwork/T095-evidence-physical.md) | CORE | T092 |
| T096 | [Implement comparative analytical-review templates](../tasks/08-fieldwork/T096-analytical-review.md) | CORE | T082, T023, T091 |
| T097 | [Implement the mandatory going-concern assessment workflow](../tasks/08-fieldwork/T097-going-concern.md) | CORE | T096, T003 |
| T098 | [Define immutable sampling populations and execution records](../tasks/08-fieldwork/T098-sampling-population.md) | CORE | T091, T003, T081 |
| T099 | [Implement Monetary Unit Sampling using approved golden examples](../tasks/08-fieldwork/T099-sampling-mus.md) | CORE | T098, T023 |
| T100 | [Implement Systematic Random Sampling](../tasks/08-fieldwork/T100-sampling-systematic.md) | CORE | T098 |
| T101 | [Implement Stratified Attribute Sampling](../tasks/08-fieldwork/T101-sampling-stratified.md) | CORE | T098 |
| T102 | [Capture sample exceptions and controlled procedure conclusions](../tasks/08-fieldwork/T102-sampling-results.md) | CORE | T099, T100, T101, T094 |
| T103 | [Implement audit adjustment proposals separate from the firm ledger](../tasks/08-fieldwork/T103-adjustment-drafts.md) | CORE | T081, T023, T067 |
| T104 | [Approve client audit adjustments and derive adjusted balances](../tasks/08-fieldwork/T104-adjustment-approval.md) | CORE | T103, T021, T089 |
| T105 | [Track unadjusted differences and significant estimates](../tasks/08-fieldwork/T105-differences-register.md) | CORE | T104, T097 |
| T106 | [Submit a complete version-bound workpackage for review](../tasks/08-fieldwork/T106-submit-workprogram.md) | CORE | T102, T105, T095, T025 |

### 09-review: Review, confirmations and SRM

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T107 | [Implement the reviewer inbox and version-aware inspection](../tasks/09-review/T107-review-inbox.md) | CORE | T106, T021 |
| T108 | [Implement inline review notes and resolution lifecycle](../tasks/09-review/T108-review-notes.md) | CORE | T107, T025 |
| T109 | [Return workpackages with mandatory comments and reassignment](../tasks/09-review/T109-rework.md) | CORE | T108, T028 |
| T110 | [Clear completed workprograms without self-review or stale evidence](../tasks/09-review/T110-manager-clearance.md) | CORE | T109, T087 |
| T111 | [Implement all required third-party confirmation categories](../tasks/09-review/T111-confirmation-register.md) | CORE | T110, T053, T032 |
| T112 | [Dispatch, remind and verify confirmation responses](../tasks/09-review/T112-confirmation-dispatch.md) | CORE | T111, T037, T040 |
| T113 | [Enforce critical confirmation blockers and holding-letter idempotency](../tasks/09-review/T113-holding-letters.md) | CORE | T112, T037, T035 |
| T114 | [Compile the SRM from authoritative versioned module queries](../tasks/09-review/T114-srm-snapshot.md) | CORE | T110, T105, T113 |
| T115 | [Approve the manager recommendation and submit SRM to partner](../tasks/09-review/T115-srm-manager.md) | CORE | T114 |
| T116 | [Implement mandatory Red-area review and partner SRM clearance](../tasks/09-review/T116-partner-clearance.md) | CORE | T115 |
| T117 | [Verify the complete preparer-manager-partner rejection loop](../tasks/09-review/T117-review-e2e.md) | GATE | T116 |

### 10-reporting: Reporting and controlled release

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T118 | [Implement the partner-only four-way opinion workflow](../tasks/10-reporting/T118-opinion.md) | CORE | T117, T004 |
| T119 | [Assemble audited financial-statement snapshots for D1](../tasks/10-reporting/T119-financial-statements.md) | CORE | T118, T104, T036 |
| T120 | [Render correct opinion-specific report sections and partner preview](../tasks/10-reporting/T120-report-basis.md) | CORE | T119, T036 |
| T121 | [Implement D2 deficiencies, impacts and recommendations](../tasks/10-reporting/T121-management-letter.md) | CORE | T117, T036 |
| T122 | [Generate D3 LOR for client letterhead and signature](../tasks/10-reporting/T122-lor-draft.md) | CORE | T119, T036, T002 |
| T123 | [Receive and verify signed management representation before freeze](../tasks/10-reporting/T123-lor-return.md) | CORE | T122, T075 |
| T124 | [Compile D4 management correspondence and confirmation history](../tasks/10-reporting/T124-correspondence-trail.md) | CORE | T113, T114, T037 |
| T125 | [Issue or reuse the final 50% invoice at the approved milestone](../tasks/10-reporting/T125-final-fee.md) | CORE | T069, T119, T002 |
| T126 | [Implement approved partner signature and seal controls](../tasks/10-reporting/T126-signing.md) | CORE | T120, T123, T004 |
| T127 | [Build the mandatory five-part deliverable package asynchronously](../tasks/10-reporting/T127-bundle-build.md) | CORE | T126, T121, T124, T125, T031 |
| T128 | [Validate final package completeness and current approval lineage](../tasks/10-reporting/T128-bundle-validation.md) | CORE | T127, T116 |
| T129 | [Release the package and freeze uploads atomically](../tasks/10-reporting/T129-release.md) | CORE | T128, T028, T027 |
| T130 | [Track delivery and expose final downloads without false completion](../tasks/10-reporting/T130-release-delivery.md) | CORE | T129, T077, T037 |

### 11-archive: Archive, retention and inspection

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T131 | [Persist signature-based deadlines and enforce due read-only state](../tasks/11-archive/T131-archive-deadline.md) | CORE | T130, T040, T004 |
| T132 | [Create complete archive manifests including working papers](../tasks/11-archive/T132-archive-manifest.md) | CORE | T131, T026 |
| T133 | [Apply and verify production object-version retention controls](../tasks/11-archive/T133-object-retention.md) | CORE | T132, T006 |
| T134 | [Finalize archive state only after sealing evidence verifies](../tasks/11-archive/T134-archive-seal.md) | CORE | T133, T132 |
| T135 | [Implement partner-authorized early archive lock](../tasks/11-archive/T135-early-lock.md) | CORE | T134, T021 |
| T136 | [Export regulator inspection packages with hash verification](../tasks/11-archive/T136-archive-export.md) | CORE | T134, T034 |
| T137 | [Define controlled post-release corrections without rewriting history](../tasks/11-archive/T137-archive-corrections.md) | CORE | T136, T002, T004 |
| T138 | [Verify archive deadlines, races and provider failure recovery](../tasks/11-archive/T138-archive-drill.md) | GATE | T137, T135 |

### 12-practice: Practice analytics and bookkeeping reports

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T139 | [Implement effective-dated staff charge-out rates](../tasks/12-practice/T139-rate-cards.md) | CORE | T066, T021, T023 |
| T140 | [Record daily hours by engagement, phase and FSLI](../tasks/12-practice/T140-timesheets.md) | CORE | T139, T088 |
| T141 | [Approve time corrections and period submission](../tasks/12-practice/T141-time-approval.md) | CORE | T140 |
| T142 | [Implement engagement phase budgets and actual-hour comparisons](../tasks/12-practice/T142-budgets.md) | CORE | T084, T141 |
| T143 | [Implement source profitability and realization views with correct labels](../tasks/12-practice/T143-realization.md) | CORE | T142, T069 |
| T144 | [Record the required operating expense and withdrawal categories](../tasks/12-practice/T144-operating-expenses.md) | CORE | T068, T032 |
| T145 | [Implement the firm trial balance with opening and period movement](../tasks/12-practice/T145-firm-trial-balance.md) | CORE | T144 |
| T146 | [Implement monthly firm Profit and Loss reporting](../tasks/12-practice/T146-firm-pl.md) | CORE | T145 |
| T147 | [Implement allocated-payment accounts-receivable aging](../tasks/12-practice/T147-ar-aging.md) | CORE | T071, T125, T145 |
| T148 | [Reconcile all firm reports and audit financial adjustments](../tasks/12-practice/T148-practice-reconciliation.md) | GATE | T147, T146, T143 |

### 13-microsoft365: Optional Microsoft 365 integration

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T149 | [Approve optional Microsoft 365 tenant integration scope](../tasks/13-microsoft365/T149-m365-policy.md) | OPTIONAL | T006, T021 |
| T150 | [Verify MSAL and Graph packages against the selected Angular/Node stack](../tasks/13-microsoft365/T150-m365-compatibility.md) | OPTIONAL | T149, T005 |
| T151 | [Implement internal Entra single sign-on and local role mapping](../tasks/13-microsoft365/T151-m365-sso.md) | OPTIONAL | T150, T019 |
| T152 | [Implement Graph mail with bounded permissions and unknown-outcome handling](../tasks/13-microsoft365/T152-m365-mail.md) | OPTIONAL | T150, T037 |
| T153 | [Implement staff lookup or synchronization without privilege escalation](../tasks/13-microsoft365/T153-m365-directory.md) | OPTIONAL | T150, T018 |
| T154 | [Implement optional SharePoint workspace provisioning behind storage boundaries](../tasks/13-microsoft365/T154-m365-sharepoint.md) | OPTIONAL | T150, T064, T034 |
| T155 | [Implement optional Graph change notifications and reconciliation](../tasks/13-microsoft365/T155-m365-webhooks.md) | OPTIONAL | T154, T153 |
| T156 | [Run tenant-consent, throttling and revocation integration tests](../tasks/13-microsoft365/T156-m365-release-gate.md) | OPTIONAL | T151, T152, T153, T154, T155 |

### 14-production: Production verification, migration and release

| ID | Task | Class | Direct prerequisites |
| :--- | :--- | :--- | :--- |
| T157 | [Run the complete source lifecycle through real application boundaries](../tasks/14-production/T157-full-journey.md) | GATE | T148, T138 |
| T158 | [Review authentication, object access and output security end-to-end](../tasks/14-production/T158-security-review.md) | GATE | T157 |
| T159 | [Measure full-stack load and resource budgets](../tasks/14-production/T159-load-tests.md) | GATE | T157, T051 |
| T160 | [Prove outage recovery and durable-operation reconciliation](../tasks/14-production/T160-failure-drills.md) | GATE | T159 |
| T161 | [Tune queries and migrations using production-shaped data](../tasks/14-production/T161-database-tuning.md) | GATE | T159, T160 |
| T162 | [Perform PostgreSQL and object-store restore drills](../tasks/14-production/T162-backup-restore.md) | GATE | T160, T161 |
| T163 | [Inventory legacy data and map it without authorizing a rewrite](../tasks/14-production/T163-migration-inventory.md) | CONDITIONAL | T001, T157 |
| T164 | [Rehearse legacy import and reconciliation in isolation](../tasks/14-production/T164-migration-rehearsal.md) | CONDITIONAL | T163, T162 |
| T165 | [Build immutable API, web and worker release artifacts](../tasks/14-production/T165-deployment-artifacts.md) | GATE | T161, T158, T016 |
| T166 | [Rehearse rolling deployment, realtime reconnect and worker drains](../tasks/14-production/T166-rolling-deploy.md) | GATE | T165, T160 |
| T167 | [Create the source-controlled hotfix and incident-repair workflow](../tasks/14-production/T167-hotfix-runbook.md) | GATE | T166 |
| T168 | [Conduct role-based UAT and professional-policy sign-off](../tasks/14-production/T168-uat.md) | GATE | T167, T162 |
| T169 | [Complete the production readiness and dependency recheck](../tasks/14-production/T169-release-review.md) | GATE | T168, T164, T165 |
| T170 | [Execute only an explicitly authorized release or migration cutover](../tasks/14-production/T170-production-cutover.md) | GATE | T169 |
| T171 | [Deliver operating documentation and a verified requirements closure report](../tasks/14-production/T171-handover.md) | GATE | T170 |

## Completion states

`NOT_STARTED → IN_PROGRESS → IN_REVIEW → DONE`; use `BLOCKED` for missing prerequisites/evidence. Use `NOT_APPLICABLE` only for an approved optional/conditional case. The task pack starts with no implementation completed.

A task is not DONE just because its checklist was copied into a PR. Acceptance tests, authorization cases, exact dependency evidence and source decision approvals must be linked in the handoff. No duration estimates or throughput promises are implied by task numbering.
