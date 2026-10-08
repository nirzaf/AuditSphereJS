# B02 — Owner decisions and professional acceptance

**Status:** Partly resolved, rechecked 2026-10-08. The repository owner previously delegated implementation-default decisions to Codex; the user's current request asks to resolve the listed blockers. Decisions D26–D29 are recorded in `docs/decisions/register.json`. Professional records/methodology acceptance remains separate.

## What is blocked

| # | Decision | Current result | Remaining gate |
| :-- | :--- | :--- | :--- |
| 1 | T140 phase set | **Resolved D27:** `PLANNING`, `FIELDWORK`, `REVIEW`, `REPORTING`, matching the migration/service contract already implemented. | T140 remains IN_REVIEW for independent review and its UI remains unbuilt. |
| 2 | SPK-03 proposal acceptance-token expiry and reissue | **Resolved D28:** seven calendar days; a new audited, single-use token may be issued only for the same still-presented revision. Revision/terms changes require a new presentation. | T062 is still blocked by T061 (NOT_STARTED) and T053 (IN_REVIEW). See [B03](BLOCKER-03-proposal-acceptance.md). |
| 3 | SPK-01 workbook parse worker kill timeout | **Resolved provisionally D29:** 60 seconds, about 3.6 times the measured 16.616-second worst in-limit workbook on the development machine. | Run the same fixtures on the target deployment image and append evidence before final T045 acceptance. |
| 4 | SPK-02 archive immutability and retention period | **Open.** No retention duration or test-tenant record-label result is verified. | T133/T134/T138 and T168 need records-owner inputs and tenant evidence. No tenant setting changed. |
| 5 | SPK-05 classification of 142 dependency edges | **Open.** 142 `review` edges remain; DN-13 removed only three named sequencing edges. | Classify each edge against its task's data and contract requirements; no bulk removal. |
| 6 | SPK-06 renderer block model | **Open.** Spike not run. | Wait for T036 independent acceptance under [B01](BLOCKER-01-independent-review.md). |
| 7 | Definition-of-Done recipe rule | **Resolved D26.** Each remaining task needs a non-empty task-specific `pnpm verify:task -- T###` recipe. | Existing tasks without recipes cannot close until recipes are added. |

## Professional acceptance

Implementation defaults in `docs/decisions/register.json` do not establish professional acceptance. The qualified review of materiality/rounding (D05), sampling (D06), archive/records policy (D09), capacity/providers (D11) and authority/separation of duties (D12) remains for T168 and qualified audit-methodology, security and records reviewers. Do not label these accepted from code or tests alone.

## Remaining steps

1. Run the workbook fixtures on the eventual deployment image and append the exact measurement to `docs/evidence/SPK-01/`.
2. Assign an independent reviewer under B01 before changing any IN_REVIEW task status.
3. Have a records owner provide the retention period and test-tenant label behavior before configuring retention controls.
4. Complete the SPK-05 card-by-card dependency classification and regenerate its inventory.
5. Independently accept T036 before running SPK-06.

## Done when

- Rows 1–3 and 7 have recorded implementation-default decisions (D26–D29).
- Rows 4–6 and the professional sign-offs are completed with actual owner or external evidence, not inferred by an agent.
