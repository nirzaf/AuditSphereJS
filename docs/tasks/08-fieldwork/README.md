# Phase 08 — Workprograms, evidence and sampling

**17 task files:** T090–T106. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T090 | [Build versioned standard workprogram templates](T090-workprogram-templates.md) | CORE | T089, T036 |
| T091 | [Instantiate engagement workprograms from approved snapshots](T091-workprogram-instances.md) | CORE | T090, T088 |
| T092 | [Implement the workprogram procedure editor](T092-step-editor.md) | CORE | T091, T022, T039 |
| T093 | [Add ad-hoc procedures with provenance and review impact](T093-adhoc-steps.md) | CORE | T092 |
| T094 | [Link exact digital evidence versions to workpaper steps](T094-evidence-digital.md) | CORE | T092, T034, T076 |
| T095 | [Capture physical evidence file, box and shelf references](T095-evidence-physical.md) | CORE | T092 |
| T096 | [Implement comparative analytical-review templates](T096-analytical-review.md) | CORE | T082, T023, T091 |
| T097 | [Implement the mandatory going-concern assessment workflow](T097-going-concern.md) | CORE | T096, T003 |
| T098 | [Define immutable sampling populations and execution records](T098-sampling-population.md) | CORE | T091, T003, T081 |
| T099 | [Implement Monetary Unit Sampling using approved golden examples](T099-sampling-mus.md) | CORE | T098, T023 |
| T100 | [Implement Systematic Random Sampling](T100-sampling-systematic.md) | CORE | T098 |
| T101 | [Implement Stratified Attribute Sampling](T101-sampling-stratified.md) | CORE | T098 |
| T102 | [Capture sample exceptions and controlled procedure conclusions](T102-sampling-results.md) | CORE | T099, T100, T101, T094 |
| T103 | [Implement audit adjustment proposals separate from the firm ledger](T103-adjustment-drafts.md) | CORE | T081, T023, T067 |
| T104 | [Approve client audit adjustments and derive adjusted balances](T104-adjustment-approval.md) | CORE | T103, T021, T089 |
| T105 | [Track unadjusted differences and significant estimates](T105-differences-register.md) | CORE | T104, T097 |
| T106 | [Submit a complete version-bound workpackage for review](T106-submit-workprogram.md) | CORE | T102, T105, T095, T025 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
