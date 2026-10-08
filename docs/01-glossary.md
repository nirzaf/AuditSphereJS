# AuditSphereJS — Glossary

**Status: CURRENT.** One meaning per term. The right-hand column is the identifier to use in new code; it comes from `packages/contracts/src/index.ts` unless another path is given. Where the specification and the code use different words, both are shown.

## Roles, scope and authority

| Term | Meaning | Code |
| --- | --- | --- |
| Staff role | Per-engagement membership role. Specification PREPARER / REVIEWER / APPROVER map one-to-one; BILLING and ADMIN are firm operations roles. | `staffRoles`: `PREPARER`, `REVIEWER`, `APPROVER`, `BILLING`, `ADMIN` |
| Capability | A scoped grant checked inside every command, in addition to membership role. | `capabilities` (`ENGAGEMENT_READ`, `FIELDWORK_WRITE`, `FIELDWORK_FINALIZE`, `TB_PUBLISH`, `MAPPING_APPROVE`, `MATERIALITY_APPROVE`, `RISK_PARTNER_CLEAR`, `REVIEW_RAISE`, `REVIEW_RESOLVE`, `ADJUSTMENT_POST`, `COMMERCIAL_MANAGE`, `PRACTICE_*`, …) |
| Staffing level | Planning rank used for risk ownership. | `staffingLevelNames`: `StaffAssociate` (1), `SeniorAuditor` (2), `AuditManager` (3), `EngagementPartner` (4) |
| Job grade | Charge-out grade; six grades price the four specification rates (Partner 1,000; Manager 750; Supervisor/Senior 500; Associate/Junior 200 QAR/h). | `practiceJobGrades` |
| Portal user | A client principal, separate from staff identity, with single-use credentials and a forced first reset. | `PortalUser`, `PortalMembership`, `PortalCredentialToken` (Prisma) |
| Contact role | Recipient class for routed documents: MD/GM (proposals, letters, reports), CFO/FD (invoices, receipts), audit liaison (PBC requests). | `MD_GM`, `CFO_FD`, `AUDIT_LIAISON` |

## Lifecycle

| Term | Meaning | Code |
| --- | --- | --- |
| Engagement state | The 11 specification states, stored on `Engagement.state` with append-only `EngagementTransition` history. | `states` |
| Lifecycle command | The only way to change state; each has an evidence predicate. | `lifecycleCommands`: `OPEN_PROPOSAL`, `DISPATCH_PROPOSAL`, `REJECT_PROSPECT`, `ISSUE_ENGAGEMENT_LETTER`, `ACTIVATE_PORTAL`, `START_FIELDWORK`, `SUBMIT_FOR_REVIEW`, `RETURN_FOR_REWORK`, `APPROVE_MANAGER_REVIEW`, `AUTHORIZE_FINAL_REPORT`, `RELEASE_FINAL_PACKAGE`, `LOCK_ARCHIVE` |
| Gate code | Structured reason a command is refused (for example `CLIENT_ACCEPTANCE_MISSING`, `SRM_NOT_COMPILED`). | `lifecycleGateCodes` |
| Placeholder gate | A gate that currently always fails because its evidence does not exist yet. Removed by the owning task. | `fail(...)` calls without a condition in `governance/lifecycle.ts` |

## Commercial

| Term | Meaning | Code |
| --- | --- | --- |
| Lead | Intake record; NEW → PROFILED → PROPOSAL_ENTRY; channels phone, WhatsApp, email, web, referral. | `commercial/leads.ts` |
| Proposal | Versioned commercial offer; `DRAFT` → `PRESENTED` (snapshot) → `ACCEPTED` (client response). | `CommercialProposal`, statuses `DRAFT`/`PRESENTED`/`ACCEPTED` |
| Key 1 | Client acceptance of the exact presented proposal revision, with evidence. | `key1Status` |
| Key 2 | Partner risk clearance citing the current acceptance-case review version. | `key2Status`, `RISK_PARTNER_CLEAR` |
| Acceptance case | New-client (NC-1) or continuance (CO-1) questionnaire instance. | `AcceptanceCase` (Prisma) |
| Engagement type | Report/letter route. | `documentTemplateEngagementTypes`: `EXTERNAL_STATUTORY_AUDIT`, `INTERNAL_AUDIT`, `AGREED_UPON_PROCEDURES` |
| Advance / final invoice | The two 50 % milestones. | invoice kind `ADVANCE_50`, `FINAL_50` |

