-- T069: every newly issued invoice is committed with one posted deferred-fee
-- recognition journal. Existing invoices must be reconciled by an explicit,
-- approved backfill before this migration can be applied to a populated system.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "EngagementInvoice") THEN
    RAISE EXCEPTION 'T069 invoice ledger migration requires an approved journal backfill for existing invoices';
  END IF;
END;
$$;

CREATE TABLE "InvoiceLedgerPosting" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "invoiceId" uuid NOT NULL,
  "journalId" uuid NOT NULL,
  "createdBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_ledger_posting_invoice_scope_fkey
    FOREIGN KEY ("invoiceId", "firmId", "engagementId") REFERENCES "EngagementInvoice"(id, "firmId", "engagementId") ON DELETE RESTRICT,
  CONSTRAINT invoice_ledger_posting_journal_scope_fkey
    FOREIGN KEY ("firmId", "journalId") REFERENCES "PracticeJournal"("firmId", id) ON DELETE RESTRICT,
  CONSTRAINT invoice_ledger_posting_invoice_key UNIQUE ("invoiceId", "firmId", "engagementId"),
  CONSTRAINT invoice_ledger_posting_journal_key UNIQUE ("firmId", "journalId")
);

CREATE FUNCTION guard_invoice_ledger_posting() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  invoice_record public."EngagementInvoice"%ROWTYPE;
  journal_record public."PracticeJournal"%ROWTYPE;
  line_count bigint;
  receivable_lines bigint;
  deferred_fee_lines bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Invoice ledger posting links are immutable';
  END IF;

  SELECT * INTO invoice_record FROM public."EngagementInvoice"
  WHERE id = NEW."invoiceId" AND "firmId" = NEW."firmId" FOR UPDATE;
  IF NOT FOUND OR invoice_record.status <> 'ISSUED' THEN
    RAISE EXCEPTION 'A ledger posting requires an issued invoice in the same firm';
  END IF;

  SELECT * INTO journal_record FROM public."PracticeJournal"
  WHERE id = NEW."journalId" AND "firmId" = NEW."firmId" FOR UPDATE;
  IF NOT FOUND OR journal_record.status <> 'POSTED' OR journal_record."reversalOf" IS NOT NULL THEN
    RAISE EXCEPTION 'An invoice ledger posting requires its original posted journal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."FirmPostingPolicy"
    WHERE "firmId" = NEW."firmId"
      AND "revenueTreatment" = 'DEFERRED_UNTIL_RELEASE'
      AND "taxTreatment" = 'NO_TAX'
  ) THEN
    RAISE EXCEPTION 'Approved deferred-fee, no-tax posting policy is required';
  END IF;

  SELECT count(*),
    count(*) FILTER (WHERE account.code = '120' AND account.kind = 'ASSET'
      AND line.debit = invoice_record.amount AND line.credit = 0),
    count(*) FILTER (WHERE account.code = '200' AND account.kind = 'LIABILITY'
      AND line.debit = 0 AND line.credit = invoice_record.amount)
  INTO line_count, receivable_lines, deferred_fee_lines
  FROM public."PracticeJournalLine" AS line
  JOIN public."PracticeAccount" AS account
    ON account."firmId" = line."firmId" AND account.id = line."accountId"
  WHERE line."firmId" = NEW."firmId" AND line."journalId" = NEW."journalId";

  IF line_count <> 2 OR receivable_lines <> 1 OR deferred_fee_lines <> 1 THEN
    RAISE EXCEPTION 'Invoice journal must debit account 120 receivables and credit account 200 deferred engagement fees for the exact invoice amount';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_ledger_posting_insert_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceLedgerPosting"
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_ledger_posting();

CREATE FUNCTION require_invoice_ledger_posting() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."InvoiceLedgerPosting" WHERE "invoiceId" = NEW.id AND "firmId" = NEW."firmId") THEN
    RAISE EXCEPTION 'Invoice and its posted ledger recognition journal must commit together';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER engagement_invoice_requires_ledger_posting
  AFTER INSERT OR UPDATE ON "EngagementInvoice"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_invoice_ledger_posting();

CREATE FUNCTION guard_invoice_void_ledger_reversal() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.status = 'VOID' AND OLD.status = 'ISSUED' AND NOT EXISTS (
    SELECT 1
    FROM public."InvoiceLedgerPosting" AS posting
    JOIN public."PracticeJournal" AS reversal ON reversal."reversalOf" = posting."journalId"
    WHERE posting."invoiceId" = NEW.id AND posting."firmId" = NEW."firmId"
      AND reversal.status = 'POSTED' AND reversal."firmId" = NEW."firmId"
  ) THEN
    RAISE EXCEPTION 'A voided invoice requires an exact posted reversal of its ledger recognition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_void_ledger_reversal_guard
  BEFORE UPDATE OF status ON "EngagementInvoice"
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_void_ledger_reversal();

REVOKE ALL ON FUNCTION guard_invoice_ledger_posting() FROM PUBLIC;
REVOKE ALL ON FUNCTION require_invoice_ledger_posting() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_invoice_void_ledger_reversal() FROM PUBLIC;
