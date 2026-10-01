ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK ("capability" IN ('ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE','TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR','REVIEW_RAISE','REVIEW_RESOLVE','ADJUSTMENT_MANAGE','ADJUSTMENT_POST','LIFECYCLE_COMMAND','PRACTICE_READ','PRACTICE_MANAGE','PRACTICE_POST'));
CREATE TABLE "PracticeAccount" (
 id uuid PRIMARY KEY, "firmId" uuid NOT NULL REFERENCES "Firm"(id), code text NOT NULL, name text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')), active boolean NOT NULL DEFAULT true, posting boolean NOT NULL DEFAULT true,
 UNIQUE ("firmId", code), UNIQUE ("firmId", id), CHECK (length(trim(code)) > 0 AND length(trim(name)) > 0)
);
CREATE TABLE "FirmPostingPolicy" (
 "firmId" uuid PRIMARY KEY REFERENCES "Firm"(id), "policyVersion" text NOT NULL,
 "approvedBy" uuid NOT NULL REFERENCES "User"(id), "approvedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revenueTreatment" text NOT NULL CHECK ("revenueTreatment" = 'DEFERRED_UNTIL_RELEASE'),
 "taxTreatment" text NOT NULL CHECK ("taxTreatment" = 'NO_TAX'), CHECK (length(trim("policyVersion")) > 0)
);
CREATE TRIGGER firm_posting_policy_immutable BEFORE UPDATE OR DELETE ON "FirmPostingPolicy" FOR EACH ROW EXECUTE FUNCTION audit_chain_immutable();
CREATE TABLE "PracticePeriod" (
 id uuid PRIMARY KEY, "firmId" uuid NOT NULL REFERENCES "Firm"(id), "startsOn" date NOT NULL, "endsOn" date NOT NULL,
 closed boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 CHECK ("startsOn" <= "endsOn"), UNIQUE ("firmId", id)
);
CREATE TABLE "PracticeJournal" (
 id uuid PRIMARY KEY, "firmId" uuid NOT NULL REFERENCES "Firm"(id), "periodId" uuid NOT NULL,
 "accountingDate" date NOT NULL, reference text NOT NULL, memo text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED')), version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 "createdBy" uuid NOT NULL REFERENCES "User"(id), "postedBy" uuid REFERENCES "User"(id), "postedAt" timestamp(3),
 "reversalOf" uuid UNIQUE REFERENCES "PracticeJournal"(id), UNIQUE ("firmId", reference), UNIQUE ("firmId", id),
 FOREIGN KEY ("firmId", "periodId") REFERENCES "PracticePeriod"("firmId", id),
 CHECK (length(trim(reference)) > 0 AND length(trim(memo)) > 0),
 CHECK ((status = 'DRAFT' AND "postedBy" IS NULL AND "postedAt" IS NULL) OR (status = 'POSTED' AND "postedBy" IS NOT NULL AND "postedAt" IS NOT NULL))
);
CREATE TABLE "PracticeJournalLine" (
 id uuid PRIMARY KEY, "firmId" uuid NOT NULL, "journalId" uuid NOT NULL, "accountId" uuid NOT NULL, position integer NOT NULL CHECK (position >= 0),
 debit numeric(28,6) NOT NULL, credit numeric(28,6) NOT NULL,
 FOREIGN KEY ("firmId", "journalId") REFERENCES "PracticeJournal"("firmId", id) ON DELETE RESTRICT,
 FOREIGN KEY ("firmId", "accountId") REFERENCES "PracticeAccount"("firmId", id), UNIQUE ("journalId", position),
 CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE FUNCTION practice_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM "Firm" WHERE id = NEW."firmId" FOR UPDATE;
  IF TG_OP = 'UPDATE' AND (OLD.closed OR NEW."firmId" <> OLD."firmId" OR NEW.id <> OLD.id OR NEW."startsOn" <> OLD."startsOn" OR NEW."endsOn" <> OLD."endsOn") THEN
    RAISE EXCEPTION 'Period identity and closed periods are immutable';
  END IF;
  IF EXISTS (SELECT 1 FROM "PracticePeriod" WHERE "firmId" = NEW."firmId" AND id <> NEW.id AND "startsOn" <= NEW."endsOn" AND "endsOn" >= NEW."startsOn") THEN
    RAISE EXCEPTION 'Accounting periods must not overlap';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER practice_period_guard BEFORE INSERT OR UPDATE ON "PracticePeriod" FOR EACH ROW EXECUTE FUNCTION practice_period_guard();
CREATE FUNCTION practice_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_status text; parent uuid;
BEGIN
  parent := CASE WHEN TG_OP = 'DELETE' THEN OLD."journalId" ELSE NEW."journalId" END;
  IF TG_OP = 'UPDATE' AND (NEW."journalId" <> OLD."journalId" OR NEW."firmId" <> OLD."firmId") THEN RAISE EXCEPTION 'Journal line scope is immutable'; END IF;
  SELECT status INTO journal_status FROM "PracticeJournal" WHERE id = parent FOR UPDATE;
  IF journal_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Posted practice lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER practice_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "PracticeJournalLine" FOR EACH ROW EXECUTE FUNCTION practice_line_guard();
CREATE FUNCTION practice_journal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period public."PracticePeriod"; line_count bigint; debits numeric; credits numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Practice journals are never deleted'; END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'Journals must begin as drafts'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'POSTED' THEN RAISE EXCEPTION 'Posted practice journals are immutable; reverse them'; END IF;
    IF NEW."firmId" <> OLD."firmId" OR NEW.id <> OLD.id OR NEW."periodId" <> OLD."periodId" OR NEW."reversalOf" IS DISTINCT FROM OLD."reversalOf" THEN RAISE EXCEPTION 'Journal scope is immutable'; END IF;
    IF NEW.status = 'POSTED' THEN
      IF NOT EXISTS (SELECT 1 FROM "FirmPostingPolicy" WHERE "firmId" = NEW."firmId") THEN RAISE EXCEPTION 'Approved firm posting policy is required'; END IF;
      SELECT * INTO period FROM "PracticePeriod" WHERE id = NEW."periodId" FOR UPDATE;
      IF period.closed OR NEW."accountingDate" < period."startsOn" OR NEW."accountingDate" > period."endsOn" THEN RAISE EXCEPTION 'Posting date must belong to an open accounting period'; END IF;
      PERFORM id FROM "PracticeAccount" WHERE id IN (SELECT "accountId" FROM "PracticeJournalLine" WHERE "journalId" = NEW.id) FOR SHARE;
      IF EXISTS (SELECT 1 FROM "PracticeAccount" a JOIN "PracticeJournalLine" l ON l."accountId" = a.id WHERE l."journalId" = NEW.id AND (NOT a.active OR NOT a.posting)) THEN RAISE EXCEPTION 'Inactive or nonposting accounts cannot post'; END IF;
      SELECT count(*), coalesce(sum(debit),0), coalesce(sum(credit),0) INTO line_count, debits, credits FROM "PracticeJournalLine" WHERE "journalId" = NEW.id;
      IF line_count < 2 OR debits = 0 OR debits <> credits THEN RAISE EXCEPTION 'Practice journal must contain balanced nonzero double-entry lines'; END IF;
      IF NEW."reversalOf" IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM "PracticeJournal" WHERE id = NEW."reversalOf" AND "firmId" = NEW."firmId" AND status = 'POSTED') THEN RAISE EXCEPTION 'Reversal requires a posted journal in the same firm'; END IF;
        IF EXISTS ((SELECT "accountId", position, debit, credit FROM "PracticeJournalLine" WHERE "journalId" = NEW.id) EXCEPT (SELECT "accountId", position, credit, debit FROM "PracticeJournalLine" WHERE "journalId" = NEW."reversalOf"))
          OR EXISTS ((SELECT "accountId", position, credit, debit FROM "PracticeJournalLine" WHERE "journalId" = NEW."reversalOf") EXCEPT (SELECT "accountId", position, debit, credit FROM "PracticeJournalLine" WHERE "journalId" = NEW.id)) THEN RAISE EXCEPTION 'Reversal lines must exactly invert the original'; END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER practice_journal_guard BEFORE INSERT OR UPDATE OR DELETE ON "PracticeJournal" FOR EACH ROW EXECUTE FUNCTION practice_journal_guard();
