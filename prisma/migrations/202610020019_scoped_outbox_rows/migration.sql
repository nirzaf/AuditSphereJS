-- Outbox scope is authoritative database data, not a JSON payload or Redis message.
-- Upgrade legacy tb.import payloads from the owning TbImport row before requiring the scope.
ALTER TABLE "OutboxEvent"
  ADD COLUMN "firmId" uuid,
  ADD COLUMN "clientId" uuid,
  ADD COLUMN "engagementId" uuid,
  ADD COLUMN "importId" uuid;

UPDATE "OutboxEvent" AS event
SET "firmId" = batch."firmId",
    "clientId" = batch."clientId",
    "engagementId" = batch."engagementId",
    "importId" = batch.id
FROM "TbImport" AS batch
WHERE event.type = 'tb.import'
  AND event.payload->>'importId' = batch.id::text;

-- Other engagement events must carry the same explicit scope tuple in their payload while
-- being upgraded. Fail closed for malformed or unrecognized legacy rows.
UPDATE "OutboxEvent" AS event
SET "firmId" = (event.payload->>'firmId')::uuid,
    "clientId" = (event.payload->>'clientId')::uuid,
    "engagementId" = (event.payload->>'engagementId')::uuid
WHERE event.type <> 'tb.import';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "OutboxEvent" WHERE "firmId" IS NULL OR "clientId" IS NULL OR "engagementId" IS NULL) THEN
    RAISE EXCEPTION 'Every outbox event must resolve to a persisted engagement scope';
  END IF;
  IF EXISTS (SELECT 1 FROM "OutboxEvent" WHERE type = 'tb.import' AND "importId" IS NULL) THEN
    RAISE EXCEPTION 'Every tb.import outbox event must resolve to its persisted import';
  END IF;
END $$;

ALTER TABLE "OutboxEvent"
  ALTER COLUMN "firmId" SET NOT NULL,
  ALTER COLUMN "clientId" SET NOT NULL,
  ALTER COLUMN "engagementId" SET NOT NULL,
  ADD CONSTRAINT "OutboxEvent_scope_fkey"
    FOREIGN KEY ("firmId", "clientId", "engagementId")
    REFERENCES "Engagement" ("firmId", "clientId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OutboxEvent_import_scope_fkey"
    FOREIGN KEY ("firmId", "clientId", "engagementId", "importId")
    REFERENCES "TbImport" ("firmId", "clientId", "engagementId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "outbox_tb_import_requires_import_check"
    CHECK (type <> 'tb.import' OR "importId" IS NOT NULL);

CREATE INDEX "OutboxEvent_unfinished_scope" ON "OutboxEvent" ("completedAt", type, "createdAt");
