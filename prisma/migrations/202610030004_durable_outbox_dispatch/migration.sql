-- Every durable delivery has a PostgreSQL-owned operation record. The operation ID is also the
-- stable BullMQ job ID, so a crash after enqueue can safely be retried without a second intent.
CREATE TABLE "background_operations" (
  "id" uuid NOT NULL,
  "firmId" uuid NOT NULL,
  "clientId" uuid NOT NULL,
  "engagementId" uuid NOT NULL,
  "type" varchar(120) NOT NULL,
  "state" varchar(16) NOT NULL DEFAULT 'QUEUED',
  "attemptCount" integer NOT NULL DEFAULT 0,
  "result" jsonb,
  "errorCode" varchar(120),
  "unknownCode" varchar(120),
  "startedAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" timestamptz(6),
  "failedAt" timestamptz(6),
  CONSTRAINT "background_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "background_operations_scope_id_key" UNIQUE ("firmId", "clientId", "engagementId", "id"),
  CONSTRAINT "background_operations_attempt_count_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "background_operations_state_check" CHECK (
    ("state" IN ('QUEUED', 'RUNNING') AND "result" IS NULL AND "errorCode" IS NULL AND "unknownCode" IS NULL AND "completedAt" IS NULL AND "failedAt" IS NULL) OR
    ("state" = 'COMPLETED' AND "unknownCode" IS NULL AND "errorCode" IS NULL AND "completedAt" IS NOT NULL AND "failedAt" IS NULL) OR
    ("state" = 'FAILED' AND "result" IS NULL AND "errorCode" IS NOT NULL AND "unknownCode" IS NULL AND "completedAt" IS NULL AND "failedAt" IS NOT NULL) OR
    ("state" = 'UNKNOWN' AND "result" IS NULL AND "errorCode" IS NULL AND "unknownCode" IS NOT NULL AND "completedAt" IS NULL AND "failedAt" IS NULL)
  ),
  CONSTRAINT "background_operations_type_check" CHECK (btrim("type") <> ''),
  CONSTRAINT "background_operations_engagement_fkey" FOREIGN KEY ("firmId", "clientId", "engagementId")
    REFERENCES "Engagement" ("firmId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "background_operations_state_updated"
  ON "background_operations" ("state", "updatedAt");

ALTER TABLE "OutboxEvent"
  ADD COLUMN "operationId" uuid,
  ADD COLUMN "payloadVersion" integer NOT NULL DEFAULT 1,
  ADD COLUMN "dispatchClaimToken" uuid,
  ADD COLUMN "dispatchClaimExpiresAt" timestamptz(6),
  ADD COLUMN "dispatchAttempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "lastDispatchErrorCode" varchar(120),
  ADD COLUMN "failedAt" timestamptz(6);

-- Preserve completed imports, but stop treating a terminal import failure as successful work.
INSERT INTO "background_operations" (
  "id", "firmId", "clientId", "engagementId", "type", "state", "attemptCount", "result",
  "errorCode", "startedAt", "updatedAt", "completedAt", "failedAt"
)
SELECT event."id",
       event."firmId",
       event."clientId",
       event."engagementId",
       event."type",
       CASE
         WHEN event."type" = 'tb.import' AND batch."status" IN ('MAPPING_REQUIRED', 'FINALIZED') THEN 'COMPLETED'
         WHEN event."type" = 'tb.import' AND batch."status" = 'FAILED' THEN 'FAILED'
         WHEN event."completedAt" IS NOT NULL THEN 'COMPLETED'
         ELSE 'QUEUED'
       END,
       0,
       CASE
         WHEN event."type" = 'tb.import' AND batch."status" IN ('MAPPING_REQUIRED', 'FINALIZED')
           THEN jsonb_build_object('status', batch."status", 'rowCount', batch."rowCount")
         WHEN event."type" <> 'tb.import' AND event."completedAt" IS NOT NULL
           THEN jsonb_build_object('migratedCompleted', true)
         ELSE NULL
       END,
       CASE WHEN event."type" = 'tb.import' AND batch."status" = 'FAILED' THEN 'TB_IMPORT_FAILED' ELSE NULL END,
       event."createdAt"::timestamptz,
       COALESCE(event."completedAt"::timestamptz, event."createdAt"::timestamptz),
       CASE
         WHEN event."type" = 'tb.import' AND batch."status" IN ('MAPPING_REQUIRED', 'FINALIZED')
           THEN COALESCE(event."completedAt"::timestamptz, CURRENT_TIMESTAMP)
         WHEN event."type" <> 'tb.import' AND event."completedAt" IS NOT NULL
           THEN event."completedAt"::timestamptz
         ELSE NULL
       END,
       CASE
         WHEN event."type" = 'tb.import' AND batch."status" = 'FAILED'
           THEN COALESCE(event."completedAt"::timestamptz, CURRENT_TIMESTAMP)
         ELSE NULL
       END
FROM "OutboxEvent" AS event
LEFT JOIN "TbImport" AS batch ON batch.id = event."importId";

UPDATE "OutboxEvent" AS event
SET "operationId" = event.id,
    "payloadVersion" = 1,
    "failedAt" = CASE
      WHEN event."type" = 'tb.import' AND batch."status" = 'FAILED'
        THEN COALESCE(event."completedAt"::timestamptz, CURRENT_TIMESTAMP)
      ELSE NULL
    END,
    "completedAt" = CASE
      WHEN event."type" = 'tb.import' AND batch."status" = 'FAILED' THEN NULL
      WHEN event."type" = 'tb.import' AND batch."status" IN ('MAPPING_REQUIRED', 'FINALIZED')
        THEN COALESCE(event."completedAt"::timestamptz, CURRENT_TIMESTAMP)
      ELSE event."completedAt"
    END
FROM "TbImport" AS batch
WHERE event."type" = 'tb.import'
  AND event."importId" = batch.id;

UPDATE "OutboxEvent"
SET "operationId" = id,
    "payloadVersion" = 1
WHERE "operationId" IS NULL;

ALTER TABLE "OutboxEvent"
  ALTER COLUMN "operationId" SET NOT NULL,
  ADD CONSTRAINT "OutboxEvent_operation_scope_id_key" UNIQUE ("firmId", "clientId", "engagementId", "operationId"),
  ADD CONSTRAINT "OutboxEvent_operation_scope_fkey"
    FOREIGN KEY ("firmId", "clientId", "engagementId", "operationId")
    REFERENCES "background_operations" ("firmId", "clientId", "engagementId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OutboxEvent_operation_id_check" CHECK ("operationId" = id),
  ADD CONSTRAINT "OutboxEvent_payload_version_check" CHECK ("payloadVersion" > 0),
  ADD CONSTRAINT "OutboxEvent_dispatch_attempts_check" CHECK ("dispatchAttempts" >= 0),
  ADD CONSTRAINT "OutboxEvent_dispatch_claim_pair_check" CHECK (
    ("dispatchClaimToken" IS NULL AND "dispatchClaimExpiresAt" IS NULL) OR
    ("dispatchClaimToken" IS NOT NULL AND "dispatchClaimExpiresAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "OutboxEvent_terminal_time_check" CHECK ("completedAt" IS NULL OR "failedAt" IS NULL);

CREATE INDEX "OutboxEvent_dispatchable"
  ON "OutboxEvent" ("type", "createdAt");
