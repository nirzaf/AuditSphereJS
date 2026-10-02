-- Make membership ownership explicit and let PostgreSQL reject a mismatched
-- firm/client/engagement tuple instead of relying on a bare globally unique UUID.
ALTER TABLE "Membership" ADD COLUMN "firmId" UUID;
ALTER TABLE "Membership" ADD COLUMN "clientId" UUID;

UPDATE "Membership" m
SET "firmId" = e."firmId", "clientId" = e."clientId"
FROM "Engagement" e
WHERE e."id" = m."engagementId";

ALTER TABLE "Membership" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "Membership" ALTER COLUMN "clientId" SET NOT NULL;

ALTER TABLE "Membership" DROP CONSTRAINT "Membership_engagementId_fkey";
ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_firmId_clientId_engagementId_fkey"
  FOREIGN KEY ("firmId", "clientId", "engagementId")
  REFERENCES "Engagement"("firmId", "clientId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Membership_firmId_clientId_engagementId_idx"
  ON "Membership"("firmId", "clientId", "engagementId");
