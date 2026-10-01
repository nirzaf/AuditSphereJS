-- WP-P6-03: persisted risk-band assessments and mandatory Partner clearance of red bands.
--
-- The pure band rule existed but nothing recorded an assessment, so a red band had no clearance
-- requirement. The database now derives and validates the colour itself.

ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK (
  "capability" IN ('ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE','TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR','LIFECYCLE_COMMAND'));

-- CreateTable
CREATE TABLE "RiskItem" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskBandAssessment" (
    "id" UUID NOT NULL,
    "riskId" UUID NOT NULL,
    "likelihood" INTEGER NOT NULL,
    "magnitude" INTEGER NOT NULL,
    "significant" BOOLEAN NOT NULL,
    "fraudRisk" BOOLEAN NOT NULL,
    "band" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "assessedBy" UUID NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskBandAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskPartnerClearance" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskPartnerClearance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskItem_engagementId_createdAt_idx" ON "RiskItem"("engagementId", "createdAt");
CREATE INDEX "RiskBandAssessment_riskId_assessedAt_idx" ON "RiskBandAssessment"("riskId", "assessedAt");
CREATE UNIQUE INDEX "RiskPartnerClearance_assessmentId_key" ON "RiskPartnerClearance"("assessmentId");

-- AddForeignKey
ALTER TABLE "RiskItem" ADD CONSTRAINT "RiskItem_firmId_clientId_engagementId_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT "RiskBandAssessment_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiskPartnerClearance" ADD CONSTRAINT "RiskPartnerClearance_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "RiskBandAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "RiskItem" ADD CONSTRAINT risk_item_title_check CHECK (length(trim("title")) > 0);
ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT risk_band_scores_check CHECK ("likelihood" BETWEEN 1 AND 3 AND "magnitude" BETWEEN 1 AND 3);
ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT risk_band_value_check CHECK ("band" IN ('GREEN','AMBER','RED'));
ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT risk_band_rule_version_check CHECK (length(trim("ruleVersion")) > 0);
-- The colour must follow from the recorded inputs; a caller cannot store an arbitrary band.
ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT risk_band_derivation_check CHECK (
  "band" = CASE
    WHEN "significant" OR "fraudRisk" THEN 'RED'
    WHEN "likelihood" * "magnitude" >= 6 THEN 'RED'
    WHEN "likelihood" * "magnitude" >= 3 THEN 'AMBER'
    ELSE 'GREEN' END);
ALTER TABLE "RiskPartnerClearance" ADD CONSTRAINT risk_clearance_note_check CHECK (length(trim("note")) > 0);

CREATE FUNCTION prevent_risk_assessment_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Risk band assessments are append-only'; END;
$$;
CREATE TRIGGER risk_assessment_append_only BEFORE UPDATE OR DELETE ON "RiskBandAssessment"
FOR EACH ROW EXECUTE FUNCTION prevent_risk_assessment_mutation();

CREATE FUNCTION prevent_risk_clearance_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Risk Partner clearances are append-only'; END;
$$;
CREATE TRIGGER risk_clearance_append_only BEFORE UPDATE OR DELETE ON "RiskPartnerClearance"
FOR EACH ROW EXECUTE FUNCTION prevent_risk_clearance_mutation();

-- Partner clearance applies only to a red band assessment.
CREATE FUNCTION require_red_band_for_clearance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_band text;
BEGIN
  SELECT "band" INTO parent_band FROM "RiskBandAssessment" WHERE "id" = NEW."assessmentId";
  IF parent_band IS NULL THEN RAISE EXCEPTION 'Risk band assessment not found'; END IF;
  IF parent_band <> 'RED' THEN RAISE EXCEPTION 'Partner clearance applies only to a red band assessment'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER risk_clearance_requires_red BEFORE INSERT ON "RiskPartnerClearance"
FOR EACH ROW EXECUTE FUNCTION require_red_band_for_clearance();
