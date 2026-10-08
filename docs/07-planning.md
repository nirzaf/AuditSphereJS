# Remaining stories — 07-planning: Planning, TB production flow and materiality

**Status: PROPOSED** · verified against `main` at `9b65b2b` (2026-10-08). Completed tasks of this phase are not listed.

Each entry is the *delta* to the task card. The card keeps the full checklist and acceptance criteria; read it, then this entry, then only the files named here.

| Remaining | IN_REVIEW: 8 | NOT_STARTED: 4 |
| :--- | :--- | :--- |

## T078 — Promote import proof into a configurable production column-mapping flow

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/07-planning/T078-tb-column-mapping.md)

**Requirements:** R041 Excel/CSV TB imports from source systems.

**Depends on:** T051 (IN_REVIEW), T077 (NOT_STARTED).

**Can start:** after T051 and T077 are DONE (the card requires DONE dependencies).

**Already in code:** Fixed header rule `code, name, current, prior` in CSV and XLSX readers.

**Remaining:**

- Everything in the card: configurable column mapping per source layout (QuickBooks, Tally, Zoho exports).

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T078` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T078/handoff.md` is appended; the ledger row is updated after review.

## T079 — Validate TB balance, account identity and period controls

`IN_REVIEW (ledger says NOT_STARTED; proven in b0b5786)` · CORE · owner `fieldwork` · [task card](../../tasks/07-planning/T079-tb-validation.md)

**Requirements:** R041 Excel/CSV TB imports from source systems; R044 CY/PY balances and percentage variance.

**Depends on:** T078 (NOT_STARTED), T023 (DONE).

**Can start:** after T078 is DONE (the card requires DONE dependencies).

**Already in code:** Unbalanced finalize refused, sibling-batch code isolation, golden 5,000-row reconciliation (`tests/tb-validation.integration.ts`).

**Remaining:**

- Required-account policy, statutory period identity, grouped-duplicate confirmation, warning-versus-blocker categories.

**Decide first:**

- DN-04 (four TB validation policies).

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T079` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T079/handoff.md` is appended; the ledger row is updated after review.

## T080 — Implement approved mapping memory and corrections

`IN_REVIEW` · CORE · owner `fieldwork` · [task card](../../tasks/07-planning/T080-mapping-memory.md)

**Requirements:** R042 Historical FSLI mapping memory.

**Depends on:** T079 (IN_REVIEW), T046 (IN_REVIEW).

**Can start:** after T079 and T046 are DONE (the card requires DONE dependencies).

**Already in code:** Versioned, immutable, stale-aware approved mappings writing client-scoped memory.

**Remaining:**

- Corrections workflow (supersede a memory entry with reason and approver).

**Decide first:**

- DN-05 whether firm-wide memory is allowed at all.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T080` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T080/handoff.md` is appended; the ledger row is updated after review.

## T081 — Finalize an immutable TB version through real business gates

`IN_REVIEW` · CORE · owner `fieldwork` · [task card](../../tasks/07-planning/T081-tb-finalize.md)

**Requirements:** R041 Excel/CSV TB imports from source systems; R042 Historical FSLI mapping memory; R043 P/L top and B/S bottom dashboard; R079 All 11 lifecycle states and rework transitions.

**Depends on:** T080 (IN_REVIEW), T049 (IN_REVIEW), T028 (DONE).

**Can start:** after T080 and T049 are DONE (the card requires DONE dependencies).

**Already in code:** Single-winner concurrent finalize, earlier version stays queryable (`tests/tb-finalize-versions.integration.ts`).

**Remaining:**

- AC1 not proven: planning-state and assigned-user guards on finalize.
- Immutable snapshot committed in the same operation as finalize.
- Mapping/taxonomy approval lineage (MIG-009).

**Decide first:**

- DN-06 supersession rule — two imports in one engagement can both be FINALIZED today.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T081` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T081/handoff.md` is appended; the ledger row is updated after review.

## T082 — Complete split financial statement dashboard and drill-down

`NOT_STARTED` · CORE · owner `fieldwork` · [task card](../../tasks/07-planning/T082-fsli-dashboard.md)

**Requirements:** R043 P/L top and B/S bottom dashboard; R044 CY/PY balances and percentage variance; R045 AR and workprogram action triggers.

**Depends on:** T081 (IN_REVIEW), T023 (DONE).

**Can start:** after T081 is DONE (the card requires DONE dependencies).

**Already in code:** Statement-summary API (T050) and route placeholders for AR / workpaper.

**Remaining:**

- Angular split dashboard: P&L upper half, balance sheet lower half, CY / PY / % variance, `[AR Test]` and `[Audit Workprogram]` on every line, drill-down to accounts of that FSLI and version.
- Requires STE-JS-01 so COGS and Inventory lines (shown in the specification) can exist.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T082` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T082/handoff.md` is appended; the ledger row is updated after review.

## T083 — Implement team assignment, availability and capacity calendar

`NOT_STARTED` · CORE · owner `governance` · [task card](../../tasks/07-planning/T083-scheduling.md)

**Requirements:** R028 Availability, utilization and leave capacity calendar; R029 Engagement team roles.

**Depends on:** T055 (IN_REVIEW), T021 (DONE).

**Can start:** after T055 is DONE (the card requires DONE dependencies).

**Already in code:** None.

**Remaining:**

- Everything in the card.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T083` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T083/handoff.md` is appended; the ledger row is updated after review.

## T084 — Implement statutory-relative milestone planning

`NOT_STARTED` · CORE · owner `governance` · [task card](../../tasks/07-planning/T084-milestones.md)

**Requirements:** R030 Statutory milestone scheduling; R076 Budget versus actual phase hours.

