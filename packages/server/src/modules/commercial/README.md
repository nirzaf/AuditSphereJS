# Commercial
Purpose: own leads, corporate relationships, proposals, quotations, commercial approvals and engagement-letter requests.
Owned use cases: pure quotation fee model and the configurable approval matrix (P5-01). CRM, proposal documents, dispatch and dual-key acceptance are still pending.
Owned tables: none implemented yet.
Public services: calculateQuotation, validateQuotation, quotationInputHash, requiredApprovals, commercialRuleKinds.
Published events: none yet.
Consumed events: none.
Allowed dependencies: platform services and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations. A second invoice or ledger implementation is never created here.
State transitions: quotation versions and their approval history are not persisted yet; approval is a pure evaluation, not a recorded decision.
Critical invariants: rates are inputs, never looked up in the calculator; every pricing stage rounds to currency precision so the breakdown reconciles to the fee; out-of-range or missing inputs fail closed; an unconfigured firm still gets the documented fail-safe Partner approval.
Relevant tests: tests/quotation.test.ts; fixtures/characterization/quotation.json; docs/migration/03-differential-report.md.

Functional source: docs/requirements/CURRENT.md (unchanged v2.1). Decision defaults: docs/decisions/register.json. Production evidence and task completion remain separate from this module scaffold.
