# Phase 06 — Billing foundation and PBC portal

**12 task files:** T066–T077. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T066 | [Create the firm chart of accounts and accounting-period controls](T066-accounts-periods.md) | CORE | T023, T065, T003 |
| T067 | [Implement draft journals and balanced posting transactions](T067-journals.md) | CORE | T066, T024, T025 |
| T068 | [Implement journal reversal and controlled period close](T068-reversals.md) | CORE | T067 |
| T069 | [Implement canonical invoices, numbering and billing ownership](T069-invoice-foundation.md) | CORE | T067, T027 |
| T070 | [Issue the advance invoice alongside the approved letter](T070-advance-billing.md) | CORE | T069, T065, T030 |
| T071 | [Record payments, allocations and cleared-advance gate](T071-payments.md) | CORE | T070, T027, T067 |
| T072 | [Generate and route immutable receipt vouchers](T072-receipts.md) | CORE | T071, T035, T037 |
| T073 | [Activate the PBC workspace only after all onboarding gates](T073-portal-activation.md) | CORE | T072, T020, T028, T064 |
| T074 | [Create scoped PBC requests and the portal dashboard](T074-pbc-requests.md) | CORE | T073, T034 |
| T075 | [Attach and re-upload evidence through PBC request controls](T075-pbc-upload.md) | CORE | T074, T033 |
| T076 | [Implement auditor review and mandatory rejection reasons](T076-pbc-review.md) | CORE | T075, T021, T038 |
| T077 | [Expose permitted commercial documents and audit portal isolation](T077-portal-documents.md) | CORE | T076, T072, T034, T002 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
