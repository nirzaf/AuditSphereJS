# D32 — Implement against proven prerequisites while acceptance remains explicit

**State:** approved implementation default under the repository owner's request on 2026-10-09 to resolve the blockers and choose decisions based on project objectives. This is a delivery-sequencing decision; it is not independent, professional or production acceptance.

## Decision

Do not make an implementation-review queue prevent correction of a confirmed authority defect. A narrowly scoped correction may proceed when the exact existing interfaces it uses are implemented and tested, even when the broader task that introduced them remains IN_REVIEW. Record the interfaces, their tests and the omitted downstream work in the correction handoff. Missing prerequisite functionality is still a real dependency: implement it before relying on it.

For a new CORE task, assess its dependencies individually. An implemented prerequisite can support engineering work after its required contracts/invariants are verified; its ledger status must remain honest and its independent acceptance must remain open. No automatic treatment of IN_REVIEW as DONE, no bulk dependency removal, and no use of scaffold tests as functional proof. GATE tasks retain their full acceptance dependencies under D20. Release and professional approval remain separately gated.

This implements the owner's objective of a real, server-backed application while preserving review evidence. It supersedes the blanket implementation hold described in the 2026-10-08 index for this limited purpose.

## First application: B03 correction

- Existing prerequisites used: T020's separate portal sessions and first-reset boundary, T053's contact records, T027's command receipts, T025's atomic audit writes, and the existing CommercialProposal presentation snapshot.
- Correction: refuse staff acceptance; issue a partner-authorized credential to the primary Managing Director's exact active portal membership; enforce expiry, scope, current terms, single consumption and a client audit actor; retain accepted evidence.
- T061's comprehensive document and T037's notification dispatch are not claimed as delivered by the credential path. Full T062 dispatch remains in progress. No live message is sent and no tenant permission is changed.
- Independent acceptance, qualified Qatar policy review, provider retention proof and production deployment decisions remain open.
