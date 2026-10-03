# Phase 03 — Durable jobs, documents and realtime

**12 task files:** T030–T041. The task files show their initial status; use the [execution ledger](../../guides/13-execution-ledger.md) for current status.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T030 | [Implement a durable outbox with operation reconciliation](T030-outbox.md) | CORE | T027, T025 |
| T031 | [Configure BullMQ workers for reliable retries and shutdown](T031-queue-runtime.md) | CORE | T030, T013 |
| T032 | [Implement private SharePoint/OneDrive storage and immutable document versions](T032-storage-metadata.md) | CORE | T018, T024, T006 |
| T033 | [Implement bounded upload initiation and finalize-time authorization](T033-upload-pipeline.md) | CORE | T032, T021, T029 |
| T034 | [Implement scoped document downloads and delivery receipts](T034-downloads.md) | CORE | T032, T021 |
| T035 | [Prove a constrained HTML-to-PDF worker on the target image](T035-pdf-runtime.md) | CORE | T031, T032, T004 |
| T036 | [Build versioned document templates and approved assets](T036-template-catalog.md) | CORE | T035 |
| T037 | [Implement role-routed notifications and auditable outbound dispatch](T037-notifications.md) | CORE | T030, T031, T021 |
| T038 | [Implement authenticated Socket.IO rooms and safe reconnects](T038-realtime.md) | CORE | T021, T022, T031 |
| T039 | [Implement owner-safe advisory edit leases](T039-leases.md) | CORE | T038, T027 |
| T040 | [Implement durable deadline scanning and maintenance claims](T040-scheduler.md) | CORE | T031, T023, T030 |
| T041 | [Add operational metrics, redaction and dependency health](T041-platform-observability.md) | CORE | T031, T040, T038 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
