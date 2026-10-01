-- WP09: publish accepted, immutable accounting versions.
--
-- Finalizing a staging import locks the staging rows but is not an accepted dataset. This
-- migration adds the publication boundary downstream consumers must bind to. A publication is
-- bound to exactly one finalized import version and can never be rewritten.

-- Extend the capability vocabulary enforced by the grant check.
ALTER TABLE "RoleGrant" DROP CONSTRAINT role_grant_capability_check;
ALTER TABLE "RoleGrant" ADD CONSTRAINT role_grant_capability_check CHECK (
  "capability" IN ('ENGAGEMENT_READ','FIELDWORK_WRITE','FIELDWORK_FINALIZE','TB_PUBLISH','LIFECYCLE_COMMAND'));

-- CreateTable
CREATE TABLE "BalancePublication" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "publishedBy" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalancePublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedBalanceRow" (
    "id" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fsli" TEXT NOT NULL,
    "current" DECIMAL(28,6) NOT NULL,
    "prior" DECIMAL(28,6) NOT NULL,

    CONSTRAINT "PublishedBalanceRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalancePublication_importId_key" ON "BalancePublication"("importId");

-- CreateIndex
CREATE INDEX "BalancePublication_engagementId_publishedAt_idx" ON "BalancePublication"("engagementId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BalancePublication_engagementId_sequence_key" ON "BalancePublication"("engagementId", "sequence");

-- CreateIndex
CREATE INDEX "PublishedBalanceRow_publicationId_position_idx" ON "PublishedBalanceRow"("publicationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedBalanceRow_publicationId_code_key" ON "PublishedBalanceRow"("publicationId", "code");

-- AddForeignKey
ALTER TABLE "BalancePublication" ADD CONSTRAINT "BalancePublication_firmId_clientId_engagementId_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedBalanceRow" ADD CONSTRAINT "PublishedBalanceRow_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "BalancePublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (not modeled by Prisma).
ALTER TABLE "BalancePublication" ADD CONSTRAINT balance_publication_digest_check CHECK ("digest" ~ '^[0-9a-f]{64}$');
ALTER TABLE "BalancePublication" ADD CONSTRAINT balance_publication_sequence_check CHECK ("sequence" >= 1);
ALTER TABLE "BalancePublication" ADD CONSTRAINT balance_publication_row_count_check CHECK ("rowCount" >= 1);
ALTER TABLE "PublishedBalanceRow" ADD CONSTRAINT published_balance_fsli_check CHECK (length(trim("fsli")) > 0);

CREATE FUNCTION prevent_publication_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published accounting versions are immutable'; END;
$$;
CREATE TRIGGER balance_publication_immutable BEFORE UPDATE OR DELETE ON "BalancePublication"
FOR EACH ROW EXECUTE FUNCTION prevent_publication_mutation();
CREATE TRIGGER published_balance_row_immutable BEFORE UPDATE OR DELETE ON "PublishedBalanceRow"
FOR EACH ROW EXECUTE FUNCTION prevent_publication_mutation();
