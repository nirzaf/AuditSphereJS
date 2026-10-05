# T071 handoff — payments, allocations and the cleared-advance gate

Status: `IN_REVIEW` (independent review pending). Payments record amount/reference against an issued invoice with overpayment rejection and settlement transition; the portal gate (`ACTIVATE_PORTAL`) requires the active advance fully paid and receipted.

- AC1: partial or uncleared payment cannot activate the portal (`tests/commercial-onboarding.integration.ts`).
- AC2: uniqueness policy — duplicate submissions replay one durable result per operation key; changed terms under the same key conflict; payment totals can never exceed the invoice balance (proven). Provider-level duplicate references are informational by policy, recorded here rather than invented as a constraint.
- AC3: payment writes, settlement transition and audit events commit or roll back together (proven: a refused payment leaves no payment row and no journal).

Single-invoice settlement posting into the firm ledger is now implemented as described below. Explicit allocation records across multiple invoices remain open.

## Single-invoice cash journal foundation — 2026-10-05

The shared Practice invoice-payment path now creates and links one posted account-100/account-120 journal in the same transaction as each payment. PostgreSQL enforces the exact payment amount, UTC accounting date, journal identity and immutable one-to-one link, and denies direct unposted payment inserts. Fresh Testcontainers coverage is in `tests/commercial-onboarding.integration.ts` and the `T069` recipe because this increment also verifies canonical invoice behavior.

This does not complete T071: explicit multi-invoice allocations, payment date/method, cleared-versus-pending state and receipt-generation intent remain open. T071's T070 dependency remains a gate before its full implementation and acceptance.
