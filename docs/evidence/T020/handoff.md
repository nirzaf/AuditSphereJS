# T020 client portal identity and first-reset slice — 2026-10-02

**Status:** DONE for T020's portal principal, credential, session and upload-authorization guard scope. Notification dispatch, abuse throttles and the later PBC upload endpoint remain in their separately tracked tasks.

## Change

- Added reviewed migration `202610020021_portal_auth` with separate `PortalUser`, engagement-scoped `PortalMembership`, one-use `PortalCredentialToken` and opaque `PortalSession` tables. Composite ownership keys bind portal memberships to the exact firm/client/engagement tuple. PostgreSQL checks enforce lower-case email, token purposes/digest shapes, valid versions, and payment-before-release/archive.
- Added invitation issue/redeem and password-reset token services. Raw 256-bit credentials are returned only to the caller for later delivery; PostgreSQL stores SHA-256 digests. Expired and consumed tokens fail closed, and issuing a replacement invalidates prior unused tokens.
- Added scrypt password storage, generic credential errors, eight-hour HttpOnly session cookies, a same-site CSRF double-submit value, exact `WEB_ORIGIN` checks on mutations, logout revocation and first-password session rotation. The internal staff guard continues to accept only the internal bearer credential.
- Added Angular 22 client sign-in/invitation/first-password/password-reset states using standalone components, Signals, Signal Forms and a cookie-backed API adapter. The component clears local state on sign-out and presents non-enumerating credential failures.
- The upload authorization service requires an active portal principal, cleared advance, completed first password, and an un-released/unarchived/unrevoked engagement membership. The T075 upload API still needs to call this service.

## Verification

| Check | Result |
| --- | --- |
| `pnpm verify:task -- T020` | Passed: server build and PostgreSQL 18.6/Fastify portal acceptance test (1/1). |
| Angular MCP `run_target web build` | Passed after removing manually set `required` attributes managed by Signal Forms. |
| Angular MCP `run_target web test` | Passed: 37 tests across 7 files, including invitation → first-password → sign-out and password-reset UI flows. |
| Built-in browser `http://localhost:4200/portal` | Portal sign-in loaded, reset form opened, and required inputs rendered; no real client credential was used. |
| `pnpm verify:affected` | Passed: boundaries, server/test TypeScript, Angular production build and 81 Vitest unit tests across 18 files. |

## Limits

- The migration has been applied to the local PostgreSQL development database and isolated Testcontainers only; no production database was changed.
- `apps/api/tests/portal-auth.integration.ts` is registered in `pnpm test:integration`; the full integration suite was not rerun in this increment.
- No portal user, invitation, membership, password, or client business record was created in the local development database. The integration test uses synthetic disposable PostgreSQL fixtures.
- Invitation and reset token delivery must be connected to the durable notification outbox in T037. Reset/login request throttles belong with the T029 abuse controls. No PBC upload endpoint exists yet; T075 must apply `assertPortalUploadAllowed` in its domain mutation transaction.
- Reset expiration and single-use replay are also verified through the Fastify HTTP endpoint; tokens never appear in response bodies after completion.
- Live Microsoft tenant acceptance was not needed or performed for this local-password portal slice. No credentials, tenant settings or provider permissions changed.

## T020 scope closure — 2026-10-03

- Extended the PostgreSQL/Fastify acceptance test to prove released engagements cannot receive new invitations, and revoked memberships or inactive portal users cannot pass the upload guard or receive replacement invitations. The existing fixture also proves denial for unpaid, first-reset-pending, released and archived memberships.
- Updated `issuePortalInvitation` to reject released memberships consistently with the release-time upload freeze and invitation redemption gate.
- `pnpm verify:task -- T020` passed: server build plus the PostgreSQL 18.6/Fastify portal acceptance test (1 passed, 0 failed, 0 skipped).
- `pnpm verify:affected` passed: module/browser boundaries, server and test typechecks, Angular build, and 81 Vitest tests across 18 files. Angular CLI MCP `web:test` passed 43/43.
- This closes T020's stated outcome and AC1–AC3. Email/reset delivery remains T037, login/reset abuse throttling remains T029, and applying the guard at the actual PBC upload API remains T075. Those cross-task items are still open; no invitation or client identity was created in the local or Microsoft tenant.

## Built-in browser portal UI smoke — 2026-10-03

- Opened `http://localhost:4200/portal` in the built-in browser. The sign-in screen rendered with required email/password fields and a disabled submit button while empty.
- Switched to the one-time invitation form and the reset-code/new-password form; both rendered their expected required fields and remained non-submittable while empty.
- This was a UI-only check. No credential, invitation/reset token, or account identifier was entered; no authentication request or portal mutation was submitted.
- The user-supplied tenant-roster screenshot identifies the designated account as Client X, while the portal uses local invitation/password authentication separate from Entra staff SSO. No local portal user, membership, invitation, or credential was created; T020's live client-account authentication is not established by this smoke.
