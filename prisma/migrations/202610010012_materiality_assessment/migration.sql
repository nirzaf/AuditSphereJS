-- WP-P6-02: persisted materiality assessments bound to an exact published version.
--
-- The calculator was pure but nothing recorded its inputs and result, so an approval had no
-- version to bind to and a newer trial balance could not invalidate it.

-- Extend the capability vocabulary enforced by the grant check.
ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK (
  "capability" IN ('ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE','TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','LIFECYCLE_COMMAND'));

-- CreateTable
CREATE TABLE "MaterialityAssessment" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "taxonomyVersionId" UUID NOT NULL,
    "benchmarkKind" TEXT NOT NULL,
    "destinationCode" TEXT,
    "sourceLineCount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "benchmarkAmount" DECIMAL(28,6) NOT NULL,
    "planningMateriality" DECIMAL(28,6) NOT NULL,
    "tolerableError" DECIMAL(28,6) NOT NULL,
    "sadThreshold" DECIMAL(28,6) NOT NULL,
    "ratePercent" DECIMAL(28,6) NOT NULL,
    "performancePercent" DECIMAL(28,6) NOT NULL,
    "trivialPercent" DECIMAL(28,6) NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "calculatedBy" UUID NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialityAssessment_engagementId_calculatedAt_idx" ON "MaterialityAssessment"("engagementId", "calculatedAt");

-- AddForeignKey
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT "MaterialityAssessment_firmId_clientId_engagementId_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT "MaterialityAssessment_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "BalancePublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT "MaterialityAssessment_taxonomyVersionId_fkey" FOREIGN KEY ("taxonomyVersionId") REFERENCES "TaxonomyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_status_check CHECK ("status" IN ('DRAFT','APPROVED'));
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_approval_check CHECK (
  ("status" = 'APPROVED' AND "approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL)
  OR ("status" <> 'APPROVED' AND "approvedBy" IS NULL AND "approvedAt" IS NULL));
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_benchmark_check CHECK (
  "benchmarkKind" IN ('REVENUE','PROFIT_BEFORE_TAX','TOTAL_ASSETS','NET_ASSETS','TOTAL_EXPENSES','MAPPED_LINE'));
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_positive_check CHECK (
  "benchmarkAmount" > 0 AND "planningMateriality" >= 0 AND "tolerableError" >= 0 AND "sadThreshold" >= 0);
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_percent_check CHECK (
  "ratePercent" >= 0 AND "ratePercent" <= 100 AND "performancePercent" >= 0 AND "performancePercent" <= 100 AND "trivialPercent" >= 0 AND "trivialPercent" <= 100);
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_lineage_check CHECK (
  "sourceLineCount" >= 1 AND length(trim("policyVersion")) > 0 AND "inputHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_mapped_line_check CHECK (
  "benchmarkKind" <> 'MAPPED_LINE' OR (length(trim(coalesce("destinationCode", ''))) > 0));

-- An approved assessment is frozen, and an assessment is never deleted.
CREATE FUNCTION prevent_materiality_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Materiality assessments are append-only'; END IF;
  IF OLD."status" = 'APPROVED' THEN RAISE EXCEPTION 'An approved materiality assessment is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER materiality_freeze BEFORE UPDATE OR DELETE ON "MaterialityAssessment"
FOR EACH ROW EXECUTE FUNCTION prevent_materiality_mutation();
