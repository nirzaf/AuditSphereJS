# Phase 04 — Trial Balance technical proof

**10 task files:** T042–T051. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T042 | [Build deterministic TB fixtures and a test-only engagement seed](T042-tb-fixtures.md) | CORE | T028, T023, T041 |
| T043 | [Implement import-batch staging and source-document provenance](T043-tb-staging.md) | CORE | T042, T033, T024 |
| T044 | [Implement bounded CSV parsing in a background worker](T044-csv-parser.md) | CORE | T043, T031 |
| T045 | [Implement bounded XLSX parsing and hostile-file limits](T045-xlsx-parser.md) | CORE | T043, T031 |
| T046 | [Implement deterministic mapping suggestions with provenance](T046-mapping-prototype.md) | CORE | T044, T045 |
| T047 | [Build a virtualized Angular TB grid with bounded data windows](T047-grid-shell.md) | CORE | T046, T010, T022 |
| T048 | [Add keyboard editing, selection, clipboard and local undo](T048-grid-keyboard.md) | CORE | T047 |
| T049 | [Implement atomic batch mapping with expected versions](T049-batch-mapping.md) | CORE | T048, T024, T027, T039 |
| T050 | [Prove finalization and FSLI aggregation on synthetic data](T050-tb-summary-proof.md) | CORE | T049, T023 |
| T051 | [Measure the TB slice and freeze its interaction contract](T051-tb-proof-gate.md) | GATE | T050, T014 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
