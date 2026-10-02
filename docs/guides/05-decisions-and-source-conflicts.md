# Source conflicts and approval decisions

**Initial state of every decision was PENDING.** The current state and approval evidence are recorded in [`register.json`](../decisions/register.json); status labels without a later decision link preserve the original proposal state. This guide preserves the original ambiguity and proposed direction. An implementation default is not approved source wording or professional certification. Affected behavior may use a recorded user-delegated default, but professional acceptance remains a separate gate where required.

The numerical values, standards references and lifecycle terminology are taken from the supplied requirements. This pack is not legal, accounting or audit-standard certification. Where professional details are absent, the task is to obtain and test the approved specification, not generate a plausible substitute.

## D01 — Final 50% invoice trigger

**Source lines:** `401; 546; 596` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Billing owner and engagement partner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T002 business defaults](../decisions/T002-business-defaults.md). Independent finance acceptance remains separate.

**Unresolved point:** Quotation terms say 50% upon draft report; bundle workflow triggers remaining 50% at release.

**Recorded implementation default:** Issue the final half-fee invoice once at final bundle authorization for release, using one engagement/milestone business key. See T002.

**Affected tasks:** [T060](../tasks/05-commercial/T060-quote.md), [T125](../tasks/10-reporting/T125-final-fee.md), [T129](../tasks/10-reporting/T129-release.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D02 — Portal closure versus downloads

**Source lines:** `64; 324; 434; 596` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Client-service owner and partner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T002 business defaults](../decisions/T002-business-defaults.md).

**Unresolved point:** Persona says access terminates on closure, while final-release workflow permits certified-bundle downloads.

**Recorded implementation default:** Freeze uploads at final release; keep scoped read/download access until the T004 archive deadline, then close the client grant.

**Affected tasks:** [T020](../tasks/02-security/T020-portal-auth.md), [T077](../tasks/06-billing-portal/T077-portal-documents.md), [T129](../tasks/10-reporting/T129-release.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D03 — Signed LOR return and upload freeze

**Source lines:** `544; 434; 596` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Audit-methodology owner and partner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T004 records defaults](../decisions/T004-records-defaults.md). Independent professional acceptance remains separate.

**Unresolved point:** LOR must be exported, signed by client management and re-uploaded; final release immediately freezes upload.

**Recorded implementation default:** Generate the LOR from the approved report snapshot and require the current engagement-matched signature before final package validation/external release; no routine bypass. See T004.

**Affected tasks:** [T122](../tasks/10-reporting/T122-lor-draft.md), [T123](../tasks/10-reporting/T123-lor-return.md), [T128](../tasks/10-reporting/T128-bundle-validation.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D04 — Risk acceptance and provisioning order

**Source lines:** `138-175; 185; 411-413; 446; 456; 591` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Engagement partner and product owner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T002 business defaults](../decisions/T002-business-defaults.md).

**Unresolved point:** Risk sign-off is needed before the letter yet also appears in the later Governance flow; directory provisioning occurs at risk acceptance, portal only after advance clears.

**Recorded implementation default:** One versioned partner acceptance record is referenced by both letter and governance gates; provision the private engagement directory at acceptance, but activate the client portal only after cleared advance payment.

**Affected tasks:** [T057](../tasks/05-commercial/T057-acceptance.md), [T059](../tasks/05-commercial/T059-partner-risk.md), [T064](../tasks/05-commercial/T064-directories.md), [T073](../tasks/06-billing-portal/T073-portal-activation.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D05 — Numeric boundaries and rounding

**Source lines:** `195-213; 468-481; 493` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Audit methodology and finance owner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T003 methodology defaults](../decisions/T003-methodology-defaults.md). External professional-policy acceptance remains separate.

**Unresolved point:** Equality at TE/PM, negative/zero benchmark, rounding of all thresholds and zero-PY variance are not fully specified.

**Recorded implementation default:** See T003 for scale, rounding, boundary, signed-balance, zero-base and failed-benchmark rules. Do not present these defaults as universal ISA rules.

**Affected tasks:** [T023](../tasks/02-security/T023-money-clock.md), [T086](../tasks/07-planning/T086-materiality-calculator.md), [T087](../tasks/07-planning/T087-risk-classification.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D06 — Sampling and audit-methodology detail

**Source lines:** `48-53; 208-213; 503; 507; 517` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Qualified audit-methodology owner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T003 methodology defaults](../decisions/T003-methodology-defaults.md). External professional-policy acceptance remains separate.

**Unresolved point:** Three sampling names are specified but algorithms, confidence factors, evaluation rules and authoritative examples are absent; TE/performance materiality are combined in source terminology.

**Recorded implementation default:** T003 defines method inputs, population rules, selection/evaluation limits and hand-calculated engineering vectors. These do not establish independent ISA/IFRS compliance or professional assurance.

