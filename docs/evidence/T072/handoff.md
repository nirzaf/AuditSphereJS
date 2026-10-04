# T072 handoff — immutable receipt vouchers

Status: `IN_REVIEW` (independent review pending). One receipt identity per settled invoice, replayable under the originating operation key, immutable by database trigger.

- AC1: one payment event yields one receipt identity despite retries (`tests/billing-gates.integration.ts` — a different key cannot mint a second receipt).
- AC2: ROUTING TO THE DESIGNATED CFO/FD REMAINS OPEN — client contact roles do not exist yet (T053) and receipt dispatch is not wired to the T037 notification service.
- AC3: receipt issuance is separate from settlement; no failure path reverses or duplicates the cleared payment (settlement is committed before receipt creation).

Commands: `pnpm verify:task -- T072`.
