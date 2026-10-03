# Commercial
Purpose: own leads, corporate relationships, versioned proposals, quotations, commercial approvals and engagement-letter requests.
Owned use cases: proposal creation/presentation/client acceptance and immutable response evidence; Partner risk clearance; a dual-key engagement-letter gate pinning the accepted proposal revision; pure quotation fee model and configurable approval matrix (P5-01).
Owned tables: CommercialProposal, RiskClearance, EngagementLetterRecord.
Public services: createProposal, presentProposal, acceptProposal, recordRiskClearance, dualKeyStatus, listProposals, and `public.js` acceptedInvoiceContract, which returns the exact accepted proposal snapshot only when the issued letter and both acceptance snapshots match its current revision.
Published events: none yet.
Consumed events: none.
Allowed dependencies: platform services and shared browser-safe contracts; Practice may use only the published `commercial/public.js` contract reader when issuing an invoice.
Forbidden dependencies: another module internals or owned-table mutations. Commercial never creates invoice/payment/ledger records or a second ledger implementation.
State transitions: proposals move from DRAFT to PRESENTED to ACCEPTED with version-checked commands; risk clearance and the issued engagement letter are immutable evidence bound to the exact proposal revision.
Critical invariants: rates are inputs, never looked up in the calculator; every pricing stage rounds to currency precision so the breakdown reconciles to the fee; out-of-range or missing inputs fail closed; an unconfigured firm still gets the documented fail-safe Partner approval. Proposal commands require scoped authorization, expected versions, idempotency and append-only audit; the letter requires both independent keys and pins the accepted fee/revision.
Relevant tests: tests/quotation.test.ts, tests/commercial-onboarding.integration.ts, tests/idempotency.integration.ts; fixtures/characterization/quotation.json; docs/migration/03-differential-report.md.

Functional source: docs/requirements/CURRENT.md (unchanged v2.1). Decision defaults: docs/decisions/register.json. Production evidence and task completion remain separate from this module scaffold.
