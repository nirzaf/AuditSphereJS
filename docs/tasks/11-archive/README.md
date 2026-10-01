# Phase 11 — Archive, retention and inspection

**8 task files:** T131–T138. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T131 | [Persist signature-based deadlines and enforce due read-only state](T131-archive-deadline.md) | CORE | T130, T040, T004 |
| T132 | [Create complete archive manifests including working papers](T132-archive-manifest.md) | CORE | T131, T026 |
| T133 | [Apply and verify production object-version retention controls](T133-object-retention.md) | CORE | T132, T006 |
| T134 | [Finalize archive state only after sealing evidence verifies](T134-archive-seal.md) | CORE | T133, T132 |
| T135 | [Implement partner-authorized early archive lock](T135-early-lock.md) | CORE | T134, T021 |
| T136 | [Export regulator inspection packages with hash verification](T136-archive-export.md) | CORE | T134, T034 |
| T137 | [Define controlled post-release corrections without rewriting history](T137-archive-corrections.md) | CORE | T136, T002, T004 |
| T138 | [Verify archive deadlines, races and provider failure recovery](T138-archive-drill.md) | GATE | T137, T135 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
