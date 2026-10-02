# D03, D08–D10 — Signature, archive and engagement-type defaults

**Decision state:** Approved implementation defaults under the user's 2026-10-01 delegation to Codex. **Decision date:** 2026-10-02. **Authority:** `docs/decisions/register.json` plus the user's direct 2026-10-02 instruction to use image signature only and not Microsoft 365 eSignature.

This record makes application behavior explicit while preserving `docs/requirements/CURRENT.md` as the functional source. It is not legal/records-schedule advice, a qualified audit-methodology review, or a cryptographic signature assurance. Independent professional and jurisdictional approval is still required before release where marked below.

## D08 — Report signature and engagement letter signature

- Render approved partner signature artwork and firm seal as visible report marks. Do not call the resulting PDF “cryptographically signed,” “certificate-signed,” or digitally verifiable. Do not claim that an embedded PNG proves signer identity or document integrity.
- The approval record binds the partner's authorized action to the exact report SHA-256, engagement, artifact version, artwork version and UTC approval instant. A change to any bound value requires a new approval. The previously approved report and image assets remain immutable.
- Use the same distinction for engagement letters: image artwork is a visual mark; generation/issuance requires the explicit partner authorization specified by the letter workflow.
- Signing artwork is private controlled evidence, never a public web asset. The worker renders it; the browser does not hold provider credentials. Microsoft 365 eSignature, certificate issuance, private-key custody, revocation and timestamp authorities are excluded by the user's instruction.

## D09 — Assembly deadline, application lock, object retention and legal hold

These are separate records and controls:

1. **Assembly countdown:** anchor to the UTC calendar date of the partner's final report-signature approval. The due instant is 00:00:00 UTC at the start of the calendar date 60 days after that UTC date, matching the existing `deadlineAfterCalendarDays` convention. The countdown is a workflow deadline for completing and reviewing assembly.
2. **Application read-only:** at the due instant, or earlier on an explicit partner command, transition the engagement archive into its terminal read-only state. Reject changes to archived source artifacts; preserve the decision, actor, reason, and instant in the append-only audit history. UI timezone only affects display. A scheduled deadline does not itself prove assembly completeness.
3. **Object-version retention:** preserve every approved/released version and its version metadata; do not automatically delete any engagement object or prior version in application code. Retention expiry and provider immutability are separately configured from the application lock. Until a jurisdiction-approved retention schedule and tenant/provider configuration exist, retain objects without automatic disposal. T133 must verify the production SharePoint/OneDrive retention configuration before production acceptance.
4. **Legal hold:** represent a hold as a separate scoped record with authority, case/reference, reason, start instant and release evidence. A hold suspends disposal only; it does not unlock an archive, replace report approvals, or authorize changing an object. Releasing the hold requires a separately authorized records action and immutable audit event.

Archived bytes and their manifest are immutable. A permitted post-archive correction is a new linked addendum/version with reason, actor, UTC instant, prior-object digest, approval and new digest; it never overwrites the archived artifact or rewrites the original manifest. Legal/records owners must validate the no-auto-disposal default and hold procedure before deployment.

### Manifest membership

Include every engagement-scoped source trial balance and published version, mappings and approvals, schedules, workprograms, sampled populations/runs/results, linked evidence and physical references, client submissions, correspondence/confirmations, review notes/rework/sign-offs, AJEs, materiality and risk approvals, signed LOR, final report and five-part outputs where applicable, artifact versions/digests, workflow history, delivery receipts, partner artwork version identifiers and the immutable audit-event/checkpoint references needed to verify history. Record repository item IDs, byte length, media type, version, digest, creation/approval times and scope tuple. Exclude regenerable caches, transient queue payloads and unreferenced temporary upload objects; preserve the durable source event and cleanup evidence for any removed temporary object.

## D03 — Signed Letter of Representation timing

The report may receive internal partner approval first; generate the LOR from that approved report snapshot for client-letterhead signing and re-upload during the pre-release stage. The signed LOR must be current and engagement-matched before final package validation and external bundle release. A missing, stale, unreadable or mismatched LOR blocks release; there is no ordinary bypass. An exceptional professional decision must be recorded as a separate, version-bound partner authorization with reason and audit event before implementation of any exception path. Final release freezes client uploads as required by the source workflow.

## D10 — Reporting by engagement type

- **External statutory financial-statement audit:** allow the four partner-only opinions in CURRENT; modified opinions require the affected FSLI and mandatory rationale. Use the statutory report and certified-financial-statement template.
- **Internal audit:** use a separately versioned internal-audit report format tied to its approved scope, findings, impacts and recommendations. Do not show or apply the statutory four-way financial-statement opinion selector by default.
- **Agreed-upon procedures:** use a separately versioned ISRS 4400-style procedures-and-findings output tied to the agreed procedures. Do not express an audit opinion or assurance conclusion. The report must not imply procedures or assurance outside the signed scope.
- Validate engagement type, approved template version and required evidence before rendering/release. A statutory report, internal-audit report and AUP report cannot be substituted for each other by a client or preparer. A visible signature image does not change the engagement type or assurance label.

## Verification boundary

The decision fixture [T004 records vectors](T004-records-golden.json) tests the date boundary and the separation of controls/report types. It is specification evidence, not a production archive, provider-retention, legal-hold or role-based UAT result. Those remain T126–T138 and T168 acceptance work; no production object lock or irreversible retention operation was run.
