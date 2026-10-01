-- WP-MIG-009-02: approved-mapping memory.
--
-- A mapping approval now also remembers the approved code per client account, so a later import can
-- be offered a suggestion that names the approval it came from. Memory is derived only from approvals.

-- CreateTable
CREATE TABLE "MappingMemoryEntry" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "taxonomyLineCode" TEXT NOT NULL,
    "sourceApprovalId" UUID NOT NULL,
    "timesApplied" INTEGER NOT NULL DEFAULT 1,
    "lastApprovedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MappingMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MappingMemoryEntry_firmId_clientId_idx" ON "MappingMemoryEntry"("firmId", "clientId");
CREATE UNIQUE INDEX "MappingMemoryEntry_firmId_clientId_accountCode_key" ON "MappingMemoryEntry"("firmId", "clientId", "accountCode");

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "MappingMemoryEntry" ADD CONSTRAINT mapping_memory_text_check CHECK (
  length(trim("accountCode")) > 0 AND length(trim("accountName")) > 0 AND length(trim("taxonomyLineCode")) > 0);
ALTER TABLE "MappingMemoryEntry" ADD CONSTRAINT mapping_memory_count_check CHECK ("timesApplied" >= 1);
