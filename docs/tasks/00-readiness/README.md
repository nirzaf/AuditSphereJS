# Phase 00 — Requirements, decisions and compatibility

**6 task files:** T001–T006. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T001 | [Preserve the requirements and inspect the implementation starting point](T001-baseline.md) | GATE |  |
| T002 | [Resolve workflow and billing ambiguities without changing the source silently](T002-business-decisions.md) | GATE | T001 |
| T003 | [Approve numerical, sampling and professional-judgment specifications](T003-methodology-decisions.md) | GATE | T001 |
| T004 | [Approve signature, archival and engagement-type policies](T004-records-decisions.md) | GATE | T001 |
| T005 | [Review every direct dependency and reconcile version evidence](T005-dependency-review.md) | GATE | T001 |
| T006 | [Select deployment targets, storage and external-provider boundaries](T006-deployment-decisions.md) | GATE | T001, T004 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
