# T069 handoff — canonical invoices and the real commercial onboarding spine

## Identity
Task ID T069 · Requirement IDs R061–R065 (commercial flows), R077 (billing) · Branch `main` · Status `IN_REVIEW`

## Delivered (real implementation, replacing the simulated onboarding journey)

- **Contracts**: `COMMERCIAL_MANAGE` capability; four new lifecycle commands (`OPEN_PROPOSAL`, `DISPATCH_PROPOSAL`, `ISSUE_ENGAGEMENT_LETTER`, `ACTIVATE_PORTAL`); schemas for proposal create/present/accept, risk clearance, invoice issue, payment recording. `contracts:generate`/`contracts:check` pass.
- **Migration `202610020022_commercial_onboarding`**: `CommercialProposal` (revisioned, snapshot + client response), `RiskClearance` (append-only, reason >= 10 chars), `EngagementLetterRecord` (one per engagement, immutable by trigger), `EngagementInvoice` (strict per-firm numbering, ADVANCE_50/FINAL_50, PAID frozen by trigger), `InvoicePayment`/`InvoiceReceipt` (immutable by triggers). Composite scope FKs to Engagement throughout; capability CHECK extended.
- **Commercial service** (`modules/commercial/proposals.ts`): create/present/accept proposal and record risk clearance — every command parses the shared contract, re-checks capability inside the transaction, locks the engagement row, writes the audit event and idempotency receipt atomically. Key 2 requires `RISK_PARTNER_CLEAR`; unauthorized attempts are recorded by T025's security log.
- **Practice invoice service** (`modules/practice/invoices.ts`): firm-numbered invoices under the engagement lock, partial payments until settled, one receipt per settled invoice. Practice owns billing; commercial consumes it as evidence. Module boundaries enforced (`pnpm boundaries`).
- **Lifecycle kernel**: evidence predicates `PROPOSAL_DRAFTED`, `PROPOSAL_PRESENTED`, `DUAL_KEY_CLEARED` (INV-001: the letter is refused unless Key 1 = accepted proposal with client evidence AND Key 2 = Partner clearance; the letter pins the exact proposal revision and fee) and `ADVANCE_SETTLED` (INV-002: full payment plus official receipt before portal activation). State, history, audit events and receipts commit in one transaction.
- **API + UI**: `CommercialController` serves proposals/dual-key; the Practice ledger controller serves invoice routes; the four Commercial screens (`proposals`, `dual-key`, `letters`, `advance`) are now connected workspaces with reviewed submissions and row actions replacing their session-only preparation forms.

## Executed verification
`pnpm exec prisma validate`; `pnpm contracts:generate` / `contracts:check`; `pnpm build:server`; `tsc -p tsconfig.tests.json --noEmit`; `pnpm boundaries`; `pnpm exec ng build web`; `pnpm test` (vitest 81/81); `ng test web` (51/51); `pnpm verify:task -- T069` — `tests/commercial-onboarding.integration.ts` against PostgreSQL 18.6 Testcontainers: PASS. The test walks the real journey (draft → present → dispatch → Key 1 → Key 2 → letter with pinned fee → advance invoice → partial payment → settlement → receipt → PORTAL_ACTIVE_PLANNING), asserts both invariants fail closed in every partial state, proves letter/payment immutability at the database boundary, and replays an idempotent command.

## Limitations (honest)
Proposal acceptance records commercial evidence under `COMMERCIAL_MANAGE` on the firm scope; binding it to real client-portal identities is T020 follow-up. Paid credit notes and AR aging remain open. No live browser walkthrough of the new screens; no deployment occurred.

## Decimal and retry hardening — 2026-10-03

Replaced JavaScript `Number` arithmetic in invoice paid-to-date display, payment settlement and the lifecycle's advance gate with the shared `Decimal6` primitive. Zero-value invoices and payments now fail closed. The PostgreSQL journey asserts the exact cumulative amount, proves that a balance one cent short still blocks portal activation, verifies the final cent clears it, and races identical invoice issuance to confirm one durable invoice/result; same-key/different-amount reuse conflicts.

