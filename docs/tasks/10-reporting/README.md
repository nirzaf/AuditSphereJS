# Phase 10 — Reporting and controlled release

**13 task files:** T118–T130. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T118 | [Implement the partner-only four-way opinion workflow](T118-opinion.md) | CORE | T117, T004 |
| T119 | [Assemble audited financial-statement snapshots for D1](T119-financial-statements.md) | CORE | T118, T104, T036 |
| T120 | [Render correct opinion-specific report sections and partner preview](T120-report-basis.md) | CORE | T119, T036 |
| T121 | [Implement D2 deficiencies, impacts and recommendations](T121-management-letter.md) | CORE | T117, T036 |
| T122 | [Generate D3 LOR for client letterhead and signature](T122-lor-draft.md) | CORE | T119, T036, T002 |
| T123 | [Receive and verify signed management representation before freeze](T123-lor-return.md) | CORE | T122, T075 |
| T124 | [Compile D4 management correspondence and confirmation history](T124-correspondence-trail.md) | CORE | T113, T114, T037 |
| T125 | [Issue or reuse the final 50% invoice at the approved milestone](T125-final-fee.md) | CORE | T069, T119, T002 |
| T126 | [Implement approved partner signature and seal controls](T126-signing.md) | CORE | T120, T123, T004 |
| T127 | [Build the mandatory five-part deliverable package asynchronously](T127-bundle-build.md) | CORE | T126, T121, T124, T125, T031 |
| T128 | [Validate final package completeness and current approval lineage](T128-bundle-validation.md) | CORE | T127, T116 |
| T129 | [Release the package and freeze uploads atomically](T129-release.md) | CORE | T128, T028, T027 |
| T130 | [Track delivery and expose final downloads without false completion](T130-release-delivery.md) | CORE | T129, T077, T037 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
