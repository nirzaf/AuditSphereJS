-- WP07: guarded lifecycle command history.
--
-- The eleven primary state names are unchanged. This table records every accepted command with
-- its predecessor state, actor, evidence and aggregate version. PostgreSQL enforces that the
-- history is append-only and that only declared states can appear, so a caller cannot write an
-- arbitrary state name even through a future code path.

-- CreateTable
CREATE TABLE "EngagementTransition" (
    "id" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "command" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" TEXT,
    "evidence" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngagementTransition_engagementId_createdAt_idx" ON "EngagementTransition"("engagementId", "createdAt");

-- AddForeignKey
ALTER TABLE "EngagementTransition" ADD CONSTRAINT "EngagementTransition_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level guardrails (not modeled by Prisma; see docs/migration/00-baseline-reconciliation.md).
ALTER TABLE "EngagementTransition" ADD CONSTRAINT engagement_transition_state_check CHECK (
  "fromState" IN ('LEAD_INGESTION','PROPOSAL_GENERATION','DUAL_KEY_PENDING','ADVANCE_BILLING',
    'PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL',
    'DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY')
  AND "toState" IN ('LEAD_INGESTION','PROPOSAL_GENERATION','DUAL_KEY_PENDING','ADVANCE_BILLING',
    'PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL',
    'DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY'));

CREATE FUNCTION prevent_transition_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Engagement transition history is append-only'; END;
$$;
CREATE TRIGGER transition_append_only BEFORE UPDATE OR DELETE ON "EngagementTransition"
FOR EACH ROW EXECUTE FUNCTION prevent_transition_mutation();
