ALTER TABLE "User" ADD COLUMN "tenantId" uuid, ADD COLUMN "entraObjectId" uuid;
ALTER TABLE "User" ADD CONSTRAINT "User_entra_pair" CHECK (("tenantId" IS NULL) = ("entraObjectId" IS NULL));
CREATE UNIQUE INDEX "User_tenantId_entraObjectId_key" ON "User"("tenantId", "entraObjectId");