**Depends on:** T083 (NOT_STARTED), T040 (DONE).

**Can start:** after T083 is DONE (the card requires DONE dependencies).

**Already in code:** None.

**Remaining:**

- Everything in the card (Dec 31 → Jan W1 fieldwork → Feb 15 draft → Mar 15 final as the default template).

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T084` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T084/handoff.md` is appended; the ledger row is updated after review.

## T085 — Implement TB-linked benchmark selection and normalization

`IN_REVIEW` · CORE · owner `governance` · [task card](../../tasks/07-planning/T085-materiality-benchmarks.md)

**Requirements:** R032 PBT materiality benchmark 5%-10%; R033 Revenue benchmark 0.5%-2%; R034 Assets benchmark 0.5%-1%; R035 Equity/net-assets benchmark 1%-2%; R036 Planning materiality formula.

**Depends on:** T081 (IN_REVIEW), T003 (DONE).

**Can start:** after T081 is DONE (the card requires DONE dependencies).

**Already in code:** `deriveBenchmark` for six kinds (`governance/materiality.ts`).

**Remaining:**

- See STE-JS-02: `TOTAL_EXPENSES` and `MAPPED_LINE` are offered as benchmarks although D05 says not to substitute them; remove or gate them.
- Normalized PBT: record that the benchmark excludes tax only, or implement recorded normalization adjustments (DN-07).

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T085` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T085/handoff.md` is appended; the ledger row is updated after review.

## T086 — Calculate PM, TE, SAD and manager rounding

`IN_REVIEW` · CORE · owner `governance` · [task card](../../tasks/07-planning/T086-materiality-calculator.md)

**Requirements:** R036 Planning materiality formula; R037 TE/performance-materiality range; R038 SAD/trivial threshold range; R039 Practical rounding within +/-5%.

**Depends on:** T085 (IN_REVIEW), T023 (DONE).

**Can start:** after T085 is DONE (the card requires DONE dependencies).

**Already in code:** `calculateMateriality` on Decimal6, persisted assessments (`materiality-service.ts`).

**Remaining:**

- **Defect (STE-JS-02):** policy ranges differ from CURRENT and D05 — PBT 3–10 % (should be 5–10), total assets 0.5–2 % (0.5–1), net assets 1–5 % (1–2), SAD 1–5 % (3–5).
- **Missing:** manager practical adjustment of PM within inclusive ±5 %, recorded as adjusted PM with unrounded PM, reason, preparer, version and partner approval; TE and SAD computed from the approved PM (D05). No rounding code exists.
- Staleness invalidation (shared with T089).

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T086` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T086/handoff.md` is appended; the ledger row is updated after review.

## T087 — Implement risk colors and mandatory review routing

`IN_REVIEW` · CORE · owner `governance` · [task card](../../tasks/07-planning/T087-risk-classification.md)

**Requirements:** R040 Green/Amber/Red stratification and required reviewers; R059 Partner review of Red areas and SRM.

**Depends on:** T086 (IN_REVIEW), T003 (DONE).

**Can start:** after T086 is DONE (the card requires DONE dependencies).

**Already in code:** `RiskItem` with append-only `RiskBandAssessment`, owner rank by band, mandatory partner clearance of red.

**Remaining:**

- **Defect (STE-JS-03):** bands come from likelihood × magnitude (`riskBand()`), not from D05’s rule `GREEN abs(balance) < TE`, `AMBER TE ≤ abs < PM`, `RED abs ≥ PM` or significant/high inherent risk. Add FSLI balance stratification from the approved materiality and published TB; keep the risk register as the qualitative override.
- Routing into workprograms (T091).

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T087` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T087/handoff.md` is appended; the ledger row is updated after review.

## T088 — Approve version-bound planning and unlock fieldwork

`IN_REVIEW` · CORE · owner `governance` · [task card](../../tasks/07-planning/T088-planning-approval.md)

**Requirements:** R027 Partner risk acceptance blocks operational planning; R029 Engagement team roles; R030 Statutory milestone scheduling; R036 Planning materiality formula; R039 Practical rounding within +/-5%; R040 Green/Amber/Red stratification and required reviewers; R079 All 11 lifecycle states and rework transitions.

**Depends on:** T087 (IN_REVIEW), T084 (NOT_STARTED), T064 (NOT_STARTED), T028 (DONE).

**Can start:** after T087, T084 and T064 are DONE (the card requires DONE dependencies).

**Already in code:** Materiality approval with self-approval refusal, version binding; `START_FIELDWORK` refuses unapproved/stale plans.

**Remaining:**

- Same staleness gate for later lifecycle steps.
- Planning UI that shows the bound TB version and approval.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T088` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T088/handoff.md` is appended; the ledger row is updated after review.

## T089 — Handle new TB/materiality versions after sign-off safely

`IN_REVIEW` · CORE · owner `governance` · [task card](../../tasks/07-planning/T089-planning-change-impact.md)

**Requirements:** R036 Planning materiality formula; R042 Historical FSLI mapping memory; R058 AJEs, unadjusted differences, SAD/PM and estimates in SRM; R059 Partner review of Red areas and SRM; R079 All 11 lifecycle states and rework transitions.

**Depends on:** T088 (IN_REVIEW).

**Can start:** after T088 is DONE (the card requires DONE dependencies).

**Already in code:** A newer publication marks prior assessments stale and blocks approving them.

**Remaining:**

- Formal invalidation notices (T037) and downstream-plan staleness.

**Done when:** the card’s acceptance criteria pass on real code; `pnpm verify:task -- T089` has a recipe in `scripts/verify-task.mjs` and passes; `pnpm verify:affected` passes; `docs/evidence/T089/handoff.md` is appended; the ledger row is updated after review.