## Documents

| Term | Meaning | Code |
| --- | --- | --- |
| Document version | Immutable, scoped metadata for exact provider bytes (drive/item/version/hash). | `DocumentVersion` (Prisma) |
| Template kind | Versioned firm template families, including the five deliverables. | `documentTemplateKinds`: `BRIEF_QUOTATION`, `COMPREHENSIVE_PROPOSAL`, `ENGAGEMENT_LETTER`, `D1_AUDITOR_REPORT` … `D5_FINAL_FEE_NOTE` |
| Approved asset | Firm-approved image/PDF used in templates; signature and seal are images, not cryptographic signatures (D08). | `approvedAssetCategories`: `FIRM_PROFILE`, `REGISTRATION`, `CREDENTIAL`, `TEAM_CV`, `PARTNER_SIGNATURE`, `FIRM_SEAL` |
| Engagement folder | The five specification folders. Defined as upload categories; provisioning is T064. | `documentUploadCategories` |

## Trial Balance and planning

| Term | Meaning | Code |
| --- | --- | --- |
| TB import | One uploaded TB file; QUEUED → PARSING → MAPPING_REQUIRED → FINALIZED (or FAILED). | `TbImport`, `TbRow`, `TbImportRowError` (Prisma) |
| FSLI | Financial statement line item a TB account maps to. **Target:** a code from the approved taxonomy version (STE-JS-01). **Today:** one of seven hard-coded labels. | `TaxonomyLine.code`; legacy `fslis` |
| Taxonomy version | Versioned, approved list of FSLI lines with statement section and order. | `TaxonomyVersion`, `TaxonomyLine`; `statementSection` `INCOME`/`EXPENSE`/`ASSETS`/`LIABILITIES`/`EQUITY` |
| Mapping memory | Client-scoped record of approved account → FSLI choices, used for suggestions. | `MappingMemoryEntry` |
| Publication | Immutable published balances bound to a mapping approval; what materiality reads. | `BalancePublication`, `PublishedBalanceRow` |
| Benchmark | Base for PM. Specification: PBT 5–10 %, revenue 0.5–2 %, total assets 0.5–1 %, equity/net assets 1–2 %. | `materialityBenchmarkKinds` (also lists two extras to remove, STE-JS-02) |
| PM / TE / SAD | Planning materiality; tolerable error (50–75 % of PM); Summary of Audit Differences trivial threshold (3–5 % of PM). | `MaterialityAssessment` |
| Adjusted PM | Manager's practical PM within inclusive ±5 %, partner-approved (D05). Not yet implemented. | — |
| Risk band | GREEN / AMBER / RED. Specification and D05: by `abs(balance)` against TE and PM, or forced RED. Today: likelihood × magnitude per risk item. | `riskBands`, `RiskBandAssessment` |

## Fieldwork, review and reporting (records still to build)

| Term | Meaning | Owning task |
| --- | --- | --- |
| Workprogram template / instance | Versioned standard procedures per FSLI, copied by version into an engagement. | T090, T091 |
| Ad-hoc step | Engagement-specific procedure row added during fieldwork. | T093 |
| Physical evidence reference | File index, box and shelf (for example `X-1, Box 3, Shelf B`). | T095 |
| Sampling run | Persisted population and selection (MUS, systematic, stratified). | T098–T101 |
| Audit adjustment | Client audit adjustment journal; never the firm's ledger. | `AdjustmentJournal` (T103, T104) |
| Review note | Reviewer note on a step/FSLI; target states OPEN → RESPONDED → RESOLVED / REOPENED. Today only OPEN → RESOLVED. | `ReviewNote` (T108) |
| Confirmation | Bank, AR, AP, inventory or legal third-party confirmation; critical ones block release. | T111–T113 |
| Holding letter | Pending-confirmation letter to client management, issued once per blocking set. | T113 |
| SRM | Summary Review Memorandum compiled from versioned module queries. | T114–T116 |
| Opinion | Unmodified (spec "Clean/Unqualified"), qualified, disclaimer, adverse; modified types need an FSLI and basis text. | T118 |
| Five-part bundle | D1 report and statements, D2 management letter, D3 LOR, D4 correspondence trail, D5 final fee note. | T119–T130 |
| Archive lock | Read-only state 60 calendar days after signature, or earlier by partner lock; sealing is a separate state. | T131–T138 |
