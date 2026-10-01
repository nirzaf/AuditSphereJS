# Phase 13 — Optional Microsoft 365 integration

**8 task files:** T149–T156. All start `NOT_STARTED`.

[Pack home](../../README.md) · [Complete dependency order](../../guides/01-execution-order.md) · [Execution ledger](../../guides/13-execution-ledger.md)

Implement one file at a time and use its direct prerequisites. Required gates must pass; optional/conditional exclusions require an approved disposition. A later-numbered provider track may be moved earlier only when its prerequisites and the chosen core identity/storage route require it.

| ID | Task file | Class | Dependencies |
| :--- | :--- | :--- | :--- |
| T149 | [Approve optional Microsoft 365 tenant integration scope](T149-m365-policy.md) | OPTIONAL | T006, T021 |
| T150 | [Verify MSAL and Graph packages against the selected Angular/Node stack](T150-m365-compatibility.md) | OPTIONAL | T149, T005 |
| T151 | [Implement internal Entra single sign-on and local role mapping](T151-m365-sso.md) | OPTIONAL | T150, T019 |
| T152 | [Implement Graph mail with bounded permissions and unknown-outcome handling](T152-m365-mail.md) | OPTIONAL | T150, T037 |
| T153 | [Implement staff lookup or synchronization without privilege escalation](T153-m365-directory.md) | OPTIONAL | T150, T018 |
| T154 | [Implement optional SharePoint workspace provisioning behind storage boundaries](T154-m365-sharepoint.md) | OPTIONAL | T150, T064, T034 |
| T155 | [Implement optional Graph change notifications and reconciliation](T155-m365-webhooks.md) | OPTIONAL | T154, T153 |
| T156 | [Run tenant-consent, throttling and revocation integration tests](T156-m365-release-gate.md) | OPTIONAL | T151, T152, T153, T154, T155 |

## Phase exit

All applicable files above have passing acceptance evidence or a formally approved optional/conditional N/A disposition. Review source conflicts and compatibility blockers before continuing. Do not claim that reaching a phase number means the application is deployable.
