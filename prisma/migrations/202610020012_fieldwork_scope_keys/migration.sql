-- Fieldwork owns these tables. Add keys consumed by same-owner and Governance composite
-- references, and make each taxonomy version's firm a real ownership relationship.

CREATE UNIQUE INDEX "BalancePublication_firmId_clientId_engagementId_id_key"
  ON "BalancePublication" ("firmId", "clientId", "engagementId", "id");

CREATE UNIQUE INDEX "TaxonomyVersion_firmId_id_key"
  ON "TaxonomyVersion" ("firmId", "id");

ALTER TABLE "TaxonomyVersion"
  ADD CONSTRAINT "TaxonomyVersion_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
