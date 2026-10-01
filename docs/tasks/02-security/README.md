# Phase 02 — Identity, authorization and application controls

**12 task files:** T018–T029. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T018 | [Implement firm, client and engagement ownership constraints](T018-scope-model.md) | CORE | T017 |
| T019 | [Implement the selected internal identity adapter and session boundary](T019-internal-auth.md) | CORE | T018, T012 |
| T020 | [Implement separate portal authentication and first-reset gate](T020-portal-auth.md) | CORE | T018, T012 |
| T021 | [Create explicit permission and segregation-of-duties checks](T021-authorization.md) | CORE | T019, T020 |
| T022 | [Implement canonical runtime contracts and generated browser types](T022-api-contracts.md) | CORE | T009, T010, T021 |
| T023 | [Implement decimal, accounting-date and deterministic clock primitives](T023-money-clock.md) | CORE | T022, T003 |
| T024 | [Share one transaction across module-owned business operations](T024-transaction-context.md) | CORE | T011, T022 |
| T025 | [Implement append-only audit writes with database permissions](T025-audit-write.md) | CORE | T024, T021 |
| T026 | [Add concurrent-safe audit hash chains and checkpoints](T026-audit-chain.md) | CORE | T025, T023 |
| T027 | [Persist idempotent operation outcomes in PostgreSQL](T027-idempotency.md) | CORE | T024, T022 |
| T028 | [Implement guarded engagement transitions and state history](T028-workflow-kernel.md) | CORE | T021, T024, T025, T002 |
| T029 | [Add CSRF, CORS, proxy and request-abuse controls](T029-security-hardening.md) | CORE | T019, T020, T022 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
