-- DN-07 (D19): manager rounding is kept beside the computed value and must stay within plus or
-- minus 5 % of it (CURRENT 4.2.4). Recorded profit-before-tax normalization is stored with the
-- assessment it changed. Earlier rows keep NULL: their applied value was never rounded and
-- they carried no adjustments.
ALTER TABLE "MaterialityAssessment"
  ADD COLUMN "rawPlanningMateriality" DECIMAL(28,6),
  ADD COLUMN "normalizationAdjustments" JSONB;

ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_rounding_check CHECK (
  "rawPlanningMateriality" IS NULL
  OR ("rawPlanningMateriality" > 0
      AND ABS("planningMateriality" - "rawPlanningMateriality") * 100 <= "rawPlanningMateriality" * 5)
);

ALTER TABLE "MaterialityAssessment" ADD CONSTRAINT materiality_normalization_check CHECK (
  "normalizationAdjustments" IS NULL OR "benchmarkKind" = 'PROFIT_BEFORE_TAX'
);
