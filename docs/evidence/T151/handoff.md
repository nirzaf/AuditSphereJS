# T151 internal Entra SSO and local role mapping — 2026-10-04

## Outcome

Reviewed the approved Microsoft Entra single-tenant SPA flow and API authorization boundary. The implementation already lives in T019 and uses a redirect-based MSAL Authorization Code flow (MSAL uses PKCE), obtains the resource scope from the typed `/api/v1/identity/config` response, and handles the redirect before Angular Router startup. The API independently validates RS256 signature, issuer, audience, expiry, configured tenant and delegated scope with `jose`, then maps only immutable `(tenantId, oid)` identifiers to an active local user. PostgreSQL memberships, membership-role ceilings and explicit current scoped grants authorize business access. No Entra directory or app-role claims are mapped to local privileges.

This T151 increment adds a signed-token regression carrying synthetic `wids` and `roles` administrator claims; the validated identity contains only `{ tenantId, objectId, issuedAt }`. Existing PostgreSQL authorization coverage demonstrates that even an operational local `ADMIN` with an `APPROVER` membership and partner capability grant cannot inherit partner authority. No tenant settings, permissions, app registrations, local mappings or grants were modified.

## Requirement and acceptance trace

| Criterion | Evidence |
| --- | --- |
| Authorization Code/PKCE requests the intended resource scope | `apps/web/src/identity.ts` initializes the redirect client from server-provided config and calls `loginRedirect({ scopes, prompt: 'select_account' })`; `apps/web/src/identity.spec.ts` asserts the exact scope and redirect path. |
| Wrong resource tokens are denied | `packages/server/tests/entra.test.ts` rejects Graph audience tokens; API identity validation independently checks configured API audience and delegated scope. |
| Tenant and local assignment both gate access | `authenticateEntraActor` resolves only an active local row by tenant/object UUID pair; T019 PostgreSQL/Fastify boundary, identity-map and mapped Staff Fixture evidence show unknown, inactive, foreign or ungranted identities do not receive access. |
| Entra Global Administrator does not become an AuditSphere Partner | This increment signs synthetic `wids` and `roles` claims and asserts neither enters the validated identity. `tests/authorization.integration.ts` proves local ADMIN is denied `RISK_PARTNER_CLEAR` despite an APPROVER membership and a matching scoped grant. |
| Expiry, logout, disable and role changes fail safely | Signed-token expiry tests, PostgreSQL session-cutoff test, inactive-user/API-boundary test, and role/grant authorization integration are included in the recorded recipe. Browser logout and local cutoff acceptance are documented in [T019 handoff](../T019/handoff.md). |

## Changed files

- `packages/server/tests/entra.test.ts`: token fixture includes administrator-style claims and asserts they are not copied into the API identity.
- `scripts/verify-task.mjs`: records the focused T151 verification recipe.
- `docs/tasks/13-microsoft365/T151-m365-sso.md`, `docs/guides/13-execution-ledger.md`: acceptance status and result.
- `docs/microsoft365/current-tenant.md`: dated verification note; no tenant configuration change.
- `docs/evidence/T151/handoff.md`: this evidence.

No database migration, API contract change, dependency change, Graph request or live-provider write occurred.

## Verification

| Command | Result |
| --- | --- |
| `pnpm verify:task -- T151` | Passed: build, Entra signed-token test 1/1, session-revocation PostgreSQL test 1/1, identity-mapping PostgreSQL test 1/1, Fastify identity boundary 1/1, PostgreSQL role/grant matrix 1/1, Angular identity tests 9/9; no skips. |
| `pnpm verify:affected` | Passed: module/browser boundaries, server and test typechecks, Angular production build, 25 Vitest files / 110 tests. |
| `pnpm audit --audit-level=moderate` | Passed previously on the unchanged dependency tree in T150; no new dependencies or lockfile changes in T151. |
| `git diff --check` | Pending final review |

Credentialed acceptance is referenced, not re-run in this increment: the mapped nonproduction Staff Fixture completed Entra sign-in, saw its single synthetic engagement, and later signed out through the application; exact dated evidence and limitations are in T019. The browser flow does not grant roles. The acceptance tenant inventory remains dated 2026-10-03 and this change did not contact Microsoft services.

## Review

Reviewer: Codex evidence review
Review result: Accepted after task and affected checks passed 2026-10-04
Remaining limitations: Production identity lifecycle, tenant-wide user disable synchronization, credential expiry, and the open T156 provider acceptance matrix remain tracked separately. Entra Global Administrator is not an AuditSphere Partner unless a local staff identity, APPROVER membership and scoped capability are separately granted by the application.
