CREATE TABLE "FirmRepository" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "purpose" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "driveId" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMPTZ(6),
  CONSTRAINT "FirmRepository_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FirmRepository_firm_purpose_provider_key" UNIQUE ("firmId", "purpose", "provider"),
  CONSTRAINT "FirmRepository_firm_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FirmRepository_binding_check" CHECK (
    "purpose" = 'practice-private' AND "provider" = 'graph' AND length(trim("driveId")) > 0 AND length(trim("folderId")) > 0
  )
);
CREATE INDEX "FirmRepository_firm_purpose_retired_idx" ON "FirmRepository"("firmId", "purpose", "retiredAt");

CREATE TABLE "PracticeExpenseReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "expenseJournalId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "storageReference" TEXT NOT NULL,
  "driveId" TEXT,
  "itemId" TEXT,
  "versionId" TEXT NOT NULL,
  "eTag" TEXT,
  "sha256" CHAR(64) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "filename" VARCHAR(200) NOT NULL,
  "contentType" VARCHAR(100) NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeExpenseReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PracticeExpenseReceipt_firm_id_key" UNIQUE ("firmId", "id"),
  CONSTRAINT "PracticeExpenseReceipt_firm_expense_id_key" UNIQUE ("firmId", "expenseJournalId", "id"),
  CONSTRAINT "PracticeExpenseReceipt_storage_reference_key" UNIQUE ("storageReference"),
  CONSTRAINT "PracticeExpenseReceipt_expense_sequence_key" UNIQUE ("firmId", "expenseJournalId", "sequence"),
  CONSTRAINT "PracticeExpenseReceipt_provider_version_key" UNIQUE ("driveId", "itemId", "versionId"),
  CONSTRAINT "PracticeExpenseReceipt_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "PracticeExpenseReceipt_sha_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PracticeExpenseReceipt_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 15000000),
  CONSTRAINT "PracticeExpenseReceipt_file_type_check" CHECK ("contentType" IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT "PracticeExpenseReceipt_provider_check" CHECK (
    ("provider" = 'graph' AND "driveId" IS NOT NULL AND "itemId" IS NOT NULL AND "eTag" IS NOT NULL) OR
    ("provider" = 'local-s3' AND "driveId" IS NULL AND "itemId" IS NULL AND "eTag" IS NULL)
  ),
  CONSTRAINT "PracticeExpenseReceipt_firm_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpenseReceipt_expense_fkey" FOREIGN KEY ("firmId", "expenseJournalId") REFERENCES "PracticeExpense"("firmId", "journalId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpenseReceipt_creator_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PracticeExpenseReceipt_expense_idx" ON "PracticeExpenseReceipt"("firmId", "expenseJournalId", "sequence");

CREATE TABLE "PracticeExpenseReceiptUploadSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "expenseJournalId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "filename" VARCHAR(200) NOT NULL,
  "contentType" VARCHAR(100) NOT NULL,
  "storageKey" TEXT NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "storageReference" TEXT,
  "sha256" CHAR(64),
  "sizeBytes" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'INITIATED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "uploadedAt" TIMESTAMPTZ(6),
  "attachedAt" TIMESTAMPTZ(6),
  "cleanupStartedAt" TIMESTAMPTZ(6),
  "receiptId" UUID,
  CONSTRAINT "PracticeExpenseReceiptUploadSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_firm_id_key" UNIQUE ("firmId", "id"),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_storage_key_key" UNIQUE ("storageKey"),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_actor_idempotency_key" UNIQUE ("actorId", "idempotencyKey"),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_status_check" CHECK ("status" IN ('INITIATED', 'UPLOADING', 'STORED', 'ATTACHED', 'FAILED', 'CLEANING', 'CLEANED', 'REVIEW_REQUIRED')),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_type_check" CHECK ("contentType" IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_hash_check" CHECK ("sha256" IS NULL OR "sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_size_check" CHECK ("sizeBytes" IS NULL OR "sizeBytes" BETWEEN 1 AND 15000000),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_attached_check" CHECK (("status" = 'ATTACHED' AND "receiptId" IS NOT NULL AND "attachedAt" IS NOT NULL) OR ("status" <> 'ATTACHED' AND "receiptId" IS NULL AND "attachedAt" IS NULL)),
  CONSTRAINT "PracticeExpenseReceiptUploadSession_expense_fkey" FOREIGN KEY ("firmId", "expenseJournalId") REFERENCES "PracticeExpense"("firmId", "journalId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpenseReceiptUploadSession_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpenseReceiptUploadSession_receipt_fkey" FOREIGN KEY ("firmId", "expenseJournalId", "receiptId") REFERENCES "PracticeExpenseReceipt"("firmId", "expenseJournalId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeExpenseReceiptUploadSession_firm_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PracticeExpenseReceiptUploadSession_sweep_idx" ON "PracticeExpenseReceiptUploadSession"("status", "expiresAt", "createdAt");

CREATE FUNCTION guard_practice_expense_receipt_upload_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Practice expense receipt upload history is immutable'; END IF;
  IF NEW."firmId" IS DISTINCT FROM OLD."firmId" OR NEW."expenseJournalId" IS DISTINCT FROM OLD."expenseJournalId" OR
     NEW."actorId" IS DISTINCT FROM OLD."actorId" OR NEW."filename" IS DISTINCT FROM OLD."filename" OR
     NEW."contentType" IS DISTINCT FROM OLD."contentType" OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR
     NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN
    RAISE EXCEPTION 'Practice expense receipt upload scope is immutable';
  END IF;
  IF OLD."status" IN ('ATTACHED', 'CLEANED', 'REVIEW_REQUIRED') THEN
    RAISE EXCEPTION 'Practice expense receipt upload is terminal';
  END IF;
  IF NOT (
    NEW."status" = OLD."status" OR
    (OLD."status" = 'INITIATED' AND NEW."status" IN ('UPLOADING', 'FAILED', 'CLEANING', 'CLEANED')) OR
    (OLD."status" = 'UPLOADING' AND NEW."status" IN ('STORED', 'FAILED', 'CLEANING')) OR
    (OLD."status" = 'STORED' AND NEW."status" IN ('ATTACHED', 'CLEANING')) OR
    (OLD."status" = 'FAILED' AND NEW."status" IN ('CLEANING', 'CLEANED')) OR
    (OLD."status" = 'CLEANING' AND NEW."status" IN ('CLEANED', 'REVIEW_REQUIRED'))
  ) THEN RAISE EXCEPTION 'Invalid practice expense receipt upload transition: % -> %', OLD."status", NEW."status"; END IF;
  IF OLD."sha256" IS NOT NULL AND NEW."sha256" IS DISTINCT FROM OLD."sha256" THEN RAISE EXCEPTION 'Practice receipt upload digest is immutable once recorded'; END IF;
  IF OLD."sizeBytes" IS NOT NULL AND NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes" THEN RAISE EXCEPTION 'Practice receipt upload size is immutable once recorded'; END IF;
  IF OLD."storageReference" IS NOT NULL AND NEW."storageReference" IS DISTINCT FROM OLD."storageReference" THEN RAISE EXCEPTION 'Practice receipt provider reference is immutable once recorded'; END IF;
  IF NEW."status" IN ('STORED', 'ATTACHED') AND (NEW."storageReference" IS NULL OR NEW."sha256" IS NULL OR NEW."sizeBytes" IS NULL OR NEW."uploadedAt" IS NULL) THEN
    RAISE EXCEPTION 'Stored practice receipts require provider identity and verified byte metadata';
  END IF;
  IF NEW."status" = 'ATTACHED' AND NEW."attachedAt" IS NULL THEN RAISE EXCEPTION 'Attached practice receipts require an attachment time'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PracticeExpenseReceiptUploadSession_transition_guard"
  BEFORE UPDATE OR DELETE ON "PracticeExpenseReceiptUploadSession"
  FOR EACH ROW EXECUTE FUNCTION guard_practice_expense_receipt_upload_transition();

CREATE FUNCTION prevent_practice_expense_receipt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Practice expense receipt versions are immutable'; END $$;
CREATE TRIGGER "PracticeExpenseReceipt_immutable"
  BEFORE UPDATE OR DELETE ON "PracticeExpenseReceipt"
  FOR EACH ROW EXECUTE FUNCTION prevent_practice_expense_receipt_mutation();