`pnpm verify:task -- T069` passed (PostgreSQL 18.6 Testcontainers, 1/1); `pnpm verify:affected` passed (81 Vitest tests, plus server/type and Angular build gates). T069 remains `IN_REVIEW`: invoice ledger recognition, credit notes/AR aging and independent review remain outstanding. Its T027 idempotency prerequisite is now recorded `DONE` in the execution ledger.

## Proposal optimistic-version enforcement — 2026-10-03

The present and accept commands now compare the caller's `expectedVersion` with the current proposal revision before changing status. Previously the contracts required the value but the service silently used the current database revision, allowing a stale client to proceed. The PostgreSQL 18.6 onboarding test now proves both stale present and stale accept requests are denied, then confirms the current revision succeeds.

`pnpm verify:task -- T069` passed after this change (PostgreSQL 18.6 Testcontainers, 1/1). This is a focused follow-up to the current `IN_REVIEW` slice; independent review remains pending.

## Canonical invoice integrity and void UI — 2026-10-03

- Issuance now snapshots the exact client-accepted proposal revision and accepted fee from the issued letter; the caller supplies a due date but cannot choose the amount. Advance and final amounts are derived with decimal-safe half-even rounding, with the final amount calculated as the contract-fee remainder.
- Reviewed migration `202610030005_invoice_integrity` adds firm-wide PostgreSQL invoice numbering, immutable line snapshots, scoped proposal/payment/receipt/void references, one active milestone per accepted contract, invoice revisions, and database guards for edits, settlement, overpayment, receipt issuance and unpaid void history.
- Practice owns the invoice commands. Practice exposes scalar advance/final invoice evidence through `public.js`; Governance and Reporting consume that facade, while Practice reads the accepted proposal through Commercial's `public.js`. Cross-module boundaries pass.
- The real Angular billing screen now offers payment recording or reasoned voiding for an `ISSUED` invoice, receipt issue for a settled invoice, and history-only display for `VOID`. It blocks short reasons before sending; paid invoices have no void action and require the future credit-note workflow for correction.
- `scripts/verify-task.mjs` now runs server compilation, contract/OpenAPI drift checks, the PostgreSQL commercial onboarding journey, durable idempotency integration and API contract serialization for T069. The task remains `IN_REVIEW`; invoice ledger recognition, paid credit notes, payment allocation, AR aging and independent review are still outstanding.

### Executed verification

| Command | Result |
| --- | --- |
| `pnpm verify:task -- T069` | Passed: server compile, contracts/OpenAPI, onboarding Testcontainers 1/1, idempotency Testcontainers 1/1 and API contracts Testcontainers 1/1. |
| `pnpm verify:affected` | Passed: boundaries, server and test typechecks, Angular build, 21 Vitest files / 93 tests. |
| Angular CLI MCP `web:test` | Passed: 9 files / 61 tests, including unpaid-void reason validation, PAID/VOID action-state coverage and the API error-reference regression. |
| Angular CLI MCP `web:build` | Passed using the configured build target (the workspace has no named `production` configuration). |
| `pnpm lint` | Passed with four existing unused-disable warnings in the untouched `visual-prototype-simulation/worker/worker-configuration.d.ts`. |
| `git diff --check` | Passed. |
## Local development schema catch-up — 2026-10-03

- Preflight confirmed zero local invoices, outbox events or Trial Balance imports, so the two pending migration backfills had no business rows to rewrite and the invoice snapshot migration had no legacy invoice to reject.
- `pnpm db:migrate` applied `202610030004_durable_outbox_dispatch` and `202610030005_invoice_integrity`; `pnpm db:roles` provisioned the local least-privilege API/worker/report roles. `pnpm exec prisma migrate status` reports the schema up to date.
- Post-migration checks: API readiness is `ready`, the Angular `/api` proxy returns the Entra configuration, and the active Staff Fixture still resolves to exactly one authorized synthetic engagement. No client business records, tenant permissions or provider configuration were changed.

## Atomic invoice ledger recognition — 2026-10-03

