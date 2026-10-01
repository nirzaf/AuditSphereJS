# Phase 05 — Commercial and acceptance onboarding

**14 task files:** T052–T065. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T052 | [Implement client legal profiles and organizational hierarchy](T052-client-directory.md) | CORE | T018, T051 |
| T053 | [Implement contact roles and routing preferences](T053-contacts.md) | CORE | T052, T037 |
| T054 | [Implement lead stages and proposal-entry workflow](T054-lead-pipeline.md) | CORE | T052, T028 |
| T055 | [Create engagement identity and reusable lifecycle queries](T055-engagement-record.md) | CORE | T053, T054, T028 |
| T056 | [Implement acceptance and continuance questionnaire templates](T056-risk-templates.md) | CORE | T055, T036 |
| T057 | [Implement new-client risk review and independence evidence](T057-acceptance.md) | CORE | T056, T021 |
| T058 | [Implement recurring-client continuance and prior-year checks](T058-continuance.md) | CORE | T056, T057 |
| T059 | [Authorize and record the partner risk key](T059-partner-risk.md) | CORE | T057, T058, T025 |
| T060 | [Implement the brief quotation and fee-term model](T060-quote.md) | CORE | T055, T036, T002 |
| T061 | [Implement the comprehensive proposal document](T061-proposal.md) | CORE | T060, T036 |
| T062 | [Dispatch proposals and record client acceptance of an exact version](T062-proposal-dispatch.md) | CORE | T061, T053, T037, T027 |
| T063 | [Implement the atomic dual-key gate](T063-dual-key.md) | CORE | T062, T059, T024 |
| T064 | [Provision the five-folder engagement taxonomy idempotently](T064-directories.md) | CORE | T059, T032, T030, T002 |
| T065 | [Generate partner-authorized engagement letters](T065-letter.md) | CORE | T063, T064, T036, T004 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
