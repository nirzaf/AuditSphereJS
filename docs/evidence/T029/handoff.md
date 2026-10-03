# T029 task handoff

## Identity

Task ID: T029
Requirement IDs: R006, R081 and the API transport/security acceptance criteria in T029
Implementing branch: main, existing mixed worktree; no commit created
Status: DONE

## Intended and delivered outcome

The Fastify API now applies exact configured-origin CORS, Helmet, explicit zero trusted proxy hops, bounded JSON request envelopes, independent per-IP abuse budgets, stable correlation IDs and generic secret-safe server errors. The existing portal session boundary is regression-tested for secure cookies, origin and double-submit CSRF behavior, and indistinguishable unknown-user/wrong-password responses.

The live browser recheck also confirms the designated Staff Fixture resolves to its mapped active local identity and only its one scoped synthetic engagement. The Practice screen separately denies access without the firm-wide Practice grant; this is expected authorization behavior.

## Files and contracts

- apps/api/src/main.ts and apps/api/src/http-security.ts compose the shared Fastify transport protections.
- apps/api/src/security-controls.ts defines request-envelope limits and per-route-class rate policies.
- apps/api/src/problem-filter.ts redacts internal exception detail from client responses and error logs.
- packages/server/src/platform/config.ts validates the exact web origin.
- tests/config.test.ts and tests/security-hardening.test.ts cover configuration, envelopes, pagination bounds, policy selection and error redaction.
- apps/api/tests/security-hardening.integration.ts exercises actual Fastify CORS, body/URL limits, proxy trust and rate-limit behavior.
- apps/api/tests/portal-auth.integration.ts covers cookie security, CSRF/origin rejection, credential replay and login non-enumeration through PostgreSQL and Fastify.
- apps/api/tests/auth-boundary.integration.ts scopes its development identity fixture to AUTH_PROVIDER=development so an operator's Entra .env cannot redirect that test through real-token validation.
- scripts/verify-task.mjs and package.json register and run the intended task tests; task/evidence/tenant troubleshooting docs were updated.

No database migration, transport contract, package dependency or tenant permission changed. The rate-limit plugin was already a direct API dependency.

## Dependency evidence

No dependency changes. Existing @fastify/rate-limit is used with its process-local default store. The current topology is one API process as documented. A horizontally scaled deployment needs a shared rate-limit store and a separately reviewed proxy-hop configuration.

## Decisions

No new business or tenant policy decision was required. The Staff Fixture remains PREPARER with only its existing scoped ENGAGEMENT_READ grant.

## Executed verification

| Command / test | Tested artifact and fixture | Actual result / exit status | Evidence |
| :--- | :--- | :--- | :--- |
| pnpm verify:task -- T029 | Server build, configuration and policy units, Entra identity, Fastify security fixture, PostgreSQL 18.6 portal-auth fixture | Passed; all six recorded recipe steps completed | Run output, 2026-10-03 |
| pnpm verify:affected | Import boundaries, server/test typechecks, Angular production build, Vitest | Passed: 89 tests | Run output, 2026-10-03 |
| pnpm lint | ESLint and module/browser boundaries | Passed, zero errors; four existing unused-disable warnings in untouched visual-prototype-simulation declarations | Run output, 2026-10-03 |
| git diff --check | Current mixed working tree | Passed with no whitespace errors | Run output, 2026-10-03 |
| Built-in browser staff sign-in and engagement selection | Existing Entra Staff Fixture and its synthetic engagement | Active identity and one engagement displayed; Practice correctly required an absent firm-wide grant; no business write submitted | Browser and read-only local mapping check, 2026-10-03 |

## Acceptance criteria

- AC1: PostgreSQL/Fastify portal tests reject wrong-origin and missing-CSRF state changes and accept a same-origin request with a valid double-submit token. Production-setting cookies include Secure and HttpOnly where required.
- AC2: the real Fastify fixture proves X-Forwarded-For does not change request IP when trustProxy is false; spoofed values share one credential throttle bucket and the next request receives 429. Upload, expensive-read and general budgets are independent.
- AC3: unknown-account and wrong-password portal logins return the same public problem; an internal-error fixture proves exception text and bearer-like secrets are absent from both response and error log while correlation ID remains available.

## Recovery and authorization

No schema or production data changed. Limits are 16 MiB per body and 8 KiB per request URL; per 60 seconds, budgets are credentials 8, uploads 20, expensive reads 60 and general traffic 180 per normalized client IP. Counters are process-local and reset when the API restarts. The service trusts zero proxy hops; deployment topology must be reviewed before enabling trusted forwarding.

No bearer token, password or MFA data was inspected or recorded. No Entra/Graph permissions, grants, account mapping, membership, or business records were changed during the browser recheck.

## Review and next task

Reviewer: Codex self-review, 2026-10-03
Review result: AC1–AC3 and the four implementation checklist items map to focused unit and real HTTP/PostgreSQL assertions; no blocker remains inside T029.
Open blockers: Shared rate-limit storage and proxy trust are deployment-specific follow-ups if the one-process topology changes. The stale-token forced-refresh branch was not exercised in this browser pass; its behavior remains covered by Angular regression tests.
Next eligible task by dependency order: T030.
