-- Fieldwork owns document and upload bindings. A document, trial-balance import and stored
-- object must resolve to the same engagement; IDs alone do not establish that boundary.
CREATE UNIQUE INDEX "Document_engagementId_id_key"
  ON "Document" ("engagementId", "id");

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TbImport"
  DROP CONSTRAINT "import_document_fk",
  ADD CONSTRAINT "TbImport_document_scope_fkey"
    FOREIGN KEY ("engagementId", "documentId")
    REFERENCES "Document" ("engagementId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoredObject"
  DROP CONSTRAINT "StoredObject_documentId_fkey",
  ADD CONSTRAINT "StoredObject_document_scope_fkey"
    FOREIGN KEY ("engagementId", "documentId")
    REFERENCES "Document" ("engagementId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
