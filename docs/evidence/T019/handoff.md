# T019 identity boundary handoff — 2026-10-02

**Status:** IN_PROGRESS. This implementation closes the self-identity endpoint and inactive-local-user checks. It does not claim full identity/session acceptance.

## Change

- Added `User.active` with a PostgreSQL default of `true`; migration `202610020009_user_active` preserves all existing users as active until explicitly disabled.
- Applied the five reviewed pending migrations to the local development database (`202610020005` through `202610020009`); `prisma migrate status` reports the schema up to date.
- Refactored Entra and explicit development-fixture authentication through one local-user lookup. Entra identities still bind by `(tenantId, entraObjectId)`; inactive or unmapped users fail with 401.
- Added `GET /api/v1/me`, returning only local user ID, email and active status. Engagement routes still require an active membership and scoped capability; the self route does not grant engagement access.
- Added an Angular identity adapter token for testable MSAL integration, an authenticated-user indicator and popup sign-out. Sign-out clears the in-memory bearer token, local identity, loaded engagement records and unsaved drafts even when the logout popup fails; the UI reports when Microsoft sign-out could not be confirmed.
- Added a real PostgreSQL 18.6/Testcontainers + Fastify boundary check for the self endpoint, disabled-user denial on self and engagement routes, foreign engagement denial, and read-only authentication being unable to issue a lifecycle command.
- Expanded signed-token tests for the wrong issuer. Existing tests also reject wrong audience, wrong delegated scope, foreign tenant, expiry and malformed input. The token fixture includes an administrator claim to ensure no directory-role privilege mapping is introduced.

## Verification

| Command | Result |
| --- | --- |
| `pnpm verify:task -- T019` | Passed locally; Entra unit suite 1/1 and PostgreSQL/Fastify boundary test 1/1. |
| `pnpm verify:affected` | Passed locally; boundaries, server/type builds, Angular production build and 69 unit tests. |
| `pnpm lint` | Passed locally; ESLint and module/browser boundaries. |
| Angular MCP `web:test` | Passed; 31/31 across five files, including sign-in and both confirmed/unconfirmed popup sign-out cases. |
| Angular MCP `web:build` | Passed; production build output at `dist/web`. |
| GitHub Actions | Passed workflow [37016781547](https://github.com/nirzaf/AuditSphereJS/actions/runs/37016781547) on `6034f38d0b292279b8976347e1e550cfe5212221`: `verify:all`, contract checks, dependency audit, Linux build/smoke, packaged artifact and public web-assets job all passed. |

## Acceptance and limits

- AC1: Wrong audience, issuer, expiry, tenant, scope and malformed credential denial is covered by signed-token unit tests.
- AC2: A locally inactive identity receives 401 on the self and engagement API boundaries.
- AC3: A valid authenticated identity with membership and read-only `ENGAGEMENT_READ` receives 403 for a lifecycle command; engagement state remains unchanged.
- Still open: live interactive Entra login and mapped-user acceptance, and broader T018 ownership review. No live sign-in is claimed.
- No credentials, tokens or tenant secrets are included. No deployment or tenant permission change was performed.

## Server-side revocation update — 2026-10-02

- Added reviewed migration `202610020010_identity_session_revocation`. It creates an identity-owned append-only cutoff table; PostgreSQL rejects update and delete. The API role receives only SELECT/INSERT.
- `POST /api/v1/me/revoke-sessions` is available only with Entra authentication and appends a cutoff one whole second after the current token timestamp, ensuring tokens already issued during that second are revoked. Static development credentials receive 409 and do not create an event.
- Each Entra-authenticated request validates the signed token first, binds the immutable tenant/object identity to an active local user, then checks the newest persisted cutoff against token `iat`. Old tokens return 401; tokens issued at/after the cutoff work. This revokes all existing API access tokens for that mapped user.
- `pnpm verify:task -- T019` passed after the change: signed Entra unit tests; a real PostgreSQL Testcontainers test for old-token rejection, post-cutoff token acceptance and append-only enforcement; and Fastify tests for the Entra-only endpoint and disabled/foreign/read-only access boundaries.
- Remaining: live interactive SPA sign-in and browser-initiated revocation acceptance in the configured tenant, plus the prerequisite T018 broader tenant-root review. No tenant permission, credential or application registration was changed.
