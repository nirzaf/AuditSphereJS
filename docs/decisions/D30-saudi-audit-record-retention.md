# D30 — Saudi audit-file retention baseline (superseded)

> **Superseded by D31 on 2026-10-09.** The repository owner corrected the jurisdiction to Qatar. This record is retained as decision history only and is not an applicable retention default.

**Decision state:** Approved implementation default under the repository owner's delegation to Codex. **Decision date:** 2026-10-09. **Professional status:** Not an audit-methodology, legal, privacy, records-owner or production approval.

## Decision

For audit engagements performed by a Saudi-licensed accounting and auditing practice, retain the issued report and its audit file for at least ten years from the report's issue date. This follows Article 7(5) of Saudi Arabia's Law of the Accounting and Auditing Profession, which sets that minimum for work documents, reports and financial statements. Where another applicable rule, contract, dispute, investigation or legal hold requires longer retention, the longest applicable period governs.

After the minimum period, do not automatically delete. Require an authorized, recorded disposition review. A legal hold suspends disposal until its release is separately authorized and recorded. The existing 60-day archive transition remains a distinct workflow lock; it is not the retention period.

Store working copies in OneDrive for Business and the accepted archive in the firm's designated SharePoint repository, consistent with D11. For an archive item, use an administrator-configured Microsoft Purview record control only after the tenant's exact label behavior and licensing are verified. The runtime must not claim provider-enforced immutability from a label's presence alone. If the tenant cannot demonstrate that the configured control blocks the relevant edits and deletes for the tested principals, keep production archive acceptance blocked; do not silently weaken the control or switch the approved storage provider.

This baseline applies only to Saudi-licensed statutory audit engagements. Other jurisdictions, internal-audit engagements, agreed-upon procedures and other records require an approved category-specific schedule before timed disposition is enabled.

## Basis and limits

- Article 7(5) of the [Saudi Law of the Accounting and Auditing Profession](https://www.socpa.org.sa/SOCPA/files/06/066109b0-5a63-47b6-8fd5-10546e7ca91b.pdf) requires preserving work documents and copies of reports and financial statements for at least ten years from the report issue date.
- The [Umm Al-Qura publication adopting the law](https://www.uqn.gov.sa/details?p=17105) identifies the current law approved by Royal Decree M/59 dated 27/7/1442 AH. The repealed 1991 Certified Public Accountants law is not the basis for this decision.
- Microsoft's [SharePoint and OneDrive retention behavior](https://learn.microsoft.com/en-us/purview/retention-policies-sharepoint) distinguishes ordinary retention from records and regulatory records. Record locking and tenant settings affect whether members can edit; this must be tested in the intended tenant.

This is a conservative product default for the KSA audit scope, not a determination that every customer, engagement type, record class or cloud region may lawfully use the same schedule. Qualified records and methodology owners must confirm applicability before production. No tenant label, retention policy, region or production setting was changed by this decision.

## Follow-up acceptance

Before production acceptance, T133/T134/T138 must verify the exact SharePoint retention control, principal behavior, version preservation, disposition review and hold workflow in a designated nonproduction tenant. T168 must obtain named professional/records acceptance. D30 does not close those evidence gates.
