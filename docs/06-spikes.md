# AuditSphereJS — Spikes for the remaining work

**Status: PROPOSED.** A spike produces a short written finding in `docs/evidence/<spike-id>/finding.md` and, where needed, a decision record and refined story entries. It ships no production code and adds no dependency to the lockfile. Stop at the time box and report what is known.

---

## SPK-01 — Bounding workbook parse time

**Time box:** 1 day. **Feeds:** T045, DN-01.

**Question.** ExcelJS load cannot be interrupted, so a slow but in-limit workbook can hold a worker indefinitely (T045 handoff). Which mechanism bounds it: a child process or `worker_threads` worker with a kill timeout; a streaming reader mode; or a lower cell/row cap?

**Output.** Measured parse times for the 5k/25k/50k fixtures and one hostile in-limit workbook under each option; recommendation; the timeout value to propose.

## SPK-02 — Retention and immutability on SharePoint for the archive

**Time box:** 3 days. **Feeds:** T133, T134, T138.

**Question.** After the 60-day lock, which Microsoft 365 control makes archived document versions undeletable and unmodifiable for the retention period, using only the permissions in `docs/microsoft365/permission-matrix.md` (or a reviewed addition)? Candidates: SharePoint retention labels/policies, a separate archive site with read-only permissions applied at lock, or copying the sealed manifest and bytes to S3-compatible storage with object lock.

**Output.** For each option: required permission and admin consent, how the application proves the control is active, behaviour if a staff member is still a site member, failure and recovery path, cost. Recommendation and draft decision.

## SPK-03 — Client acceptance token for proposals

**Time box:** 1 day. **Feeds:** T062, STE-JS-04.

**Question.** Can the existing single-use `PortalCredentialToken` machinery (T020) issue a proposal-acceptance token bound to proposal ID, revision, fee and terms digest, with its own expiry, without granting portal access? What does the client see before signing in?

**Output.** Sequence diagram, data fields, threat notes (replay, forwarding, wrong client), and the change list for T062.

## SPK-04 — Load-test harness

**Time box:** 1 day. **Feeds:** T159, `03-nfr-targets.md`.

**Question.** Which load tool fits the repository's rule "no new package without compatibility and library-register review": an external binary (k6) run outside the pnpm workspace, or a Node harness extending `scripts/benchmark.ts`? How are authenticated staff and portal sessions created for the test without real tenant credentials?

**Output.** Recommendation, the review entries it needs in guides 02 and 03, and a script outline for the proposed p95 scenarios.

## SPK-05 — Which card dependencies are real

**Time box:** 4 hours. **Feeds:** DN-13, `05-roadmap.md` §3.

**Question.** For each of the 114 remaining tasks, is each listed dependency a data or contract need, or only a sequencing choice?

**Output.** A table `task → dependency → keep / replace with lane entry criterion → reason`, ready for the owner to approve and for the cards to be amended.

## SPK-06 — Report and LOR rendering fidelity

**Time box:** 1 day. **Feeds:** T119, T120, T122, T126.

**Question.** Can the constrained Playwright/Chromium renderer (T035) produce the auditor's report with financial statements, page numbering, partner signature and seal images and client-letterhead-ready LOR layout from the T036 closed block model, or does the block model need table and page-break blocks?

**Output.** One rendered sample per deliverable from synthetic data, the list of missing block kinds, and their contract changes.
