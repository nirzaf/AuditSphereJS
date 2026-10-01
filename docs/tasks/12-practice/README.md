# Phase 12 — Practice analytics and bookkeeping reports

**10 task files:** T139–T148. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T139 | [Implement effective-dated staff charge-out rates](T139-rate-cards.md) | CORE | T066, T021, T023 |
| T140 | [Record daily hours by engagement, phase and FSLI](T140-timesheets.md) | CORE | T139, T088 |
| T141 | [Approve time corrections and period submission](T141-time-approval.md) | CORE | T140 |
| T142 | [Implement engagement phase budgets and actual-hour comparisons](T142-budgets.md) | CORE | T084, T141 |
| T143 | [Implement source profitability and realization views with correct labels](T143-realization.md) | CORE | T142, T069 |
| T144 | [Record the required operating expense and withdrawal categories](T144-operating-expenses.md) | CORE | T068, T032 |
| T145 | [Implement the firm trial balance with opening and period movement](T145-firm-trial-balance.md) | CORE | T144 |
| T146 | [Implement monthly firm Profit and Loss reporting](T146-firm-pl.md) | CORE | T145 |
| T147 | [Implement allocated-payment accounts-receivable aging](T147-ar-aging.md) | CORE | T071, T125, T145 |
| T148 | [Reconcile all firm reports and audit financial adjustments](T148-practice-reconciliation.md) | GATE | T147, T146, T143 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
