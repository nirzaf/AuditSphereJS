-- WP-C15-01: client audit adjustment journals with balanced posting and reversal.
--
-- Audit adjustments had no record, so there was no way to keep them separate from the firm's own
-- ledger or to prevent a posted adjustment being edited. Drafts are editable; a posted journal is
-- immutable and is corrected only by a reversal journal.

ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK (
  "capability" IN ('ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE','TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR','REVIEW_RAISE','REVIEW_RESOLVE','ADJUSTMENT_MANAGE','ADJUSTMENT_POST','LIFECYCLE_COMMAND'));

-- CreateTable
CREATE TABLE "AdjustmentJournal" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" UUID,
    "postedAt" TIMESTAMP(3),
    "reversesJournalId" UUID,

    CONSTRAINT "AdjustmentJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjustmentJournalLine" (
    "id" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "fsli" TEXT,
    "debit" DECIMAL(28,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(28,6) NOT NULL DEFAULT 0,

    CONSTRAINT "AdjustmentJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdjustmentJournal_reversesJournalId_key" ON "AdjustmentJournal"("reversesJournalId");
CREATE INDEX "AdjustmentJournal_engagementId_createdAt_idx" ON "AdjustmentJournal"("engagementId", "createdAt");
CREATE UNIQUE INDEX "AdjustmentJournal_engagementId_reference_key" ON "AdjustmentJournal"("engagementId", "reference");
CREATE UNIQUE INDEX "AdjustmentJournalLine_journalId_position_key" ON "AdjustmentJournalLine"("journalId", "position");

-- AddForeignKey
ALTER TABLE "AdjustmentJournal" ADD CONSTRAINT "AdjustmentJournal_firmId_clientId_engagementId_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdjustmentJournal" ADD CONSTRAINT "AdjustmentJournal_reversesJournalId_fkey" FOREIGN KEY ("reversesJournalId") REFERENCES "AdjustmentJournal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdjustmentJournalLine" ADD CONSTRAINT "AdjustmentJournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "AdjustmentJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "AdjustmentJournal" ADD CONSTRAINT adjustment_status_check CHECK ("status" IN ('DRAFT','POSTED','REVERSED'));
ALTER TABLE "AdjustmentJournal" ADD CONSTRAINT adjustment_text_check CHECK (length(trim("reference")) > 0 AND length(trim("memo")) > 0);
ALTER TABLE "AdjustmentJournal" ADD CONSTRAINT adjustment_version_check CHECK ("version" >= 1);
ALTER TABLE "AdjustmentJournal" ADD CONSTRAINT adjustment_posting_check CHECK (
  ("status" = 'DRAFT' AND "postedBy" IS NULL AND "postedAt" IS NULL)
  OR ("status" IN ('POSTED','REVERSED') AND "postedBy" IS NOT NULL AND "postedAt" IS NOT NULL));
ALTER TABLE "AdjustmentJournalLine" ADD CONSTRAINT adjustment_line_text_check CHECK (length(trim("accountCode")) > 0);
-- Exactly one side of a line carries the amount, and money is never negative here.
ALTER TABLE "AdjustmentJournalLine" ADD CONSTRAINT adjustment_line_side_check CHECK (
  "debit" >= 0 AND "credit" >= 0
  AND (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)));

-- Lines exist only while their journal is a draft.
CREATE FUNCTION prevent_posted_adjustment_line_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; parent_status text;
BEGIN
  parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."journalId" ELSE NEW."journalId" END;
  SELECT "status" INTO parent_status FROM "AdjustmentJournal" WHERE "id" = parent_id;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Adjustment lines are editable only while the journal is a draft'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER adjustment_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "AdjustmentJournalLine"
FOR EACH ROW EXECUTE FUNCTION prevent_posted_adjustment_line_mutation();

-- Posting requires at least two lines that balance to a non-zero total.
CREATE FUNCTION require_balanced_adjustment_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line_count int; total_debit numeric; total_credit numeric;
BEGIN
  IF NEW."status" = 'POSTED' AND OLD."status" = 'DRAFT' THEN
    SELECT count(*), coalesce(sum("debit"), 0), coalesce(sum("credit"), 0) INTO line_count, total_debit, total_credit
    FROM "AdjustmentJournalLine" WHERE "journalId" = NEW."id";
    IF line_count < 2 THEN RAISE EXCEPTION 'An adjustment journal needs at least two lines'; END IF;
    IF total_debit <> total_credit THEN RAISE EXCEPTION 'An adjustment journal must balance (debit % vs credit %)', total_debit, total_credit; END IF;
    IF total_debit = 0 THEN RAISE EXCEPTION 'An adjustment journal must not be zero'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER adjustment_posting_balance BEFORE UPDATE ON "AdjustmentJournal"
FOR EACH ROW EXECUTE FUNCTION require_balanced_adjustment_journal();

-- A posted journal is immutable except for the one transition to REVERSED; journals are never deleted.
CREATE FUNCTION freeze_adjustment_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Adjustment journals are append-only'; END IF;
  IF OLD."status" = 'DRAFT' THEN RETURN NEW; END IF;
  IF OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED' THEN
    IF NEW."reference" IS DISTINCT FROM OLD."reference" OR NEW."memo" IS DISTINCT FROM OLD."memo"
       OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."reversesJournalId" IS DISTINCT FROM OLD."reversesJournalId"
       OR NEW."postedBy" IS DISTINCT FROM OLD."postedBy" OR NEW."postedAt" IS DISTINCT FROM OLD."postedAt" THEN
      RAISE EXCEPTION 'A posted adjustment journal is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A posted adjustment journal is immutable';
END;
$$;
CREATE TRIGGER adjustment_journal_freeze BEFORE UPDATE OR DELETE ON "AdjustmentJournal"
FOR EACH ROW EXECUTE FUNCTION freeze_adjustment_journal();
