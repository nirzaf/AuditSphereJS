-- WP-P6-02 lineage: a published version records the exact mapping approval it bound.
--
-- Without this, a later mapping approval against a different taxonomy version would leave the
-- publication's taxonomy lineage ambiguous.
ALTER TABLE "BalancePublication" ADD COLUMN "mappingApprovalId" UUID;
ALTER TABLE "BalancePublication" ADD CONSTRAINT "BalancePublication_mappingApprovalId_fkey" FOREIGN KEY ("mappingApprovalId") REFERENCES "MappingApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
