# Phase 07 — Production Trial Balance and planning

**12 task files:** T078–T089. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T078 | [Promote import proof into a configurable production column-mapping flow](T078-tb-column-mapping.md) | CORE | T051, T077 |
| T079 | [Validate TB balance, account identity and period controls](T079-tb-validation.md) | CORE | T078, T023 |
| T080 | [Implement approved mapping memory and corrections](T080-mapping-memory.md) | CORE | T079, T046 |
| T081 | [Finalize an immutable TB version through real business gates](T081-tb-finalize.md) | CORE | T080, T049, T028 |
| T082 | [Complete split financial statement dashboard and drill-down](T082-fsli-dashboard.md) | CORE | T081, T023 |
| T083 | [Implement team assignment, availability and capacity calendar](T083-scheduling.md) | CORE | T055, T021 |
| T084 | [Implement statutory-relative milestone planning](T084-milestones.md) | CORE | T083, T040 |
| T085 | [Implement TB-linked benchmark selection and normalization](T085-materiality-benchmarks.md) | CORE | T081, T003 |
| T086 | [Calculate PM, TE, SAD and manager rounding](T086-materiality-calculator.md) | CORE | T085, T023 |
| T087 | [Implement risk colors and mandatory review routing](T087-risk-classification.md) | CORE | T086, T003 |
| T088 | [Approve version-bound planning and unlock fieldwork](T088-planning-approval.md) | CORE | T087, T084, T064, T028 |
| T089 | [Handle new TB/materiality versions after sign-off safely](T089-planning-change-impact.md) | CORE | T088 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
