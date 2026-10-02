-- A repository binding is owned by one exact client in one firm. Do not allow
-- a mismatched firmId/clientId pair to route evidence to another tenant's drive.
ALTER TABLE "ClientRepository"
  ADD CONSTRAINT "ClientRepository_firmId_clientId_fkey"
  FOREIGN KEY ("firmId", "clientId")
  REFERENCES "Client"("firmId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
