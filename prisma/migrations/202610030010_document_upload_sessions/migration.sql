-- T033: short-lived, actor-bound upload state. Bytes may exist before document meaning is committed,
-- but a Document/DocumentVersion is created only by an authorized finalization transaction.
CREATE TABLE "DocumentUploadSession" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "engagementId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  category TEXT NOT NULL,
  "originalFilename" VARCHAR(200) NOT NULL,
  "declaredContentType" TEXT NOT NULL,
  "declaredSizeBytes" INTEGER NOT NULL,
  "maxSizeBytes" INTEGER NOT NULL DEFAULT 15000000,
  "expectedSha256" TEXT,
  status TEXT NOT NULL DEFAULT 'INITIATED',
  "storageKey" TEXT NOT NULL UNIQUE,
  "storageReference" TEXT,
  "actualSha256" TEXT,
  "actualSizeBytes" INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "uploadedAt" TIMESTAMPTZ(6),
  "finalizedAt" TIMESTAMPTZ(6),
  "documentId" UUID,
  "documentVersionId" UUID,
  CONSTRAINT "DocumentUploadSession_engagement_scope_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentUploadSession_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentUploadSession_document_scope_fkey" FOREIGN KEY ("engagementId", "documentId") REFERENCES "Document"("engagementId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DocumentUploadSession_version_scope_fkey" FOREIGN KEY ("engagementId", "documentId", "documentVersionId") REFERENCES "DocumentVersion"("engagementId", "documentId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "document_upload_category_check" CHECK (category IN ('01_Administration & Planning', '02_Trial Balance & Schedules', '03_Fieldwork & Testing', '04_Drafts & Deliverables', '05_Final Signed Archive')),
  CONSTRAINT "document_upload_content_type_check" CHECK ("declaredContentType" IN ('application/pdf', 'text/csv')),
  CONSTRAINT "document_upload_size_check" CHECK ("declaredSizeBytes" BETWEEN 1 AND "maxSizeBytes" AND "maxSizeBytes" BETWEEN 1 AND 15000000),
  CONSTRAINT "document_upload_status_check" CHECK (status IN ('INITIATED', 'STORED', 'FINALIZED', 'EXPIRED', 'FAILED')),
  CONSTRAINT "document_upload_version_check" CHECK (version > 0),
  CONSTRAINT "document_upload_actual_bytes_check" CHECK (("actualSha256" IS NULL AND "actualSizeBytes" IS NULL) OR ("actualSha256" ~ '^[a-f0-9]{64}$' AND "actualSizeBytes" BETWEEN 1 AND "maxSizeBytes")),
  CONSTRAINT "document_upload_storage_state_check" CHECK ((status IN ('INITIATED', 'FAILED') AND "storageReference" IS NULL) OR (status IN ('STORED', 'FINALIZED') AND "storageReference" IS NOT NULL) OR status = 'EXPIRED'),
  CONSTRAINT "document_upload_document_state_check" CHECK ((status = 'FINALIZED' AND "documentId" IS NOT NULL AND "documentVersionId" IS NOT NULL AND "finalizedAt" IS NOT NULL) OR (status <> 'FINALIZED' AND "documentId" IS NULL AND "documentVersionId" IS NULL AND "finalizedAt" IS NULL))
);

CREATE UNIQUE INDEX "DocumentUploadSession_engagementId_id_key" ON "DocumentUploadSession"("engagementId", id);
CREATE UNIQUE INDEX "DocumentUploadSession_scope_id_key" ON "DocumentUploadSession"("firmId", "clientId", "engagementId", id);
CREATE INDEX "DocumentUploadSession_actor_engagement_status_expires_idx" ON "DocumentUploadSession"("actorId", "engagementId", status, "expiresAt");
CREATE INDEX "DocumentUploadSession_status_expires_idx" ON "DocumentUploadSession"(status, "expiresAt");

CREATE FUNCTION prevent_document_upload_session_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document upload sessions are retained as audit evidence';
  END IF;
  IF OLD.status = 'FINALIZED' OR NEW.id IS DISTINCT FROM OLD.id OR NEW."firmId" IS DISTINCT FROM OLD."firmId" OR
     NEW."clientId" IS DISTINCT FROM OLD."clientId" OR NEW."engagementId" IS DISTINCT FROM OLD."engagementId" OR
     NEW."actorId" IS DISTINCT FROM OLD."actorId" OR NEW.category IS DISTINCT FROM OLD.category OR
     NEW."originalFilename" IS DISTINCT FROM OLD."originalFilename" OR NEW."declaredContentType" IS DISTINCT FROM OLD."declaredContentType" OR
     NEW."declaredSizeBytes" IS DISTINCT FROM OLD."declaredSizeBytes" OR NEW."maxSizeBytes" IS DISTINCT FROM OLD."maxSizeBytes" OR
     NEW."expectedSha256" IS DISTINCT FROM OLD."expectedSha256" OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" OR
     (OLD.status = 'INITIATED' AND NEW.status NOT IN ('STORED', 'FAILED', 'EXPIRED')) OR
     (OLD.status = 'STORED' AND NEW.status NOT IN ('FINALIZED', 'FAILED', 'EXPIRED')) OR
     (OLD.status IN ('FAILED', 'EXPIRED') AND NEW.status <> OLD.status) OR
     (OLD.status = 'INITIATED' AND NEW.status IN ('FAILED', 'EXPIRED') AND (NEW."storageReference" IS NOT NULL OR NEW."actualSha256" IS NOT NULL OR NEW."actualSizeBytes" IS NOT NULL OR NEW."uploadedAt" IS NOT NULL)) OR
     (OLD.status = 'STORED' AND NEW.status IN ('FAILED', 'EXPIRED') AND (NEW."storageReference" IS DISTINCT FROM OLD."storageReference" OR NEW."actualSha256" IS DISTINCT FROM OLD."actualSha256" OR NEW."actualSizeBytes" IS DISTINCT FROM OLD."actualSizeBytes" OR NEW."uploadedAt" IS DISTINCT FROM OLD."uploadedAt")) OR
     (OLD.status = 'INITIATED' AND NEW.status = 'STORED' AND (NEW."storageReference" IS NULL OR NEW."actualSha256" IS NULL OR NEW."actualSizeBytes" IS NULL OR NEW."uploadedAt" IS NULL)) OR
     (OLD.status = 'STORED' AND NEW.status = 'FINALIZED' AND (NEW."documentId" IS NULL OR NEW."documentVersionId" IS NULL OR NEW."finalizedAt" IS NULL OR NEW."storageReference" IS DISTINCT FROM OLD."storageReference" OR NEW."actualSha256" IS DISTINCT FROM OLD."actualSha256" OR NEW."actualSizeBytes" IS DISTINCT FROM OLD."actualSizeBytes" OR NEW."uploadedAt" IS DISTINCT FROM OLD."uploadedAt")) OR
     (to_jsonb(NEW) - ARRAY['status', 'storageReference', 'actualSha256', 'actualSizeBytes', 'uploadedAt', 'finalizedAt', 'documentId', 'documentVersionId', 'version']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'storageReference', 'actualSha256', 'actualSizeBytes', 'uploadedAt', 'finalizedAt', 'documentId', 'documentVersionId', 'version']) OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'document upload session has an invalid state transition or immutable field rewrite';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER document_upload_session_append_only BEFORE UPDATE OR DELETE ON "DocumentUploadSession"
FOR EACH ROW EXECUTE FUNCTION prevent_document_upload_session_rewrite();
