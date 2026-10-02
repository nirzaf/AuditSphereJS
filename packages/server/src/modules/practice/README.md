# Practice
Purpose: own the practice domain described in the architecture plan.
Owned use cases: firm chart, date-only periods, policy-gated balanced journals, immutable posting, exact reversals, period closure and firm trial-balance query; pure contract-contribution calculation. Billing, time, profitability, monthly statements and AR aging remain pending.
Owned tables: PracticeAccount, PracticePeriod, FirmPostingPolicy, PracticeJournal, PracticeJournalLine.
Public services: createPracticeAccount, createPracticePeriod, approveFirmPostingPolicy, createPracticeJournal, postPracticeJournal, reversePracticeJournal, closePracticePeriod, reopenPracticePeriod, practiceLedger, calculateContractContribution, validateContractContribution.
Published events: none yet.
Consumed events: none.
Allowed dependencies: platform services and shared browser-safe contracts.
Forbidden dependencies: another module internals or owned-table mutations.
State transitions: the CURRENT gate definitions are available; production transition commands are not implemented yet.
Critical invariants: explicit firm-wide grants, optimistic versions and receipt idempotency, same-firm composite foreign keys, non-overlapping periods, draft-free reasoned period close, privileged reasoned period reopen, open-period reversal dates, approved posting policy, active posting accounts, PostgreSQL-balanced nonzero double entry, posted immutability, exact reversing entries, serialized line/posting/period-close races, decimal strings and append-only audit. Contract contribution reports unavailable rather than zero whenever a rate, currency or input is missing, and is never labelled payroll-cost profit (D07).
Relevant tests: tests/practice-ledger.integration.ts, tests/practice-analytics.test.ts and the shared unit-of-work tests; full billing and production acceptance still pending.

Functional source: docs/requirements/CURRENT.md (unchanged v2.1). Decision defaults: docs/decisions/register.json. Production evidence and task completion remain separate from this module scaffold.
