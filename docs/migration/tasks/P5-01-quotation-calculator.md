# P5-01 — Quotation fee model and approval matrix port

Status: DONE (pure model and fixtures); persistence, documents and dispatch remain
Intent: Port the source's deterministic quotation fee model and configurable approval matrix exactly, and prove the port against source-quoted fixtures.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `src/AuditSphereOps.Application/Practice/QuotationCalculator.cs`, `src/AuditSphereOps.Application/Practice/CommercialApprovalMatrix.cs`, `src/AuditSphereOps.Domain/Practice/Commercial.cs` (rule kinds).
Destination commit and files: `packages/server/src/modules/commercial/quotation.ts`, `tests/quotation.test.ts`, `packages/server/src/platform/decimal6.ts` (added `roundTo` and `multiplyRound2`).
Existing T-task links: T060; T061/T062 remain not started; MIG-003, MIG-006.
Dependencies: WP3 quotation fixture; the decimal primitive from P6-01.
Scope: line amount = hours × rate; base → complexity factor → risk premium → discount, with each stage rounded to two decimals half-to-even so the breakdown reconciles to the fee; validation (currency, line count, role/activity, hours scale and bounds, positive rate, duplicate role+activity, complexity/risk/discount ranges) that fails closed; canonical input hash; the approval matrix with discount bands, non-standard-terms rules and the documented fail-safe Partner default.
Non-goals: Persisted quotation versions and fee terms, tender/proposal documents, dispatch and client acceptance of an exact version, rate-card lookup, and any UI.
Current behavior and invariants: rates are inputs, never looked up here. No database, clock, network or generated identifiers. An out-of-range factor throws rather than defaulting to zero. Exactly the default discount threshold is not "over".
Proposed contract / schema change: none yet; persistence and the dual-key commercial workflow are later tasks.
Permission and transaction boundary: not applicable to a pure function; approval and dispatch commands will require scope and capability.
Historical data / document impact: none.
Implementation steps: add the two rounding helpers, port the calculator and matrix, drive them from the fixture, extend the differential harness.
Relevant existing tests: `tests/characterization.test.ts`.
Minimal additional acceptance tests: quoted fee breakdown and reconciliation; line ordering; order-invariant fee and hash; hash sensitivity to discount and terms; per-stage two-decimal rounding; six out-of-range factor rejections; missing rate, duplicate line, bad hours and bad currency; approval default threshold and configured-band selection including an inactive rule.
Commands actually executed: `pnpm build:server`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec vitest run tests/quotation.test.ts`; `pnpm migration:differential`.
Evidence and remaining blockers: `tests/quotation.test.ts` passed (5 tests) and the differential report now shows **46 checks, 46 matched, 0 differences** with **no destination-absent family**. Remaining: persist quotation versions/fee terms, render tender documents, dispatch and record client acceptance of an exact version.
Rollback / forward-recovery impact: additive pure functions; no stored state.
Definition of done: the pure model matches the quoted expectations. The capability row stays PARTIAL until persistence, documents and dispatch exist.
