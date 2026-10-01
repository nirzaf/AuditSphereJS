# Local verification — 2026-10-02

- `pnpm verify:all`: lint and boundaries passed; server/typecheck/Angular production build passed; 58 Vitest backend tests, 2 Angular tests and all 16 real-PostgreSQL integration cases passed. Browser layout tests passed; live cases were separately enabled below.
- `RUN_LIVE_E2E=1 pnpm test:e2e`: six browser cases, including real CSV ingestion/finalization and Practice draft/post/reverse. Recorded only after successful execution.
- Local migrations 202610020001 and 202610020002 applied using the migration credentials; runtime roles reprovisioned and the development seed rerun without moving migrated ownership.
- HTTP audit verification: 200 with `valid: true`. HTTP Practice read: 200, thirteen seeded firm accounts.
- The integration proof covers policy gating, wrong-scope grants, overlapping periods, unbalanced journals, stale versions/idempotent replay, header/line immutability, concurrent line editing versus posting, exact reversal, closed-period denial, nonposting accounts and cross-firm account rejection.

These checks do not establish professional accounting acceptance, live Microsoft tenant acceptance or complete product migration. GitHub Actions is the independent clean-runner verification after push.
