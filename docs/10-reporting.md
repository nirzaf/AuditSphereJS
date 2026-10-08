# Remaining stories — 10-reporting: Opinion, deliverables and release

**Status: PROPOSED** · verified against `main` at `9b65b2b` (2026-10-08). Completed tasks of this phase are not listed.

Each entry is the *delta* to the task card. The card keeps the full checklist and acceptance criteria; read it, then this entry, then only the files named here.

| Remaining | NOT_STARTED: 13 |
| :--- | :--- |

## T118 — Implement the partner-only four-way opinion workflow

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T118-opinion.md)

**Requirements:** R062 Four-way partner-exclusive opinion selector; R063 Affected FSLI, mandatory rationale and modified basis text; R079 All 11 lifecycle states and rework transitions.

**Depends on:** T117 (NOT_STARTED), T004 (DONE).

**Can start:** after T117 is DONE (the card requires DONE dependencies).

**Already in code:** Lifecycle placeholder `REPORT_OPINION_MISSING` (line 246).

**Remaining:**

- Everything in the card.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T118` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T118/handoff.md` is appended; the ledger row is updated after review.

## T119 — Assemble audited financial-statement snapshots for D1

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T119-financial-statements.md)

**Requirements:** R043 P/L top and B/S bottom dashboard; R044 CY/PY balances and percentage variance; R058 AJEs, unadjusted differences, SAD/PM and estimates in SRM; R065 D1 report and audited financial statements.

**Depends on:** T118 (NOT_STARTED), T104 (IN_REVIEW), T036 (IN_REVIEW).

**Can start:** after T118, T104 and T036 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Assemble financial statements from approved mapped/adjusted TB snapshots, current/prior columns and reviewed classifications.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T119` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T119/handoff.md` is appended; the ledger row is updated after review.

## T120 — Render correct opinion-specific report sections and partner preview

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T120-report-basis.md)

**Requirements:** R063 Affected FSLI, mandatory rationale and modified basis text; R065 D1 report and audited financial statements.

**Depends on:** T119 (NOT_STARTED), T036 (IN_REVIEW).

**Can start:** after T119 and T036 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Choose approved wording/layout for each opinion type and populate the affected-FSLI rationale in the appropriate basis section.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T120` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T120/handoff.md` is appended; the ledger row is updated after review.

## T121 — Implement D2 deficiencies, impacts and recommendations

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T121-management-letter.md)

**Requirements:** R066 D2 deficiency-impact-recommendation management letter.

**Depends on:** T117 (NOT_STARTED), T036 (IN_REVIEW).

**Can start:** after T117 and T036 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Capture management-letter observations linked to workpapers with deficiency, impact and auditor recommendation.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T121` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T121/handoff.md` is appended; the ledger row is updated after review.

## T122 — Generate D3 LOR for client letterhead and signature

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T122-lor-draft.md)

**Requirements:** R067 D3 LOR export, management signing and re-upload.

**Depends on:** T119 (NOT_STARTED), T036 (IN_REVIEW), T002 (DONE).

**Can start:** after T119 and T036 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Populate the representation template with approved engagement figures and executive signatories.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T122` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T122/handoff.md` is appended; the ledger row is updated after review.

## T123 — Receive and verify signed management representation before freeze

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T123-lor-return.md)

**Requirements:** R067 D3 LOR export, management signing and re-upload; R024 Portal upload freeze on final report release.

**Depends on:** T122 (NOT_STARTED), T075 (NOT_STARTED).

**Can start:** after T122 and T075 are DONE (the card requires DONE dependencies).

**Already in code:** Lifecycle placeholder `SIGNED_LOR_MISSING` (line 250).

**Remaining:**

- Everything in the card.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T123` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T123/handoff.md` is appended; the ledger row is updated after review.

## T124 — Compile D4 management correspondence and confirmation history

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T124-correspondence-trail.md)

**Requirements:** R068 D4 correspondence and confirmation trail.

**Depends on:** T113 (NOT_STARTED), T114 (NOT_STARTED), T037 (DONE).

**Can start:** after T113 and T114 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Collect formal inquiries, sent/received metadata, verified confirmation outcomes and cleared management queries.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T124` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T124/handoff.md` is appended; the ledger row is updated after review.

## T125 — Issue or reuse the final 50% invoice at the approved milestone

`NOT_STARTED` · CORE · owner `practice` · [task card](../../tasks/10-reporting/T125-final-fee.md)

