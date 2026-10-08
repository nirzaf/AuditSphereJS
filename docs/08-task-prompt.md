# AuditSphereJS — Task prompt for one agent session

**Status: CURRENT.** The only input written per session. Everything else is in the repository; the prompt points at it. One task (or one correction story) per session.

## Template

```text
Implement <T### or STE-JS-##>: <title>
Task card: docs/tasks/<phase>/<T###-slug>.md
Verified delta: docs/plan/stories/<phase>.md#<anchor>

Read first (only these, then code you discover from them):
- AGENTS.md (loaded automatically)
- the task card and its delta entry
- docs/requirements/CURRENT.md lines <from the card's "Source requirements">
- <the module README: packages/server/src/modules/<module>/README.md>
- <1–2 code files named in "Already in code">

Pattern to follow: <one existing file that does the same kind of thing>

Scope:
- In: <files/areas from the card's "Allowed areas">
- Out: <non-goals from the card; no new package; no edits to docs/requirements/CURRENT.md>

Decisions: <decision IDs that apply, or "none open">. If you meet an unresolved policy question, stop.

Verify with (run all, report each exit status):
- pnpm verify:task -- <T###>      (add the recipe to scripts/verify-task.mjs if missing)
- pnpm verify:affected
- pnpm lint
- pnpm contracts:check            (if a contract changed)

Stop and ask if:
- a dependency in the card is not DONE and DN-13 has not relaxed it,
- the change would edit another module's tables or bypass a public.ts facade,
- an acceptance criterion contradicts CURRENT or an approved decision.

Report:
- files changed, migrations, contract changes,
- commands run with exit status, commands not run and why,
- the handoff appended at docs/evidence/<T###>/handoff.md,
- assumptions, open questions, anything that looked wrong but was left alone.
```

## Filled example — STE-JS-02 inside T086

```text
Implement STE-JS-02 (inside T086): materiality policy ranges and the manager ±5 % adjustment
Task card: docs/tasks/07-planning/T086-materiality-calculator.md
Verified delta: docs/plan/stories/00-corrections.md#ste-js-02--materiality-policy-ranges-and-the-manager-5--adjustment

Read first:
- docs/decisions/T003-methodology-defaults.md (section D05)
- docs/decisions/T003-methodology-golden.json (adjustedPm case)
- packages/server/src/modules/governance/materiality.ts
- packages/server/src/modules/governance/materiality-service.ts

Pattern to follow: approveMaterialityAssessment in materiality-service.ts
(engagement lock, capability check, expected version, audit event, command receipt).

Scope:
- In: governance/materiality*.ts, materiality-controller.ts, packages/contracts (adjustment
  schemas, materialityBenchmarkKinds), a reviewed Prisma migration for the adjustment record,
  tests under tests/ and packages/server/tests/.
- Out: risk banding (STE-JS-03), UI beyond showing the adjusted figures, any change to D05.

Decisions: D05 (approved). DN-07 decides whether TOTAL_EXPENSES / MAPPED_LINE are removed or
kept as an approved extension — if DN-07 is still open, remove them from new assessments only and
keep historical rows readable.

Verify with:
- pnpm verify:task -- T086   (add the recipe; existing suites to reuse: tests/materiality.test.ts and the `materiality-persistence` integration key)
- pnpm verify:affected
- pnpm lint
- pnpm contracts:check

Acceptance (in addition to the card):
- PBT 4 % refused, 5 % and 10 % accepted; SAD 2 % refused.
- 53,421.000000 → 53,000.000000 accepted; a value 6 % away refused with the bound in the message.
- The adjustment's preparer cannot approve the assessment.
- Existing assessments keep their stored policy version.

Stop and ask if: existing approved assessments would fail the new ranges on read.
```

## Rules for writing prompts

- Name files; never "the relevant files".
- Give one pattern file, the cleanest example of the same kind of change.
- Quote the CURRENT line range from the card instead of loading the 41 KB file.
- Put the stop conditions in; agents otherwise push through ambiguity.
