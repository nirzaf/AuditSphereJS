-- Governance owns materiality lineage. A calculation must reference a publication from its
-- exact engagement and a taxonomy version owned by the same firm. The referenced composite
-- keys are supplied by the Fieldwork-owned migration 202610020012_fieldwork_scope_keys.

ALTER TABLE "MaterialityAssessment"
  DROP CONSTRAINT "MaterialityAssessment_publicationId_fkey",
  DROP CONSTRAINT "MaterialityAssessment_taxonomyVersionId_fkey";

ALTER TABLE "MaterialityAssessment"
  ADD CONSTRAINT "MaterialityAssessment_publication_scope_fkey"
  FOREIGN KEY ("firmId", "clientId", "engagementId", "publicationId")
  REFERENCES "BalancePublication" ("firmId", "clientId", "engagementId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MaterialityAssessment_taxonomy_scope_fkey"
  FOREIGN KEY ("firmId", "taxonomyVersionId")
  REFERENCES "TaxonomyVersion" ("firmId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
