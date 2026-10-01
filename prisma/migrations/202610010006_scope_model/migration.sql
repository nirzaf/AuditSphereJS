-- WP04 / MIG-002: canonical firm/client/engagement scope.
--
-- The source's ownership discipline is a compound (firm, client, engagement) key. Before
-- this migration the destination had a bare scalar Engagement.clientId with no Firm or
-- Client table, so a caller that knew an id could attach data to any engagement. This
-- migration adds the scope model and lets PostgreSQL, not application code, reject
-- cross-firm relationships.

-- CreateTable
CREATE TABLE "Firm" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_firmId_id_key" ON "Client"("firmId", "id");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bootstrap scope for rows that predate the scope model.
--
-- The current database contains development validation rows only (see
-- docs/IMPLEMENTATION-STATUS.md). The bootstrap firm/client below is deliberately named so
-- it cannot be mistaken for a business record, and it is created only when pre-scope rows
-- exist. A production migration must instead load a reviewed identity map (MIG-016) and
-- must not use this backfill.
INSERT INTO "Firm" ("id", "name")
SELECT '00000000-0000-4000-8000-0000000000f1'::uuid, 'Scope bootstrap firm'
WHERE EXISTS (SELECT 1 FROM "Engagement");

INSERT INTO "Client" ("id", "firmId", "name")
SELECT DISTINCT e."clientId", '00000000-0000-4000-8000-0000000000f1'::uuid, 'Scope bootstrap client'
FROM "Engagement" e
WHERE NOT EXISTS (SELECT 1 FROM "Client" c WHERE c."id" = e."clientId");

-- AlterTable: Engagement gains its firm scope and its composite client reference.
ALTER TABLE "Engagement" ADD COLUMN "firmId" UUID;
UPDATE "Engagement" SET "firmId" = '00000000-0000-4000-8000-0000000000f1'::uuid WHERE "firmId" IS NULL;
ALTER TABLE "Engagement" ALTER COLUMN "firmId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_firmId_clientId_id_key" ON "Engagement"("firmId", "clientId", "id");

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_firmId_clientId_fkey" FOREIGN KEY ("firmId", "clientId") REFERENCES "Client"("firmId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: staged imports carry the scope so a foreign engagement id cannot attach data.
ALTER TABLE "TbImport" ADD COLUMN "firmId" UUID;
ALTER TABLE "TbImport" ADD COLUMN "clientId" UUID;
UPDATE "TbImport" i SET "firmId" = e."firmId", "clientId" = e."clientId" FROM "Engagement" e WHERE e."id" = i."engagementId";
ALTER TABLE "TbImport" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "TbImport" ALTER COLUMN "clientId" SET NOT NULL;

-- Replace the single-column engagement reference with the compound scope reference.
ALTER TABLE "TbImport" DROP CONSTRAINT "TbImport_engagementId_fkey";
ALTER TABLE "TbImport" ADD CONSTRAINT "TbImport_firmId_clientId_engagementId_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId") REFERENCES "Engagement"("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "TbImport_firmId_clientId_engagementId_idx" ON "TbImport"("firmId", "clientId", "engagementId");
