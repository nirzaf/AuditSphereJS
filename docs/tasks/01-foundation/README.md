# Phase 01 — Workspace and executable foundation

**11 task files:** T007–T017. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T007 | [Create a minimal pnpm workspace with explicit package ownership](T007-workspace.md) | CORE | T005 |
| T008 | [Make backend ESM builds and decorator injection testable](T008-esm.md) | CORE | T007 |
| T009 | [Bootstrap NestJS with the matched Fastify adapter](T009-api-shell.md) | CORE | T008 |
| T010 | [Create the Angular standalone shell and accessible layouts](T010-angular-shell.md) | CORE | T007 |
| T011 | [Configure Prisma and PostgreSQL with explicit pool limits](T011-database.md) | CORE | T008, T006 |
| T012 | [Add typed configuration and secret-safe environment separation](T012-configuration.md) | CORE | T009, T011 |
| T013 | [Provision reproducible local data services and test containers](T013-local-services.md) | CORE | T006, T011, T012 |
| T014 | [Wire minimal backend, Angular and browser test runners](T014-test-runners.md) | CORE | T009, T010, T013 |
| T015 | [Expose predictable agent verification and dependency-boundary commands](T015-commands.md) | CORE | T014 |
| T016 | [Create clean-install CI and supply-chain checks](T016-ci.md) | CORE | T015, T005 |
| T017 | [Freeze the executable compatibility baseline before domain work](T017-compatibility-smoke.md) | GATE | T016 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
