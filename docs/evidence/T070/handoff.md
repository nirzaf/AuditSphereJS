# T070 handoff — advance invoice alongside the approved letter

Status: `IN_REVIEW` (independent review pending). `issueInvoice` derives milestone amounts from the letter-secured accepted contract (`acceptedInvoiceContract`), never caller-supplied money; issuance posts deferred-fee recognition into the firm ledger under the approved posting policy (`packages/server/src/modules/practice/invoices.ts`).

- AC1: invoices require the exact client-accepted proposal secured by the issued engagement letter (proven in both integration suites).
- AC2: ADVANCE_50 plus FINAL_50 always equals the contracted fee — half-fee rounding is half-to-even and the final invoice carries the exact remainder (`tests/billing-gates.integration.ts`).
- AC3: retries replay one durable invoice via the operation layer; document rendering is not wired to invoices yet, so render-failure visibility remains pending the document pipeline.

Commands: `pnpm verify:task -- T070`.
