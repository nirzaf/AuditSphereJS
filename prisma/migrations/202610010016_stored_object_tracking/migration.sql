-- WP-P1-01: track every stored object so a duplicate or interrupted upload leaves a record.
--
-- Concurrent identical uploads both stored bytes before the metadata transaction, so one failed on
-- the uniqueness rule and left untracked bytes behind. The object row is written before the bytes.

-- CreateTable
CREATE TABLE "StoredObject" (
    "id" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "reference" TEXT,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "documentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredObject_key_key" ON "StoredObject"("key");
CREATE INDEX "StoredObject_status_createdAt_idx" ON "StoredObject"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "StoredObject" ADD CONSTRAINT stored_object_status_check CHECK ("status" IN ('PENDING','REFERENCED','DUPLICATE','CLEANED'));
ALTER TABLE "StoredObject" ADD CONSTRAINT stored_object_sha256_check CHECK ("sha256" ~ '^[0-9a-f]{64}$');
-- A referenced object is exactly the one that has a document and a resolution time; the others never do.
ALTER TABLE "StoredObject" ADD CONSTRAINT stored_object_reference_check CHECK (
  ("status" = 'REFERENCED' AND "documentId" IS NOT NULL AND "resolvedAt" IS NOT NULL)
  OR ("status" <> 'REFERENCED' AND "documentId" IS NULL));
