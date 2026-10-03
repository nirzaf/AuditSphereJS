-- T069: bind an issued invoice to the exact accepted contract, preserve immutable lines,
-- serialize firm numbering, prevent duplicate active milestones and permit only reasoned
-- cancellation of unpaid invoices. Paid invoices require a future credit-note workflow.

ALTER TABLE "CommercialProposal"
  ADD CONSTRAINT commercial_proposal_scope_id_uq UNIQUE ("firmId", "clientId", "engagementId", "id");

ALTER TABLE "EngagementInvoice"
  ADD COLUMN "proposalId" uuid,
  ADD COLUMN "proposalRevision" integer,
  ADD COLUMN "contractFee" numeric(20,2),
  ADD COLUMN "revision" integer NOT NULL DEFAULT 1,
  ADD COLUMN "dueOn" date;

UPDATE "EngagementInvoice" AS invoice
SET "proposalId" = letter."proposalId",
    "proposalRevision" = proposal."revision",
    "contractFee" = proposal."totalAmount"
FROM "EngagementLetterRecord" AS letter
JOIN "CommercialProposal" AS proposal ON proposal.id = letter."proposalId"
WHERE letter."engagementId" = invoice."engagementId"
  AND proposal."firmId" = invoice."firmId"
  AND proposal."clientId" = invoice."clientId"
  AND proposal."engagementId" = invoice."engagementId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "EngagementInvoice" WHERE "proposalId" IS NULL OR "proposalRevision" IS NULL OR "contractFee" IS NULL) THEN
    RAISE EXCEPTION 'T069 invoice migration stopped: an existing invoice has no matching issued engagement letter and accepted proposal snapshot';
  END IF;
END;
$$;

ALTER TABLE "EngagementInvoice"
  ALTER COLUMN "proposalId" SET NOT NULL,
  ALTER COLUMN "proposalRevision" SET NOT NULL,
  ALTER COLUMN "contractFee" SET NOT NULL,
  ADD CONSTRAINT engagement_invoice_positive_snapshot_check CHECK ("proposalRevision" > 0 AND "revision" > 0 AND "contractFee" > 0 AND "amount" <= "contractFee"),
  ADD CONSTRAINT engagement_invoice_proposal_id_fkey FOREIGN KEY ("proposalId")
    REFERENCES "CommercialProposal" (id) ON DELETE RESTRICT,
  ADD CONSTRAINT engagement_invoice_proposal_scope_fkey FOREIGN KEY ("firmId", "clientId", "engagementId", "proposalId")
    REFERENCES "CommercialProposal" ("firmId", "clientId", "engagementId", "id") ON DELETE RESTRICT;

ALTER TABLE "EngagementInvoice" DROP CONSTRAINT IF EXISTS "EngagementInvoice_status_check";
ALTER TABLE "EngagementInvoice" ADD CONSTRAINT engagement_invoice_status_check CHECK ("status" IN ('ISSUED', 'PAID', 'VOID'));
ALTER TABLE "EngagementInvoice" ADD CONSTRAINT engagement_invoice_scope_id_uq UNIQUE ("id", "firmId", "engagementId");
ALTER TABLE "EngagementInvoice" ADD CONSTRAINT engagement_invoice_revision_uq UNIQUE ("firmId", "engagementId", "proposalId", "kind", "revision");
CREATE UNIQUE INDEX engagement_invoice_active_milestone_uq
  ON "EngagementInvoice" ("firmId", "engagementId", "proposalId", "kind")
  WHERE "status" <> 'VOID';

CREATE TABLE "InvoiceNumberSequence" (
  "firmId" uuid PRIMARY KEY REFERENCES "Firm"(id) ON DELETE RESTRICT,
  "nextNumber" integer NOT NULL DEFAULT 1 CHECK ("nextNumber" >= 1),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
INSERT INTO "InvoiceNumberSequence" ("firmId", "nextNumber")
SELECT "firmId", MAX("number") + 1 FROM "EngagementInvoice" GROUP BY "firmId";

CREATE TABLE "EngagementInvoiceLine" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceId" uuid NOT NULL REFERENCES "EngagementInvoice"(id) ON DELETE RESTRICT,
  "position" integer NOT NULL CHECK ("position" > 0),
  "description" text NOT NULL CHECK (length(btrim("description")) BETWEEN 1 AND 500),
  "amount" numeric(20,2) NOT NULL CHECK ("amount" > 0),
  UNIQUE ("invoiceId", "position")
);
INSERT INTO "EngagementInvoiceLine" ("invoiceId", "position", "description", "amount")
SELECT invoice.id, 1, proposal.service, invoice.amount
FROM "EngagementInvoice" AS invoice
JOIN "CommercialProposal" AS proposal ON proposal.id = invoice."proposalId";

