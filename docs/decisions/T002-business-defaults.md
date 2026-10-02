# D01–D12 — Workflow, authority and provider implementation defaults

**Decision state:** Approved implementation defaults under the user's 2026-10-01 delegation to Codex. The register remains the owner/source map. This record does not amend v2.1 CURRENT and does not claim independent professional, legal, provider or production acceptance.

## Workflow conflict decisions

- **D01 — Final 50% fee:** The advance is invoiced with the partner-authorized engagement letter. The remaining 50% invoice is issued once, when the final bundle is authorized for external release, not when a draft report is sent. Use `(engagementId, FINAL_FEE)` as the idempotency/business key; a retry returns the same invoice and never creates another. Update generated quote wording to match this implementation choice without editing CURRENT.
- **D02 — Client access and downloads:** At final release, disable all client uploads and PBC mutations. Keep a separate read-only release/download grant until the 60-calendar-day archive deadline from T004; revoke the client's engagement portal session at archive closure. This preserves final-bundle delivery while giving “engagement closure” one lifecycle boundary. Staff may resend a released artifact through an audited delivery workflow; it does not reactivate client upload access.
- **D03 — Signed LOR:** Use [T004](T004-records-defaults.md): prepare from the approved report snapshot; require current engagement-matched signed LOR before final package validation/external release; no routine bypass.
- **D04 — Acceptance order:** Create one versioned `AcceptanceReview` per client/engagement. Partner risk acceptance is a prerequisite to engagement-letter generation and directory provisioning. The later governance activation gate references that exact accepted review/version; it is not a second approval. Keep client portal activation separate and blocked until the advance payment is cleared.

## Remaining register decisions

- **D05/D06/D07:** use [T003](T003-methodology-defaults.md); these specify decimal/materiality/sampling defaults and the charge-out metric label.
- **D08/D09/D10:** use [T004](T004-records-defaults.md) and [D08 image-signature decision](D08-image-signature.md); image marks are not cryptographic signatures, archive controls are distinct, and non-statutory reporting is scope-bound.
- **D11 — Identity, external storage and capacity:** Entra ID is the internal staff identity provider; Microsoft Graph is the server integration; SharePoint is the evidence repository and OneDrive for Business is working-file storage. The browser receives neither Graph app credentials nor direct storage access. Do not add per-file subscription limits; enforce explicit technical request/size quotas and report infrastructure capacity separately. The tenant/provider selection is not proof of configured production backup, region or retention. T006 records what remains to be accepted.
- **D12 — Authority:** A user acts through scoped, expiring engagement grants. Preparers edit assigned work and cannot approve their own work, partner-sign or release. Reviewers review/rework assigned engagement work and cannot issue the final opinion or release. The engagement partner performs acceptance, high-risk/SRM and final-report approvals. Clients can upload only to their scoped PBC requests and read/download released files while their separate grant is active. Tenant/system administrators receive operational administration only; administrator status does not imply partner authority. Enforce segregation of duties at the domain command and database write boundary, not only in the UI.

## Policy gate result contract

The task-readiness gate in `scripts/verify-business-decisions.mjs` applies only decisions mapped to a feature task. It returns `ALLOW` when all mapped decisions are approved; `POLICY_PENDING` when a mapped record is absent, pending or lacks approval evidence; and `VALIDATION_ERROR` for a malformed or unmapped task identifier. A pending decision on one feature does not block an unrelated feature. This is a planning/verification check, not a production authorization system; each feature task must still enforce its domain policy when implemented.

The machine-readable mapping and expected gate outcomes are in [T002 gate vectors](T002-policy-gate.json). Independent professional/provider acceptance remains explicit where the linked D05–D11 decisions require it.
