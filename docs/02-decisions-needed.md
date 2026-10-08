# AuditSphereJS — Decisions needed before remaining work

**Status: PROPOSED.** D01–D12 in `docs/decisions/register.json` are all approved implementation defaults. The items below were raised by handoffs or found during verification and are **not** covered by them. Each blocks the named task; an agent must not pick an option itself. When the owner decides, add the decision to `register.json` (next free D-number) and to the affected task card's "Applicable decisions".

Format: context → options → recommendation (engineering view only) → blocks.

---

## DN-01 — How `.xlsx` files reach the import

**Resolved 2026-10-08 by the owner: option A.** Recorded as D13 in `docs/decisions/register.json`; implemented in the T033 screened pipeline (`document-uploads.ts`, migration `202610080003_document_upload_workbook_type`) and the import from a stored version (`importFromDocument`). Option B was not chosen.

**Context.** The workbook reader exists (T045, `fieldwork/workbook.ts`), but no upload route accepts `.xlsx`. Staff uploads go through the ClamAV-screened session pipeline (T033), which accepts PDF and CSV only.

**Options.** A: extend the T033 pipeline to `.xlsx` with the same ZIP preflight before storage. B: a separate JSON/multipart workbook route without the screening pipeline.

**Recommendation.** A — every workbook is malware-scanned and versioned exactly like other evidence.

**Blocks.** T045, T078.

## DN-02 — Cached formula values in workbooks

**Context.** The reader rejects every formula cell. Accounting exports often contain formula totals.

**Options.** A: keep rejecting formulas. B: accept the cached value of a formula cell, record that it was a formula, never evaluate. C: accept only in non-amount columns.

**Recommendation.** B with the formula text stored in raw values and a row warning; A if the firm prefers zero ambiguity.

**Blocks.** T045.

## DN-03 — Formula-like text in exported CSV/XLSX

**Context.** T044 flags the export hazard: cells beginning `=`, `+`, `-`, `@`, tab or carriage return execute in spreadsheet software.

**Options.** A: prefix such cells with an apostrophe on export. B: refuse to export them. C: leave unchanged.

**Recommendation.** A for text columns; never alter numeric amount columns (a leading `-` is a sign).

**Blocks.** T044, every later CSV export (T145 style exports, T136).

## DN-04 — Trial Balance validation policies

**Context.** T079 proves balance and isolation rules but leaves four policies open.

**Questions.** (1) Which accounts must be present (for example retained earnings)? (2) How is the statutory period identified and checked against the engagement period? (3) When two rows share an account code, confirm-and-group or refuse? (4) Which findings are warnings and which block finalization?

**Recommendation.** Start with: no required-account list; period from engagement, mismatch blocks; duplicates refused (current parser behaviour); only balance and mapping failures block.

**Blocks.** T079, T081.

## DN-05 — Firm-wide mapping memory

**Context.** Memory is client-scoped (T080). The card asks whether an approved firm-wide memory exists.

**Options.** A: client-scoped only. B: firm-wide suggestions as a lower-priority source, always labelled.

**Recommendation.** A until a client has no history; then B behind an explicit firm approval.

**Blocks.** T080.

## DN-06 — Supersession of finalized TB versions

**Context.** Two imports in one engagement can both be `FINALIZED` today (T081 handoff).

**Options.** A: at most one active finalized version per engagement; a new one requires an explicit supersede command naming the old version and invalidating its approvals. B: several finalized versions; the latest publication wins.

**Recommendation.** A — materiality, sampling and the SRM must cite one unambiguous TB version.

**Blocks.** T081, T089, T082.

## DN-07 — Benchmarks outside the specification, and "normalized" PBT

**Context.** CURRENT lists four benchmarks; code also offers `TOTAL_EXPENSES` and `MAPPED_LINE`; D05 says not to substitute them silently. CURRENT says "Normalized Profit Before Tax"; code excludes tax lines only.

**Options.** (a) Remove both extras, or keep them as an approved firm extension with their own ranges. (b) PBT normalization: none (document), or recorded adjustments (one-off items) with reason and approver.

**Recommendation.** Remove the extras; implement normalization as recorded, approved adjustments that the calculator receives as inputs, so it stays pure.

**Blocks.** T085, T086 (STE-JS-02).

## DN-08 — Which module owns review notes

**Context.** Card T108 names owner area `fieldwork`; the code lives in `packages/server/src/modules/reporting/review-notes.ts` with the `reporting` README.

**Options.** A: move to `fieldwork` (matches the ownership table in guide 04: "Fieldwork … notes"). B: keep in `reporting` and amend the card and guide 04.

**Recommendation.** A — workprogram submission and rework gates (T106, T109) are fieldwork-owned and need the note counts.

**Blocks.** T108, T109, T110.

## DN-09 — Statement classification authority

**Context.** The P&L / balance-sheet split is hard-coded (`PROFIT_AND_LOSS_FSLIS` in `fieldwork/service.ts`); the T050 handoff says this is an implementation choice, not policy.

**Recommendation.** The approved taxonomy version's `statementSection` is the only authority (STE-JS-01).

**Blocks.** T050, T082.

## DN-10 — "Systematic random sampling" algorithm

**Context.** T100's port is a seeded random draw without replacement (matching the source), while the specification and card name systematic random sampling (random start, fixed interval).

**Options.** A: implement interval-based systematic selection with a recorded random start. B: keep the source algorithm and rename it.

**Recommendation.** A, keeping the source algorithm only if D06 is amended.

**Blocks.** T100.

## DN-11 — Firm-level Practice routes under an engagement path

**Context.** Firm ledger, rates, expenses and firm reports are mounted at `/api/v1/engagements/:engagementId/practice/...` although they are firm-wide and authorized by firm-wide grants.

**Options.** A: add `/api/v1/firm/practice/...` and deprecate the engagement-prefixed routes. B: keep and document why.

**Recommendation.** A before T140–T148 add more firm routes; otherwise every firm screen needs a selected engagement.

**Blocks.** none directly; affects T140–T148 design.

## DN-12 — Wording for the contract-contribution metric

**Context.** The D07 calculator exists (`practice/analytics.ts`) but is unlabelled pending presentation wording (`docs/IMPLEMENTATION-STATUS.md`). T143 AC3 requires labels that distinguish it from ledger P&L.

**Recommendation.** Label: "Contract contribution (fee minus charge-out value of approved time) — not accounting profit".

**Blocks.** T143.

## DN-13 — Parallel lanes instead of one serial dependency chain

**Context.** The longest card dependency chain holds 78 of the 114 remaining tasks (`05-roadmap.md` §1). Some edges are sequencing choices rather than data needs: T052 (client directory) ← T051 (TB proof gate); T078 (TB column mapping) ← T077 (portal isolation); T140 (time entry) ← T088 (planning approval). Work already lands out of order.

**Options.** A: keep the rule "every dependency DONE". B: keep only data dependencies; replace sequencing edges with lane entry criteria (roadmap §3), and record each removed edge in the affected card.

**Recommendation.** B, reviewed edge by edge (spike SPK-05 lists the candidates). Gates (T017, T051, T117, T138 and the T157–T171 production gates) keep their full dependencies.

**Blocks.** Parallel work on lanes B and D before M1 closes.
