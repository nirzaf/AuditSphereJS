# D31 — Qatar audit-file and AML/CFT retention default

**Decision state:** Approved implementation default under the repository owner's delegation to Codex. **Decision date:** 2026-10-09. **Professional status:** Not legal, audit-methodology, privacy, records-owner or production approval. **Supersedes:** D30, which used the wrong jurisdiction and is retained only as decision history.

## Decision

For Qatar-licensed statutory audit engagements, use a conservative product default of ten years from the end of the last audited financial year for the engagement audit file. Do not describe ten years as the general statutory minimum: Qatar Law No. 8 of 2020, Article 37, sets a five-year minimum from that same date unless another applicable law or regulation requires longer.

Apply separate date anchors to records covered by Qatar's AML/CFT requirements. For covered transaction and operation records, retain at least ten years from completion. For due-diligence records, account files, business correspondence and analysis results, retain at least ten years from the end of the business relationship or completion of an occasional transaction, as applicable. Auditors are within the DNFBP scope when acting for clients in the activities enumerated by Qatar Law No. 20 of 2019 and MOCI guidance; do not apply that category as if it covered every audit engagement. Where records belong to both categories, keep them until the latest applicable deadline.

Any longer applicable law or regulation, contract, dispute, investigation or legal hold governs. After the applicable minimum, do not automatically delete. Require an authorized, recorded disposition review. A legal hold suspends disposition until its release is separately authorized and recorded. The existing 60-day archive transition is a distinct workflow lock, not the legal retention period.

Store working files in OneDrive for Business and the accepted archive in the firm's designated SharePoint repository, consistent with D11. Use a Microsoft Purview record control only after the tenant's exact label behavior and licensing are verified. Do not claim provider-enforced immutability from a label's presence alone. If the intended tenant cannot demonstrate that the control blocks the relevant edits and deletes for the tested principals, keep production archive acceptance blocked. Other jurisdictions and engagement types require their own approved schedule.

## Basis and limits

- Qatar Law No. 8 of 2020, Article 37, states a five-year audit-client record/file/data minimum, measured from the end of the last financial year audited, or any longer period under applicable laws and regulations. The current article is available in the [Al Meezan Qatar legal portal](https://almeezan.qa/LawArticles.aspx?LawArticleID=80068&LawID=8274&language=ar). The Ministry of Commerce and Industry's [Auditing Profession Guide (2025)](https://www.moci.gov.qa/wp-content/uploads/2025/02/Auditing-Profession-Guide.pdf) also summarizes the five-year minimum or longer applicable period.
- Qatar Law No. 20 of 2019, Article 20, provides distinct ten-year retention periods for covered transactions/operations and for due-diligence, account, correspondence and analysis records. See the [official English law text](https://almeezan.qa/EnglishLaws/Law%20No.%20%2820%29%20of%202019%20on%20the%20Promulgation%20of%20Anti-Money%20Laundering%20and%20Terrorism%20Financing%20Law.pdf).
- The [Ministry of Commerce and Industry's current AML/CFT guidance](https://www.moci.gov.qa/en/business-services) describes when auditors fall within DNFBP scope and the ten-year record-keeping obligation. This is why AML-related record categories use their own applicability flag and date anchor.
- Microsoft's [SharePoint and OneDrive retention behavior](https://learn.microsoft.com/en-us/purview/retention-policies-sharepoint) distinguishes ordinary retention from records and regulatory records. Exact record locking and tenant settings must be tested for the principals that will use the archive.

The ten-year audit-file default is a conservative product policy selected to simplify Qatar practice retention and cover a longer operating horizon; it is not represented as the minimum in Law No. 8 of 2020. A Qatar-qualified records and audit-methodology owner must confirm the applicable categories before production. This decision does not verify tenant immutability, Purview licensing, data residency or a production deployment. No tenant setting was changed.

## Follow-up acceptance

Before production acceptance, T133/T134/T138 must verify the exact SharePoint retention control, principal behavior, version preservation, category/date-anchor handling, disposition review and hold workflow in a designated nonproduction tenant. T168 must obtain named Qatar professional/records acceptance. D31 does not close those evidence gates.
