# B02 — Owner decisions and professional acceptance

**Status:** Open, 2026-10-08. **Owner:** repository owner. **Kind:** decision. The agent must not choose an option for these; it may only prepare the evidence and the recommendation.

## What is blocked

| # | Decision | Blocks | Evidence | Agent recommendation |
| :-- | :--- | :--- | :--- | :--- |
| 1 | T140 phase set: confirm the phases a time entry may carry | T140 review; the phase column's CHECK constraint | `docs/evidence/T140/handoff.md`; migration `202610080007_practice_time_entries_t140` | Confirm the set as implemented, or name the changes. A change needs a new migration. |
| 2 | SPK-03: expiry of the proposal acceptance token, and whether staff may re-issue it after expiry | STE-JS-04 / T062 ([B03](BLOCKER-03-proposal-acceptance.md)) | `docs/evidence/SPK-03/spike.md` line 71: draft is 7 days from issue, configurable | Keep 7 days. Allow re-issue only as a new single-use token for the same proposal revision, audit-logged. No re-issue after the revision changes. |
| 3 | SPK-01: approved kill timeout for the workbook parse worker | T045 (review) | `docs/evidence/SPK-01/spike.md` line 38: 60 s proposed. Worst in-limit parse measured 16.6 s including the file read, on one machine | Accept 60 s as a provisional value. Before accepting it as final, run the same fixtures on the target environment and append the result to `docs/evidence/SPK-01/`. |
| 4 | SPK-02: how archived evidence is made immutable, and the retention period | T133, T134, T138 | `docs/evidence/SPK-02/spike.md`: draft decision is an object-locked sealed copy (option C) plus a retention label (option A, to be verified in a test tenant). Option B is not recommended: a site permission change reverses it silently, and it needs an amendment to the permission matrix. Retention duration is unspecified in D09. | Approve the draft decision. Owner sets the retention period. Option A's behaviour for members with edit rights stays unverified until a test tenant shows it ([B06](BLOCKER-06-external-tenant-and-hosting.md)). |
| 5 | SPK-05: keep or replace each of the 142 review-class dependency edges | Re-classification of 114 remaining tasks; DN-13 follow-up | `docs/evidence/SPK-05/inventory.md`: `review 142`, `satisfied 90`, `gate 32`, `removed 0` | Work through the list card by card. Keep an edge when it carries data or a contract the dependent task needs. Replace it with a lane entry criterion when it is only sequencing. Record each decision in `docs/decisions/register.json`, the next free number is D26. |
| 6 | SPK-06 scope: whether the block model needs table and page-break kinds | T119, T120, T122, T126 | `docs/evidence/SPK-06/spike.md`: not run. Blocked on T036 acceptance ([B01](BLOCKER-01-independent-review.md)) | Do not decide until T036 is accepted. Then run SPK-06 and decide from its output. |
| 7 | Adoption of the Definition-of-Done recipe rule (DoD item 1) | Whether each task's recipe is required | `docs/07-definition-of-done-additions.md`: status is owner-pending | Adopt, so the rule applies to all tasks. |

## Professional acceptance (not an owner decision)

The methodology defaults in `docs/decisions/register.json` are marked `APPROVED_IMPLEMENTATION_DEFAULT`, approved under the user's delegation to the implementer. That approval is for implementation only. Each record says that professional acceptance is a separate review, to be done in T168 (release and UAT). These defaults cover:

- materiality boundaries and rounding (D05);
- sampling methods and evaluation boundaries (D06);
- archive timing (D09);
- capacity and providers (D11);
- authority and segregation of duties (D12).

A qualified audit-methodology professional and a qualified records owner should review them before release. Until then, the code is not evidence that the methodology is accepted.

## Steps to unblock

1. Read each row's evidence file. Do not decide from this table alone.
2. Record the decision in `docs/decisions/register.json` with the next free D-number, and in `docs/02-decisions-needed.md` as an "Applied" note.
3. Add the decision to the affected card's "Applicable decisions" line.
4. Tell the implementer which decisions are now binding. The agent must not infer them.

## Done when

- Rows 1–5 and 7 have a recorded owner decision. Row 6 waits for T036.
- The professional review of D05, D06, D09, D11 and D12 is scheduled under T168.