**Affected tasks:** [T099](../tasks/08-fieldwork/T099-sampling-mus.md), [T100](../tasks/08-fieldwork/T100-sampling-systematic.md), [T101](../tasks/08-fieldwork/T101-sampling-stratified.md), [T102](../tasks/08-fieldwork/T102-sampling-results.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D07 — Charge-out metric and firm accounting policy

**Source lines:** `343-355; 560-578` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Finance owner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T003 methodology defaults](../decisions/T003-methodology-defaults.md). Firm accounting policy remains separate.

**Unresolved point:** Source profitability uses hours times charge-out rates, not necessarily actual payroll cost. Recognition, tax treatment, equity withdrawals and periods are not defined.

**Recorded implementation default:** Preserve and clearly label the contracted-fee less charge-out-value metric. Invoice recognition, taxes, payroll costs and partner withdrawals remain undecided and must not be inferred from this metric.

**Affected tasks:** [T066](../tasks/06-billing-portal/T066-accounts-periods.md), [T069](../tasks/06-billing-portal/T069-invoice-foundation.md), [T143](../tasks/12-practice/T143-realization.md), [T146](../tasks/12-practice/T146-firm-pl.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D08 — Signature assurance and credential custody

**Source lines:** `421; 309; 537; 542` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Partner, security and records owners.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under direct user instruction and delegation; see [D08 image-signature decision](../decisions/D08-image-signature.md) and [T004 records defaults](../decisions/T004-records-defaults.md).

**Unresolved point:** Signature/seal PNG appearance is mentioned alongside digitally signed certified PDF.

**Recorded implementation default:** Use version-bound partner image artwork and firm seal with approval of exact report bytes. Do not call the result cryptographically signed. Certificate signatures/eSignature are excluded by direct user instruction.

**Affected tasks:** [T065](../tasks/05-commercial/T065-letter.md), [T126](../tasks/10-reporting/T126-signing.md), [T128](../tasks/10-reporting/T128-bundle-validation.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D09 — Archive dates, retention and post-lock correction

**Source lines:** `550-552; 597-598` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Records/compliance owner and partner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T004 records defaults](../decisions/T004-records-defaults.md). Legal/records acceptance and provider configuration remain separate.

**Unresolved point:** A permanent application read-only state is required 60 calendar days from partner signature; storage retention duration and exceptional correction procedure are not specified.

**Recorded implementation default:** UTC signature-date boundary, 60 calendar days, separate application read-only state, no automatic application disposal, separately scoped legal hold and immutable addenda. See T004.

**Affected tasks:** [T131](../tasks/11-archive/T131-archive-deadline.md), [T133](../tasks/11-archive/T133-object-retention.md), [T137](../tasks/11-archive/T137-archive-corrections.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D10 — Engagement-type reporting

**Source lines:** `418-419; 529-536` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Audit-methodology owner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T004 records defaults](../decisions/T004-records-defaults.md). Independent professional acceptance remains separate.

**Unresolved point:** Statutory audit and internal audit/AUP template options coexist with a four-way audit-opinion path.

**Recorded implementation default:** Statutory audit uses the four-way opinion; internal audit and AUP use separately scoped report templates without an inherited statutory opinion selector. See T004.

**Affected tasks:** [T065](../tasks/05-commercial/T065-letter.md), [T118](../tasks/10-reporting/T118-opinion.md), [T120](../tasks/10-reporting/T120-report-basis.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D11 — Capacity, providers and licensing

**Source lines:** `44; 489; 551` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Product, operations and security owners.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T002 business defaults](../decisions/T002-business-defaults.md) and T006 for unresolved production location/backup acceptance.

**Unresolved point:** No per-file licensing penalty is required, but there are no workload/SLO/region/provider or component-license budgets.

**Recorded implementation default:** Entra ID, Graph, SharePoint and OneDrive are the selected identity/storage path; no per-file cap. Region, backup ownership, SLO, exact production costs and provider retention remain T006/production acceptance items.

**Affected tasks:** [T006](../tasks/00-readiness/T006-deployment-decisions.md), [T051](../tasks/04-tb-proof/T051-tb-proof-gate.md), [T159](../tasks/14-production/T159-load-tests.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D12 — Authority and segregation of duties

**Source lines:** `59-64; 451; 511-518` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Partner and security owner.  
**Status:** `APPROVED_IMPLEMENTATION_DEFAULT` under user delegation; see [T002 business defaults](../decisions/T002-business-defaults.md). Domain enforcement and independent UAT remain separate.

**Unresolved point:** Preparer limits, reviewer authority and partner firm/engagement authority need explicit assignment, admin and billing permission rules.

**Recorded implementation default:** Apply scoped expiring engagement grants and no-self-approval; admin identity never implies partner approval. Role boundaries are defined in T002.

**Affected tasks:** [T021](../tasks/02-security/T021-authorization.md), [T083](../tasks/07-planning/T083-scheduling.md), [T116](../tasks/09-review/T116-partner-clearance.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).
