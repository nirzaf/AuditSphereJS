-- MIG-009 / WP-C13: versioned mapping taxonomy and the approved-mapping boundary.
--
-- Seven fixed FSLI strings previously stood in for an approved taxonomy, and a finalized import
-- had no recorded mapping approval. This migration adds firm-scoped taxonomy versions whose
-- approved state is immutable, and an approval that binds one import's mapped rows to an exact
-- taxonomy version by digest so a later row change makes the approval stale.

-- Extend the capability vocabulary enforced by the grant check.
ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK (
  "capability" IN ('ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE','TAXONOMY_MANAGE','LIFECYCLE_COMMAND'));

-- CreateTable
CREATE TABLE "TaxonomyVersion" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "TaxonomyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyLine" (
    "id" UUID NOT NULL,
    "taxonomyVersionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "statementSection" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TaxonomyLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MappingApproval" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "taxonomyVersionId" UUID NOT NULL,
    "digest" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "approvedBy" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MappingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxonomyVersion_firmId_status_idx" ON "TaxonomyVersion"("firmId", "status");
CREATE UNIQUE INDEX "TaxonomyVersion_firmId_name_version_key" ON "TaxonomyVersion"("firmId", "name", "version");
CREATE INDEX "TaxonomyLine_taxonomyVersionId_sortOrder_idx" ON "TaxonomyLine"("taxonomyVersionId", "sortOrder");
CREATE UNIQUE INDEX "TaxonomyLine_taxonomyVersionId_code_key" ON "TaxonomyLine"("taxonomyVersionId", "code");
CREATE INDEX "MappingApproval_engagementId_approvedAt_idx" ON "MappingApproval"("engagementId", "approvedAt");
CREATE UNIQUE INDEX "MappingApproval_importId_taxonomyVersionId_key" ON "MappingApproval"("importId", "taxonomyVersionId");

-- AddForeignKey
ALTER TABLE "TaxonomyLine" ADD CONSTRAINT "TaxonomyLine_taxonomyVersionId_fkey" FOREIGN KEY ("taxonomyVersionId") REFERENCES "TaxonomyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MappingApproval" ADD CONSTRAINT "MappingApproval_firmId_clientId_engagementId_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MappingApproval" ADD CONSTRAINT "MappingApproval_importId_fkey" FOREIGN KEY ("importId") REFERENCES "TbImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MappingApproval" ADD CONSTRAINT "MappingApproval_taxonomyVersionId_fkey" FOREIGN KEY ("taxonomyVersionId") REFERENCES "TaxonomyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "TaxonomyVersion" ADD CONSTRAINT taxonomy_version_status_check CHECK ("status" IN ('DRAFT','APPROVED','RETIRED'));
ALTER TABLE "TaxonomyVersion" ADD CONSTRAINT taxonomy_version_number_check CHECK ("version" >= 1);
ALTER TABLE "TaxonomyVersion" ADD CONSTRAINT taxonomy_version_approval_check CHECK (
  ("status" = 'APPROVED' AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL)
  OR ("status" <> 'APPROVED' AND "approvedBy" IS NULL AND "approvedAt" IS NULL));

ALTER TABLE "TaxonomyLine" ADD CONSTRAINT taxonomy_line_section_check CHECK ("statementSection" IN ('INCOME','EXPENSE','ASSETS','LIABILITIES','EQUITY'));
ALTER TABLE "TaxonomyLine" ADD CONSTRAINT taxonomy_line_text_check CHECK (length(trim("code")) > 0 AND length(trim("label")) > 0);
ALTER TABLE "TaxonomyLine" ADD CONSTRAINT taxonomy_line_order_check CHECK ("sortOrder" >= 0);

ALTER TABLE "MappingApproval" ADD CONSTRAINT mapping_approval_digest_check CHECK ("digest" ~ '^[0-9a-f]{64}$');
ALTER TABLE "MappingApproval" ADD CONSTRAINT mapping_approval_row_count_check CHECK ("rowCount" >= 1);

-- An approved taxonomy version and its lines are immutable; a change is a new version.
CREATE FUNCTION prevent_approved_taxonomy_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'APPROVED' THEN RAISE EXCEPTION 'Approved taxonomy versions are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER taxonomy_version_freeze BEFORE UPDATE OR DELETE ON "TaxonomyVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_approved_taxonomy_version_update();

CREATE FUNCTION prevent_approved_taxonomy_line_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text; parent uuid;
BEGIN
  parent := CASE WHEN TG_OP = 'DELETE' THEN OLD."taxonomyVersionId" ELSE NEW."taxonomyVersionId" END;
  SELECT "status" INTO parent_status FROM "TaxonomyVersion" WHERE "id" = parent;
  IF parent_status = 'APPROVED' THEN RAISE EXCEPTION 'Approved taxonomy lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER taxonomy_line_freeze BEFORE INSERT OR UPDATE OR DELETE ON "TaxonomyLine"
FOR EACH ROW EXECUTE FUNCTION prevent_approved_taxonomy_line_mutation();

-- A mapping approval is historical evidence and is never rewritten.
CREATE FUNCTION prevent_mapping_approval_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Mapping approvals are append-only'; END;
$$;
CREATE TRIGGER mapping_approval_append_only BEFORE UPDATE OR DELETE ON "MappingApproval"
FOR EACH ROW EXECUTE FUNCTION prevent_mapping_approval_mutation();
