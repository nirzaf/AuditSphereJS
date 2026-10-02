-- Governance owns risk assignments. Bind the assigned assessment to the same risk row
-- recorded by the assignment so direct database writes cannot cross-link two valid risks.

CREATE UNIQUE INDEX "RiskBandAssessment_id_riskId_key"
  ON "RiskBandAssessment" ("id", "riskId");

ALTER TABLE "RiskOwnerAssignment"
  DROP CONSTRAINT "RiskOwnerAssignment_assessmentId_fkey";

ALTER TABLE "RiskOwnerAssignment"
  ADD CONSTRAINT "RiskOwnerAssignment_assessmentId_riskId_fkey"
  FOREIGN KEY ("assessmentId", "riskId")
  REFERENCES "RiskBandAssessment" ("id", "riskId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
