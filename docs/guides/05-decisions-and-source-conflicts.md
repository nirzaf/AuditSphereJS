# Source conflicts and approval decisions

**Initial state of every decision was PENDING.** The current state and approval evidence are recorded in [`register.json`](../decisions/register.json); status labels without a later decision link preserve the original proposal state. This guide preserves the original ambiguity and proposed direction. An implementation default is not approved source wording or professional certification. Affected behavior may use a recorded user-delegated default, but professional acceptance remains a separate gate where required.

The numerical values, standards references and lifecycle terminology are taken from the supplied requirements. This pack is not legal, accounting or audit-standard certification. Where professional details are absent, the task is to obtain and test the approved specification, not generate a plausible substitute.

## D01 — Final 50% invoice trigger

**Source lines:** `401; 546; 596` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Billing owner and engagement partner.  
**Status:** `PENDING`.

**Unresolved point:** Quotation terms say 50% upon draft report; bundle workflow triggers remaining 50% at release.

**Proposed implementation direction, not approval:** Choose the trigger and due date explicitly. Use one engagement/milestone invoice identity, so draft and release cannot bill the same balance twice.

**Affected tasks:** [T060](../tasks/05-commercial/T060-quote.md), [T125](../tasks/10-reporting/T125-final-fee.md), [T129](../tasks/10-reporting/T129-release.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D02 — Portal closure versus downloads

**Source lines:** `64; 324; 434; 596` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Client-service owner and partner.  
**Status:** `PENDING`.

**Unresolved point:** Persona says access terminates on closure, while final-release workflow permits certified-bundle downloads.

**Proposed implementation direction, not approval:** Separate upload eligibility from sign-in/download entitlement. Define final read-only period and closure explicitly; do not simply keep uploads enabled.

**Affected tasks:** [T020](../tasks/02-security/T020-portal-auth.md), [T077](../tasks/06-billing-portal/T077-portal-documents.md), [T129](../tasks/10-reporting/T129-release.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D03 — Signed LOR return and upload freeze

**Source lines:** `544; 434; 596` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Audit-methodology owner and partner.  
**Status:** `PENDING`.

**Unresolved point:** LOR must be exported, signed by client management and re-uploaded; final release immediately freezes upload.

**Proposed implementation direction, not approval:** Decide whether signed LOR is a prerequisite of report signature/release or an explicitly controlled exception channel exists. No hidden unrestricted late-upload bypass.

**Affected tasks:** [T122](../tasks/10-reporting/T122-lor-draft.md), [T123](../tasks/10-reporting/T123-lor-return.md), [T128](../tasks/10-reporting/T128-bundle-validation.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D04 — Risk acceptance and provisioning order

**Source lines:** `138-175; 185; 411-413; 446; 456; 591` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Engagement partner and product owner.  
**Status:** `PENDING`.

**Unresolved point:** Risk sign-off is needed before the letter yet also appears in the later Governance flow; directory provisioning occurs at risk acceptance, portal only after advance clears.

**Proposed implementation direction, not approval:** Use one acceptance/continuance review referenced by both gates. Private directory creation is not client portal access. Decide whether invite redemption replaces emailed temporary passwords.

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
**Status:** `PENDING`.

**Unresolved point:** Signature/seal PNG appearance is mentioned alongside digitally signed certified PDF.

**Proposed implementation direction, not approval:** Select required assurance: visual endorsement versus independently verifiable cryptographic signature, signer authorization, trust/timestamp/revocation and key custody. A PNG cannot prove the latter.

**Affected tasks:** [T065](../tasks/05-commercial/T065-letter.md), [T126](../tasks/10-reporting/T126-signing.md), [T128](../tasks/10-reporting/T128-bundle-validation.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D09 — Archive dates, retention and post-lock correction

**Source lines:** `550-552; 597-598` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Records/compliance owner and partner.  
**Status:** `PENDING`.

**Unresolved point:** A permanent application read-only state is required 60 calendar days from partner signature; storage retention duration and exceptional correction procedure are not specified.

**Proposed implementation direction, not approval:** Keep source business countdown; approve authoritative signature/report instant, timezone, full-file scope, provider retention and independent post-lock addenda. Do not conflate assembly deadline with permanent legal hold.

**Affected tasks:** [T131](../tasks/11-archive/T131-archive-deadline.md), [T133](../tasks/11-archive/T133-object-retention.md), [T137](../tasks/11-archive/T137-archive-corrections.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D10 — Engagement-type reporting

**Source lines:** `418-419; 529-536` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Audit-methodology owner.  
**Status:** `PENDING`.

**Unresolved point:** Statutory audit and internal audit/AUP template options coexist with a four-way audit-opinion path.

**Proposed implementation direction, not approval:** Define valid templates, gates and outputs per engagement type. Do not force statutory opinion wording onto an AUP engagement without professional approval.

**Affected tasks:** [T065](../tasks/05-commercial/T065-letter.md), [T118](../tasks/10-reporting/T118-opinion.md), [T120](../tasks/10-reporting/T120-report-basis.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D11 — Capacity, providers and licensing

**Source lines:** `44; 489; 551` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Product, operations and security owners.  
**Status:** `PENDING`.

**Unresolved point:** No per-file licensing penalty is required, but there are no workload/SLO/region/provider or component-license budgets.

**Proposed implementation direction, not approval:** Do not add product file-count caps, but approve technical limits, storage region, recovery objectives, paid component/provider costs and support terms. “Unlimited” is not infinite capacity.

**Affected tasks:** [T006](../tasks/00-readiness/T006-deployment-decisions.md), [T051](../tasks/04-tb-proof/T051-tb-proof-gate.md), [T159](../tasks/14-production/T159-load-tests.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).

## D12 — Authority and segregation of duties

**Source lines:** `59-64; 451; 511-518` in [CURRENT](../sources/requirements-current.md).  
**Owner:** Partner and security owner.  
**Status:** `PENDING`.

**Unresolved point:** Preparer limits, reviewer authority and partner firm/engagement authority need explicit assignment, admin and billing permission rules.

**Proposed implementation direction, not approval:** Default deny, distinguish identity/admin/grade/audit role, and approve cross-engagement delegation and no-self-review policy. Directory global-admin status is not partner sign-off.

**Affected tasks:** [T021](../tasks/02-security/T021-authorization.md), [T083](../tasks/07-planning/T083-scheduling.md), [T116](../tasks/09-review/T116-partner-clearance.md).

**Record before implementation:** approved wording, rationale, approver/date, affected tests and whether historical records require migration. Use [the decision template](../templates/decision-record.md).