- Added migration `202610030008_invoice_ledger_recognition` and the immutable `InvoiceLedgerPosting` relation. New invoice issuance now requires the existing approved `DEFERRED_UNTIL_RELEASE` / `NO_TAX` firm policy, active posting accounts 120 (receivables) and 200 (deferred engagement fees), and an open period containing the issue date. The invoice, balanced posted journal, link, audit record and idempotent outcome commit in the same PostgreSQL transaction.
- PostgreSQL validates that the linked journal is posted and has exactly two lines for the invoice amount. A deferred invoice/link constraint prevents an invoice from committing without recognition. Voiding an unpaid invoice now posts the exact journal reversal in an open period before changing its status; a database guard prevents bypassing the service and voiding it without a posted reversal.
- The PostgreSQL onboarding test proves audit approval authority alone cannot issue an invoice; missing policy leaves no invoice or journal; both account amounts are correct; the exact reversal is posted; a direct database void without reversal rolls back; and a voided advance can be reissued as a new numbered revision. The idempotency suite provisions the required firm accounting records and still verifies concurrent retries and scope behavior.
- Local migration preflight queried zero invoices, journals, periods and posting policies. `pnpm db:migrate` applied only `202610030008_invoice_ledger_recognition`; the local schema is up to date. A populated installation with existing invoices intentionally fails this migration until an explicit, reviewed journal backfill is supplied.

### Executed verification

| Command | Result |
| --- | --- |
| `pnpm verify:task -- T069` | Passed: server build, contract/OpenAPI check, commercial onboarding (PostgreSQL 18.6 Testcontainers 1/1), idempotency (1/1) and API contract integration (1/1). |
| `pnpm verify:affected` | Passed: boundaries, server and test typechecks, Angular production build, 22 Vitest files / 96 tests. |
| `pnpm db:migrate` | Passed after recording zero pre-existing invoice and journal rows; migration 008 applied. |
| `pnpm lint` | Passed with four pre-existing unused-directive warnings in the untouched prototype worker declarations. |
| `git diff --check` | Passed; Git reported existing working-tree line-ending normalization warnings. |
| Built-in browser smoke | The Entra staff fixture remains signed in and assigned to the synthetic acceptance engagement. The Practice screen displays the expected firm-wide Practice permission gate; no business data or grants were changed. |

T069 remains `IN_REVIEW`: explicit multi-invoice payment allocations, paid-invoice credit notes and AR aging remain open, and independent review is still pending. The migration intentionally does not fabricate journal history for pre-existing invoices.

## Payment cash-posting integrity — 2026-10-05

- Each invoice payment now commits with one immutable `InvoicePaymentLedgerPosting` and one canonical posted Practice journal: debit active posting account 100 (cash/bank), credit active posting account 120 (receivables), for the exact payment amount and UTC accounting date. Payment, journal, link, audit and idempotency outcome share the same PostgreSQL transaction.
- Migration `202610050002_invoice_payment_ledger` rejects populated legacy payment tables until an approved journal backfill exists. PostgreSQL validates the journal identity, status, date, exact lines and scope, and a deferred constraint rejects direct payment inserts without a posting link.
- `tests/commercial-onboarding.integration.ts` verifies missing-account rollback, direct-insert denial, exact partial-payment posting, wrong-journal-link denial, immutable link behavior and one posting per payment. `tests/idempotency.integration.ts` now provisions the cash account and continues to cover concurrent payment retries.
- `pnpm verify:task -- T069` passed on fresh PostgreSQL 18.6 Testcontainers: server compile, contracts/OpenAPI, commercial onboarding (1/1), idempotency (1/1) and API contract serialization (1/1). `pnpm verify:affected` passed boundaries, server/test typechecks, Angular production build and Vitest (137 tests across 30 files). `pnpm lint`, `pnpm exec prisma validate` and `git diff --check` passed.

This increment only establishes the single-invoice cash posting. T071 remains open for payment date/method capture, cleared-versus-pending state and explicit allocations across invoices; T072 owns routed receipt delivery. Paid credit notes, AR aging and independent review also remain open. No historic payment ledger entries are inferred.
