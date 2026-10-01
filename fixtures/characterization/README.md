# Characterization fixtures (WP03 / MIG-003)

These fixtures exist so the same input/expected-output cases can run against both the AuditSphere
source calculators and the AuditSphereJS port. They are **extracted from the pinned source's own
domain tests**, not invented.

## Provenance and honesty boundary

- Repository `nirzaf/AuditSphere`, commit `64713e808d165b4ef91ea4be4979e0f98fb2def3`.
- Every case records the `sourceFile` and `sourceLine` it was quoted from.
- The source tests assert these expectations. **Neither the source suite nor the C# calculators were
  executed in this workspace.** The fixtures are characterization inputs; a difference between the
  two stacks is only proven once both stacks actually run them (MIG-003).
- `tests/characterization.test.ts` validates the fixture format, provenance and internal arithmetic
  consistency. `scripts/migration/differential.mjs` runs the destination calculators that exist and
  writes `docs/migration/03-differential-report.md`. Materiality, sampling and quotation are all
  implemented in the destination and currently report **46/46 checks matched**; no extracted family
  is destination-absent.

## Files

| Fixture | Capability | Source test |
| --- | --- | --- |
| `quotation.json` | C05 quotation and approval matrix | `QuotationCalculatorTests.cs` |
| `materiality.json` | C22 materiality and risk bands | `PlanningResourcesAndMaterialityTests.cs` |
| `sampling.json` | C25 sampling reproducibility | `AuditSamplingEngineTests.cs` |

Currency (C17) and consolidation (C18/C19) fixtures remain to be extracted from the much larger
`ClientAccountingTests.Currency.cs` and consolidation suites.
