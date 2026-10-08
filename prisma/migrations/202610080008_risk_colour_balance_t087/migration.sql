-- STE-JS-03 (T087 AC1, AC2): the colour is derived from the approved absolute balance against the
-- approved tolerable error and planning materiality (CURRENT section 4; D05), not from likelihood x magnitude.
-- Rows written under the superseded rule keep their recorded scores and stay valid under that rule version.

ALTER TABLE "RiskBandAssessment" ALTER COLUMN "likelihood" DROP NOT NULL;
ALTER TABLE "RiskBandAssessment" ALTER COLUMN "magnitude" DROP NOT NULL;
ALTER TABLE "RiskBandAssessment" ADD COLUMN "accountCode" TEXT;
ALTER TABLE "RiskBandAssessment" ADD COLUMN "absoluteBalance" NUMERIC(28,6);
ALTER TABLE "RiskBandAssessment" ADD COLUMN "tolerableError" NUMERIC(28,6);
ALTER TABLE "RiskBandAssessment" ADD COLUMN "planningMateriality" NUMERIC(28,6);
ALTER TABLE "RiskBandAssessment" ADD COLUMN "materialityAssessmentId" UUID;
ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT "RiskBandAssessment_materialityAssessmentId_fkey"
  FOREIGN KEY ("materialityAssessmentId") REFERENCES "MaterialityAssessment"("id");

ALTER TABLE "RiskBandAssessment" DROP CONSTRAINT risk_band_scores_check;
ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT risk_band_scores_check CHECK (
  "ruleVersion" <> 'STE-RISK-BAND-2026.1' OR ("likelihood" BETWEEN 1 AND 3 AND "magnitude" BETWEEN 1 AND 3));

ALTER TABLE "RiskBandAssessment" DROP CONSTRAINT risk_band_derivation_check;
ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT risk_band_derivation_check CHECK (
  CASE WHEN "ruleVersion" = 'STE-RISK-BAND-2026.1' THEN "band" = CASE
      WHEN "significant" OR "fraudRisk" THEN 'RED'
      WHEN "likelihood" * "magnitude" >= 6 THEN 'RED'
      WHEN "likelihood" * "magnitude" >= 3 THEN 'AMBER'
      ELSE 'GREEN' END
    ELSE "band" = CASE
      WHEN "significant" OR "fraudRisk" THEN 'RED'
      WHEN "absoluteBalance" >= "planningMateriality" THEN 'RED'
      WHEN "absoluteBalance" >= "tolerableError" THEN 'AMBER'
      ELSE 'GREEN' END
  END);

ALTER TABLE "RiskBandAssessment" ADD CONSTRAINT risk_band_colour_inputs_check CHECK (
  "ruleVersion" = 'STE-RISK-BAND-2026.1' OR (
    "likelihood" IS NULL AND "magnitude" IS NULL
    AND "accountCode" IS NOT NULL AND length(trim("accountCode")) > 0
    AND "absoluteBalance" IS NOT NULL AND "absoluteBalance" >= 0
    AND "tolerableError" IS NOT NULL AND "tolerableError" > 0
    AND "planningMateriality" IS NOT NULL AND "planningMateriality" >= "tolerableError"
    AND "materialityAssessmentId" IS NOT NULL));
