-- Record every invoice payment with its canonical firm cash/receivables journal.
-- Historical payments need an approved accounting backfill; never invent ledger history.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InvoicePayment") THEN
    RAISE EXCEPTION 'Invoice payment ledger migration requires an approved journal backfill for existing payments';
  END IF;
END;
$$;

ALTER TABLE "InvoicePayment"
  ADD CONSTRAINT "InvoicePayment_id_firmId_engagementId_key"
  UNIQUE (id, "firmId", "engagementId");

CREATE TABLE "InvoicePaymentLedgerPosting" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "paymentId" uuid NOT NULL,
  "journalId" uuid NOT NULL,
  "createdBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payment_ledger_posting_payment_scope_fkey
    FOREIGN KEY ("paymentId", "firmId", "engagementId")
    REFERENCES "InvoicePayment"(id, "firmId", "engagementId") ON DELETE RESTRICT,
  CONSTRAINT invoice_payment_ledger_posting_journal_scope_fkey
    FOREIGN KEY ("firmId", "journalId")
    REFERENCES "PracticeJournal"("firmId", id) ON DELETE RESTRICT,
  CONSTRAINT "InvoicePaymentLedgerPosting_firmId_id_key" UNIQUE ("firmId", id),
  CONSTRAINT "InvoicePaymentLedgerPosting_paymentId_firmId_engagementId_key"
    UNIQUE ("paymentId", "firmId", "engagementId"),
  CONSTRAINT "InvoicePaymentLedgerPosting_firmId_journalId_key" UNIQUE ("firmId", "journalId")
);

CREATE INDEX "InvoicePaymentLedgerPosting_firmId_engagementId_createdAt_idx"
  ON "InvoicePaymentLedgerPosting"("firmId", "engagementId", "createdAt");

CREATE FUNCTION guard_invoice_payment_ledger_posting() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  payment_row public."InvoicePayment"%ROWTYPE;
  invoice_row public."EngagementInvoice"%ROWTYPE;
  journal_row public."PracticeJournal"%ROWTYPE;
  line_count bigint;
  cash_lines bigint;
  receivable_lines bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Invoice payment ledger posting links are immutable';
  END IF;

  SELECT * INTO payment_row FROM public."InvoicePayment"
  WHERE id = NEW."paymentId" AND "firmId" = NEW."firmId" AND "engagementId" = NEW."engagementId"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice payment ledger posting requires an in-scope payment';
  END IF;

  SELECT * INTO invoice_row FROM public."EngagementInvoice"
  WHERE id = payment_row."invoiceId" AND "firmId" = payment_row."firmId" AND "engagementId" = payment_row."engagementId"
  FOR UPDATE;
  IF NOT FOUND OR invoice_row.status NOT IN ('ISSUED', 'PAID') THEN
    RAISE EXCEPTION 'Invoice payment ledger posting requires an issued invoice';
  END IF;

  SELECT * INTO journal_row FROM public."PracticeJournal"
  WHERE id = NEW."journalId" AND "firmId" = NEW."firmId"
  FOR UPDATE;
  IF NOT FOUND OR journal_row.status <> 'POSTED' OR journal_row."reversalOf" IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice payment ledger posting requires an original posted journal';
  END IF;
  IF journal_row.reference <> ('PAY-' || payment_row.id::text) THEN
    RAISE EXCEPTION 'Invoice payment journal reference does not match the payment';
  END IF;
  IF journal_row."accountingDate" <> (payment_row."recordedAt" AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'Invoice payment journal date must match the UTC payment record date';
  END IF;

  SELECT count(*),
    count(*) FILTER (
      WHERE account.code = '100' AND account.kind = 'ASSET' AND account.active AND account.posting
        AND line.debit = payment_row.amount AND line.credit = 0
    ),
    count(*) FILTER (
      WHERE account.code = '120' AND account.kind = 'ASSET' AND account.active AND account.posting
        AND line.debit = 0 AND line.credit = payment_row.amount
    )
  INTO line_count, cash_lines, receivable_lines
  FROM public."PracticeJournalLine" AS line
  JOIN public."PracticeAccount" AS account
    ON account."firmId" = line."firmId" AND account.id = line."accountId"
  WHERE line."firmId" = NEW."firmId" AND line."journalId" = NEW."journalId";

  IF line_count <> 2 OR cash_lines <> 1 OR receivable_lines <> 1 THEN
    RAISE EXCEPTION 'Invoice payment journal must debit account 100 cash/bank and credit account 120 receivables for the exact payment amount';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_payment_ledger_posting_insert_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "InvoicePaymentLedgerPosting"
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_payment_ledger_posting();

CREATE FUNCTION require_invoice_payment_ledger_posting() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."InvoicePaymentLedgerPosting"
    WHERE "paymentId" = NEW.id AND "firmId" = NEW."firmId" AND "engagementId" = NEW."engagementId"
  ) THEN
    RAISE EXCEPTION 'Invoice payment must commit with one posted cash-receipt journal';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER invoice_payment_requires_ledger_posting
  AFTER INSERT ON "InvoicePayment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_invoice_payment_ledger_posting();

REVOKE ALL ON FUNCTION guard_invoice_payment_ledger_posting() FROM PUBLIC;
REVOKE ALL ON FUNCTION require_invoice_payment_ledger_posting() FROM PUBLIC;
