-- Scoped authorization rows must reference the same firm/client/engagement hierarchy
-- that is checked by authorization services. Nullable parent scopes are supported:
-- firm-level grants use only the firm FK, client-level grants also use the client FK,
-- and engagement-level grants use the full engagement FK.
ALTER TABLE "RoleGrant"
  ADD CONSTRAINT "RoleGrant_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoleGrant"
  ADD CONSTRAINT "RoleGrant_firmId_clientId_fkey"
  FOREIGN KEY ("firmId", "clientId") REFERENCES "Client"("firmId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoleGrant"
  ADD CONSTRAINT "RoleGrant_firmId_clientId_engagementId_fkey"
  FOREIGN KEY ("firmId", "clientId", "engagementId")
  REFERENCES "Engagement"("firmId", "clientId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
