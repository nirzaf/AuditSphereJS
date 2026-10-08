# B03 — Staff can record client acceptance of a proposal (STE-JS-04, T062 AC3)

**Status:** Open, rechecked 2026-10-08. Expiry/reissue policy is recorded as D28. **Owner:** engineering after T061 and T053 are accepted. **Kind:** engineering dependency on prerequisites and the portal path.

## What is wrong

T062 AC3 says client acceptance is recorded by the client, through the portal. The code lets a staff member record it:

- `packages/server/src/modules/commercial/proposals.ts` — `acceptProposal` checks `COMMERCIAL_MANAGE` (around line 101), then writes the acceptance with `acceptedByActorId: actorId` (around line 110). The actor is a staff member.
- `packages/server/src/modules/governance/lifecycle.ts` — the Key 1 gate reads that record. Missing acceptance raises `CLIENT_ACCEPTANCE_MISSING` (around line 175); a stale one raises `CLIENT_ACCEPTANCE_STALE` (around line 197).

## Why it is not simply removed

Removing the staff path without a portal path makes Key 1 unreachable: nothing else can record the acceptance that the gate needs. The index records this as the reason it was not removed in the last pass. The portal path must exist first.

## Inputs already in place

- **T020 is DONE**: separate portal authentication and the first-reset gate, with `PortalCredentialToken` (single-use, hashed, with `expiresAt` and `consumedAt`).
- **SPK-03 designed the flow**: `docs/evidence/SPK-03/spike.md`. A proposal-acceptance token is bound to proposal ID, revision, fee and terms digest. It is single-use, has its own expiry, and grants no portal access beyond acceptance.
- **Expiry decision resolved:** D28 uses seven calendar days and permits a new audited single-use token only for the same still-presented proposal revision.
- **Prerequisites are not ready:** T061 is `NOT_STARTED`; T053 is `IN_REVIEW`. T062 requires each dependency to be DONE or explicitly NOT_APPLICABLE. D28 does not waive those requirements.

## Steps to unblock

1. **Honor D28.** Use a seven-calendar-day expiry and allow reissue only for the same still-presented revision.
2. **Migration.** Add a `PROPOSAL_ACCEPTANCE` purpose and a proposal reference, revision, and terms digest on `PortalCredentialToken`. Use an explicit reviewed migration.
3. **Staff issue endpoint.** `COMMERCIAL_MANAGE` may issue a token only for a presented proposal revision. Store only the hash. Return the plain token once. Audit the issue.
4. **Portal accept endpoint.** Only a portal user with the matching membership can accept. It verifies hash, purpose, expiry, membership, revision and digest, then consumes the token in the same transaction as the acceptance record.
5. **Key 1 reads the portal acceptance.** The acceptance record names the portal actor, not a staff actor.
6. **Only then remove the staff path** from `acceptProposal`, in the same change.
7. **Tests** (from SPK-03 section "tests"): issue refused without a presented proposal; accept succeeds once; replay refused; forwarding refused (different portal user); wrong client refused; revision drift refused; expiry refused; staff acceptance refused; Key 1 stays closed until the portal acceptance exists.
8. **Docs and evidence.** Update the T062 card, the portal README, the ledger row (by the owner, after review), and the decision register entry for the expiry value. Append to `docs/evidence/T062/`.

## Current gate and done criteria

Do not begin T062 until T061 is accepted and T053 is independently accepted (or the owner explicitly changes their dependency dispositions). Do not close this blocker based on the policy decision alone.

## Done when

- Staff acceptance is refused by a test, and the portal path passes the tests in step 7.
- Key 1 is reachable only through the portal path.
- T062 has a handoff and goes to independent review ([B01](BLOCKER-01-independent-review.md)).

## Do not

- Do not remove the staff path before the portal endpoint exists. That breaks Key 1 for every engagement.
- Do not send the acceptance token to anyone except the named client contact. Do not put it in a URL that is logged.
