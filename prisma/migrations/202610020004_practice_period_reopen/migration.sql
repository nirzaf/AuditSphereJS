-- Permit only an explicitly privileged, reasoned and versioned period reopen. A close may not
-- strand draft journals, and journal drafts cannot be inserted into closed/out-of-range periods.
ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK ("capability" IN (
  'ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE',
  'TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR',
  'REVIEW_RAISE','REVIEW_RESOLVE','ADJUSTMENT_MANAGE','ADJUSTMENT_POST','LIFECYCLE_COMMAND',
  'PRACTICE_READ','PRACTICE_MANAGE','PRACTICE_POST','PRACTICE_REOPEN_PERIOD'
));

ALTER TABLE "PracticePeriod"
  ADD COLUMN "lastTransitionReason" text NOT NULL DEFAULT '',
  ADD COLUMN "lastTransitionBy" uuid REFERENCES "User"(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION practice_period_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM id FROM public."Firm" WHERE id = NEW."firmId" FOR UPDATE;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."firmId" <> OLD."firmId" OR NEW.id <> OLD.id
      OR NEW."startsOn" <> OLD."startsOn" OR NEW."endsOn" <> OLD."endsOn" THEN
      RAISE EXCEPTION 'Period identity and closed periods are immutable';
    END IF;
    IF NEW.closed IS DISTINCT FROM OLD.closed THEN
      IF NEW.version <> OLD.version + 1 OR NEW."lastTransitionBy" IS NULL
        OR length(btrim(NEW."lastTransitionReason")) < 10 THEN
        RAISE EXCEPTION 'Period transition requires an actor, reason and next version';
      END IF;
    ELSIF NEW.version <> OLD.version
      OR NEW."lastTransitionReason" IS DISTINCT FROM OLD."lastTransitionReason"
      OR NEW."lastTransitionBy" IS DISTINCT FROM OLD."lastTransitionBy" THEN
      RAISE EXCEPTION 'Period identity and closed periods are immutable';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."PracticePeriod"
    WHERE "firmId" = NEW."firmId" AND id <> NEW.id
      AND "startsOn" <= NEW."endsOn" AND "endsOn" >= NEW."startsOn"
  ) THEN
    RAISE EXCEPTION 'Accounting periods must not overlap';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION practice_journal_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE period public."PracticePeriod"; line_count bigint; debits numeric; credits numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Practice journals are never deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'Journals must begin as drafts'; END IF;
    SELECT * INTO period FROM public."PracticePeriod"
      WHERE id = NEW."periodId" AND "firmId" = NEW."firmId" FOR UPDATE;
    IF NOT FOUND OR period.closed OR NEW."accountingDate" < period."startsOn"
      OR NEW."accountingDate" > period."endsOn" THEN
      RAISE EXCEPTION 'Posting date must belong to an open accounting period';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'POSTED' THEN RAISE EXCEPTION 'Posted practice journals are immutable; reverse them'; END IF;
    IF NEW."firmId" <> OLD."firmId" OR NEW.id <> OLD.id OR NEW."periodId" <> OLD."periodId"
      OR NEW."reversalOf" IS DISTINCT FROM OLD."reversalOf" THEN
      RAISE EXCEPTION 'Journal scope is immutable';
    END IF;
    IF NEW.status = 'POSTED' THEN
      IF NOT EXISTS (SELECT 1 FROM public."FirmPostingPolicy" WHERE "firmId" = NEW."firmId") THEN
        RAISE EXCEPTION 'Approved firm posting policy is required';
      END IF;
      SELECT * INTO period FROM public."PracticePeriod" WHERE id = NEW."periodId" FOR UPDATE;
      IF period.closed OR NEW."accountingDate" < period."startsOn"
        OR NEW."accountingDate" > period."endsOn" THEN
        RAISE EXCEPTION 'Posting date must belong to an open accounting period';
      END IF;
      PERFORM id FROM public."PracticeAccount"
        WHERE id IN (SELECT "accountId" FROM public."PracticeJournalLine" WHERE "journalId" = NEW.id) FOR SHARE;
      IF EXISTS (
        SELECT 1 FROM public."PracticeAccount" a
        JOIN public."PracticeJournalLine" l ON l."accountId" = a.id
        WHERE l."journalId" = NEW.id AND (NOT a.active OR NOT a.posting)
      ) THEN RAISE EXCEPTION 'Inactive or nonposting accounts cannot post'; END IF;
      SELECT count(*), coalesce(sum(debit),0), coalesce(sum(credit),0)
        INTO line_count, debits, credits FROM public."PracticeJournalLine" WHERE "journalId" = NEW.id;
      IF line_count < 2 OR debits = 0 OR debits <> credits THEN
        RAISE EXCEPTION 'Practice journal must contain balanced nonzero double-entry lines';
      END IF;
      IF NEW."reversalOf" IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public."PracticeJournal"
          WHERE id = NEW."reversalOf" AND "firmId" = NEW."firmId" AND status = 'POSTED'
        ) THEN RAISE EXCEPTION 'Reversal requires a posted journal in the same firm'; END IF;
        IF EXISTS (
          (SELECT "accountId", position, debit, credit FROM public."PracticeJournalLine" WHERE "journalId" = NEW.id)
          EXCEPT
          (SELECT "accountId", position, credit, debit FROM public."PracticeJournalLine" WHERE "journalId" = NEW."reversalOf")
        ) OR EXISTS (
          (SELECT "accountId", position, credit, debit FROM public."PracticeJournalLine" WHERE "journalId" = NEW."reversalOf")
          EXCEPT
          (SELECT "accountId", position, debit, credit FROM public."PracticeJournalLine" WHERE "journalId" = NEW.id)
        ) THEN RAISE EXCEPTION 'Reversal lines must exactly invert the original'; END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
