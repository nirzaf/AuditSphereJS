# Practice ledger foundation — 2026-10-02

Firm ledger tables are separate from client audit adjustment tables. Chart accounts have type, active and posting flags; date-only accounting periods cannot overlap. Explicit firm-wide PRACTICE_READ/MANAGE/POST grants are required and rechecked inside the transaction. An engagement route provides an audited access context, but an engagement-only grant does not authorize the firm's ledger.

Draft creation, posting, period closure and exact reversing journals write audit and command receipts atomically through the shared unit of work. PostgreSQL composite foreign keys reject cross-firm accounts and periods. A header lock serializes line edits against posting; the posting trigger requires at least two nonzero balanced lines, active posting accounts, an open period and a recorded firm posting policy. Posted headers and lines cannot change. Corrections append a journal that exactly swaps the original debits and credits; the original stays posted and immutable. Reports include both sides so a reversal nets the original out.

The default policy supports deferred fees until release and no tax only; selecting another treatment needs an explicit policy implementation. Approval is an authenticated firm-authorized command, not inferred from 50/50 terms. The development-only seed includes the minimal accounts and an explicitly labeled fixture policy. The Practice UI loads the firm chart/balances, creates periods and drafts, posts, closes periods and reverses to a selected period/date.

Invoices, payment allocations, credit notes, bank reconciliation, period reopening, monthly P/L, AR aging, chart administration and professional policy acceptance remain unfinished. This foundation is not full T066–T072 completion or C32 parity.
