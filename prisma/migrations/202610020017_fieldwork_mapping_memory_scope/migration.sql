-- Fieldwork owns approved-mapping memory. Each suggestion record belongs to an existing
-- firm/client pair and retains provenance from an approval for that same client.
CREATE UNIQUE INDEX "MappingApproval_firmId_clientId_id_key"
  ON "MappingApproval" ("firmId", "clientId", "id");

ALTER TABLE "MappingMemoryEntry"
  ADD CONSTRAINT "MappingMemoryEntry_client_scope_fkey"
    FOREIGN KEY ("firmId", "clientId")
    REFERENCES "Client" ("firmId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MappingMemoryEntry_source_approval_scope_fkey"
    FOREIGN KEY ("firmId", "clientId", "sourceApprovalId")
    REFERENCES "MappingApproval" ("firmId", "clientId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
