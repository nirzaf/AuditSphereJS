-- WP-C26-01: anchored review notes with grant-based review authority and no self-review.
--
-- Reviews had no record, so there was no way to enforce that a reviewer's authority is explicit or
-- that the person who raised a point cannot clear it themselves.

ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK (
  "capability" IN ('ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE','TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR','REVIEW_RAISE','REVIEW_RESOLVE','LIFECYCLE_COMMAND'));

-- CreateTable
CREATE TABLE "ReviewNote" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "workpackage" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "raisedBy" UUID NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedBy" UUID,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewNote_engagementId_status_idx" ON "ReviewNote"("engagementId", "status");

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_firmId_clientId_engagementId_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "ReviewNote" ADD CONSTRAINT review_note_status_check CHECK ("status" IN ('OPEN','RESOLVED'));
ALTER TABLE "ReviewNote" ADD CONSTRAINT review_note_text_check CHECK (length(trim("workpackage")) > 0 AND length(trim("body")) > 0);
-- A resolved note is exactly the one with the resolver, resolution text and resolution time.
ALTER TABLE "ReviewNote" ADD CONSTRAINT review_note_resolution_check CHECK (
  ("status" = 'RESOLVED' AND "resolvedBy" IS NOT NULL AND "resolution" IS NOT NULL AND length(trim("resolution")) > 0 AND "resolvedAt" IS NOT NULL)
  OR ("status" = 'OPEN' AND "resolvedBy" IS NULL AND "resolution" IS NULL AND "resolvedAt" IS NULL));
-- The database also refuses self-resolution.
ALTER TABLE "ReviewNote" ADD CONSTRAINT review_note_no_self_review_check CHECK ("resolvedBy" IS NULL OR "resolvedBy" <> "raisedBy");

-- A resolved note is frozen; a note is never deleted.
CREATE FUNCTION prevent_resolved_review_note_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Review notes are append-only'; END IF;
  IF OLD."status" = 'RESOLVED' THEN RAISE EXCEPTION 'A resolved review note is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER review_note_freeze BEFORE UPDATE OR DELETE ON "ReviewNote"
FOR EACH ROW EXECUTE FUNCTION prevent_resolved_review_note_mutation();
