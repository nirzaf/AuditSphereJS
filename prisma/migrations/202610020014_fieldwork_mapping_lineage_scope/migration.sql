-- Fieldwork owns these links. A mapping approval must bind an import and taxonomy from
-- its exact scope; a publication must use the import and approval from that same scope.

CREATE UNIQUE INDEX "TbImport_firmId_clientId_engagementId_id_key"
  ON "TbImport" ("firmId", "clientId", "engagementId", "id");

CREATE UNIQUE INDEX "MappingApproval_firmId_clientId_engagementId_id_key"
  ON "MappingApproval" ("firmId", "clientId", "engagementId", "id");

CREATE UNIQUE INDEX "BalancePublication_firmId_clientId_engagementId_importId_key"
  ON "BalancePublication" ("firmId", "clientId", "engagementId", "importId");

ALTER TABLE "MappingApproval"
  DROP CONSTRAINT "MappingApproval_importId_fkey",
  DROP CONSTRAINT "MappingApproval_taxonomyVersionId_fkey",
  ADD CONSTRAINT "MappingApproval_import_scope_fkey"
    FOREIGN KEY ("firmId", "clientId", "engagementId", "importId")
    REFERENCES "TbImport" ("firmId", "clientId", "engagementId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MappingApproval_taxonomy_scope_fkey"
    FOREIGN KEY ("firmId", "taxonomyVersionId")
    REFERENCES "TaxonomyVersion" ("firmId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BalancePublication"
  DROP CONSTRAINT "BalancePublication_mappingApprovalId_fkey",
  ADD CONSTRAINT "BalancePublication_import_scope_fkey"
    FOREIGN KEY ("firmId", "clientId", "engagementId", "importId")
    REFERENCES "TbImport" ("firmId", "clientId", "engagementId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BalancePublication_mapping_approval_scope_fkey"
    FOREIGN KEY ("firmId", "clientId", "engagementId", "mappingApprovalId")
    REFERENCES "MappingApproval" ("firmId", "clientId", "engagementId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