**Requirements:** R010 Brief quotation and 50/50 payment terms; R069 D5 remaining 50% fee note; R078 Firm TB, monthly P/L and client AR aging.

**Depends on:** T069 (DONE), T119 (NOT_STARTED), T002 (DONE).

**Can start:** after T119 is DONE (the card requires DONE dependencies).

**Already in code:** Invoice kind `FINAL_50` exists; `finalInvoiceEvidence` is read by `RELEASE_FINAL_PACKAGE`.

**Remaining:**

- Everything in the card (trigger per D01, no duplicate billing).

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T125` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T125/handoff.md` is appended; the ledger row is updated after review.

## T126 — Implement approved partner signature and seal controls

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T126-signing.md)

**Requirements:** R016 Partner authorization of letter signature/seal; R064 Partner digital signature and firm seal; R065 D1 report and audited financial statements.

**Depends on:** T120 (NOT_STARTED), T123 (NOT_STARTED), T004 (DONE).

**Can start:** after T120 and T123 are DONE (the card requires DONE dependencies).

**Already in code:** Approved asset categories `PARTNER_SIGNATURE`, `FIRM_SEAL` and template block `PARTNER_SIGNATURE` (T036); lifecycle placeholder `PARTNER_IMAGE_APPROVAL_MISSING` (line 247).

**Remaining:**

- Everything in the card.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T126` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T126/handoff.md` is appended; the ledger row is updated after review.

## T127 — Build the mandatory five-part deliverable package asynchronously

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T127-bundle-build.md)

**Requirements:** R065 D1 report and audited financial statements; R066 D2 deficiency-impact-recommendation management letter; R067 D3 LOR export, management signing and re-upload; R068 D4 correspondence and confirmation trail; R069 D5 remaining 50% fee note.

**Depends on:** T126 (NOT_STARTED), T121 (NOT_STARTED), T124 (NOT_STARTED), T125 (NOT_STARTED), T031 (DONE).

**Can start:** after T126, T121, T124 and T125 are DONE (the card requires DONE dependencies).

**Already in code:** Lifecycle placeholder `FINAL_BUNDLE_MISSING` (line 251).

**Remaining:**

- Everything in the card.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T127` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T127/handoff.md` is appended; the ledger row is updated after review.

## T128 — Validate final package completeness and current approval lineage

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T128-bundle-validation.md)

**Requirements:** R065 D1 report and audited financial statements; R066 D2 deficiency-impact-recommendation management letter; R067 D3 LOR export, management signing and re-upload; R068 D4 correspondence and confirmation trail; R069 D5 remaining 50% fee note; R061 Critical confirmation blocks release and triggers holding letter.

**Depends on:** T127 (NOT_STARTED), T116 (NOT_STARTED).

**Can start:** after T127 and T116 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Check artifact hashes, signatures, correct client/period, current opinion/SRM/TB lineage and all release blockers.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T128` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T128/handoff.md` is appended; the ledger row is updated after review.

## T129 — Release the package and freeze uploads atomically

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T129-release.md)

**Requirements:** R024 Portal upload freeze on final report release; R065 D1 report and audited financial statements; R069 D5 remaining 50% fee note; R079 All 11 lifecycle states and rework transitions; R080 Advance must clear before client portal activation.

**Depends on:** T128 (NOT_STARTED), T028 (DONE), T027 (DONE).

**Can start:** after T128 is DONE (the card requires DONE dependencies).

**Already in code:** Lifecycle placeholder `CLIENT_UPLOAD_FREEZE_MISSING` (line 255); portal upload guard checks release (T020).

**Remaining:**

- Everything in the card.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T129` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T129/handoff.md` is appended; the ledger row is updated after review.

## T130 — Track delivery and expose final downloads without false completion

`NOT_STARTED` · CORE · owner `reporting` · [task card](../../tasks/10-reporting/T130-release-delivery.md)

**Requirements:** R006 Isolated CLIENT portal and closure access; R024 Portal upload freeze on final report release; R065 D1 report and audited financial statements; R079 All 11 lifecycle states and rework transitions; R082 Client closure restriction conflicts with released-bundle download path.

**Depends on:** T129 (NOT_STARTED), T077 (NOT_STARTED), T037 (DONE).

**Can start:** after T129 and T077 are DONE (the card requires DONE dependencies).

**Already in code:** nothing found for this task’s records or routes; build from the card.

**Remaining:**

- Everything in the card. Outcome: Dispatch the released package to approved contacts and expose scoped portal downloads.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T130` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T130/handoff.md` is appended; the ledger row is updated after review.
