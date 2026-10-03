-- Real commercial onboarding spine (C05/C06/C07 + T069 foundation): versioned proposals, the
-- dual-key gate records, the immutable engagement letter, and canonical engagement invoices.
-- The capability register gains COMMERCIAL_MANAGE for commercial lifecycle decisions.
ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK ("capability" IN (
  'ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','MAPPING_APPROVE',
  'TAXONOMY_MANAGE','MATERIALITY_MANAGE','MATERIALITY_APPROVE','RISK_MANAGE','RISK_PARTNER_CLEAR',
  'REVIEW_RAISE','REVIEW_RESOLVE','ADJUSTMENT_MANAGE','ADJUSTMENT_POST','LIFECYCLE_COMMAND',
  'COMMERCIAL_MANAGE','PRACTICE_READ','PRACTICE_MANAGE','PRACTICE_POST','PRACTICE_REOPEN_PERIOD'
));

CREATE TABLE "CommercialProposal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "service" text NOT NULL CHECK (length("service") BETWEEN 3 AND 200),
  "periodStart" date NOT NULL,
  "periodEnd" date NOT NULL,
  "totalAmount" numeric(20,2) NOT NULL CHECK ("totalAmount" > 0),
  "currency" text NOT NULL DEFAULT 'QAR',
  "status" text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PRESENTED','ACCEPTED','REJECTED')),
  "revision" integer NOT NULL DEFAULT 1 CHECK ("revision" >= 1),
  "presentedSnapshot" jsonb,
  "clientResponse" jsonb,
  "createdBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT
);
CREATE INDEX commercial_proposal_engagement_idx ON "CommercialProposal" ("engagementId", "createdAt");

-- Key 2: Partner risk clearance (ISA 220). Append-only; the latest row for an engagement wins.
CREATE TABLE "RiskClearance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "reason" text NOT NULL CHECK (length("reason") BETWEEN 10 AND 1000),
  "clearedBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "clearedAt" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT
);

-- The letter is a regulated artifact: issued once per gate clearance and never rewritten.
CREATE TABLE "EngagementLetterRecord" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL UNIQUE,
  "proposalId" uuid NOT NULL UNIQUE REFERENCES "CommercialProposal"(id) ON DELETE RESTRICT,
  "letterText" text NOT NULL,
  "issuedBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "issuedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("firmId", "clientId", "engagementId"),
  FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT
);

CREATE TABLE "EngagementInvoice" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "number" integer NOT NULL CHECK ("number" >= 1),
  "kind" text NOT NULL CHECK ("kind" IN ('ADVANCE_50','FINAL_50')),
  "amount" numeric(20,2) NOT NULL CHECK ("amount" > 0),
  "currency" text NOT NULL DEFAULT 'QAR',
  "status" text NOT NULL DEFAULT 'ISSUED' CHECK ("status" IN ('ISSUED','PAID')),
  "issuedBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "issuedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("firmId", "number"),
  FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT
);
CREATE INDEX engagement_invoice_engagement_idx ON "EngagementInvoice" ("engagementId", "issuedAt");

CREATE TABLE "InvoicePayment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" uuid NOT NULL,
  "invoiceId" uuid NOT NULL REFERENCES "EngagementInvoice"(id) ON DELETE RESTRICT,
  "engagementId" uuid NOT NULL,
  "amount" numeric(20,2) NOT NULL CHECK ("amount" > 0),
  "reference" text NOT NULL CHECK (length("reference") BETWEEN 3 AND 200),
  "recordedBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "recordedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "InvoiceReceipt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceId" uuid NOT NULL UNIQUE REFERENCES "EngagementInvoice"(id) ON DELETE RESTRICT,
  "engagementId" uuid NOT NULL,
  "issuedBy" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "issuedAt" timestamptz NOT NULL DEFAULT now()
);

-- Regulated artifacts are immutable at the database boundary.
CREATE FUNCTION prevent_commercial_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'Issued commercial records are immutable'; END;
$$;
CREATE TRIGGER engagement_letter_immutable BEFORE UPDATE OR DELETE ON "EngagementLetterRecord"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_mutation();
CREATE TRIGGER invoice_payment_immutable BEFORE UPDATE OR DELETE ON "InvoicePayment"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_mutation();
CREATE TRIGGER invoice_receipt_immutable BEFORE UPDATE OR DELETE ON "InvoiceReceipt"
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_mutation();
CREATE TRIGGER invoice_immutable AFTER UPDATE ON "EngagementInvoice"
FOR EACH ROW WHEN (OLD."status" = 'PAID' AND (NEW."status" <> 'PAID' OR NEW."amount" <> OLD."amount" OR NEW."kind" <> OLD."kind"))
EXECUTE FUNCTION prevent_commercial_mutation();
REVOKE ALL ON FUNCTION prevent_commercial_mutation() FROM PUBLIC;
