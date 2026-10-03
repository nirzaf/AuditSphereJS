-- T032: scoped, version-pinned links for engagement and Trial Balance evidence.
CREATE UNIQUE INDEX "TbImport_engagementId_id_key" ON "TbImport"("engagementId", id);

CREATE TABLE "DocumentLink" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "engagementId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "documentVersionId" UUID NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetImportId" UUID,
  label VARCHAR(200) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMPTZ(6),
  "revokedBy" UUID,
  "revokeReason" VARCHAR(1000),
  CONSTRAINT "DocumentLink_engagement_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentLink_document_scope_fkey" FOREIGN KEY ("engagementId", "documentId") REFERENCES "Document"("engagementId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentLink_version_scope_fkey" FOREIGN KEY ("engagementId", "documentId", "documentVersionId") REFERENCES "DocumentVersion"("engagementId", "documentId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentLink_import_scope_fkey" FOREIGN KEY ("engagementId", "targetImportId") REFERENCES "TbImport"("engagementId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentLink_creator_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "document_link_target_check" CHECK (("targetType" = 'ENGAGEMENT' AND "targetImportId" IS NULL) OR ("targetType" = 'TRIAL_BALANCE_IMPORT' AND "targetImportId" IS NOT NULL)),
  CONSTRAINT "document_link_version_check" CHECK (version > 0),
  CONSTRAINT "document_link_revocation_check" CHECK (("revokedAt" IS NULL AND "revokedBy" IS NULL AND "revokeReason" IS NULL AND version = 1) OR ("revokedAt" IS NOT NULL AND "revokedBy" IS NOT NULL AND length(trim("revokeReason")) BETWEEN 10 AND 1000 AND version = 2))
);

CREATE UNIQUE INDEX "DocumentLink_active_engagement_target_key" ON "DocumentLink"("engagementId", "documentVersionId") WHERE "targetType" = 'ENGAGEMENT' AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "DocumentLink_active_import_target_key" ON "DocumentLink"("engagementId", "targetImportId", "documentVersionId") WHERE "targetType" = 'TRIAL_BALANCE_IMPORT' AND "revokedAt" IS NULL;
CREATE INDEX "DocumentLink_engagementId_targetType_targetImportId_createdAt_idx" ON "DocumentLink"("engagementId", "targetType", "targetImportId", "createdAt");
CREATE INDEX "DocumentLink_engagementId_documentId_idx" ON "DocumentLink"("engagementId", "documentId");

CREATE FUNCTION prevent_document_link_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document links are append-only';
  END IF;
  IF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL OR NEW."revokedBy" IS NULL OR NEW."revokeReason" IS NULL OR NEW.version <> OLD.version + 1 OR
     (to_jsonb(NEW) - ARRAY['revokedAt', 'revokedBy', 'revokeReason', 'version']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revokedAt', 'revokedBy', 'revokeReason', 'version']) THEN
    RAISE EXCEPTION 'document links are immutable except for one reasoned revocation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER document_link_append_only BEFORE UPDATE OR DELETE ON "DocumentLink"
FOR EACH ROW EXECUTE FUNCTION prevent_document_link_rewrite();
