-- WP08: per-client repositories and immutable provider-version identity.
--
-- Before this migration the Graph adapter used one global drive/folder pair and verified the
-- current item's eTag, so evidence from any client could be written to the same location and a
-- changed current item made an old reference unresolvable. A client repository binding and an
-- immutable provider version identity fix both gaps.

-- CreateTable
CREATE TABLE "ClientRepository" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "ClientRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "eTag" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientRepository_clientId_purpose_idx" ON "ClientRepository"("clientId", "purpose");
CREATE UNIQUE INDEX "ClientRepository_firmId_clientId_purpose_provider_key" ON "ClientRepository"("firmId", "clientId", "purpose", "provider");
CREATE INDEX "DocumentVersion_driveId_itemId_idx" ON "DocumentVersion"("driveId", "itemId");
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionId_key" ON "DocumentVersion"("documentId", "versionId");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "ClientRepository" ADD CONSTRAINT client_repository_purpose_check CHECK ("purpose" IN ('evidence','working'));
ALTER TABLE "ClientRepository" ADD CONSTRAINT client_repository_provider_check CHECK ("provider" = 'graph');
ALTER TABLE "ClientRepository" ADD CONSTRAINT client_repository_identifiers_check CHECK (length(trim("driveId")) > 0 AND length(trim("folderId")) > 0);

ALTER TABLE "DocumentVersion" ADD CONSTRAINT document_version_provider_check CHECK ("provider" = 'graph');
ALTER TABLE "DocumentVersion" ADD CONSTRAINT document_version_sha256_check CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "DocumentVersion" ADD CONSTRAINT document_version_size_check CHECK ("sizeBytes" >= 0);
ALTER TABLE "DocumentVersion" ADD CONSTRAINT document_version_identity_check CHECK (
  length(trim("itemId")) > 0 AND length(trim("versionId")) > 0 AND length(trim("eTag")) > 0);

-- Provider-version identity is append-only evidence: it is never rewritten in place.
CREATE FUNCTION prevent_document_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Document version identity is append-only'; END;
$$;
CREATE TRIGGER document_version_append_only BEFORE UPDATE OR DELETE ON "DocumentVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_document_version_mutation();
