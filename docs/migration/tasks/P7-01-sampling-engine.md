# P7-01 — Deterministic sampling engine port

Status: DONE (pure engine and fixtures); persistence, evaluation and physical evidence remain
Intent: Port the source's deterministic sampling engine exactly, including its generator, and prove the port against source-quoted fixtures.
Source commit and files: `nirzaf/AuditSphere@64713e808d165b4ef91ea4be4979e0f98fb2def3`; `src/AuditSphereOps.Domain/Audit/AuditSamplingEngine.cs`.
Destination commit and files: `packages/server/src/modules/fieldwork/sampling.ts`, `tests/sampling.test.ts`, `scripts/migration/differential.mjs`.
Existing T-task links: T098–T101; MIG-003, MIG-010.
Dependencies: WP3 sampling fixtures; the decimal primitive from P6-01.
Scope: MUS interval crossing over cumulative absolute exposure; key-item threshold; seeded without-replacement random; stratified key-items-then-draw; zero-exposure exclusion; signed totals with absolute-exposure selection; six-decimal coverage percentage; a six-decimal `ratioPercent`.
Non-goals: Persisted immutable populations and execution records, evaluation of differences, sampling risk quantification, physical evidence movements and procedure conclusions.
Current behavior and invariants: no database, clock or non-deterministic randomness. The fixed splitmix64-style generator is ported bit-for-bit, so the same seed reproduces the same selection; the source test only asserts reproducibility, and the destination now matches the generator itself.
Proposed contract / schema change: none yet; persistence is the next task in this capability.
Permission and transaction boundary: not applicable to a pure function; the eventual run/approval commands will require scope and capability.
Historical data / document impact: none.
Implementation steps: port the generator and the four methods, drive them from the fixture, and extend the differential harness.
Relevant existing tests: `tests/characterization.test.ts`.
Minimal additional acceptance tests: quoted population statistics; key-item selection and total; seed reproducibility and seed divergence; clamping to population size; stratified key-item inclusion and draw count; zero-row exclusion; six invalid-plan rejections; absolute-exposure selection with signed totals.
Commands actually executed: `pnpm build:server`; `pnpm exec tsc -p tsconfig.tests.json --noEmit`; `pnpm exec vitest run tests/sampling.test.ts tests/characterization.test.ts`; `pnpm migration:differential`.
Evidence and remaining blockers: `tests/sampling.test.ts` passed (6 tests) and the differential report now shows **33 checks, 33 matched, 0 differences**, with sampling no longer destination-absent. Remaining: persist populations/runs with revision fencing, evaluate exceptions and conclusions, and the sampling UI.
Rollback / forward-recovery impact: additive pure functions; no stored state.
Definition of done: the pure engine matches the quoted expectations and reproduces selections from a seed. The capability row stays PARTIAL until persistence and evaluation exist.
