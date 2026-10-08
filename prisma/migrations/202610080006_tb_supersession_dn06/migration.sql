-- DN-06 (D18): at most one active finalized Trial Balance version per engagement. A finalized
-- version is superseded only by an explicit, audited command. The approvals that cite it are
-- invalidated by append-only records; the approved assessments themselves are never rewritten.

-- Refuse the rule over data that already breaks it, and name the engagement that must be fixed.
DO $$
DECLARE conflict record;
BEGIN
  SELECT "engagementId", count(*) AS finalized INTO conflict
  FROM "TbImport"
  WHERE status = 'FINALIZED'
  GROUP BY "engagementId"
  HAVING count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Engagement % has % finalized trial balances; supersede all but the active version before applying DN-06', conflict."engagementId", conflict.finalized;
  END IF;
END $$;

ALTER TABLE "TbImport" DROP CONSTRAINT import_status_check;
ALTER TABLE "TbImport" ADD CONSTRAINT import_status_check CHECK (status IN ('UPLOADED','QUEUED','PARSING','VALIDATING','MAPPING_REQUIRED','READY_TO_FINALIZE','FINALIZING','FINALIZED','SUPERSEDED','FAILED'));

CREATE UNIQUE INDEX "TbImport_one_active_finalized_key" ON "TbImport" ("engagementId") WHERE status = 'FINALIZED';

-- A superseded version stays as immutable as a finalized one.
CREATE OR REPLACE FUNCTION protect_finalized_rows() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN batch_id := OLD."importId"; ELSE batch_id := NEW."importId"; END IF;
  IF EXISTS (SELECT 1 FROM "TbImport" WHERE id = batch_id AND status IN ('FINALIZED', 'SUPERSEDED')) THEN
    RAISE EXCEPTION 'Finalized import is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Append-only record that a supersession invalidated one approved materiality assessment.
CREATE TABLE "MaterialityInvalidation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "assessmentId" uuid NOT NULL,
  "supersededImportId" uuid NOT NULL,
  reason varchar(500) NOT NULL,
  "invalidatedBy" uuid NOT NULL,
  "invalidatedAt" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "MaterialityInvalidation_assessmentId_key" UNIQUE ("assessmentId"),
  CONSTRAINT "MaterialityInvalidation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "MaterialityAssessment"(id) ON DELETE RESTRICT,
  CONSTRAINT "MaterialityInvalidation_import_scope_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId", "supersededImportId")
    REFERENCES "TbImport"("firmId", "clientId", "engagementId", id) ON DELETE RESTRICT,
  CONSTRAINT "MaterialityInvalidation_reason_check" CHECK (char_length(btrim(reason)) >= 10)
);

CREATE INDEX "MaterialityInvalidation_engagementId_supersededImportId_idx" ON "MaterialityInvalidation" ("engagementId", "supersededImportId");

-- Only an approved assessment of a superseded version can be invalidated, so a record cannot be
-- used to dismiss a live approval.
CREATE FUNCTION materiality_invalidation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "MaterialityAssessment" AS assessment
    JOIN "BalancePublication" AS publication ON publication.id = assessment."publicationId"
    JOIN "TbImport" AS batch ON batch.id = publication."importId"
    WHERE assessment.id = NEW."assessmentId"
      AND assessment.status = 'APPROVED'
      AND batch.id = NEW."supersededImportId"
      AND batch.status = 'SUPERSEDED'
  ) THEN
    RAISE EXCEPTION 'Only an approved assessment of a superseded trial balance can be invalidated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "MaterialityInvalidation_guard" BEFORE INSERT ON "MaterialityInvalidation"
FOR EACH ROW EXECUTE FUNCTION materiality_invalidation_guard();

CREATE FUNCTION materiality_invalidation_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Materiality invalidations are append-only';
END;
$$;

CREATE TRIGGER "MaterialityInvalidation_append_only" BEFORE UPDATE OR DELETE ON "MaterialityInvalidation"
FOR EACH ROW EXECUTE FUNCTION materiality_invalidation_append_only();
