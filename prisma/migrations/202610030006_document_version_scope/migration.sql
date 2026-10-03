-- T032: bind immutable provider versions and queued Trial Balance imports to one document scope.
-- The original name and five-folder category remain application metadata; neither is a storage path.

ALTER TABLE "Document"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT '02_Trial Balance & Schedules';

ALTER TABLE "Document"
  ADD CONSTRAINT document_category_check CHECK ("category" IN (
    '01_Administration & Planning',
    '02_Trial Balance & Schedules',
    '03_Fieldwork & Testing',
    '04_Drafts & Deliverables',
    '05_Final Signed Archive'
  ));

-- Existing versions have complete Graph identity fields. Backfill their immutable adapter
-- references before making the new relational scope and version sequence mandatory.
DROP TRIGGER IF EXISTS document_version_append_only ON "DocumentVersion";

ALTER TABLE "DocumentVersion"
  ADD COLUMN "engagementId" UUID,
  ADD COLUMN "sequence" INTEGER,
  ADD COLUMN "storageReference" TEXT;

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY "documentId" ORDER BY "createdAt", id)::INTEGER AS sequence,
         count(*) OVER (PARTITION BY "documentId")::INTEGER AS version_count
  FROM "DocumentVersion"
)
UPDATE "DocumentVersion" AS version
SET "engagementId" = document."engagementId",
    "sequence" = GREATEST(document."version" - ranked.version_count, 0) + ranked.sequence,
    "storageReference" = 'graph:' || translate(
      rtrim(replace(encode(convert_to(json_build_object(
        'driveId', version."driveId",
        'itemId', version."itemId",
        'versionId', version."versionId",
        'eTag', version."eTag",
        'sha256', version."sha256",
        'sizeBytes', version."sizeBytes"
      )::TEXT, 'UTF8'), 'base64'), E'\n', ''), '='),
      '+/', '-_'
    )
FROM "Document" AS document, ranked
WHERE version."documentId" = document.id
  AND ranked.id = version.id;

UPDATE "Document" AS document
SET "version" = GREATEST(document."version", versions.latest_sequence)
FROM (
  SELECT "documentId", MAX("sequence") AS latest_sequence
  FROM "DocumentVersion"
  GROUP BY "documentId"
) AS versions
WHERE document.id = versions."documentId";

ALTER TABLE "DocumentVersion"
  ALTER COLUMN "engagementId" SET NOT NULL,
  ALTER COLUMN "sequence" SET NOT NULL,
  ALTER COLUMN "storageReference" SET NOT NULL,
  ALTER COLUMN "driveId" DROP NOT NULL,
  ALTER COLUMN "itemId" DROP NOT NULL,
  ALTER COLUMN "eTag" DROP NOT NULL,
  DROP CONSTRAINT "DocumentVersion_documentId_fkey",
  DROP CONSTRAINT document_version_provider_check,
  DROP CONSTRAINT document_version_identity_check,
  ADD CONSTRAINT document_version_provider_check CHECK (provider IN ('graph', 'local-s3')),
  ADD CONSTRAINT document_version_identity_check CHECK (
    length(trim("versionId")) > 0 AND length(trim("storageReference")) > 0 AND
    ((provider = 'graph'
      AND "storageReference" LIKE 'graph:%'
      AND "driveId" IS NOT NULL AND length(trim("driveId")) > 0
      AND "itemId" IS NOT NULL AND length(trim("itemId")) > 0
      AND "eTag" IS NOT NULL AND length(trim("eTag")) > 0)
    OR (provider = 'local-s3'
      AND "storageReference" NOT LIKE 'graph:%'
      AND "driveId" IS NULL AND "itemId" IS NULL AND "eTag" IS NULL))
  ),
  ADD CONSTRAINT document_version_sequence_check CHECK ("sequence" > 0),
  ADD CONSTRAINT "DocumentVersion_document_scope_fkey"
    FOREIGN KEY ("engagementId", "documentId")
    REFERENCES "Document" ("engagementId", id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DocumentVersion_storageReference_key" ON "DocumentVersion"("storageReference");
DROP INDEX "DocumentVersion_documentId_versionId_key";
CREATE UNIQUE INDEX "DocumentVersion_driveId_itemId_versionId_key" ON "DocumentVersion"("driveId", "itemId", "versionId");
CREATE UNIQUE INDEX "DocumentVersion_documentId_sequence_key" ON "DocumentVersion"("documentId", "sequence");
CREATE UNIQUE INDEX "DocumentVersion_engagementId_documentId_id_key" ON "DocumentVersion"("engagementId", "documentId", id);
CREATE INDEX "DocumentVersion_engagementId_documentId_sequence_idx" ON "DocumentVersion"("engagementId", "documentId", "sequence");

-- The row is an exact content snapshot. Its sequence must match the parent document head, and a
-- later version cannot skip or rewrite an earlier one.
CREATE FUNCTION enforce_document_version_sequence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  document_version INTEGER;
  previous_sequence INTEGER;
BEGIN
  SELECT "version" INTO document_version
  FROM "Document"
  WHERE id = NEW."documentId" AND "engagementId" = NEW."engagementId";
  IF document_version IS NULL OR document_version <> NEW."sequence" THEN
    RAISE EXCEPTION 'Document version sequence must match its document head';
  END IF;
  SELECT COALESCE(MAX("sequence"), 0) INTO previous_sequence
  FROM "DocumentVersion"
  WHERE "engagementId" = NEW."engagementId" AND "documentId" = NEW."documentId";
  IF NEW."sequence" <> previous_sequence + 1 THEN
    RAISE EXCEPTION 'Document version sequence must be contiguous';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER document_version_sequence_guard BEFORE INSERT ON "DocumentVersion"
FOR EACH ROW EXECUTE FUNCTION enforce_document_version_sequence();

CREATE TRIGGER document_version_append_only BEFORE UPDATE OR DELETE ON "DocumentVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_document_version_mutation();

ALTER TABLE "TbImport" ADD COLUMN "documentVersionId" UUID;
ALTER TABLE "TbImport"
  ADD CONSTRAINT "TbImport_document_version_scope_fkey"
    FOREIGN KEY ("engagementId", "documentId", "documentVersionId")
    REFERENCES "DocumentVersion" ("engagementId", "documentId", id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TbImport_documentVersionId_idx" ON "TbImport"("documentVersionId");
