# B07 — Verification follow-ups that weaken the evidence

**Status:** Open, 2026-10-08. **Owner:** engineering; the recipe-rule item belongs to the owner. **Kind:** engineering and owner.

These items do not block a task outright. Each one weakens the evidence behind a task that is in review, so a reviewer must know about it.

## 1. Stale-materiality assertion accepts either message (T087)

- **Where:** `tests/risk.integration.ts`, the last assertion before the append-only checks. It accepts `/stale|invalidated/`.
- **Why it matters:** the test passes whichever refusal occurs, so it does not prove which rule fired.
- **Fix:** find out which message the service produces in that case, and assert it exactly. Keep the other refusal in its own test if both can occur.

## 2. Legacy differential record still says MATCH (T087)

- **Where:** `docs/migration/inventory/differential.json`, case `risk-band-matrix`, line ~123, `"outcome": "MATCH"`.
- **Why it matters:** the case is superseded by STE-RISK-BAND-2026.2. The record still reads as a match against the legacy rule.
- **Fix:** decide how superseded cases are reported (owner), then regenerate with `pnpm migration:differential` and commit the regenerated output. The fixture case is already annotated `supersededBy` in `fixtures/characterization/materiality.json`.

## 3. Timing flake in the fixture test under load

- **Where:** `tests/tb-fixtures.test.mjs`. The 25,000-row and 50,000-row parse cases use a 5-second timeout.
- **Observed:** in one `pnpm verify:affected` run they failed with "Test timed out in 5000ms". Run alone, the file passes (8/8, about 24 s).
- **Fix:** give those two cases a timeout that fits the measured parse time on the target machine, and record the measurement. Do not raise a timeout to hide a real regression.

## 4. Web test worker start timeout

- **Where:** `pnpm test:web:leases`. In one run, the Vitest forks worker did not start within 60 s, so no test ran. The rerun passed 14/14.
- **Fix:** engineering to check the worker start on this machine. If it recurs, record the environment and reduce parallel load while the test runs.

## 5. Recipe-rule adoption (Definition of Done item 1)

- **Where:** `docs/07-definition-of-done-additions.md`. Adoption is marked owner-pending. Several handoffs, including T087's, cite it.
- **Why it matters:** until the owner adopts it, the rule that each task needs a recipe is a proposal, not a requirement.
- **Fix:** owner decides. Record the decision in `docs/decisions/register.json` with the next free number.

## 6. Affected-run exit code after a flake

- **Where:** `pnpm verify:affected` exits non-zero if any test fails, including a flake. A rerun that passes does not clear the first failure in the log.
- **Fix:** record both runs in the handoff, the failing run and the passing rerun, with the exact output. Do not report only the passing run.

## Done when

- Items 1–3 are fixed or accepted by the owner, with evidence appended.
- Item 2's regenerated differential output is committed.
- Item 5 has an owner decision.
