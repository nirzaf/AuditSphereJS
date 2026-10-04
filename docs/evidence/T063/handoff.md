# T063 handoff — the atomic dual-key gate

Status: `IN_REVIEW` (independent review pending). Implemented through the guarded lifecycle kernel: `ISSUE_ENGAGEMENT_LETTER` evaluates the accepted proposal and Partner risk clearance inside one engagement-locked transaction (`packages/server/src/modules/governance/lifecycle.ts`, `packages/contracts/src/index.ts` gate codes).

- AC1: all four key combinations are proven by `tests/commercial-onboarding.integration.ts` (both missing, Key 1 only, Key 2 only, both recorded) and `tests/billing-gates.integration.ts` (the (no Key 1, Key 2 recorded) combination).
- AC2: the gate now rejects acceptance evidence whose recorded revision drifts from the presented snapshot (`CLIENT_ACCEPTANCE_STALE`); every command serialises on the engagement row lock, so concurrent evidence changes cannot produce a false clearance. Proven by the drift case in `tests/billing-gates.integration.ts`.
- AC3: duplicate clear commands replay one durable result via the operation/idempotency layer (proven by `tests/idempotency.integration.ts`).

Remaining: the questionnaire templates that feed Key 2 are T056–T058; this gate reads the recorded clearance.
