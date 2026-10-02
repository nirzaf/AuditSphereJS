-- Upgrade outstanding durable import messages before the worker starts requiring
-- an explicit firm/client/engagement scope in every queue payload.
UPDATE "OutboxEvent" AS event
SET payload = event.payload || jsonb_build_object(
  'firmId', batch."firmId",
  'clientId', batch."clientId",
  'engagementId', batch."engagementId"
)
FROM "TbImport" AS batch
WHERE event.type = 'tb.import'
  AND event."completedAt" IS NULL
  AND event.payload->>'importId' = batch.id::text;