ALTER TABLE "InvoicePayment" DROP CONSTRAINT IF EXISTS "InvoicePayment_invoiceId_fkey";
ALTER TABLE "InvoicePayment" ADD CONSTRAINT invoice_payment_scope_fkey
  FOREIGN KEY ("invoiceId", "firmId", "engagementId")
  REFERENCES "EngagementInvoice" ("id", "firmId", "engagementId") ON DELETE RESTRICT;

ALTER TABLE "InvoiceReceipt" ADD COLUMN "firmId" uuid;
UPDATE "InvoiceReceipt" AS receipt SET "firmId" = invoice."firmId"
FROM "EngagementInvoice" AS invoice WHERE invoice.id = receipt."invoiceId";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InvoiceReceipt" WHERE "firmId" IS NULL) THEN
    RAISE EXCEPTION 'T069 invoice migration stopped: an existing receipt has no parent invoice';
  END IF;
END;
$$;
ALTER TABLE "InvoiceReceipt" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "InvoiceReceipt" DROP CONSTRAINT IF EXISTS "InvoiceReceipt_invoiceId_fkey";
ALTER TABLE "InvoiceReceipt" ADD CONSTRAINT invoice_receipt_scope_fkey
  FOREIGN KEY ("invoiceId", "firmId", "engagementId")
  REFERENCES "EngagementInvoice" ("id", "firmId", "engagementId") ON DELETE RESTRICT;
ALTER TABLE "InvoiceReceipt" ADD CONSTRAINT invoice_receipt_scope_key UNIQUE ("invoiceId", "firmId", "engagementId");

CREATE TABLE "InvoiceVoid" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceId" uuid NOT NULL UNIQUE,
  "firmId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "reason" text NOT NULL CHECK (length(btrim("reason")) BETWEEN 10 AND 1000),
  "voidedBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "voidedAt" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("invoiceId", "firmId", "engagementId")
    REFERENCES "EngagementInvoice" ("id", "firmId", "engagementId") ON DELETE RESTRICT,
  UNIQUE ("invoiceId", "firmId", "engagementId")
);

CREATE TRIGGER invoice_line_immutable BEFORE UPDATE OR DELETE ON "EngagementInvoiceLine"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_mutation();
CREATE TRIGGER invoice_void_immutable BEFORE UPDATE OR DELETE ON "InvoiceVoid"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_mutation();

CREATE FUNCTION guard_invoice_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  proposal_record "CommercialProposal"%ROWTYPE;
  letter_proposal uuid;
  fee_cents bigint;
  half_cents bigint;
  expected_amount numeric(20,2);
  latest_revision integer;
BEGIN
  PERFORM id FROM "Engagement" WHERE id = NEW."engagementId" AND "firmId" = NEW."firmId" AND "clientId" = NEW."clientId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice engagement scope does not exist'; END IF;

  SELECT * INTO proposal_record FROM "CommercialProposal"
  WHERE id = NEW."proposalId" AND "firmId" = NEW."firmId" AND "clientId" = NEW."clientId" AND "engagementId" = NEW."engagementId";
  IF NOT FOUND OR proposal_record."status" <> 'ACCEPTED' OR proposal_record."revision" <> NEW."proposalRevision"
    OR proposal_record."totalAmount" <> NEW."contractFee" OR proposal_record.currency <> NEW.currency THEN
    RAISE EXCEPTION 'Invoice must snapshot the exact accepted proposal revision and fee';
  END IF;
  SELECT "proposalId" INTO letter_proposal FROM "EngagementLetterRecord"
  WHERE "firmId" = NEW."firmId" AND "clientId" = NEW."clientId" AND "engagementId" = NEW."engagementId";
  IF letter_proposal IS DISTINCT FROM NEW."proposalId" THEN RAISE EXCEPTION 'Invoice requires the issued letter for its accepted proposal'; END IF;
  IF NEW."dueOn" IS NULL THEN RAISE EXCEPTION 'Invoice due date is required'; END IF;

  fee_cents := round(NEW."contractFee" * 100)::bigint;
  half_cents := fee_cents / 2;
  IF fee_cents % 2 = 1 AND half_cents % 2 = 1 THEN half_cents := half_cents + 1; END IF;
  expected_amount := CASE WHEN NEW."kind" = 'ADVANCE_50' THEN half_cents::numeric / 100
                          ELSE NEW."contractFee" - (half_cents::numeric / 100) END;
  IF NEW."kind" NOT IN ('ADVANCE_50', 'FINAL_50') OR NEW."amount" <> expected_amount
    OR NEW."status" <> 'ISSUED' OR NEW."revision" < 1 THEN
    RAISE EXCEPTION 'Invoice milestone amount or initial state does not match the approved contract';
  END IF;

  SELECT COALESCE(MAX("revision"), 0) + 1 INTO latest_revision
  FROM "EngagementInvoice" WHERE "firmId" = NEW."firmId" AND "engagementId" = NEW."engagementId"
    AND "proposalId" = NEW."proposalId" AND "kind" = NEW."kind";
  IF NEW."revision" <> latest_revision THEN RAISE EXCEPTION 'Invoice milestone revision is stale'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_insert_guard BEFORE INSERT ON "EngagementInvoice"
