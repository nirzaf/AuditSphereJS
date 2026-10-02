# T018 tenant-root ownership review — 2026-10-02

**Review type:** schema and module-ownership review; read-only. No module-owned tables were changed by this review.

**Source:** `prisma/schema.prisma`, `packages/server/src/modules/*/README.md`, and the current T018 scope rules. “Inherited” means a record reaches a scoped root through a parent foreign key; it does not itself prove that every cross-reference between two parents has matching scope.

| Model group | Owner | Current scope enforcement | Finding / disposition |
| --- | --- | --- | --- |
| `Firm`, `Client`, `Engagement` | Platform ownership | `Client.firmId → Firm.id`; `Engagement(firmId, clientId) → Client(firmId, id)` | Core firm/client/engagement root chain is database-enforced. |
| `User`, `IdentitySessionRevocation`, `Membership`, `RoleGrant` | Platform identity / authorization | Users bind to Entra tenant/object; revocation events reference User and are append-only; Membership has composite firm/client/engagement FK; RoleGrant scope references are composite and nullable by grant level | These identity scope edges are enforced. `grantedBy`/`revokedBy` actor IDs are not foreign keys; this needs explicit identity-history review before claiming actor referential integrity. |
| `ClientRepository`, `TbImport`, `BalancePublication` | Fieldwork | Repository has firm/client FK; import and publication have composite engagement FK | These roots are scoped. |
| `TaxonomyVersion`, `MappingMemoryEntry` | Fieldwork | Carry `firmId` or `(firmId, clientId)` as scalar columns; mapping memory has no ownership FK | Firm/client deletion or bad direct writes can create orphaned ownership tuples; fieldwork owner must add reviewed ownership FKs. |
| `Document`, `DocumentVersion`, `StoredObject` | Fieldwork | `DocumentVersion → Document`; StoredObject has an engagement-ID FK and optional document-ID FK | Document has no Engagement FK. StoredObject’s engagement and optional document are independently referenced and may disagree. Add composite parent bindings under fieldwork ownership. |
| `TbRow`, `PublishedBalanceRow`, `TaxonomyLine`, `AdjustmentJournalLine` | Fieldwork | Each references one parent by UUID (`TbImport`, publication, taxonomy version, or journal) | Scope is inherited through a single parent; no duplicated tenant tuple exists on the child. The parent relationship itself should remain the only supported access path. |
| `MappingApproval` | Fieldwork | Has a composite engagement FK; `importId` and `taxonomyVersionId` use independent ID references | A valid approval can combine an import from a different engagement or taxonomy from a different firm. Fieldwork owner needs composite references matching engagement and firm. |
| `EngagementTransition`, `MaterialityAssessment` | Governance | Transition references engagement ID only. Materiality has composite engagement FK but independent publication and taxonomy IDs | Transition scope is inherited but not composite. Materiality can bind a publication/taxonomy from a different owner unless the service prevents it; database composite lineage is needed under governance ownership. |
| `RiskItem`, `RiskBandAssessment`, `RiskOwnerAssignment`, `RiskPartnerClearance` | Governance | RiskItem has composite engagement FK; children reference risk/assessment by IDs | Risk descendants inherit scope. `RiskOwnerAssignment.riskId` and `assessmentId` are independent and can disagree; governance owner must bind the exact assessment to its risk. |
| `ReviewNote`, `AdjustmentJournal` | Reporting, Fieldwork | Both have composite engagement FK | Their roots carry firm/client/engagement. Adjustment lines inherit through the journal ID. |
| `PracticeAccount`, `FirmPostingPolicy`, `PracticePeriod`, `PracticeJournal` | Practice | Carry `firmId` scalar; none references Firm | Firm ownership is not database-enforced. Practice owner needs firm FKs and a composite journal-period relation. |
| `PracticeJournalLine` | Practice | Composite FK to `(firmId, journalId)` | Journal ownership is enforced; `accountId` is not bound to a same-firm `PracticeAccount`. Practice owner needs a composite account FK. |
| `AuditEvent`, `AuditChainHead`, `AuditChainRecord` | Platform audit | Chain record references event ID; engagement IDs are scalar on all three records | Event/record/head engagement tuples are not relationally verified. Audit-chain owner must bind event and checkpoint rows to the same engagement. |
| `OutboxEvent`, `CommandReceipt` | Platform infrastructure | Scope may be present in JSON payload; receipt has scalar engagement ID | Outbox ownership is job-family-specific. CommandReceipt lacks an engagement FK; platform owner should add it where all receipts are engagement commands. |

## T018 outcome

The root chain and the membership, grant, import, publication and repository boundaries have concrete constraints and negative PostgreSQL fixtures. This full review found additional cross-owner gaps that cannot be repaired safely inside the T018 identity scope: each owning module must make its own reviewed migration and negative fixture before T018 can claim complete tenant-root integrity. In particular, cross-linked mapping approvals, materiality lineage, risk assignments, practice-ledger relations, and document storage bindings need owner follow-ups.

The source requirement R008’s holding-company, subsidiary and affiliate structure is not represented by this ownership chain; client legal profiles and organization hierarchy remain in T052. Production identity mapping also remains unavailable because there is no production database or reviewed identity map in this environment. The broader T018 review is therefore complete as an assessment, but T018 acceptance remains open until scoped owner changes and a production identity mapping procedure are reviewed.

No integration test is claimed from this read-only review. Existing executable evidence and its scope remain in [the T018 handoff](handoff.md).
