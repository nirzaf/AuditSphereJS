# T019 identity boundary handoff — 2026-10-02

**Status:** IN_PROGRESS. This implementation closes the self-identity endpoint and inactive-local-user checks. It does not claim full identity/session acceptance.

## Change

- Added `User.active` with a PostgreSQL default of `true`; migration `202610020009_user_active` preserves all existing users as active until explicitly disabled.
- Refactored Entra and explicit development-fixture authentication through one local-user lookup. Entra identities still bind by `(tenantId, entraObjectId)`; inactive or unmapped users fail with 401.
- Added `GET /api/v1/me`, returning only local user ID, email and active status. Engagement routes still require an active membership and scoped capability; the self route does not grant engagement access.
- Added a real PostgreSQL 18.6/Testcontainers + Fastify boundary check for the self endpoint, disabled-user denial on self and engagement routes, foreign engagement denial, and read-only authentication being unable to issue a lifecycle command.
- Expanded signed-token tests for the wrong issuer. Existing tests also reject wrong audience, wrong delegated scope, foreign tenant, expiry and malformed input. The token fixture includes an administrator claim to ensure no directory-role privilege mapping is introduced.

## Verification

| Command | Result |
| --- | --- |
| `pnpm verify:task -- T019` | Passed locally; Entra unit suite 1/1 and PostgreSQL/Fastify boundary test 1/1. |
| `pnpm verify:affected` | Passed locally; boundaries, server/type builds, Angular production build and 69 unit tests. |
| `pnpm lint` | Passed locally; ESLint and module/browser boundaries. |
| GitHub Actions | Pending push. |

## Acceptance and limits

- AC1: Wrong audience, issuer, expiry, tenant, scope and malformed credential denial is covered by signed-token unit tests.
- AC2: A locally inactive identity receives 401 on the self and engagement API boundaries.
- AC3: A valid authenticated identity with membership and read-only `ENGAGEMENT_READ` receives 403 for a lifecycle command; engagement state remains unchanged.
- Still open: SPA sign-out, explicit token/session revocation beyond access-token expiration, live interactive Entra login and mapped-user acceptance, and broader T018 ownership review. No live sign-in is claimed.
- No credentials, tokens or tenant secrets are included. No deployment or tenant permission change was performed.