FOR EACH ROW EXECUTE FUNCTION guard_invoice_insert();

CREATE FUNCTION guard_invoice_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  paid_total numeric(20,2);
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued commercial records are immutable'; END IF;
  IF ROW(NEW."firmId", NEW."clientId", NEW."engagementId", NEW."proposalId", NEW."proposalRevision", NEW."contractFee", NEW."revision", NEW."number", NEW."kind", NEW."amount", NEW."currency", NEW."dueOn", NEW."issuedBy", NEW."issuedAt")
     IS DISTINCT FROM
     ROW(OLD."firmId", OLD."clientId", OLD."engagementId", OLD."proposalId", OLD."proposalRevision", OLD."contractFee", OLD."revision", OLD."number", OLD."kind", OLD."amount", OLD."currency", OLD."dueOn", OLD."issuedBy", OLD."issuedAt") THEN
    RAISE EXCEPTION 'Issued invoice terms and lines cannot be edited; use a controlled correction';
  END IF;
  IF OLD."status" = 'ISSUED' AND NEW."status" = 'PAID' THEN
    SELECT COALESCE(SUM("amount"), 0) INTO paid_total FROM "InvoicePayment" WHERE "invoiceId" = OLD.id;
    IF paid_total < OLD."amount" THEN RAISE EXCEPTION 'Invoice cannot be marked paid before full settlement'; END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" = 'ISSUED' AND NEW."status" = 'VOID' THEN
    IF EXISTS (SELECT 1 FROM "InvoicePayment" WHERE "invoiceId" = OLD.id)
      OR NOT EXISTS (SELECT 1 FROM "InvoiceVoid" WHERE "invoiceId" = OLD.id AND "firmId" = OLD."firmId" AND "engagementId" = OLD."engagementId") THEN
      RAISE EXCEPTION 'Only an unpaid invoice with a recorded reason can be voided';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invoice status transition is not permitted';
END;
$$;
DROP TRIGGER IF EXISTS invoice_immutable ON "EngagementInvoice";
CREATE TRIGGER invoice_immutable BEFORE UPDATE OR DELETE ON "EngagementInvoice"
FOR EACH ROW EXECUTE FUNCTION guard_invoice_update();

CREATE FUNCTION guard_invoice_payment_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  invoice_status text;
  invoice_amount numeric(20,2);
  paid_total numeric(20,2);
BEGIN
  SELECT "status", "amount" INTO invoice_status, invoice_amount FROM "EngagementInvoice"
  WHERE id = NEW."invoiceId" AND "firmId" = NEW."firmId" AND "engagementId" = NEW."engagementId" FOR UPDATE;
  IF NOT FOUND OR invoice_status <> 'ISSUED' THEN RAISE EXCEPTION 'Payment requires an issued invoice in the same scope'; END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO paid_total FROM "InvoicePayment" WHERE "invoiceId" = NEW."invoiceId";
  IF paid_total + NEW."amount" > invoice_amount THEN RAISE EXCEPTION 'Payment exceeds outstanding invoice balance'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_payment_insert_guard BEFORE INSERT ON "InvoicePayment"
FOR EACH ROW EXECUTE FUNCTION guard_invoice_payment_insert();

CREATE FUNCTION guard_invoice_receipt_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE invoice_status text;
BEGIN
  SELECT "status" INTO invoice_status FROM "EngagementInvoice"
  WHERE id = NEW."invoiceId" AND "firmId" = NEW."firmId" AND "engagementId" = NEW."engagementId" FOR UPDATE;
  IF NOT FOUND OR invoice_status <> 'PAID' THEN RAISE EXCEPTION 'Official receipt requires a settled invoice in the same scope'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_receipt_insert_guard BEFORE INSERT ON "InvoiceReceipt"
FOR EACH ROW EXECUTE FUNCTION guard_invoice_receipt_insert();

CREATE FUNCTION guard_invoice_void_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE invoice_status text;
BEGIN
  SELECT "status" INTO invoice_status FROM "EngagementInvoice"
  WHERE id = NEW."invoiceId" AND "firmId" = NEW."firmId" AND "engagementId" = NEW."engagementId" FOR UPDATE;
  IF NOT FOUND OR invoice_status <> 'ISSUED' OR EXISTS (SELECT 1 FROM "InvoicePayment" WHERE "invoiceId" = NEW."invoiceId") THEN
    RAISE EXCEPTION 'Only an unpaid issued invoice may be voided';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_void_insert_guard BEFORE INSERT ON "InvoiceVoid"
FOR EACH ROW EXECUTE FUNCTION guard_invoice_void_insert();

REVOKE ALL ON FUNCTION guard_invoice_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_invoice_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_invoice_payment_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_invoice_receipt_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_invoice_void_insert() FROM PUBLIC;
