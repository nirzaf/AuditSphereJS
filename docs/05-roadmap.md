# AuditSphereJS — Roadmap for the remaining 114 tasks

**Status: PROPOSED.** Built from the dependency table in `docs/guides/01-execution-order.md` and the verified statuses in `00-index.md`. Every milestone ends with `main` building, `pnpm verify:all` passing and the ledger updated. Dates are the owner's to set.

## 1. The shape of the remaining work

Computed from the card dependencies (a dependency must be DONE):

- Only **T036** and **T043** can start today; every other remaining task waits on an IN_REVIEW or NOT_STARTED task.
- The longest dependency chain contains **78 of the 114** remaining tasks, starting `T043 → T044 → T046 → T047 → T048 → T049 → T050 → T051 → T052 → …` and ending at `T171`. Followed literally, the pack is almost one serial queue.
- Several edges order work rather than express a data need. Examples: client directory T052 waits for the TB proof gate T051; TB column mapping T078 waits for portal isolation T077; time entry T140 waits for planning approval T088. Work has already landed out of order (T079, T085–T089, T098–T104).

Two consequences:
1. **Closing reviews is the highest-leverage work.** T043 alone gates 123 tasks transitively.
2. **The owner should approve parallel lanes** (DN-13 in `02-decisions-needed.md`) so independent modules can progress without waiting on unrelated gates.

## 2. Milestones

### M0 — Ground truth (documentation only)

| Item | Source |
| --- | --- |
| Update the ledger and status headers | STE-JS-05 |
| Apply the agent-manual corrections | `04-agent-manual-corrections.md` |
| Owner decisions DN-01 … DN-07 and DN-13 | `02-decisions-needed.md` |

**Exit:** ledger matches code; decisions recorded in `register.json`.

### M1 — Close the TB proof gate (T051)

T036, T043, T044, T045, T046, T047, T048, T049, T050, T051, plus **STE-JS-01** (one FSLI vocabulary).
T047 and T048 (grid windows, keyboard editing, undo) are the only NOT_STARTED items; everything else needs its listed open items and an independent review.

**Exit:** T051 DONE; a COGS / Inventory line maps, approves and shows in the P&L half of the statement summary.

### M2 — Commercial onboarding to an issued engagement letter

T052–T065 (14 tasks) plus **STE-JS-04** (client-side acceptance). Connect the session-only Commercial workspaces as each server task closes.

**Exit:** in the browser — lead → profiled client and contacts → acceptance case → partner Key 2 → quotation and proposal → client acceptance by token → `ISSUE_ENGAGEMENT_LETTER` with the engagement-type template.

### M3 — Billing and the client PBC portal

T070–T077 (8 tasks).

**Exit:** advance invoice paid, receipt routed to CFO/FD, `ACTIVATE_PORTAL` passes, client sees PBC requests with the four status badges and rejection reasons; staff and portal isolation proven.

### M4 — TB production flow and planning

T078–T089 (12 tasks) plus **STE-JS-02** (materiality ranges and ±5 % adjustment) and **STE-JS-03** (balance bands). T083/T084 (team, capacity, milestones) can run in parallel once DN-13 allows it.

**Exit:** `START_FIELDWORK` succeeds only on an approved, current, adjusted-if-needed materiality with every FSLI banded.

### M5 — Fieldwork execution

T090–T105 (16 tasks). Removes the placeholder `WORKPROGRAM_SUBMISSIONS_MISSING` (lifecycle.ts lines 226, 234).

**Exit:** split dashboard → `[Audit Workprogram]` opens an instantiated workprogram; samples persisted; adjustments approved; workpackage submission recorded.

### M6 — Review, confirmations and SRM

T106–T117 (12 tasks). Removes `SRM_NOT_COMPILED` and `CRITICAL_CONFIRMATIONS_PENDING` (lines 235, 236). T117 is a gate.

**Exit:** preparer → manager return with mandatory comments → rework → manager clearance → SRM → partner clearance of Red areas, with a holding letter when a critical confirmation is open.

### M7 — Opinion, deliverables and release

T118–T130 (13 tasks). Removes `REPORT_OPINION_MISSING`, `PARTNER_IMAGE_APPROVAL_MISSING`, `SIGNED_LOR_MISSING`, `FINAL_BUNDLE_MISSING`, `CLIENT_UPLOAD_FREEZE_MISSING` (lines 246–255).

**Exit:** `RELEASE_FINAL_PACKAGE` releases the five-part bundle, issues or reuses the final 50 % invoice and freezes portal uploads atomically.

### M8 — Archive

T131–T138 (8 tasks). T133 needs live storage retention controls (SPK-02).

**Exit:** read-only at day 60 or by partner early lock, sealing verified, regulator export hash-verified; T138 gate passed.

### M9 — Practice remainder (parallel lane after DN-13)

T140–T143, T147, T148 (6 tasks). Firm ledger, rates, expenses, firm TB and P&L are already DONE.

**Exit:** hours by engagement, phase and FSLI; budget variance; labelled contract contribution; allocated-payment AR ageing; T148 reconciliation gate.

### M10 — Production readiness (owner-led)

T157–T171 (15 tasks: full journey, security review, load, failure drills, tuning, restore, legacy migration, artifacts, rolling deploy, hotfix runbook, UAT, release review, cutover, handover). Agents prepare harnesses, runbooks and evidence templates; humans authorize and sign off. Needs the targets in `03-nfr-targets.md` approved.

## 3. Suggested lanes once DN-13 is approved

| Lane | Milestones | Shared contract to agree first |
| --- | --- | --- |
| A — TB and planning | M1 → M4 | Taxonomy codes (STE-JS-01), publication API |
| B — Commercial, billing, portal | M2 → M3 | Practice invoice facade (`practice/public.ts`, exists) |
| C — Fieldwork and review | M5 → M6 | Published TB version + approved materiality (from lane A) |
| D — Practice | M9 | Time-entry snapshot (T139, exists) |
| E — Reporting and archive | M7 → M8 | SRM and confirmation queries (from lane C) |

Lanes B and D can start immediately after M0; lane C starts when M4 exits.
