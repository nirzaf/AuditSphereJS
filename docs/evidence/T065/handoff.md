# T065 handoff — partner-authorized engagement letters

Status: `IN_REVIEW` (independent review pending). Letters are issued only by the lifecycle command with both keys recorded; the record pins the exact accepted proposal revision, fee and period and is immutable by database trigger (`EngagementLetterRecord`).

- AC1: letter generation is denied with either missing key (integration suites above).
- AC2: WRONG-TYPE TEMPLATE SELECTION REMAINS OPEN — the letter renders the statutory-audit wording only; statutory/internal/AUP template selection is not implemented yet.
- AC3: the letter cannot be silently regenerated (one record per engagement, immutability trigger proven in `tests/commercial-onboarding.integration.ts`).

Commands: `pnpm verify:task -- T065` (build:server + commercial-onboarding + billing-gates integration suites).
