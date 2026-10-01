# Phase 09 — Review, confirmations and SRM

**11 task files:** T107–T117. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T107 | [Implement the reviewer inbox and version-aware inspection](T107-review-inbox.md) | CORE | T106, T021 |
| T108 | [Implement inline review notes and resolution lifecycle](T108-review-notes.md) | CORE | T107, T025 |
| T109 | [Return workpackages with mandatory comments and reassignment](T109-rework.md) | CORE | T108, T028 |
| T110 | [Clear completed workprograms without self-review or stale evidence](T110-manager-clearance.md) | CORE | T109, T087 |
| T111 | [Implement all required third-party confirmation categories](T111-confirmation-register.md) | CORE | T110, T053, T032 |
| T112 | [Dispatch, remind and verify confirmation responses](T112-confirmation-dispatch.md) | CORE | T111, T037, T040 |
| T113 | [Enforce critical confirmation blockers and holding-letter idempotency](T113-holding-letters.md) | CORE | T112, T037, T035 |
| T114 | [Compile the SRM from authoritative versioned module queries](T114-srm-snapshot.md) | CORE | T110, T105, T113 |
| T115 | [Approve the manager recommendation and submit SRM to partner](T115-srm-manager.md) | CORE | T114 |
| T116 | [Implement mandatory Red-area review and partner SRM clearance](T116-partner-clearance.md) | CORE | T115 |
| T117 | [Verify the complete preparer-manager-partner rejection loop](T117-review-e2e.md) | GATE | T116 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
