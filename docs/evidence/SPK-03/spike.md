# SPK-03 — Client acceptance token for proposals

Status: design complete, reviewed against the code as it stands on 2026-10-08. No source changed by this spike.
Time box: 1 day. Feeds: T062 and STE-JS-04 (client acceptance recorded by staff contrary to T062 AC3).

## Question and answer

Question: can the existing single-use `PortalCredentialToken` machinery (T020) issue a proposal-acceptance token bound to the proposal ID, revision, fee and terms digest, with its own expiry, without granting portal access? What does the client see before signing in?

Answer: yes, with two additions to the credential row (the proposal binding) and one new purpose. The token is an acceptance credential, never a session, and it carries no read access to the proposal. The client sees only the portal sign-in page until they sign in as the bound portal user; the proposal's revision, fee and terms are shown only after sign-in.

## What exists today (read from the code)

- `PortalCredentialToken` (prisma/schema.prisma): `portalUserId`, optional `portalMembershipId`, `tokenHash` (unique), `purpose`, `expiresAt`, `consumedAt`, `createdAt`. Only the hash is stored.
- `packages/server/src/platform/portal-auth.ts`: `issuePortalInvitation` and `issuePortalPasswordReset` create a 32-byte random token, store `sha256(token)`, invalidate older unconsumed tokens of the same purpose, and redeem by `updateMany` on `consumedAt: null` so a replay matches zero rows.
- Portal sessions are separate (`PortalSession`), with their own TTL, CSRF token and password-change gate.

## Proposed design

Data (one reviewed migration, additive):
- Add nullable `proposalId uuid`, `proposalRevision int`, `termsDigest varchar(64)` to `PortalCredentialToken`.
- CHECK: `purpose <> 'PROPOSAL_ACCEPTANCE' OR (proposalId IS NOT NULL AND proposalRevision IS NOT NULL AND termsDigest ~ '^[0-9a-f]{64}$')`.
- The new purpose `PROPOSAL_ACCEPTANCE`, bound to the portal user and membership of the proposal's client.

Issue (staff, `COMMERCIAL_MANAGE`, engagement-scoped):
1. The proposal must be `PRESENTED` at revision `r`, with fee `f` and terms digest `d` (SHA-256 over the presented snapshot).
2. The target portal user must hold an active membership for the proposal's client and engagement.
3. Any unconsumed `PROPOSAL_ACCEPTANCE` token for the same proposal is consumed (superseded), as the reset flow does.
4. The plain token is returned once. Only its hash is stored, with `expiresAt`.
5. Audit `PROPOSAL_ACCEPTANCE_TOKEN_ISSUED` (no token value, only the token ID).

Client sign-in and presentation:
- The client signs in to the portal with their own password (or completes first login), which creates a normal `PortalSession`.
- `GET` of the proposal under the portal returns the presented snapshot only to the bound portal user with an active membership. The token is not needed to view.

Accept (portal user, same transaction):
1. Verify `sha256(token)`, `purpose = PROPOSAL_ACCEPTANCE`, `consumedAt IS NULL`, `expiresAt > now`.
2. Verify the session's portal user equals the token's `portalUserId`, and the membership is active for the proposal's client.
3. Verify the proposal is still `PRESENTED` at `proposalRevision` with the same `termsDigest`.
4. Consume the token with `updateMany` on `consumedAt IS NULL`; a count of 0 is a conflict.
5. Set the proposal `ACCEPTED` with `clientResponse` `{ revision, termsDigest, tokenId, acceptedByPortalUserId, acceptedAt }`, and audit it with `actorKind = PORTAL`.
6. The receipt makes a repeated request return the first result.

Key 1 (`dualKeyStatus`) then reads a `clientResponse` whose `acceptedByPortalUserId` is set. A staff-recorded response is not accepted as Key 1.

## Threat notes

| Threat | Control |
| :--- | :--- |
| Replay of a used token | `consumedAt` guard in the acceptance transaction; the second attempt matches zero rows and is refused. |
| Forwarding a token to someone else | The token is bound to one portal user. Presenting it requires that user's sign-in, so a token alone cannot be used. |
| Wrong client | Membership checked at issue and again at acceptance, against the proposal's client and engagement. |
| Revision or terms changed after issue | The token binds revision and terms digest; acceptance refuses if either no longer matches the presented proposal. |
| Expired token | `expiresAt` checked at acceptance. The expiry value needs owner confirmation (see draft decision). |
| Database read by an attacker | Only SHA-256 hashes are stored; the token has 256 bits of randomness. |
| Guessing | No enumeration: an unknown or consumed token gives the same generic refusal. Portal request limits (T029) apply. |
| Staff impersonating the client | Staff acceptance is refused by the T062 change below, so the only route to Key 1 is the portal path. |

## Change list for T062

1. Refuse `acceptProposal` for staff actors. Remove the `COMMERCIAL_MANAGE` acceptance path (`packages/server/src/modules/commercial/proposals.ts`, route `POST …/proposals/:id/accept`). Staff keep issuing and presenting proposals.
2. Migration: the three columns, the CHECK, and the `PROPOSAL_ACCEPTANCE` purpose in the portal credential code.
3. Staff issue endpoint for the acceptance token, returning the plain token once.
4. Portal endpoints: read the presented proposal for the signed-in bound user; accept with the token.
5. `dualKeyStatus` reads Key 1 only from a portal-accepted `clientResponse`.
6. Tests: issue refused without a presented proposal; accept succeeds once; replay refused; forwarding refused (a different portal user); wrong client refused; revision drift refused; expiry refused; staff acceptance refused; Key 1 stays PENDING until portal acceptance.
7. Docs: T062 card, the portal README, the ledger row, and the decision register entry for the expiry value.

## Draft decision (for owner approval)

Client acceptance of a proposal is recorded only through a single-use, portal-bound proposal acceptance credential. Staff cannot record it. Proposed expiry: 7 days from issue, configurable. The owner confirms the expiry and whether staff may re-issue after expiry.

## Sequence

```mermaid
sequenceDiagram
  participant S as Staff (COMMERCIAL_MANAGE)
  participant API as API
  participant C as Client (portal user)
  S->>API: issue acceptance credential (proposal, revision, terms digest)
  API-->>S: one-time token (shown once; only its hash is stored)
  S->>C: deliver token outside the system
  C->>API: sign in to the portal as the bound user
  C->>API: read the presented proposal (membership checked)
  C->>API: accept with token, revision and terms digest
  API->>API: verify hash, purpose, expiry, membership, revision; consume token
  API-->>C: accepted (receipt; Key 1 recorded from the portal actor)
```

## Not decided here

- The expiry value and re-issue rule (owner).
- The client-facing wording and layout (presentation, not part of the mechanism).
