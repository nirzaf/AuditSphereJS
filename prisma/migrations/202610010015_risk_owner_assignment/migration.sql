-- WP-P6-04: risk owner assignment constrained by the band's minimum staffing rank.
--
-- A risk could be assessed but had no recorded owner, so a red band could be left unassigned or
-- assigned to a rank that cannot perform the response. The assignment binds the exact assessment.

-- CreateTable
CREATE TABLE "RiskOwnerAssignment" (
    "id" UUID NOT NULL,
    "riskId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "ownerStaffingLevel" TEXT NOT NULL,
    "assignedBy" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskOwnerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskOwnerAssignment_riskId_assignedAt_idx" ON "RiskOwnerAssignment"("riskId", "assignedAt");

-- AddForeignKey
ALTER TABLE "RiskOwnerAssignment" ADD CONSTRAINT "RiskOwnerAssignment_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiskOwnerAssignment" ADD CONSTRAINT "RiskOwnerAssignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "RiskBandAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "RiskOwnerAssignment" ADD CONSTRAINT risk_owner_staffing_check CHECK (
  "ownerStaffingLevel" IN ('StaffAssociate','SeniorAuditor','AuditManager','EngagementPartner'));

-- The minimum rank for the assessed band is enforced by a trigger, because PostgreSQL forbids a
-- subquery inside a CHECK constraint.
CREATE FUNCTION require_minimum_risk_owner_rank() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE required_rank int; owner_rank int; parent_band text;
BEGIN
  SELECT "band" INTO parent_band FROM "RiskBandAssessment" WHERE "id" = NEW."assessmentId";
  IF parent_band IS NULL THEN RAISE EXCEPTION 'Risk band assessment not found'; END IF;
  required_rank := CASE parent_band WHEN 'RED' THEN 3 WHEN 'AMBER' THEN 2 ELSE 1 END;
  owner_rank := CASE NEW."ownerStaffingLevel" WHEN 'EngagementPartner' THEN 4 WHEN 'AuditManager' THEN 3 WHEN 'SeniorAuditor' THEN 2 ELSE 1 END;
  IF owner_rank < required_rank THEN
    RAISE EXCEPTION 'A % band needs an owner at rank % or above', parent_band, required_rank;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER risk_owner_rank_required BEFORE INSERT ON "RiskOwnerAssignment"
FOR EACH ROW EXECUTE FUNCTION require_minimum_risk_owner_rank();

CREATE FUNCTION prevent_risk_owner_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Risk owner assignments are append-only'; END;
$$;
CREATE TRIGGER risk_owner_append_only BEFORE UPDATE OR DELETE ON "RiskOwnerAssignment"
FOR EACH ROW EXECUTE FUNCTION prevent_risk_owner_mutation();
