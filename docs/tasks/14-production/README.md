# Phase 14 — Production verification, migration and release

**15 task files:** T157–T171. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T157 | [Run the complete source lifecycle through real application boundaries](T157-full-journey.md) | GATE | T148, T138 |
| T158 | [Review authentication, object access and output security end-to-end](T158-security-review.md) | GATE | T157 |
| T159 | [Measure full-stack load and resource budgets](T159-load-tests.md) | GATE | T157, T051 |
| T160 | [Prove outage recovery and durable-operation reconciliation](T160-failure-drills.md) | GATE | T159 |
| T161 | [Tune queries and migrations using production-shaped data](T161-database-tuning.md) | GATE | T159, T160 |
| T162 | [Perform PostgreSQL and object-store restore drills](T162-backup-restore.md) | GATE | T160, T161 |
| T163 | [Inventory legacy data and map it without authorizing a rewrite](T163-migration-inventory.md) | CONDITIONAL | T001, T157 |
| T164 | [Rehearse legacy import and reconciliation in isolation](T164-migration-rehearsal.md) | CONDITIONAL | T163, T162 |
| T165 | [Build immutable API, web and worker release artifacts](T165-deployment-artifacts.md) | GATE | T161, T158, T016 |
| T166 | [Rehearse rolling deployment, realtime reconnect and worker drains](T166-rolling-deploy.md) | GATE | T165, T160 |
| T167 | [Create the source-controlled hotfix and incident-repair workflow](T167-hotfix-runbook.md) | GATE | T166 |
| T168 | [Conduct role-based UAT and professional-policy sign-off](T168-uat.md) | GATE | T167, T162 |
| T169 | [Complete the production readiness and dependency recheck](T169-release-review.md) | GATE | T168, T164, T165 |
| T170 | [Execute only an explicitly authorized release or migration cutover](T170-production-cutover.md) | GATE | T169 |
| T171 | [Deliver operating documentation and a verified requirements closure report](T171-handover.md) | GATE | T170 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
