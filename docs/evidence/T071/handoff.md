# T071 handoff — payments, allocations and the cleared-advance gate

Status: `IN_REVIEW` (independent review pending). Payments record amount/reference against an issued invoice with overpayment rejection and settlement transition; the portal gate (`ACTIVATE_PORTAL`) requires the active advance fully paid and receipted.

- AC1: partial or uncleared payment cannot activate the portal (`tests/commercial-onboarding.integration.ts`).
- AC2: uniqueness policy — duplicate submissions replay one durable result per operation key; changed terms under the same key conflict; payment totals can never exceed the invoice balance (proven). Provider-level duplicate references are informational by policy, recorded here rather than invented as a constraint.
- AC3: payment writes, settlement transition and audit events commit or roll back together (proven: a refused payment leaves no payment row and no journal).

Remaining: explicit allocation records across multiple invoices and settlement posting into the firm ledger.
