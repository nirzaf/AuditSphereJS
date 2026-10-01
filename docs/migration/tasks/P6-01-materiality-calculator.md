# P6-01 — Materiality and risk-band calculator port

Status: DONE (pure calculator and fixtures); persistence, approval and staleness remain
Intent: Port the source's pure materiality and risk-band rules with identical arithmetic, and prove the port against source-quoted fixtures before any database or UI work.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `src/AuditSphereOps.Application/Audit/MaterialityCalculator.cs`, `src/AuditSphereOps.Domain/Audit/MaterialityAndRiskBands.cs`, `src/AuditSphereOps.Domain/Shared/Kernel.cs` (`MoneyPolicy.Normalize`).
Destination commit and files: `packages/server/src/platform/decimal6.ts`, `packages/server/src/modules/governance/materiality.ts`, `tests/materiality.test.ts`, `scripts/migration/differential.mjs`.
Existing T-task links: T085, T086, T087, T089; MIG-003.
Dependencies: WP3 fixtures; no database required.
Scope: a decimal-safe six-decimal primitive with half-to-even rounding; benchmark derivation from mapped statement sections with the tax line excluded from profit before tax; policy validation per benchmark; PM/TE/SAD calculation; risk-band routing with minimum owner rank; a SHA-256 input hash for lineage; a differential harness that reports destination agreement per fixture case.
Non-goals: persistence of assessments/approvals, staleness invalidation, Partner clearance records, and any UI. A visual band is not a professional judgment.
Current behavior and invariants: no database, clock or randomness. A non-positive benchmark fails closed instead of producing a threshold; an out-of-policy rate is rejected, never clamped.
Proposed contract / schema change: none yet; persistence is the next task in this capability.
Permission and transaction boundary: not applicable to a pure function; the eventual approval command will require scope and capability.
Historical data / document impact: none.
Implementation steps: implement `Decimal6`, port the calculator and rules, drive them from the fixture, then run the differential harness.
Relevant existing tests: `tests/characterization.test.ts`.
Minimal additional acceptance tests: quoted revenue figures; every derived benchmark; the tax exclusion; out-of-policy rate and percentage rejection; loss fails closed; the quoted risk-band matrix; half-to-even rounding and float-free arithmetic.
Commands actually executed: `pnpm build:server`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm test`; `pnpm migration:differential`.
Evidence and remaining blockers: `tests/materiality.test.ts` passed and `docs/migration/03-differential-report.md` reports **14/14 checks matched, 0 differences**. Remaining: persist `MaterialityCalculation`/assessment with mapping and dataset lineage, invalidate on new source versions, Partner approval, and the planning/materiality UI.
Rollback / forward-recovery impact: additive pure functions; no stored state.
Definition of done: the pure calculator matches the quoted expectations. The capability row stays PARTIAL until persistence, approval and staleness are implemented.
